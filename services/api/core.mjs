import crypto from 'node:crypto';
import { transaction } from './db.mjs';
import { imp } from '../../scripts/lib-loader.mjs';
import { planOf } from '@voxelventure/business-core';

// The rules of the world, with no HTTP in them: seeding the plots, accounts, claiming and taking over (atomic), events and statistics.
// The game's own modules (generator, logo rules) are loaded from lib/, so the server and the game cannot disagree.
const { generateCity, SUBURB_ID, TAKEOVER_MULTIPLIER } = await imp('city/cityGenerator.js');
const { cleanLogo } = await imp('game/logos.js');
const { toEmbedUrl } = await imp('content/embeds.js');
const { DEFAULT_TERM, TERMS, takeoverAllowed, termOf, termFor, leaseState, DAY_MS: LEASE_DAY, describeLease } = await imp('game/leases.js');
const { exteriorChangeQuote, landPriceOf, leaseQuote, renewalQuote, takeoverQuote } = await imp('game/claimPrice.js');
const { skylineFor } = await imp('game/skyline.js');
const { cleanExterior } = await imp('game/exterior.js');
export { TAKEOVER_MULTIPLIER };

export const SOURCES = ['street', 'billboard', 'banner', 'search', 'friends'];
const SOURCE_LABEL = { street: 'Walked past in the city', billboard: 'Billboards', banner: 'Aerial banners', search: 'Map search and Places', friends: 'Shared by other players' };
const DAY = 86400000;
const now = () => Date.now();
export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code ?? 'error';
  }
  withErrors(errors) {
    this.errors = errors;
    return this;
  }
  // more for the client in the error's body, beside `error` and `code` (the server adds these keys: an outside's quote on 402)
  withData(data) {
    this.data = data;
    return this;
  }
}
export const fail = (status, message, code) => {
  throw new ApiError(status, message, code);
};
export const text = (v, max) => [...String(v ?? '')].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127).join('').trim().slice(0, max); // no control characters

