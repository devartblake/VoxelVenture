import { transaction } from './db.mjs';
import { imp } from '../../scripts/lib-loader.mjs';

// The clean-up jobs: personal data is kept only as long as the data retention policy says (/legal/retention, docs/monetization/policy_review.md
// gap 7). The periods are lib/legal/retention.js RETENTION, the same object the policy quotes, so the two cannot drift apart. server.mjs runs
// pruneAll every hour.
//
//   sessions         a sign-in row is deleted a day after it stopped working
//   outbox           a sent or failed email's text (and its error) is wiped after 30 days; the send record (to, kind, subject, when) after 13 months
//   events           visits and clicks on buildings, ad views and clicks, profile events and stall visits carry a visitor number and a scrambled
//   ad_events        network: after 13 months they are deleted, and first added to daily_counts (per day, per building / ad space / business /
//   business_events  stall booking and kind: numbers only), so every all-time count (countKept) stays the same
//   market_visits
//   arrivals         the country list of arrivals: deleted after 30 days, its daily count kept in daily_counts
//   coupon_claims    the visitor number on a claim is removed after 13 months (the claim stays: it counts against the coupon's stock)
//   leads            a sign-up never confirmed is deleted after 30 days; one that unsubscribed, 30 days after it did
//   social_posts     a welcome post that was never posted (rejected, failed, skipped): its text, with the X handle, is wiped after 90 days
//
// Every job works in batches (BATCH rows, each batch its own short transaction, at most MAX_BATCHES a run), so a large backlog (the first run
// on a database that kept everything) is worked off over a few hours without holding the database for long.
const { RETENTION } = await imp('legal/retention.js');
export { RETENTION };
const DAY = 86400000;
export const BATCH = 2000;
export const MAX_BATCHES = 25;
export const WIPED = '(removed: emails are kept only so long)';
export const POST_WIPED = '(removed: this post was never posted)';

// A cut-off on a UTC day boundary: a day's rows are rolled up together, so each daily total is whole.
const dayStart = (t) => Math.floor(t / DAY) * DAY;

// Runs step(limit) in batches until it does less than a full batch (or MAX_BATCHES ran). Returns how many rows it touched.
function inBatches(db, step, { batch = BATCH, maxBatches = MAX_BATCHES } = {}) {
  let total = 0;
  for (let i = 0; i < maxBatches; i++) {
    const n = transaction(db, () => step(batch));
    total += n;
    if (n < batch) break;
  }
  return total;
}

// ---- the daily totals ------------------------------------------------------------------------------------------------------------------
// What each raw table rolls up into daily_counts: the target column, the kind, and which rows count (only verified ones count anywhere).
const ROLLUPS = {
  events: { target: 'plot_id', kind: 'kind', counts: 'verified = 1' },
  ad_events: { target: 'slot_id', kind: 'kind', counts: 'verified = 1' },
  business_events: { target: 'business_id', kind: 'kind', counts: 'verified = 1', value: 'value_cents' },
  market_visits: { target: 'booking_id', kind: "'visit'", counts: '1 = 1' },
  arrivals: { target: "''", kind: "'arrival'", counts: '1 = 1' },
};
export const ROLLED_UP = Object.keys(ROLLUPS);

// One batch: the oldest `limit` rows before the cut-off are added to the daily totals, then deleted, in the same transaction.
function rollUp(db, table, cutoff, limit) {
  const r = ROLLUPS[table];
  const upto = db.prepare(`SELECT MAX(rowid) AS id FROM (SELECT rowid FROM ${table} WHERE at < ? ORDER BY rowid LIMIT ?)`).get(cutoff, limit).id;
  if (upto == null) return 0;
  db.prepare(
    `INSERT INTO daily_counts (source, target, kind, day, n, value_cents)
     SELECT '${table}', CAST(${r.target} AS TEXT), ${r.kind}, strftime('%Y-%m-%d', at / 1000, 'unixepoch'), COUNT(*), COALESCE(SUM(${r.value ?? 0}), 0)
     FROM ${table} WHERE at < ? AND rowid <= ? AND ${r.counts} GROUP BY 1, 2, 3, 4
     ON CONFLICT (source, target, kind, day) DO UPDATE SET n = n + excluded.n, value_cents = value_cents + excluded.value_cents`,
  ).run(cutoff, upto);
  return Number(db.prepare(`DELETE FROM ${table} WHERE at < ? AND rowid <= ?`).run(cutoff, upto).changes);
}

