import crypto from 'node:crypto';
import { transaction } from './db.mjs';
import { ApiError, fail, getPlot, requireAccount, text } from './core.mjs';
import { BOT_UA, campaignOf, getRow, ipHashOf, ownRow, SOURCES, surfaceOf, visitorOf } from './business.mjs';
import { cleanEmail, enqueue, noticeAddress } from './engage.mjs';

// Conversion measurement (phase 5, docs/monetization/conversions.md): the parts of the funnel that are not a profile event of business.mjs.
//
//   impressions   a profile's card was on screen in a list (Discover, a category, a district): sent in batches by the page
//   inquiries     a meeting or quote request from the profile's own form: kept, emailed to the owner, listed for them
//   purchases     the business's own site reports a sale (a signed postback or a pixel); it counts when it carries the click id of a verified
//                 press of the profile's button in the 30 days before (the button's link carries it: @voxelventure/analytics)
//   coupons       the owner marks a claimed coupon redeemed by its ticket
//   renewals      for the admin: how many Pro plans renewed and how many owners bought again
//
// Everything is verified like views: no bots, not the owner's own, a per-network daily cap. A request or a purchase that is not verified is
// kept (and a request still emailed) but does not count as a result.
import { ATTRIBUTION_DAYS, isTicket } from '@voxelventure/analytics';
const DAY = 86400000;
const now = () => Date.now();
const GAME_SURFACES = ['card', 'directory', 'search', 'map', 'storefront'];
const goodVisitor = (id) => /^[A-Za-z0-9_-]{4,40}$/.test(String(id ?? ''));

// ---- impressions ------------------------------------------------------------------------------------------------------------------
// { slugs: [...], visitor }: the cards the visitor saw. One per visitor and profile an hour; `cap` a day per network and profile.
export function recordImpressions(db, account, input = {}, ctx = {}) {
  const slugs = [...new Set((Array.isArray(input.slugs) ? input.slugs : []).map(String))].slice(0, 30);
  const visitor = visitorOf(account, String(input.visitor ?? ''));
  const surface = surfaceOf(input.surface);
  const source = GAME_SURFACES.includes(surface) ? 'city' : 'direct'; // a card seen in the 3D city's lists, or on the site
  const ipHash = ipHashOf(ctx);
  const human = (account || goodVisitor(input.visitor)) && !BOT_UA.test(String(ctx.userAgent ?? ''));
  const cap = ctx.impressionCap ?? 10;
  let counted = 0;
  transaction(db, () => {
    for (const slug of slugs) {
      const row = db.prepare("SELECT id, account_id FROM businesses WHERE slug = ? AND status = 'published'").get(slug);
      if (!row || (account && account.id === row.account_id)) continue;
      if (db.prepare("SELECT 1 FROM business_events WHERE business_id = ? AND visitor = ? AND kind = 'impression' AND at >= ?").get(row.id, visitor, now() - 3600000)) continue;
      let verified = human;
      if (verified && ipHash) verified = db.prepare("SELECT COUNT(*) AS n FROM business_events WHERE business_id = ? AND kind = 'impression' AND ip_hash = ? AND verified = 1 AND at >= ?").get(row.id, ipHash, now() - DAY).n < cap;
      db.prepare("INSERT INTO business_events (business_id, kind, source, visitor, ip_hash, verified, at, surface) VALUES (?, 'impression', ?, ?, ?, ?, ?, ?)").run(row.id, source, visitor, ipHash, verified ? 1 : 0, now(), surface);
      if (verified) counted++;
    }
  });
  return { counted };
}

