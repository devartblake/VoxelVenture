// What VoxelVenture sells (phase 4 of docs/claimavenue_competitive_alignment_review.md, docs/billing.md): the low-risk ladder of a
// one-off Launch Pack, a monthly Pro plan and fixed-term sponsored placements, all for one business profile. Prices are in US cents
// and are only ever read here: the server charges these amounts whatever a browser sends. Pure, shared by the server and the pages.
//
// Not sold, on purpose: Gold (the game's currency stays a game reward, never bought with money) and real-money take-over payouts (the
// 1.25x rule needs a legal, tax and fraud review first).

export const DAY_MS = 86400000;

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
    pitch: 'Where visitors came from, campaign results, the 30-day chart and CSV export of your figures.',
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
