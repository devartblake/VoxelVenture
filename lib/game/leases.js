// Leaseholds: a plot is rented for a fixed term, not owned until someone pays more. Pure, so the server and the game agree.
//
//   A tenant chooses 3, 6 or 12 months (90, 182 or 365 days). The price is the plot's price for a year times the term's factor: 3 months cost half a year,
//   6 months three quarters (a shorter lease costs more per day, as a short let does).
//   While the lease runs nobody can take the business over. The last 14 days are the renewal window and the 7 days after the end are a grace week:
//   in both only the tenant can renew (the right of first refusal). After that the plot is open to a buyout, as before.
//   A business the city started with has no lease; it can be taken over, and the new tenant gets a lease.
export const DAY_MS = 86400000;
export const TERMS = [
  { days: 90, factor: 0.5, label: '3 months' },
  { days: 182, factor: 0.75, label: '6 months' },
  { days: 365, factor: 1, label: '12 months' },
];
export const DEFAULT_TERM = 365;
export const RENEWAL_WINDOW_DAYS = 14;
export const GRACE_DAYS = 7;
export const RENEWAL_DISCOUNT = 0.5; // a renewal costs half of what a new lease would

export const termOf = (days) => TERMS.find((t) => t.days === Number(days)) ?? null;
// The term a stored lease carries on with when it is renewed without choosing one: its own, if it is still offered; a lease from before the terms
// changed (30 days) moves to the shortest term at least as long (3 months); none at all is a year.
export function termFor(days) {
  if (days == null || !(Number(days) > 0)) return DEFAULT_TERM;
  return termOf(days)?.days ?? TERMS.find((t) => t.days >= Number(days))?.days ?? DEFAULT_TERM;
}
// A term's name ("6 months"), or the days of one that is no longer offered ("30 days").
export const termLabel = (days) => termOf(days)?.label ?? `${days} days`;
const cents = (n) => Math.round(n * 100) / 100;
// What a lease of `days` costs, from the plot's price for a full year (lib/game/claimPrice.js works that out: the land, the outside, a take-over's 25%).
export const termPrice = (yearPrice, days) => cents(yearPrice * (termOf(days)?.factor ?? 1));
// A renewal: half of what a new lease of the same plot for the same term costs.
export const renewalPrice = (yearPrice, days) => cents(termPrice(yearPrice, days) * RENEWAL_DISCOUNT);

// 'none' (no lease), 'active', 'renewal' (last 14 days), 'grace' (7 days after the end), 'open' (anyone may take it over)
export function leaseState(end, now = Date.now()) {
  if (!end) return 'none';
  if (now < end - RENEWAL_WINDOW_DAYS * DAY_MS) return 'active';
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
  const state = leaseState(end, now);
  if (state === 'none') return { state, text: 'No lease: this business can be taken over.' };
  const left = daysLeft(end, now);
  if (state === 'active') return { state, text: `Leased for ${term ? termLabel(term) : '? days'}. ${left} days left; nobody can take it over.` };
  if (state === 'renewal') return { state, text: `The lease ends in ${left} day${left === 1 ? '' : 's'}. The tenant can renew now; nobody else can take it over.` };
  if (state === 'grace') return { state, text: 'The lease has ended. The tenant has a week to renew before it opens to a buyout.' };
  return { state, text: 'The lease has ended and the plot is open to a buyout.' };
}
