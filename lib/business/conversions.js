// Conversion measurement (phase 5 of docs/claimavenue_competitive_alignment_review.md, docs/conversions.md): the journey from being seen to
// a verified result, what counts as a result, and what a result cost. Pure, shared by the server and the pages.
//
//   impression -> view -> qualified visit -> (store entry) -> call to action -> result
//
// Results (conversions): a confirmed newsletter sign-up, a meeting request, a quote request, a coupon claimed, a coupon redeemed, and an
// attributed purchase. Every one is verified the same way as views: no bots, no owner's own, caps per network.

export const QUALIFIED_AFTER_MS = 15000; // a visit becomes qualified after 15 seconds on the page (a glance is not interest)
export const CLICK_PARAM = 'vv_click'; // added to the call to action's link so a purchase can be credited to the press that led to it
export const ATTRIBUTION_DAYS = 30; // a purchase is credited to a press of the button up to 30 days before it

// The steps of the funnel, in order, as the owner's dashboard shows them. `of`: the step each is a share of (a store entry, a press or a
// result does not need the step above it, so everything after a visit is a share of the visits).
export const FUNNEL = [
  { id: 'impressions', label: 'Seen in lists', hint: 'Your card was on screen on Discover, a category or a district page.' },
  { id: 'views', label: 'Profile visits', of: 'impressions' },
  { id: 'qualified', label: 'Qualified visits', hint: 'Stayed at least 15 seconds.', of: 'views' },
  { id: 'storeEntries', label: 'Store entries', hint: 'Walked into your 3D storefront.', of: 'views' },
  { id: 'ctaClicks', label: 'Button presses', of: 'views' },
  { id: 'conversions', label: 'Results', hint: 'Sign-ups, requests, coupons and purchases.', of: 'views' },
];

// The kinds of result, and how each is labelled.
export const RESULTS = [
  { id: 'newsletterSignups', label: 'Newsletter sign-ups' },
  { id: 'meetingRequests', label: 'Meeting requests' },
  { id: 'quoteRequests', label: 'Quote requests' },
  { id: 'couponClaims', label: 'Coupons claimed' },
  { id: 'couponRedemptions', label: 'Coupons redeemed' },
  { id: 'purchases', label: 'Purchases' },
];
export const conversionsOf = (stats) => RESULTS.reduce((n, r) => n + (stats?.[r.id] ?? 0), 0);

// What one result cost: the money spent on the profile in the period over its results. null when nothing was spent or nothing came of it.
export function costPerResult(spendCents, conversions) {
  if (!spendCents || !conversions) return null;
  return Math.round(spendCents / conversions);
}

// A click id: made in the browser when the button is pressed, sent with the press and added to the link.
export const isClickId = (v) => /^[A-Za-z0-9]{10,32}$/.test(String(v ?? ''));
export function newClickId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}
// The call to action's link with the click id added (an https link only; anything else is left alone).
export function withClickId(url, clickId) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !isClickId(clickId)) return url;
    u.searchParams.set(CLICK_PARAM, clickId);
    return u.toString();
  } catch {
    return url;
  }
}

// A coupon ticket: one per claim, so the owner can mark exactly that claim redeemed at the till ("CAKE-1 #7KQ2").
export const isTicket = (v) => /^[A-Z0-9]{4,8}$/.test(String(v ?? ''));
