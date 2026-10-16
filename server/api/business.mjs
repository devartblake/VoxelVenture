import crypto from 'node:crypto';
import { transaction } from './db.mjs';
import { ApiError, fail, requireAccount, text } from './core.mjs';
import { imp } from '../../scripts/lib-loader.mjs';
import { postFor } from './social.mjs';
import { billingOn, planFor } from './billing.mjs';

// Free business profiles, referral attribution and the owner's figures (docs/business_funnel.md). The rules (categories, districts, calls to
// action, validation, onboarding steps, upgrade prompts) are lib/business/profile.js, shared with the public pages.
//
//   profiles    any account can list up to MAX_PROFILES businesses for free; each gets a public page /business/<slug>
//   events      a profile view, a qualified visit (15 s on the page), a store entry from the 3D city or a press of its call to action,
//               verified like building visits (no bots, a per-network daily cap, not the owner's own traffic, a qualified visit and a
//               press only after a view). Impressions, purchases and meeting or quote requests are in conversions.mjs.
//   referrals   every account has a signed referral code; a link with ?ref=<code> credits the visits, presses, sign-ups and new
//               profiles it brings to that account (never an account referring itself)
//   interest    an owner asking for a paid plan before checkout exists is recorded: the demand signal for phase 4
const { cleanProfile, uniqueSlug, isSlug, isRefCode, onboardingSteps, upgradePrompts, profileReady, PLANS } = await imp('business/profile.js');
const { figuresFor, PRODUCTS } = await imp('business/plans.js');
const { conversionsOf, costPerResult, isClickId } = await imp('business/conversions.js');
const { csvRows } = await imp('data/csv.js');

export const MAX_PROFILES = 5;
export const SOURCES = ['direct', 'search', 'social', 'referral', 'city', 'x']; // x: a link in VoxelVenture's own X posts (social.mjs)
const DAY = 86400000;
const now = () => Date.now();
export const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|curl|wget|python-requests|preview|facebookexternalhit/i;

// ---- referral codes -------------------------------------------------------------------------------------------------------------
// "<account id in base 36>.<signature>": anyone can read whose it is, nobody can make one for another account without the secret.
const signature = (id, secret) => crypto.createHmac('sha256', secret).update(`ref:${id}`).digest('hex').slice(0, 10);
export const referralSecret = (env = process.env) => env.REFERRAL_SECRET || env.IP_SALT || 'voxelventure-referrals';
export const referralCode = (accountId, secret) => `${Number(accountId).toString(36)}.${signature(accountId, secret)}`;
// The account a code belongs to, or null when the code is malformed, forged or names no account.
export function referrerOf(db, code, secret) {
  if (!isRefCode(code)) return null;
  const [id36, sig] = String(code).split('.');
  const id = parseInt(id36, 36);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const want = signature(id, secret);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  const a = db.prepare('SELECT id, banned FROM accounts WHERE id = ?').get(id);
  return a && !a.banned ? a.id : null;
}

// A new account that arrived through someone's link (called by POST /auth/signup).
export function attributeSignup(db, accountId, code, secret) {
  const by = referrerOf(db, code, secret);
  if (by && by !== accountId) db.prepare('UPDATE accounts SET referred_by = ? WHERE id = ? AND referred_by IS NULL').run(by, accountId);
}

