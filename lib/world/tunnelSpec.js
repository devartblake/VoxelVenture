// The tunnel's constants and profile, with no imports but the datum (docs/world/tunnel_evaluation.md, docs/world/tunnel.md): the bake cuts the portals' trench from them and lib/world/tunnel.js builds the route
// from them, and the bake may not import the train (that would be a cycle). Pure.
import { SEA_LEVEL, SHORE_GROUND } from './datum';

export const TUNNEL = {
  floor: -5.5, // the road's height in the tube
  height: 4.5, // inside, floor to roof
  width: 6.4, // inside, wall to wall
  wall: 0.5, // the thickness of walls, roof and floor
  grade: 0.08, // gentler than the road limit of 0.12: a long, easy ramp
  ground: SHORE_GROUND, // the shore's height at the portals (the baked ground is 0 to 0.5 there: lib/world/datum.js)
  lateral: -9, // from the causeway's centre line: the deck is 8 wide (4 each side) and the train's rail 2.5 on the other side
  inland: 110, // the portals are this far before the causeway's first and last points (a long entrance, well back from the shore)
  approach: 40, // the approach road starts this far before the portal
  seaLevel: SEA_LEVEL, // (lib/world/datum.js)
  trench: 2.4, // the ground is cut this far beyond the tube's outer wall, where the tube stands out of the ground at a portal
  // stage 2 (docs/world/tunnel.md): the tube carries the train on one side and a road lane (for people and cars) on the other, with a kerb between
  railOffset: 1.6, // the rail's distance from the tube's middle, to the far side from the causeway (`lat` is negative there)
  laneFrom: -0.2, // the road side begins here (the kerb's face), `lat` from the tube's middle, to the wall at width / 2
  mouth: 8, // the first this many units of a portal are open ground: a walker or a car enters the tube's own layer past them
  pitLen: 66, // from the portal, how far the cut ground (where the tube stands out of it) is a pit nobody can step into from the side
};

/** The road's height inside the tunnel at `s` (along the causeway's line): down from the ground at the portal, the floor under the sea, up again. `route` = { s0, s1 }. */
export function floorY(route, s) {
  const down = TUNNEL.ground - TUNNEL.grade * (s - route.s0);
  const up = TUNNEL.ground - TUNNEL.grade * (route.s1 - s);
  return Math.min(TUNNEL.ground, Math.max(TUNNEL.floor, down, up));
}
/** The roof's height (the inside's top) at `s`. */
export const roofY = (route, s) => floorY(route, s) + TUNNEL.height;
/** How far along the line the road is down at the full depth: the length of one ramp. */
export const rampLength = () => (TUNNEL.ground - TUNNEL.floor) / TUNNEL.grade;
/** The point of the tunnel's centre at `s` on the ground plan (`line`: { a, dir, normal } of the causeway). */
export const centreAt = (line, s) => ({ x: line.a.x + line.dir.x * s + line.normal.x * TUNNEL.lateral, z: line.a.z + line.dir.z * s + line.normal.z * TUNNEL.lateral });

/**
 * The patches of land where the sea's plane must not be drawn: at each portal the tube stands out of a trench cut below the sea level (the plane is an infinite sheet at -0.3, so it would show as water inside the
 * portal). [{ x, z, dx, dz, along, across }] (centre, the direction along the tunnel, half lengths), at most 4. `t` = { line, s0, s1 }.
 */
export function portalHoles(t) {
  const len = 74, across = TUNNEL.width / 2 + TUNNEL.wall + TUNNEL.trench + 5; // the first ~62 units of a ramp (where the tube stands out of the ground), and a ground cell (4 units) more each way: the cut ground slopes up to the ground beyond over one cell
  return [[t.s0, t.s0 + len], [t.s1 - len, t.s1]].map(([a, b]) => { const c = centreAt(t.line, (a + b) / 2); return { x: c.x, z: c.z, dx: t.line.dir.x, dz: t.line.dir.z, along: (b - a) / 2, across }; });
}

/**
 * Where the tube stands out of the ground: the ground at (x, z) is cut down to the road's height there when the point is within the tube's outer wall and `trench` beyond it, along the part of the ramp where
 * the roof's top is not under the ground (the first ~60 units of each ramp); null elsewhere. `t` = { line: { a, dir, normal }, s0, s1 }.
 */
