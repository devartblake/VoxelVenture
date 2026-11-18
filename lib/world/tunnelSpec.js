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