// ---- profiles ---------------------------------------------------------------------------------------------------------------
export function profileView(row) {
  return {
    slug: row.slug,
    name: row.name,
    category: row.category,
    district: row.district,
    tagline: row.tagline,
    description: row.description,
    website: row.website,
    cta: JSON.parse(row.cta),
    plotId: row.plot_id,
    xHandle: row.x_handle ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
// What only the owner sees besides the public view: whether they agreed to a welcome post on X, and their offer (Pro).
export const ownerView = (row) => ({ ...profileView(row), announce: Boolean(row.announce), offer: row.offer ? { text: row.offer, until: row.offer_until ?? null } : null });
export const getRow = (db, slug) => (isSlug(slug) ? db.prepare("SELECT * FROM businesses WHERE slug = ? AND status = 'published'").get(String(slug)) : null) ?? fail(404, 'No such business.', 'no_business');
export const ownRow = (db, account, slug) => {
  requireAccount(account);
  const row = getRow(db, slug);
  if (row.account_id !== account.id) fail(403, 'This is not your business.', 'forbidden');
  return row;
};
// cleanProfile's errors as the API's error: 400, with every field's message.
function checked(input, opts) {
  const r = cleanProfile(input, opts);
  if (!r.ok) throw new ApiError(400, Object.values(r.errors)[0], 'bad_profile').withErrors(r.errors);
  return r.value;
}

export function createProfile(db, account, input) {
  requireAccount(account);
  const v = checked({ cta: { kind: input?.website ? 'website' : 'newsletter' }, ...input }); // no call to action chosen: the website, or a newsletter without one
  return transaction(db, () => {
    const mine = db.prepare("SELECT COUNT(*) AS n FROM businesses WHERE account_id = ? AND status = 'published'").get(account.id).n;
    if (mine >= MAX_PROFILES) fail(409, `An account can list up to ${MAX_PROFILES} businesses.`, 'too_many');
    const taken = db.prepare('SELECT 1 FROM businesses WHERE slug = ?');
    const slug = uniqueSlug(v.name, (s) => Boolean(taken.get(s)));
    const referredBy = db.prepare('SELECT referred_by FROM accounts WHERE id = ?').get(account.id)?.referred_by ?? null;
    db.prepare('INSERT INTO businesses (slug, account_id, name, category, district, tagline, description, website, cta, x_handle, announce, referred_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(slug, account.id, v.name, v.category, v.district ?? null, v.tagline ?? null, v.description ?? null, v.website ?? null, JSON.stringify(v.cta), v.xHandle ?? null, v.announce ? 1 : 0, referredBy, now(), now());
    return ownerView(getRow(db, slug));
  });
}

// The owner changes their profile. The slug stays (links to it keep working).
export function updateProfile(db, account, slug, input) {
  const row = ownRow(db, account, slug);
  const merged = { ...ownerView(row), ...input };
  if (input.website !== undefined && input.cta === undefined && merged.cta.kind === 'website') merged.cta = { ...merged.cta, url: null };
  const v = checked(merged);
  db.prepare('UPDATE businesses SET name=?, category=?, district=?, tagline=?, description=?, website=?, cta=?, x_handle=?, announce=?, updated_at=? WHERE id=?')
    .run(v.name, v.category, v.district ?? null, v.tagline ?? null, v.description ?? null, v.website ?? null, JSON.stringify(v.cta), v.xHandle ?? null, v.announce ? 1 : 0, now(), row.id);
  return ownerView(getRow(db, slug));
}

// Link (or, with plotId null, unlink) the owner's own building in the city: the profile then offers "Step inside".
export function linkPlot(db, account, slug, plotId) {
  const row = ownRow(db, account, slug);
  if (plotId == null) {
    db.prepare('UPDATE businesses SET plot_id = NULL, updated_at = ? WHERE id = ?').run(now(), row.id);
    return profileView(getRow(db, slug));
  }
  const plot = db.prepare('SELECT id, owner_account FROM plots WHERE id = ?').get(Number(plotId)) ?? fail(404, 'No such plot.', 'no_plot');
  if (plot.owner_account !== account.id) fail(403, 'You can only link a building you own.', 'forbidden');
  const other = db.prepare('SELECT slug FROM businesses WHERE plot_id = ? AND id != ?').get(plot.id, row.id);
  if (other) fail(409, 'That building is already linked to another of your profiles.', 'plot_linked');
  db.prepare('UPDATE businesses SET plot_id = ?, updated_at = ? WHERE id = ?').run(plot.id, now(), row.id);
  return profileView(getRow(db, slug));
}

export const getProfile = (db, slug) => {
  const row = getRow(db, slug);
  const plan = planFor(db, row.id);
  // in its launch week the page shows the Launch badge; with Pro, the owner's offer while it runs
  return { ...profileView(row), launch: plan.launch, offer: plan.pro ? liveOffer(row) : null };
};

// ---- offers (Pro) ------------------------------------------------------------------------------------------------------------------
// A one-line offer at the top of the public page ("10% off your first order with VOXEL"), optionally until a date (at most 90 days ahead).
// Only Pro shows it: when Pro ends the offer is kept but hidden, and comes back if Pro does.
const OFFER_MAX_DAYS = 90;
const liveOffer = (row, at = now()) => (row.offer && (!row.offer_until || row.offer_until > at) ? { text: row.offer, until: row.offer_until ?? null } : null);
export function setOffer(db, account, slug, input = {}) {
  const row = ownRow(db, account, slug);
  if (!planFor(db, row.id).pro) fail(402, `Offers are part of ${PRODUCTS.pro.name}.`, 'needs_pro');
  const offer = text(input.text, 100) || null;
  let until = null;
  if (offer && input.until != null && input.until !== '') {
    until = Number(new Date(input.until));
    if (!Number.isFinite(until) || until <= now()) fail(400, 'The end date must be in the future.', 'bad_until');
    if (until > now() + OFFER_MAX_DAYS * DAY) fail(400, `An offer can run for up to ${OFFER_MAX_DAYS} days.`, 'bad_until');
  }
  db.prepare('UPDATE businesses SET offer = ?, offer_until = ?, updated_at = ? WHERE id = ?').run(offer, until, now(), row.id);
  return ownerView(getRow(db, slug));
}

// The public list: published profiles, filtered by category, district or words, newest first (or by name).
export function listProfiles(db, { category = '', district = '', q = '', sort = 'new', limit = 50, offset = 0 } = {}) {
  const where = ["status = 'published'"];
  const args = [];
  if (category) (where.push('category = ?'), args.push(String(category)));
  if (district) (where.push('district = ?'), args.push(String(district)));
  const needle = text(q, 60).toLowerCase();
  if (needle) {
    where.push("(LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(tagline,'')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(description,'')) LIKE ? ESCAPE '\\')");
    const like = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    args.push(like, like, like);
  }
  const order = sort === 'name' ? 'name COLLATE NOCASE, id' : 'created_at DESC, id DESC';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM businesses WHERE ${where.join(' AND ')}`).get(...args).n;
  const n = Math.max(1, Math.min(200, Number(limit) || 50));
  const rows = db.prepare(`SELECT * FROM businesses WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, n, Math.max(0, Number(offset) || 0));
  return { total, profiles: rows.map(profileView) };
}

// Every published slug with its last change, for the sitemap.
export const sitemapEntries = (db) => db.prepare("SELECT slug, updated_at AS updatedAt FROM businesses WHERE status = 'published' ORDER BY id").all();

// ---- events -----------------------------------------------------------------------------------------------------------------
// A visitor viewed a profile (sent after the page has been visible for a couple of seconds), stayed 15 seconds (a qualified visit, `engaged`),
// walked into its 3D storefront in the city (`store`) or pressed its call to action (`cta`, with the click id added to its link).
// It is VERIFIED (counted) when: it is not a known bot; the visitor id is well formed; it is not the owner's own visit; the network has not
// already made `cap` of that kind for this profile today; and, for a qualified visit or a press, the same visitor viewed the profile in the
// last day. Everything is kept for the record; a visitor repeating the same thing within a minute is one event.
export const EVENT_KINDS = ['view', 'engaged', 'store', 'cta'];
const NEEDS_VIEW = ['engaged', 'cta'];
export const ipHashOf = (ctx) => (ctx.ip ? crypto.createHash('sha256').update(`${ctx.salt ?? 'voxelventure'}|${ctx.ip}`).digest('hex').slice(0, 16) : null);
export const visitorOf = (account, id) => (account ? `a${account.id}` : `x${/^[A-Za-z0-9_-]{4,40}$/.test(id) ? id : 'anonymous'}`);
export function recordProfileEvent(db, account, slug, input, ctx = {}) {
  const row = getRow(db, slug);
  const kind = EVENT_KINDS.includes(input.kind) ? input.kind : fail(400, `kind must be ${EVENT_KINDS.join(', ')}.`, 'bad_kind');
  const id = text(input.visitor, 40);
  const wellFormed = /^[A-Za-z0-9_-]{4,40}$/.test(id);
  const visitor = visitorOf(account, id);
  const last = db.prepare('SELECT at FROM business_events WHERE business_id = ? AND visitor = ? AND kind = ? ORDER BY id DESC LIMIT 1').get(row.id, visitor, kind);
  if (last && now() - last.at < 60000) return { counted: false };
  let ref = referrerOf(db, input.ref, ctx.secret ?? referralSecret());
  if (ref && account && ref === account.id) ref = null; // nobody is credited for their own visits
  const source = kind === 'store' ? 'city' : ref ? 'referral' : SOURCES.includes(input.source) ? input.source : 'direct';
  const campaign = campaignOf(input.campaign);
  const clickId = kind === 'cta' && isClickId(input.clickId) ? String(input.clickId) : null;
  const ipHash = ipHashOf(ctx);
  let verified = (account || wellFormed) && !BOT_UA.test(String(ctx.userAgent ?? '')) && !(account && account.id === row.account_id);
  if (verified && NEEDS_VIEW.includes(kind)) verified = Boolean(db.prepare("SELECT 1 FROM business_events WHERE business_id = ? AND visitor = ? AND kind = 'view' AND at >= ?").get(row.id, visitor, now() - DAY));
  if (verified && ipHash) {
    const cap = kind === 'cta' ? ctx.ctaCap ?? 1 : ctx.viewCap ?? 3;
    const used = db.prepare('SELECT COUNT(*) AS n FROM business_events WHERE business_id = ? AND kind = ? AND ip_hash = ? AND verified = 1 AND at >= ?').get(row.id, kind, ipHash, now() - DAY).n;
    if (used >= cap) verified = false;
  }
  db.prepare('INSERT INTO business_events (business_id, kind, source, ref_account, visitor, ip_hash, verified, at, campaign, click_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(row.id, kind, source, ref, visitor, ipHash, verified ? 1 : 0, now(), campaign, clickId);
  return { counted: true, verified: Boolean(verified) };
}

// The campaign a link was tagged with (utm_campaign): lower case letters, digits, - and _, at most 40; anything else is no campaign.
export const campaignOf = (v) => {
  const c = String(v ?? '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(c) ? c : null;
};

// ---- the owner's view ---------------------------------------------------------------------------------------------------------
// Thirty days of verified figures for one profile. Never simulated: a profile with no visitors shows zeros.
export function profileStats(db, businessId, at = now()) {
  const since = at - 30 * DAY;
  const ev = db.prepare('SELECT kind, source, ref_account, visitor, at, campaign, value_cents FROM business_events WHERE business_id = ? AND verified = 1 AND at >= ?').all(businessId, since);
  const of = (kind) => ev.filter((e) => e.kind === kind);
  const views = of('view');
  const cta = of('cta');
  const purchases = of('purchase');
  const count = (sql, ...a) => db.prepare(sql).get(...a).n;
  const inquiries = db.prepare('SELECT kind, source, campaign, created_at AS at FROM business_inquiries WHERE business_id = ? AND verified = 1 AND created_at >= ?').all(businessId, since);
  const plotId = db.prepare('SELECT plot_id FROM businesses WHERE id = ?').get(businessId)?.plot_id ?? null;
  const results = {
    newsletterSignups: count("SELECT COUNT(*) AS n FROM leads WHERE target_kind = 'business' AND target_id = ? AND status = 'confirmed' AND confirmed_at >= ?", String(businessId), since),
    meetingRequests: inquiries.filter((q) => q.kind === 'meeting').length,
    quoteRequests: inquiries.filter((q) => q.kind === 'quote').length,
    // the coupon of the linked 3D storefront (claims are one per visitor and never the owner's own: engage.mjs)
    couponClaims: plotId ? count('SELECT COUNT(*) AS n FROM coupon_claims WHERE plot_id = ? AND at >= ?', plotId, since) : 0,
    couponRedemptions: plotId ? count('SELECT COUNT(*) AS n FROM coupon_claims WHERE plot_id = ? AND redeemed_at >= ?', plotId, since) : 0,
    purchases: purchases.length,
  };
  const conversions = conversionsOf(results);
  // what the owner paid for this profile in the period (Launch Pack, Pro, placements: billing.mjs) and what each result cost
  const spendCents = db.prepare("SELECT COALESCE(SUM(cents), 0) AS n FROM orders WHERE business_id = ? AND status = 'paid' AND paid_at >= ?").get(businessId, since).n;
  const days = Array.from({ length: 30 }, (_, k) => ({ ago: 29 - k, views: 0, cta: 0, results: 0 }));
  const dayOf = (t) => days[29 - Math.min(29, Math.floor((at - t) / DAY))];
  for (const e of ev) {
    if (e.kind === 'view') dayOf(e.at).views++;
    else if (e.kind === 'cta') dayOf(e.at).cta++;
    else if (e.kind === 'purchase') dayOf(e.at).results++;
  }
  for (const q of inquiries) dayOf(q.at).results++;
  const bySource = Object.fromEntries(SOURCES.map((s) => [s, { id: s, views: 0, ctaClicks: 0, results: 0 }]));
  for (const e of [...views, ...cta, ...purchases]) if (bySource[e.source]) bySource[e.source][e.kind === 'view' ? 'views' : e.kind === 'cta' ? 'ctaClicks' : 'results']++;
  for (const q of inquiries) if (bySource[q.source]) bySource[q.source].results++;
  // each tagged campaign's views, presses and results (the ten with most views)
  const byCampaign = new Map();
  const campaign = (id) => byCampaign.get(id) ?? byCampaign.set(id, { id, views: 0, ctaClicks: 0, results: 0 }).get(id);
  for (const e of [...views, ...cta, ...purchases].filter((x) => x.campaign)) campaign(e.campaign)[e.kind === 'view' ? 'views' : e.kind === 'cta' ? 'ctaClicks' : 'results']++;
  for (const q of inquiries.filter((x) => x.campaign)) campaign(q.campaign).results++;
  return {
    simulated: false,
    verified: true,
    impressions: of('impression').length,
    views: views.length,
    uniques: new Set(views.map((e) => e.visitor)).size,
    qualified: of('engaged').length,
    storeEntries: of('store').length,
    ctaClicks: cta.length,
    ctr: views.length ? cta.length / views.length : 0,
    referralVisits: views.filter((e) => e.ref_account != null).length,
    ...results,
    revenueCents: purchases.reduce((n, e) => n + (e.value_cents ?? 0), 0),
    conversions,
    conversionRate: views.length ? conversions / views.length : 0,
    spendCents,
    costPerResultCents: costPerResult(spendCents, conversions),
    sources: Object.values(bySource),
    campaigns: [...byCampaign.values()].sort((a, b) => b.views - a.views || a.id.localeCompare(b.id)).slice(0, 10),
    days,
  };
}

// The owner's profiles with their figures, onboarding steps and upgrade prompts, plus their referral link's results.
export function myProfiles(db, account, env = process.env) {
  requireAccount(account);
  const rows = db.prepare("SELECT * FROM businesses WHERE account_id = ? AND status = 'published' ORDER BY id").all(account.id);
  const interest = db.prepare('SELECT plan FROM upgrade_interest WHERE business_id = ?');
  return {
    referral: myReferrals(db, account, env),
    checkout: billingOn(env), // false: the prompts record interest instead of offering checkout
    profiles: rows.map((row) => {
      const profile = ownerView(row);
      const stats = profileStats(db, row.id);
      const steps = onboardingSteps(profile, stats);
      const plan = planFor(db, row.id);
      // the prompts never offer what the profile already has
      const prompts = upgradePrompts(profile, stats).filter((p) => !(p.plan.id === 'pro' && plan.pro) && !(p.plan.id === 'launch' && plan.launch));
      return {
        profile,
        plan,
        stats: figuresFor(stats, plan), // the free plan sees the totals; Pro adds sources, campaigns and the daily chart
        launchSummary: launchSummary(db, row.id),
        steps,
        ready: profileReady(steps),
        welcomePost: postFor(db, 'business', row.id),
        prompts: prompts.map((p) => ({ ...p, requested: interest.all(row.id).some((r) => r.plan === p.plan.id) })),
      };
    }),
  };
}

// What the account's referral link has brought in 30 days (visits and presses on any profile, new accounts and new profiles).
export function myReferrals(db, account, env = process.env, at = now()) {
  requireAccount(account);
  const since = at - 30 * DAY;
  const count = (sql, ...a) => db.prepare(sql).get(...a).n;
  return {
    code: referralCode(account.id, referralSecret(env)),
    visits: count("SELECT COUNT(*) AS n FROM business_events WHERE ref_account = ? AND kind = 'view' AND verified = 1 AND at >= ?", account.id, since),
    ctaClicks: count("SELECT COUNT(*) AS n FROM business_events WHERE ref_account = ? AND kind = 'cta' AND verified = 1 AND at >= ?", account.id, since),
    signups: count('SELECT COUNT(*) AS n FROM accounts WHERE referred_by = ? AND created_at >= ?', account.id, since),
    profiles: count('SELECT COUNT(*) AS n FROM businesses WHERE referred_by = ? AND created_at >= ?', account.id, since),
  };
}

// The Launch Pack's summary: what the launch week brought (verified views and presses, against the week before it), for the latest launch
// that started in the last 60 days, or null.
export function launchSummary(db, businessId, at = Date.now()) {
  const e = db.prepare("SELECT * FROM entitlements WHERE business_id = ? AND kind = 'launch' AND status = 'active' AND starts_at > ? ORDER BY starts_at DESC LIMIT 1").get(businessId, at - 60 * DAY);
  if (!e) return null;
  const count = (kind, from, to) => db.prepare('SELECT COUNT(*) AS n FROM business_events WHERE business_id = ? AND kind = ? AND verified = 1 AND at >= ? AND at < ?').get(businessId, kind, from, to).n;
  const end = Math.min(e.ends_at, at);
  const week = e.ends_at - e.starts_at;
  return { from: e.starts_at, until: e.ends_at, running: at < e.ends_at, views: count('view', e.starts_at, end), ctaClicks: count('cta', e.starts_at, end), viewsWeekBefore: count('view', e.starts_at - week, e.starts_at), ctaWeekBefore: count('cta', e.starts_at - week, e.starts_at) };
}

// Pro: the owner's figures as a spreadsheet (30 days by day, sources, campaigns). Only for the owner of a profile with Pro.
export function exportCsv(db, account, slug) {
  requireAccount(account);
  const row = getRow(db, slug);
  if (row.account_id !== account.id) fail(403, 'This is not your business.', 'forbidden');
  if (!planFor(db, row.id).pro) fail(402, `CSV export is part of ${PRODUCTS.pro.name}.`, 'needs_pro');
  const s = profileStats(db, row.id);
  const day = (ago) => new Date(Date.now() - ago * DAY).toISOString().slice(0, 10);
  const rows = [
    ['Date', 'Verified views', 'Call-to-action presses', 'Results'], ...s.days.map((d) => [day(d.ago), d.views, d.cta, d.results]),
    [], ['Funnel (30 days)', 'Count'], ['Seen in lists', s.impressions], ['Profile visits', s.views], ['Qualified visits', s.qualified], ['Store entries', s.storeEntries], ['Button presses', s.ctaClicks],
    ['Newsletter sign-ups', s.newsletterSignups], ['Meeting requests', s.meetingRequests], ['Quote requests', s.quoteRequests], ['Coupons claimed', s.couponClaims], ['Coupons redeemed', s.couponRedemptions], ['Purchases', s.purchases],
    ['Purchase value (USD)', (s.revenueCents / 100).toFixed(2)], ['Spent on VoxelVenture (USD)', (s.spendCents / 100).toFixed(2)], ['Cost per result (USD)', s.costPerResultCents == null ? '' : (s.costPerResultCents / 100).toFixed(2)],
    [], ['Source', 'Views', 'Presses', 'Results'], ...s.sources.map((x) => [x.id, x.views, x.ctaClicks, x.results]),
    [], ['Campaign', 'Views', 'Presses', 'Results'], ...s.campaigns.map((c) => [c.id, c.views, c.ctaClicks, c.results]),
  ];
  return { __raw: { type: 'text/csv; charset=utf-8', filename: `${row.slug}-figures.csv`, body: csvRows(rows) } };
}

// "Tell me when it is ready": an owner asks for a paid plan before checkout exists (one record per profile and plan).
export function requestUpgrade(db, account, slug, plan) {
  const row = ownRow(db, account, slug);
  if (!PLANS[plan]) fail(400, 'plan must be launch, pro or sponsored.', 'bad_plan');
  db.prepare('INSERT OR IGNORE INTO upgrade_interest (business_id, plan, account_id, at) VALUES (?,?,?,?)').run(row.id, plan, account.id, now());
  return { requested: true, plan };
}

// For the leads code: the profile (by slug) a newsletter sign-up is for, and who owns it.
export function leadTarget(db, slug) {
  const row = getRow(db, slug);
  const cta = JSON.parse(row.cta);
  return { id: row.id, name: row.name, account: row.account_id, newsletter: cta.kind === 'newsletter' };
}
