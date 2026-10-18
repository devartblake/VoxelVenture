// Walking inside a building (lib/content/interiorWalk.js, apps/web/components/interior/RoomWalker.jsx): the floor plan comes from the items
// standing on the floor shown, the avatar comes in free beside the door, a tap anywhere gives a route that stays out of every piece of
// furniture and inside the walls, and walking to one of the room's offers counts as reaching it (so the storefront panel lights it).
// (the real rooms need the Pascal catalogue, which only a bundler loads: these are seeded rooms of the same sizes, and the browser test
// walks the real ones)
import { imp, problemTally } from './helpers.mjs';
const { itemFootprint, roomWalkMap, spawnPoint, roomRoute, spotReached, freeSpot, STAIR_SIZE, WALL_GAP } = await imp('content/interiorWalk.js');
const { hotspotsFor } = await imp('content/interiorHotspots.js');
const { isBlocked } = await imp('sim/collision.js');
const { findWalkPath } = await imp('sim/pathfind.js');
const canReach = (from, to, map) => Boolean(findWalkPath(from, to, map)); // furniture can wall a corner off in a cramped room
const { bad, total } = problemTally();

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const ROOMS = [{ width: 8, depth: 6 }, { width: 12, depth: 8 }, { width: 16, depth: 10 }, { width: 28, depth: 14 }];
const RADIUS = 0.17; // the avatar's body (lib/sim/collision.js AVATAR_RADIUS)
const CLEAR = 0.29; // the room the walk planner leaves round furniture (lib/sim/pathfind.js CLEARANCE)

// a room: a level with furniture on it, one item on a wall, one hung from the ceiling, and another floor's item that must not count
function scene(room, n) {
  const nodes = { lvl: { id: 'lvl', type: 'level' }, wall: { id: 'wall', type: 'wall', parentId: 'lvl' } };
  for (let i = 0; i < n; i++) {
    const w = 0.4 + rand() * 1.6;
    const d = 0.4 + rand() * 1.2;
    nodes[`it${i}`] = { id: `it${i}`, type: 'item', parentId: 'lvl', position: [1 + rand() * (room.width - 2), 0, 1 + rand() * (room.depth - 3)], rotation: [0, [0, Math.PI / 2, Math.PI / 4, 0.3][i % 4], 0], asset: { dimensions: [w, 1, d] } };
  }
  nodes.window = { id: 'window', type: 'item', parentId: 'wall', position: [2, 0.5, 0], asset: { dimensions: [1.5, 2, 0.4] } };
  nodes.lamp = { id: 'lamp', type: 'item', parentId: 'lvl', position: [room.width / 2, 2.4, room.depth / 2], asset: { dimensions: [3, 0.3, 3] } };
  nodes.upstairs = { id: 'upstairs', type: 'item', parentId: 'lvl2', position: [room.width / 2, 0, room.depth - 1], asset: { dimensions: [4, 1, 1] } };
  return nodes;
}

// footprints: a quarter turn swaps width and depth, a turn in between covers the turned box
const fp = itemFootprint({ position: [5, 0, 5], rotation: [0, Math.PI / 2, 0], asset: { dimensions: [2, 1, 1] } });
if (Math.abs(fp.x1 - fp.x0 - 1) > 1e-9 || Math.abs(fp.z1 - fp.z0 - 2) > 1e-9) bad('a quarter-turned item swaps its width and depth', JSON.stringify(fp));
const fp45 = itemFootprint({ position: [0, 0, 0], rotation: [0, Math.PI / 4, 0], asset: { dimensions: [2, 1, 2] } });
if (Math.abs(fp45.x1 - fp45.x0 - 2 * Math.SQRT2) > 1e-9) bad('an item at 45 degrees covers its turned corners', JSON.stringify(fp45));

