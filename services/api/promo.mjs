import crypto from 'node:crypto';
import { transaction } from './db.mjs';
import { ApiError, fail, requireAccount, text } from './core.mjs';
import { audit } from './audit.mjs';
import { imp } from '../../scripts/lib-loader.mjs';
import { PROMO_ALPHABET, PROMO_GROUP_IDS, PROMO_KINDS, dollars, groupsOf, normalizeCode, promoDiscount, promoGroupOf, promoLabel } from '@voxelventure/business-core';

// Promo codes (docs/monetization/billing.md#promo-codes): discount codes the owner makes in /admin/promos, which players and business owners apply to
// VoxelVenture's own services at checkout (a single "Buy now" or the cart). Not the merchants' coupons (coupon_claims, conversions.mjs): those are
// businesses giving their own customers a coupon, and nothing here touches them.
//
//   codes        promo_codes: percent (1-100) or an amount in cents; the product groups it covers (@voxelventure/business-core PROMO_GROUPS); a minimum
//                total; limits in all and per account; start and end; new customers only; active or not
//   pricing      always the server's (business-core promoDiscount): on the eligible lines only, after the Pro plot discount and the renewal discount
//   uses         promo_redemptions, one per checkout: reserved when the checkout starts (so a code with one use left cannot be used twice at once),
//                redeemed when the payment arrives, released when the checkout expires or fails, voided when the order is refunded in full
//   errors       one generic "That code isn't valid." for every reason a guesser could learn something from (unknown, switched off, not started,
//                ended, used up, new customers only); a clear reason only where the player already knows the code or can act on it: they used it
//                already, it does not cover what they are buying, or the total is under its minimum
//   guessing     failed tries are counted per account and per network: after PROMO_TRIES (default 10) in PROMO_TRY_MINUTES (default 15), every code
//                check is refused for the rest of that window, right codes too
const { csvRows } = await imp('data/csv.js');
const now = () => Date.now();
const MAX_BATCH = 500;

// ---- the codes ----------------------------------------------------------------------------------------------------------------------
const row = (db, id) => db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(Number(id));
export const byCode = (db, code) => (code ? db.prepare('SELECT * FROM promo_codes WHERE code = ?').get(code) : null);
const promoOf = (r) => ({ kind: r.kind, value: r.value, groups: groupsOf(JSON.parse(r.applies_to)) });

// A fresh PREFIX-XXXX-XXXX not used yet (nor in `taken`, the batch being made).
export function generateCode(db, prefix = 'VV', taken = new Set()) {
  for (let i = 0; i < 50; i++) {
    const part = () => Array.from({ length: 4 }, () => PROMO_ALPHABET[crypto.randomInt(PROMO_ALPHABET.length)]).join('');
    const code = `${prefix}-${part()}-${part()}`;
    if (!taken.has(code) && !byCode(db, code)) return code;
  }
  throw new ApiError(500, 'Could not make a new code. Try again.', 'promo_generate');
}

// ---- checking a code at checkout ------------------------------------------------------------------------------------------------------
// What every failure says to the player. Only `used`, `not_applicable` and `minimum` say why (see the top).
const GENERIC = [400, "That code isn't valid.", 'promo_invalid'];
const answer = (reason, promo) =>
  ({
    used: [409, 'You have already used this code.', 'promo_used'],
    not_applicable: [400, "This code doesn't apply to what you're buying.", 'promo_not_applicable'],
    minimum: [400, `This code needs a total of at least ${dollars(promo?.min_subtotal_cents ?? 0)} before the discount.`, 'promo_minimum'],
  })[reason] ?? GENERIC;
export const isGeneric = (reason) => !['used', 'not_applicable', 'minimum'].includes(reason);

