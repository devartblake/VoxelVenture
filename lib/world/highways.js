// Highways (roadmap task 12, first slice; docs/world/world_recipe.md section 4c): a coastal ring road round a landmass, a little inland of the beach, and a spur from each side of the town's
// county road out to it. Pure data in, pure data out: the recipe lists them (`highways: [{ id, landmass, inset }]`) and `buildHighways(world)` returns the roads in world coordinates.
// The ring keeps off steep ground (a point whose ground is higher than MAX_GROUND moves nearer the coast, where the ranges do not reach), off the island's airstrip and off its own tail
// (it must not cross itself). Nothing here is loaded by the game: it is for the map, the bake step and the streaming runtime to read.
import { distToSegment, pointInPolygon, selfIntersects } from './island';
import { elevationAt } from './shapes';

export const HIGHWAY = { step: 28, inset: 30, maxGround: 2.5, airstripClear: 34, spurClear: 3, plotMargin: 1, width: 6 };

const FRACTIONS = Array.from({ length: 41 }, (_, i) => 0.5 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.0245); // the middle first, then out to both ends
const r2 = (n) => Math.round(n * 100) / 100;
const coastDistance = (x, z, pts) => { let best = Infinity; for (let i = 0; i < pts.length; i++) best = Math.min(best, distToSegment({ x, z }, pts[i], pts[(i + 1) % pts.length])); return best; };

/** The closed outline walked at an even step. */
function resample(pts, step) {
  const out = [];
  const n = pts.length;
  let carry = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    let d = carry;
    while (d < len) { out.push({ x: a.x + ((b.x - a.x) * d) / len, z: a.z + ((b.z - a.z) * d) / len }); d += step; }
    carry = d - len;
  }
  return out;
}

const signedArea = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i]; const b = pts[(i + 1) % pts.length]; s += a.x * b.z - b.x * a.z; } return s / 2; };

function crossing(p, q, a, b) {
  const rx = q.x - p.x, rz = q.z - p.z, sx = b.x - a.x, sz = b.z - a.z;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((a.x - p.x) * sz - (a.z - p.z) * sx) / den;
  const u = ((a.x - p.x) * rz - (a.z - p.z) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, x: p.x + rx * t, z: p.z + rz * t, seg: a } : null;
}


/** A closed road with any small loop cut out (where it crosses itself, the points between the two crossing segments go). */
function withoutLoops(points) {
  let pts = points;
  for (let round = 0; round < 20; round++) {
    let found = null;
    const n = pts.length;
    for (let i = 0; i < n && !found; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (crossing(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) { found = [i, j]; break; }
      }
    }
    if (!found) return pts;
    pts = [...pts.slice(0, found[0] + 1), ...pts.slice(found[1] + 1)]; // the points i+1 .. j are the loop
  }
  return pts;
}

/** One coastal ring on a landmass, as a closed list of points, and how it was chosen. */
function ring(m, inset, seed) {
  const coast = m.outline.points;
  const ranges = m.features.ranges ?? [];
  const air = m.features.airstrip;
  const runway = air ? { a: { x: air.at.x - air.frame.t[0] * air.frame.runwayHalf, z: air.at.z - air.frame.t[1] * air.frame.runwayHalf }, b: { x: air.at.x + air.frame.t[0] * air.frame.runwayHalf, z: air.at.z + air.frame.t[1] * air.frame.runwayHalf } } : null;
  const P = resample(coast, HIGHWAY.step);
  const n = P.length;
  const sign = signedArea(coast) > 0 ? 1 : -1;
  const ground = (x, z) => elevationAt(ranges, x, z, seed);
  const offsets = [1, 0.75, 0.55, 1.5, 2, 3, 4].map((k) => k * inset);
  const chosen = P.map((p, i) => {
    const a = P[(i + n - 2) % n], b = P[(i + 2) % n];
    const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
    const nx = (-tz / l) * sign, nz = (tx / l) * sign; // a unit step into the land
    let fallback = null; // the first distance in that is on land, clear of the coast and of the airstrip (even if the ground there is steep)
    for (const d of offsets) {
      const q = { x: p.x + nx * d, z: p.z + nz * d };
      if (!pointInPolygon(q.x, q.z, coast) || coastDistance(q.x, q.z, coast) < d * 0.8) continue;
      if (runway && distToSegment(q, runway.a, runway.b) < HIGHWAY.airstripClear) continue;
      fallback ??= d;
      if (ground(q.x, q.z) <= HIGHWAY.maxGround) return { d, nx, nz };
    }
    return fallback === null ? null : { d: fallback, nx, nz };
  });
  // the distances in from the coast are smoothed, so the road is a curve, not a saw; the smoothed point is kept only if it is still on land and clear of the airstrip
  // a point with no room (the thin tip of an island, narrower than the road's distance from the coast) is left out: the road cuts across the tip instead of folding back on itself
  const keep = chosen.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  const C = keep.map((i) => chosen[i]);
  const Q = keep.map((i) => P[i]);
  const N = C.length;
  const W = 3;
  const points = C.map((c, i) => {
    let s = 0;
    for (let k = -W; k <= W; k++) s += C[(i + k + N) % N].d;
    const d = s / (2 * W + 1);
    const q = { x: Q[i].x + c.nx * d, z: Q[i].z + c.nz * d };
    const raw = { x: Q[i].x + c.nx * c.d, z: Q[i].z + c.nz * c.d };
    return pointInPolygon(q.x, q.z, coast) && coastDistance(q.x, q.z, coast) >= d * 0.75 && !(runway && distToSegment(q, runway.a, runway.b) < HIGHWAY.airstripClear) ? q : raw;
  }).map((q) => ({ x: r2(q.x), z: r2(q.z) }));
  return withoutLoops(points);
}

