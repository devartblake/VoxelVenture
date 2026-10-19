// Leaseholds: a plot is rented for a fixed term, not owned until someone pays more. Pure, so the server and the game agree.
//
//   A tenant chooses 7, 14 or 30 days. The price is the plot's price for 30 days times the term's factor: 7 days cost 0.3 of it, 14 days 0.55 (a shorter
//   lease costs a little more per day, as a short let does).
//   While the lease runs nobody can take the business over. Its last days are the renewal window (the last 7 of a 14- or 30-day lease, the last 3 of a
//   7-day one) and the 3 days after the end are the grace days: in both only the tenant can renew (the right of first refusal). After that the plot is
//   open to a buyout, as before. A renewal costs 10% less than a new lease of the same term.
//   A business the city started with has no lease; it can be taken over, and the new tenant gets a lease.
//   An account with Pro (packages/business-core plans.js planOf, on any of its business profiles) pays 15% less for a plot: a claim, a take-over and a
//   renewal (not the outside, not anything else). The server decides who has Pro; these functions only apply the discount.
import { PRO_PLOT_DISCOUNT } from '@voxelventure/business-core';

export const DAY_MS = 86400000;
export const TERMS = [
  { days: 7, factor: 0.3, label: '7 days' },
  { days: 14, factor: 0.55, label: '14 days' },
  { days: 30, factor: 1, label: '30 days' },
];
export const DEFAULT_TERM = 30;
export const PERIOD_DAYS = 30; // a plot's price (its value) is the price of this many days
export const GRACE_DAYS = 3;
export const RENEWAL_DISCOUNT = 0.1; // the share taken OFF a renewal: a renewal costs 90% of a new lease of the same term
export const RENEWAL_SHARE = 1 - RENEWAL_DISCOUNT; // the share of a new lease's price a renewal costs (0.9)
// the share taken off a plot lease (claim, take-over, renewal) for an account with Pro: the plan's own figure, in @voxelventure/business-core
export { PRO_PLOT_DISCOUNT };
export const PRO_DISCOUNT_LABEL = `Pro: ${Math.round(PRO_PLOT_DISCOUNT * 100)}% off`;
export const MIN_LEASE_CHARGE = 0.5; // Stripe's smallest charge in dollars: no lease, take-over or renewal costs less

// The renewal window of a lease of `days`: the last 3 days of a 7-day lease, the last 7 of a longer one.
export const renewalWindowDays = (days) => (Number(days) > 0 && Number(days) <= 7 ? 3 : 7);
export const RENEWAL_WINDOW_DAYS = renewalWindowDays(DEFAULT_TERM); // of the usual term (30 days): 7

export const termOf = (days) => TERMS.find((t) => t.days === Number(days)) ?? null;
// The term a stored lease carries on with when it is renewed without choosing one: its own, if it is still offered; a lease from before the terms
// changed (30 days once, then 90, 182 or 365) and none at all are the default, 30 days.
export function termFor(days) {
  return termOf(days)?.days ?? DEFAULT_TERM;
}
// A term's name ("14 days"), or the days of one that is no longer offered ("90 days").
export const termLabel = (days) => termOf(days)?.label ?? `${days} days`;
// to the cent, half a cent up (1.5 x 0.15 is 0.225 to a person, though 0.22499... to a float)
const cents = (n) => Math.round(Number((n * 100).toFixed(6))) / 100;
// What a lease of `days` costs, from the plot's price for 30 days (lib/game/claimPrice.js works that out: the land, the outside, a take-over's 25%).
export const termPrice = (periodPrice, days) => cents(periodPrice * (termOf(days)?.factor ?? 1));
// A renewal: 90% of what a new lease of the same plot for the same term costs.
export const renewalPrice = (periodPrice, days) => cents(termPrice(periodPrice, days) * RENEWAL_SHARE);
// The Pro discount on a lease price, to the cent (0 without Pro).
export const proDiscount = (price, pro) => (pro ? cents(price * PRO_PLOT_DISCOUNT) : 0);
// What is charged for a lease priced `price` before the Pro discount: less the discount, and never under Stripe's minimum.
export const chargeOf = (price, pro) => Math.max(MIN_LEASE_CHARGE, cents(price - proDiscount(price, pro)));

// 'none' (no lease), 'active', 'renewal' (its last days), 'grace' (3 days after the end), 'open' (anyone may take it over). `days` is the lease's term,
// which sets how long the renewal window is (the last 3 days of a 7-day lease, else 7).
export function leaseState(end, now = Date.now(), days = DEFAULT_TERM) {
  if (!end) return 'none';
  if (now < end - renewalWindowDays(days) * DAY_MS) return 'active';
  if (now < end) return 'renewal';
  if (now < end + GRACE_DAYS * DAY_MS) return 'grace';
  return 'open';
}
// Can someone other than the tenant take the business over now?
export const takeoverAllowed = (end, now = Date.now()) => ['none', 'open'].includes(leaseState(end, now));
export const daysLeft = (end, now = Date.now()) => (end ? Math.ceil((end - now) / DAY_MS) : null);

// The new end of a lease renewed or extended now: from the old end if it is still in the future, otherwise from now.
export const extendedEnd = (end, days, now = Date.now()) => Math.max(end ?? 0, now) + days * DAY_MS;

export function describeLease(end, term, now = Date.now()) {
  const state = leaseState(end, now, term);
  if (state === 'none') return { state, text: 'No lease: this business can be taken over.' };
  const left = daysLeft(end, now);
  if (state === 'active') return { state, text: `Leased for ${term ? termLabel(term) : '? days'}. ${left} days left; nobody can take it over.` };
  if (state === 'renewal') return { state, text: `The lease ends in ${left} day${left === 1 ? '' : 's'}. The tenant can renew now; nobody else can take it over.` };
  if (state === 'grace') return { state, text: `The lease has ended. The tenant has ${GRACE_DAYS} days to renew before it opens to a buyout.` };
  return { state, text: 'The lease has ended and the plot is open to a buyout.' };
}
