// What claiming costs: the land, plus each elaborate outside choice (a share of the land price); changing the outside later; and the three-minute hold.
import { imp, problemTally } from './helpers.mjs';
const cp = await imp('game/claimPrice.js');
const hold = await imp('game/claimHold.js');
const { EXTERIOR_PRICES } = await imp('content/exteriorPrices.js');
const { defaultExterior, floorRange, heightFor } = await imp('game/exterior.js');
const { generateCity } = await imp('city/cityGenerator.js');
const { useCityStore } = await imp('state/store.js');
const { bad, total } = problemTally();

// the shipped prices are shares of the land price: the basic outside (the usual floors, any colour, shape or wall colour, a beacon or a dish) is free
const S = EXTERIOR_PRICES;
if (S.perFloor !== 0.1 || S.perSkyscraperFloor !== 0.15 || S.crown.garden !== 0.1 || S.crown.dome !== 0.2 || S.crown.spire !== 0.25 || S.crown.beacon !== 0 || S.crown.dish !== 0 || S.ownWallColor !== 0 || Object.keys(S.model).length || Object.keys(S.palette).length) bad('the shipped outside prices: floors 10% (+15% from the tenth), garden 10%, dome 20%, spire 25% of the land, the rest free', JSON.stringify(S));
if (Object.values(S).some((v) => typeof v === 'number' && (v < 0 || v > 1))) bad('every share is between 0 and 1 of the land price', '');

const { plots } = generateCity(20260101);
const ord = plots.find((p) => !p.owner && !p.prime && p.districtId !== 'suburb' && !p.designSite);
const lux = plots.find((p) => p.luxury && !p.grand && !p.owner);
const prime = plots.find((p) => p.prime && !p.luxury && !p.owner);
if (!(ord.price >= 5 && ord.price <= 10 && ord.land.tier === 'ordinary')) bad('an ordinary plot is five to ten dollars for 30 days and knows its attributes', JSON.stringify([ord.price, ord.land]));
if (!(lux.price >= 80 && lux.land.tier === 'luxury' && lux.land.cells === 6)) bad('a luxury estate is priced by its worth', JSON.stringify([lux.price, lux.land]));
if (plots.some((p) => !(p.price >= 5) || !p.land)) bad('every plot has a price of at least five dollars', '');
if (cp.landPriceOf({ price: 12 }) !== 12 || cp.landPriceOf({ prime: true, cellCount: 2 }) !== 20 || cp.landPriceOf({}) !== 5 || cp.landPriceOf(null) !== 5) bad('the land price: the plot\'s own, else from its tier and size, else five dollars', '');

// no customising, or the basic outside: just the land
const base = cp.claimPrice(ord, null, 'shop');
if (base.total !== ord.price || base.land !== ord.price || base.outside !== 0 || base.lines.length !== 1) bad('an uncustomised plot is its land price', JSON.stringify(base));
const dflt = cp.claimPrice(ord, defaultExterior(ord, 'shop'), 'shop');
if (dflt.total !== ord.price) bad('the starting outside costs nothing extra', JSON.stringify(dflt));
const typical = floorRange(ord, 'shop').typical;
const basic = { floors: typical, model: 'commercial/building-skyscraper-a', palette: 'tokyo', wallColor: '#112233', crown: 'beacon' };
if (cp.claimPrice(ord, basic, 'shop').total !== ord.price || cp.claimPrice(ord, { ...basic, crown: 'dish', floors: 1 }, 'shop').total !== ord.price) bad('a shape, a colour style, your own walls, a beacon or a dish, and fewer floors are free', JSON.stringify(cp.claimPrice(ord, basic, 'shop')));

