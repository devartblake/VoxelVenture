// Coasts that look like real islands (docs/world/world_recipe.md, "Landmasses"). `coastOutline` (island.js) makes a smooth lumpy ring round a town's land, which is what a small
// island needs but is why the first landmass looked like a rounded square. This makes a landmass from a hand-drawn TEMPLATE instead: the mainland is a variation of Jamaica.
//
// A template is an outline in longitude and latitude, drawn clockwise from its western tip, with mountain ranges as lines. `templateOutline` turns it into a coast in game units:
//   1. longitude and latitude become a flat map (east is +x, north is -z, as on the game's map), at the size asked for (`length`, the east-to-west reach) and stretched north to south
//      by `stretch`: a variation, not a copy (Jamaica is long and thin; the town's land needs room)
//   2. a seeded variation (low waves of radius round the centre, a few per cent) and a small turn, so it is Jamaica's kind of shape, not Jamaica
//   3. two rounds of corner-cutting, so the coast is smooth and bays are bays
//   4. the anchor (a place on the template, where the town stands) is moved to the middle of the town's land, and the whole shape is scaled up from there until the land is inside it
//      with `margin` units of beach to spare: the town always fits, whatever the seed
// Pure: no randomness but the seed, so it is tested in Node (tests/world-recipe.test.mjs).
import { distToSegment, pointInPolygon, polygonArea, polygonBounds, selfIntersects } from './island';

// Jamaica's coast: [longitude, latitude]. Drawn by hand from its well-known shape, not traced from a survey: the western tip at Negril, the long north coast past Montego Bay, Ocho Rios and
// Port Antonio, Morant Point in the east, then back west along the south coast: the Kingston harbour inlet behind the Palisadoes spit, Hellshire, the great bay of Portland Bight with
// Portland Ridge on its seaward side, and the Black River bulge before Negril.
export const JAMAICA = [
  [-78.37, 18.26], [-78.34, 18.32], [-78.28, 18.38], [-78.18, 18.45], [-78.06, 18.47], [-77.93, 18.49], [-77.80, 18.51], [-77.65, 18.51], [-77.50, 18.47], [-77.35, 18.46],
  [-77.20, 18.44], [-77.10, 18.42], [-76.98, 18.40], [-76.89, 18.37], [-76.78, 18.28], [-76.65, 18.23], [-76.52, 18.19], [-76.44, 18.18], [-76.36, 18.15], [-76.29, 18.06],
  [-76.22, 17.97], [-76.19, 17.90], // Morant Point
  [-76.30, 17.87], [-76.41, 17.88], [-76.55, 17.87], [-76.68, 17.88], [-76.76, 17.93], [-76.83, 17.93], [-76.89, 17.96], [-76.94, 17.95], [-76.97, 17.90], // Kingston harbour
  [-77.02, 17.84], [-77.10, 17.86], [-77.17, 17.83], [-77.19, 17.76], [-77.15, 17.70], [-77.25, 17.71], [-77.30, 17.80], // Portland Bight and Ridge
  [-77.45, 17.85], [-77.56, 17.86], [-77.70, 17.86], [-77.77, 17.87], [-77.86, 17.99], [-77.96, 18.05], [-78.03, 18.08], [-78.13, 18.22], [-78.25, 18.25],
];

// Its mountains, as lines with a width in degrees: the Blue Mountains in the east, Cockpit Country in the west, Dolphin Head, and the central hills. `height` is for the map.
export const JAMAICA_RANGES = [
  { name: 'Blue Mountains', line: [[-76.72, 18.09], [-76.60, 18.08], [-76.48, 18.07], [-76.38, 18.10]], width: 0.06, height: 14 },
  { name: 'Cockpit Country', line: [[-77.80, 18.27], [-77.66, 18.29], [-77.52, 18.26]], width: 0.09, height: 8 },
  { name: 'Dolphin Head', line: [[-78.19, 18.37], [-78.14, 18.33]], width: 0.04, height: 7 },
  { name: 'The Central Hills', line: [[-77.46, 18.17], [-77.32, 18.15], [-77.22, 18.18]], width: 0.05, height: 6 },
];

