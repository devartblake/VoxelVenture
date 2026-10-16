// What do the new streets and the amusement park cost? (docs/infill_and_land.md) Compares three cities: the old one (no new streets, no park), with the new
// streets, and with the new streets and the park: in Node the generator, the collision map and the traffic simulation, and with --browser the game itself in
// headless Edge (it builds the app three times, with NEXT_PUBLIC_INFILL / NEXT_PUBLIC_AMUSEMENT set to 0 or 1: run `npm run build` afterwards). Nothing in the project is changed. Headless Edge draws in software, so frame rates only compare.
//
//   node scripts/study/infill.mjs              Node part only (about a minute)
//   node scripts/study/infill.mjs --browser    plus the browser part (builds twice; a few minutes)
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { imp, root, sleep } from '../../tests/helpers.mjs';
import { openPage } from '../../tests/browser-driver.mjs';

const { generateCity } = await imp('city/cityGenerator.js');
const { createTraffic } = await imp('sim/traffic.js');
const { buildCollisionMap, isBlocked } = await imp('sim/collision.js');
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

const nodeRows = [];
const VARIANTS = [
  { name: 'old city', infill: false, amusement: false },
  { name: '+ new streets', infill: true, amusement: false },
  { name: '+ new streets + amusement park', infill: true, amusement: true },
];
for (const v of VARIANTS) {
  const { infill, amusement } = v;
  const row = { variant: v.name };
  const seeds = [20260101, 1, 2, 3];
  const times = [];
  let city;
  for (const seed of seeds) {
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      city = generateCity(seed, { infill, amusement });
      times.push(performance.now() - t0);
    }
  }
  city = generateCity(20260101, { infill, amusement });
  const L = city.layout;
  row.generateMs = round(avg(times), 0);
  row.plots = city.plots.length;
  row.roads = L.roads.length;
  row.junctions = L.intersections.length;
  row.land = `${(L.land.x1 - L.land.x0).toFixed(0)} x ${(L.land.z1 - L.land.z0).toFixed(0)}`;
  row.saveKB = round(JSON.stringify({ plots: city.plots, billboards: city.billboards }).length / 1024, 0);
  row.layoutKB = round(JSON.stringify(L).length / 1024, 0);
  let loose = 0;
  for (const r of L.roads) for (const end of [r.from, r.to]) {
    const [x, z] = r.axis === 'x' ? [end, r.center] : [r.center, end];
    if (!L.intersections.some((i) => Math.abs(i.x - x) < 0.01 && Math.abs(i.z - z) < 0.01)) loose++;
  }
  row.roadEndsWithoutJunction = loose;
  let t0 = performance.now();
  const map = buildCollisionMap(city);
  row.collisionBuildMs = round(performance.now() - t0, 0);
  row.collisionRects = map.rects.length;
  t0 = performance.now();
  for (let i = 0; i < 20000; i++) isBlocked(L.land.x0 + ((i * 7.3) % (L.land.x1 - L.land.x0)), L.land.z0 + ((i * 3.1) % (L.land.z1 - L.land.z0)), map.rects);
  row.isBlockedUs = round(((performance.now() - t0) * 1000) / 20000);
  t0 = performance.now();
  const sim = createTraffic(L, { seed: 1, maxCars: 60, maxWalkers: 70 });
  row.trafficBuildMs = round(performance.now() - t0, 0);
  t0 = performance.now();
  for (let i = 0; i < 400; i++) sim.update(0.05, i * 0.05);
  row.trafficStepMs = round((performance.now() - t0) / 400, 2);
  nodeRows.push(row);
  console.log(JSON.stringify(row));
}
console.log('\nNode:\n' + JSON.stringify(nodeRows, null, 1));

if (process.argv.includes('--browser')) {
  const free = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
  const next = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  const rows = [];
  for (const v of VARIANTS) {
    const env = { ...process.env, NODE_OPTIONS: '', NEXT_PUBLIC_INFILL: v.infill ? '1' : '0', NEXT_PUBLIC_AMUSEMENT: v.amusement ? '1' : '0' };
    const build = spawnSync(process.execPath, [next, 'build'], { cwd: root, env, encoding: 'utf8' });
    if (build.status !== 0) { rows.push({ variant: v.name, error: 'build failed', tail: String(build.stdout).slice(-300) }); continue; }
    const port = await free();
    const server = spawn(process.execPath, [next, 'start', '-p', String(port)], { cwd: root, env, stdio: 'ignore' });
    for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* starting */ } await sleep(500); }
    const row = { variant: v.name };
    try {
      const t1 = Date.now();
      const page = await openPage(`http://localhost:${port}/?diag=1&view=overview`, { width: 1280, height: 800 });
      let up = false;
      for (let i = 0; i < 240 && !up; i++) { try { up = await page.eval('Boolean(window.__vvPerf && window.__vvPerf.calls > 0)'); } catch { /* loading */ } if (!up) await sleep(500); }
      row.firstFrameS = up ? round((Date.now() - t1) / 1000) : null;
      await sleep(5000);
      const stats = JSON.parse(await page.eval(`JSON.stringify({ perf: window.__vvPerf, plots: window.__vvStore.getState().plots.length, heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6), meshes: (() => { let n = 0; window.__vvScene.traverse((o) => { if (o.isMesh) n++; }); return n; })() })`));
      Object.assign(row, { plots: stats.plots, calls: stats.perf.calls, triangles: stats.perf.triangles, geometries: stats.perf.geometries, heapMB: stats.heapMB, meshes: stats.meshes });
      row.fps = await page.eval(`new Promise((resolve) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 5000) requestAnimationFrame(f); else resolve(Math.round((n / 5) * 10) / 10); }; requestAnimationFrame(f); })`);
      row.problems = page.problems().length;
      await page.close();
    } catch (e) {
      row.error = e.message;
    }
    server.kill();
    await sleep(800);
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  console.log('\nBrowser:\n' + JSON.stringify(rows, null, 1));
}
process.exit(0);
