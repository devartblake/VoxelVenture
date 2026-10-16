// DESIGN-TIME ONLY: works out the pricing attributes of the generated test city's plots (lib/game/landPrice.js), so that a price can be calibrated against a
// whole city at full occupancy. The final world is hand-authored and its plots carry these attributes in their own data; this file is how a generated city
// is turned into the same kind of data, using the criteria the generator uses to decide which plots are prime and luxury:
//   frontage    a main road in front (+1), a main cross street beside it (+1), a ring road (+1)
//   corner      streets on two sides
//   centrality  how close to the middle of the city
//   park        beside a park
//   anchor      next to another prime, luxury or grand lot
//   waterfront  the river or a lake
// `cells` is the lot's area in standard plots.
import { cleanAttrs, gradeLocations, landPrice, worthIndex } from '../game/landPrice';

const PLOT_AREA = 3 * 3; // an ordinary plot's footprint (PLOT_TILE squared)

const tierOf = (p) => (p.grand ? 'grand' : p.luxury ? 'luxury' : p.prime ? 'prime' : 'ordinary');

// the distance from a point to the nearest edge of an axis-aligned rectangle (0 inside)
const rectGap = (x, z, r) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

export function locationAttrsFor(plot, layout, plots) {
  const hw = (plot.w ?? 3) / 2;
  const hd = (plot.d ?? 3) / 2;
  const reach = Math.max(hw, hd) + 4.2; // a road whose edge is this far from the plot's middle fronts or flanks it
  // the road in front: the nearest road centre line that the plot's front door faces
  let front = null;
  let frontD = Infinity;
  for (const r of layout.roads) {
    const along = r.axis === 'x' ? plot.x : plot.z;
    if (along < r.from - 1 || along > r.to + 1) continue;
    const across = (r.axis === 'x' ? plot.z : plot.x) - r.center;
    const d = Math.abs(across) - (r.axis === 'x' ? hd : hw);
    if (d < frontD) {
      frontD = d;
      front = r;
    }
  }
  let frontage = 0;
  if (front && frontD < 3.2) {
    if (front.class === 'arterial') frontage++;
    if (front.kind === 'ring') frontage++; // a ring road is a main road too, and counts again
  }
  // a main cross street beside it: an arterial running the other way, close to the plot's side
  if (front && frontD < 3.2) {
    const crossAxis = front.axis === 'x' ? 'z' : 'x';
    const flank = layout.roads.some((r) => {
      if (r.axis !== crossAxis || r.class !== 'arterial') return false;
      const side = Math.abs((crossAxis === 'x' ? plot.x : plot.z) - r.center) - (crossAxis === 'x' ? hw : hd);
      const span = crossAxis === 'x' ? plot.z : plot.x;
      return side < 3.2 && span >= r.from - 2 && span <= r.to + 2;
    });
    if (flank) frontage++;
  }
  // a corner: a road of the other direction (any kind) close to the plot's side, as well as the road in front
  let corner = false;
  if (front && frontD < 3.2) {
    const crossAxis = front.axis === 'x' ? 'z' : 'x';
    corner = layout.roads.some((r) => {
      if (r.axis !== crossAxis) return false;
      const side = Math.abs((crossAxis === 'x' ? plot.x : plot.z) - r.center) - (crossAxis === 'x' ? hw : hd);
      const span = crossAxis === 'x' ? plot.z : plot.x;
      return side < 3.2 && span >= r.from - 2 && span <= r.to + 2;
    });
  }
  // the middle of the city: 1 at the centre, falling to 0 near the edge of the built-up land
  const land = layout.land;
  const centre = layout.center;
  const half = land && centre ? Math.min(land.x1 - land.x0, land.z1 - land.z0) / 2 : 1;
  const centrality = centre ? Math.max(0, Math.min(1, 1 - Math.hypot(plot.x - centre.x, plot.z - centre.z) / (half * 0.9))) : 0;
  const park = [...(layout.parks ?? []), ...(layout.amusement ? [{ center: { x: (layout.amusement.rect.x0 + layout.amusement.rect.x1) / 2, z: (layout.amusement.rect.z0 + layout.amusement.rect.z1) / 2 }, width: layout.amusement.rect.x1 - layout.amusement.rect.x0, depth: layout.amusement.rect.z1 - layout.amusement.rect.z0 }] : [])].some((pk) => rectGap(plot.x, plot.z, { x0: pk.center.x - pk.width / 2, x1: pk.center.x + pk.width / 2, z0: pk.center.z - pk.depth / 2, z1: pk.center.z + pk.depth / 2 }) < reach);
  const anchor = plots.some((q) => q !== plot && (q.prime || q.luxury || q.grand) && Math.hypot(q.x - plot.x, q.z - plot.z) < hw + (q.w ?? 3) / 2 + 4.5);
  const waterfront = plot.districtId === 'riverside' || plot.districtId === 'lakeside';
  const cells = plot.cellCount ?? Math.max(1, Math.round(((plot.w ?? 3) * (plot.d ?? 3)) / PLOT_AREA));
  return cleanAttrs({ tier: tierOf(plot), cells, frontage, corner, centrality, park, anchor, waterfront });
}

// The whole city: a row per plot, as if every plot were taken (100% occupancy): its attributes, its worth index and its land price.
export function analyzeCity(plots, layout, cfg) {
  const rows = plots.map((plot) => {
    const attrs = locationAttrsFor(plot, layout, plots);
    return { id: plot.id, x: plot.x, z: plot.z, w: plot.w, d: plot.d, yaw: plot.yaw ?? 0, district: plot.district, ...attrs, worth: worthIndex(attrs, cfg), price: landPrice(attrs, cfg) };
  });
  return gradeLocations(rows, cfg); // adds each site's location grade (A, B or C)
}

// Where the generator's labels and the location grades disagree: basic plots on grade A sites (candidates to be prime), and special lots on grade C sites.
export function mismatches(rows) {
  return {
    upgrade: rows.filter((r) => r.tier === 'ordinary' && r.grade === 'A'),
    weak: rows.filter((r) => r.tier !== 'ordinary' && r.grade === 'C'),
    crossTab: ['ordinary', 'prime', 'luxury', 'grand'].map((t) => ({ tier: t, A: rows.filter((r) => r.tier === t && r.grade === 'A').length, B: rows.filter((r) => r.tier === t && r.grade === 'B').length, C: rows.filter((r) => r.tier === t && r.grade === 'C').length })),
  };
}