export const TEMPLATES = { jamaica: { name: 'Jamaica', points: JAMAICA, ranges: JAMAICA_RANGES } };

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const r2 = (v) => Math.round(v * 100) / 100;

/** Two rounds of corner-cutting on a closed polygon: every corner is replaced by two points a quarter of the way along its edges. */
export function chaikin(points, rounds = 2) {
  let pts = points;
  for (let round = 0; round < rounds; round++) {
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      next.push({ x: 0.75 * a.x + 0.25 * b.x, z: 0.75 * a.z + 0.25 * b.z }, { x: 0.25 * a.x + 0.75 * b.x, z: 0.25 * a.z + 0.75 * b.z });
    }
    pts = next;
  }
  return pts;
}

function centroid(points) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    const f = p.x * q.z - q.x * p.z;
    a += f; cx += (p.x + q.x) * f; cz += (p.z + q.z) * f;
  }
  return { x: cx / (3 * a), z: cz / (3 * a) };
}

/** The smallest distance from (x, z) to the polygon's edges. */
const coastDistance = (x, z, points) => Math.min(...points.map((p, i) => distToSegment({ x, z }, p, points[(i + 1) % points.length])));

/** Points all round the edge of `rect` (corners and every `step` units). */
function rectEdge(rect, step = 24) {
  const out = [];
  for (let x = rect.x0; x <= rect.x1 + 1e-6; x += step) out.push({ x, z: rect.z0 }, { x, z: rect.z1 });
  for (let z = rect.z0; z <= rect.z1 + 1e-6; z += step) out.push({ x: rect.x0, z }, { x: rect.x1, z });
  out.push({ x: rect.x1, z: rect.z1 }, { x: rect.x1, z: rect.z0 }, { x: rect.x0, z: rect.z1 }, { x: rect.x0, z: rect.z0 });
  return out;
}

/**
 * @param {{ template: string, rect: {x0,x1,z0,z1}, seed: number, length: number, anchor: {lon:number, lat:number}, stretch?: number, rotate?: number, variation?: number, margin?: number }} o
 * @returns {{ centre, points, radii, angles, margin, kind: 'template', template: string, scale: number, ranges: { name, points, width, height }[] }}
 *   in the town's own coordinates (the rect's): the caller moves it
 */