// ---- seeding ---------------------------------------------------------------------------------------------------------
// Fills the plots table from the generator (once). Built plots keep their generated business as the city's own.
// Each plot's facts carry its pricing attributes (`land`, lib/game/landPrice.js), so the server prices a lease from them as the claim form does. A database
// seeded before that (or by an older generator) is brought up to date every time the server starts.
export function seedWorld(db, seed = 20260101) {
  const city = generateCity(seed);
  if (db.prepare('SELECT COUNT(*) AS n FROM plots').get().n > 0) {
    const land = refreshLand(db, city);
    return { seeded: false, land, repriced: repriceToPeriods(db) };
  }
  const ins = db.prepare('INSERT INTO plots (id, district, building_type, owner_name, title, website, variant, value, base_visits, claimable, facts, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  const led = db.prepare("INSERT INTO ledger (plot_id, kind, owner_name, title, price, at) VALUES (?, 'open', ?, ?, ?, ?)");
  transaction(db, () => {
    for (const p of city.plots) {
      const { owner, title, website, buildingType, value, visits, interiorData } = p;
      ins.run(p.id, p.districtId, buildingType ?? null, owner ?? null, title, website ?? null, interiorData?.variant ?? null, Math.round(value), Math.round(visits ?? 0), p.districtId === SUBURB_ID || p.admin ? 0 : 1, JSON.stringify({ x: p.x, z: p.z, w: p.w, d: p.d, yaw: p.yaw ?? 0, prime: Boolean(p.prime), luxury: Boolean(p.luxury), grand: Boolean(p.grand), admin: Boolean(p.admin), height: p.height, floors: interiorData?.floors ?? 1, district: p.district, color: p.color, land: p.land }), now());
      led.run(p.id, `Building #${p.id}`, `Building #${p.id}`, Math.max(1, Math.round(value * 0.8)), now() - (10 + (p.id % 40)) * DAY);
    }
  });
  db.exec(`PRAGMA user_version = ${PERIOD_PRICES}`); // a new database is priced per 30 days from the start
  return { seeded: true, plots: city.plots.length };
}
// Writes the generator's pricing attributes into the facts of every plot whose stored ones differ (the generator works them out from the city's layout:
// lib/dev/locationAttrs.js). Returns how many plots changed.
function refreshLand(db, city) {
  const get = db.prepare('SELECT facts FROM plots WHERE id = ?');
  const put = db.prepare('UPDATE plots SET facts = ? WHERE id = ?');
  let changed = 0;
  transaction(db, () => {
    for (const p of city.plots) {
      const row = get.get(p.id);
      if (!row || !p.land) continue;
      const facts = JSON.parse(row.facts);
      if (JSON.stringify(facts.land ?? null) === JSON.stringify(p.land)) continue;
      put.run(JSON.stringify({ ...facts, land: p.land }), p.id);
      changed++;
    }
  });
  return changed;
}

// Once per database: a plot's value was the price of a year (before the 7, 14 and 30-day leases); it is now the price of 30 days. Every player's
// plot is re-priced as a new 30-day lease of it, with the outside it has (no Pro discount: the value is what the business is worth), so a take-over
// is priced from the new levels. Marked done with SQLite's user_version (1). Returns how many plots changed.
const PERIOD_PRICES = 1;
function repriceToPeriods(db) {
  if (db.prepare('PRAGMA user_version').get().user_version >= PERIOD_PRICES) return 0;
  const rows = db.prepare('SELECT * FROM plots WHERE owner_account IS NOT NULL').all();
  const put = db.prepare('UPDATE plots SET value = ? WHERE id = ?');
  transaction(db, () => {
    for (const r of rows) put.run(leaseQuote(pricedPlot(r), r.exterior ? JSON.parse(r.exterior) : null, r.building_type ?? 'shop', 30).period, r.id);
  });
  db.exec(`PRAGMA user_version = ${PERIOD_PRICES}`);
  return rows.length;
}

// ---- accounts --------------------------------------------------------------------------------------------------------
const hash = (password, salt) => crypto.scryptSync(password, salt, 32).toString('hex');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function signup(db, { username, password }) {
  const name = text(username, 20);
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(name)) fail(400, 'Choose a name of 3 to 20 letters, numbers, dashes or underscores.', 'bad_username');
  if (typeof password !== 'string' || password.length < 8 || password.length > 100) fail(400, 'The password needs at least 8 characters.', 'bad_password');
  const salt = crypto.randomBytes(16).toString('hex');
  try {
    const r = db.prepare('INSERT INTO accounts (username, pass_salt, pass_hash, created_at) VALUES (?,?,?,?)').run(name, salt, hash(password, salt), now());
    db.prepare("INSERT INTO gold_ledger (account_id, delta, reason, at) VALUES (?, 100, 'starter', ?)").run(Number(r.lastInsertRowid), now());
    db.prepare('UPDATE accounts SET gold = 100 WHERE id = ?').run(Number(r.lastInsertRowid));
    return startSession(db, Number(r.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) fail(409, 'That name is taken.', 'username_taken');
    throw e;
  }
}
export function login(db, { username, password }) {
  const a = db.prepare('SELECT * FROM accounts WHERE username = ?').get(text(username, 20));
  const ok = a && typeof password === 'string' && crypto.timingSafeEqual(Buffer.from(hash(password, a.pass_salt), 'hex'), Buffer.from(a.pass_hash, 'hex'));
  if (!ok) fail(401, 'Wrong name or password.', 'bad_login');
  if (a.banned) fail(403, 'This account has been suspended.', 'banned');
  return startSession(db, a.id);
}
function startSession(db, accountId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?,?,?)').run(sha(token), accountId, now() + 30 * DAY);
  return { token, account: publicAccount(db, accountId) };
}
// `pro`: one of the account's business profiles is on Pro now, so its plot leases cost 15% less (hasPro); the claim form shows the discount from it.
export function publicAccount(db, id) {
  const a = db.prepare('SELECT id, username, gold, created_at, email, email_verified, notify FROM accounts WHERE id = ?').get(id);
  return a && { id: a.id, username: a.username, gold: a.gold, createdAt: a.created_at, email: a.email, emailVerified: Boolean(a.email_verified), notify: Boolean(a.notify), pro: hasPro(db, a.id) };
}
// Is any of the account's published business profiles on an active Pro entitlement (@voxelventure/business-core planOf)? Then a plot lease (a claim, a
// take-over, a renewal) costs it 15% less (lib/game/leases.js PRO_PLOT_DISCOUNT). The server always asks this itself: a browser's word is never taken.
export function hasPro(db, accountId, at = now()) {
  if (accountId == null) return false;
  const rows = db.prepare("SELECT e.* FROM entitlements e JOIN businesses b ON b.id = e.business_id WHERE b.account_id = ? AND b.status = 'published' AND e.kind = 'pro'").all(accountId);
  const byBusiness = Map.groupBy(rows, (r) => r.business_id);
  return [...byBusiness.values()].some((ents) => planOf(ents, at).pro);
}
export function accountFromToken(db, token) {
  if (!token) return null;
  const s = db.prepare('SELECT account_id, expires_at FROM sessions WHERE token_hash = ?').get(sha(token));
  if (!s || s.expires_at <= now()) return null;
  return db.prepare('SELECT banned FROM accounts WHERE id = ?').get(s.account_id)?.banned ? null : publicAccount(db, s.account_id);
}
export function logout(db, token) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token ?? ''));
}
export const requireAccount = (account) => account ?? fail(401, 'Sign in first.', 'unauthorized');