/** The ground's slope along a road: the steepest rise in height over distance, and the highest ground. */
function profile(points, ranges, seed, closed) {
  let maxGround = 0;
  let maxGrade = 0;
  const m = closed ? points.length : points.length - 1;
  for (let i = 0; i < m; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const ha = elevationAt(ranges, a.x, a.z, seed), hb = elevationAt(ranges, b.x, b.z, seed);
    maxGround = Math.max(maxGround, ha, hb);
    maxGrade = Math.max(maxGrade, Math.abs(hb - ha) / (Math.hypot(b.x - a.x, b.z - a.z) || 1));
  }
  return { maxGround: r2(maxGround), maxGrade: r2(maxGrade) };
}

/** A straight spur from a point on the town's county road, outwards (away from the town) to the ring, or null when something is in the way. */
function spur(from, dir, points, town, m) {
  const far = { x: from.x + dir.x * 4000, z: from.z + dir.z * 4000 };
  let hit = null;
  for (let i = 0; i < points.length; i++) {
    const c = crossing(from, far, points[i], points[(i + 1) % points.length]);
    if (c && (!hit || c.t < hit.t)) hit = { ...c, i };
  }
  if (!hit) return null;
  const to = { x: r2(hit.x), z: r2(hit.z) };
  const half = HIGHWAY.spurClear;
  for (const p of town.plots) {
    const hw = p.w / 2 + half + HIGHWAY.plotMargin, hd = p.d / 2 + half + HIGHWAY.plotMargin;
    const near = (x, z) => Math.abs(x - p.x) < hw && Math.abs(z - p.z) < hd;
    // (the first few units are the junction with the road the spur leaves, which the lots beside that road are allowed to touch)
    for (let k = 0; k <= 40; k++) { const x = from.x + ((to.x - from.x) * k) / 40, z = from.z + ((to.z - from.z) * k) / 40; if (Math.hypot(x - from.x, z - from.z) > 9 && near(x, z)) return null; }
  }
  const air = m.features.airstrip;
  if (air) {
    const a = { x: air.at.x - air.frame.t[0] * air.frame.runwayHalf, z: air.at.z - air.frame.t[1] * air.frame.runwayHalf };
    const b = { x: air.at.x + air.frame.t[0] * air.frame.runwayHalf, z: air.at.z + air.frame.t[1] * air.frame.runwayHalf };
    for (let k = 0; k <= 40; k++) if (distToSegment({ x: from.x + ((to.x - from.x) * k) / 40, z: from.z + ((to.z - from.z) * k) / 40 }, a, b) < HIGHWAY.airstripClear) return null;
  }
  return { from: { x: r2(from.x), z: r2(from.z) }, to, joinsRing: hit.i, length: r2(Math.hypot(to.x - from.x, to.z - from.z)) };
}

/** The recipe's highways, as roads in world coordinates. `world` is what buildWorld has made so far (landmasses with features, towns with plots and roads). */
export function buildHighways(world, specs = world.recipe.highways ?? []) {
  return specs.map((h) => {
    const m = world.landmasses.find((l) => l.id === h.landmass);
    const seed = m.spec.coast.seed;
    const points = ring(m, h.inset ?? HIGHWAY.inset, seed);
    const spurs = [];
    for (const t of world.towns.filter((x) => x.landmass === m.id)) {
      const centre = { x: (t.land.x0 + t.land.x1) / 2, z: (t.land.z0 + t.land.z1) / 2 };
      // one spur out of each side of the county ring (north, south, east, west). The roads are lined with lots, so a spur starts either at a gap along a road, going straight out from it, or
      // at the end of a road, going on in line with it past the corner. The first that is clear of every lot (and of the airstrip) is used.
      const sides = new Map();
      const counties = t.roads.filter((r) => r.kind === 'county');
      const candidates = [];
      for (const road of counties) {
        const out = road.axis === 'x' ? { x: 0, z: Math.sign(road.center - centre.z) || 1 } : { x: Math.sign(road.center - centre.x) || 1, z: 0 };
        for (const f of FRACTIONS) { const along = road.from + (road.to - road.from) * f; candidates.push({ road, dir: out, at: road.axis === 'x' ? { x: along, z: road.center } : { x: road.center, z: along } }); }
      }
      for (const road of counties) {
        for (const [end, k] of [[road.from, -1], [road.to, 1]]) candidates.push({ road, dir: road.axis === 'x' ? { x: k, z: 0 } : { x: 0, z: k }, at: road.axis === 'x' ? { x: end, z: road.center } : { x: road.center, z: end } });
      }
      for (const c of candidates) {
        const side = `${c.dir.x},${c.dir.z}`;
        if (sides.has(side)) continue;
        const s = spur(c.at, c.dir, points, t, m);
        if (s) { sides.set(side, true); spurs.push({ ...s, town: t.id, road: c.road.id, side: c.dir.x > 0 ? 'east' : c.dir.x < 0 ? 'west' : c.dir.z > 0 ? 'south' : 'north' }); }
      }
    }
    const ranges = m.features.ranges ?? [];
    const length = r2(points.reduce((s, p, i) => s + Math.hypot(points[(i + 1) % points.length].x - p.x, points[(i + 1) % points.length].z - p.z), 0));
    return {
      id: h.id, name: h.name, landmass: m.id, kind: 'coastal', class: 'highway', width: HIGHWAY.width, inset: h.inset ?? HIGHWAY.inset,
      ring: points, simple: !selfIntersects(points), spurs, length, ...profile(points, ranges, seed, true),
      spurGround: r2(Math.max(0, ...spurs.map((s) => profile([s.from, s.to], ranges, seed, false).maxGround))),
    };
  });
}