// ---- purchases --------------------------------------------------------------------------------------------------------------------
// Two ways a business's site reports a sale, trusted differently (docs/competitive-research/voxelventure_core_concept_reassessment_2026-10-17.md):
//   server   POST /conversions from the business's own server, with its conversion key in the Authorization header. The key is random, one per
//            business, shown to the owner once and stored only as a hash; a new one can be made at any time (the old one stops working).
//            Never derived from REFERRAL_SECRET and never in a URL. Only these can be verified revenue.
//   browser  the pixel (an <img> on the thank-you page): it carries no key (anything in a URL leaks into histories, logs and referrers), so
//            it is only "browser-reported": counted apart, never as verified. The same order reported later from the server replaces it.
// A server report is verified when it carries the click id of a verified press of the profile's button in the 30 days before; otherwise it
// is kept as unattributed revenue.
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const sameHash = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cleanClick = (v) => (/^[A-Za-z0-9]{10,32}$/.test(String(v ?? '')) ? String(v) : null);
const cleanOrder = (v) => (/^[A-Za-z0-9_.:#-]{1,64}$/.test(String(v ?? '')) ? String(v) : null);
const cleanValue = (v) => Math.max(0, Math.min(100000000, Math.round(Number(v) || 0)));
const BROWSER_CAP = 30; // pixel reports a day from one network for one business (it needs no key, so it is capped)

// A new conversion key for the owner's business: returned this once, stored as a hash.
export function rotateConversionKey(db, account, slug) {
  const row = ownRow(db, account, slug);
  const key = `vvck_${crypto.randomBytes(24).toString('base64url')}`;
  db.prepare('UPDATE businesses SET conv_key_hash = ?, conv_key_at = ? WHERE id = ?').run(sha(key), now(), row.id);
  return { key, createdAt: now(), note: 'Copy it now: it is shown only once. Anything using the old key stops working.' };
}

// The key from a request's headers: Authorization: Bearer <key>, or X-Conversion-Key.
export const keyFromHeaders = (headers = {}) => String(headers.authorization ?? '').replace(/^Bearer\s+/i, '') || String(headers['x-conversion-key'] ?? '');

// { business: slug, click, value (cents), order } from the business's server, with `ctx.key` from the headers. Counted once per order (or,
// without an order number, once per click).
export function recordPurchase(db, input = {}, ctx = {}) {
  const row = getRow(db, String(input.business ?? ''));
  if (input.key && !ctx.key) fail(401, 'Send the conversion key in the Authorization header (Bearer), not in the body. Make a new key in your dashboard.', 'key_in_body');
  if (!row.conv_key_hash) fail(403, 'This business has no conversion key yet: make one in the dashboard.', 'no_key');
  if (!sameHash(sha(ctx.key ?? ''), row.conv_key_hash)) fail(403, 'That conversion key is not right for this business.', 'bad_key');
  const click = cleanClick(input.click);
  const order = cleanOrder(input.order);
  const value = cleanValue(input.value);
  return transaction(db, () => {
    const press = click ? db.prepare("SELECT * FROM business_events WHERE business_id = ? AND kind = 'cta' AND click_id = ? AND at >= ? ORDER BY id DESC LIMIT 1").get(row.id, click, now() - ATTRIBUTION_DAYS * DAY) : null;
    const attributed = Boolean(press?.verified);
    const earlier = order
      ? db.prepare("SELECT id, report FROM business_events WHERE business_id = ? AND kind = 'purchase' AND order_ref = ?").get(row.id, order)
      : click && db.prepare("SELECT id, report FROM business_events WHERE business_id = ? AND kind = 'purchase' AND click_id = ? AND order_ref IS NULL").get(row.id, click);
    if (earlier && earlier.report !== 'browser') return { recorded: false, duplicate: true };
    if (earlier) {
      // the pixel saw this order first: the server's report replaces it (its value and click are the ones that count)
      db.prepare("UPDATE business_events SET report = 'server', verified = ?, source = ?, ref_account = ?, visitor = ?, campaign = ?, click_id = ?, value_cents = ? WHERE id = ?")
        .run(attributed ? 1 : 0, press?.source ?? 'direct', press?.ref_account ?? null, press?.visitor ?? 'postback', press?.campaign ?? null, click, value, earlier.id);
      return { recorded: true, attributed, reconciled: true };
    }
    db.prepare("INSERT INTO business_events (business_id, kind, source, ref_account, visitor, ip_hash, verified, at, campaign, click_id, value_cents, order_ref, report) VALUES (?, 'purchase', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'server')")
      .run(row.id, press?.source ?? 'direct', press?.ref_account ?? null, press?.visitor ?? 'postback', attributed ? 1 : 0, now(), press?.campaign ?? null, click, value, order);
    return { recorded: true, attributed };
  });
}

// The pixel: no key, never verified, capped per network. Always answers with a 1x1 transparent GIF, so a page never shows a broken image.
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
export function purchasePixel(db, query = {}, ctx = {}) {
  try {
    const row = getRow(db, String(query.business ?? ''));
    const click = cleanClick(query.click);
    const order = cleanOrder(query.order);
    const ipHash = ipHashOf(ctx);
    const seen = order
      ? db.prepare("SELECT 1 FROM business_events WHERE business_id = ? AND kind = 'purchase' AND order_ref = ?").get(row.id, order)
      : click && db.prepare("SELECT 1 FROM business_events WHERE business_id = ? AND kind = 'purchase' AND click_id = ? AND order_ref IS NULL").get(row.id, click);
    const busy = ipHash && db.prepare("SELECT COUNT(*) AS n FROM business_events WHERE business_id = ? AND kind = 'purchase' AND report = 'browser' AND ip_hash = ? AND at >= ?").get(row.id, ipHash, now() - DAY).n >= BROWSER_CAP;
    if (!seen && !busy && (order || click)) {
      const press = click ? db.prepare("SELECT source, campaign FROM business_events WHERE business_id = ? AND kind = 'cta' AND click_id = ? AND at >= ? ORDER BY id DESC LIMIT 1").get(row.id, click, now() - ATTRIBUTION_DAYS * DAY) : null;
      db.prepare("INSERT INTO business_events (business_id, kind, source, visitor, ip_hash, verified, at, campaign, click_id, value_cents, order_ref, report) VALUES (?, 'purchase', ?, 'pixel', ?, 0, ?, ?, ?, ?, ?, 'browser')")
        .run(row.id, press?.source ?? 'direct', ipHash, now(), press?.campaign ?? null, click, cleanValue(query.value), order);
    }
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
  }
  return { __raw: { type: 'image/gif', body: GIF, cache: 'no-store' } };
}

// What the owner needs to report purchases from their site. The key itself is never shown again after it is made.
export function trackingFor(db, account, slug, env = process.env) {
  const row = ownRow(db, account, slug);
  const api = String(env.PUBLIC_API_URL || `http://localhost:${env.API_PORT || 3002}`).replace(/\/+$/, '');
  return {
    hasKey: Boolean(row.conv_key_hash),
    keyCreatedAt: row.conv_key_at ?? null,
    postback: `${api}/conversions`,
    pixel: `${api}/conversions/pixel.gif?business=${row.slug}&click={vv_click}&value={cents}&order={order}`,
  };
}

// ---- meeting and quote requests -----------------------------------------------------------------------------------------------------
const INQUIRY_KINDS = { meeting: 'meeting request', quote: 'quote request' };
const clean = (v, n) => text(v, n).replace(/[\r\n]+/g, ' ').trim();
export function createInquiry(db, account, slug, input = {}, ctx = {}) {
  const row = getRow(db, slug);
  const cta = JSON.parse(row.cta);
  const kind = INQUIRY_KINDS[input.kind] ? input.kind : fail(400, 'kind must be meeting or quote.', 'bad_kind');
  if (cta.kind !== kind) fail(400, `This business does not take ${INQUIRY_KINDS[kind]}s here.`, 'not_offered');
  if (String(input.website ?? '').trim()) return { sent: true }; // the hidden field only a robot fills in: thank it and keep nothing
  const errors = {};
  const name = clean(input.name, 60);
  if (!name) errors.name = 'Your name, please.';
  let email = '';
  try {
    email = cleanEmail(input.email);
  } catch {
    errors.email = 'That email address does not look right.';
  }
  const phone = clean(input.phone, 30);
  if (phone && !/^[0-9 +().-]{5,30}$/.test(phone)) errors.phone = 'Only digits, spaces and + ( ) - .';
  const message = text(input.message, 1000).trim();
  if (kind === 'quote' && !message) errors.message = 'What would you like a quote for?';
  const preferred = clean(input.preferred, 120);
  if (Object.keys(errors).length) throw new ApiError(400, Object.values(errors)[0], 'invalid').withErrors(errors);
  const visitor = visitorOf(account, String(input.visitor ?? ''));
  const ipHash = ipHashOf(ctx);
  return transaction(db, () => {
    // a hard limit per network across every profile (a request emails a person), then the usual verification
    if (ipHash && db.prepare('SELECT COUNT(*) AS n FROM business_inquiries WHERE ip_hash = ? AND created_at >= ?').get(ipHash, now() - DAY).n >= (ctx.inquiryLimit ?? 10)) fail(429, 'Too many requests from your network today. Try again tomorrow.', 'rate_limited');
    let verified = (account || goodVisitor(input.visitor)) && !BOT_UA.test(String(ctx.userAgent ?? '')) && !(account && account.id === row.account_id);
    if (verified) verified = Boolean(db.prepare("SELECT 1 FROM business_events WHERE business_id = ? AND visitor = ? AND kind = 'view' AND at >= ?").get(row.id, visitor, now() - DAY));
    if (verified && ipHash) verified = db.prepare('SELECT COUNT(*) AS n FROM business_inquiries WHERE business_id = ? AND ip_hash = ? AND verified = 1 AND created_at >= ?').get(row.id, ipHash, now() - DAY).n < (ctx.inquiryCap ?? 3);
    const view = db.prepare("SELECT source, campaign FROM business_events WHERE business_id = ? AND visitor = ? AND kind = 'view' ORDER BY id DESC LIMIT 1").get(row.id, visitor);
    const r = db.prepare('INSERT INTO business_inquiries (business_id, kind, name, email, phone, message, preferred, visitor, ip_hash, source, campaign, verified, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(row.id, kind, name, email, phone || null, message || null, preferred || null, visitor, ipHash, SOURCES.includes(view?.source) ? view.source : 'direct', campaignOf(view?.campaign), verified ? 1 : 0, now());
    const to = noticeAddress(db, row.account_id);
    if (to) {
      const lines = [`${name} <${email}>${phone ? `, ${phone}` : ''} sent ${row.name} a ${INQUIRY_KINDS[kind]} on VoxelVenture.`, '', ...(preferred ? [`When suits them: ${preferred}`] : []), ...(message ? ['', message] : []), '', `Reply to ${email} to answer. Every request is listed on your Manage page.`];
      enqueue(db, { to, kind: 'inquiry', subject: `New ${INQUIRY_KINDS[kind]} from ${name}`, body: lines.join('\n') });
    }
    return { sent: true, id: Number(r.lastInsertRowid) };
  });
}
const inquiryView = (q) => ({ id: q.id, kind: q.kind, name: q.name, email: q.email, phone: q.phone, message: q.message, preferred: q.preferred, verified: Boolean(q.verified), status: q.status, source: q.source, campaign: q.campaign, at: q.created_at });
export function listInquiries(db, account, slug) {
  const row = ownRow(db, account, slug);
  const rows = db.prepare('SELECT * FROM business_inquiries WHERE business_id = ? ORDER BY id DESC LIMIT 200').all(row.id);
  return { inquiries: rows.map(inquiryView), open: rows.filter((q) => q.status === 'new').length };
}
export function setInquiryStatus(db, account, slug, id, status) {
  const row = ownRow(db, account, slug);
  if (!['new', 'handled', 'spam'].includes(status)) fail(400, 'status must be new, handled or spam.', 'bad_status');
  const q = db.prepare('SELECT * FROM business_inquiries WHERE id = ? AND business_id = ?').get(Number(id), row.id) ?? fail(404, 'No such request.', 'no_inquiry');
  // marking one spam also stops it counting as a result; marking it back does not make an unverified one count
  db.prepare('UPDATE business_inquiries SET status = ?, handled_at = ?, verified = CASE WHEN ? = \'spam\' THEN 0 ELSE verified END WHERE id = ?').run(status, status === 'new' ? null : now(), status, q.id);
  return inquiryView(db.prepare('SELECT * FROM business_inquiries WHERE id = ?').get(q.id));
}

// The contact details in a request are kept only so long (INQUIRY_DAYS, 180 by default): after that the name, email, phone, message and
// network are wiped, along with the email that told the owner. The row stays (its kind, date, source and whether it was verified), so
// past figures do not change. Run every hour by the server.
export const INQUIRY_DAYS = 180;
export function pruneInquiries(db, days = INQUIRY_DAYS, at = now()) {
  const cutoff = at - Math.max(1, Number(days) || INQUIRY_DAYS) * DAY;
  return transaction(db, () => ({
    wiped: Number(db.prepare("UPDATE business_inquiries SET name = '(removed)', email = '', phone = NULL, message = NULL, preferred = NULL, visitor = 'removed', ip_hash = NULL WHERE created_at < ? AND email != ''").run(cutoff).changes),
    mails: Number(db.prepare("DELETE FROM outbox WHERE kind = 'inquiry' AND created_at < ?").run(cutoff).changes),
  }));
}

// ---- coupon redemptions -----------------------------------------------------------------------------------------------------------
// The owner marks a claimed coupon used, by the ticket the visitor shows with the code.
export function redeemCoupon(db, account, plotId, input = {}) {
  requireAccount(account);
  const ticket = String(input.ticket ?? '').trim().toUpperCase().replace(/^#/, '');
  if (!isTicket(ticket)) fail(400, 'Enter the ticket shown with the coupon, like 7KQ2A9.', 'bad_ticket');
  return transaction(db, () => {
    const row = getPlot(db, plotId);
    if (row.owner_account !== account.id) fail(403, 'This is not your business.', 'forbidden');
    const c = db.prepare('SELECT * FROM coupon_claims WHERE plot_id = ? AND ticket = ?').get(row.id, ticket) ?? fail(404, 'No coupon with that ticket was claimed here.', 'no_ticket');
    if (c.redeemed_at) fail(409, `That coupon was already used on ${new Date(c.redeemed_at).toISOString().slice(0, 10)}.`, 'already_redeemed');
    db.prepare('UPDATE coupon_claims SET redeemed_at = ? WHERE plot_id = ? AND ticket = ?').run(now(), row.id, ticket);
    return { redeemed: true, ticket, claimedAt: c.at };
  });
}

// ---- renewals (admin) ----------------------------------------------------------------------------------------------------------------
// The review's last measure: do owners come back? Pro plans that renewed at least once, and owners who bought the same thing again.
export function renewals(db) {
  const pro = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN renewals > 0 THEN 1 ELSE 0 END), 0) AS renewed FROM orders WHERE product = 'pro' AND status IN ('paid', 'refunded') AND cents > 0").get();
  const repeat = (product) => {
    const r = db.prepare("SELECT COUNT(*) AS buyers, COALESCE(SUM(CASE WHEN n > 1 THEN 1 ELSE 0 END), 0) AS again FROM (SELECT business_id, COUNT(*) AS n FROM orders WHERE product = ? AND status = 'paid' AND cents > 0 GROUP BY business_id)").get(product);
    return { buyers: r.buyers, again: r.again, rate: r.buyers ? r.again / r.buyers : 0 };
  };
  return { pro: { plans: pro.n, renewed: pro.renewed, rate: pro.n ? pro.renewed / pro.n : 0 }, launch: repeat('launch'), sponsored: repeat('sponsored'), churn: churn(db) };
}

// The last 30 days' churn, for the admin (VV-UX-10):
//   pro     profiles whose Pro ended in the period with no Pro running now, against those with Pro now
//   leases  leases that ended in the period and were not renewed (the plot is in its grace days or open to a buyout), against renewals
function churn(db, at = now()) {
  const since = at - 30 * DAY;
  const proActive = db.prepare("SELECT COUNT(DISTINCT business_id) AS n FROM entitlements WHERE kind = 'pro' AND status = 'active' AND starts_at <= ? AND ends_at > ?").get(at, at).n;
  const proEnded = db.prepare("SELECT COUNT(DISTINCT e.business_id) AS n FROM entitlements e WHERE e.kind = 'pro' AND e.ends_at >= ? AND e.ends_at <= ? AND NOT EXISTS (SELECT 1 FROM entitlements x WHERE x.business_id = e.business_id AND x.kind = 'pro' AND x.status = 'active' AND x.starts_at <= ? AND x.ends_at > ?)").get(since, at, at, at).n;
  const lapsed = db.prepare('SELECT COUNT(*) AS n FROM plots WHERE owner_account IS NOT NULL AND lease_end IS NOT NULL AND lease_end >= ? AND lease_end <= ?').get(since, at).n;
  const renewed = db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind = 'renew' AND at >= ?").get(since).n;
  return {
    days: 30,
    pro: { ended: proEnded, active: proActive, rate: proEnded + proActive ? proEnded / (proEnded + proActive) : 0 },
    leases: { lapsed, renewed, rate: lapsed + renewed ? lapsed / (lapsed + renewed) : 0 },
  };
}