// ---- plots -----------------------------------------------------------------------------------------------------------
// Every count the API serves is verified events only (docs/architecture/authoritative_data.md). The generator's starting figures (base_visits,
// base_views, base_clicks) are kept in the database as the seed's history but never added to a count: nobody sees an invented number as real.
const visitsOf = (db, id) => db.prepare("SELECT COUNT(*) AS n FROM events WHERE plot_id = ? AND kind = 'visit' AND verified = 1").get(id).n;
export function plotView(db, row) {
  const facts = JSON.parse(row.facts);
  return {
    id: row.id,
    title: row.title,
    owner: row.owner_name,
    ownerAccount: row.owner_account,
    website: row.website,
    buildingType: row.building_type,
    variant: row.variant,
    logo: row.logo ? JSON.parse(row.logo) : { kind: 'generated' },
    description: row.description ?? null,
    value: row.value,
    visits: visitsOf(db, row.id),
    district: facts.district,
    districtId: row.district,
    takeovers: row.takeovers,
    claimable: Boolean(row.claimable),
    lease: leaseView(db, row),
    ...facts,
    exterior: row.exterior ? JSON.parse(row.exterior) : null,
    // its public business page, if the owner linked one (business.mjs linkPlot): the page to share, and where a browser without 3D goes
    profileSlug: db.prepare("SELECT slug FROM businesses WHERE plot_id = ? AND status = 'published'").get(row.id)?.slug ?? null,
  };
}
// The lease of a plot as a client needs it: the term, the end, the state and what a renewal for the same term costs its tenant (with their Pro discount,
// if they have Pro). null for a business the city started with.
export function leaseView(db, row, at = now()) {
  if (!row.lease_end) return null;
  const d = describeLease(row.lease_end, row.lease_days, at);
  const pro = hasPro(db, row.owner_account, at);
  return { days: row.lease_days, start: row.lease_start, end: row.lease_end, state: d.state, text: d.text, renewPrice: renewalQuote(pricedPlot(row), termFor(row.lease_days), { pro }).total };
}
// A plot row in the shape the game's price rules take (lib/game/claimPrice.js), the same shape the claim form prices: its facts (size, tier, `land`),
// what it is worth, who leases it and the outside it has now.
export function pricedPlot(row) {
  return { ...JSON.parse(row.facts), id: row.id, value: row.value, ownerAccount: row.owner_account ?? null, buildingType: row.building_type ?? undefined, exterior: row.exterior ? JSON.parse(row.exterior) : null };
}
// The directory: every plot with a building, by value / visits / id / name, numbered 1 to N in that order.
export function directory(db, { sort = 'value', q = '', limit = 1000, offset = 0 } = {}) {
  const rows = db.prepare("SELECT * FROM plots WHERE owner_name IS NOT NULL AND building_type IS NOT NULL AND building_type != 'house'").all();
  const views = rows.map((r) => plotView(db, r));
  const byValue = [...views].sort((a, b) => b.value - a.value || a.id - b.id);
  const rank = new Map(byValue.map((p, i) => [p.id, i + 1]));
  const cmp = { value: (a, b) => b.value - a.value || a.id - b.id, visits: (a, b) => b.visits - a.visits || a.id - b.id, plot: (a, b) => a.id - b.id, name: (a, b) => a.title.localeCompare(b.title) }[sort] ?? ((a, b) => b.value - a.value);
  const needle = q.trim().toLowerCase();
  const list = (needle ? views.filter((p) => `${p.title} ${p.owner} ${p.district} ${p.buildingType} #${p.id}`.toLowerCase().includes(needle)) : views).sort(cmp);
  return { total: views.length, matched: list.length, entries: list.slice(offset, offset + limit).map((p, i) => ({ number: offset + i + 1, rank: rank.get(p.id), plot: p })) };
}
// The state of every plot in one small list, for a client to sync with: who owns it and what the business looks like now.
// (Empty lots are included with owner null; the generated facts are not: the client already has them.)
export function worldState(db) {
  const visits = Object.fromEntries(db.prepare("SELECT plot_id, COUNT(*) AS n FROM events WHERE kind = 'visit' AND verified = 1 GROUP BY plot_id").all().map((r) => [r.plot_id, r.n]));
  // the last 30 days of verified engagement per plot: who came, how long they stayed, who clicked (the skyline grows with it)
  const since = now() - 30 * DAY;
  const eng = Object.fromEntries(
    db
      .prepare("SELECT plot_id, COUNT(DISTINCT CASE WHEN kind = 'visit' THEN visitor END) AS uniques, SUM(kind = 'visit') AS views, SUM(kind = 'click') AS clicks, AVG(CASE WHEN kind = 'visit' THEN seconds END) AS avg FROM events WHERE verified = 1 AND at >= ? GROUP BY plot_id")
      .all(since)
      .map((r) => [r.plot_id, { uniques: r.uniques, views: r.views ?? 0, clicks: r.clicks ?? 0, avgSeconds: r.avg ?? 0 }])
  );
  const rows = db.prepare('SELECT * FROM plots').all();
  // the public page of a building whose owner linked it to their business profile (business.mjs)
  const profiles = Object.fromEntries(db.prepare("SELECT plot_id, slug FROM businesses WHERE plot_id IS NOT NULL AND status = 'published'").all().map((r) => [r.plot_id, r.slug]));
  return {
    at: now(),
    ads: adSlots(db),
    plots: rows.map((r) => ({ id: r.id, owner: r.owner_name, ownerAccount: r.owner_account, title: r.title, website: r.website, buildingType: r.building_type, variant: r.variant, logo: r.logo ? JSON.parse(r.logo) : null, description: r.description, value: r.value, visits: visits[r.id] ?? 0, takeovers: r.takeovers, updatedAt: r.updated_at, skyline: eng[r.id] ? skylineFor(eng[r.id]) : null, lease: r.lease_end ? { days: r.lease_days, end: r.lease_end } : null, exterior: r.exterior ? JSON.parse(r.exterior) : null, profileSlug: profiles[r.id] ?? null })),
  };
}
export function getPlot(db, id) {
  const row = db.prepare('SELECT * FROM plots WHERE id = ?').get(Number(id));
  return row ?? fail(404, 'No such plot.', 'no_plot');
}

// What an owner sets up: title, website, type, interior layout, logo, description. Anything invalid is refused.
function cleanBusiness(input) {
  const title = text(input.title, 60);
  if (title.length < 2) fail(400, 'Give the business a name.', 'bad_title');
  const buildingType = ['shop', 'restaurant', 'office'].includes(input.buildingType) ? input.buildingType : fail(400, 'Choose shop, restaurant or office.', 'bad_type');
  let website = text(input.website, 200) || 'https://example.com';
  if (!/^https?:\/\/[^\s]+$/i.test(website)) fail(400, 'The website must start with http:// or https://', 'bad_website');
  const logo = cleanLogo(input.logo);
  if (!logo) fail(400, 'Choose a roof banner logo.', 'bad_logo');
  return { title, buildingType, website, variant: text(input.variant, 20) || null, logo: JSON.stringify(logo), description: text(input.description, 160) || null };
}

// The lease term a request asks for: 7, 14 or 30 days (30 if it does not say), anything else is refused.
export const TERM_MESSAGE = `A lease is ${TERMS.map((t) => t.days).join(', ').replace(/, ([^,]*)$/, ' or $1')} days.`;
function leaseTerm(input) {
  if (input.leaseDays == null) return DEFAULT_TERM;
  return termOf(input.leaseDays)?.days ?? fail(400, TERM_MESSAGE, 'bad_term');
}