// How many uses of a code count toward its limits now: reserved and redeemed ones. `replacing`: leave out this account's uses held by its own checkouts
// still open, because the checkout being started replaces them (billing.mjs replaceOpenCheckouts).
function usesOf(db, promoId, accountId = null, replacing = null) {
  const skip = replacing ? " AND NOT (r.account_id = ? AND r.status = 'reserved' AND o.status = 'pending')" : '';
  const args = replacing ? [replacing] : [];
  const all = db.prepare(`SELECT COUNT(*) AS n FROM promo_redemptions r JOIN orders o ON o.id = r.order_id WHERE r.promo_id = ? AND r.status IN ('reserved', 'redeemed')${skip}`).get(promoId, ...args).n;
  const mine = accountId == null ? 0 : db.prepare(`SELECT COUNT(*) AS n FROM promo_redemptions r JOIN orders o ON o.id = r.order_id WHERE r.promo_id = ? AND r.account_id = ? AND r.status IN ('reserved', 'redeemed')${skip}`).get(promoId, accountId, ...args).n;
  return { all, mine };
}
// An account that has paid for something before (a real payment: not a free or complimentary order).
export const isCustomer = (db, accountId) => Boolean(db.prepare("SELECT 1 FROM orders WHERE account_id = ? AND parent_id IS NULL AND paid_at IS NOT NULL AND cents > 0 AND status IN ('paid', 'refunded') LIMIT 1").get(accountId));

// Whether a code can be used by this account on these lines ([{ group, cents }], after the Pro and renewal discounts), and what it takes off.
// { ok: true, promo (the row), discount (promoDiscount) } or { ok: false, reason, promo? }. Reads only: nothing is reserved here.
export function check(db, account, rawCode, lines, { at = now(), replacing = true } = {}) {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, reason: 'format' };
  const p = byCode(db, code);
  if (!p) return { ok: false, reason: 'unknown' };
  if (!p.active) return { ok: false, reason: 'inactive', promo: p };
  if (p.starts_at && p.starts_at > at) return { ok: false, reason: 'not_started', promo: p };
  if (p.expires_at && p.expires_at <= at) return { ok: false, reason: 'expired', promo: p };
  const uses = usesOf(db, p.id, account.id, replacing ? account.id : null);
  if (p.max_redemptions != null && uses.all >= p.max_redemptions) return { ok: false, reason: 'used_up', promo: p };
  if (uses.mine >= p.per_account_limit) return { ok: false, reason: 'used', promo: p };
  if (p.new_customers_only && isCustomer(db, account.id)) return { ok: false, reason: 'new_customers_only', promo: p };
  const promo = promoOf(p);
  if (!lines.some((l) => promo.groups.includes(l.group) && l.cents > 0)) return { ok: false, reason: 'not_applicable', promo: p };
  const subtotal = lines.reduce((a, l) => a + l.cents, 0);
  if (subtotal < p.min_subtotal_cents) return { ok: false, reason: 'minimum', promo: p };
  const discount = promoDiscount(promo, lines);
  if (!(discount.cents > 0)) return { ok: false, reason: 'not_applicable', promo: p };
  return { ok: true, promo: p, discount };
}

