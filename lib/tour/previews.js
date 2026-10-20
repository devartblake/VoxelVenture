// What the demo tour shows where a real screen would need an account or would buy something (docs/product/pilot_tour.md): the claim form's lease
// prices, a cart and the owner's figures. Each is worked out from the same price functions the server charges with and has the shape the real screen
// shows, but nothing here is sent anywhere. The sample figures come from the city's seed, so a tour shows the same numbers every time.
// Pure, so it is tested in Node (tests/tour.test.mjs).
import { CART, PRODUCTS, priceOf } from '@voxelventure/business-core';
import { OUTCOME_FAMILIES, TRAFFIC_SOURCES } from '@voxelventure/shared-types';
import { leaseQuote } from '../game/claimPrice';
import { TERMS, PRO_PLOT_DISCOUNT } from '../game/leases';
import { cleanExterior, defaultExterior } from '../game/exterior';

const toCents = (dollars) => Math.round(dollars * 100);

// The claim form's lease terms for a lot, with the basic outside of a shop: [{ days, label, price, proPrice, proOff }] in dollars, without and with Pro.
export function claimTerms(plot, type = 'shop') {
  const config = cleanExterior(defaultExterior(plot, type), plot, type);
  return TERMS.map((t) => {
    const plain = leaseQuote(plot, config, type, t.days, { pro: false });
    const pro = leaseQuote(plot, config, type, t.days, { pro: true });
    return { days: t.days, label: t.label, price: plain.total, proPrice: pro.total, proOff: Math.round(PRO_PLOT_DISCOUNT * 100), lines: plain.lines };
  });
}

// A cart with a 30-day lease of `lot`, Pro for `business` and a sponsored week on Discover, priced as services/api/cart.mjs prices it (Pro in the
// cart gives the plot line its discount): the fields of the `cart.view` contract the cart page shows.
export function sampleCart(lot, businessName, type = 'shop') {
  const config = cleanExterior(defaultExterior(lot, type), lot, type);
  const full = toCents(leaseQuote(lot, config, type, 30, { pro: false }).total);
  const withPro = toCents(leaseQuote(lot, config, type, 30, { pro: true }).total);
  const items = [
    { id: 1, kind: 'claim', label: `Lease: your business (plot ${lot.id}, 30 days)`, cents: withPro, discountCents: Math.max(0, full - withPro) },
    { id: 2, kind: 'pro', label: `${PRODUCTS.pro.name} for ${businessName}, monthly`, cents: priceOf('pro'), discountCents: 0 },
    { id: 3, kind: 'sponsored', label: `${PRODUCTS.sponsored.name} (Discover) for ${businessName}`, cents: priceOf('sponsored', 'discover'), discountCents: 0 },
  ];
  const totalCents = items.reduce((a, i) => a + i.cents, 0);
  const discountCents = items.reduce((a, i) => a + i.discountCents, 0);
  return {
    items,
    count: items.length,
    subtotalCents: totalCents + discountCents,
    discountCents,
    totalCents,
    minimumCents: CART.minimumCents,
    missingCents: Math.max(0, CART.minimumCents - totalCents),
    ready: totalCents >= CART.minimumCents,
    feeSavedCents: (items.length - 1) * CART.feeCents,
  };
}

// A small seeded random number generator (mulberry32): the same seed, the same sequence.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sample owner's figures for the last 30 days, in the shape of `business.owner-figures` (with Pro's sources), plus the few extra fields the dashboard
// shows (uniques, referral visits, the lead kinds). Plausible for a small business in its first month, the same for a seed and a plot every time.
export function sampleFigures(seed, plotId) {
  const r = rng(seed * 31 + plotId);
  const between = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const impressions = between(1800, 2600);
  const views = Math.round(impressions * (0.16 + r() * 0.06));
  const qualified = Math.round(views * (0.42 + r() * 0.1));
  const storeEntries = Math.round(views * (0.22 + r() * 0.08));
  const ctaClicks = Math.round(views * (0.09 + r() * 0.04));
  const newsletterSignups = between(6, 14);
  const couponClaims = between(18, 34);
  const couponRedemptions = Math.round(couponClaims * 0.4);
  const purchases = between(5, 11);
  const spendCents = 1900 + priceOf('sponsored', 'discover');
  const verifiedCents = purchases * between(1800, 3200);
  const counts = { leads: newsletterSignups, claims: couponClaims, redemptions: couponRedemptions, purchases };
  const shares = { direct: 0.18, search: 0.22, social: 0.14, referral: 0.08, city: 0.34, x: 0.04 };
  return {
    verified: true,
    impressions,
    views,
    qualified,
    storeEntries,
    ctaClicks,
    outcomes: OUTCOME_FAMILIES.map((id) => ({ id, count: counts[id], costCents: counts[id] ? Math.round(spendCents / counts[id]) : null })),
    revenue: { verifiedCents, unattributedCents: between(0, 3) * 1500, browserCents: between(1, 3) * 2100, browserReports: between(1, 3) },
    spendCents,
    returnOnSpend: Math.round((verifiedCents / spendCents) * 100) / 100,
    sources: TRAFFIC_SOURCES.map((id) => ({ id, views: Math.round(views * shares[id]), ctaClicks: Math.round(ctaClicks * shares[id]), leads: 0, purchases: 0 })),
    // shown by the dashboard beside the contract's figures
    uniques: Math.round(views * 0.86),
    referralVisits: Math.round(views * shares.referral),
    newsletterSignups,
    couponClaims,
    couponRedemptions,
    purchases,
  };
}
