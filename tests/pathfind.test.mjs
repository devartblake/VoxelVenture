// Click-to-walk routes (lib/sim/pathfind.js): from where the avatar stands to a clicked point, round buildings and everything solid.
// Each route is walked with the game's own movement (moveAvatar, the same steering as apps/web/components/city/Avatar.jsx) and must arrive
// without being stopped by a wall; a click on a building walks to the nearest free spot beside it. Several seeds, many clicks.
import { imp } from './helpers.mjs';

const { generateCity } = await imp('city/cityGenerator.js');
const { buildCollisionMap, findSpawn, isBlocked, moveAvatar, AVATAR_RADIUS } = await imp('sim/collision.js');
const { findWalkPath, clearLine, nearestFree, CORNER_REACHED, prepareWalkMap } = await imp('sim/pathfind.js');
const { graphFor } = await imp('city/routing.js');

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

// Walks a route the way the avatar does: straight at the next corner at walking speed, sliding along walls; true if it gets there.
function walk(from, path, collision, dt = 1 / 60, speed = 3) {
  let x = from.x;
  let z = from.z;
  let stuck = 0;
  for (const [n, p] of path.entries()) {
    const reached = n === path.length - 1 ? 0.12 : CORNER_REACHED; // as the avatar does
    for (let t = 0; t < 4000; t++) {
      const dx = p.x - x;
      const dz = p.z - z;
      const d = Math.hypot(dx, dz);
      if (d < reached) break;
      const step = Math.min(d, speed * dt);
      const next = moveAvatar(x, z, (dx / d) * step, (dz / d) * step, collision);
      const moved = Math.hypot(next.x - x, next.z - z);
      stuck = moved < step * 0.25 ? stuck + dt : 0;
      if (stuck > 0.4) return { arrived: false, at: { x, z }, corner: p };
      x = next.x;
      z = next.z;
    }
  }
  const last = path.at(-1);
  return { arrived: Math.hypot(last.x - x, last.z - z) < 0.2, at: { x, z } };
}

// a seeded random number stream
const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

let routes = 0;
let detours = 0;
let ms = 0;
let worst = 0;
const failures = [];
for (const seed of [20260101, 7, 42]) {
  const city = generateCity(seed);
  const collision = buildCollisionMap({ plots: city.plots, layout: city.layout, billboards: [] });
  const spawn = findSpawn(city.layout, collision);
  const graph = graphFor(city.layout);
  const p0 = performance.now();
  prepareWalkMap(collision);
  console.log(`  seed ${seed}: ${collision.rects.length} solids indexed in ${(performance.now() - p0).toFixed(0)} ms`);
  const rand = rng(seed);
  const built = city.plots.filter((p) => p.owner && p.height > 0.2);
  for (let k = 0; k < 60; k++) {
    // start from a free spot near a random building; click somewhere 5 to 40 units away, or on a building's middle
    const b = built[Math.floor(rand() * built.length)];
    const from = nearestFree(b.x + (rand() - 0.5) * 12, b.z + (rand() - 0.5) * 12, collision.rects, collision.bounds, AVATAR_RADIUS + 0.06) ?? spawn;
    const onBuilding = k % 4 === 0;
    const angle = rand() * Math.PI * 2;
    const dist = 5 + rand() * (k % 3 ? 35 : 90); // a third of them long walks, across the city's blocks and water
    const target = onBuilding ? (({ x, z }) => ({ x, z }))(built[Math.floor(rand() * built.length)]) : { x: from.x + Math.cos(angle) * dist, z: from.z + Math.sin(angle) * dist };
    target.x = Math.min(Math.max(target.x, collision.bounds.x0 + 1), collision.bounds.x1 - 1);
    target.z = Math.min(Math.max(target.z, collision.bounds.z0 + 1), collision.bounds.z1 - 1);
    const t0 = performance.now();
    const path = findWalkPath(from, target, collision, { graph });
    const took = performance.now() - t0;
    ms += took;
    worst = Math.max(worst, took);
    if (!path) continue; // walled in (an island in a lake, a fenced field): nothing to walk
    routes++;
    if (path.length > 1) detours++;
    const segmentsClear = path.every((p, i) => clearLine(i ? path[i - 1] : from, p, collision.rects, 0.1, AVATAR_RADIUS));
    const w = walk(from, path, collision);
    if (!segmentsClear || !w.arrived || isBlocked(path.at(-1).x, path.at(-1).z, collision.rects)) failures.push({ seed, from, target, path: path.length, segmentsClear, arrived: w.arrived, at: w.at });
  }
}
console.log(`  ${routes} routes, ${detours} round something, ${(ms / 180).toFixed(1)} ms each on average, ${worst.toFixed(0)} ms at most`);
check('most clicks have a route', routes > 150, String(routes));
check('many of them go round something (the test is not only straight lines)', detours > 40, String(detours));
check('every route keeps clear of walls and the avatar walks it to the end', failures.length === 0, JSON.stringify(failures.slice(0, 3)));
check('planning is quick enough for a click (under 5 ms on average, 60 ms at worst)', ms / 180 < 5 && worst < 60, `${(ms / 180).toFixed(1)} / ${worst.toFixed(0)}`);

// a click on a building: the route ends beside it, never inside
{
  const city = generateCity(20260101);
  const collision = buildCollisionMap({ plots: city.plots, layout: city.layout, billboards: [] });
  const b = city.plots.find((p) => p.owner && p.height > 0.5 && !p.admin);
  const from = nearestFree(b.x + 8, b.z + 8, collision.rects, collision.bounds);
  const path = findWalkPath(from, { x: b.x, z: b.z }, collision);
  const end = path?.at(-1);
  check('a click on a building walks to the free spot beside it', end && !isBlocked(end.x, end.z, collision.rects) && Math.hypot(end.x - b.x, end.z - b.z) < Math.max(b.w, b.d), JSON.stringify(end));
  check('with nothing in the way the route is the straight line', JSON.stringify(findWalkPath(from, { x: from.x + 0.5, z: from.z }, collision)) === JSON.stringify([{ x: from.x + 0.5, z: from.z }]));
}

console.log(fails ? `\n${fails} check(s) failed` : '\nall pathfinding checks passed');
process.exit(fails ? 1 : 0);