// With payments on, a player paying for a plot holds it while they pay (an order waiting for its payment, billing.mjs): nobody else may
// claim it or take it over until the hold ends.
export function plotHeldByOther(db, plotId, accountId, at = now()) {
  return Boolean(db.prepare("SELECT 1 FROM orders WHERE target = ? AND status = 'pending' AND hold_until > ? AND account_id != ?").get(`plot:${Number(plotId)}`, at, accountId ?? 0));
}
const HELD = 'Someone is paying for this plot right now. Try again in half an hour, or pick another.';

// Claim an empty lot. Atomic: if two players race for it, exactly one wins and the other gets 409.
// opts.pro (the cart, billing.mjs; never from a browser): price as Pro or not, in place of asking hasPro, for a cart that buys Pro in the same payment.
export function claimPlot(db, account, id, input, opts = {}) {
  requireAccount(account);
  const b = cleanBusiness(input);
  return transaction(db, () => {
    const p = getPlot(db, id);
    if (!p.claimable) fail(409, 'This lot cannot be claimed.', 'not_claimable');
    if (p.owner_name) fail(409, 'Someone claimed this plot first.', 'already_owned');
    if (plotHeldByOther(db, p.id, account.id)) fail(409, HELD, 'held');
    const term = leaseTerm(input);
    // the price the claim form shows (lib/game/claimPrice.js): the land and the outside chosen are the price of 30 days, the plot's value; the term pays
    // its share, less 15% if the account has Pro
    const exterior = exteriorOf(input, p, b.buildingType);
    const quote = leaseQuote(pricedPlot(p), exterior ? JSON.parse(exterior) : null, b.buildingType, term, { pro: opts.pro ?? hasPro(db, account.id) });
    const price = quote.total;
    db.prepare('UPDATE plots SET owner_account=?, owner_name=?, title=?, website=?, building_type=?, variant=?, logo=?, description=?, exterior=?, value=?, lease_days=?, lease_start=?, lease_end=?, lease_notified=0, brand=NULL, quest_budget=0, updated_at=? WHERE id=? AND owner_name IS NULL')
      .run(account.id, account.username, b.title, b.website, b.buildingType, b.variant, b.logo, b.description, exterior, quote.period, term, now(), now() + term * LEASE_DAY, now(), p.id);
    db.prepare("INSERT INTO ledger (plot_id, kind, account_id, owner_name, title, price, at) VALUES (?, 'claim', ?, ?, ?, ?, ?)").run(p.id, account.id, account.username, b.title, price, now());
    db.prepare('DELETE FROM plot_interiors WHERE plot_id = ?').run(p.id); // a new owner starts from the generated interior (interiors.mjs)
    return plotView(db, getPlot(db, p.id));
  });
}

// Take over a business that is not yours: pay 1.25x what it is worth (a player's: its value, the price of 30 days; the city's own: its land) and the
// outside you choose, for 30 days, or the term's share of that (less 15% with Pro); the old owner is paid out and logged. Atomic.
export function takeOverPlot(db, account, id, input, opts = {}) {
  requireAccount(account);
  const b = cleanBusiness(input);
  return transaction(db, () => {
    const p = getPlot(db, id);
    if (!p.claimable || !p.owner_name) fail(409, 'There is no business here to take over.', 'not_for_takeover');
    if (p.owner_account === account.id) fail(409, 'This is already your business.', 'own_plot');
    // a lease protects its tenant: nobody can take the business over until it has ended and the tenant's grace days of first refusal have passed
    if (!takeoverAllowed(p.lease_end)) fail(409, describeLease(p.lease_end, p.lease_days).text, 'leased');
    if (plotHeldByOther(db, p.id, account.id)) fail(409, HELD, 'held');
    // the price the caller saw must still be the price (somebody may have taken it over in the meantime)
    const term = leaseTerm(input);
    const exterior = exteriorOf(input, p, b.buildingType);
    const quote = takeoverQuote(pricedPlot(p), exterior ? JSON.parse(exterior) : null, b.buildingType, term, { pro: opts.pro ?? hasPro(db, account.id) });
    const price = quote.total;
    if (input.expectedPrice != null && Number(input.expectedPrice) !== price) fail(409, 'The price changed: reload the plot.', 'price_changed');
    db.prepare("INSERT INTO ledger (plot_id, kind, account_id, owner_name, title, price, paid_to, at) VALUES (?, 'takeover', ?, ?, ?, ?, ?, ?)").run(p.id, account.id, account.username, b.title, price, p.owner_name, now());
    // the old owner gets back what is left in the quest budget; the new owner starts with no offers
    if (p.owner_account && p.quest_budget > 0) {
      db.prepare('UPDATE accounts SET gold = gold + ? WHERE id = ?').run(p.quest_budget, p.owner_account);
      db.prepare("INSERT INTO gold_ledger (account_id, delta, reason, ref, at) VALUES (?, ?, 'budget_refund', ?, ?)").run(p.owner_account, p.quest_budget, String(p.id), now());
    }
    db.prepare('UPDATE plots SET owner_account=?, owner_name=?, title=?, website=?, building_type=?, variant=?, logo=?, description=?, exterior=?, value=?, lease_days=?, lease_start=?, lease_end=?, lease_notified=0, takeovers=takeovers+1, brand=NULL, quest_budget=0, updated_at=? WHERE id=?')
      .run(account.id, account.username, b.title, b.website, b.buildingType, b.variant, b.logo, b.description, exterior, quote.period, term, now(), now() + term * LEASE_DAY, now(), p.id);
    db.prepare('DELETE FROM plot_interiors WHERE plot_id = ?').run(p.id); // the old owner's interior goes with them (interiors.mjs)
    return { plot: plotView(db, getPlot(db, p.id)), paidOut: price, previousOwner: p.owner_name, previousAccount: p.owner_account };
  });
}

