// What it costs to claim a plot: the land, plus whatever the owner customised on the outside. Pure, so it is tested in Node.
//
//   land      the plot's own price: `plot.price` if the world gives one (the hand-authored world will), else worked out from its attributes (landPrice.js)
//   outside   the price of each elaborate choice: its share of the land price (lib/content/exteriorPrices.js). The basic outside is free.
//
// With a game server a plot is leased (lib/game/leases.js), and these are the prices it charges: the claim form and the server both call the functions
// at the end of this file, so what the form shows is what the player pays. Land + outside is the price of a year; a shorter lease costs the term's share.
import { CROWNS, cleanExterior, floorRange, paletteById } from './exterior';
import { EXTERIOR_PRICES } from '../content/exteriorPrices';
import { landPrice } from './landPrice';
import { DAY_MS, DEFAULT_TERM, renewalPrice, termFor, termOf, termPrice } from './leases';
import { TAKEOVER_MULTIPLIER } from '../city/cityGenerator';

const money = (n) => Math.round(n * 100) / 100;
const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

// The land price of a plot.
export function landPriceOf(plot) {
  if (Number.isFinite(plot?.price) && plot.price > 0) return plot.price;
  return landPrice(plot?.land ?? { tier: plot?.grand ? 'grand' : plot?.luxury ? 'luxury' : plot?.prime ? 'prime' : 'ordinary', cells: plot?.cellCount ?? 1 });
}

// The cost of the outside choices for a year: { total, lines: [{ label, amount }] } (only choices that cost something are listed). Each price is a share of
// the plot's land price (lib/content/exteriorPrices.js), to the cent, so a taller building or a spire costs more on a bigger, better plot.
export function outsideCost(config, plot, type, prices = EXTERIOR_PRICES) {
  if (!config) return { total: 0, lines: [] };
  const c = cleanExterior(config, plot, type);
  const range = floorRange(plot, type);
  const land = landPriceOf(plot);
  const lines = [];
  const add = (label, share) => {
    const amount = money(share * land);
    if (amount > 0) lines.push({ label, amount });
  };
  const extra = Math.max(0, c.floors - range.typical);
  const sky = Math.max(0, c.floors - 9);
  add(`${extra} extra floor${extra === 1 ? '' : 's'}`, num(prices.perFloor) * extra);
  add(`${sky} skyscraper floor${sky === 1 ? '' : 's'}`, num(prices.perSkyscraperFloor) * sky);
  if (c.model) add('The shape you chose', num(prices.model?.[c.model]));
  add(`The ${paletteById(c.palette).label} style`, num(prices.palette?.[c.palette]));
  if (c.wallColor) add('Your own wall colour', num(prices.ownWallColor));
  if (c.crown !== 'none') add(`A ${(CROWNS.find((k) => k.id === c.crown)?.label ?? c.crown).toLowerCase()} on the roof`, num(prices.crown?.[c.crown]));
  return { total: money(lines.reduce((a, l) => a + l.amount, 0)), lines };
}

// What one choice adds to the outside a year, from `config` (the outside as it is) to `config` with `patch` applied: for the "+$1.20 a year" and "free"
// beside each choice in the builder. It is outsideCost's own difference, so the builder, the claim form and the server cannot disagree. 0 is free.
export function choiceCost(config, patch, plot, type, prices = EXTERIOR_PRICES) {
  const c = cleanExterior(config, plot, type);
  return money(outsideCost({ ...c, ...patch }, plot, type, prices).total - outsideCost(c, plot, type, prices).total);
}

// Land + outside: { land, outside, total, lines } where lines is every part of the price, land first.
export function claimPrice(plot, config, type, prices = EXTERIOR_PRICES) {
  const land = landPriceOf(plot);
  const outside = outsideCost(config, plot, type, prices);
  return { land, outside: outside.total, total: money(land + outside.total), lines: [{ label: 'The land', amount: land }, ...outside.lines] };
}

// ---- leases (with a game server) ------------------------------------------------------------------------------------------------------------------------
// The term a lease is for: 90, 182 or 365 days (a year if it does not say; a lease from before the terms changed renews for the next term up).
const termDays = (days) => termFor(days ?? DEFAULT_TERM);

// Claiming an empty lot: the land and the outside are the price of a year (`year`, which becomes the plot's value); `total` is what this term costs.
export function leaseQuote(plot, config, type, days = DEFAULT_TERM, prices = EXTERIOR_PRICES) {
  const c = claimPrice(plot, config, type, prices);
  return { ...c, year: c.total, days: termDays(days), total: termPrice(c.total, termDays(days)) };
}

// What a business is worth: a player's is the year's price it was last leased at (its value); the city's own businesses are worth their land.
export const worthOf = (plot) => (plot?.ownerAccount != null && Number.isFinite(plot.value) && plot.value > 0 ? plot.value : landPriceOf(plot));

// Taking a business over: 1.25x what it is worth, plus the new tenant's outside, is the price of a year; `total` is what this term costs.
export function takeoverQuote(plot, config, type, days = DEFAULT_TERM, prices = EXTERIOR_PRICES) {
  const business = money(worthOf(plot) * TAKEOVER_MULTIPLIER);
  const outside = outsideCost(config, plot, type, prices);
  const year = money(business + outside.total);
  return { business, outside: outside.total, year, days: termDays(days), total: termPrice(year, termDays(days)), lines: [{ label: 'Taking the business over', amount: business }, ...outside.lines] };
}

// Renewing: half of what a new lease of the same plot, with the outside it has now, costs for that term (lib/game/leases.js RENEWAL_DISCOUNT).
export function renewalQuote(plot, days, prices = EXTERIOR_PRICES) {
  const year = claimPrice(plot, plot?.exterior ?? null, plot?.buildingType ?? 'shop', prices).total;
  return renewalPrice(year, termDays(days));
}

// ---- changing the outside of a leased building ------------------------------------------------------------------------------------------------------
export const MIN_CHARGE = 0.5; // Stripe's smallest charge in dollars; it also stops a run of small upgrades each rounding to nothing

// The owner changes the outside of their building from `from` to `to` (stored configurations; null is the usual outside). An outside that costs more a
// year is paid for the rest of the lease: the yearly difference, at the lease term's price, times the share of the lease still to run (at least
// MIN_CHARGE). One that costs the same or less is free and applies at once. Without a lease end (the city's own businesses) the whole term is charged.
//   { before, after }  the outside's price a year, before and after       diff     after - before (it is added to the plot's value)
//   charge             what to pay now (0 for a free change)                 lines    the priced parts of the new outside, a year each
export function exteriorChangeQuote(plot, from, to, type, { now = Date.now(), leaseDays, leaseEnd } = {}, prices = EXTERIOR_PRICES) {
  const before = outsideCost(from, plot, type, prices);
  const after = outsideCost(to, plot, type, prices);
  const diff = money(after.total - before.total);
  let charge = 0;
  if (diff > 0) {
    const stored = Number(leaseDays) > 0 ? Number(leaseDays) : DEFAULT_TERM;
    // a term still offered is priced at its factor; an older one (30 days) at its share of a year
    const forTerm = termOf(stored) ? termPrice(diff, stored) : money(diff * Math.min(1, stored / 365));
    const left = leaseEnd ? Math.min(1, Math.max(0, leaseEnd - now) / (stored * DAY_MS)) : 1;
    charge = Math.max(MIN_CHARGE, money(forTerm * left));
  }
  return { before: before.total, after: after.total, diff, charge, lines: after.lines };
}
