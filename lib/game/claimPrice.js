// What it costs to claim a plot: the land, plus whatever the owner customised on the outside. Pure, so it is tested in Node.
//
//   land      the plot's own price: `plot.price` if the world gives one (the hand-authored world will), else worked out from its attributes (landPrice.js)
//   outside   the price of each choice (lib/content/exteriorPrices.js)
import { cleanExterior, floorRange, paletteById } from './exterior';
import { EXTERIOR_PRICES } from '../content/exteriorPrices';
import { landPrice } from './landPrice';

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
