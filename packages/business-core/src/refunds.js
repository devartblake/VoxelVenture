// Refunds of unused time, pro rata (docs/monetization/billing.md#refunds-of-unused-time): what is given back for one paid order line when an account
// is deleted (services/api/privacy.mjs) or an admin refunds unused time (services/api/prorata.mjs). Pure: the server gathers each line's facts
// (what was paid for it, the time it paid for, its dispute) and this decides.
//
//   plot lease (claim, take-over, renewal)   unused full days ÷ the term's days × what was paid for the line (a renewal not started yet: all of it)
//   ad space week, sponsored week            unused full days ÷ 7 × what was paid (a booking not started yet: all of it)
//   Pro (monthly)                            unused full days of the period paid now ÷ the days in that period × what was paid for that period
//   market stall not opened yet              all of what was paid
//   nothing back                             the Launch Pack and building upgrades (delivered at once), a stall that has opened, a free or
//                                            complimentary order, one already refunded (in full, or already for its unused time), one whose
//                                            payment is disputed or was charged back, and anything of an account closed for breaking the rules
//
// "What was paid" is what the line was charged (after a promo code and the Pro price) less what was refunded of it already: never more than is left.
// Amounts are rounded down to the cent, and a line that would give back less than PRORATA.minCents gives nothing. Stripe keeps its fee: nothing is
// taken off the customer's refund for it.
import { AD_SPACES, DAY_MS, PRODUCTS } from './plans.js';

export const PRORATA = {
  minCents: 100, // a line that would give back less than $1.00 gives nothing
  weekDays: PRODUCTS.sponsored.days, // an ad space and a sponsored placement are sold by the week (7 days)
  adDays: AD_SPACES.billboard.days,
  stripeFeeDeducted: false, // Stripe keeps its fee; the customer gets the whole amount computed
};

// The kinds of line: what the server calls each paid order line it hands in.
export const PRORATA_KINDS = ['lease', 'renewal', 'exterior', 'ad', 'sponsored', 'pro', 'market', 'launch'];

const DELIVERED = { launch: 'the Launch Pack is delivered at once', exterior: 'a building upgrade is delivered at once' };

// One line. `line`: { id, kind, status ('paid', 'refunded', 'charged_back', ...), cents (charged for the line; Pro: for the period paid now),
// refundedCents (of that), start, end (the time the line paid for, ms; null: nothing running any more), termDays, dispute (null | 'open' | 'won' |
// 'lost'), proRataDone (already refunded for its unused time) }. Returns { id, kind, paidCents, unusedDays, termDays, notStarted, cents, refund, why }:
// `cents` is what goes back (0 with `why` when nothing does).
export function prorataLine(line, { at = Date.now(), closedForRules = false } = {}) {
  const paidCents = Math.max(0, Math.round(Number(line.cents) || 0) - Math.max(0, Math.round(Number(line.refundedCents) || 0)));
  const termDays = line.termDays ?? null;
  const base = { id: line.id, kind: line.kind, paidCents, unusedDays: 0, termDays, notStarted: false, cents: 0, refund: false };
  const no = (why, extra = {}) => ({ ...base, ...extra, why });
  if (closedForRules) return no('the account was closed for breaking the rules');
  if (line.status === 'refunded') return no('already refunded');
  if (line.status === 'charged_back' || line.dispute === 'lost') return no('charged back: the bank took the payment back');
  if (line.status !== 'paid') return no(`the order is ${line.status}`);
  if (line.dispute === 'open') return no('its payment is disputed');
  if (DELIVERED[line.kind]) return no(DELIVERED[line.kind]);
  if (!PRORATA_KINDS.includes(line.kind)) return no('not refundable for unused time');
  if (!(Number(line.cents) > 0)) return no('free or complimentary');
  if (paidCents <= 0) return no('already refunded in full');
  if (line.proRataDone) return no('already refunded for its unused time');
  const notStarted = line.start != null && line.start > at;
  if (line.kind === 'market') {
    if (!notStarted || line.end == null) return no('the stall has opened or is over');
    return finish({ ...base, notStarted: true, unusedDays: null }, paidCents);
  }
  if (line.end == null || line.start == null || !(line.end > at)) return no('nothing left to use');
  const term = Math.max(1, Math.round(Number(termDays) || 0));
  const unusedDays = Math.min(term, Math.floor((line.end - Math.max(at, line.start)) / DAY_MS));
  if (unusedDays <= 0) return no('less than a full day left', { notStarted });
  return finish({ ...base, termDays: term, notStarted, unusedDays }, Math.floor((paidCents * unusedDays) / term));
}
function finish(out, cents) {
  if (cents < PRORATA.minCents) return { ...out, why: `under the $${(PRORATA.minCents / 100).toFixed(2)} minimum` };
  return { ...out, cents, refund: true, why: null };
}

// Every line, and what goes back in all.
export function prorataPlan(lines, opts = {}) {
  const out = lines.map((l) => prorataLine(l, opts));
  return { lines: out, totalCents: out.reduce((a, l) => a + l.cents, 0), count: out.filter((l) => l.refund).length };
}

// The paid period of a monthly plan that ends at `end`: a calendar month before it (not before the plan started). { start, days }.
export function monthPeriod(end, startedAt = null) {
  const d = new Date(end);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const start = Math.max(d.getTime(), startedAt ?? -Infinity);
  return { start, days: Math.max(1, Math.round((end - start) / DAY_MS)) };
}