let routes = 0;
let rooms = 0;
let offersReached = 0;
for (const room of ROOMS) {
  for (let r = 0; r < 12; r++) {
    rooms++;
    const floors = 1 + (r % 3);
    const nodes = scene(room, 4 + Math.floor(rand() * (room.width * room.depth) / 10));
    const map = roomWalkMap(nodes, 'lvl', room, floors);
    const items = Object.values(nodes).filter((n) => n.parentId === 'lvl' && n.type === 'item').length;
    // the lamp is overhead and the window on the wall: neither is in the way; the other floor's item is not on this one
    if (map.rects.filter((x) => x.kind === 'item').length !== items - 1) bad('only the items standing on this floor are in the way', `${map.rects.length} of ${items}`);
    if ((floors > 1) !== map.rects.some((x) => x.kind === 'stairs')) bad('a building with stairs has the stairwell in the way', `${floors} floors`);
    if (map.bounds.x0 !== WALL_GAP || map.bounds.x1 !== room.width - WALL_GAP) bad('the walls are the edges', JSON.stringify(map.bounds));

    const doorX = 1 + rand() * (room.width - 2);
    const start = spawnPoint(room, doorX, map);
    if (isBlocked(start.x, start.z, map.rects, RADIUS)) bad('the avatar comes in free of the furniture', `${room.width}x${room.depth} ${JSON.stringify(start)}`);
    if (Math.hypot(start.x - doorX, start.z - (room.depth - 1)) > 4) bad('it comes in near the door', `${JSON.stringify(start)} door ${doorX.toFixed(2)}`);
    if (floors > 1) {
      const up = spawnPoint(room, doorX, map, { upstairs: true });
      if (isBlocked(up.x, up.z, map.rects, RADIUS) || up.x > room.width - STAIR_SIZE + 0.3 || up.z > STAIR_SIZE + 4) bad('upstairs it comes in beside the stairs, free', JSON.stringify(up));
    }

    // taps all over the room, furniture included: every route stays clear and ends near the tap
    for (let t = 0; t < 10; t++) {
      const tap = { x: rand() * room.width, z: rand() * room.depth };
      const path = roomRoute(start, tap, map);
      const reachable = freeSpot(tap, map);
      if (!path) {
        if (reachable && Math.hypot(reachable.x - start.x, reachable.z - start.z) < 1) continue; // already there
        if (reachable) bad('a tap with free floor near it gets a route', `${room.width}x${room.depth} tap ${tap.x.toFixed(2)},${tap.z.toFixed(2)}`);
        continue;
      }
      routes++;
      let prev = start;
      for (const p of path) {
        const steps = Math.ceil(Math.hypot(p.x - prev.x, p.z - prev.z) / 0.05);
        for (let s = 1; s <= steps; s++) {
          const q = { x: prev.x + ((p.x - prev.x) * s) / steps, z: prev.z + ((p.z - prev.z) * s) / steps };
          if (isBlocked(q.x, q.z, map.rects, RADIUS)) { bad('a route never walks through furniture', `${room.width}x${room.depth} at ${q.x.toFixed(2)},${q.z.toFixed(2)}`); break; }
          if (q.x < map.bounds.x0 - 1e-6 || q.x > map.bounds.x1 + 1e-6 || q.z < map.bounds.z0 - 1e-6 || q.z > map.bounds.z1 + 1e-6) { bad('nor through a wall', `${q.x.toFixed(2)},${q.z.toFixed(2)}`); break; }
        }
        prev = p;
      }
      const end = path.at(-1);
      const clamped = { x: Math.min(map.bounds.x1, Math.max(map.bounds.x0, tap.x)), z: Math.min(map.bounds.z1, Math.max(map.bounds.z0, tap.z)) };
      // the planner keeps 0.29 m clear of furniture (its body and a margin), so a tap that close to something ends just beside it
      if (!isBlocked(clamped.x, clamped.z, map.rects, CLEAR) && canReach(start, clamped, map) && Math.hypot(end.x - clamped.x, end.z - clamped.z) > 0.05) bad('a tap on free floor is walked to exactly', `${JSON.stringify(end)} vs ${JSON.stringify(clamped)}`);
      if (Math.hypot(end.x - clamped.x, end.z - clamped.z) > 4.5) bad('a tap is walked to, or as near it as the avatar can get', `${JSON.stringify(end)} vs ${JSON.stringify(clamped)}`);
    }

    // the room's offers: walking to each one counts as reaching it
    const spots = hotspotsFor({ brand: { coupon: {}, video: {}, game: {}, quest: {} } }, room, doorX);
    for (const s of spots.filter((x) => x.section)) {
      const path = roomRoute(start, { x: s.pos[0], z: s.pos[2] }, map);
      const at = path?.at(-1) ?? start;
      const got = spotReached(at, spots);
      if (got) offersReached++;
      else if (freeSpot({ x: s.pos[0], z: s.pos[2] }, map, 1.0) && canReach(start, freeSpot({ x: s.pos[0], z: s.pos[2] }, map, 1.0), map)) bad('walking to an offer reaches it', `${room.width}x${room.depth} ${s.id} ended ${JSON.stringify(at)}`);
    }
  }
}
if (spotReached({ x: 0, z: 0 }, hotspotsFor({ brand: { coupon: {} } }, ROOMS[1], 4))) bad('standing far from every offer reaches none', '');
const whole = hotspotsFor({ brand: { coupon: {} } }, ROOMS[1], 4);
if (spotReached({ x: whole[0].pos?.[0] ?? 6, z: 4 }, whole.filter((s) => !s.section)) !== null) bad('the plain views (entrance, sides) are not offers', '');

console.log(`${rooms} rooms, ${routes} routes walked, ${offersReached} offers reached`);
console.log(total() === 0 ? 'all interior walking checks passed' : `${total()} problem(s)`);
process.exit(total() ? 1 : 0);
