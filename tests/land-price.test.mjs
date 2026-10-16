// Land prices: the rules, and what they make of a whole generated city at full occupancy (design-time calibration).
import { imp, problemTally } from './helpers.mjs';
const lp = await imp('game/landPrice.js');
const { analyzeCity, locationAttrsFor, mismatches: mismatchesOf } = await imp('dev/locationAttrs.js');
const { generateCity } = await imp('city/cityGenerator.js');
const { bad, total } = problemTally();
const C = lp.LAND_PRICING;

// the rules
if (lp.landPrice({ tier: 'ordinary' }) !== 5 || lp.landPrice({ tier: 'ordinary', frontage: 3, park: 1, waterfront: 1, cells: 1 }) !== 5) bad('an ordinary plot is five dollars wherever it is', '');
if (lp.landPrice({}) !== 5 || lp.landPrice(null) !== 5 || lp.landPrice({ tier: 'nonsense', cells: 'x' }) !== 5) bad('bad input is a basic plot', '');
const prime2 = lp.landPrice({ tier: 'prime', cells: 2 });
if (!(prime2 > 5)) bad('a prime lot costs more than a basic plot', String(prime2));
if (prime2 !== 35) bad('a plain double prime lot is 2 x 3.5 x $5', String(prime2));
if (lp.landPrice({ tier: 'luxury', cells: 6 }) !== 290 || lp.landPrice({ tier: 'grand', cells: 6 }) !== 430) bad('luxury and grand base prices', `${lp.landPrice({ tier: 'luxury', cells: 6 })} ${lp.landPrice({ tier: 'grand', cells: 6 })}`);
for (const t of ['prime', 'luxury', 'grand']) {
  const none = lp.landPrice({ tier: t, cells: 3 });
  const best = lp.landPrice({ tier: t, cells: 3, frontage: 3, corner: 1, centrality: 1, park: 1, anchor: 1, waterfront: 1 });
  if (!(best > none)) bad('a better location costs more', `${t}: ${none} vs ${best}`);
  if (!(best <= none * 3)) bad('the best location is about two and a half times the worth, not more', `${t}: ${none} vs ${best}`);
}
if (!(lp.landPrice({ tier: 'luxury', cells: 6 }) > lp.landPrice({ tier: 'prime', cells: 6 }) && lp.landPrice({ tier: 'grand', cells: 6 }) > lp.landPrice({ tier: 'luxury', cells: 6 }))) bad('tiers go up: prime, luxury, grand', '');
if (!(lp.landPrice({ tier: 'prime', cells: 4 }) > lp.landPrice({ tier: 'prime', cells: 2 }))) bad('a bigger lot costs more', '');
if (lp.roundPrice(37.3) !== 35 || lp.roundPrice(38) !== 40 || lp.roundPrice(12.346) !== 12.35 || lp.roundPrice(242) !== 240) bad('prices from $20 up round to $5', `${lp.roundPrice(37.3)} ${lp.roundPrice(12.346)}`);
if (lp.landPrice({ tier: 'prime', cells: 2, corner: 1 }) <= lp.landPrice({ tier: 'prime', cells: 2 }) && lp.worthIndex({ tier: 'prime', cells: 2, corner: 1 }) <= lp.worthIndex({ tier: 'prime', cells: 2 })) bad('a corner is worth more', '');
if (!(lp.worthIndex({ tier: 'luxury', cells: 6 }) > 6 * 8 && lp.worthIndex({ tier: 'luxury', cells: 6 }) < 6 * 8 * 1.3)) bad('plottage: an assembled lot is worth a little more than its cells', String(lp.worthIndex({ tier: 'luxury', cells: 6 })));
if (lp.worthIndex({ tier: 'luxury', cells: 40 }) > 40 * 8 * 1.26) bad('plottage is capped', '');
if (lp.worthIndex({ tier: 'ordinary' }) !== 1 || !(lp.worthIndex({ tier: 'ordinary', frontage: 3 }) > 1)) bad('the worth index is 1 for a basic plot with no advantages, and counts location even there', '');
const custom = { ...C, base: 10, weights: { ...C.weights, park: 0.6 } };
if (lp.landPrice({ tier: 'ordinary' }, custom) !== 10 || !(lp.landPrice({ tier: 'prime', cells: 2, park: 1 }, custom) > lp.landPrice({ tier: 'prime', cells: 2, park: 1 }))) bad('the numbers can be changed in one place', '');
if (!lp.explainPrice({ tier: 'luxury', cells: 6, park: 1, frontage: 2 }).some((l) => /beside a park/.test(l)) || lp.explainPrice({ tier: 'ordinary' }).length !== 1) bad('a price can be explained in words', '');
const sm = lp.summarize([{ tier: 'ordinary', price: 5 }, { tier: 'ordinary', price: 5 }, { tier: 'prime', price: 40 }, { tier: 'prime', price: 60 }]);
if (sm.total !== 110 || sm.tiers.ordinary.count !== 2 || sm.tiers.prime.min !== 40 || sm.tiers.prime.max !== 60 || sm.tiers.prime.sum !== 100) bad('a summary by tier', JSON.stringify(sm));

