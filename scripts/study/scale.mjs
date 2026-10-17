// Feasibility study (see docs/architecture/study_world_streaming.md): how does the city generator, the traffic simulation and the collision map scale with the size of the map?
// It copies lib/ to a temp folder with the grid enlarged by a factor k (k times as many avenues and as many columns: k^2 times the area),
// then generates cities there and measures. Nothing in the project is changed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const copy = (from, to, tweak) => {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.isDirectory()) copy(path.join(from, e.name), path.join(to, e.name), tweak);
    else if (e.name.endsWith('.js')) {
      let src = fs.readFileSync(path.join(from, e.name), 'utf8').replace(/from '(\.{1,2}\/[^']+?)(?<!\.js)'/g, "from '$1.js'");
      if (e.name === 'cityGenerator.js') src = tweak(src);
      fs.writeFileSync(path.join(to, e.name), src);
    }
  }
};

const results = [];
for (const k of (process.argv[2] ?? '1,2,3,4').split(',').map(Number)) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `vv-study-${k}-`));
  copy(path.join(root, 'lib'), out, (src) => {
    const avenues = 8 * k;
    return src
      .replace('const GRID_X_MIN = -12;', `const GRID_X_MIN = ${-12 * k};`)
      .replace('const GRID_X_MAX = 12;', `const GRID_X_MAX = ${12 * k};`)
      .replace('const AVENUE_INDEXES = [-3, -2, -1, 0, 1, 2, 3, 4];', `const AVENUE_INDEXES = Array.from({ length: ${avenues} }, (_, i) => i - 3);`)
      .replace('const ARTERIAL_AVENUES = new Set([1, 4, 7]);', `const ARTERIAL_AVENUES = new Set(Array.from({ length: ${avenues} }, (_, i) => i).filter((i) => i % 3 === 1));`)
      .replace('const count = int(rand, 5, 7);', `const count = int(rand, ${5 * k}, ${7 * k});`);
  });
  fs.writeFileSync(path.join(out, 'package.json'), '{"type":"module"}');
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(out, 'node_modules'), 'junction');
  const imp = (f) => import(pathToFileURL(path.join(out, f)).href);
  const { generateCity } = await imp('city/cityGenerator.js');
  const { createTraffic } = await imp('sim/traffic.js');
  const { buildCollisionMap, isBlocked } = await imp('sim/collision.js');

  const row = { k, avenues: 8 * k };
  global.gc?.();
  const mem0 = process.memoryUsage().heapUsed;
  let city;
  const times = [];
  try {
    for (const seed of [1, 2, 3]) {
      const t0 = performance.now();
      city = generateCity(seed);
      times.push(performance.now() - t0);
    }
  } catch (e) {
    row.error = `generate: ${e.message}`;
    results.push(row);
    console.log(JSON.stringify(row));
    continue;
  }
  row.generateMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const L = city.layout;
  row.land = `${(L.land.x1 - L.land.x0).toFixed(0)} x ${(L.land.z1 - L.land.z0).toFixed(0)}`;
  row.plots = city.plots.length;
  row.roads = L.roads.length;
  row.junctions = L.intersections.length;
  row.heapMB = Math.round((process.memoryUsage().heapUsed - mem0) / 1e5) / 10;
  row.saveKB = Math.round(JSON.stringify({ plots: city.plots, billboards: city.billboards }).length / 1024);
  row.layoutKB = Math.round(JSON.stringify(L).length / 1024);
  // sanity: every road ends at a junction
  let bad = 0;
  for (const r of L.roads) for (const end of [r.from, r.to]) {
    const [x, z] = r.axis === 'x' ? [end, r.center] : [r.center, end];
    if (!L.intersections.some((i) => Math.abs(i.x - x) < 0.01 && Math.abs(i.z - z) < 0.01)) bad++;
  }
  row.roadEndsWithoutJunction = bad;
  // collision map and a walk
  let t0 = performance.now();
  const map = buildCollisionMap(city);
  row.collisionBuildMs = Math.round(performance.now() - t0);
  row.collisionRects = map.rects.length;
  t0 = performance.now();
  for (let i = 0; i < 20000; i++) isBlocked(L.land.x0 + (i * 7.3) % (L.land.x1 - L.land.x0), L.land.z0 + (i * 3.1) % (L.land.z1 - L.land.z0), map.rects);
  row.isBlockedUs = Math.round(((performance.now() - t0) * 1000) / 20000 * 10) / 10; // microseconds per call
  // traffic: build and step
  t0 = performance.now();
  const sim = createTraffic(L, { seed: 1, maxCars: 60, maxWalkers: 70 });
  row.trafficBuildMs = Math.round(performance.now() - t0);
  t0 = performance.now();
  for (let i = 0; i < 400; i++) sim.update(0.05, i * 0.05);
  row.trafficStepMs = Math.round(((performance.now() - t0) / 400) * 100) / 100;
  results.push(row);
  console.log(JSON.stringify(row));
}
console.log('\n' + JSON.stringify(results, null, 1));