export function templateOutline({ template = 'jamaica', rect, seed, length, anchor, stretch = 1, rotate = 0, variation = 0.06, margin = 60 }) {
  const t = TEMPLATES[template];
  if (!t) throw new Error(`there is no coast template called ${template}`);
  const cosLat = Math.cos((anchor.lat * Math.PI) / 180);
  // a flat map in "degrees of latitude": east is +x (longitude shrinks with the cosine of the latitude), north is -z
  const flat = (lon, lat) => ({ x: (lon - anchor.lon) * cosLat, z: -(lat - anchor.lat) * stretch });
  let outline = t.points.map(([lon, lat]) => flat(lon, lat));
  const bx = polygonBounds(outline);
  const unit = length / (bx.x1 - bx.x0); // units per degree of latitude
  const turn = (rotate * Math.PI) / 180;
  const place = (p) => {
    const x = p.x * unit, z = p.z * unit;
    return { x: x * Math.cos(turn) - z * Math.sin(turn), z: x * Math.sin(turn) + z * Math.cos(turn) };
  };
  outline = outline.map(place);

  // the seeded variation: the radius from the centre, changed a few per cent by waves of a few lengths. Halved until the coast is still a single simple shape.
  const rnd = mulberry32(seed);
  const waves = [1, 2, 3, 4].map((k) => ({ k, phase: rnd() * Math.PI * 2, amp: (0.5 + rnd()) / k }));
  const total = waves.reduce((s, w) => s + w.amp, 0);
  const c0 = centroid(outline);
  const vary = (amount) => outline.map((p) => {
    const a = Math.atan2(p.z - c0.z, p.x - c0.x);
    const f = 1 + amount * (waves.reduce((s, w) => s + w.amp * Math.sin(w.k * a + w.phase), 0) / total);
    return { x: c0.x + (p.x - c0.x) * f, z: c0.z + (p.z - c0.z) * f };
  });
  let amount = variation;
  let varied = vary(amount);
  while (selfIntersects(chaikin(varied)) && amount > 0.002) { amount /= 2; varied = vary(amount); }
  const smooth = chaikin(varied);
  if (selfIntersects(smooth)) throw new Error(`the ${template} coast crosses itself`);

  // the anchor is the middle of the town's land: move the shape there, and scale it up from there until the land is inside with `margin` to spare
  const middle = { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 };
  const edge = rectEdge(rect);
  let scale = 1;
  let points = null;
  for (let tries = 0; tries < 60; tries++) {
    points = smooth.map((p) => ({ x: middle.x + p.x * scale, z: middle.z + p.z * scale }));
    if (edge.every((e) => pointInPolygon(e.x, e.z, points) && coastDistance(e.x, e.z, points) >= margin)) break;
    scale *= 1.03;
    points = null;
  }
  if (!points) throw new Error(`the town's land does not fit inside the ${template} coast at its anchor`);
  const rounded = points.map((p) => ({ x: r2(p.x), z: r2(p.z) }));
  const centre = centroid(rounded);
  const radii = rounded.map((p) => r2(Math.hypot(p.x - centre.x, p.z - centre.z)));
  const angles = rounded.map((p) => Math.atan2(p.z - centre.z, p.x - centre.x));
  // the mountain ranges follow the same steps (without the variation: they are lines on the land); each is clipped to the land, and the ones that touch the town are not drawn
  const ranges = t.ranges.map((rg) => ({
    name: rg.name,
    width: r2(rg.width * unit * scale),
    height: rg.height,
    points: rg.line.map(([lon, lat]) => { const p = place(flat(lon, lat)); return { x: r2(middle.x + p.x * scale), z: r2(middle.z + p.z * scale) }; }),
  })).filter((rg) => rg.points.every((p) => pointInPolygon(p.x, p.z, rounded) && coastDistance(p.x, p.z, rounded) > 25) && !rg.points.some((p) => p.x > rect.x0 - 40 && p.x < rect.x1 + 40 && p.z > rect.z0 - 40 && p.z < rect.z1 + 40));
  return { centre: { x: r2(centre.x), z: r2(centre.z) }, points: rounded, radii, angles, margin, kind: 'template', template, scale: r2(scale), area: Math.round(polygonArea(rounded)), ranges };
}

/** The shortest distance from (x, z) to a line of points. */
const lineDistance = (x, z, line) => {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, distToSegment({ x, z }, line[i], line[i + 1]));
  return line.length === 1 ? Math.hypot(x - line[0].x, z - line[0].z) : best;
};
const smoothstep = (t) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

/**
 * The ground's height at (x, z), in game units, from a landmass's mountain ranges (`features.ranges`): 0 away from every range, rising smoothly to the range's `height` along its line, with
 * the lumpiness of real peaks (a few seeded waves, so no range is a smooth ridge). A range is `width` wide at its foot. This is the same kind of function as the low hills near the first
 * town (lib/city/hills.js: a tall building is about 1.5 units, those hills are at most 2.2); these are mountains, up to the ranges' heights (14 for the Blue Mountains).
 * Pure and continuous, so a terrain mesh, the ground height under a car or an avatar, and the collision for a slope can all read the same number. The game does not read it yet.
 */
export function elevationAt(ranges, x, z, seed = 0) {
  let h = 0;
  for (const rg of ranges ?? []) {
    const half = rg.width / 2;
    const d = lineDistance(x, z, rg.points);
    if (d >= half) continue;
    const ph = (k) => (((Math.imul(seed + k * 7919 + rg.name.length * 104729, 2654435761) >>> 0) % 6283) / 1000);
    const scale = Math.max(8, rg.width * 0.3);
    const lumps = 0.5 + 0.25 * Math.sin(x / scale + ph(1)) * Math.cos(z / (scale * 1.3) + ph(2)) + 0.25 * Math.sin((x + z) / (scale * 0.7) + ph(3)); // about 0..1
    h = Math.max(h, rg.height * smoothstep(1 - d / half) * (0.7 + 0.3 * Math.max(0, Math.min(1, lumps))));
  }
  return Math.round(h * 100) / 100;
}
