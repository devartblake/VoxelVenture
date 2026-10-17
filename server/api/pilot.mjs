// The constrained pilot (phase 6; docs/monetization/pilot.md): 10 to 20 businesses for about four weeks, measured week by week.
//
//   members      the admin adds a published business to the pilot (and can take it out again; the record stays)
//   activity     an owner opening their dashboard, or changing their profile, marks that week as one they came back in
//   figures      per business and week: verified views, qualified visits, store entries, button presses, leads (requests and confirmed
//                newsletter sign-ups), coupon claims and redemptions, purchases and verified revenue; and what they paid
//   feedback     each pilot business answers four questions once a week from its dashboard
//   verdict      the criteria that lift the world-expansion freeze (packages/analytics/src/pilot.js), checked on those figures
//
// Every figure here is verified, the same as the owner's own dashboard: nothing is simulated.
import { ApiError, fail, requireAccount, text } from './core.mjs';
import { getRow, ownerView, ownRow, profileStats } from './business.mjs';
import { imp } from '../../scripts/lib-loader.mjs';
import { feedbackView, markOwnerActive, memberStatus } from './ownerActivity.mjs';
import { PILOT_CRITERIA, PILOT_WEEKS, hadInteraction, pilotVerdict, returnedWeekly } from '@voxelventure/analytics';

const { weekStartOf, addWeeks } = await imp('market/weeks.js');
import { onboardingSteps, profileReady } from '@voxelventure/business-core';
const DAY = 86400000;
const WOULD_PAY = ['yes', 'maybe', 'no'];
const weekStart = (week) => Date.parse(`${week}T00:00:00Z`);
const now = () => Date.now();

// ---- members --------------------------------------------------------------------------------------------------------------------
export function addMember(db, slug, { note } = {}, at = now()) {
  const row = getRow(db, slug);
  db.prepare('INSERT INTO pilot_members (business_id, joined_at, note) VALUES (?, ?, ?) ON CONFLICT (business_id) DO UPDATE SET left_at = NULL, note = COALESCE(excluded.note, note)').run(row.id, at, note ? text(note, 300) : null);
  return { slug: row.slug, member: true };
}
export function removeMember(db, slug, at = now()) {
  const row = getRow(db, slug);
  const r = db.prepare('UPDATE pilot_members SET left_at = ? WHERE business_id = ? AND left_at IS NULL').run(at, row.id);
  if (!r.changes) fail(404, 'That business is not in the pilot.', 'not_member');
  return { slug: row.slug, member: false };
}
const memberRow = (db, businessId) => db.prepare('SELECT * FROM pilot_members WHERE business_id = ? AND left_at IS NULL').get(businessId);

// ---- feedback -------------------------------------------------------------------------------------------------------------------
export function sendFeedback(db, account, slug, input = {}, at = now()) {
  requireAccount(account);
  const row = ownRow(db, account, slug);
  if (!memberRow(db, row.id)) fail(403, 'Weekly feedback is for businesses in the pilot.', 'not_member');
  const rating = Math.round(Number(input.rating));
  const errors = {};
  if (!(rating >= 1 && rating <= 5)) errors.rating = 'Choose 1 to 5.';
  if (!WOULD_PAY.includes(input.wouldPay)) errors.wouldPay = 'Choose yes, maybe or no.';
  if (Object.keys(errors).length) throw new ApiError(400, 'Please check the form.', 'bad_feedback').withErrors(errors);
  const week = weekStartOf(at);
  const result = text(input.result, 500) || null;
  const missing = text(input.missing, 500) || null;
  db.prepare('INSERT INTO pilot_feedback (business_id, account_id, week, rating, result, missing, would_pay, created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (business_id, week) DO UPDATE SET account_id = excluded.account_id, rating = excluded.rating, result = excluded.result, missing = excluded.missing, would_pay = excluded.would_pay, created_at = excluded.created_at')
    .run(row.id, account.id, week, rating, result, missing, input.wouldPay, at);
  markOwnerActive(db, [row.id], at);
  return { week, sent: true, feedback: { rating, result, missing, wouldPay: input.wouldPay } };
}
export { markOwnerActive, memberStatus };

// ---- the figures ----------------------------------------------------------------------------------------------------------------
function weekFigures(db, row, from, to) {
  const n = (sql, ...a) => db.prepare(sql).get(...a).n;
  const ev = (kind) => n('SELECT COUNT(*) AS n FROM business_events WHERE business_id = ? AND kind = ? AND verified = 1 AND at >= ? AND at < ?', row.id, kind, from, to);
  const requests = n('SELECT COUNT(*) AS n FROM business_inquiries WHERE business_id = ? AND verified = 1 AND created_at >= ? AND created_at < ?', row.id, from, to);
  const signups = n("SELECT COUNT(*) AS n FROM leads WHERE target_kind = 'business' AND target_id = ? AND status = 'confirmed' AND confirmed_at >= ? AND confirmed_at < ?", String(row.id), from, to);
  const claims = row.plot_id ? n('SELECT COUNT(*) AS n FROM coupon_claims WHERE plot_id = ? AND at >= ? AND at < ?', row.plot_id, from, to) : 0;
  const redemptions = row.plot_id ? n('SELECT COUNT(*) AS n FROM coupon_claims WHERE plot_id = ? AND redeemed_at >= ? AND redeemed_at < ?', row.plot_id, from, to) : 0;
  const revenue = n("SELECT COALESCE(SUM(value_cents), 0) AS n FROM business_events WHERE business_id = ? AND kind = 'purchase' AND verified = 1 AND COALESCE(report, 'server') = 'server' AND at >= ? AND at < ?", row.id, from, to);
  return {
    views: ev('view'),
    qualified: ev('engaged'),
    storeEntries: ev('store'),
    ctaClicks: ev('cta'),
    leads: requests + signups,
    claims,
    redemptions,
    purchases: ev('purchase'),
    verifiedRevenueCents: revenue,
  };
}
const FIGURES = ['views', 'qualified', 'storeEntries', 'ctaClicks', 'leads', 'claims', 'redemptions', 'purchases', 'verifiedRevenueCents'];

