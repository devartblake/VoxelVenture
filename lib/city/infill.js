// The infill planner (design time): finds the free ground between existing roads and plans new local streets across it, each running from one road to the
// next, so that every new street ends in a junction at both ends and lots stand on both sides. Pure geometry, so it is tested in Node.
//
// A street at x = c (axis 'z') runs between two roads that run east-west (axis 'x'), A above and B below, and needs a free strip 9.4 wide (the street, and
// a row of lots each side) between them. The same for a street at z = c (axis 'x') between two north-south roads. All candidates are listed, the
// longest first (nearest the middle of the city breaking ties), and each is kept if its strip is still free after the ones kept before it, until
// the lots they will hold reach what was asked for. The city generator adds them as roads and fills them with lots (lib/city/cityGenerator.js).
import { RectIndex } from './freeLand';

// the generator's geometry (cityGenerator.js: PLOT_TILE, PLOT_GAP, HALF_CORRIDOR), repeated here so this file needs nothing from it
export const GEOM = { tile: 3, pitch: 3.4, halfCorridor: 1.4 };
// The lots on the new streets are not packed like the main grid: each stands back from the street (room for a drive, parking or a garden in front), is
// spaced from its neighbours along the street, and has a yard behind it, so the roofs (and the billboards on them) can be seen and an owner can add
// parking or other things in front of or behind the building. `yard` is the space between two rows that back onto each other.
export const LOTS = { setback: 1.5, pitch: 5, yard: 3 };
const ROW_REACH = GEOM.halfCorridor + LOTS.setback + GEOM.tile + LOTS.yard / 2; // from a street's middle to the far edge of its lots, plus half the yard
export const STRIP_HALF_WIDTH = ROW_REACH;

export const INFILL = {
  minPerSide: 3, // a street needs at least this many lots on each side
  maxLength: 90, // between its two roads
  endMargin: 8, // from the end of the road it joins
  junctionSpacing: 6.5, // from any other junction on that road
  keepOutMargin: 3, // from the ends of a stretch that must stay clear of junctions
  kinds: ['avenue', 'street', 'ring', 'county', 'infill', 'lake'], // the roads a new street may join
};

// Positions along each road where an earlier planned street already makes a junction (road id -> [positions]), so no two new junctions end up closer than
// `spacing`, in particular not two streets facing each other across a road at the same place (that would be two junctions on one spot).
const claimedNear = (claimed, id, c, spacing) => (claimed.get(id) ?? []).some((q) => Math.abs(q - c) < spacing);
const claim = (claimed, id, c) => claimed.set(id, [...(claimed.get(id) ?? []), c]);

const lotsPerSide = (length) => (length < GEOM.tile ? 0 : Math.floor((length - GEOM.tile) / LOTS.pitch) + 1);

