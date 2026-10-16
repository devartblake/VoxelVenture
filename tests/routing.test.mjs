// Road-following routes and the spatial grid behind the world map.
import { imp, problemTally } from './helpers.mjs';
const { generateCity } = await imp('city/cityGenerator.js');
const { buildRoadGraph, findRoute, snapToRoad, routeSeconds } = await imp('city/routing.js');
const { buildGrid, queryGrid } = await imp('city/spatialGrid.js');
const { bad, total } = problemTally();

const rand = (() => { let a = 12345; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
let routes = 0;
let detour = 0;
for (let seed = 1; seed <= 15; seed++) {
  const { layout, plots } = generateCity(seed);
  const g = buildRoadGraph(layout);
  if (g.nodes.length < 60) bad('the road graph has a node at every junction', `${seed}: ${g.nodes.length}`);
  // connected: most nodes reach each other
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) for (const e of g.nodes[stack.pop()].edges) if (!seen.has(e.to)) { seen.add(e.to); stack.push(e.to); }
  if (seen.size < g.nodes.length * 0.9) bad('the roads join up', `${seed}: ${seen.size} of ${g.nodes.length}`);
  // routes between random plots
  const built = plots.filter((p) => !p.designSite);
  for (let k = 0; k < 40; k++) {
    const a = built[Math.floor(rand() * built.length)];
    const b = built[Math.floor(rand() * built.length)];
    if (dist(a, b) < 8) continue;
    const r = findRoute(g, { x: a.x, z: a.z }, { x: b.x, z: b.z });
    routes++;
    if (!r.onRoad) { bad('a route along the roads is found', `${seed} #${a.id} -> #${b.id}`); continue; }
    const direct = dist(a, b);
    if (r.length < direct - 1e-6) bad('a route is never shorter than the straight line', `${seed}`);
    if (r.length > direct * 6 + 120) bad('a route is not absurdly long', `${seed} ${r.length.toFixed(0)} vs ${direct.toFixed(0)}`);
    detour += r.length / direct;
    if (dist(r.points[0], a) > 1e-6 || dist(r.points[r.points.length - 1], b) > 1e-6) bad('a route starts and ends where asked', `${seed}`);
    // the inside of the route stays on the roads: every point is on a road (within a hair)
    for (const p of r.points.slice(1, -1)) if (snapToRoad(g, p).d > 0.2) { bad('the middle of a route is on the roads', `${seed} off by ${snapToRoad(g, p).d.toFixed(2)}`); break; }
    if (Math.abs(r.length - r.points.slice(1).reduce((n, p, i) => n + dist(p, r.points[i]), 0)) > 1e-6) bad('the length is the length of the points', `${seed}`);
  }
}
if (routes < 300) bad('enough routes were tried', String(routes));
if (Math.abs(routeSeconds(30) - 10) > 1e-9) bad('walking speed is 3 units a second', '');
// from the same point to itself: no detour
{
  const { layout } = generateCity(3);
  const g = buildRoadGraph(layout);
  const r = findRoute(g, { x: 0, z: 0 }, { x: 0, z: 0 });
  if (r.length > 1e-6 && r.length > 2 * snapToRoad(g, { x: 0, z: 0 }).d + 1e-6) bad('a route to where you stand is empty', String(r.length));
}

// ---- the spatial grid agrees with a brute-force search
const items = Array.from({ length: 800 }, () => { const x = rand() * 400 - 200; const z = rand() * 400 - 200; return { x0: x, x1: x + rand() * 12, z0: z, z1: z + rand() * 12 }; });
const grid = buildGrid(items, (r) => r, 24);
for (let k = 0; k < 200; k++) {
  const x = rand() * 400 - 200;
  const z = rand() * 400 - 200;
  const q = { x0: x, x1: x + rand() * 80, z0: z, z1: z + rand() * 80 };
  const got = new Set(queryGrid(grid, q));
  const want = items.filter((r) => r.x1 >= q.x0 && r.x0 <= q.x1 && r.z1 >= q.z0 && r.z0 <= q.z1);
  if (got.size !== want.length || want.some((r) => !got.has(r))) { bad('a grid query finds exactly what is in the rectangle', `${k}: ${got.size} vs ${want.length}`); break; }
}
console.log(`${routes} routes over 15 cities; the roads are ${(detour / routes).toFixed(2)}x the straight line on average`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