// The outside a request sets up, cleaned against the plot's own limits (floors by tier and type), as stored JSON; null for the usual one.
function exteriorOf(input, row, buildingType) {
  if (input.exterior == null) return null;
  if (typeof input.exterior !== 'object') fail(400, 'That building setup is not valid.', 'bad_exterior');
  return JSON.stringify(cleanExterior(input.exterior, JSON.parse(row.facts), buildingType ?? row.building_type ?? 'shop'));
}

// The owner changes their logo, description and the outside of the building (nothing else: the price and the owner are not editable).
// An outside that costs the same or less for 30 days than the one the building has applies at once, and the plot's value (its price for 30 days) changes by
// the difference. One that costs more is refused with 402 and the quote (lib/game/claimPrice.js exteriorChangeQuote): it is paid for through
// upgradeExterior (POST /plots/:id/exterior), so an owner cannot claim with the basic outside and add a spire for nothing afterwards.
export function updateBusiness(db, account, id, input) {
  requireAccount(account);
  return transaction(db, () => {
    const p = getPlot(db, id);
    if (p.owner_account !== account.id) fail(403, 'This is not your business.', 'forbidden');
    const logo = input.logo === undefined ? p.logo : (cleanLogo(input.logo) ? JSON.stringify(cleanLogo(input.logo)) : fail(400, 'That logo is not valid.', 'bad_logo'));
    const description = input.description === undefined ? p.description : text(input.description, 160) || null;
    const video = input.videoUrl ? toEmbedUrl('video', input.videoUrl) : { ok: true };
    if (!video.ok) fail(400, video.error, 'bad_video');
    const exterior = input.exterior === undefined ? p.exterior : exteriorOf(input, p, p.building_type);
    let value = p.value;
    if (input.exterior !== undefined) {
      const quote = outsideQuote(p, exterior);
      if (quote.diff > 0) throw new ApiError(402, `This outside costs $${quote.diff.toLocaleString()} more for 30 days: $${quote.charge.toLocaleString()} for the rest of your lease.`, 'exterior_payment_required').withData({ quote });
      value = valueAfter(p, quote.diff);
    }
    db.prepare('UPDATE plots SET logo=?, description=?, exterior=?, value=?, updated_at=? WHERE id=?').run(logo, description, exterior, value, now(), p.id);
    return plotView(db, getPlot(db, p.id));
  });
}

// What changing a plot's stored outside to `exterior` (stored JSON, or null) costs: the quote, priced as the claim form prices it.
function outsideQuote(row, exterior) {
  const plot = pricedPlot(row);
  const type = row.building_type ?? 'shop';
  return exteriorChangeQuote(plot, plot.exterior, exterior ? JSON.parse(exterior) : null, type, { now: now(), leaseDays: row.lease_days, leaseEnd: row.lease_end });
}
// The plot's value after its outside changed by `diff` for 30 days: it is the price of 30 days, so it moves with the outside, never below the land.
const valueAfter = (row, diff) => Math.max(landPriceOf(pricedPlot(row)), Math.round((Number(row.value) + diff) * 100) / 100);

// The owner pays for a more elaborate outside (more floors, a roof garden, a dome, a spire): the charge for the rest of the lease is written in the
// ledger ('exterior', not a change of hands), the outside applies and the plot's value goes up by the 30-day difference. Only while the lease runs or
// can be renewed: once it has ended the building cannot be changed until it is renewed (as its inside, interiors.mjs). With payments on this runs once
// the payment arrives (billing.mjs); returns { plot, paid, diff, before } (before: the outside it replaced, for a refund to put back).
export function upgradeExterior(db, account, id, input = {}) {
  requireAccount(account);
  return transaction(db, () => {
    const p = getPlot(db, id);
    if (p.owner_account !== account.id) fail(403, 'This is not your business.', 'forbidden');
    if (['grace', 'open'].includes(leaseState(p.lease_end, now(), p.lease_days))) fail(403, 'The lease on this building has ended. Renew it to change the outside again.', 'lease_ended');
    if (input.exterior == null) fail(400, 'Send the outside to build.', 'bad_exterior');
    const exterior = exteriorOf(input, p, p.building_type);
    const quote = outsideQuote(p, exterior);
    db.prepare('UPDATE plots SET exterior=?, value=?, updated_at=? WHERE id=?').run(exterior, valueAfter(p, quote.diff), now(), p.id);
    if (quote.charge > 0) db.prepare("INSERT INTO ledger (plot_id, kind, account_id, owner_name, title, price, at) VALUES (?, 'exterior', ?, ?, ?, ?, ?)").run(p.id, account.id, account.username, p.title, quote.charge, now());
    return { plot: plotView(db, getPlot(db, p.id)), paid: quote.charge, diff: quote.diff, before: p.exterior ?? null };
  });
}
// A refunded outside upgrade is undone (billing.mjs): the outside it replaced comes back and the value goes down by what the upgrade added.
export function revertExterior(db, id, before, diff) {
  const p = getPlot(db, id);
  db.prepare('UPDATE plots SET exterior=?, value=?, updated_at=? WHERE id=?').run(before ?? null, valueAfter(p, -Number(diff || 0)), now(), p.id);
}

