// A procedural coastline (docs/world/world_recipe.md, "Landmasses"): a smooth closed shape round a town's land, made from the seed alone, plus the features along it that the
// recipe has slots for: a beach band, a harbour on the side that faces another landmass, headlands, and places for hills. Pure (no game state, no randomness but the seed), so
// it is tested in Node (tests/world-recipe.test.mjs).
//
// The shape is star-shaped round its centre (one radius for every direction), so it can never cross itself: for each of `SAMPLES` directions the radius is what the town's land
// rectangle needs to be fully inside (plus a margin for the beach), made lumpy by a few seeded waves, then smoothed. A final pass guarantees the town is inside, whatever the waves.
//
//   coastOutline({ rect, seed, margin, samples }) -> { centre, points: [{ x, z }], radii }          a closed polygon (the last point does not repeat the first)
//   pointInPolygon(x, z, points)                  -> boolean
//   polygonArea(points) / polygonBounds(points)
//   coastFeatures(outline, { seed, facing })      -> { harbour, beaches, headlands, hills, airstrip }
//   polygonDistance(a, b)                         -> the shortest distance between two outlines' corners and edges (0 when they touch)

export const SAMPLES = 72;

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** How far from the centre of `rect` its edge is, in the direction `angle` (radians, 0 = +x, counter-clockwise on a map with z down is clockwise; only consistency matters). */
function rectRadius(rect, centre, angle) {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  let t = Infinity;
  if (dx > 1e-9) t = Math.min(t, (rect.x1 - centre.x) / dx);
  else if (dx < -1e-9) t = Math.min(t, (rect.x0 - centre.x) / dx);
  if (dz > 1e-9) t = Math.min(t, (rect.z1 - centre.z) / dz);
  else if (dz < -1e-9) t = Math.min(t, (rect.z0 - centre.z) / dz);
  return t;
}

/**
 * The coast round `rect` (a town's land: { x0, x1, z0, z1 }): at least `margin` beyond it everywhere, lumpy by up to about `lump` (a share of the radius), smoothed.
 * The same seed always gives the same shape.
 */
export function coastOutline({ rect, seed, margin = 60, samples = SAMPLES, lump = 0.16 }) {
  const centre = { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 };
  const rnd = mulberry32(seed);
  // a few seeded waves of different lengths: the bays and headlands
  const waves = [2, 3, 5, 7].map((k) => ({ k, phase: rnd() * Math.PI * 2, amp: (0.5 + rnd()) / (k * 0.8) }));
  const total = waves.reduce((s, w) => s + w.amp, 0);
  const need = [];
  const raw = [];
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    const r = rectRadius(rect, centre, a);
    need.push(r + margin);
    const wobble = waves.reduce((s, w) => s + w.amp * Math.sin(w.k * a + w.phase), 0) / total; // -1 to 1
    raw.push((r + margin) * (1 + lump * (0.5 + 0.5 * wobble)) + margin * 0.25 * (0.5 + 0.5 * wobble));
  }
  // smooth round the circle (a few passes of a three-point average), keeping the radius from falling below what the land needs
  let radii = raw;
  for (let pass = 0; pass < 4; pass++) {
    radii = radii.map((_, i) => (radii[(i + samples - 1) % samples] + 2 * radii[i] + radii[(i + 1) % samples]) / 4);
    radii = radii.map((r, i) => Math.max(r, need[i] * 1.02));
  }
  const points = radii.map((r, i) => {
    const a = (i / samples) * Math.PI * 2;
    return { x: Math.round((centre.x + Math.cos(a) * r) * 100) / 100, z: Math.round((centre.z + Math.sin(a) * r) * 100) / 100 };
  });
  return { centre, points, radii: radii.map((r) => Math.round(r * 100) / 100), margin };
}

/** Whether (x, z) is inside the polygon (even-odd). */
export function pointInPolygon(x, z, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export function polygonArea(points) {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a.x * b.z - b.x * a.z;
  }
  return Math.abs(s) / 2;
}

export function polygonBounds(points) {
  return { x0: Math.min(...points.map((p) => p.x)), x1: Math.max(...points.map((p) => p.x)), z0: Math.min(...points.map((p) => p.z)), z1: Math.max(...points.map((p) => p.z)) };
}

