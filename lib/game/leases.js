// Leaseholds: a plot is rented for a fixed term, not owned until someone pays more. Pure, so the server and the game agree.
//
//   A tenant chooses 30, 90 or 365 days. The price is the plot's price times the term's factor (a shorter lease costs less).
//   While the lease runs nobody can take the business over. The last 14 days are the renewal window and the 7 days after the end are a grace week:
//   in both only the tenant can renew (the right of first refusal). After that the plot is open to a buyout, as before.
//   A business the city started with has no lease; it can be taken over, and the new tenant gets a lease.
export const DAY_MS = 86400000;
export const TERMS = [
  { days: 30, factor: 0.2, label: '30 days' },
  { days: 90, factor: 0.5, label: '90 days' },
  { days: 365, factor: 1, label: '365 days' },
];
export const DEFAULT_TERM = 365;
export const RENEWAL_WINDOW_DAYS = 14;
export const GRACE_DAYS = 7;
export const RENEWAL_DISCOUNT = 0.5; // a renewal costs half of what a new lease would

export const termOf = (days) => TERMS.find((t) => t.days === Number(days)) ?? null;
export const leasePrice = (value, days, multiplier = 1.25) => Math.round(value * multiplier * (termOf(days)?.factor ?? 1));
// (a renewal is priced on the plot's current value, which already includes the 25%)
export const renewalPrice = (value, days) => Math.round(value * (termOf(days)?.factor ?? 1) * RENEWAL_DISCOUNT);

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
  if (state === 'active') return { state, text: `Leased for ${term ?? '?'} days. ${left} days left; nobody can take it over.` };
  if (state === 'renewal') return { state, text: `The lease ends in ${left} day${left === 1 ? '' : 's'}. The tenant can renew now; nobody else can take it over.` };
  if (state === 'grace') return { state, text: 'The lease has ended. The tenant has a week to renew before it opens to a buyout.' };
  return { state, text: 'The lease has ended and the plot is open to a buyout.' };
}