// `roads`: the existing roads. `obstacles`: rectangles in the way (roads' corridors, plots, billboards, parks, reserved land, water, airports, hills, malls).
// `bounds`: where streets may go. `extra`: how many lots to plan for (counting both sides of every street). `centre`: { x, z } of the city.
// Returns { streets: [{ axis, center, from, to, a, b, perSide, lots }], lots, candidates }.
export function planInfill({ roads, obstacles, bounds, extra, centre, keepOut = [], claimed = new Map(), opts = {} }) {
  const cfg = { ...INFILL, ...opts };
  const index = obstacles instanceof RectIndex ? obstacles : new RectIndex(obstacles);
  const usable = (r) => cfg.kinds.includes(r.kind) && !r.design;
  const junctionsOf = new Map();
  const junctionsOn = (road) => {
    if (!junctionsOf.has(road.id)) {
      const list = [];
      for (const q of roads) if (q.axis !== road.axis && q.center >= road.from - 1e-6 && q.center <= road.to + 1e-6 && road.center >= q.from - 1e-6 && road.center <= q.to + 1e-6) list.push(q.center);
      junctionsOf.set(road.id, list);
    }
    return junctionsOf.get(road.id);
  };

  // no new junction on a stretch of road that must stay clear: the frontage of a reserved site ({ road: id, u0, u1 } along that road)
  const blockedAt = (road, c) => keepOut.some((k) => k.road === road.id && c > k.u0 - cfg.keepOutMargin && c < k.u1 + cfg.keepOutMargin);
  const candidates = [];
  // streets along z (at x = c) between two roads along x, and streets along x (at z = c) between two roads along z
  for (const axis of ['z', 'x']) {
    const across = axis === 'z' ? 'x' : 'z'; // the roads a street of this axis joins run along this axis
    const ends = roads.filter((r) => r.axis === across && usable(r)).sort((p, q) => p.center - q.center);
    const lo = (axis === 'z' ? bounds.x0 : bounds.z0) + cfg.endMargin;
    const hi = (axis === 'z' ? bounds.x1 : bounds.z1) - cfg.endMargin;
    for (let c = Math.ceil(lo); c <= hi; c += 1) {
      // the roads this street could end on, in order across the map
      const here = ends.filter((r) => c >= r.from + cfg.endMargin && c <= r.to - cfg.endMargin);
      for (let k = 0; k + 1 < here.length; k++) {
        const A = here[k];
        const B = here[k + 1];
        const length = B.center - A.center - 2 * GEOM.halfCorridor;
        const perSide = lotsPerSide(length);
        if (perSide < cfg.minPerSide || B.center - A.center > cfg.maxLength) continue;
        if (junctionsOn(A).some((j) => Math.abs(j - c) < cfg.junctionSpacing) || junctionsOn(B).some((j) => Math.abs(j - c) < cfg.junctionSpacing)) continue;
        if (blockedAt(A, c) || blockedAt(B, c)) continue;
        if (claimedNear(claimed, A.id, c, cfg.junctionSpacing) || claimedNear(claimed, B.id, c, cfg.junctionSpacing)) continue;
        const strip =
          axis === 'z'
            ? { x0: c - ROW_REACH, x1: c + ROW_REACH, z0: A.center + GEOM.halfCorridor, z1: B.center - GEOM.halfCorridor }
            : { x0: A.center + GEOM.halfCorridor, x1: B.center - GEOM.halfCorridor, z0: c - ROW_REACH, z1: c + ROW_REACH };
        if (strip.x0 < bounds.x0 || strip.x1 > bounds.x1 || strip.z0 < bounds.z0 || strip.z1 > bounds.z1) continue;
        if (index.hits(strip)) continue;
        const mid = axis === 'z' ? { x: c, z: (A.center + B.center) / 2 } : { x: (A.center + B.center) / 2, z: c };
        candidates.push({ axis, center: c, from: A.center, to: B.center, a: A.id, b: B.id, perSide, lots: perSide * 2, strip, near: Math.hypot(mid.x - centre.x, mid.z - centre.z) });
      }
    }
  }
  // the longest first, the nearest the middle of the city breaking ties, then left to right so the result does not depend on the order found
  candidates.sort((p, q) => q.perSide - p.perSide || p.near - q.near || p.axis.localeCompare(q.axis) || p.center - q.center);

  const kept = [];
  let lots = 0;
  for (const cand of candidates) {
    if (lots >= extra) break;
    if (index.hits(cand.strip)) continue; // a street kept before it already uses this ground
    if (claimedNear(claimed, cand.a, cand.center, cfg.junctionSpacing) || claimedNear(claimed, cand.b, cand.center, cfg.junctionSpacing)) continue; // a junction too near (or the same) on one of its roads
    index.add(cand.strip);
    claim(claimed, cand.a, cand.center);
    claim(claimed, cand.b, cand.center);
    kept.push(cand);
    lots += cand.lots;
  }
  // numbered in reading order, so the names are stable
  kept.sort((p, q) => (p.axis === q.axis ? (p.axis === 'z' ? p.center - q.center || p.from - q.from : p.center - q.center || p.from - q.from) : p.axis.localeCompare(q.axis)));
  return { streets: kept.map(({ strip, near, ...s }) => s), lots, candidates: candidates.length };
}

// ---- outer blocks: new streets in the country outside the county road ---------------------------------------------------------------------------------
// Outside the county road there is only farmland and no second road to join, so each outer block brings its own: a far road parallel to the county road
// at a depth D, joined to it by cross streets 9.4 apart (the legs), like a comb. Every road still ends in a junction at both ends: the legs on the county road
// and on the far road, and the far road on its two outermost legs (a plain bend). Lots stand on both sides of the legs and on the outer side of the far road.
export const BANDS = {
  depths: [20, 28, 36, 44, 56, 68, 80, 92], // far road distance outside the county road's middle
  minLegs: 2,
  maxLegs: 16,
  step: 2, // how far apart the starting positions tried along the county road are
  endMargin: 12, // from the ends of the county road (its corners)
  junctionSpacing: 6.5,
  slide: 6, // how far a leg may slide along the county road to clear a junction
};
const LEG_PITCH = 2 * ROW_REACH; // legs this far apart leave their back-to-back rows a yard apart

