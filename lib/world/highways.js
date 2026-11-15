// Highways (roadmap task 12, first slice; docs/world/world_recipe.md section 4c): a coastal ring road round a landmass, a little inland of the beach, and a spur from each side of the town's
// county road out to it. Pure data in, pure data out: the recipe lists them (`highways: [{ id, landmass, inset }]`) and `buildHighways(world)` returns the roads in world coordinates.
// The ring keeps off steep ground (a point whose ground is higher than MAX_GROUND moves nearer the coast, where the ranges do not reach), off the island's airstrip and off its own tail
// (it must not cross itself). Nothing here is loaded by the game: it is for the map, the bake step and the streaming runtime to read.
import { distToSegment, pointInPolygon, selfIntersects } from './island';
import { elevationAt } from './shapes';

export const HIGHWAY = { step: 28, inset: 30, maxGround: 2.5, maxGrade: 0.12, airstripClear: 34, spurClear: 3, plotMargin: 1, width: 6 };

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

/** Where a ray from `from` along `dir` first crosses the ring, or null. */
function ringHit(from, dir, points) {
  const far = { x: from.x + dir.x * 4000, z: from.z + dir.z * 4000 };
  let hit = null;
  for (let i = 0; i < points.length; i++) {
    const c = crossing(from, far, points[i], points[(i + 1) % points.length]);
    if (c && (!hit || c.t < hit.t)) hit = { ...c, i };
  }
  return hit;
}

/** One straight leg of a spur from a to b: how steep it climbs and how high it goes, or null when it runs through a lot or across the airstrip or climbs more than `maxGrade`. */
function leg(a, b, town, m, maxGrade) {
  const half = HIGHWAY.spurClear;
  for (const p of town.plots) {
    const hw = p.w / 2 + half + HIGHWAY.plotMargin, hd = p.d / 2 + half + HIGHWAY.plotMargin;
    // (the first few units are the junction with the road the spur leaves, which the lots beside that road are allowed to touch)
    for (let k = 0; k <= 40; k++) { const x = a.x + ((b.x - a.x) * k) / 40, z = a.z + ((b.z - a.z) * k) / 40; if (Math.hypot(x - a.x, z - a.z) > 9 && Math.abs(x - p.x) < hw && Math.abs(z - p.z) < hd) return null; }
  }
  const air = m.features.airstrip;
  if (air) {
    const r0 = { x: air.at.x - air.frame.t[0] * air.frame.runwayHalf, z: air.at.z - air.frame.t[1] * air.frame.runwayHalf };
    const r1 = { x: air.at.x + air.frame.t[0] * air.frame.runwayHalf, z: air.at.z + air.frame.t[1] * air.frame.runwayHalf };
    for (let k = 0; k <= 40; k++) if (distToSegment({ x: a.x + ((b.x - a.x) * k) / 40, z: a.z + ((b.z - a.z) * k) / 40 }, r0, r1) < HIGHWAY.airstripClear) return null;
  }
  // the climb: a mountain road climbs, but never like a wall
  const ranges = m.features.ranges ?? [];
  const seed = m.spec.coast.seed;
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const N = Math.max(2, Math.ceil(len / 8));
  let grade = 0;
  let top = 0;
  let prev = elevationAt(ranges, a.x, a.z, seed);
  for (let k = 1; k <= N; k++) {
    const hh = elevationAt(ranges, a.x + ((b.x - a.x) * k) / N, a.z + ((b.z - a.z) * k) / N, seed);
    grade = Math.max(grade, Math.abs(hh - prev) / (len / N));
    top = Math.max(top, hh);
    prev = hh;
  }
  return grade > maxGrade ? null : { len, grade, top };
}

/**
 * A spur from a point on the town's county road, outwards (away from the town) to the ring: straight if that is clear of every lot and the airstrip and not too steep; else, going out `L` units
 * and then turning to the side to reach the ring (a bend round a mountain). Null when no way is found.
 */
