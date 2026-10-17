// Conversion measurement (phase 5 of docs/claimavenue_competitive_alignment_review.md, docs/conversions.md): the journey from being seen to
// a verified result, what counts as a result, and what a result cost. Pure, shared by the server and the pages.
//
//   impression -> view -> qualified visit -> (store entry) -> call to action -> result
//
// Outcomes are reported in separate families, never summed into one "results" count: one customer can sign up, ask for a quote, claim a
// coupon and buy, and a single total would count them several times and make "cost per result" meaningless
// (docs/voxelventure_core_concept_reassessment_2026-10-17.md). Each family has its own cost: per lead, per claim, per redeemed coupon, per
// acquisition; and verified revenue gives the return on what was spent. Every outcome is verified the same way as views: no bots, no
// owner's own, caps per network.

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
];

// The kinds of outcome, and how each is labelled.
export const RESULTS = [
  { id: 'newsletterSignups', label: 'Newsletter sign-ups' },
  { id: 'meetingRequests', label: 'Meeting requests' },
  { id: 'quoteRequests', label: 'Quote requests' },
  { id: 'couponClaims', label: 'Coupons claimed' },
  { id: 'couponRedemptions', label: 'Coupons redeemed' },
  { id: 'purchases', label: 'Purchases' },
];

// The outcome families: different stages of the funnel, each counted and costed on its own.
export const OUTCOMES = [
  { id: 'leads', label: 'Leads', of: ['newsletterSignups', 'meetingRequests', 'quoteRequests'], cost: 'Cost per lead', hint: 'Newsletter sign-ups, meeting and quote requests.' },
  { id: 'claims', label: 'Coupon claims', of: ['couponClaims'], cost: 'Cost per claim', hint: 'Intent: someone took your coupon.' },
  { id: 'redemptions', label: 'Coupons redeemed', of: ['couponRedemptions'], cost: 'Cost per redeemed coupon', hint: 'Offline sales: a coupon used at your till.' },
  { id: 'purchases', label: 'Purchases', of: ['purchases'], cost: 'Cost per acquisition', hint: 'Online sales your site reported from its server, credited to a press of your button.' },
];

// What one thing cost: the money spent on the profile in the period over how many there were. null when nothing was spent or nothing came of it.
export function costPer(spendCents, count) {
  if (!spendCents || !count) return null;
  return Math.round(spendCents / count);
}

// Each family's count and cost: [{ id, label, cost, hint, count, costCents }].
export const outcomesOf = (stats, spendCents = stats?.spendCents ?? 0) =>
  OUTCOMES.map((o) => {
    const count = o.of.reduce((n, k) => n + (stats?.[k] ?? 0), 0);
    return { ...o, count, costCents: costPer(spendCents, count) };
  });

// Return on ad spend: verified revenue for each unit spent (2.5 = $2.50 back per $1). Only verified revenue counts. null without spend.
export function returnOnSpend(verifiedRevenueCents, spendCents) {
  if (!spendCents) return null;
  return Math.round((verifiedRevenueCents / spendCents) * 100) / 100;
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