// ---- history ---------------------------------------------------------------------------------------------------------
// The kinds of ledger row where a plot changed hands (the city's own first business, a claim, a take-over). A renewal or an outside upgrade is the same
// tenant paying again: it is not another owner.
export const HAND_CHANGES = ['open', 'claim', 'takeover'];
export function history(db, id) {
  getPlot(db, id);
  const rows = db.prepare(`SELECT * FROM ledger WHERE plot_id = ? AND kind IN (${HAND_CHANGES.map(() => '?').join(',')}) ORDER BY id DESC`).all(Number(id), ...HAND_CHANGES);
  const events = rows.map((r, i) => ({ kind: r.kind === 'open' ? 'open' : 'claim', title: r.title, price: r.price, owner: r.owner_name, paidTo: r.paid_to, daysAgo: Math.max(0, Math.floor((now() - r.at) / DAY)), now: i === 0 && r.kind !== 'open' }));
  return { simulated: false, events, owners: rows.filter((r) => r.kind !== 'open').length };
}

// ---- events and statistics ---------------------------------------------------------------------------------------------
// A visitor entered a building (kind 'visit', with the seconds they stayed) or pressed Visit website (kind 'click').
// ctx: { ip, userAgent, salt, minAgeMs, visitCap, clickCap } from the HTTP layer. An event is VERIFIED (counted in the statistics) only if it comes from a
// running page (the visitor has pinged presence for a few seconds), is not a known bot, and the same network has not already made too many for this
// building today (visits 3, clicks 1 per network per plot per 24 hours). Others are kept for the record but not counted.
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|curl|wget|python-requests/i;
export function recordEvent(db, account, input, ctx = {}) {
  const p = getPlot(db, input.plotId);
  if (!p.owner_name) fail(400, 'Nothing to visit on an empty lot.', 'empty_lot');
  if (input.kind === 'leave') return recordLeave(db, account, p, input);
  const kind = ['visit', 'click'].includes(input.kind) ? input.kind : fail(400, 'kind must be visit, click or leave.', 'bad_kind');
  const source = SOURCES.includes(input.source) ? input.source : 'street';
  const visitor = account ? `a${account.id}` : `x${text(input.visitor, 40) || 'anonymous'}`;
  // a visitor re-entering the same building within a minute is one visit (stops a client inflating the figures by spamming)
  const last = db.prepare('SELECT at FROM events WHERE plot_id=? AND visitor=? AND kind=? ORDER BY id DESC LIMIT 1').get(p.id, visitor, kind);
  if (last && now() - last.at < 60000) return { counted: false };
  const seconds = kind === 'visit' && Number.isFinite(Number(input.seconds)) ? Math.max(0, Math.min(3600, Math.round(Number(input.seconds)))) : null;
  const ipHash = ctx.ip ? crypto.createHash('sha256').update(`${ctx.salt ?? 'voxelventure'}|${ctx.ip}`).digest('hex').slice(0, 16) : null;
  const presenceKey = account ? `a${account.id}` : `v${text(input.visitor, 40)}`;
  const seen = db.prepare('SELECT first_at FROM presence WHERE visitor = ?').get(presenceKey);
  // the owner walking round their own building is not a visitor
  let verified = Boolean(seen) && now() - seen.first_at >= (ctx.minAgeMs ?? 3000) && !BOT_UA.test(String(ctx.userAgent ?? '')) && !(account && account.id === p.owner_account);
  if (verified && ipHash) {
    const cap = kind === 'click' ? ctx.clickCap ?? 1 : ctx.visitCap ?? 3;
    const used = db.prepare('SELECT COUNT(*) AS n FROM events WHERE plot_id = ? AND kind = ? AND ip_hash = ? AND verified = 1 AND at >= ?').get(p.id, kind, ipHash, now() - DAY).n;
    if (used >= cap) verified = false;
  }
  db.prepare('INSERT INTO events (plot_id, kind, source, visitor, seconds, at, ip_hash, verified) VALUES (?,?,?,?,?,?,?,?)').run(p.id, kind, source, visitor, seconds, now(), ipHash, verified ? 1 : 0);
  return { counted: true, verified };
}

// The scrambled network address on visits, presses and ad views is only needed for the per-network daily caps (a day back at most): after
// 90 days it is blanked; the rows and every figure made from them are kept (the hour's job, server.mjs; lib/legal/retention.js ipHashDays).
export const IP_HASH_DAYS = 90;
export function scrubIpHashes(db, at = now()) {
  const before = at - IP_HASH_DAYS * DAY;
  let n = 0;
  for (const table of ['events', 'business_events', 'ad_events']) n += Number(db.prepare(`UPDATE ${table} SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND at < ?`).run(before).changes);
  return n;
}

// The visitor number (or account) on visits, presses, ad views, arrivals, coupon claims and market stall visits is kept 180 days: every
// figure that tells visitors apart looks back 30 days at most. After that it becomes "removed" (in a table where the visitor is part of the
// key, "removed-<row>" so rows stay distinct); the rows and the counts made from them are kept. Requests (business_inquiries) are wiped on
// their own schedule (conversions.mjs pruneInquiries). The hour's job, server.mjs; lib/legal/retention.js visitorDays.
export const VISITOR_DAYS = 180;
export function scrubVisitorIds(db, at = now()) {
  const before = at - VISITOR_DAYS * DAY;
  let n = 0;
  for (const table of ['events', 'business_events', 'ad_events', 'arrivals']) n += Number(db.prepare(`UPDATE ${table} SET visitor = 'removed' WHERE visitor != 'removed' AND at < ?`).run(before).changes);
  for (const table of ['coupon_claims', 'market_visits']) n += Number(db.prepare(`UPDATE ${table} SET visitor = 'removed-' || rowid WHERE visitor NOT LIKE 'removed-%' AND at < ?`).run(before).changes);
  return n;
}