const segSegIntersect = (p1, p2, p3, p4) => {
  const d = (p2.x - p1.x) * (p4.z - p3.z) - (p2.z - p1.z) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((p3.x - p1.x) * (p4.z - p3.z) - (p3.z - p1.z) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.z - p1.z) - (p3.z - p1.z) * (p2.x - p1.x)) / d;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
};

/** Whether the polygon crosses itself (a valid coast never does). */
export function selfIntersects(points) {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segSegIntersect(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}

export const distToSegment = (p, a, b) => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = dx === 0 && dz === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
};

/** The shortest distance between two outlines (0 if one crosses or holds the other). */
export function polygonDistance(a, b) {
  for (let i = 0; i < a.length; i++) if (pointInPolygon(a[i].x, a[i].z, b)) return 0;
  for (let i = 0; i < b.length; i++) if (pointInPolygon(b[i].x, b[i].z, a)) return 0;
  let best = Infinity;
  for (const [p, q] of [[a, b], [b, a]]) {
    for (const pt of p) for (let i = 0; i < q.length; i++) best = Math.min(best, distToSegment(pt, q[i], q[(i + 1) % q.length]));
  }
  return best;
}

/**
 * The features along a coast, in the recipe's slots:
 *   harbour    the coast point that faces `facing` (a direction { x, z } towards the nearest other landmass): where piers and a quay go, with the way out to sea
 *   beaches    stretches of coast (index ranges into points) that are flat and low: every stretch where the coast turns slowly
 *   headlands  the farthest points: where a lighthouse or a lookout could stand
 *   hills      places between the town's land and the coast, away from the harbour, for rises in the ground
 *   airstrip   a short runway with an apron in the free band between the town's land and the coast, on the side farthest from the harbour: a destination for flights
 *              (docs/world/player_flight.md); null when no side has room. `frame` is the runway frame the city's airports use
 */