// the priced choices: each a share of this plot's land price, to the cent, and listed
const money = (n) => Math.round(n * 100) / 100;
const up = cp.claimPrice(ord, { floors: typical + 2, crown: 'spire' }, 'shop');
if (up.total !== money(ord.price + money(ord.price * 0.2) + money(ord.price * 0.25))) bad('two extra floors and a spire: 20% and 25% of the land more', JSON.stringify(up));
if (!up.lines.some((l) => /2 extra floors/.test(l.label)) || !up.lines.some((l) => /spire on the roof/.test(l.label))) bad('the lines name each priced choice', JSON.stringify(up.lines));
if (cp.claimPrice(ord, { crown: 'garden' }, 'shop').total !== money(ord.price + money(ord.price * 0.1)) || cp.claimPrice(ord, { crown: 'dome' }, 'shop').total !== money(ord.price + money(ord.price * 0.2))) bad('a roof garden is 10% more, a dome 20%', '');
if (floorRange(ord, 'shop').max >= 10) {
  const sky = cp.outsideCost({ floors: 10 }, ord, 'shop');
  if (sky.total !== money(money(ord.price * 0.1 * (10 - typical)) + money(ord.price * 0.15))) bad('a skyscraper floor costs another 15% from the tenth', JSON.stringify(sky));
}
// the same choice costs more on a better plot: it is part of what the plot is worth
const spireOn = (p, t) => cp.outsideCost({ ...defaultExterior(p, t), crown: 'spire' }, p, t).total;
if (!(spireOn(lux, 'office') > spireOn(prime, 'office') && spireOn(prime, 'office') > spireOn(ord, 'shop')) || spireOn(lux, 'office') !== money(lux.price * 0.25)) bad('a spire is a quarter of the land price, so it costs more on an estate', [spireOn(ord, 'shop'), spireOn(prime, 'office'), spireOn(lux, 'office')].join());
// prices of your own: every choice adds its share, and bad prices never lower the price
const prices = { currency: '$', perFloor: 0.2, perSkyscraperFloor: 0, model: { 'commercial/building-skyscraper-a': 0.4 }, palette: { tokyo: 0.6 }, crown: { beacon: 0.8, dish: 0, garden: 0, dome: 0, spire: 0 }, ownWallColor: 0.1 };
const cfg = { floors: typical + 3, model: 'commercial/building-skyscraper-a', palette: 'tokyo', wallColor: '#112233', crown: 'beacon' };
const ten = { ...ord, price: 10 };
const full = cp.claimPrice(ten, cfg, 'shop', prices);
if (typical + 3 <= 9 && full.total !== 10 + 2 * 3 + 4 + 6 + 1 + 8) bad('every choice adds its share of the land', `${full.total}: ${JSON.stringify(full.lines)}`);
if (cp.claimPrice(ord, cfg, 'shop', { ...prices, perFloor: -5, crown: { beacon: 'x' } }).total < ord.price) bad('bad prices never lower the price', '');
// what one choice adds, for the builder's "+$1.20 / 30 days" and "free"
const start = defaultExterior(ord, 'shop');
if (cp.choiceCost(start, { crown: 'spire' }, ord, 'shop') !== money(ord.price * 0.25) || cp.choiceCost(start, { crown: 'dish' }, ord, 'shop') !== 0 || cp.choiceCost(start, { palette: 'mono' }, ord, 'shop') !== 0 || cp.choiceCost(start, { floors: typical + 1 }, ord, 'shop') !== money(ord.price * 0.1)) bad('a choice\'s price is the difference it makes', '');