export function planBands({ roads, obstacles, bounds, extra, centre, keepOut = [], claimed = new Map(), why = null, opts = {} }) {
  const cfg = { ...BANDS, ...opts };
  const index = obstacles instanceof RectIndex ? obstacles : new RectIndex(obstacles);
  const candidates = [];
  for (const C of roads.filter((r) => r.kind === 'county')) {
    const outward = (C.axis === 'x' ? C.center < centre.z : C.center < centre.x) ? -1 : 1;
    // a rectangle from distance n0 to n1 outside the road, over t0..t1 along it
    const box = (t0, t1, n0, n1) => {
      const a = C.center + outward * n0;
      const b = C.center + outward * n1;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      return C.axis === 'x' ? { x0: t0, x1: t1, z0: lo, z1: hi } : { x0: lo, x1: hi, z0: t0, z1: t1 };
    };
    const inBounds = (q) => q.x0 >= bounds.x0 && q.x1 <= bounds.x1 && q.z0 >= bounds.z0 && q.z1 <= bounds.z1;
    const junctions = roads.filter((q) => q.axis !== C.axis && q.center >= C.from - 1e-6 && q.center <= C.to + 1e-6 && C.center >= q.from - 1e-6 && C.center <= q.to + 1e-6).map((q) => q.center);
    for (const D of cfg.depths) {
      const length = D - 2 * GEOM.halfCorridor; // a leg, between the two roads' pavements
      const perSide = lotsPerSide(length);
      if (perSide < 2) continue;
      // `why` (optional) counts the reasons a place for a leg is turned down, for finding out why the free ground is not used
      const no = (reason) => {
        if (why) why[reason] = (why[reason] ?? 0) + 1;
        return false;
      };
      const legOk = (c) => {
        if (junctions.some((j) => Math.abs(j - c) < cfg.junctionSpacing)) return no(`${C.id}: next to a junction`);
        if (keepOut.some((k) => k.road === C.id && c > k.u0 - cfg.junctionSpacing && c < k.u1 + cfg.junctionSpacing)) return no(`${C.id}: in front of a reserved site, mall or the park`);
        if (claimedNear(claimed, C.id, c, cfg.junctionSpacing)) return no(`${C.id}: next to a new street's junction`);
        if (index.hits(box(c - ROW_REACH, c + ROW_REACH, GEOM.halfCorridor, D - GEOM.halfCorridor))) return no(`${C.id}: something is in the way`);
        if (!inBounds(box(c - ROW_REACH, c + ROW_REACH, 0, D + ROW_REACH))) return no(`${C.id}: outside the land`);
        return true;
      };
      for (let t0 = Math.ceil(C.from + cfg.endMargin); t0 <= C.to - cfg.endMargin; t0 += cfg.step) {
        const legs = [];
        // each next leg is one pitch further along; if a junction on the county road is in the way, it slides on (up to `slide`) to the first place that is clear
        for (let c = t0; c <= C.to - cfg.endMargin && legs.length < cfg.maxLegs; ) {
          let at = null;
          for (let extra = 0; extra <= (legs.length ? cfg.slide : 0); extra += 0.5) {
            if (c + extra <= C.to - cfg.endMargin && legOk(c + extra)) {
              at = c + extra;
              break;
            }
          }
          if (at === null) break;
          // the far road's outer lots along the way must be free too
          if (legs.length && index.hits(box(legs[0] - ROW_REACH, at + ROW_REACH, D - GEOM.halfCorridor, D + ROW_REACH))) break;
          legs.push(at);
          c = at + LEG_PITCH;
        }
        if (legs.length < cfg.minLegs) continue;
        const first = legs[0];
        const last = legs[legs.length - 1];
        const farLots = lotsPerSide(last - first - 2 * GEOM.halfCorridor);
        const lots = legs.length * 2 * perSide + farLots;
        const mid = C.axis === 'x' ? { x: (first + last) / 2, z: C.center + outward * D } : { x: C.center + outward * D, z: (first + last) / 2 };
        candidates.push({ road: C.id, axis: C.axis, outward, D, legs, lots, near: Math.hypot(mid.x - centre.x, mid.z - centre.z), boxes: [box(first - ROW_REACH, last + ROW_REACH, GEOM.halfCorridor, D + ROW_REACH)] });
      }
    }
  }
  // most lots first (a bigger block, then the nearest the middle of the city, then by position so the result is always the same)
  candidates.sort((p, q) => q.lots - p.lots || p.near - q.near || p.road.localeCompare(q.road) || p.D - q.D || p.legs[0] - q.legs[0]);
  const kept = [];
  let lots = 0;
  for (const cand of candidates) {
    if (lots >= extra) break;
    if (cand.boxes.some((b) => index.hits(b))) continue;
    if (cand.legs.some((c) => claimedNear(claimed, cand.road, c, cfg.junctionSpacing))) continue;
    for (const b of cand.boxes) index.add(b);
    for (const c of cand.legs) claim(claimed, cand.road, c);
    kept.push(cand);
    lots += cand.lots;
  }
  // each as roads: a leg at every position and the far road between the outer two
  const C = Object.fromEntries(roads.map((r) => [r.id, r]));
  const blocks = kept.map((k) => {
    const county = C[k.road];
    const far = county.center + k.outward * k.D;
    const along = [k.legs[0], k.legs[k.legs.length - 1]];
    const legAxis = county.axis === 'x' ? 'z' : 'x';
    return {
      county: county.id,
      far: { axis: county.axis, center: far, from: along[0], to: along[1] },
      legs: k.legs.map((c) => ({ axis: legAxis, center: c, from: Math.min(county.center, far), to: Math.max(county.center, far) })),
      lots: k.lots,
      depth: k.D,
    };
  });
  return { blocks, lots, candidates: candidates.length };
}
