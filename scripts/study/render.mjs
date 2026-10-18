// Feasibility study (see docs/world/study_world_streaming.md): what does a bigger map cost in the browser? Builds the app at each map scale, loads it in headless
// Edge and measures the time to the first frame, draw calls, triangles, geometries, the JS heap and the frame rate.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
import { root, sleep } from '../../tests/helpers.mjs';
import { openPage } from '../../tests/browser-driver.mjs';

const free = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const next = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const rows = [];
for (const k of (process.argv[2] ?? "1,2,4").split(',').map(Number)) {
  const t0 = Date.now();
  const build = spawnSync(process.execPath, [next, 'build'], { cwd: root, env: { ...process.env, NEXT_PUBLIC_MAP_SCALE: String(k) }, encoding: 'utf8' });
  const buildS = Math.round((Date.now() - t0) / 1000);
  if (build.status !== 0) { rows.push({ k, error: 'build failed', tail: String(build.stdout).slice(-300) }); continue; }
  const port = await free();
  const server = spawn(process.execPath, [next, 'start', '-p', String(port)], { cwd: root, env: { ...process.env, NEXT_PUBLIC_MAP_SCALE: String(k) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* starting */ } await sleep(500); }
  const row = { k, buildS };
  try {
    const t1 = Date.now();
    const page = await openPage(`http://localhost:${port}/?diag=1&view=overview`, { width: 1280, height: 800 });
    let up = false;
    for (let i = 0; i < 240 && !up; i++) { try { up = await page.eval('Boolean(window.__vvPerf && window.__vvPerf.calls > 0)'); } catch { /* loading */ } if (!up) await sleep(500); }
    row.firstFrameS = up ? Math.round((Date.now() - t1) / 100) / 10 : null;
    await sleep(4000);
    const stats = JSON.parse(await page.eval(`JSON.stringify({ perf: window.__vvPerf, plots: window.__vvStore.getState().plots.length, heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6), meshes: (() => { let n = 0; window.__vvScene.traverse((o) => { if (o.isMesh) n++; }); return n; })(), land: (() => { const l = window.__vvStore.getState().layout.land; return Math.round(l.x1 - l.x0) + ' x ' + Math.round(l.z1 - l.z0); })() })`));
    Object.assign(row, { land: stats.land, plots: stats.plots, calls: stats.perf.calls, triangles: stats.perf.triangles, geometries: stats.perf.geometries, textures: stats.perf.textures, heapMB: stats.heapMB, meshes: stats.meshes });
    // frame rate over 5 seconds (software rendering in headless Edge: only the comparison between sizes means anything)
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
console.log(JSON.stringify(rows, null, 1));
