// What a plot of land costs, from what the plot IS rather than from where a generator happened to put it. Pure, and world-agnostic: it takes a few attributes
// of a plot and gives a price, so the same rules apply to the generated test city and to the final, hand-authored world (whose plots carry these attributes in
// their data).
//
//   attrs = {
//     tier        'ordinary' | 'prime' | 'luxury' | 'grand'
//     cells       how many standard plots the lot is worth in area (an ordinary plot is 1; a double-wide prime lot 2; a luxury estate 6)
//     frontage    0 to 3: how well it faces traffic: +1 on a main road, +1 beside a main cross street, +1 on a ring road
//     corner      1 if it stands on a corner (streets on two sides)
//     centrality  0 to 1: how close to the heart of the city (1 in the middle, 0 at the edge)
//     park        1 if it is beside a park
//     anchor      1 if it stands next to another big lot (an anchor tenant lifts its neighbours)
//     waterfront  1 if it is on the river or a lake
//   }
//
// These are the usual real-estate grounds for what a site is worth: location above all (visibility and traffic, a corner, the centre), amenities (a park, the
// water), co-tenancy (an anchor next door) and "plottage" (a large assembled parcel is worth more than the same area in small lots).
//
// Rules (all the numbers are in LAND_PRICING, so they can be tuned in one place):
//   - every plot costs BASE x its worth: area x the tier's premium per cell x (1 + the location bonuses) x (1 + plottage). An ordinary plot with no
//     advantage is worth 1, so it costs the BASE price; one on a main road, a corner or the water costs more (on the live city, $5 to about $10.60 a year)
//   - an ordinary plot never costs less than BASE, and a prime, luxury or grand lot always costs at least a dollar more than BASE
//   - from ROUND_FROM dollars up, prices are rounded to a friendly step
//   - the LOCATION GRADE (A, B, C) says how good a site is whatever is built on it, by how its location bonus ranks in the city (see gradeLocations)
export const LAND_PRICING = {
  base: 5, // what a basic plot costs, in dollars
  // how much more each cell of a lot is worth than an ordinary plot (from the generator's own value model: prime 3.5, luxury 8, grand 12)
  premium: { ordinary: 1, prime: 3.5, luxury: 8, grand: 12 },
  // location bonuses, as a share added to the worth (real-estate rules of thumb: a corner +15%, water views and parks are the biggest amenity premiums): a lot with every
  // advantage is worth about two and a half times the same lot with none
  weights: { frontage: 0.12, corner: 0.15, centrality: 0.25, park: 0.3, anchor: 0.1, waterfront: 0.5 },
  plottage: { perCell: 0.04, max: 0.25 }, // each extra cell of an assembled lot adds this to its worth, up to this much
  grades: { A: 0.9, B: 0.65 }, // a site is grade A if its location bonus is in the top 10% of the city, B in the next 25%, else C
  roundFrom: 20, // prices from here are rounded...
  step: 5, // ...to the nearest multiple of this
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const TIERS = ['ordinary', 'prime', 'luxury', 'grand'];

// Make any input usable: unknown tiers are ordinary, numbers are kept in range.
export function cleanAttrs(input) {
  const a = input && typeof input === 'object' ? input : {};
  const tier = TIERS.includes(a.tier) ? a.tier : 'ordinary';
  return {
    tier,
    cells: clamp(Math.round(Number(a.cells) || 1), 1, 40),
    frontage: clamp(Number(a.frontage) || 0, 0, 3),
    corner: a.corner ? 1 : 0,
    centrality: clamp(Number(a.centrality) || 0, 0, 1),
    park: a.park ? 1 : 0,
    anchor: a.anchor ? 1 : 0,
    waterfront: a.waterfront ? 1 : 0,
  };
}

// How much a location adds: 0 for none, up to about 1 for the best.
export function locationBonus(attrs, cfg = LAND_PRICING) {
  const a = cleanAttrs(attrs);
  const w = cfg.weights;
  return a.frontage * w.frontage + a.corner * w.corner + a.centrality * w.centrality + a.park * w.park + a.anchor * w.anchor + a.waterfront * w.waterfront;
}

// The worth of a plot relative to an ordinary plot with no location advantage (that is 1). This is the figure to compare plots by, ordinary ones too.
export function worthIndex(attrs, cfg = LAND_PRICING) {
  const a = cleanAttrs(attrs);
  const plottage = 1 + Math.min(cfg.plottage.max, cfg.plottage.perCell * (a.cells - 1));
  return a.cells * cfg.premium[a.tier] * (1 + locationBonus(a, cfg)) * plottage;
}

export function roundPrice(price, cfg = LAND_PRICING) {
  return price >= cfg.roundFrom ? Math.round(price / cfg.step) * cfg.step : Math.round(price * 100) / 100;
}

// The land price in dollars, for a year: every tier is priced by its worth. An ordinary plot is at least the base price; the others at least a dollar more.
export function landPrice(attrs, cfg = LAND_PRICING) {
  const a = cleanAttrs(attrs);
  const priced = roundPrice(cfg.base * worthIndex(a, cfg), cfg);
  return a.tier === 'ordinary' ? Math.max(cfg.base, priced) : Math.max(cfg.base + 1, priced);
}

// Why a plot costs what it does, for a plain-language line on the claim form.
export function explainPrice(attrs, cfg = LAND_PRICING) {
  const a = cleanAttrs(attrs);
  const bonus = locationBonus(a, cfg);
  // an ordinary plot with no advantage is just the base price; with one, its location is explained as an estate's is
  if (a.tier === 'ordinary' && bonus === 0) return [`A basic plot: $${cfg.base}`];
  const lines = a.tier === 'ordinary' ? [`A basic plot: $${cfg.base} before its location`] : [`${a.cells} plots of land at ${cfg.premium[a.tier]}x each for a ${a.tier} lot`];
  if (bonus > 0) {
    const parts = [];
    if (a.frontage) parts.push(`${a.frontage === Math.round(a.frontage) ? a.frontage : a.frontage.toFixed(1)} frontage`);
    if (a.corner) parts.push('a corner');
    if (a.centrality >= 0.5) parts.push('central');
    if (a.park) parts.push('beside a park');
    if (a.anchor) parts.push('next to another big lot');
    if (a.waterfront) parts.push('on the water');
    lines.push(`Location adds ${Math.round(bonus * 100)}%: ${parts.join(', ')}`);
  }
  lines.push(`Worth ${worthIndex(a, cfg).toFixed(1)} basic plots: $${landPrice(a, cfg)}`);
  return lines;
}

// A summary of a list of { tier, price } rows: how many, and the lowest, middle and highest price per tier, and the total.
export function summarize(rows) {
  const out = { total: 0, count: rows.length, tiers: {} };
  for (const t of TIERS) {
    const mine = rows.filter((r) => r.tier === t).map((r) => r.price).sort((a, b) => a - b);
    if (!mine.length) continue;
    const sum = mine.reduce((a, b) => a + b, 0);
    out.tiers[t] = { count: mine.length, min: mine[0], median: mine[Math.floor(mine.length / 2)], max: mine[mine.length - 1], sum };
    out.total += sum;
  }
  return out;
}

// Real-estate style location grades. A site's grade is how good its LOCATION is (frontage, corner, centre, park, water, anchor), whatever size it is or what is built on
// it: grade A is the best tenth of the city, B the next quarter, C the rest. `rows` are { ...attrs }; returns the same rows with `locationBonus` and `grade`.
// Comparing a plot's grade with its tier shows where the labels and the locations disagree (a basic plot on a grade A site, a luxury estate on a grade C one).
export function gradeLocations(rows, cfg = LAND_PRICING) {
  const withBonus = rows.map((r) => ({ ...r, locationBonus: locationBonus(r, cfg) }));
  const sorted = withBonus.map((r) => r.locationBonus).sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  const cutA = at(cfg.grades.A);
  const cutB = at(cfg.grades.B);
  return withBonus.map((r) => ({ ...r, grade: r.locationBonus > 0 && r.locationBonus >= cutA ? 'A' : r.locationBonus > 0 && r.locationBonus >= cutB ? 'B' : 'C' }));
}

// How many lots of each tier a city of `total` lots should have. These shares hold however big the world grows (1000+ lots): add roads and plots, then
// the counts follow. Prime is about the best tenth of the locations (Class A), luxury the trophy sites, grand the landmarks. The hand-authored world
// picks its lots by location grade (gradeLocations) up to these counts.
export const TIER_SHARES = { prime: 0.08, luxury: 0.025, grand: 0.008 };
export function tierTargets(total, shares = TIER_SHARES) {
  const n = Math.max(0, Math.floor(total) || 0);
  const grand = Math.round(n * shares.grand);
  const luxury = Math.round(n * shares.luxury);
  const prime = Math.round(n * shares.prime);
  return { prime, luxury, grand, ordinary: Math.max(0, n - prime - luxury - grand) };
}
