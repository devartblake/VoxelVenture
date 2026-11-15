// A vacant town (the recipe's `vacant: true`; docs/world/world_bake.md, "Plots that have builds on them"): the generator's town with the city's own businesses taken off its lots, so every lot is
// an empty one for a player to claim. Only the generator's own made-up businesses go: an admin building (the companies' headquarters) stays, and so does every plot's id, place, size, facing,
// district and price attributes, so the town's ids and the bake do not move. Pure and deterministic (no random numbers: an empty lot's value comes from its id), so the client, the server and
// the bake all get the same town. Never used for the first town: its businesses are in the live database.
const PREMIUM = { grand: 12, luxury: 8, prime: 3.5 }; // the value multipliers per cell the generator gives an empty estate or prime lot (cityGenerator.js)

/** The plot as an empty lot, or the plot itself when nothing of the city's is on it. */
export function vacatePlot(p) {
  if (p.admin || !p.generated) return p;
  const { buildingType, generated, brand, interiorData, owner, website, title, value, visits, height, color, category, ...keep } = p;
  const cells = p.cellCount ?? 1;
  const kind = p.grand ? 'grand' : p.luxury ? 'luxury' : p.prime ? 'prime' : 'plain';
  const factor = kind === 'plain' ? 1 : Math.round(cells * PREMIUM[kind]);
  return {
    ...keep,
    title: kind === 'grand' ? `Grand Estate #${p.id}` : kind === 'luxury' ? `Luxury Estate #${p.id}` : kind === 'prime' ? `Prime Lot #${p.id}` : `Empty Lot #${p.id}`,
    owner: null,
    website: null,
    value: (50 + ((p.id * 37) % 51)) * factor, // 50 to 100 a cell, as the generator gives an empty lot, but from the id
    visits: (5 + ((p.id * 7) % 56)) * cells,
    height: 0.2,
    color: '#475569',
    category: kind === 'grand' ? 'Grand estate' : kind === 'luxury' ? 'Luxury estate' : kind === 'prime' ? 'Prime lot' : 'Unclaimed',
    interiorData: null,
  };
}

/** A town (generateTown's result) with its generated businesses taken off, and how many were. */
export function vacateTown(city) {
  let cleared = 0;
  const plots = city.plots.map((p) => { const q = vacatePlot(p); if (q !== p) cleared++; return q; });
  return { city: { ...city, plots }, cleared };
}