// Leaving a building: the time spent inside goes on that visitor's latest visit there, if it has none yet and was in the last
// hour (a visit's time is set once; a leave without a visit changes nothing and is not an event of its own).
function recordLeave(db, account, p, input) {
  const visitor = account ? `a${account.id}` : `x${text(input.visitor, 40) || 'anonymous'}`;
  const seconds = Number(input.seconds);
  if (!Number.isFinite(seconds) || seconds < 0) fail(400, 'seconds must be a number.', 'bad_seconds');
  const row = db.prepare("SELECT id, at FROM events WHERE plot_id = ? AND visitor = ? AND kind = 'visit' AND seconds IS NULL AND at >= ? ORDER BY id DESC LIMIT 1").get(p.id, visitor, now() - 3600000);
  if (!row) return { counted: false };
  // never more than the time since the visit began (a client cannot claim an hour for a ten-second visit)
  const s = Math.min(3600, Math.round(seconds), Math.ceil((now() - row.at) / 1000));
  db.prepare('UPDATE events SET seconds = ? WHERE id = ?').run(s, row.id);
  return { counted: false, seconds: s };
}

// A building's last 30 days of verified traffic. Its owner sees everything (clicks, click rate, sources, hours, dwell time);
// anyone else sees a summary: visits, visitors and the busiest day (the visit count is public in the directory anyway).
export function plotStats(db, id, viewer = null, { full: all = false } = {}) {
  const p = getPlot(db, id);
  if (!p.owner_name) return null;
  const full = statsOf(db, p);
  if (all || (viewer && p.owner_account && viewer.id === p.owner_account)) return { ...full, scope: 'owner' };
  const { simulated, verified, skyline, views, uniques, busiestDay } = full;
  return { scope: 'summary', simulated, verified, skyline, views, uniques, busiestDay };
}

// Thirty days of real figures, in the same shape as the game's simulated statistics (lib/game/plotInfo.js siteVisitStats).
function statsOf(db, p) {
  const since = now() - 30 * DAY;
  const all = db.prepare('SELECT COUNT(*) AS n FROM events WHERE plot_id = ? AND at >= ?').get(p.id, since).n;
  const ev = db.prepare('SELECT kind, source, visitor, seconds, at FROM events WHERE plot_id = ? AND at >= ? AND verified = 1').all(p.id, since);
  const visits = ev.filter((e) => e.kind === 'visit');
  const clicks = ev.filter((e) => e.kind === 'click');
  const days = Array.from({ length: 30 }, (_, k) => ({ ago: 29 - k, views: 0 }));
  for (const e of visits) days[29 - Math.min(29, Math.floor((now() - e.at) / DAY))].views++;
  const views = visits.length; // real events only; the city's own starting visits are history, not events
  const byHour = new Array(24).fill(0);
  const byWeekday = new Array(7).fill(0);
  for (const e of visits) {
    byHour[new Date(e.at).getHours()]++;
    byWeekday[new Date(e.at).getDay()]++;
  }
  const timed = visits.filter((e) => e.seconds != null);
  const bySource = Object.fromEntries(SOURCES.map((s) => [s, 0]));
  for (const e of visits) bySource[e.source]++;
  const sources = SOURCES.map((id2) => ({ id: id2, label: SOURCE_LABEL[id2], share: views ? bySource[id2] / views : 0 })).sort((a, b) => b.share - a.share);
  const peak = (arr) => (Math.max(...arr) > 0 ? arr.indexOf(Math.max(...arr)) : null);
  const skyline = skylineFor({ uniques: new Set(visits.map((e) => e.visitor)).size, clicks: clicks.length, views: visits.length, avgSeconds: timed.length ? timed.reduce((a, e) => a + e.seconds, 0) / timed.length : 0 });
  return {
    simulated: false,
    verified: true, // only events from a running page, not a known bot, within the per-network daily cap
    humanShare: all ? ev.length / all : 1,
    skyline,
    days,
    views,
    uniques: new Set(visits.map((e) => e.visitor)).size,
    clicks: clicks.length,
    ctr: views ? clicks.length / views : 0,
    avgSeconds: timed.length ? Math.round(timed.reduce((a, e) => a + e.seconds, 0) / timed.length) : 0,
    busiestHour: peak(byHour),
    busiestDay: peak(byWeekday) == null ? null : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][peak(byWeekday)],
    sources,
    best: Math.max(0, ...days.map((d) => d.views)),
  };
}

export function worldStats(db, online = 0) {
  const t = db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'visit' AND verified = 1").get().n;
  const built = db.prepare("SELECT COUNT(*) AS n FROM plots WHERE owner_name IS NOT NULL AND building_type != 'house'").get().n;
  return { online, totalVisits: t, buildings: built, accounts: db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n };
}