export function trenchAt(t, x, z) {
  const { a, dir, normal } = t.line;
  const s = (x - a.x) * dir.x + (z - a.z) * dir.z;
  if (s < t.s0 || s > t.s1) return null;
  const lat = (x - a.x) * normal.x + (z - a.z) * normal.z - TUNNEL.lateral;
  if (Math.abs(lat) > TUNNEL.width / 2 + TUNNEL.wall + TUNNEL.trench) return null;
  const f = floorY(t, s);
  return f + TUNNEL.height + TUNNEL.wall > TUNNEL.ground - 0.3 ? f : null; // (above this the roof is under the ground: nothing to cut)
}

// ---- stage 2: the layers. On land the road above the tube and the road in it share a ground position, so a mover has a LAYER ('surface' or 'tunnel'): it enters the tube's layer at a portal's mouth and
// leaves it there. Inside the tube the floor is the tube's road, the walls hold it in and the rail's side is kerbed off; outside it the cut ground is a pit and the walls are walls.

/** Where a ground point is along the tunnel and across it: { s (along the causeway's line), lat (from the tube's middle, positive toward the causeway) }. `t` = { line }. */
export function tunnelFrame(t, x, z) {
  const { a, dir, normal } = t.line;
  return { s: (x - a.x) * dir.x + (z - a.z) * dir.z, lat: (x - a.x) * normal.x + (z - a.z) * normal.z - TUNNEL.lateral };
}
/** The slope of the tube's road at `s` (rise over run): the ramp's grade down and up, 0 under the sea. */
export const floorSlope = (route, s) => (floorY(route, s + 0.5) - floorY(route, s - 0.5)) / 1;

/**
 * What a point is, for a mover on the SURFACE layer, near the tunnel's portals: 'wall' (the tube's wall, where the tube stands out of the ground), 'pit' (the cut ground beyond the mouth: nobody climbs in from the
 * side), 'rail' (the rail's side of the mouth), or null (ordinary ground). `t` = { line, s0, s1 }.
 */
export function surfaceBlock(t, x, z) {
  const f = tunnelFrame(t, x, z), half = TUNNEL.width / 2;
  for (const near of [f.s - t.s0, t.s1 - f.s]) { // (the distance in from each portal)
    if (near < 0 || near > TUNNEL.pitLen) continue;
    const a = Math.abs(f.lat);
    if (a >= half && a <= half + TUNNEL.wall + 0.3) return 'wall';
    if (near > TUNNEL.mouth + 1.5 && a <= half + TUNNEL.wall + TUNNEL.trench + 4) return 'pit'; // (1.5 past where the layer changes: a body's footprint is not in the pit while it crosses)
    if (a < half && f.lat < TUNNEL.laneFrom && near <= TUNNEL.mouth) return 'rail';
  }
  return null;
}

/** Is the point inside the tube, on the road side, with room for a body of `radius`: the corridor a person or a car may be in on the tunnel layer. */
export function inCorridor(t, x, z, radius = 0) {
  const f = tunnelFrame(t, x, z);
  return f.s >= t.s0 && f.s <= t.s1 && f.lat >= TUNNEL.laneFrom + radius && f.lat <= TUNNEL.width / 2 - radius;
}

/**
 * The layer a mover is on after stepping from (x, z) to (nx, nz): it enters the tunnel's layer by crossing a portal's mouth into the corridor (from the open ground outside, not from the side or over
 * the roof), and leaves it by crossing back. `layer`: 'surface' or 'tunnel'.
 */
export function nextLayer(t, layer, x, z, nx, nz) {
  const a = tunnelFrame(t, x, z), b = tunnelFrame(t, nx, nz), m = TUNNEL.mouth;
  const lane = b.lat >= TUNNEL.laneFrom && b.lat <= TUNNEL.width / 2;
  if (layer === 'surface') {
    if (lane && a.s < t.s0 + m && b.s >= t.s0 + m && b.s <= t.s1) return 'tunnel'; // in at the mainland's portal
    if (lane && a.s > t.s1 - m && b.s <= t.s1 - m && b.s >= t.s0) return 'tunnel'; // in at the isle's
    return 'surface';
  }
  if (b.s < t.s0 + m || b.s > t.s1 - m) return 'surface'; // out through a mouth
  return 'tunnel';
}