export function coastFeatures(outline, { seed, facing = { x: 1, z: 0 }, landRect = null } = {}) {
  const { centre, points, radii } = outline;
  const n = points.length;
  const rnd = mulberry32(seed ^ 0x5bd1e995);
  const len = Math.hypot(facing.x, facing.z) || 1;
  const fx = facing.x / len;
  const fz = facing.z / len;
  let h = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < n; i++) {
    const dot = ((points[i].x - centre.x) * fx + (points[i].z - centre.z) * fz) / radii[i];
    if (dot > bestDot) { bestDot = dot; h = i; }
  }
  const out = { x: fx, z: fz };
  const harbour = { at: points[h], index: h, out, quay: { x: r2(points[h].x - out.x * 6), z: r2(points[h].z - out.z * 6) }, piers: [-1, 0, 1].map((k) => { const p = points[(h + k * 3 + n) % n]; return { x: p.x, z: p.z, length: 26 + Math.round(rnd() * 10), out }; }) };
  // beaches: runs where the radius changes slowly between neighbours
  const beaches = [];
  let run = null;
  for (let i = 0; i < n; i++) {
    const slow = Math.abs(radii[(i + 1) % n] - radii[i]) < 2.2;
    if (slow) { if (!run) run = { from: i, to: i }; else run.to = i; } else if (run) { if (run.to - run.from >= 4) beaches.push(run); run = null; }
  }
  if (run && run.to - run.from >= 4) beaches.push(run);
  // headlands: local maxima of the radius, the biggest few
  const heads = [];
  for (let i = 0; i < n; i++) if (radii[i] >= radii[(i + n - 1) % n] && radii[i] >= radii[(i + 1) % n]) heads.push({ index: i, at: points[i], radius: radii[i] });
  heads.sort((a, b) => b.radius - a.radius);
  // hills: between the land rectangle and the coast, in directions away from the harbour
  const hills = [];
  if (landRect) {
    for (let tries = 0; tries < 60 && hills.length < 3; tries++) {
      const i = Math.floor(rnd() * n);
      const a = outline.angles ? outline.angles[i] : (i / n) * Math.PI * 2; // a template coast (shapes.js) is not evenly spaced round its centre: it says its own angles
      const dot = Math.cos(a) * fx + Math.sin(a) * fz;
      if (dot > 0.3) continue;
      const r = radii[i] * (0.8 + rnd() * 0.1);
      const x = centre.x + Math.cos(a) * r;
      const z = centre.z + Math.sin(a) * r;
      if (x > landRect.x0 && x < landRect.x1 && z > landRect.z0 && z < landRect.z1) continue; // not on the town
      if (hills.some((q) => Math.hypot(q.x - x, q.z - z) < 70)) continue;
      hills.push({ x: r2(x), z: r2(z), radius: 28 + Math.round(rnd() * 16), height: 6 + Math.round(rnd() * 5) });
    }
  }
  // airstrip: a short runway in the free band between the town's land and the coast, on the side farthest from the harbour, clear of the hills and of the beach
  let airstrip = null;
  if (landRect) {
    const half = AIRSTRIP.length / 2;
    const cx = (landRect.x0 + landRect.x1) / 2;
    const cz = (landRect.z0 + landRect.z1) / 2;
    // the four sides of the town's land: `out` points away from the town, `t` runs along the side (the runway's direction)
    const sides = [
      { out: { x: 0, z: -1 }, t: [1, 0], at: { x: cx, z: landRect.z0 } },
      { out: { x: 0, z: 1 }, t: [1, 0], at: { x: cx, z: landRect.z1 } },
      { out: { x: 1, z: 0 }, t: [0, 1], at: { x: landRect.x1, z: cz } },
      { out: { x: -1, z: 0 }, t: [0, 1], at: { x: landRect.x0, z: cz } },
    ].sort((a, b) => a.out.x * fx + a.out.z * fz - (b.out.x * fx + b.out.z * fz)); // the side facing away from the harbour first
    const clearOfCoast = (x, z) => pointInPolygon(x, z, points) && Math.min(...points.map((p, i) => distToSegment({ x, z }, p, points[(i + 1) % n]))) >= AIRSTRIP.coastClearance;
    search: for (const side of sides) {
      for (const slide of [0, -45, 45, -90, 90]) {
        for (const gap of AIRSTRIP.gaps) {
          const origin = { x: side.at.x + side.out.x * gap + side.t[0] * slide, z: side.at.z + side.out.z * gap + side.t[1] * slide };
          const corners = [[-half, -AIRSTRIP.depth], [half, -AIRSTRIP.depth], [-half, AIRSTRIP.depth], [half, AIRSTRIP.depth]].map(([a, b]) => ({ x: origin.x + side.t[0] * a + side.out.x * b, z: origin.z + side.t[1] * a + side.out.z * b }));
          if (!corners.every((c) => clearOfCoast(c.x, c.z))) continue;
          if (hills.some((q) => Math.hypot(q.x - origin.x, q.z - origin.z) < q.radius + half + 14)) continue;
          if (Math.hypot(harbour.at.x - origin.x, harbour.at.z - origin.z) < 70) continue;
          // `frame` is the shape the city's airports use (lib/city/cityGenerator.js, lib/sim/flight.js): the runway's middle, along it (t), towards the town (n), and half its length
          const into = { x: -side.out.x, z: -side.out.z };
          airstrip = {
            at: { x: r2(origin.x), z: r2(origin.z) },
            length: AIRSTRIP.length,
            width: AIRSTRIP.width,
            heading: r2(Math.atan2(side.t[0], side.t[1])),
            apron: { x: r2(origin.x + into.x * (AIRSTRIP.width / 2 + AIRSTRIP.apron / 2)), z: r2(origin.z + into.z * (AIRSTRIP.width / 2 + AIRSTRIP.apron / 2)), along: r2(AIRSTRIP.length * 0.4), across: AIRSTRIP.apron },
            side: side.out.x === 0 ? (side.out.z < 0 ? 'north' : 'south') : side.out.x > 0 ? 'east' : 'west',
            frame: { origin: { x: r2(origin.x), z: r2(origin.z) }, t: side.t, n: [into.x, into.z], runwayN: 0, runwayHalf: half },
          };
          break search;
        }
      }
    }
  }
  return { harbour, beaches, headlands: heads.slice(0, 3), hills, airstrip };
}
// The island's airstrip is smaller than the mainland's international airport (a 116-unit runway): a short field, a strip of apron on the town's side, and room round it.
export const AIRSTRIP = { length: 92, width: 12, apron: 16, depth: 22, coastClearance: 14, gaps: [44, 56, 68] };
const r2 = (v) => Math.round(v * 100) / 100;
