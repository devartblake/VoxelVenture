// What VoxelVenture sells (phase 4 of docs/competitive-research/claimavenue_competitive_alignment_review.md, docs/monetization/billing.md): the low-risk ladder of a
// one-off Launch Pack, a monthly Pro plan and fixed-term sponsored placements, all for one business profile. Prices are in US cents
// and are only ever read here: the server charges these amounts whatever a browser sends. Pure, shared by the server and the pages.
//
// Not sold, on purpose: Gold (the game's currency stays a game reward, never bought with money) and real-money take-over payouts (the
// 1.25x rule needs a legal, tax and fraud review first).

export const DAY_MS = 86400000;

// An account with Pro on any of its business profiles pays this share less in the 3D city: for a plot lease (a claim, a take-over and a renewal; not
// outside upgrades) and for an ad space (a billboard or an aerial banner, AD_SPACES below). Not for the other products. One value for both:
// lib/game/leases.js applies it to leases (as PRO_PLOT_DISCOUNT, the same constant), adPriceOf to ad spaces; the server decides who has Pro
// (services/api/core.mjs hasPro).
export const PRO_DISCOUNT = 0.15;
export const PRO_PLOT_DISCOUNT = PRO_DISCOUNT;

// The cart (services/api/cart.mjs, docs/monetization/billing.md#the-cart): several purchases in one payment, so Stripe's 30¢ a payment is paid once.
// At most `maxPlots` plot lines (a claim, take-over, renewal or outside upgrade; each plot once), Pro at most once, at most `maxLines` lines in all,
// and a checkout of at least `minimumCents` (so the fee stays near 10% or less). "Buy now" on a single item is not a cart and has no minimum.
export const CART = { minimumCents: 400, maxPlots: 3, maxLines: 10, feeCents: 30 };

export const PRODUCTS = {
  launch: {
    id: 'launch',
    name: 'Launch Pack',
    mode: 'payment', // one-off
    cents: 900,
    days: 7,
    pitch: 'A week in "New this week" at the top of Discover, a highlighted card with a Launch badge, a launch-week share image and a summary of the week.',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    mode: 'subscription',
    cents: 1900,
    interval: 'month',
    pitch: `Where visitors came from, campaign results, the 30-day chart, CSV export of your figures, an offer at the top of your page and ${Math.round(PRO_DISCOUNT * 100)}% off plot leases and ad spaces in the 3D city.`,
  },
  sponsored: {
    id: 'sponsored',
    name: 'Sponsored placement',
    mode: 'payment',
    days: 7,
    pitch: 'A clearly labelled "Sponsored" spot for a week on Discover, a category page or a district page.',
  },
};

// Where a sponsored placement can go, what a week costs, and how many share the spot at once (so "sponsored" stays a few labelled
// cards, never the whole page).
export const PLACEMENTS = {
  discover: { label: 'Top of Discover', cents: 9900, slots: 3 },
  category: { label: 'A category page', cents: 2900, slots: 3 },
  district: { label: 'A district page', cents: 4900, slots: 3 },
};
// A placement key names the exact spot: 'discover', 'category:food', 'district:saas'.
export function placementOf(key) {
  const [kind, target] = String(key ?? '').split(':');
  const p = PLACEMENTS[kind];
  if (!p) return null;
  if (kind === 'discover') return target ? null : { key: 'discover', kind, target: null, ...p };
  return /^[a-z0-9-]{1,40}$/.test(target ?? '') ? { key: `${kind}:${target}`, kind, target, ...p } : null;
}

// Ad spaces in the 3D city (services/api/core.mjs ad slots, docs/monetization/billing.md#ad-spaces): the billboards beside the arterial avenues and the
// banners the two planes tow over the city. With payments on, a space is booked for `days` at a time at this price (one advertiser has the whole
// screen; others can book it once the time ends, the holder can add weeks), less PRO_DISCOUNT for an account with Pro. Without payments they stay the
// game's free take-over (1.25 times the game value). Why these levels: docs/monetization/billing.md#ad-spaces.
export const AD_SPACES = {
  billboard: { label: 'Billboard', cents: 1200, days: 7 },
  banner: { label: 'Aerial banner', cents: 2900, days: 7 },
};
// What booking an ad space of this kind ('billboard' | 'banner') costs, in cents, with or without Pro. null for anything else.
export function adPriceOf(kind, { pro = false } = {}) {
  const a = AD_SPACES[kind];
  if (!a) return null;
  return pro ? Math.round(a.cents * (1 - PRO_DISCOUNT)) : a.cents;
}

// The price of an order, from the catalogue only. null for anything not for sale.
export function priceOf(product, placementKey) {
  if (product === 'launch' || product === 'pro') return PRODUCTS[product].cents;
  if (product === 'sponsored') return placementOf(placementKey)?.cents ?? null;
  return null;
}

export const dollars = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
export const priceLabel = (product) =>
  product === 'pro' ? `${dollars(PRODUCTS.pro.cents)} a month` : product === 'launch' ? `${dollars(PRODUCTS.launch.cents)} once` : `${dollars(Math.min(...Object.values(PLACEMENTS).map((p) => p.cents)))} to ${dollars(Math.max(...Object.values(PLACEMENTS).map((p) => p.cents)))} a week`;

// What a profile has paid for, from its entitlement rows ({ kind, placement, starts_at, ends_at, status }), at a moment.
export function planOf(entitlements, at = Date.now()) {
  const live = (entitlements ?? []).filter((e) => e.status === 'active' && e.starts_at <= at && e.ends_at > at);
  const pro = live.find((e) => e.kind === 'pro');
  const launch = live.find((e) => e.kind === 'launch');
  return {
    pro: Boolean(pro),
    proUntil: pro?.ends_at ?? null,
    launch: Boolean(launch),
    launchUntil: launch?.ends_at ?? null,
    sponsored: live.filter((e) => e.kind === 'sponsored').map((e) => ({ placement: e.placement, until: e.ends_at })),
  };
}

// The figures a free profile sees, and the ones Pro adds (the server leaves the Pro ones out unless the plan includes them).
export const PRO_FIELDS = ['sources', 'campaigns', 'days'];
export function figuresFor(stats, plan) {
  if (!stats || plan?.pro) return stats;
  const out = { ...stats, pro: false };
  for (const k of PRO_FIELDS) delete out[k];
  return out;
}