// ---- changing the outside of a leased building (exteriorChangeQuote)
{
  const DAY = 86400000;
  const now = 1_800_000_000_000;
  const spire = { ...start, crown: 'spire' };
  const perPeriod = money(ord.price * 0.25);
  const q = cp.exteriorChangeQuote(ord, null, spire, 'shop', { now, leaseDays: 30, leaseEnd: now + 30 * DAY });
  if (q.before !== 0 || q.after !== perPeriod || q.diff !== perPeriod || q.charge !== Math.max(0.5, perPeriod) || !q.lines.some((l) => /spire/.test(l.label))) bad('a spire at the start of a 30-day lease costs its 30 days (at least 50 cents)', JSON.stringify(q));
  const luxSpire = { ...defaultExterior(lux, 'office'), crown: 'spire' };
  const half = cp.exteriorChangeQuote(lux, null, luxSpire, 'office', { now, leaseDays: 30, leaseEnd: now + 15 * DAY });
  if (half.charge !== money(money(lux.price * 0.25) / 2)) bad('half way through the lease, half the 30 days', JSON.stringify(half));
  const short = cp.exteriorChangeQuote(lux, null, luxSpire, 'office', { now, leaseDays: 7, leaseEnd: now + 7 * DAY });
  if (short.charge !== money(money(lux.price * 0.25) * 0.3)) bad('a 7-day lease pays the 7-day price (0.3 of 30 days) of the difference', JSON.stringify(short));
  const mid = cp.exteriorChangeQuote(lux, null, luxSpire, 'office', { now, leaseDays: 14, leaseEnd: now + 7 * DAY });
  if (mid.charge !== money(money(money(lux.price * 0.25) * 0.55) / 2)) bad('half way through a 14-day lease, half its 14-day price', JSON.stringify(mid));
  const tiny = cp.exteriorChangeQuote(ord, null, spire, 'shop', { now, leaseDays: 7, leaseEnd: now + DAY });
  if (tiny.charge !== cp.MIN_CHARGE || cp.MIN_CHARGE !== 0.5) bad('a small upgrade still costs at least 50 cents (Stripe\'s smallest charge), so stepwise upgrades never round to nothing', JSON.stringify(tiny));
  const down = cp.exteriorChangeQuote(ord, spire, { ...spire, crown: 'none' }, 'shop', { now, leaseDays: 30, leaseEnd: now + 20 * DAY });
  if (down.charge !== 0 || down.diff !== -perPeriod || down.after !== 0) bad('taking the spire down is free, and lowers the 30-day price', JSON.stringify(down));
  const same = cp.exteriorChangeQuote(ord, spire, { ...spire, palette: 'tokyo', wallColor: '#123456' }, 'shop', { now, leaseDays: 30, leaseEnd: now + 20 * DAY });
  if (same.charge !== 0 || same.diff !== 0) bad('a change that costs no more is free', JSON.stringify(same));
  const swap = cp.exteriorChangeQuote(lux, { crown: 'garden' }, { crown: 'spire' }, 'office', { now, leaseDays: 30, leaseEnd: now + 30 * DAY });
  if (swap.diff !== money(money(lux.price * 0.25) - money(lux.price * 0.1))) bad('swapping a garden for a spire costs only the difference', JSON.stringify(swap));
  const noLease = cp.exteriorChangeQuote(lux, null, { crown: 'dome' }, 'office', { now });
  if (noLease.charge !== money(lux.price * 0.2)) bad('without a lease end, the whole 30 days', JSON.stringify(noLease));
  const legacy = cp.exteriorChangeQuote(lux, null, { crown: 'dome' }, 'office', { now, leaseDays: 365, leaseEnd: now + 365 * DAY });
  if (legacy.charge !== money((money(lux.price * 0.2) * 365) / 30)) bad('an old year\'s lease pays the 30-day price for each 30 days left', JSON.stringify(legacy));
  const early = cp.exteriorChangeQuote(lux, null, { crown: 'dome' }, 'office', { now, leaseDays: 7, leaseEnd: now + 10 * DAY });
  if (early.charge !== money(money(money(lux.price * 0.2) * 0.3) * (10 / 7))) bad('renewed early (more than a term left), the whole time left is charged', JSON.stringify(early));
  const usual = floorRange(ord, 'shop').typical;
  const grown = { ...ord, baseHeight: heightFor(usual + 2), height: heightFor(usual + 4) };
  const recolour = cp.exteriorChangeQuote(grown, null, { floors: usual + 2, palette: 'tokyo' }, 'shop', { now, leaseDays: 30, leaseEnd: now + 30 * DAY });
  if (recolour.charge !== 0 || recolour.diff !== 0) bad('an outside never set up starts from the building as it stands: recolouring a taller-than-usual building is free', JSON.stringify(recolour));
  const taller = cp.exteriorChangeQuote(grown, null, { floors: usual + 3 }, 'shop', { now, leaseDays: 30, leaseEnd: now + 30 * DAY });
  if (taller.diff !== money(ord.price * 0.1)) bad('and only the floors above it are charged', JSON.stringify(taller));
}

