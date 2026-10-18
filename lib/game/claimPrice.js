// What it costs to claim a plot: the land, plus whatever the owner customised on the outside. Pure, so it is tested in Node.
//
//   land      the plot's own price: `plot.price` if the world gives one (the hand-authored world will), else worked out from its attributes (landPrice.js)
//   outside   the price of each choice (lib/content/exteriorPrices.js)
//
// With a game server a plot is leased (lib/game/leases.js), and these are the prices it charges: the claim form and the server both call the functions
// at the end of this file, so what the form shows is what the player pays. Land + outside is the price of a year; a shorter lease costs the term's share.
import { cleanExterior, floorRange, paletteById } from './exterior';
import { EXTERIOR_PRICES } from '../content/exteriorPrices';
import { landPrice } from './landPrice';
import { DEFAULT_TERM, renewalPrice, termOf, termPrice } from './leases';
import { TAKEOVER_MULTIPLIER } from '../city/cityGenerator';

const money = (n) => Math.round(n * 100) / 100;
const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

// The land price of a plot.
export function landPriceOf(plot) {
  if (Number.isFinite(plot?.price) && plot.price > 0) return plot.price;
  return landPrice(plot?.land ?? { tier: plot?.grand ? 'grand' : plot?.luxury ? 'luxury' : plot?.prime ? 'prime' : 'ordinary', cells: plot?.cellCount ?? 1 });
}

// The cost of the outside choices: { total, lines: [{ label, amount }] } (only choices that cost something are listed).
export function outsideCost(config, plot, type, prices = EXTERIOR_PRICES) {
  if (!config) return { total: 0, lines: [] };
  const c = cleanExterior(config, plot, type);
  const range = floorRange(plot, type);
  const lines = [];
  const add = (label, amount) => {
    if (amount > 0) lines.push({ label, amount: money(amount) });
  };
  add(`${c.floors - range.typical} extra floor${c.floors - range.typical === 1 ? '' : 's'}`, num(prices.perFloor) * Math.max(0, c.floors - range.typical));
  add(`${Math.max(0, c.floors - 9)} skyscraper floor${c.floors - 9 === 1 ? '' : 's'}`, num(prices.perSkyscraperFloor) * Math.max(0, c.floors - 9));
  if (c.model) add('The shape you chose', num(prices.model?.[c.model]));
  add(`The ${paletteById(c.palette).label} style`, num(prices.palette?.[c.palette]));
  if (c.wallColor) add('Your own wall colour', num(prices.ownWallColor));
  if (c.crown !== 'none') add(`A ${c.crown} on the roof`, num(prices.crown?.[c.crown]));
  return { total: money(lines.reduce((a, l) => a + l.amount, 0)), lines };
}

// Land + outside: { land, outside, total, lines } where lines is every part of the price, land first.
export function claimPrice(plot, config, type, prices = EXTERIOR_PRICES) {
  const land = landPriceOf(plot);
  const outside = outsideCost(config, plot, type, prices);
  return { land, outside: outside.total, total: money(land + outside.total), lines: [{ label: 'The land', amount: land }, ...outside.lines] };
}

// ---- leases (with a game server) ------------------------------------------------------------------------------------------------------------------------
// The term a lease is for: 30, 90 or 365 days (a year if it does not say).
const termDays = (days) => termOf(days ?? DEFAULT_TERM)?.days ?? DEFAULT_TERM;

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
