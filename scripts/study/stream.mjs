// Feasibility study (see docs/architecture/study_world_streaming.md): the streamed road network against the whole network, at a given map scale.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
import { root, sleep } from '../../tests/helpers.mjs';
import { openPage } from '../../tests/browser-driver.mjs';

const free = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const next = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const k = Number(process.argv[2] ?? 4);
const build = spawnSync(process.execPath, [next, 'build'], { cwd: root, env: { ...process.env, NEXT_PUBLIC_MAP_SCALE: String(k) }, encoding: 'utf8' });
if (build.status !== 0) throw new Error('build failed');
const port = await free();
const server = spawn(process.execPath, [next, 'start', '-p', String(port)], { cwd: root, env: { ...process.env, NEXT_PUBLIC_MAP_SCALE: String(k) }, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* starting */ } await sleep(500); }
const rows = [];
for (const variant of ['', '&stream=64&radius=2', '&stream=64&radius=1']) {
  const row = { k, variant: variant || 'whole network' };
  const page = await openPage(`http://localhost:${port}/?diag=1&view=diablo${variant}`, { width: 1280, height: 800 });
  const t1 = Date.now();
  let up = false;
  for (let i = 0; i < 400 && !up; i++) { try { up = await page.eval('Boolean(window.__vvPerf && window.__vvPerf.calls > 0)'); } catch { /* loading */ } if (!up) await sleep(500); }
  row.firstFrameS = up ? Math.round((Date.now() - t1) / 100) / 10 : null;
  await sleep(5000);
  const read = async () => JSON.parse(await page.eval(`JSON.stringify({ calls: window.__vvPerf.calls, triangles: window.__vvPerf.triangles, geometries: window.__vvPerf.geometries, heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6), meshes: (() => { let n = 0; window.__vvScene.traverse((o) => { if (o.isMesh) n++; }); return n; })(), stream: window.__vvStream ?? null })`));
  Object.assign(row, await read());
  if (variant) {
    // teleport across the map and watch the chunks swap
    const t0 = Date.now();
    await page.eval(`(() => { const L = window.__vvStore.getState().layout; window.__vvAvatar.x = L.land.x1 - 40; window.__vvAvatar.z = L.land.z1 - 40; })()`);
    let swapped = false;
    for (let i = 0; i < 120 && !swapped; i++) { await sleep(250); swapped = (await page.eval('window.__vvStream.unmounts')) > 0; }
    await sleep(3000);
    const after = await read();
    row.afterTeleport = { swapSeenS: swapped ? Math.round((Date.now() - t0) / 100) / 10 : null, meshes: after.meshes, heapMB: after.heapMB, stream: after.stream };
  }
  row.problems = page.problems().length;
  await page.close();
  rows.push(row);
  console.log(JSON.stringify(row));
}
server.kill();
console.log(JSON.stringify(rows, null, 1));