// ---- lease quotes: the term's share of the 30-day price, 10% off a renewal, 15% off with Pro, never under 50 cents
{
  const five = { ...ord, price: 5 };
  const q7 = cp.leaseQuote(five, null, 'shop', 7);
  if (q7.period !== 5 || q7.days !== 7 || q7.price !== 1.5 || q7.total !== 1.5 || q7.discount !== null) bad('a 7-day lease of a $5 plot is $1.50, no discount without Pro', JSON.stringify(q7));
  const p7 = cp.leaseQuote(five, null, 'shop', 7, { pro: true });
  if (p7.price !== 1.5 || p7.discount?.label !== 'Pro: 15% off' || p7.discount.amount !== 0.23 || p7.total !== 1.27) bad('with Pro the discount is its own line: $1.50 less $0.23', JSON.stringify(p7));
  const p30 = cp.leaseQuote(lux, null, 'office', 30, { pro: true });
  if (p30.period !== lux.price || p30.total !== money(lux.price - money(lux.price * 0.15))) bad('Pro is 15% off a 30-day lease', JSON.stringify(p30));
  if (cp.leaseQuote(five, null, 'shop').days !== 30 || cp.leaseQuote(five, null, 'shop', 365).days !== 30) bad('without a term, or with an old one, a lease is 30 days', '');
  const r7 = cp.renewalQuote(five, 7, { pro: true });
  if (r7.price !== 1.35 || r7.total !== money(1.35 - money(1.35 * 0.15)) || r7.discount?.amount !== money(1.35 * 0.15)) bad('a 7-day renewal is 90% of the lease, then 15% off with Pro', JSON.stringify(r7));
  if (cp.renewalQuote(five, 30).total !== 4.5) bad('a 30-day renewal of a $5 plot is $4.50', JSON.stringify(cp.renewalQuote(five, 30)));
  const t14 = cp.takeoverQuote(five, null, 'shop', 14, { pro: true });
  if (t14.business !== 6.25 || t14.period !== 6.25 || t14.price !== money(6.25 * 0.55) || t14.total !== money(t14.price - money(t14.price * 0.15))) bad('a take-over is 1.25x the worth, at the term\'s factor, 15% off with Pro', JSON.stringify(t14));
  // the cheapest charge there is: a 7-day renewal of the cheapest plot with Pro, still over Stripe's 50 cents; a cheaper one would be raised to 50 cents
  if (!(r7.total > 0.5)) bad('the cheapest plot charge is over 50 cents', String(r7.total));
  const cheap = cp.renewalQuote({ ...ord, price: 1 }, 7, { pro: true });
  if (cheap.total !== 0.5 || cheap.price !== 0.27) bad('a lease cheaper than 50 cents is charged 50 cents', JSON.stringify(cheap));
}

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
  if (a.value !== lot.price || !a.userClaimed) bad('a basic plot is claimed for its land price', String(a.value));
  if (b.value !== cp.claimPrice(lux2, { floors: 8, crown: 'spire' }, 'office').total || !(b.value > lux2.price) || b.height !== 9.6) bad('an estate is claimed at its land price and its spire, built as chosen', `${b.value} vs ${lux2.price}, ${b.height}`);
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