// ---- ad slots --------------------------------------------------------------------------------------------------------
// Seeds the slots from the generator's billboards and banners (once; also upgrades a database made before ad slots existed).
export function seedAds(db, seed = 20260101) {
  if (db.prepare('SELECT COUNT(*) AS n FROM ad_slots').get().n > 0) return { seeded: false };
  const city = generateCity(seed);
  const ins = db.prepare('INSERT INTO ad_slots (id, kind, label, facts, ad, value, base_views, base_clicks, updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
  transaction(db, () => {
    for (const b of city.billboards) ins.run(b.id, b.kind === 'banner' ? 'banner' : 'billboard', b.roadName, JSON.stringify({ x: b.x, z: b.z, yaw: b.yaw, width: b.width, height: b.height, airline: b.airline ?? null }), b.ad ? JSON.stringify(b.ad) : null, b.value, b.views, b.clicks, now());
  });
  return { seeded: true, slots: city.billboards.length };
}

export function slotView(db, row) {
  const ev = db.prepare('SELECT kind, COUNT(*) AS n FROM ad_events WHERE slot_id = ? AND verified = 1 GROUP BY kind').all(row.id);
  const n = (k) => ev.find((e) => e.kind === k)?.n ?? 0;
  return { id: row.id, kind: row.kind, label: row.label, ...JSON.parse(row.facts), ad: row.ad ? JSON.parse(row.ad) : null, ownerAccount: row.owner_account, value: row.value, views: n('view'), clicks: n('click'), takeovers: row.takeovers, price: Math.round(row.value * 1.25), open: !row.ad };
}
export function adSlots(db) {
  return db.prepare('SELECT * FROM ad_slots ORDER BY kind, id').all().map((r) => slotView(db, r));
}
const getSlot = (db, id) => db.prepare('SELECT * FROM ad_slots WHERE id = ?').get(String(id)) ?? fail(404, 'No such ad space.', 'no_slot');
export const getAdSlot = (db, id) => slotView(db, getSlot(db, id));

function cleanAd(input) {
  const advertiser = text(input.advertiser, 40);
  const headline = text(input.headline, 60);
  const tagline = text(input.tagline, 100);
  const url = text(input.url, 200);
  const color = /^#[0-9a-fA-F]{6}$/.test(input.color ?? '') ? input.color.toLowerCase() : fail(400, 'Choose a colour.', 'bad_color');
  if (advertiser.length < 2 || headline.length < 2) fail(400, 'Give the ad an advertiser and a headline.', 'bad_ad');
  if (url && !/^https?:\/\/[^\s]+$/i.test(url)) fail(400, 'The link must start with http:// or https://', 'bad_website');
  return { advertiser, headline, tagline, url, color };
}

// Buy an ad space: an open one at its price, or take one over at 1.25x (the old advertiser is paid out and logged). Atomic.
export function buySlot(db, account, id, input) {
  requireAccount(account);
  const ad = cleanAd(input);
  return transaction(db, () => {
    const s = getSlot(db, id);
    if (s.owner_account === account.id) fail(409, 'This ad space is already yours.', 'own_slot');
    const price = Math.round(s.value * 1.25);
    if (input.expectedPrice != null && Number(input.expectedPrice) !== price) fail(409, 'The price changed: reload the ad space.', 'price_changed');
    const previous = s.ad ? JSON.parse(s.ad).advertiser : null;
    db.prepare('INSERT INTO ad_ledger (slot_id, account_id, advertiser, headline, price, paid_to, at) VALUES (?,?,?,?,?,?,?)').run(s.id, account.id, ad.advertiser, ad.headline, price, previous, now());
    db.prepare('UPDATE ad_slots SET ad=?, owner_account=?, value=?, takeovers=takeovers+?, base_views=0, base_clicks=0, updated_at=? WHERE id=?').run(JSON.stringify(ad), account.id, price, previous ? 1 : 0, now(), s.id);
    // the new advertiser starts from zero: the old advertiser's views are not theirs
    db.prepare('DELETE FROM ad_events WHERE slot_id = ?').run(s.id);
    return { slot: slotView(db, getSlot(db, s.id)), paidOut: previous ? price : 0, previousAdvertiser: previous, previousAccount: s.owner_account };
  });
}
export function slotHistory(db, id) {
  getSlot(db, id);
  return db.prepare('SELECT advertiser, headline, price, paid_to AS paidTo, at FROM ad_ledger WHERE slot_id = ? ORDER BY id DESC').all(String(id)).map((r) => ({ ...r, daysAgo: Math.floor((now() - r.at) / DAY) }));
}
// A view or a click on an ad (a visitor's repeat within a minute is one). Verified by the same rules as a building visit (recordEvent):
// a running page, not a known bot, not the advertiser's own, and within the per-network daily cap (views like visits, clicks like clicks).
// Only verified events count in what an advertiser sees.
export function recordAdEvent(db, account, input, ctx = {}) {
  const s = getSlot(db, input.slotId);
  if (!s.ad) fail(400, 'This ad space is empty.', 'empty_slot');
  const kind = ['view', 'click'].includes(input.kind) ? input.kind : fail(400, 'kind must be view or click.', 'bad_kind');
  const visitor = account ? `a${account.id}` : `x${text(input.visitor, 40) || 'anonymous'}`;
  const last = db.prepare('SELECT at FROM ad_events WHERE slot_id=? AND visitor=? AND kind=? ORDER BY id DESC LIMIT 1').get(s.id, visitor, kind);
  if (last && now() - last.at < 60000) return { counted: false };
  const ipHash = ctx.ip ? crypto.createHash('sha256').update(`${ctx.salt ?? 'voxelventure'}|${ctx.ip}`).digest('hex').slice(0, 16) : null;
  const seen = db.prepare('SELECT first_at FROM presence WHERE visitor = ?').get(account ? `a${account.id}` : `v${text(input.visitor, 40)}`);
  let verified = Boolean(seen) && now() - seen.first_at >= (ctx.minAgeMs ?? 3000) && !BOT_UA.test(String(ctx.userAgent ?? '')) && !(account && account.id === s.owner_account);
  if (verified && ipHash) {
    const cap = kind === 'click' ? ctx.clickCap ?? 1 : ctx.visitCap ?? 3;
    if (db.prepare('SELECT COUNT(*) AS n FROM ad_events WHERE slot_id = ? AND kind = ? AND ip_hash = ? AND verified = 1 AND at >= ?').get(s.id, kind, ipHash, now() - DAY).n >= cap) verified = false;
  }
  db.prepare('INSERT INTO ad_events (slot_id, kind, visitor, at, ip_hash, verified) VALUES (?,?,?,?,?,?)').run(s.id, kind, visitor, now(), ipHash, verified ? 1 : 0);
  return { counted: true, verified };
}