// location grades: the best tenth is A, the next quarter B, the rest C; a site with no advantages is never better than C
{
  const rows = Array.from({ length: 100 }, (_, i) => ({ tier: 'ordinary', cells: 1, frontage: i % 4, corner: i % 5 === 0 ? 1 : 0, centrality: (i % 10) / 10 }));
  const g = lp.gradeLocations(rows);
  const count = (x) => g.filter((r) => r.grade === x).length;
  if (count('A') < 8 || count('A') > 14 || count('B') < 18 || count('B') > 38 || count('A') + count('B') + count('C') !== 100) bad('grades split about 10 / 25 / 65', `${count('A')} ${count('B')} ${count('C')}`);
  const best = g.reduce((a, r) => (r.locationBonus > a.locationBonus ? r : a));
  const worst = g.reduce((a, r) => (r.locationBonus < a.locationBonus ? r : a));
  if (best.grade !== 'A' || worst.grade !== 'C') bad('the best location is A and the worst C', `${best.grade} ${worst.grade}`);
  if (lp.gradeLocations([{ tier: 'ordinary' }, { tier: 'ordinary' }]).some((r) => r.grade !== 'C')) bad('no advantages is grade C', '');
  if (lp.gradeLocations([]).length !== 0) bad('no plots, no grades', '');
}

// the generated city, every plot taken
let cities = 0;
for (const seed of [20260101, 1, 2, 3, 4, 5, 6, 7]) {
  const { plots, layout } = generateCity(seed);
  const rows = analyzeCity(plots, layout);
  cities++;
  if (rows.length !== plots.length) bad('a price for every plot', seed);
  if (rows.some((r) => !Number.isFinite(r.price) || r.price < 5 || !Number.isFinite(r.worth) || r.worth < 1)) bad('every price is a real amount of at least five dollars', seed);
  if (rows.filter((r) => r.tier === 'ordinary').some((r) => r.price !== 5)) bad('every ordinary plot is five dollars', seed);
  const sm2 = lp.summarize(rows);
  for (const t of ['prime', 'luxury', 'grand']) {
    if (!sm2.tiers[t]) continue;
    if (sm2.tiers[t].min <= 5) bad('prime, luxury and grand lots cost more than five dollars', `${seed} ${t}`);
  }
  if (sm2.tiers.luxury && sm2.tiers.prime && !(sm2.tiers.luxury.median > sm2.tiers.prime.median)) bad('luxury estates cost more than prime lots', seed);
  // the mix of tiers is near the target shares (prime 8%, luxury 2.5%, grand 0.8% of the lots)
  const want = lp.tierTargets(rows.length);
  const have = (t) => rows.filter((r) => r.tier === t).length;
  if (have('prime') < want.prime * 0.7 || have('prime') > want.prime * 1.4) bad('about 8% of the lots are prime', `${seed}: ${have('prime')} of ${rows.length}, wanted ${want.prime}`);
  if (have('luxury') < want.luxury * 0.6 || have('luxury') > want.luxury * 1.5) bad('about 2.5% of the lots are luxury', `${seed}: ${have('luxury')} of ${rows.length}, wanted ${want.luxury}`);
  if (have('grand') < Math.max(2, want.grand * 0.4) || have('grand') > want.grand * 1.6) bad('under 1% of the lots are grand', `${seed}: ${have('grand')} of ${rows.length}, wanted ${want.grand}`);
  // the location criteria are used: not every lot has the same bonus, and some have each advantage
  if (new Set(rows.map((r) => r.frontage)).size < 2) bad('frontage varies across the city', seed);
  if (!rows.some((r) => r.corner) || !rows.some((r) => r.centrality > 0.6) || !rows.some((r) => r.centrality < 0.2)) bad('corners exist, and the centre differs from the edge', seed);
  if (!rows.some((r) => r.grade === 'A') || !rows.some((r) => r.grade === 'B') || !rows.some((r) => r.grade === 'C')) bad('every grade is used', seed);
  const mm = mismatchesOf(rows);
  if (mm.crossTab.reduce((n, t) => n + t.A + t.B + t.C, 0) !== rows.length) bad('the grade table covers every plot', seed);
  if (!rows.some((r) => r.park) || !rows.some((r) => r.waterfront) || !rows.some((r) => r.anchor)) bad('some lots are by the park, the water and an anchor', `${seed}: ${rows.some((r) => r.park)} ${rows.some((r) => r.waterfront)} ${rows.some((r) => r.anchor)}`);
  // a lot's attributes can be read off the plot on its own too
  const one = plots.find((p) => p.luxury);
  if (JSON.stringify(locationAttrsFor(one, layout, plots)) !== JSON.stringify(rows.find((r) => r.id === one.id) && (({ tier, cells, frontage, corner, centrality, park, anchor, waterfront }) => ({ tier, cells, frontage, corner, centrality, park, anchor, waterfront }))(rows.find((r) => r.id === one.id)))) bad('attributes are the same however they are asked for', seed);
}
const t1000 = lp.tierTargets(1000);
if (t1000.prime !== 80 || t1000.luxury !== 25 || t1000.grand !== 8 || t1000.ordinary !== 887) bad('targets scale to 1000 lots', JSON.stringify(t1000));
if (lp.tierTargets(0).ordinary !== 0 || lp.tierTargets(NaN).prime !== 0) bad('targets for no lots', '');
console.log(`${cities} cities priced`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
