// What claiming costs: the land, plus each outside choice; and the three-minute hold.
import { imp, problemTally } from './helpers.mjs';
const cp = await imp('game/claimPrice.js');
const hold = await imp('game/claimHold.js');
const { EXTERIOR_PRICES } = await imp('content/exteriorPrices.js');
const { defaultExterior, floorRange } = await imp('game/exterior.js');
const { generateCity } = await imp('city/cityGenerator.js');
const { useCityStore } = await imp('state/store.js');
const { bad, total } = problemTally();

// the shipped prices are all zero: customising changes nothing until you set them
const zero = (o) => Object.values(o).every((v) => (typeof v === 'object' ? zero(v) : typeof v === 'string' || v === 0));
if (!zero(EXTERIOR_PRICES)) bad('the shipped outside prices are all zero', JSON.stringify(EXTERIOR_PRICES));

const { plots } = generateCity(20260101);
const ord = plots.find((p) => !p.owner && !p.prime && p.districtId !== 'suburb' && !p.designSite);
const lux = plots.find((p) => p.luxury && !p.grand && !p.owner);
if (!(ord.price === 5 && ord.land.tier === 'ordinary')) bad('an ordinary plot is five dollars and knows its attributes', JSON.stringify([ord.price, ord.land]));
if (!(lux.price > 200 && lux.land.tier === 'luxury' && lux.land.cells === 6)) bad('a luxury estate is priced by its worth', JSON.stringify([lux.price, lux.land]));
if (plots.some((p) => !(p.price >= 5) || !p.land)) bad('every plot has a price of at least five dollars', '');
if (cp.landPriceOf({ price: 12 }) !== 12 || cp.landPriceOf({ prime: true, cellCount: 2 }) !== 35 || cp.landPriceOf({}) !== 5 || cp.landPriceOf(null) !== 5) bad('the land price: the plot\'s own, else from its tier and size, else five dollars', '');

// no customising: just the land
const base = cp.claimPrice(ord, null, 'shop');
if (base.total !== 5 || base.land !== 5 || base.outside !== 0 || base.lines.length !== 1) bad('an uncustomised ordinary plot is five dollars', JSON.stringify(base));
const dflt = cp.claimPrice(ord, defaultExterior(ord, 'shop'), 'shop');
if (dflt.total !== 5) bad('the starting outside costs nothing extra', JSON.stringify(dflt));

// with prices set, every choice adds up and is listed
const prices = { currency: '$', perFloor: 2, perSkyscraperFloor: 3, model: { 'commercial/building-skyscraper-a': 4 }, palette: { tokyo: 6 }, crown: { beacon: 8, dish: 0, garden: 5, dome: 0, spire: 0 }, ownWallColor: 1.5 };
const typical = floorRange(ord, 'shop').typical;
const cfg = { floors: typical + 3, model: 'commercial/building-skyscraper-a', palette: 'tokyo', wallColor: '#112233', crown: 'beacon' };
const full = cp.claimPrice(ord, cfg, 'shop', prices);
const expected = 5 + 2 * 3 + 0 + 4 + 6 + 1.5 + 8;
if (full.total !== expected && !(typical + 3 > 9)) bad('every choice adds its price', `${full.total} vs ${expected}: ${JSON.stringify(full.lines)}`);
if (!full.lines.some((l) => /extra floors/.test(l.label)) || !full.lines.some((l) => /roof/.test(l.label)) || !full.lines.some((l) => /Tokyo/.test(l.label))) bad('the lines name each choice', JSON.stringify(full.lines));
const sky = cp.claimPrice(ord, { floors: 10, crown: 'none' }, 'shop', { ...prices, perFloor: 0 });
if (floorRange(ord, 'shop').max >= 10 && sky.total !== 5 + 3 * 1) bad('a skyscraper floor costs extra from the tenth', JSON.stringify(sky));
if (cp.claimPrice(ord, { crown: 'garden' }, 'shop', prices).total !== 10) bad('a roof garden is five dollars more', '');
if (cp.claimPrice(lux, cfg, 'office', prices).total <= lux.price) bad('customising adds to an estate\'s price too', '');
if (cp.claimPrice(ord, cfg, 'shop', { ...prices, perFloor: -5, crown: { beacon: 'x' } }).total < 5) bad('bad prices never lower the price', '');

// claiming: the building is worth what was paid
{
  const city = generateCity(20260101);
  useCityStore.setState({ plots: city.plots, layout: city.layout, billboards: city.billboards });
  const lot = city.plots.find((p) => !p.owner && !p.prime && p.districtId !== 'suburb' && !p.designSite);
  const lux2 = city.plots.find((p) => p.luxury && !p.owner);
  useCityStore.getState().claimPlot(lot.id, 'T', 'Five Dollar Shop', 'https://x.example', 'shop', null, { kind: 'generated' }, '');
  useCityStore.getState().claimPlot(lux2.id, 'T', 'Estate', 'https://x.example', 'office', null, { kind: 'generated' }, '', { floors: 8, crown: 'spire' });
  const a = useCityStore.getState().plots.find((p) => p.id === lot.id);
  const b = useCityStore.getState().plots.find((p) => p.id === lux2.id);
  if (a.value !== 5 || !a.userClaimed) bad('a basic plot is claimed for five dollars', String(a.value));
  if (b.value !== lux2.price || b.height !== 9.6) bad('an estate is claimed at its land price, built as chosen', `${b.value} vs ${lux2.price}, ${b.height}`);
}

// the hold
const t0 = 1_000_000;
const until = hold.holdUntil(t0);
if (hold.HOLD_SECONDS !== 180 || until !== t0 + 180000) bad('three minutes', String(until - t0));
const h1 = hold.holdState(until, t0);
if (h1.left !== 180 || h1.label !== '3:00' || h1.expired || h1.urgent) bad('the hold starts at 3:00', JSON.stringify(h1));
const h2 = hold.holdState(until, t0 + 139_000);
if (h2.left !== 41 || h2.label !== '0:41' || h2.urgent) bad('0:41 left', JSON.stringify(h2));
const h3 = hold.holdState(until, t0 + 151_000);
if (!h3.urgent || h3.label !== '0:29') bad('the last thirty seconds are urgent', JSON.stringify(h3));
const h4 = hold.holdState(until, t0 + 180_000);
if (!h4.expired || h4.left !== 0 || h4.label !== '0:00') bad('the hold ends at zero', JSON.stringify(h4));
if (hold.holdState(until, t0 + 999_999).left !== 0) bad('a long-ended hold is still zero, not negative', '');

console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
