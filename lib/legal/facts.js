// The facts the policies state (/legal), in one place. Prices and game rules are imported from the modules the app itself uses; the periods
// kept by the servers are copied here and tests/legal.test.mjs checks every one against the code, so a policy cannot quietly drift from
// what the product does.
import { AD_SPACES, CART, PLACEMENTS, PRO_DISCOUNT, PRODUCTS, PRORATA, STRIPE_MIN_CENTS, adPriceOf } from '@voxelventure/business-core';
import { GRACE_DAYS, PRO_PLOT_DISCOUNT, RENEWAL_SHARE, TERMS, renewalWindowDays } from '../game/leases';
import { HOURS, TIERS } from '../market/layout';
import { BASE_VOTES, HUNT_BONUS_VOTES } from '../game/buildingOfWeek';

export const usd = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

// What is sold, and for how long (@voxelventure/business-core, lib/game/leases.js, lib/market/layout.js).
export const MONEY = {
  launch: { name: PRODUCTS.launch.name, price: usd(PRODUCTS.launch.cents), days: PRODUCTS.launch.days },
  pro: { name: PRODUCTS.pro.name, price: usd(PRODUCTS.pro.cents), interval: PRODUCTS.pro.interval },
  placements: Object.values(PLACEMENTS).map((p) => ({ label: p.label, price: usd(p.cents), slots: p.slots, days: PRODUCTS.sponsored.days })),
  leaseTerms: TERMS.map((t) => t.days),
  renewalShare: RENEWAL_SHARE, // a renewal costs this share of a new lease (0.9)
  renewalWindowDays: { short: renewalWindowDays(TERMS[0].days), long: renewalWindowDays(TERMS.at(-1).days) }, // the last 3 days of a 7-day lease, the last 7 of a longer one
  proPlotDiscount: PRO_PLOT_DISCOUNT, // the share off a plot lease with Pro
  proDiscount: PRO_DISCOUNT, // the same share, off an ad space too (one constant)
  adSpaces: Object.entries(AD_SPACES).map(([kind, a]) => ({ kind, label: a.label, price: usd(a.cents), proPrice: usd(adPriceOf(kind, { pro: true })), days: a.days })), // billboards and banners, with billing on
  graceDays: GRACE_DAYS,
  stallPrices: TIERS.map((t) => ({ label: t.label, price: usd(t.cents) })),
  stallHours: HOURS,
  stallsPerWeek: 4, // services/api/market.mjs MAX_ACTIVE_PER_WEEK
  checkoutHoldMinutes: 30, // services/api/billing.mjs: a spot is held while its checkout is open
  cart: { minimum: usd(CART.minimumCents), maxPlots: CART.maxPlots }, // the cart (services/api/cart.mjs): its smallest checkout, and how many plots it takes
  promo: { perCheckout: 1, smallestCharge: usd(STRIPE_MIN_CENTS) }, // promo codes (services/api/promo.mjs): one per checkout; a code never leaves less than this to pay, except nothing
  prorata: { minimum: usd(PRORATA.minCents), minCents: PRORATA.minCents, weekDays: PRORATA.weekDays, stripeFeeDeducted: PRORATA.stripeFeeDeducted }, // refunds of unused time (services/api/prorata.mjs): the smallest one made, the week an ad space and a placement are counted in, and Stripe's fee is never taken off
  currency: 'US dollars',
};

// How long things are kept (lib/legal/retention.js; checked against the code by tests/legal.test.mjs).
import { RETENTION } from './retention';
export { RETENTION };

// Limits the policies quote.
export const LIMITS = {
  profilesPerAccount: 5, // services/api/business.mjs MAX_PROFILES
  inquiriesPerNetworkPerDay: 10, // services/api/conversions.mjs INQUIRY_LIMIT
  messagesPerMinute: 20,
  newConversationsPerDay: 5, // without a confirmed email
  feedbackPerDay: 10,
  votes: { base: BASE_VOTES, bonus: HUNT_BONUS_VOTES },
  socialPostsPerDay: 20,
};

// What the browser keeps (no cookies are set for players; staff on the admin pages get the API's HttpOnly sign-in cookie, services/api/admin.mjs). Grouped for the privacy policy; the key names are the real ones.
export const BROWSER_STORAGE = [
  { keys: ['voxelventure-token'], what: 'Your sign-in, so you stay signed in (removed when you sign out).', needed: true },
  { keys: ['voxelventure-visitor', 'voxelventure-guest'], what: 'A random visitor number, so a visit, a coupon claim or a request is counted once and not from a robot. It does not say who you are.', needed: false },
  { keys: ['voxelventure-ref'], what: `The referral code of a link you followed, for ${RETENTION.referralDays} days, so the person who shared it is credited.`, needed: false },
  { keys: ['voxelventure-save', 'voxelventure-market', 'voxelventure-designs', 'voxelventure-votes', 'voxelventure-parked', 'voxelventure-local-stats', 'voxelventure-name'], what: 'Your game in this browser: the city, your Gold and outfits, local market stalls and designs, demo votes, parked cars and the name you chose as a guest.', needed: true },
  { keys: ['voxelventure-view', 'voxelventure-viewer-fx', 'voxelventure-time-mode', 'voxelventure-sound', 'voxelventure-panel', 'voxelventure-map', 'voxelventure-map-zoom', 'voxelventure-map-tab'], what: 'Your settings: camera, effects, time of day, sound, panel and map.', needed: true },
  { keys: ['voxelventure-tour'], what: 'That a guided tour is running in this tab (session storage, gone when the tab closes), so the tour only looks and saves nothing.', needed: true },
  { keys: ['voxelventure-gpu-reload'], what: 'For this tab only: that the page already reloaded once after your graphics card reset, so it does not reload again and again.', needed: true },
  { keys: ['voxelventure-city-edits'], what: 'Developer tools only: the city editor\'s work. (Staff editing the market in the game keep nothing here: it uses the admin sign-in cookie.)', needed: true },
];