function spur(from, dir, points, town, m, maxGrade = HIGHWAY.maxGrade) {
  const hit = ringHit(from, dir, points);
  if (hit) {
    const to = { x: r2(hit.x), z: r2(hit.z) };
    const l = leg(from, to, town, m, maxGrade);
    if (l) return { from: { x: r2(from.x), z: r2(from.z) }, to, joinsRing: hit.i, length: r2(l.len), maxGround: r2(l.top), maxGrade: r2(l.grade) };
  }
  const coast = m.outline.points;
  for (const out of [90, 160, 240, 340, 460, 600, 780]) {
    for (const side of [1, -1]) {
      const via = { x: from.x + dir.x * out, z: from.z + dir.z * out };
      if (!pointInPolygon(via.x, via.z, coast)) continue;
      const turn = { x: -dir.z * side, z: dir.x * side };
      const hit2 = ringHit(via, turn, points);
      if (!hit2) continue;
      const to = { x: r2(hit2.x), z: r2(hit2.z) };
      const l1 = leg(from, via, town, m, maxGrade);
      const l2 = l1 && leg(via, to, town, m, maxGrade);
      if (l1 && l2) return { from: { x: r2(from.x), z: r2(from.z) }, via: { x: r2(via.x), z: r2(via.z) }, to, joinsRing: hit2.i, length: r2(l1.len + l2.len), maxGround: r2(Math.max(l1.top, l2.top)), maxGrade: r2(Math.max(l1.grade, l2.grade)) };
    }
  }
  return null;
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
      spurGround: r2(Math.max(0, ...spurs.map((s) => s.maxGround))), spurGrade: r2(Math.max(0, ...spurs.map((s) => s.maxGrade))),
    };
  });
}

/**
 * The roads that cross the sea (roadmap task 12): a straight causeway between two rings, from the two ring points that are nearest each other, skipping any pair whose line would pass
 * within 60 units of the harbour's quay or piers, or come within the airstrip's clearance, or cross a third landmass. Its water section (from the one coast to the other) is a bridge with
 * `clearance` units under it for boats; the rest of it is road on land. `world.highways` must already hold the rings (buildHighways).
 */
export function buildCauseways(world, rings, specs = world.recipe.causeways ?? []) {
  const built = [];
  for (const c of specs) {
    const A = rings.find((h) => h.id === c.from);
    const B = rings.find((h) => h.id === c.to);
    const la = world.landmasses.find((l) => l.id === A.landmass), lb = world.landmasses.find((l) => l.id === B.landmass);
    const others = world.landmasses.filter((l) => l !== la && l !== lb);
    const keepOff = [];
    for (const m of [la, lb]) {
      const hb = m.features.harbour;
      if (hb) { keepOff.push([hb.quay, hb.quay]); for (const p of hb.piers) keepOff.push([p, { x: p.x + p.out.x * p.length, z: p.z + p.out.z * p.length }]); }
      const air = m.features.airstrip;
      if (air) keepOff.push([{ x: air.at.x - air.frame.t[0] * air.frame.runwayHalf, z: air.at.z - air.frame.t[1] * air.frame.runwayHalf }, { x: air.at.x + air.frame.t[0] * air.frame.runwayHalf, z: air.at.z + air.frame.t[1] * air.frame.runwayHalf }]);
    }
    const pairs = [];
    for (let i = 0; i < A.ring.length; i += 2) for (let j = 0; j < B.ring.length; j += 2) pairs.push({ a: A.ring[i], b: B.ring[j], d: Math.hypot(A.ring[i].x - B.ring[j].x, A.ring[i].z - B.ring[j].z) });
    pairs.sort((u, v) => u.d - v.d);
    for (const { a, b, d } of pairs.slice(0, 4000)) {
      let ok = true;
      for (let k = 0; k <= Math.ceil(d / 6) && ok; k++) {
        const p = { x: a.x + ((b.x - a.x) * k) / Math.ceil(d / 6), z: a.z + ((b.z - a.z) * k) / Math.ceil(d / 6) };
        if (keepOff.some(([u, v]) => distToSegment(p, u, v) < 60)) ok = false;
        else if (others.some((o) => pointInPolygon(p.x, p.z, o.outline.points))) ok = false;
      }
      // a later causeway between the same rings keeps `apart` units from the earlier ones (both ends) and does not cross them
      for (const e of built) {
        if (e.from !== c.from && e.to !== c.to) continue;
        const apart = c.apart ?? 500;
        if (distToSegment(a, e.points[0], e.points[1]) < apart || distToSegment(b, e.points[0], e.points[1]) < apart || crossing(a, b, e.points[0], e.points[1])) ok = false;
      }
      if (!ok) continue;
      // the water section: from where the line leaves the first landmass to where it reaches the second
      const steps = Math.ceil(d / 2);
      const at = (k) => ({ x: a.x + ((b.x - a.x) * k) / steps, z: a.z + ((b.z - a.z) * k) / steps });
      let k0 = 0;
      while (k0 < steps && pointInPolygon(at(k0).x, at(k0).z, la.outline.points)) k0++;
      let k1 = steps;
      while (k1 > 0 && pointInPolygon(at(k1).x, at(k1).z, lb.outline.points)) k1--;
      const w0 = at(k0), w1 = at(k1);
      built.push({
        id: c.id, name: c.name, kind: 'causeway', class: 'highway', width: HIGHWAY.width + 2, from: c.from, to: c.to, landmasses: [A.landmass, B.landmass],
        points: [{ x: r2(a.x), z: r2(a.z) }, { x: r2(b.x), z: r2(b.z) }], length: r2(d),
        bridge: { from: { x: r2(w0.x), z: r2(w0.z) }, to: { x: r2(w1.x), z: r2(w1.z) }, length: r2(Math.hypot(w1.x - w0.x, w1.z - w0.z)), clearance: c.clearance ?? 9 },
      });
      break;
    }
  }
  return built;
}