// The dashboard: the last `weeks` weeks (this one included, so far), every business in the pilot (or, with `all`, every published
// business, to try the dashboard before the pilot starts), and the verdict.
export function summary(db, { weeks = PILOT_WEEKS, all = false, at = now() } = {}) {
  const count = Math.max(1, Math.min(12, Math.round(Number(weeks)) || PILOT_WEEKS));
  const current = weekStartOf(at);
  const list = Array.from({ length: count }, (_, i) => addWeeks(current, i - count + 1));
  const from = weekStart(list[0]);
  const rows = all
    ? db.prepare("SELECT b.*, m.joined_at, m.note FROM businesses b LEFT JOIN pilot_members m ON m.business_id = b.id AND m.left_at IS NULL WHERE b.status = 'published' ORDER BY b.id").all()
    : db.prepare("SELECT b.*, m.joined_at, m.note FROM businesses b JOIN pilot_members m ON m.business_id = b.id WHERE m.left_at IS NULL AND b.status = 'published' ORDER BY m.joined_at, b.id").all();
  const businesses = rows.map((row) => {
    const joined = row.joined_at ?? row.created_at;
    const joinWeek = weekStartOf(joined);
    const active = new Set(db.prepare('SELECT week FROM owner_activity WHERE business_id = ? AND week >= ?').all(row.id, list[0]).map((r) => r.week));
    const weekly = list.map((week) => ({ week, member: week >= joinWeek, ownerActive: active.has(week), ...weekFigures(db, row, weekStart(week), weekStart(week) + 7 * DAY) }));
    const totals = Object.fromEntries(FIGURES.map((k) => [k, weekly.reduce((s, w) => s + w[k], 0)]));
    // completed weeks the business was in the pilot for, and how many of them the owner came back in
    const completed = weekly.filter((w) => w.member && w.week < current);
    const activeWeeks = completed.filter((w) => w.ownerActive).length;
    const orders = db.prepare("SELECT product, cents, paid_at, renewals FROM orders WHERE business_id = ? AND status = 'paid' AND cents > 0 AND paid_at >= ? ORDER BY paid_at").all(row.id, from);
    const firstPaid = orders[0]?.paid_at ?? null;
    const askedAgain = firstPaid != null && db.prepare('SELECT COUNT(*) AS n FROM upgrade_interest WHERE business_id = ? AND at > ?').get(row.id, firstPaid).n > 0;
    const profile = ownerView(row);
    const steps = onboardingSteps(profile, profileStats(db, row.id, at));
    const feedback = db.prepare('SELECT * FROM pilot_feedback WHERE business_id = ? AND week >= ? ORDER BY week').all(row.id, list[0]).map(feedbackView);
    return {
      slug: row.slug,
      name: row.name,
      category: row.category,
      district: row.district,
      member: row.joined_at != null,
      joinedAt: row.joined_at ?? null,
      note: row.note ?? null,
      activated: profileReady(steps),
      stepsDone: steps.filter((s) => !s.optional && s.done).length,
      stepsTotal: steps.filter((s) => !s.optional).length,
      weekly,
      totals,
      retention: { activeWeeks, completedWeeks: completed.length },
      returnedWeekly: returnedWeekly(activeWeeks, completed.length),
      interaction: hadInteraction(totals),
      paid: orders.length > 0,
      paidCents: orders.reduce((s, o) => s + o.cents, 0),
      orders: orders.length,
      renewed: orders.some((o) => o.renewals > 0) || orders.length > 1 || askedAgain,
      feedback,
    };
  });
  const verdict = pilotVerdict(businesses, { simulatedShown: false });
  const ratings = businesses.flatMap((b) => b.feedback.map((f) => f.rating));
  return {
    weeks: list,
    currentWeek: current,
    all,
    totals: {
      activated: businesses.filter((b) => b.activated).length,
      ...Object.fromEntries(FIGURES.map((k) => [k, businesses.reduce((s, b) => s + b.totals[k], 0)])),
      paidCents: businesses.reduce((s, b) => s + b.paidCents, 0),
      feedback: ratings.length,
      averageRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    },
    verdict,
    criteria: PILOT_CRITERIA.map(({ id, label, hint }) => ({ id, label, hint })),
    businesses,
  };
}

// The same, as a spreadsheet: one line per business per week.
export function summaryCsv(db, opts = {}) {
  const s = summary(db, opts);
  const cell = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
  const head = ['business', 'name', 'week', 'in_pilot', 'owner_active', ...FIGURES, 'activated', 'returned_weekly', 'paid_cents', 'renewed'];
  const lines = [head.join(',')];
  for (const b of s.businesses) for (const w of b.weekly) lines.push([b.slug, b.name, w.week, w.member ? 1 : 0, w.ownerActive ? 1 : 0, ...FIGURES.map((k) => w[k]), b.activated ? 1 : 0, b.returnedWeekly ? 1 : 0, b.paidCents, b.renewed ? 1 : 0].map(cell).join(','));
  return { __raw: { type: 'text/csv; charset=utf-8', filename: `pilot-${s.currentWeek}.csv`, body: lines.join('\n') + '\n' } };
}