// Failed tries, per account and per network, in memory (one window each; a restart forgets them).
const tries = new WeakMap();
const limitsOf = (env = {}) => ({ max: Number(env.PROMO_TRIES) || 10, windowMs: (Number(env.PROMO_TRY_MINUTES) || 15) * 60000 });
const keysOf = (account, ip) => [`a:${account?.id ?? '-'}`, ...(ip ? [`n:${crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 16)}`] : [])];
function guard(db, keys, env) {
  const { max, windowMs } = limitsOf(env);
  const map = tries.get(db) ?? new Map();
  tries.set(db, map);
  for (const k of keys) {
    const t = map.get(k);
    if (t && now() - t.start > windowMs) map.delete(k);
    else if (t && t.n >= max) {
      const mins = Math.max(1, Math.ceil((t.start + windowMs - now()) / 60000));
      throw Object.assign(new ApiError(429, `Too many code tries. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, 'promo_rate_limited'), { retryAfterMs: t.start + windowMs - now() });
    }
  }
}
function noteFailure(db, keys) {
  const map = tries.get(db) ?? new Map();
  tries.set(db, map);
  for (const k of keys) {
    const t = map.get(k);
    if (t) t.n++;
    else map.set(k, { start: now(), n: 1 });
  }
}

// check() for a checkout or the "Apply" button: rate limited, and a failure is thrown as the error the player sees. ctx: { ip, env, at, replacing }.
export function evaluate(db, account, rawCode, lines, ctx = {}) {
  const keys = keysOf(account, ctx.ip);
  guard(db, keys, ctx.env);
  const r = check(db, account, rawCode, lines, ctx);
  if (r.ok) return r;
  if (isGeneric(r.reason)) noteFailure(db, keys);
  const [status, message, code] = answer(r.reason, r.promo);
  throw Object.assign(new ApiError(status, message, code), { reason: r.reason });
}
// The error a failed check() shows, without counting it (the cart shows a code it can no longer use).
export const messageOf = (r) => answer(r.reason, r.promo)[1];

// POST /promo/check { code, kind }: does this code work for a purchase of this kind (a cart kind: claim, takeover, renew, exterior, stall, launch, pro,
// sponsored)? The page shows what it takes off with business-core promoDiscount, as the server will charge it; checkout checks it again.
export function describe(db, account, body = {}, ctx = {}) {
  requireAccount(account);
  // no kind: a page that sells several things (a business's plans) asks whether the code is good at all; checkout says if it covers what is bought
  const groups = body.kind == null || body.kind === '' ? PROMO_GROUP_IDS : [promoGroupOf(String(body.kind)) ?? fail(400, 'Which purchase is the code for?', 'bad_kind')];
  const cents = Number.isInteger(body.cents) && body.cents > 0 ? body.cents : 100_000_000; // the price the page shows: only to check the minimum, never charged
  const r = evaluate(db, account, body.code, groups.map((group) => ({ group, cents })), ctx);
  return view(r.promo, { public: true });
}

// ---- uses -----------------------------------------------------------------------------------------------------------------------------
export function reserve(db, account, promo, orderId, centsOff) {
  db.prepare("INSERT INTO promo_redemptions (promo_id, code, account_id, order_id, cents_off, status, created_at, updated_at) VALUES (?,?,?,?,?,'reserved',?,?)").run(promo.id, promo.code, account.id, orderId, centsOff, now(), now());
}
const setStatus = (db, orderId, to, from) => db.prepare(`UPDATE promo_redemptions SET status = ?, updated_at = ? WHERE order_id = ? AND status IN (${from.map(() => '?').join(',')})`).run(to, now(), orderId, ...from);
// The payment arrived: the use is redeemed (even after its checkout was given up: the payment is what counts).
export const redeem = (db, orderId) => setStatus(db, orderId, 'redeemed', ['reserved', 'released']);
// The checkout expired, failed or was replaced: the use is free again.
export const release = (db, orderId) => setStatus(db, orderId, 'released', ['reserved']);
// The order was refunded in full: the use is free again, and nothing was discounted after all.
export const voidUse = (db, orderId) => setStatus(db, orderId, 'voided', ['reserved', 'redeemed']);
// One line of a cart refunded: the code took that much less off.
export const reduceUse = (db, parentId, cents) => db.prepare('UPDATE promo_redemptions SET cents_off = MAX(0, cents_off - ?), updated_at = ? WHERE order_id = ?').run(cents, now(), parentId);

// ---- the admin side ---------------------------------------------------------------------------------------------------------------------
const int = (v, { min, max, name, nullable = false }) => {
  if (nullable && (v == null || v === '')) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `${name} must be a whole number from ${min} to ${max}.`, 'bad_promo');
  return n;
};
const time = (v, name) => {
  if (v == null || v === '') return null;
  const t = typeof v === 'number' ? v : Date.parse(String(v));
  if (!Number.isFinite(t) || t <= 0) fail(400, `${name} is not a date.`, 'bad_promo');
  return Math.round(t);
};
const groupsIn = (v) => {
  const list = (Array.isArray(v) ? v : v == null || v === '' ? ['all'] : [v]).map(String);
  if (list.includes('all')) return ['all'];
  const ok = PROMO_GROUP_IDS.filter((g) => list.includes(g));
  if (!ok.length || ok.length !== new Set(list).size) fail(400, `appliesTo must be "all" or some of ${PROMO_GROUP_IDS.join(', ')}.`, 'bad_promo');
  return ok;
};
const actorName = (actor) => (actor.kind === 'account' ? `account:${actor.id}` : actor.kind);

// POST /admin/promos: one code (`code` to choose it, or generated) or `count` generated codes at once, a campaign.
export function createPromos(db, input = {}, actor) {
  const kind = input.kind == null ? 'percent' : PROMO_KINDS.includes(input.kind) ? input.kind : fail(400, 'kind must be percent or amount.', 'bad_promo');
  const value = kind === 'percent' ? int(input.value, { min: 1, max: 100, name: 'A percentage' }) : int(input.value, { min: 1, max: 1_000_000, name: 'An amount in cents' });
  const appliesTo = groupsIn(input.appliesTo);
  const minSubtotal = int(input.minSubtotalCents ?? 0, { min: 0, max: 10_000_000, name: 'The minimum total (cents)' });
  const maxRedemptions = int(input.maxRedemptions, { min: 1, max: 1_000_000, name: 'The total uses', nullable: true });
  const perAccount = int(input.perAccountLimit ?? 1, { min: 1, max: 1000, name: 'The uses per account' });
  const startsAt = time(input.startsAt, 'The start');
  const expiresAt = time(input.expiresAt, 'The end');
  if (startsAt && expiresAt && expiresAt <= startsAt) fail(400, 'The end must be after the start.', 'bad_promo');
  const count = int(input.count ?? 1, { min: 1, max: MAX_BATCH, name: 'The number of codes' });
  const custom = input.code != null && input.code !== '' ? normalizeCode(input.code) || fail(400, 'A code is 3 to 32 letters, digits and dashes, starting with a letter or digit.', 'bad_code') : null;
  if (custom && count > 1) fail(400, 'Choose one code, or a number of generated codes, not both.', 'bad_promo');
  const prefix = input.prefix == null || input.prefix === '' ? 'VV' : /^[A-Z0-9]{1,8}$/i.test(String(input.prefix)) ? String(input.prefix).toUpperCase() : fail(400, 'A prefix is 1 to 8 letters or digits.', 'bad_promo');
  const campaign = text(input.campaign, 60) || (count > 1 ? `batch-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}` : null);
  const note = text(input.note, 200) || null;
  return transaction(db, () => {
    if (custom && byCode(db, custom)) fail(409, 'That code exists already.', 'promo_exists');
    const taken = new Set();
    const ids = [];
    for (let i = 0; i < count; i++) {
      const code = custom ?? generateCode(db, prefix, taken);
      taken.add(code);
      const id = Number(db.prepare('INSERT INTO promo_codes (code, kind, value, applies_to, min_subtotal_cents, max_redemptions, per_account_limit, starts_at, expires_at, new_customers_only, active, campaign, note, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?)').run(code, kind, value, JSON.stringify(appliesTo), minSubtotal, maxRedemptions, perAccount, startsAt, expiresAt, input.newCustomersOnly ? 1 : 0, campaign, note, actorName(actor), now(), now()).lastInsertRowid);
      ids.push(id);
      audit(db, actor, 'promo.create', { kind: 'promo', id: code }, { kind, value, appliesTo, minSubtotalCents: minSubtotal, maxRedemptions, perAccountLimit: perAccount, startsAt, expiresAt, newCustomersOnly: Boolean(input.newCustomersOnly), campaign });
    }
    return { promos: ids.map((id) => view(withUsage(db, row(db, id)))) };
  });
}

// PATCH /admin/promos/:id: the limits, the dates, the minimum, new customers only, the note, active. What a code takes off and what it covers stay
// as made (so every use was priced by the same rule): make a new code instead.
const EDITABLE = { active: 'active', maxRedemptions: 'max_redemptions', perAccountLimit: 'per_account_limit', startsAt: 'starts_at', expiresAt: 'expires_at', minSubtotalCents: 'min_subtotal_cents', newCustomersOnly: 'new_customers_only', note: 'note' };
export function updatePromo(db, id, input = {}, actor) {
  return transaction(db, () => {
    const p = row(db, id) ?? fail(404, 'No such code.', 'no_promo');
    if (['kind', 'value', 'appliesTo', 'code'].some((k) => input[k] !== undefined)) fail(400, 'What a code takes off and what it covers cannot change: make a new code instead.', 'promo_fixed');
    const set = {};
    for (const [k, col] of Object.entries(EDITABLE)) {
      if (input[k] === undefined) continue;
      if (k === 'active' || k === 'newCustomersOnly') set[col] = input[k] ? 1 : 0;
      else if (k === 'maxRedemptions') set[col] = int(input[k], { min: 1, max: 1_000_000, name: 'The total uses', nullable: true });
      else if (k === 'perAccountLimit') set[col] = int(input[k], { min: 1, max: 1000, name: 'The uses per account' });
      else if (k === 'minSubtotalCents') set[col] = int(input[k], { min: 0, max: 10_000_000, name: 'The minimum total (cents)' });
      else if (k === 'note') set[col] = text(input[k], 200) || null;
      else set[col] = time(input[k], k === 'startsAt' ? 'The start' : 'The end');
    }
    if (!Object.keys(set).length) fail(400, 'Nothing to change.', 'bad_promo');
    const starts = set.starts_at !== undefined ? set.starts_at : p.starts_at;
    const ends = set.expires_at !== undefined ? set.expires_at : p.expires_at;
    if (starts && ends && ends <= starts) fail(400, 'The end must be after the start.', 'bad_promo');
    db.prepare(`UPDATE promo_codes SET ${Object.keys(set).map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...Object.values(set), now(), p.id);
    const action = Object.keys(set).length === 1 && set.active !== undefined ? (set.active ? 'promo.reactivate' : 'promo.deactivate') : 'promo.update';
    const changes = Object.fromEntries(Object.keys(set).map((c) => [c, { from: p[c], to: set[c] }]));
    audit(db, actor, action, { kind: 'promo', id: p.code }, changes);
    return { promo: view(withUsage(db, row(db, p.id))) };
  });
}

// The usage of each code: uses redeemed and reserved now, what was taken off (redeemed uses), and what those orders brought in.
const USAGE = `SELECT p.*,
  (SELECT COUNT(*) FROM promo_redemptions r WHERE r.promo_id = p.id AND r.status = 'redeemed') AS redeemed,
  (SELECT COUNT(*) FROM promo_redemptions r WHERE r.promo_id = p.id AND r.status = 'reserved') AS reserved,
  (SELECT COUNT(*) FROM promo_redemptions r WHERE r.promo_id = p.id AND r.status = 'voided') AS voided,
  (SELECT COALESCE(SUM(r.cents_off), 0) FROM promo_redemptions r WHERE r.promo_id = p.id AND r.status = 'redeemed') AS discounted_cents,
  (SELECT COALESCE(SUM(o.cents), 0) FROM promo_redemptions r JOIN orders o ON o.id = r.order_id WHERE r.promo_id = p.id AND r.status = 'redeemed' AND o.status = 'paid') AS revenue_cents
  FROM promo_codes p`;
const withUsage = (db, p) => db.prepare(`${USAGE} WHERE p.id = ?`).get(p.id);
export const statusOf = (p, at = now()) => (!p.active ? 'inactive' : p.expires_at && p.expires_at <= at ? 'expired' : p.starts_at && p.starts_at > at ? 'scheduled' : p.max_redemptions != null && (p.redeemed ?? 0) + (p.reserved ?? 0) >= p.max_redemptions ? 'used_up' : 'active');
export function view(p, { public: pub = false } = {}) {
  const appliesTo = JSON.parse(p.applies_to);
  const base = { code: p.code, kind: p.kind, value: p.value, label: promoLabel(p), appliesTo, groups: groupsOf(appliesTo), minSubtotalCents: p.min_subtotal_cents, expiresAt: p.expires_at ?? null };
  if (pub) return base;
  return {
    id: p.id,
    ...base,
    maxRedemptions: p.max_redemptions ?? null,
    perAccountLimit: p.per_account_limit,
    startsAt: p.starts_at ?? null,
    newCustomersOnly: Boolean(p.new_customers_only),
    active: Boolean(p.active),
    status: statusOf(p),
    campaign: p.campaign ?? null,
    note: p.note ?? null,
    createdBy: p.created_by,
    createdAt: p.created_at,
    usage: { redeemed: p.redeemed ?? 0, reserved: p.reserved ?? 0, voided: p.voided ?? 0, discountedCents: p.discounted_cents ?? 0, revenueCents: p.revenue_cents ?? 0 },
  };
}

// GET /admin/promos?status=&q=&group=&campaign=: the codes, newest first, with their usage.
export function listPromos(db, { status, q, group, campaign } = {}) {
  const where = [];
  const args = [];
  if (q) (where.push('(p.code LIKE ? OR p.note LIKE ? OR p.campaign LIKE ?)'), args.push(...Array(3).fill(`%${String(q).slice(0, 60)}%`)));
  if (campaign) (where.push('p.campaign = ?'), args.push(String(campaign)));
  let rows = db.prepare(`${USAGE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.id DESC LIMIT 2000`).all(...args).map((p) => view(p));
  if (status && status !== 'all') rows = rows.filter((p) => p.status === status);
  if (group) rows = rows.filter((p) => p.groups.includes(String(group)));
  return { promos: rows };
}

// GET /admin/promos/:id: one code and every use of it.
export function promoDetail(db, id) {
  const p = row(db, id) ?? fail(404, 'No such code.', 'no_promo');
  const uses = db.prepare('SELECT r.*, a.username, o.product, o.label, o.cents AS order_cents, o.status AS order_status FROM promo_redemptions r JOIN accounts a ON a.id = r.account_id JOIN orders o ON o.id = r.order_id WHERE r.promo_id = ? ORDER BY r.id DESC LIMIT 1000').all(p.id);
  return {
    promo: view(withUsage(db, p)),
    redemptions: uses.map((r) => ({ id: r.id, accountId: r.account_id, username: r.username, orderId: r.order_id, product: r.product, label: r.label, orderCents: r.order_cents, orderStatus: r.order_status, centsOff: r.cents_off, status: r.status, at: r.created_at, updatedAt: r.updated_at })),
  };
}

// GET /admin/promos.csv: the same list as a spreadsheet.
export function promosCsv(db, filters = {}) {
  const day = (t) => (t ? new Date(t).toISOString() : '');
  const head = ['code', 'kind', 'value', 'applies_to', 'min_subtotal_cents', 'max_redemptions', 'per_account_limit', 'starts_at', 'expires_at', 'new_customers_only', 'status', 'campaign', 'note', 'created_by', 'created_at', 'redeemed', 'reserved', 'voided', 'discounted_cents', 'revenue_cents'];
  const rows = listPromos(db, filters).promos.map((p) => [p.code, p.kind, p.value, p.appliesTo.join(' '), p.minSubtotalCents, p.maxRedemptions ?? '', p.perAccountLimit, day(p.startsAt), day(p.expiresAt), p.newCustomersOnly ? 1 : 0, p.status, p.campaign ?? '', p.note ?? '', p.createdBy, day(p.createdAt), p.usage.redeemed, p.usage.reserved, p.usage.voided, p.usage.discountedCents, p.usage.revenueCents]);
  return { __raw: { type: 'text/csv; charset=utf-8', filename: `promo-codes-${new Date().toISOString().slice(0, 10)}.csv`, body: `${csvRows([head, ...rows])}\r\n` } };
}
