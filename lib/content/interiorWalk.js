// Walking inside a building: the floor plan the visitor's avatar walks on in the interior viewer (apps/web/components/interior/RoomWalker.jsx).
// The room's own frame, in metres: x across (0 to width), z from the back wall (0) to the front (depth), where the door is. The solids are
// the footprints of the furniture standing on the floor shown, so a redesign is walked as it was saved, plus the stairwell; the walls are
// the edges. Routes come from the city's own walk planner (lib/sim/pathfind.js), which on a room this size is a plain grid search.
// A storefront tie-in: walking up to one of the room's offers (the offer desk, the video wall, the game cabinet, the visit reward) lights
// that part of the storefront panel, as choosing it in "Look at" does.
import { findWalkPath, CORNER_REACHED } from '../sim/pathfind.js';

export const WALL_GAP = 0.25; // how close to a wall the avatar may stand (the walls have thickness, and the avatar a body)
export const STAIR_SIZE = 2.6; // the spiral staircase's square in the north-east corner (lib/content/interiorScenes.js INTERIOR_STAIR_SIZE)
const TOO_HIGH = 1.6; // an item whose underside is above this (a ceiling light, a shelf on the wall) is walked under
const REACH = 1.3; // how near a spot counts as having walked up to it
const DOORSTEP = 1.0; // the avatar comes in this far inside the door

// The footprint of a placed item on the floor plan: its catalogue size turned by its rotation (any angle, as a box round the turned box).
export function itemFootprint(item) {
  const dims = item.asset?.dimensions;
  if (!dims) return null;
  const [w, , d] = dims;
  const [x, , z] = item.position ?? [0, 0, 0];
  const a = Array.isArray(item.rotation) ? item.rotation[1] ?? 0 : item.rotation ?? 0;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const hw = (w * c + d * s) / 2;
  const hd = (w * s + d * c) / 2;
  return { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, kind: 'item', name: item.name };
}

// The walk map of one floor: { rects, bounds } as the walk planner takes them. `nodes` is the scene (buildInteriorScene's, or the Pascal
// editor's store after a redesign), `levelId` the floor shown, `room` its { width, depth }, `floors` how many there are (a stairwell
// stands on every floor of a building with more than one).
export function roomWalkMap(nodes, levelId, room, floors = 1) {
  const rects = [];
  for (const n of Object.values(nodes ?? {})) {
    if (n?.type !== 'item' || n.parentId !== levelId || n.visible === false) continue;
    if ((n.position?.[1] ?? 0) > TOO_HIGH) continue;
    const f = itemFootprint(n);
    if (f && f.x1 - f.x0 > 0.05 && f.z1 - f.z0 > 0.05) rects.push(f);
  }
  if (floors > 1) rects.push({ x0: room.width - STAIR_SIZE, x1: room.width, z0: 0, z1: STAIR_SIZE, kind: 'stairs' });
  const bounds = { x0: WALL_GAP, x1: room.width - WALL_GAP, z0: WALL_GAP, z1: room.depth - WALL_GAP };
  return { rects, bounds };
}

const inside = (p, r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1;
const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Where the avatar appears: just inside the door on the ground floor; beside the stairs on a floor above.
export function spawnPoint(room, doorX, map, { upstairs = false } = {}) {
  const want = upstairs
    ? { x: room.width - STAIR_SIZE - 0.6, z: STAIR_SIZE / 2 }
    : { x: clampTo(doorX ?? room.width / 2, map.bounds.x0, map.bounds.x1), z: room.depth - DOORSTEP };
  return freeSpot(want, map) ?? { x: room.width / 2, z: room.depth / 2 };
}

// The nearest spot to `p` the avatar can stand on (in the room, outside every solid), searched in rings; null if there is none.
export function freeSpot(p, map, maxRadius = 6) {
  const ok = (q) => q.x >= map.bounds.x0 && q.x <= map.bounds.x1 && q.z >= map.bounds.z0 && q.z <= map.bounds.z1 && !map.rects.some((r) => inside(q, { x0: r.x0 - 0.3, x1: r.x1 + 0.3, z0: r.z0 - 0.3, z1: r.z1 + 0.3 }));
  const start = { x: clampTo(p.x, map.bounds.x0, map.bounds.x1), z: clampTo(p.z, map.bounds.z0, map.bounds.z1) };
  if (ok(start)) return start;
  for (let radius = 0.2; radius <= maxRadius; radius += 0.2) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const q = { x: start.x + Math.cos(a) * radius, z: start.z + Math.sin(a) * radius };
      if (ok(q)) return q;
    }
  }
  return null;
}

// The route from `from` to a tapped point `to` round the furniture: [{ x, z }, ...] ending at `to`, or beside it if `to` is inside something.
// A tap on floor the avatar cannot get to (furniture walls it off) walks to the nearest floor near it that it can reach, rather than
// doing nothing. null only when nowhere near the tap can be reached (or the avatar is already there).
export function roomRoute(from, to, map) {
  const goal = { x: clampTo(to.x, map.bounds.x0, map.bounds.x1), z: clampTo(to.z, map.bounds.z0, map.bounds.z1) };
  const direct = findWalkPath(from, goal, map);
  if (direct) return direct;
  for (let radius = 0.5; radius <= 4; radius += 0.5) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + radius; // a little turn each ring, so the rings do not line up
      const c = { x: clampTo(goal.x + Math.cos(a) * radius, map.bounds.x0, map.bounds.x1), z: clampTo(goal.z + Math.sin(a) * radius, map.bounds.z0, map.bounds.z1) };
      const path = findWalkPath(from, c, map);
      if (path) return path;
    }
  }
  return null;
}

// The offer spot (a hotspot with a storefront `section`) the avatar has walked up to, or null. `spots` are interiorHotspots' hotspotsFor().
export function spotReached(p, spots) {
  let best = null;
  for (const s of spots ?? []) {
    if (!s.pos || !s.section) continue;
    const d = Math.hypot(s.pos[0] - p.x, s.pos[2] - p.z);
    if (d < REACH && (!best || d < best.d)) best = { spot: s, d };
  }
  return best?.spot ?? null;
}

export { CORNER_REACHED };
