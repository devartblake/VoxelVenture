// The undersea tunnel beside the first causeway (docs/world/tunnel_evaluation.md): the route and the profile of the tube. Pure. So far only the development spike (apps/web/components/dev/TunnelSpike.jsx,
// /world/stream?tunnel=1) uses it: nothing in the game does.
//
// It runs parallel to Harbor Causeway, `lateral` units to the side (the train's rail is on the other side), and has its OWN road entrance, which starts before the causeway's road does: the approach
// road begins `approach` units before the portal, and the portal is `inland` units before the causeway's first point, so the tunnel's road is separate from the bridge's and comes first. The tube
// goes down from the ground at a grade of `grade`, runs at `floor` under the sea (its roof under the water), and comes up on the far side the same way.
import { TRAIN, pointAt as railPointAt } from './train';

export const TUNNEL = {
  floor: -5.5, // the road's height in the tube
  height: 4.5, // inside, floor to roof
  width: 6.4, // inside, wall to wall
  wall: 0.5, // the thickness of walls, roof and floor
  grade: 0.12, // the road's own maximum grade (lib/world/highways.js)
  ground: 0.2, // the shore's height at the portals (the baked ground is 0 to 0.5 there)
  lateral: -9, // from the causeway's centre line: the deck is 8 wide (4 each side) and the train's rail 2.5 on the other side
  inland: 70, // the portals are this far before the causeway's first and last points
  approach: 40, // the approach road starts this far before the portal
  seaLevel: -0.3,
};

/** The route along a causeway line (lib/world/train.js trainLine): { s0, s1 (the portals), approach0, approach1 (the roads' ends), length }. */
export function tunnelRoute(line) {
  const s0 = -TUNNEL.inland, s1 = line.length + TUNNEL.inland;
  return { s0, s1, approach0: s0 - TUNNEL.approach, approach1: s1 + TUNNEL.approach, length: s1 - s0, line };
}

/** The road's height inside the tunnel at `s` (along the causeway's line): down from the ground at the portal, the floor under the sea, up again. */
export function floorY(route, s) {
  const down = TUNNEL.ground - TUNNEL.grade * (s - route.s0);
  const up = TUNNEL.ground - TUNNEL.grade * (route.s1 - s);
  return Math.min(TUNNEL.ground, Math.max(TUNNEL.floor, down, up));
}
/** The roof's height (the inside's top) at `s`. */
export const roofY = (route, s) => floorY(route, s) + TUNNEL.height;
/** The point of the tunnel's road centre at `s` on the ground plan. */
export const pointAt = (line, s) => railPointAt(line, s, TUNNEL.lateral - TRAIN.lateral);
/** How far along the line the road is down at the full depth: the length of one ramp. */
export const rampLength = () => (TUNNEL.ground - TUNNEL.floor) / TUNNEL.grade;