/**
 * Link roads: a short road from the harbour's quay, and one from the airstrip's apron, to the nearest of the landmass's spurs (not within 50 units of the ring, so it joins the spur and not
 * the coast road), by a straight line that clears every lot. `rings` are what buildHighways made. Returned for each landmass that has a harbour or an airstrip and a town.
 */
export function buildLinks(world, rings) {
  const links = [];
  for (const m of world.landmasses) {
    const town = world.towns.find((t) => t.landmass === m.id);
    const ring = rings.find((h) => h.landmass === m.id);
    if (!town || !ring) continue;
    const wants = [];
    if (m.features.harbour) wants.push({ kind: 'harbour', name: `${m.name} Harbour Road`, from: m.features.harbour.quay });
    if (m.features.airstrip) wants.push({ kind: 'airstrip', name: `${m.name} Airstrip Road`, from: { x: m.features.airstrip.apron.x, z: m.features.airstrip.apron.z } });
    for (const w of wants) {
      let best = null;
      for (const sp of ring.spurs.filter((x) => !x.via)) { // (a spur that bends is not joined: the road is not a straight line)
        const len = sp.length;
        for (let d = 50; d <= len - 20; d += 10) {
          // a point on the spur, `d` units in from where it joins the ring
          const to = { x: sp.to.x + ((sp.from.x - sp.to.x) * d) / len, z: sp.to.z + ((sp.from.z - sp.to.z) * d) / len };
          const dist = Math.hypot(to.x - w.from.x, to.z - w.from.z);
          if (best && dist >= best.length) continue;
          let clear = true;
          for (const p of town.plots) {
            const hw = p.w / 2 + HIGHWAY.spurClear + HIGHWAY.plotMargin, hd = p.d / 2 + HIGHWAY.spurClear + HIGHWAY.plotMargin;
            for (let k = 1; k < 40 && clear; k++) { const x = w.from.x + ((to.x - w.from.x) * k) / 40, z = w.from.z + ((to.z - w.from.z) * k) / 40; if (Math.abs(x - p.x) < hw && Math.abs(z - p.z) < hd && Math.hypot(x - to.x, z - to.z) > 9) clear = false; }
            if (!clear) break;
          }
          if (clear) best = { from: { x: r2(w.from.x), z: r2(w.from.z) }, to: { x: r2(to.x), z: r2(to.z) }, length: r2(dist), spur: sp.side };
        }
      }
      if (best) links.push({ id: `${m.id}-${w.kind}-road`, name: w.name, kind: w.kind, class: 'link', landmass: m.id, width: HIGHWAY.width - 2, ...best });
    }
  }
  return links;
}