// The kept totals of a source, for counts that span all time (or a range of whole days): { kind, target, from, to } narrow it; from / to are
// timestamps (a day is in the range if it starts at or after `from` and before `to`).
function keptWhere({ kind, target, from, to } = {}) {
  const where = ['source = ?'];
  const args = [];
  if (kind != null) where.push('kind = ?'), args.push(String(kind));
  if (target != null) where.push('target = ?'), args.push(String(target));
  if (from != null) where.push('day >= ?'), args.push(new Date(dayStart(from)).toISOString().slice(0, 10));
  if (to != null) where.push('day < ?'), args.push(new Date(dayStart(to + DAY - 1)).toISOString().slice(0, 10));
  return { where: where.join(' AND '), args };
}
export function countKept(db, source, opts = {}) {
  const { where, args } = keptWhere(opts);
  return db.prepare(`SELECT COALESCE(SUM(n), 0) AS n FROM daily_counts WHERE ${where}`).get(source, ...args).n;
}
// The same, per target: a Map of target (as stored: text) to its kept total.
export function keptByTarget(db, source, opts = {}) {
  const { where, args } = keptWhere(opts);
  return new Map(db.prepare(`SELECT target, SUM(n) AS n FROM daily_counts WHERE ${where} GROUP BY target`).all(source, ...args).map((r) => [r.target, r.n]));
}

// ---- the jobs --------------------------------------------------------------------------------------------------------------------------
export function pruneSessions(db, at = Date.now(), opts) {
  return inBatches(db, (n) => Number(db.prepare('DELETE FROM sessions WHERE rowid IN (SELECT rowid FROM sessions WHERE expires_at < ? LIMIT ?)').run(at - RETENTION.expiredSessionDays * DAY, n).changes), opts);
}

export function pruneOutbox(db, at = Date.now(), opts) {
  const wiped = inBatches(db, (n) => Number(db.prepare("UPDATE outbox SET body = ?, error = NULL, headers = NULL, wiped_at = ? WHERE id IN (SELECT id FROM outbox WHERE wiped_at IS NULL AND created_at < ? AND status != 'pending' ORDER BY created_at LIMIT ?)").run(WIPED, at, at - RETENTION.emailBodyDays * DAY, n).changes), opts);
  const deleted = inBatches(db, (n) => Number(db.prepare("DELETE FROM outbox WHERE id IN (SELECT id FROM outbox WHERE created_at < ? AND status != 'pending' ORDER BY created_at LIMIT ?)").run(at - RETENTION.emailRecordDays * DAY, n).changes), opts);
  return { wiped, deleted };
}

export function pruneEvents(db, at = Date.now(), opts) {
  const out = {};
  for (const table of ROLLED_UP) {
    const days = table === 'arrivals' ? RETENTION.arrivalDays : RETENTION.eventDays;
    out[table] = inBatches(db, (n) => rollUp(db, table, dayStart(at - days * DAY), n), opts);
  }
  return out;
}

export function pruneCouponClaims(db, at = Date.now(), opts) {
  return inBatches(db, (n) => Number(db.prepare("UPDATE coupon_claims SET visitor = 'removed-' || rowid, anonymised = 1 WHERE rowid IN (SELECT rowid FROM coupon_claims WHERE anonymised = 0 AND at < ? LIMIT ?)").run(at - RETENTION.couponClaimDays * DAY, n).changes), opts);
}

export function pruneLeads(db, at = Date.now(), opts) {
  // an unsubscribe from before its date was kept starts its 30 days now
  db.prepare("UPDATE leads SET unsubscribed_at = ? WHERE status = 'unsubscribed' AND unsubscribed_at IS NULL").run(at);
  const pending = inBatches(db, (n) => Number(db.prepare("DELETE FROM leads WHERE id IN (SELECT id FROM leads WHERE status = 'pending' AND created_at < ? LIMIT ?)").run(at - RETENTION.leadPendingDays * DAY, n).changes), opts);
  const unsubscribed = inBatches(db, (n) => Number(db.prepare("DELETE FROM leads WHERE id IN (SELECT id FROM leads WHERE status = 'unsubscribed' AND unsubscribed_at < ? LIMIT ?)").run(at - RETENTION.leadUnsubscribedDays * DAY, n).changes), opts);
  return { pending, unsubscribed };
}

export function pruneSocialPosts(db, at = Date.now(), opts) {
  return inBatches(db, (n) => Number(db.prepare("UPDATE social_posts SET text = ?, error = NULL WHERE id IN (SELECT id FROM social_posts WHERE status IN ('rejected', 'failed', 'skipped') AND text != ? AND COALESCE(decided_at, created_at) < ? LIMIT ?)").run(POST_WIPED, POST_WIPED, at - RETENTION.socialUnpostedDays * DAY, n).changes), opts);
}

// All of them (the hourly job). One failing does not stop the others; its error is passed to onError.
export function pruneAll(db, at = Date.now(), { onError = () => {}, ...opts } = {}) {
  const out = {};
  for (const [name, job] of Object.entries({ sessions: pruneSessions, outbox: pruneOutbox, events: pruneEvents, couponClaims: pruneCouponClaims, leads: pruneLeads, socialPosts: pruneSocialPosts })) {
    try {
      out[name] = job(db, at, opts);
    } catch (e) {
      onError(name, e);
    }
  }
  return out;
}
