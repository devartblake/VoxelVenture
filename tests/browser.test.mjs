// End-to-end check in a real (headless) browser. It starts the production server and the multiplayer server
// itself, so run `npm run build` first. Skips (exit 0) when no Edge / Chrome is installed.
//
//   - the page loads with no console errors or uncaught exceptions
//   - draw calls per frame stay low (desktop and phone emulation)
//   - clicking an empty lot and a built plot selects it (they are instanced meshes)
//   - regenerating the city twice, and claiming a luxury estate, throw nothing
//     (regression: "_fiber.refCleanup is not a function" when the plot count changed)
//   - on a phone the joystick knob sits exactly in the middle of its base, and the base in the middle of the screen
//   - the multiplayer server sees both clients, with device, frame rate and render stats, and no errors
//   - the pilot walk-through (?tour=pilot) runs on a phone in demo mode, every stop reached by tapping Next, nothing saved
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { imp, root, sleep } from './helpers.mjs';
import { findBrowser, openPage } from './browser-driver.mjs';

if (!findBrowser()) {
  console.log('SKIP: no Edge or Chrome found (set BROWSER_PATH to run the browser tests)');
  process.exit(0);
}
// `next build apps/web` writes the build to apps/web/.next (since Phase C; a checkout from before it may still have one at the root)
if (!fs.existsSync(path.join(root, 'apps', 'web', '.next', 'BUILD_ID'))) {
  console.log('SKIP: no production build found. Run `npm run build` first.');
  process.exit(0);
}

let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) fails++;
  console.log(ok ? 'ok  ' : 'FAIL', name, extra);
};

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

const webPort = await freePort();
const mpPort = await freePort();
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-browser-log-'));
const children = [];
const start = (cmd, args, env = {}) => {
  const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'ignore' });
  children.push(child);
  return child;
};
start(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', 'apps/web', '-p', String(webPort)]);
start(process.execPath, [path.join(root, 'services', 'multiplayer', 'server.mjs')], { MP_PORT: String(mpPort), MP_LOG_DIR: logDir });

async function stop() {
  for (const c of children) c.kill();
  await sleep(500);
  fs.rmSync(logDir, { recursive: true, force: true });
}

try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`http://localhost:${webPort}/`)).ok) break;
    } catch {
      /* starting */
    }
    await sleep(500);
  }
  const url = `http://localhost:${webPort}/?diag=1&view=iso&spawn=fixed&mp=${mpPort}`;
  const waitFor = async (page, expression, seconds = 90) => {
    for (let i = 0; i < seconds * 2; i++) {
      try {
        if (await page.eval(expression)) return true;
      } catch {
        /* not ready */
      }
      await sleep(500);
    }
    return false;
  };

  // ---- desktop ----
  const page = await openPage(url, { width: 1280, height: 800 });
  check('the city loads', await waitFor(page, 'Boolean(window.__vvPerf && window.__vvPerf.calls > 0)'));
  await sleep(4000);
  const perf = await page.eval('JSON.stringify(window.__vvPerf)');
  const calls = JSON.parse(perf).calls;
  check('desktop draw calls per frame stay low', calls > 0 && calls < 1200, `${calls} (was 5,617 before batching and instancing)`);

  // key events with no key at all (Chrome's autofill and some extensions send them) are ignored, not thrown on: one did throw in production
  const problemsBefore = page.problems().length;
  await page.eval(`(() => { for (const t of ['keydown', 'keyup']) { window.dispatchEvent(new Event(t)); document.dispatchEvent(new Event(t, { bubbles: true })); } return 1; })()`);
  await sleep(300);
  check('a key event with no key is ignored, not an error', page.problems().length === problemsBefore, page.problems().slice(problemsBefore).join(' | '));

  // click an empty lot and a built plot with a real mouse event
  const info = JSON.parse(await page.eval(`(() => { const st = window.__vvStore.getState(); const front = (p) => st.plots.some((q) => q !== p && q.owner && q.x > p.x - 1 && q.x < p.x + 9 && q.z > p.z - 1 && q.z < p.z + 9); /* a taller building between the lot and the camera would take the click */ const pick = (f) => st.plots.filter((p) => f(p) && !front(p)).slice(20, 21).map((p) => ({ id: p.id, x: p.x, z: p.z, h: p.height }))[0]; return JSON.stringify({ center: st.layout.center, empty: pick((p) => !p.owner && !p.prime && p.districtId !== 'outskirts'), built: pick((p) => p.owner && !p.prime) }); })()`));
  async function clickPlot(p, label) {
    const px = JSON.parse(await page.eval(`(() => {
      const { camera, controls } = window.__vvThree(); const cx = ${p.x - info.center.x}, cz = ${p.z - info.center.z};
      controls.target.set(cx, 0, cz); camera.position.set(cx + 30, 30, cz + 30); camera.zoom = 40; camera.updateProjectionMatrix(); controls.update(); camera.updateMatrixWorld();
      const e = camera.matrixWorldInverse.elements, q = camera.projectionMatrix.elements, y = Math.max(0.3, ${p.h} * 0.45); /* mid-height: a 3D model may be shorter or taller than the plot's height */
      const vx = e[0] * cx + e[4] * y + e[8] * cz + e[12], vy = e[1] * cx + e[5] * y + e[9] * cz + e[13];
      return JSON.stringify({ x: ((q[0] * vx + q[12]) + 1) / 2 * innerWidth, y: (1 - (q[5] * vy + q[13])) / 2 * innerHeight });
    })()`));
    await sleep(2500);
    await page.click(px.x, px.y);
    await sleep(800);
    const selected = await page.eval('window.__vvStore.getState().selectedPlot?.id ?? null');
    check(`clicking ${label} selects it`, selected === p.id, `clicked #${p.id}, selected ${selected}`);
    await page.eval('window.__vvStore.getState().clearSelectedPlot()');
  }
  await clickPlot(info.empty, 'an empty lot');
  await clickPlot(info.built, 'a built plot');

  // ---- the zoomed-out level of detail (lib/performance/lodPolicy.js): this browser draws with SwiftShader, so the tier is low ----
  // zoomed all the way out the buildings are stand-ins, all of them in two instanced draw calls, and the small props are hidden;
  // ?lod=off (switched here in the page) draws the full models again, with many more draw calls
  await waitFor(page, `window.__vvModels.getState().status === 'ready'`, 60);
  const zoomTo = (zoom, x = 0, z = 0) => page.eval(`(() => { const { camera, controls } = window.__vvThree(); controls.target.set(${x}, 0, ${z}); camera.position.set(${x} + 30, 30, ${z} + 30); camera.zoom = ${zoom}; camera.updateProjectionMatrix(); controls.update(); return 1; })()`);
  const lodState = async () => JSON.parse(await page.eval(`(() => { const s = window.__vvLod.getState(); let meshes = 0, instances = []; window.__vvScene.traverse((o) => { if (o.name === 'building-stand-ins') { meshes = o.children.filter((c) => c.isInstancedMesh).length; instances = o.children.map((c) => c.count); } }); return JSON.stringify({ level: s.level, hidden: s.hidden, standIns: s.counts.standIns ?? 0, standInCalls: s.counts.standInCalls ?? 0, meshes, instances, calls: window.__vvPerf.calls, badge: document.querySelector('[data-testid="quality-badge"]')?.dataset.lod }); })()`));
  await zoomTo(5);
  await sleep(2500);
  // (the models load in batches: wait until the stand-ins stop growing, and no full model is left but a selected one)
  const modelMeshes = `(() => { let n = 0; window.__vvScene.traverse((o) => { if (o.isInstancedMesh && o.parent?.name === 'model-buildings') n += o.count; }); return n; })()`;
  await waitFor(page, `(() => { const n = window.__vvLod.getState().counts.standIns ?? 0; const ok = n > 100 && n === window.__lastStandIns && ${modelMeshes} === 0; window.__lastStandIns = n; return ok; })()`, 60);
  const far = await lodState();
  check('zoomed out on the low tier the level of detail is "far" (shown on the ?diag=1 badge)', far.level === 'far' && far.badge === 'far' && ['subpixel', 'smallProps', 'labels'].every((c) => far.hidden.includes(c)), JSON.stringify(far));
  check('...and every building model is a stand-in, batched in two instanced meshes', far.standIns > 100 && far.standInCalls === 2 && far.meshes === 2 && far.instances.every((c) => c === far.standIns) && (await page.eval(modelMeshes)) === 0, JSON.stringify(far));
  await page.eval(`window.__vvLod.setState({ override: 'off' }), 1`);
  await sleep(2500);
  const full = await lodState();
  check('with ?lod=off the same view draws the full models, with far more draw calls', full.level === 'full' && full.standIns === 0 && full.calls > far.calls + 150, `far ${far.calls} calls, off ${full.calls} calls`);
  await page.eval(`window.__vvLod.setState({ override: 'auto' }), 1`);
  // a stand-in is selected like its model: click the middle of one that a ray from the camera hits first
  await zoomTo(7);
  await sleep(2500);
  const standIn = JSON.parse(await page.eval(`(() => {
    const { camera, raycaster, scene } = window.__vvThree(); camera.updateMatrixWorld();
    let roofs = null; scene.traverse((o) => { if (o.name === 'stand-in-roofs') roofs = o; }); if (!roofs) return 'null';
    const m = new camera.matrix.constructor(); const p = new camera.position.constructor();
    for (let i = 0; i < roofs.count; i++) {
      roofs.getMatrixAt(i, m); p.setFromMatrixPosition(m); const sy = m.elements[5]; p.y += sy / 2; roofs.parent.localToWorld(p);
      const ndc = p.clone().project(camera); if (Math.abs(ndc.x) > 0.25 || Math.abs(ndc.y) > 0.5) continue; /* the middle of the screen: the side panel may cover an edge */
      raycaster.setFromCamera({ x: ndc.x, y: ndc.y }, camera); const hit = raycaster.intersectObjects(scene.children, true).find((h) => h.object.visible);
      if (!hit || !/^stand-in-/.test(hit.object.name) || hit.instanceId !== i) continue;
      const local = roofs.parent.worldToLocal(p.clone()); /* the city's own coordinates, as the plots' */
      return JSON.stringify({ x: (ndc.x + 1) / 2 * innerWidth, y: (1 - ndc.y) / 2 * innerHeight, wx: local.x, wz: local.z, i });
    }
    return 'null';
  })()`));
  check('a stand-in can be found under the pointer', Boolean(standIn), JSON.stringify(standIn));
  if (standIn) {
    const before = (await lodState()).standIns;
    await page.click(standIn.x, standIn.y);
    await sleep(1200);
    const picked = JSON.parse(await page.eval(`JSON.stringify(window.__vvStore.getState().selectedPlot ?? null)`));
    const after = await lodState();
    check('clicking a stand-in selects its building', picked && picked.owner && Math.hypot(picked.x - standIn.wx, picked.z - standIn.wz) < 6, picked ? `#${picked.id} at ${picked.x},${picked.z}; stand-in at ${standIn.wx.toFixed(1)},${standIn.wz.toFixed(1)}` : 'nothing selected');
    check('...and the selected building is drawn in full, not as a stand-in', after.level === 'far' && after.standIns === before - 1, `${before} -> ${after.standIns}`);
    await page.eval('window.__vvStore.getState().clearSelectedPlot(), 1');
  }
  await zoomTo(13);
  await sleep(1500);
  check('back at the default zoom the level of detail is full again', (await lodState()).level === 'full');

  // regenerate the city (the plot count changes, so the instanced meshes are rebuilt) and claim a luxury estate
  for (const seed of [4242, 99]) {
    await page.eval(`window.__vvStore.getState().regenerateCity(${seed})`);
    await sleep(5000);
    const ok = await page.eval(`window.__vvStore.getState().layout.seed === ${seed} && window.__vvStore.getState().plots.length > 400`);
    check(`regenerating the city to #${seed} works`, ok);
  }
  const luxuryId = await page.eval('window.__vvStore.getState().plots.find((p) => p.luxury && !p.owner)?.id ?? null');
  check('a plot cannot be claimed without a roof banner logo', (await page.eval(`window.__vvStore.getState().claimPlot(${luxuryId}, 'Test', 'Test HQ', 'https://example.com', 'office')`)) === false && (await page.eval(`!window.__vvStore.getState().plots.find((p) => p.id === ${luxuryId}).owner`)));
  await page.eval(`window.__vvStore.getState().claimPlot(${luxuryId}, 'Test', 'Test HQ', 'https://example.com', 'office', null, { kind: 'generated' })`);
  await sleep(3000);
  check('the roof banners are drawn (one instanced mesh, a face on each side)', await page.eval(`(() => { let n = 0; window.__vvScene.traverse((o) => { if (o.name === 'roof-banners') n = o.count; }); const built = window.__vvStore.getState().plots.filter((p) => p.owner && p.buildingType !== 'house' && p.height > 0.2).length; return n === built * 2; })()`));
  check('claiming a luxury estate works', await page.eval(`window.__vvStore.getState().plots.find((p) => p.id === ${luxuryId}).owner === 'Test'`));
  // the side panel: every toolbar button opens its view in the same panel, which can be dragged; selecting a plot shows it there
  const tool = (v) => page.eval(`document.querySelector('[data-tool="${v}"]').click()`);
  const panelTitle = () => page.eval(`document.querySelector('[data-testid="side-panel"]')?.querySelector('h2')?.textContent ?? null`);
  const panelBox = async () => JSON.parse(await page.eval(`(() => { const r = document.querySelector('[data-testid="side-panel"]').getBoundingClientRect(); return JSON.stringify({ x: r.left, y: r.top, w: r.width }); })()`));
  await page.eval('window.__vvStore.getState().clearSelectedPlot()');
  await sleep(300);
  check('the directory is open in the panel on a first visit', /directory/i.test(String(await panelTitle())), String(await panelTitle()));
  check('the directory lists every building, numbered from 01', await page.eval(`(() => { const rows = [...document.querySelectorAll('[data-testid="directory-list"] > li')]; const n = window.__vvStore.getState().plots.filter((p) => p.owner && p.buildingType !== 'house' && p.height > 0.2).length; return rows.length === n && rows[0].innerText.startsWith('0') && /Visit website/.test(rows[0].innerText); })()`));
  await page.eval(`document.querySelector('[aria-label="Close"]').click()`);
  await sleep(300);
  check('the panel closes', (await panelTitle()) === null);

  // the statistics pill and panel (this test has no game server, so the figures are this browser's own), and the compass
  check('the pill at the top shows who is online and the visit total', await page.eval(`(() => { const t = document.querySelector('[data-testid="stats-pill"]')?.innerText ?? ''; return /click to view stats/.test(t) && /[0-9]/.test(t); })()`));
  await page.eval(`document.querySelector('[data-testid="stats-pill"]').click()`);
  await waitFor(page, `Boolean(document.querySelector('[data-testid="live-stats"]'))`, 20); // (slow headless frames)
  check('clicking the pill opens the Statistics panel with online now, latest arrivals and recorded activity', await page.eval(`(() => { const t = document.querySelector('[data-testid="live-stats"]')?.innerText ?? ''; return /Online now/.test(t) && /Latest arrivals/.test(t) && /Recorded activity/.test(t) && /Yesterday/.test(t) && /City visits/.test(t) && /Building views/.test(t) && /Website clicks/.test(t) && Number(document.querySelector('[data-testid="online-now"]').innerText) >= 1; })()`));
  await page.eval(`document.querySelector('[aria-label="Close"]').click()`);
  await sleep(300);
  await page.eval(`window.__vvView.getState().setView('diablo')`);
  await page.eval(`window.__vvView.getState().setAzimuth(0.8)`);
  await sleep(400);
  const compass = async () => JSON.parse(await page.eval(`JSON.stringify({ heading: document.querySelector('[data-testid="compass-heading"]').innerText, az: window.__vvView.getState().azimuth, disabled: document.querySelector('[aria-label="Face E"]').disabled })`));
  const c0 = await compass();
  check('the compass shows the real camera heading (azimuth 0.8 is a heading of -0.8 rad: NW)', /^NW 3[01]\d/.test(c0.heading) && c0.disabled === false, JSON.stringify(c0));
  await page.eval(`document.querySelector('[aria-label="Face E"]').click()`);
  await waitFor(page, `Math.abs(window.__vvView.getState().azimuth - -Math.PI / 2) < 0.001`, 30); // (the swing takes a few frames: slow when the machine is loaded)
  await sleep(300);
  const c1 = await compass();
  check('clicking E swings the camera round to face east', Math.abs(c1.az - -Math.PI / 2) < 0.02 && /^E 90/.test(c1.heading), JSON.stringify(c1));
  await page.eval(`document.querySelector('[aria-label="Face N"]').click()`);
  await waitFor(page, `Math.abs(window.__vvView.getState().azimuth) < 0.001`, 30);
  await sleep(300);
  const c2 = await compass();
  check('clicking N faces north again', Math.abs(c2.az) < 0.02 && /^N 0/.test(c2.heading), JSON.stringify(c2));
  await page.eval(`document.querySelector('[aria-label="Turn the camera right"]').click()`);
  await sleep(2500);
  check('the arrows turn the camera a step', await page.eval(`Math.abs(window.__vvView.getState().azimuth - -Math.PI / 4) < 0.02`));
  // the compass follows the avatar: the yellow arrow turns with its heading, and the camera can swing to stand behind it
  for (const [yaw, want, deg] of [[Math.PI, 'N', 0], [Math.PI / 2, 'E', 90], [0, 'S', 180], [-Math.PI / 2, 'W', 270]]) {
    await page.eval(`window.__vvAvatar.yaw = ${yaw}`);
    await waitFor(page, `document.querySelector('[data-testid="compass-you"]').innerText.includes('You: ${want}')`, 8); // (headless frames are slow)
    const you = JSON.parse(await page.eval(`JSON.stringify({ text: document.querySelector('[data-testid="compass-you"]').innerText, rot: document.querySelector('[data-testid="compass-avatar"]').style.transform })`));
    check(`the compass arrow shows the avatar facing ${want}`, you.text.includes(`You: ${want}`) && Math.abs(Number(/rotate\((-?[\d.]+)deg\)/.exec(you.rot)?.[1]) - deg) < 1, JSON.stringify(you));
  }
  await page.eval(`window.__vvAvatar.yaw = Math.PI / 2`); // facing east
  await page.eval(`document.querySelector('[aria-label="Camera behind me"]').click()`);
  await sleep(2500);
  check('the camera swings to stand behind the avatar', await page.eval(`(() => { const az = window.__vvView.getState().azimuth; const want = Math.PI / 2 + Math.PI; const d = Math.abs((((az - want) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); return d < 0.03; })()`));
  await page.eval(`window.__vvView.getState().setView('iso')`);
  await sleep(400);
  const ciso = await compass();
  check('in the original view the compass shows the fixed heading and cannot turn', ciso.disabled === true && /^NW 315/.test(ciso.heading), JSON.stringify(ciso));
  // ---- first person, and the follow cameras never end up inside a building
  const spots = JSON.parse(await page.eval(`JSON.stringify(window.__vvStore.getState().plots.filter((p) => p.owner && !p.designSite).slice(0, 5).map((p) => ({ x: p.x + 1.5, z: p.z + 1.5 })))`));
  await page.eval(`window.__vvView.getState().setView('first')`);
  await page.eval(`window.__vvAvatar.x = ${spots[0].x}; window.__vvAvatar.z = ${spots[0].z}; window.__vvView.getState().setAzimuth(0)`);
  await waitFor(page, `(() => { const { camera } = window.__vvThree(); const c = window.__vvStore.getState().layout.center; return Math.hypot(camera.position.x + c.x - window.__vvAvatar.x, camera.position.z + c.z - window.__vvAvatar.z) < 0.05; })()`, 30);
  const fp = JSON.parse(await page.eval(`(() => { const { camera } = window.__vvThree(); const c = window.__vvStore.getState().layout.center; const dir = camera.getWorldDirection(new (camera.position.constructor)()); return JSON.stringify({ dx: camera.position.x + c.x - window.__vvAvatar.x, dz: camera.position.z + c.z - window.__vvAvatar.z, y: camera.position.y, look: [dir.x, dir.z] }); })()`));
  check('first person puts the camera at the eye height', Math.hypot(fp.dx, fp.dz) < 0.05 && fp.y > 1 && fp.y < 2, JSON.stringify(fp));
  check('first person looks north at azimuth 0', fp.look[1] < -0.9, JSON.stringify(fp.look));
  await page.eval(`window.__vvView.getState().rotate(-Math.PI / 2)`);
  check('turning right in first person looks east', await waitFor(page, `(() => { const { camera } = window.__vvThree(); return camera.getWorldDirection(new (camera.position.constructor)()).x > 0.9; })()`, 30));
  await page.eval(`window.__vvView.getState().tilt(0.2)`);
  check('tilting looks down in first person', (await page.eval(`window.__vvView.getState().look`)) < -0.1);
  // look around: the follow camera lets go of the avatar
  await page.eval(`window.__vvView.getState().setView('diablo')`);
  await page.eval(`window.__vvAvatar.x = ${spots[0].x}; window.__vvAvatar.z = ${spots[0].z}`);
  await sleep(800);
  await page.eval(`window.__vvView.getState().startFree(); window.__vvView.getState().panFree(-400, 0, window.__vvStore.getState().layout.land)`);
  await waitFor(page, `(() => { const { camera } = window.__vvThree(); const c = window.__vvStore.getState().layout.center; return Math.hypot(camera.position.x + c.x - window.__vvAvatar.x, camera.position.z + c.z - window.__vvAvatar.z) > 20; })()`, 30);
  check('look around moves the camera away from the avatar, which stays put', Math.abs((await page.eval(`window.__vvAvatar.x`)) - spots[0].x) < 0.5);
  await page.eval(`window.__vvView.getState().endFree()`);
  check('ending the look-around returns the camera to the avatar', await waitFor(page, `(() => { const { camera } = window.__vvThree(); const c = window.__vvStore.getState().layout.center; return Math.hypot(camera.position.x + c.x - window.__vvAvatar.x, camera.position.z + c.z - window.__vvAvatar.z) < 40 && window.__vvView.getState().free === null; })()`, 30));
  for (const view of ['first', 'diablo', 'third', 'tactical']) {
    await page.eval(`window.__vvView.getState().setView('${view}')`);
    let inside = 0;
    for (const sp of spots) {
      await page.eval(`window.__vvAvatar.x = ${sp.x}; window.__vvAvatar.z = ${sp.z}`);
      await sleep(700);
      inside += await page.eval(`(() => { const { camera } = window.__vvThree(); const st = window.__vvStore.getState(); const c = st.layout.center; const x = camera.position.x + c.x, z = camera.position.z + c.z; return st.plots.some((p) => p.owner && Math.abs(x - p.x) < (p.w ?? 4) / 2 - 0.2 && Math.abs(z - p.z) < (p.d ?? 4) / 2 - 0.2 && camera.position.y < 3) ? 1 : 0; })()`);
    }
    check(`the ${view} camera is not inside a building beside tall plots`, inside === 0, `${inside} of ${spots.length}`);
  }
  await page.eval(`window.__vvView.getState().setView('iso')`);
  await page.eval(`window.__vvView.getState().setView('iso')`); // (the rest of the test uses the original view)
  await sleep(300);

  // the corner map follows the avatar closely, and its + and - change how much it shows
  check('the corner map is the following map', await page.eval(`Boolean(document.querySelector('canvas[aria-label="Mini-map, following you"]'))`));
  const zoomTitle = () => page.eval(`document.querySelector('[aria-label="Map wider"]').parentElement.title`);
  check('the map starts close', /^Close/.test(String(await zoomTitle())), String(await zoomTitle()));
  await page.eval(`document.querySelector('[aria-label="Map wider"]').click()`);
  await sleep(300);
  check('"-" shows more of the city', /^Around/.test(String(await zoomTitle())), String(await zoomTitle()));
  await page.eval(`document.querySelector('[aria-label="Map closer"]').click()`);
  await sleep(300);
  check('"+" comes back in close', /^Close/.test(String(await zoomTitle())));

  // the pop-up market on its site: opens in the side panel, draws its stalls, and a stall can be booked (in the browser's own market, with no server)
  await page.eval(`(() => { const a = window.__vvStore.getState().layout.reserved.find((r) => r.market); window.__vvPanel.getState().editReserved(a.id); })()`);
  await waitFor(page, `Boolean(window.__vvMarket.getState().data)`, 30);
  await sleep(1500);
  check('the market site opens the Sites & market panel with its ID code', /sites/i.test(String(await panelTitle())) && await page.eval(`/Pop-up market/.test(document.querySelector('[data-testid="side-panel"]').innerText) && /SD-0004/.test(document.querySelector('[data-testid="side-panel"]').innerText)`));
  check('every site has an ID code on its tab', await page.eval(`[...document.querySelectorAll('[data-testid="side-panel"] [role="tab"]')].filter((t) => /SD-000[0-9]/.test(t.innerText)).length >= 4`));
  check('the market draws its stalls (three instanced meshes)', await page.eval(`(() => { let n = 0; window.__vvScene.traverse((o) => { if (o.name === 'market') n = o.children.filter((c) => c.isInstancedMesh && c.count > 0).length; }); return n >= 2; })()`));
  const market = JSON.parse(await page.eval(`(() => { const m = window.__vvMarket.getState(); const stall = m.data.stalls.find((s) => s.tier === 'prime'); return JSON.stringify({ total: m.data.stalls.length, id: stall.id, cents: stall.cents, week: m.data.week, end: m.data.window.end }); })()`));
  check('the market has plenty of stalls, priced $2 to $5', market.total >= 40 && market.cents >= 200 && market.cents <= 500, JSON.stringify(market));
  // a 24-hour booking from the next hour but one; a market week ends on Monday 00:00 UTC, so in its last day that would run past the end,
  // and the booking goes in the first day of next week instead (this check failed every Sunday before)
  const booked = await page.eval(`(async () => {
    const m0 = window.__vvMarket.getState();
    const weekEnd = Date.parse(m0.week + 'T00:00:00Z') + 7 * 86400000;
    let start = Math.ceil(Date.now() / 3600000) * 3600000 + 3600000;
    if (start + 24 * 3600000 > weekEnd) {
      m0.setWeek(new Date(weekEnd).toISOString().slice(0, 10));
      for (let i = 0; i < 60 && !(window.__vvMarket.getState().data && !window.__vvMarket.getState().busy); i++) await new Promise((r) => setTimeout(r, 250));
      await new Promise((r) => setTimeout(r, 500));
      start = weekEnd;
    }
    const m = window.__vvMarket.getState();
    const stall = m.data.stalls.find((s) => s.tier === 'prime');
    const ok = await m.book({ stallId: stall.id, hours: 24, start, brand: 'Test Stall', product: 'Things' });
    const after = window.__vvMarket.getState();
    return JSON.stringify({ ok, mine: after.mine.length, taken: after.data.bookings.length, stallId: stall.id, start, week: after.week, notice: after.notice?.text ?? null });
  })()`);
  const slot = JSON.parse(booked);
  check('booking a stall works and shows in "your stalls"', slot.ok && slot.mine === 1 && slot.taken === 1, booked);
  const again = await page.eval(`(async () => { const m = window.__vvMarket.getState(); return String(await m.book({ stallId: '${slot.stallId}', hours: 24, start: ${slot.start}, brand: 'Second', product: '' })); })()`);
  check('the same stall cannot be booked twice at the same time', again === 'false');
  await page.eval(`document.querySelector('[aria-label="Close"]').click()`);
  await sleep(300);
  const seen = [];
  for (const v of ['directory', 'stats', 'search', 'places', 'online', 'wardrobe', 'play', 'city', 'dashboard']) {
    await tool(v);
    await sleep(250);
    seen.push(await panelTitle());
    const count = await page.eval(`document.querySelectorAll('[data-testid="side-panel"]').length`);
    if (count !== 1) seen.push(`(${count} panels)`);
  }
  check('the dashboard (My businesses) shows what you own, or how to get a building', /My businesses/i.test(seen[8] ?? '') && /don.t own a building|Set-up/.test(await page.eval(`document.querySelector('[data-testid="side-panel"]').innerText`)), seen[8]);
  check('each toolbar button opens its view in the one panel', seen.every((t) => t && !t.startsWith('(')) && new Set(seen).size === 9, seen.join(' | '));
  check('the wardrobe view stops the avatar from walking', (await tool('wardrobe'), await sleep(200), await page.eval('window.__vvStore.getState().wardrobeOpen')));
  await tool('stats');
  await sleep(250);
  const before = await panelBox();
  check('the side panel is wide enough for the building card (at least 420 px)', before.w >= 420, `${before.w} px`);
  await page.drag(before.x + before.w / 2, before.y + 18, before.x + before.w / 2 + 260, before.y + 18 + 150);
  await sleep(300);
  const moved = await panelBox();
  check('the panel can be dragged by its header', Math.abs(moved.x - before.x - 260) < 6 && Math.abs(moved.y - before.y - 150) < 6, `${before.x},${before.y} -> ${moved.x},${moved.y}`);
  await page.eval(`document.querySelector('[aria-label="Expand the panel"]').click()`);
  await sleep(250);
  check('the panel can be expanded', (await panelBox()).w > before.w + 100);
  await page.eval(`window.__vvStore.getState().setSelectedPlot(window.__vvStore.getState().plots.find((p) => p.owner && p.buildingType !== 'house'))`);
  await sleep(400);
  check('selecting a plot shows it in the same panel', /building/i.test(await panelTitle()), String(await panelTitle()));
  const card = await page.eval(`document.querySelector('[data-testid="side-panel"]').innerText`);
  check('the building card shows Step inside, an address, the site visits and the building history', ['Step inside', 'Address', 'Site visits', 'Where visitors come from', 'Building history', 'Visit website'].every((t) => card.toLowerCase().includes(t.toLowerCase())), card.slice(0, 80));
  await page.eval(`document.querySelector('[data-testid="create-image"]').click()`);
  await sleep(1200);
  check('Create image makes a picture of the building', /Image saved|Shared/.test(String(await page.eval(`window.__vvStore.getState().toast?.text ?? ''`))), String(await page.eval(`window.__vvStore.getState().toast?.text ?? ''`)));
  await page.eval(`document.querySelector('[aria-label="Back"]').click()`);
  await sleep(300);
  check('back returns to the view that was showing', (await panelTitle()) === 'Statistics' || /stat/i.test(String(await panelTitle())), String(await panelTitle()));
  await page.eval(`document.querySelector('[aria-label="Close"]').click()`);
  await sleep(300);
  check('close hides the panel', (await panelTitle()) === null);

  // this is a production build: the reserved-site designer (a development tool) must not exist, and the ground patches do
  check('the site designer refuses to run in a production build', (await page.eval(`window.__vvStore.getState().setReservedDesign('reserved-1', {})`)) === false && (await page.eval(`window.__vvStore.getState().layout.reserved.every((a) => !a.designed)`)));
  await page.eval(`window.__vvPanel.getState().editReserved('reserved-1')`);
  await sleep(300);
  check('...and its panel shows nothing', (await page.eval(`document.querySelector('[data-testid="side-panel"]')?.innerText.includes('Development tool') ?? false`)) === false);
  await page.eval(`window.__vvPanel.getState().close()`);
  check('the ground has patches of several kinds', await page.eval(`(() => { const p = window.__vvStore.getState().layout.landscape.patches; return p.length > 100 && new Set(p.map((q) => q.kind)).size >= 4; })()`));

  // driving, sailing and fishing
  const press = async (key, ms) => { await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}' }))`); await sleep(ms); await page.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { key: '${key}' }))`); };
  await page.eval(`(() => { const f = window.__vvFleet; f.store.getState().reset(); const car = f.refs.sim.cars[0]; window.__vvAvatar.x = car.x; window.__vvAvatar.z = car.z; window.__vvCarId = car.id; f.store.getState().enterCar(car); })()`);
  await sleep(400);
  check('E near a car takes it off the road and puts you in it', await page.eval(`window.__vvAvatar.vehicle?.kind === 'car' && !window.__vvFleet.refs.sim.cars.some((c) => c.id === window.__vvCarId)`));
  const carFrom = JSON.parse(await page.eval(`JSON.stringify({ x: window.__vvAvatar.x, z: window.__vvAvatar.z })`));
  await press('w', 1500);
  for (let i = 0; i < 20 && (await page.eval(`window.__vvAvatar.vehicle.speed < 1 || Math.hypot(window.__vvAvatar.x - ${carFrom.x}, window.__vvAvatar.z - ${carFrom.z}) < 0.3`)); i++) await press('w', 1500); // a loaded machine renders few frames: keep the key down until it has speeded up
  const carTo = JSON.parse(await page.eval(`JSON.stringify({ x: window.__vvAvatar.x, z: window.__vvAvatar.z, speed: window.__vvAvatar.vehicle.speed })`));
  check('W drives the car (it speeds up and moves; headless frame rates are low)', Math.hypot(carTo.x - carFrom.x, carTo.z - carFrom.z) > 0.15 && carTo.speed > 1, `${Math.hypot(carTo.x - carFrom.x, carTo.z - carFrom.z).toFixed(1)} units, speed ${carTo.speed.toFixed(1)}`);
  check('the driving panel is showing', await page.eval(`document.body.innerText.includes('km/h')`));
  check('getting out leaves the car parked and puts you back on foot', (await page.eval(`window.__vvFleet.store.getState().exit()`)) === true && (await page.eval(`window.__vvAvatar.vehicle === null && window.__vvFleet.store.getState().parked.length === 1`)));
  await sleep(300);
  await page.eval(`(() => { const L = window.__vvStore.getState().layout; const b = L.boats[0]; const f = window.__vvFleet; window.__vvAvatar.x = b.x + 0.3; window.__vvAvatar.z = b.z; f.store.getState().enterBoat(b); })()`);
  await sleep(400);
  check('E at a mooring puts you in the boat', await page.eval(`window.__vvAvatar.vehicle?.kind === 'boat'`));
  await press('w', 800);
  await sleep(2500); // let it slow right down
  await press(' ', 100);
  check('Space casts the line', await page.eval(`window.__vvFleet.refs.line.phase === 'waiting'`));
  await page.eval(`window.__vvFleet.refs.line.timer = 0.05`);
  check('a fish bites', await waitFor(page, `window.__vvFleet.refs.line.phase === 'bite'`, 10)); // (a slow headless frame can take a second)
  const caughtBefore = await page.eval(`Object.values(window.__vvStore.getState().fishing.caught).reduce((a, n) => a + n, 0)`);
  await press(' ', 100);
  await sleep(300);
  check('reeling in on the bite catches a fish', (await page.eval(`Object.values(window.__vvStore.getState().fishing.caught).reduce((a, n) => a + n, 0)`)) === caughtBefore + 1);
  check('the boat stays on the water', await page.eval(`(() => { const a = window.__vvAvatar; const L = window.__vvStore.getState().layout; return L.lakes.some((l) => Math.abs(a.x - l.x) < l.rx && Math.abs(a.z - l.z) < l.rz) || (a.x > L.rivers[0].x0 && a.x < L.rivers[0].x1 && a.z > L.rivers[0].z0 && a.z < L.rivers[0].z1); })()`));
  check('you can get out of the boat on the shore', (await page.eval(`window.__vvFleet.store.getState().exit()`)) === true && (await page.eval(`window.__vvAvatar.vehicle === null`)));
  await page.eval(`window.__vvFleet.store.getState().reset()`);

  // ---- the Kenney models (CC0): the boats, the pier decks and the amusement park's gate, stalls and train load and are drawn ----
  check('the Kenney boat, pier and park models load', await waitFor(page, `(() => { const g = window.__vvProps.getState().geometries; return ['watercraft/boat-row-large', 'watercraft/boat-fishing-small', 'pirate/platform', 'pirate/barrel', 'coaster/park-entrance', 'coaster/stall-food', 'coaster/coaster-train'].every((id) => g[id]); })()`, 90));
  check('they are in the scene: a boat, the pier slabs, the gate', await page.eval(`(() => { const g = window.__vvProps.getState().geometries; let boat = 0, slab = 0, gate = 0; window.__vvScene.traverse((o) => { if (!o.isMesh) return; if (o.geometry === g['watercraft/boat-row-large'] || o.geometry === g['watercraft/boat-fishing-small']) boat++; if (o.geometry === g['pirate/platform']) slab++; if (o.geometry === g['coaster/park-entrance']) gate++; }); return boat >= 2 && slab >= 8 && gate >= 1; })()`));
  // ---- piers: out on the water, leaving sails the boat to the nearest pier and you step onto it; and you can fish from the end of a pier ----
  check('the city has piers, a riverwalk and they are drawn', await page.eval(`(() => { const L = window.__vvStore.getState().layout; const sc = window.__vvScene; const count = (n) => { const g = sc.getObjectByName(n); let m = 0; g?.traverse((o) => { if (o.isMesh) m++; }); return m; }; return L.piers.length >= 2 && L.promenades.length >= 1 && count('piers') > 0 && count('promenade') > 0; })()`));
  await page.eval(`(() => { const L = window.__vvStore.getState().layout; const b = L.boats.find((x) => x.water.startsWith('lake')) ?? L.boats[0]; window.__vvAvatar.x = b.x + 0.3; window.__vvAvatar.z = b.z; window.__vvFleet.store.getState().enterBoat(b); const w = L.lakes.find((l) => l.id === b.water); const v = window.__vvAvatar.vehicle; if (w) { v.x = w.x + 0.5; v.z = w.z; } })()`);
  await sleep(400);
  const out = await page.eval(`window.__vvFleet.store.getState().exit()`);
  check('out on the water, getting out sends the boat to a pier', out === 'docking' && (await page.eval(`window.__vvAvatar.vehicle?.kind === 'boat'`)) && (await waitFor(page, `window.__vvFleet.store.getState().hud?.docking === true || window.__vvAvatar.vehicle === null`, 20)), String(out));
  check('the boat docks and you step onto the pier', await waitFor(page, `window.__vvAvatar.vehicle === null`, 240) && (await page.eval(`(() => { const a = window.__vvAvatar; const L = window.__vvStore.getState().layout; return L.piers.some((p) => a.x > p.x0 - 0.3 && a.x < p.x1 + 0.3 && a.z > p.z0 - 0.3 && a.z < p.z1 + 0.3); })()`)));
  check('the boat is left tied up beside the pier and the boat panel goes away', await page.eval(`(() => { const f = window.__vvFleet.store.getState(); return Object.keys(f.moved).length === 1 && f.hud === null && !window.__vvFleet.refs.dock; })()`));
  // fishing from the end of the pier on foot
  await page.eval(`(() => { const L = window.__vvStore.getState().layout; const a = window.__vvAvatar; const p = L.piers.find((q) => a.x > q.x0 - 0.5 && a.x < q.x1 + 0.5 && a.z > q.z0 - 0.5 && a.z < q.z1 + 0.5) ?? L.piers[0]; a.x = p.fish.x; a.z = p.fish.z; })()`);
  check('at the end of a pier the prompt offers to fish', await waitFor(page, `window.__vvWorld.getState().prompt?.label === 'Fish from the pier'`, 20));
  await page.eval(`window.__vvWorld.getState().prompt.action()`);
  check('casting from the pier puts the line out', await page.eval(`window.__vvFleet.refs.line.phase === 'waiting' && Boolean(window.__vvFleet.refs.pierFishing)`));
  await page.eval(`window.__vvFleet.refs.line.timer = 0.05`);
  check('a fish bites at the pier', await waitFor(page, `window.__vvFleet.refs.line.phase === 'bite'`, 20));
  const caughtPier = await page.eval(`Object.values(window.__vvStore.getState().fishing.caught).reduce((a, n) => a + n, 0)`);
  await waitFor(page, `window.__vvWorld.getState().prompt?.label === 'Bite! Reel it in!'`, 10);
  await page.eval(`window.__vvWorld.getState().prompt.action()`);
  await sleep(300);
  check('reeling in at the pier catches a fish', (await page.eval(`Object.values(window.__vvStore.getState().fishing.caught).reduce((a, n) => a + n, 0)`)) === caughtPier + 1);
  await page.eval(`window.__vvFleet.store.getState().reset()`);

  check('no console errors or uncaught exceptions on the desktop page', page.problems().length === 0, page.problems().slice(0, 3).join(' | '));

  // ---- the malls: the directory lists the stores, and each store opens its own interior ----
  await page.eval(`window.__vvPanel.getState().openMall('mall-1')`);
  await sleep(600);
  check('the mall directory lists its stores', await page.eval(`(() => { const t = document.querySelector('[data-testid="side-panel"]')?.innerText ?? ''; const m = window.__vvStore.getState().layout.malls[0]; return t.includes(m.name) && m.stores.every((st) => t.includes(st.title)); })()`));
  check('two malls stand at opposite ends of the city', await page.eval(`(() => { const L = window.__vvStore.getState().layout; return L.malls.length === 2 && L.malls[1].x - L.malls[0].x > 150; })()`));
  // clicking anywhere on a mall (its wall, its entrance canopy, its roof) opens its directory
  for (const [label, local] of [['wall', [0, 1.5, 0]], ['entrance canopy', [0, 2.35, 1]], ['roof', [0, 3.9, 0]]]) {
    await page.eval(`window.__vvPanel.getState().close()`);
    const px = JSON.parse(await page.eval(`(() => {
      const L = window.__vvStore.getState().layout; const m = L.malls[1]; const { camera, controls, scene } = window.__vvThree(); const g = scene.getObjectByName(m.id);
      const cx = m.x - L.center.x, cz = m.z - L.center.z; controls.target.set(cx, 0, cz); camera.position.set(cx + 40, 40, cz + 40); camera.zoom = 14; camera.updateProjectionMatrix(); controls.update(); camera.updateMatrixWorld(); g.updateMatrixWorld(true);
      const f = m.facing ?? 1; const v = g.position.clone().set(${local[0]}, ${local[1]}, ${local[2]} * 0 + (${local[2]} ? (m.d / 2 + ${local[2]} * 1.1) * f : ${local[0]}));
      g.localToWorld(v); v.project(camera);
      return JSON.stringify({ x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight });
    })()`));
    await sleep(1500);
    await page.click(px.x, px.y);
    await sleep(700);
    check(`clicking the mall's ${label} opens its directory`, (await page.eval(`window.__vvPanel.getState().view === 'mall' && window.__vvPanel.getState().mallId === 'mall-2'`)) === true, `${px.x.toFixed(0)},${px.y.toFixed(0)}`);
  }
  const pickStores = JSON.parse(await page.eval(`JSON.stringify(['shop', 'restaurant', 'office'].map((t) => window.__vvStore.getState().layout.malls[0].stores.find((st) => st.buildingType === t)).map((st) => ({ id: st.id, title: st.title, type: st.buildingType, variant: st.interiorData.variant })))`));
  const seenLayouts = [];
  for (const st of pickStores) {
    await page.eval(`window.__vvStore.getState().openInterior(window.__vvStore.getState().layout.malls[0].stores.find((x) => x.id === '${st.id}'))`);
    await sleep(st === pickStores[0] ? 9000 : 4500);
    const shown = await page.eval(`document.body.innerText`);
    seenLayouts.push(shown.includes(`${st.type} · ${st.variant}`) || shown.includes(st.variant));
    check(`the interior of ${st.title} (${st.type}) opens`, shown.includes(st.title) && shown.includes('Store ') && shown.includes('In '), shown.includes(st.title) ? '' : 'title missing');
    const spots = await page.eval(`[...document.querySelectorAll('[data-testid="hotspots"] button')].map((b) => b.innerText)`);
    check(`the interior of ${st.title} has hotspots`, Array.isArray(spots) && ['Whole room', 'Entrance', 'Back wall'].every((t) => spots.includes(t)), JSON.stringify(spots));
    await page.eval(`[...document.querySelectorAll('[data-testid="hotspots"] button')].find((b) => b.innerText === 'Entrance').click()`);
    // (the avatar walks there too, and lights each spot it walks up to on the way, such as the offer desk; since the city behind
    // the interior is drawn only a few times a second the room runs fast enough for that within moments, so wait for it to arrive)
    const pressedSpot = `[...document.querySelectorAll('[data-testid="hotspots"] button')].find((b) => b.getAttribute('aria-pressed') === 'true')?.innerText ?? null`;
    const marked = await waitFor(page, `${pressedSpot} === 'Entrance'`, 15);
    check('choosing a hotspot marks it', marked, marked ? '' : `pressed: ${await page.eval(pressedSpot)}`);
    if (st === pickStores[0]) {
      // the props come from the props bucket in a build with NEXT_PUBLIC_PROPS_BASE_URL, otherwise from the site's own /items
      // (lib/content/interiorProps.js), never from Pascal's CDN: read from the page's network log
      const glbs = JSON.parse(await page.eval(`JSON.stringify(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('.glb')))`));
      const origin = await page.eval('location.origin');
      const propsBase = (process.env.NEXT_PUBLIC_PROPS_BASE_URL ?? '').replace(/\/+$/, '');
      const ours = glbs.filter((u) => (propsBase ? u.startsWith(`${propsBase}/props/`) : u.startsWith(`${origin}/items/`)));
      check(`the room's models load from ${propsBase ? 'the props bucket' : 'the site\'s own /items'}, the door too`, ours.length >= 3 && ours.some((u) => /\/door\/[^/]*\/?model\.glb$/.test(u)) && !glbs.some((u) => u.includes('editor.pascal.app')), `${ours.length} of ${glbs.length}: ${glbs.filter((u) => !ours.includes(u)).slice(0, 3).join(' ')}`);
      // the visitor's avatar in the room: it comes in at the door, walks where it is sent, never through the furniture, and can be hidden
      const walk0 = JSON.parse(await page.eval(`JSON.stringify(window.__vvRoomWalk ? (() => { const w = window.__vvRoomWalk.where(); return { x: w.x, z: w.z, rects: w.map?.rects?.length ?? -1, bounds: w.map?.bounds }; })() : null)`));
      check('the avatar is in the room, with the furniture as its floor plan', Boolean(walk0 && walk0.rects > 0 && walk0.bounds), JSON.stringify(walk0));
      if (walk0) {
        const to = { x: walk0.bounds.x0 + 1, z: walk0.bounds.z0 + 1 }; // the back corner: across the room, round whatever is in the way
        await page.eval(`window.__vvRoomWalk.walkTo(${to.x}, ${to.z}); 1`);
        let blocked = false;
        let walked = null;
        for (let i = 0; i < 80; i++) {
          await sleep(250);
          walked = JSON.parse(await page.eval(`(() => { const w = window.__vvRoomWalk.where(); const r = 0.17; const inside = w.map.rects.some((q) => w.x > q.x0 - r && w.x < q.x1 + r && w.z > q.z0 - r && w.z < q.z1 + r); return JSON.stringify({ x: w.x, z: w.z, walking: w.walking, inside }); })()`));
          blocked ||= walked.inside;
          if (!walked.walking) break;
        }
        check('sent across the room, it walks there', walked && !walked.walking && Math.hypot(walked.x - walk0.x, walked.z - walk0.z) > 1, JSON.stringify({ from: walk0, to: walked }));
        check('and never through the furniture on the way', !blocked);
      }
      await page.eval(`document.querySelector('[data-testid="room-walk"]').click()`);
      await sleep(400);
      check('the Walk switch hides the avatar', (await page.eval(`document.querySelector('[data-testid="room-walk"]').getAttribute('aria-pressed')`)) === 'false');
      await page.eval(`document.querySelector('[data-testid="room-walk"]').click()`);
      await sleep(400);
      // the rich-effects switch: off by default, turns on and off again, and the viewer is still there afterwards
      check('rich effects start off', (await page.eval(`document.querySelector('[data-testid="viewer-fx"]')?.getAttribute('aria-pressed')`)) === 'false');
      await page.eval(`document.querySelector('[data-testid="viewer-fx"]').click()`);
      await sleep(2500);
      check('rich effects can be switched on', (await page.eval(`document.querySelector('[data-testid="viewer-fx"]')?.getAttribute('aria-pressed')`)) === 'true');
      await page.eval(`document.querySelector('[data-testid="viewer-fx"]').click()`);
      await sleep(2500);
      check('...and off again, with the viewer still showing', (await page.eval(`document.querySelector('[data-testid="viewer-fx"]')?.getAttribute('aria-pressed')`)) === 'false' && (await page.eval(`document.querySelectorAll('canvas').length`)) >= 2);
    }
    await page.eval(`window.__vvStore.getState().closeInterior()`);
    await sleep(500);
  }
  check('the stores have different interior layouts', new Set(pickStores.map((st) => `${st.type}/${st.variant}`)).size === 3);
  await page.eval(`window.__vvPanel.getState().close()`);

  // ---- the world map (M): opens over a running world, culls to what is in view, routes along the roads ----
  const tBefore = await page.eval(`window.__vvPerf ? window.__vvPerf.calls : 1`);
  await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }))`);
  check('M opens the world map', await waitFor(page, `Boolean(document.querySelector('[data-testid="world-map"]'))`));
  await sleep(1500);
  const wide = JSON.parse(await page.eval(`JSON.stringify(window.__vvMap || {})`));
  check('the world map draws the whole city', wide.plotsTotal > 100 && wide.plotsInView > 0, JSON.stringify(wide));
  const cv = JSON.parse(await page.eval(`(() => { const r = document.querySelector('[data-testid="world-map-canvas"]').getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); })()`));
  for (let i = 0; i < 20; i++) { // (a slow frame can drop a wheel turn: zoom until the map is close or the turns run out)
    await page.eval(`document.querySelector('[data-testid="world-map-canvas"]').dispatchEvent(new WheelEvent('wheel', { deltaY: -300, clientX: ${cv.x}, clientY: ${cv.y}, bubbles: true, cancelable: true }))`);
    await sleep(120);
    if (i >= 7 && (await page.eval(`Boolean(window.__vvMap && window.__vvMap.plotsInView < ${wide.plotsInView * 0.3})`))) break;
  }
  await waitFor(page, `window.__vvMap && window.__vvMap.plotsInView < ${wide.plotsInView * 0.5}`, 30);
  const close = JSON.parse(await page.eval(`JSON.stringify(window.__vvMap || {})`));
  check('zoomed in, only the plots in view are drawn', close.plotsInView < wide.plotsInView * 0.5 && close.plotsInView < close.plotsTotal * 0.3, `${close.plotsInView}/${close.plotsTotal} (was ${wide.plotsInView})`);
  check('the static layer is cheap to redraw', close.staticMs < 60, `${Math.round(close.staticMs)} ms`);
  await page.click(cv.x + 60, cv.y + 40);
  await sleep(500);
  await page.eval(`document.querySelector('[data-testid="map-card"]') && [...document.querySelectorAll('[data-testid="map-card"] button')].find((b) => b.innerText === 'Waypoint').click()`); // (the click may have landed on a building: its card offers the waypoint too)
  await sleep(300);
  const wp = JSON.parse(await page.eval(`JSON.stringify({ wp: window.__vvMapStore.getState().waypoint, n: window.__vvMapStore.getState().route?.points.length })`));
  check('clicking the map sets a waypoint with a route', Boolean(wp.wp) && wp.n >= 2, JSON.stringify(wp));
  // a click on a building offers to open it, from anywhere on the map
  const target = JSON.parse(await page.eval(`JSON.stringify((() => { const p = window.__vvStore.getState().plots.find((q) => q.owner && !q.admin && q.buildingType !== 'house'); return { id: p.id, x: p.x, z: p.z }; })())`));
  await page.eval(`window.__vvMap.goTo({ cx: ${target.x}, cz: ${target.z}, scale: 8 })`);
  await waitFor(page, `window.__vvMap && window.__vvMap.plotsInView < 40`, 30);
  await sleep(500);
  await page.click(cv.x, cv.y);
  await sleep(500);
  check('clicking a building on the map offers to open it', await page.eval(`Boolean(document.querySelector('[data-testid="map-card-open"]'))`));
  await page.eval(`document.querySelector('[data-testid="map-card-open"]').click()`);
  await sleep(500);
  check('Open closes the map and selects the building', (await page.eval(`window.__vvStore.getState().selectedPlot?.id`)) != null && (await page.eval(`Boolean(document.querySelector('[data-testid="world-map"]'))`)) === false);
  await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }))`);
  await sleep(400);
  await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }))`);
  await sleep(400);
  check('M closes the world map again', (await page.eval(`Boolean(document.querySelector('[data-testid="world-map"]'))`)) === false);
  void tBefore;

  // ---- deep links: /?plot=ID opens the building, and /b/ID redirects to it ----
  const linkPlot = JSON.parse(await page.eval(`JSON.stringify((() => { const st = window.__vvStore.getState(); const p = st.plots.find((q) => q.owner && !q.admin && q.buildingType !== 'house'); return { id: p.id, seed: st.layout.seed }; })())`));
  const DEFAULT_CITY = 20260101; // what a fresh browser starts with (the main page above has regenerated its city since)
  const linkId = 12;
  await page.eval(`window.__vvStore.getState().setSelectedPlot(null); window.__vvPanel.getState().close()`);
  const short = await fetch(`http://localhost:${webPort}/b/${linkId}`, { redirect: 'manual' });
  check('the short link /b/ID redirects to the building link', [307, 308].includes(short.status) && (short.headers.get('location') ?? '').endsWith(`/?plot=${linkId}`), `${short.status} ${short.headers.get('location')}`);
  const badShort = await fetch(`http://localhost:${webPort}/b/${encodeURIComponent('<x>')}`, { redirect: 'manual' });
  check('a bad id in the short link goes to the plain city', [307, 308].includes(badShort.status) && /\/$/.test(badShort.headers.get('location') ?? ''), `${badShort.status} ${badShort.headers.get('location')}`);
  const linked = await openPage(`http://localhost:${webPort}/?plot=${linkId}&city=${DEFAULT_CITY}&diag=1&view=iso&mp=${mpPort}`, { width: 1280, height: 800 });
  const linkOpened = await waitFor(linked, `window.__vvStore && window.__vvStore.getState().selectedPlot?.id === ${linkId}`, 90);
  check('a building link opens the city on that building', linkOpened, linkOpened ? '' : JSON.stringify({ store: await linked.eval('Boolean(window.__vvStore)').catch(() => 'n/a'), canvas: await linked.eval('document.querySelectorAll("canvas").length').catch(() => 'n/a'), text: (await linked.eval('document.body.innerText').catch(() => '')).slice(0, 300), problems: linked.problems().slice(0, 3) }));
  check('...and shows its card in the panel', await linked.eval(`window.__vvPanel.getState().view === 'plot'`));
  check('...and tidies the address', !/plot=/.test(await linked.eval(`location.search`)));
  const linkedAt = JSON.parse(await linked.eval(`(() => { const p = window.__vvStore.getState().plots.find((q) => q.id === ${linkId}); const a = window.__vvAvatar; return JSON.stringify({ ready: a.ready, d: Math.hypot(a.x - p.x, a.z - p.z) }); })()`));
  check('...and the avatar starts beside that building (not at the random or the fixed spawn)', linkedAt.ready && linkedAt.d < 15, JSON.stringify(linkedAt));
  await linked.close();
  const wrongCity = await openPage(`http://localhost:${webPort}/?plot=${linkId}&city=1&diag=1&view=iso&mp=${mpPort}`, { width: 1280, height: 800 });
  await waitFor(wrongCity, `Boolean(window.__vvStore)`, 90);
  // (the message is shown for a few seconds only, so watch for it instead of looking once)
  const wrongSaid = await waitFor(wrongCity, `/another city|city #1/i.test(String(window.__vvStore.getState().toast?.text ?? '')) || (window.__vvSeen = window.__vvSeen || (window.__vvStore.subscribe((st) => { if (st.toast) window.__vvToasts = [...(window.__vvToasts || []), st.toast.text]; }), 1)) && /city #1/i.test((window.__vvToasts || []).join('|'))`, 12);
  check('a link for another city says so and changes nothing', wrongSaid && (await wrongCity.eval(`window.__vvStore.getState().selectedPlot`)) === null);
  await wrongCity.close();
  const unknown = await openPage(`http://localhost:${webPort}/?plot=999999&city=${DEFAULT_CITY}&diag=1&view=iso&mp=${mpPort}`, { width: 1280, height: 800 });
  await waitFor(unknown, `Boolean(window.__vvStore)`, 90);
  // (the message is shown for a few seconds only, so watch for it instead of looking once)
  const unknownSaid = await waitFor(unknown, `/not in this city/i.test(String(window.__vvStore.getState().toast?.text ?? '')) || (window.__vvSeen = window.__vvSeen || (window.__vvStore.subscribe((st) => { if (st.toast) window.__vvToasts = [...(window.__vvToasts || []), st.toast.text]; }), 1)) && /not in this city/i.test((window.__vvToasts || []).join('|'))`, 12);
  check('a link to a building that is not there says so', unknownSaid);
  await unknown.close();
  await page.eval(`window.__vvStore.getState().setSelectedPlot(window.__vvStore.getState().plots.find((p) => p.id === ${linkPlot.id}))`);
  await sleep(500);
  await page.eval(`document.querySelector('[data-testid="share-details"] summary').click()`);
  await sleep(300);
  check('the building card has a link and a badge to copy', await page.eval(`(() => { const u = document.querySelector('[data-testid="share-url"]')?.value ?? ''; return u.endsWith('/?plot=${linkPlot.id}&city=${linkPlot.seed}') && Boolean(document.querySelector('[data-testid="badge-preview"]')) && Boolean(document.querySelector('[data-testid="copy-badge"]')); })()`));
  await page.eval(`window.__vvStore.getState().setSelectedPlot(null)`);
  // ---- the amusement park ----
  check('the city has an amusement park on the county road', await page.eval(`(() => { const a = window.__vvStore.getState().layout.amusement; return Boolean(a) && a.name === 'Voxel Fun Park' && a.roadId.startsWith('county-'); })()`));
  check('the park is drawn: its ferris wheel, carousel, swings, train and static scenery are in the scene', await page.eval(`(() => { const g = window.__vvScene.getObjectByName('amusement'); if (!g) return false; let meshes = 0; g.traverse((o) => { if (o.isMesh) meshes++; }); return meshes > 100 && g.children.length >= 6; })()`));
  check('the park is on the world map and the minimap data', await page.eval(`(() => { const a = window.__vvStore.getState().layout.amusement; return Math.abs(a.gate.x) > 0 && a.rect.x1 > a.rect.x0; })()`));
  // ---- day and night, and the sound button ----
  check('the time button and the sound button are there', await page.eval(`Boolean(document.querySelector('[data-testid="time-button"]')) && Boolean(document.querySelector('[data-testid="sound-button"]'))`));
  check('a test browser starts in Day (12:00) and muted', await page.eval(`document.querySelector('[data-testid="time-label"]').textContent === '12:00' && document.querySelector('[data-testid="sound-button"]').getAttribute('aria-pressed') === 'false'`), await page.eval(`document.querySelector('[data-testid="ambient-controls"]').innerText + '|' + document.querySelector('[data-testid="sound-button"]').getAttribute('aria-pressed') + '|' + navigator.webdriver + '|' + location.search`));
  await page.eval(`document.querySelector('[data-testid="time-button"]').click()`);
  await sleep(300);
  await page.eval(`document.querySelector('[data-testid="time-night"]').click()`);
  await sleep(600);
  check('choosing Night shows midnight', await page.eval(`document.querySelector('[data-testid="time-label"]').textContent === '00:00'`));
  await page.eval(`document.querySelector('[data-testid="time-button"]').click()`);
  await sleep(300);
  await page.eval(`document.querySelector('[data-testid="time-live"]').click()`);
  await sleep(600);
  check('Live follows the shared clock (a time in the 24-minute day)', await page.eval(`(() => { const t = document.querySelector('[data-testid="time-label"]').textContent; return t.length === 5 && t[2] === ':' && !isNaN(Number(t.slice(0, 2))) && !isNaN(Number(t.slice(3))); })()`));
  await page.eval(`document.querySelector('[data-testid="time-button"]').click()`);
  await sleep(300);
  await page.eval(`document.querySelector('[data-testid="time-day"]').click()`);
  await page.eval(`document.querySelector('[data-testid="sound-button"]').click()`);
  await sleep(300);
  check('the speaker button turns the sound on, with a volume slider', await page.eval(`document.querySelector('[data-testid="sound-button"]').getAttribute('aria-pressed') === 'true' && Boolean(document.querySelector('[data-testid="volume"]'))`));
  await page.eval(`document.querySelector('[data-testid="sound-button"]').click()`);
  await sleep(200);
  check('...and off again', await page.eval(`document.querySelector('[data-testid="sound-button"]').getAttribute('aria-pressed') === 'false'`));
  // ---- presence-based sound (lib/game/soundZones.js): near the ground you hear the places round you, high above the map the music ----
  const arcadeAt = JSON.parse(await page.eval(`JSON.stringify((() => { const p = window.__vvStore.getState().plots.find((q) => q.owner && q.districtId === 'arcade'); return { x: p.x, z: p.z }; })())`));
  await page.eval(`window.__vvWorld.getState().focusOn(${arcadeAt.x}, ${arcadeAt.z}, 40)`);
  check('close to the ground at an arcade you hear the arcade and no music', await waitFor(page, `(() => { const r = window.__vvSound?.last(); return Boolean(r) && r.far < 0.05 && r.weights.arcade > 0.8 && r.mix.local.arcade > 0.6 && r.mix.music === 0 && r.mix.top.includes('arcade'); })()`, 40), JSON.stringify(await page.eval(`JSON.stringify(window.__vvSound?.last()?.mix ?? null)`)));
  await page.eval(`window.__vvWorld.getState().focusOn(${arcadeAt.x}, ${arcadeAt.z}, 5.5)`);
  check('zoomed out above the map you hear the city music and no arcade', await waitFor(page, `(() => { const r = window.__vvSound?.last(); return Boolean(r) && r.far > 0.9 && r.mix.music > 0.8 && r.mix.local.arcade === 0 && r.mix.street < 0.02; })()`, 40), JSON.stringify(await page.eval(`JSON.stringify(window.__vvSound?.last()?.mix ?? null)`)));
  await page.eval(`window.__vvWorld.getState().focusOn(${arcadeAt.x}, ${arcadeAt.z}, 40)`);
  check('the sound zones know the city: arcade, cafes, park, water, fun park', await page.eval(`(() => { const e = window.__vvSound.last(); return e && typeof e.weights.funfair === 'number' && typeof e.weights.water === 'number' && typeof e.weights.park === 'number' && typeof e.weights.jazz === 'number'; })()`));
  check('the music button turns the city music off and on', await page.eval(`(() => { const b = document.querySelector('[data-testid="music-button"]'); const before = b.getAttribute('aria-pressed'); b.click(); return before === 'true'; })()`) && (await sleep(300), await page.eval(`document.querySelector('[data-testid="music-button"]').getAttribute('aria-pressed') === 'false'`)));
  await page.eval(`window.__vvWorld.getState().focusOn(${arcadeAt.x}, ${arcadeAt.z}, 5.5)`);
  check('with the music off, high above the map is quiet of music', await waitFor(page, `(() => { const r = window.__vvSound?.last(); return Boolean(r) && r.far > 0.9 && r.mix.music === 0; })()`, 40));
  await page.eval(`document.querySelector('[data-testid="music-button"]').click(); window.__vvWorld.getState().focusOn(${arcadeAt.x}, ${arcadeAt.z}, 14)`);
  check('the speaker button shows what you hear when the sound is on', await (async () => { await page.eval(`document.querySelector('[data-testid="sound-button"]').click()`); const ok = await waitFor(page, `(document.querySelector('[data-testid="sound-now"]')?.textContent ?? '').length > 0`, 40); await page.eval(`document.querySelector('[data-testid="sound-button"]').click()`); return ok; })());
  const nightPage = await openPage(`http://localhost:${webPort}/?time=night&diag=1&view=iso&spawn=fixed&mp=${mpPort}`, { width: 1000, height: 700 });
  await waitFor(nightPage, `document.querySelector('[data-testid="time-label"]')?.textContent.includes(':') && !document.querySelector('[data-testid="time-label"]').textContent.includes('-')`, 90);
  check('?time=night opens the city at night', await nightPage.eval(`document.querySelector('[data-testid="time-label"]').textContent === '00:00'`));
  check('the night page has no console errors', nightPage.problems().length === 0, nightPage.problems().slice(0, 2).join(' | '));
  await nightPage.close();
  // ---- the outside of a new building: configured on the lot before claiming, and by its owner afterwards ----
  const emptyLot = JSON.parse(await page.eval(`JSON.stringify((() => { const st = window.__vvStore.getState(); const p = st.plots.find((q) => !q.owner && q.districtId !== 'suburb' && !q.designSite && !q.prime && !q.luxury && !q.grand); return { id: p.id }; })())`));
  await page.eval(`(() => { const st = window.__vvStore.getState(); st.setSelectedPlot(st.plots.find((p) => p.id === ${emptyLot.id})); })()`);
  check('the claim form has the outside builder', await waitFor(page, `Boolean(document.querySelector('[data-testid="exterior-builder"]'))`, 30));
  check('nothing is drawn on the lot until they start', (await page.eval(`window.__vvDraft.getState().plot === null`)) === true);
  const floors0 = Number(await page.eval(`document.querySelector('[data-testid="floors-count"]').innerText`));
  await page.eval(`document.querySelector('[data-testid="floors-up"]').click()`);
  await sleep(300);
  await page.eval(`document.querySelector('[data-testid="crown-beacon"]').click()`);
  await page.eval(`document.querySelector('[data-testid="palette-tokyo"]').click()`);
  await sleep(500);
  const draft = JSON.parse(await page.eval(`JSON.stringify((() => { const d = window.__vvDraft.getState().plot; return d && { id: d.id, floors: d.exterior.floors, crown: d.exterior.crown, wall: d.wallColor, height: d.height, owner: d.owner }; })())`));
  check('choosing floors, a style and a roof feature draws the building on the lot', draft && draft.id === emptyLot.id && draft.floors === floors0 + 1 && draft.crown === 'beacon' && draft.wall === '#2a2552' && draft.owner === 'draft', JSON.stringify(draft));
  await waitFor(page, `(() => { let n = 0; window.__vvScene.traverse((o) => { if (o.name === 'crowns') n = o.children.reduce((a, c) => a + c.count, 0); }); return n > 0; })()`, 30);
  check('the roof feature is drawn', await page.eval(`(() => { let n = 0; window.__vvScene.traverse((o) => { if (o.name === 'crowns') n = o.children.reduce((a, c) => a + c.count, 0); }); return n > 0; })()`));
  await page.eval(`window.__vvStore.getState().setSelectedPlot(null)`);
  await sleep(500);
  check('the draft goes away when the form closes', (await page.eval(`window.__vvDraft.getState().plot === null`)) === true);
  // the owner's editor
  await page.eval(`window.__vvStore.getState().claimPlot(${emptyLot.id}, 'Tester', 'Outside Test', 'https://example.com', 'shop', null, { kind: 'generated' }, '', { floors: 2, palette: 'solar', crown: 'dish' })`);
  await page.eval(`(() => { const st = window.__vvStore.getState(); st.setSelectedPlot(st.plots.find((p) => p.id === ${emptyLot.id})); })()`);
  await waitFor(page, `[...document.querySelectorAll('summary, button')].some((b) => /Customize the outside/.test(b.innerText))`, 30);
  await page.eval(`[...document.querySelectorAll('summary, button')].find((b) => /Customize the outside/.test(b.innerText))?.click()`);
  await sleep(400);
  await page.eval(`document.querySelector('[data-testid="crown-spire"]')?.click()`);
  await sleep(400);
  const owned = JSON.parse(await page.eval(`JSON.stringify((() => { const p = window.__vvStore.getState().plots.find((q) => q.id === ${emptyLot.id}); return { crown: p.exterior?.crown, h: p.height, wall: p.wallColor }; })())`));
  check('an owner changes the roof feature and it is saved on the building', owned.crown === 'spire' && owned.wall === '#334155', JSON.stringify(owned));
  await page.eval(`document.querySelector('[data-testid="floors-up"]')?.click()`);
  await sleep(400);
  check('...and the floors', (await page.eval(`window.__vvStore.getState().plots.find((q) => q.id === ${emptyLot.id}).height`)) > owned.h);
  await page.eval(`window.__vvStore.getState().setSelectedPlot(null)`);

  // ---- phone ----
  const phone = await openPage(url, { width: 412, height: 800, mobile: true });
  check('the city loads on a phone', await waitFor(phone, 'Boolean(window.__vvPerf && window.__vvPerf.calls > 0)'));
  await sleep(3000);
  const phoneCalls = JSON.parse(await phone.eval('JSON.stringify(window.__vvPerf)')).calls;
  check('phone draw calls per frame stay low', phoneCalls > 0 && phoneCalls < 400, String(phoneCalls));
  const joystick = JSON.parse(await phone.eval(`(() => { const base = document.querySelector('[aria-label="Walk joystick"]'); if (!base) return JSON.stringify(null); const b = base.getBoundingClientRect(), k = base.firstElementChild.getBoundingClientRect(); return JSON.stringify({ vw: innerWidth, bx: b.left + b.width / 2, by: b.top + b.height / 2, kx: k.left + k.width / 2, ky: k.top + k.height / 2 }); })()`));
  check('the joystick is shown on a phone', Boolean(joystick));
  if (joystick) {
    check('the joystick knob is centred on its base', Math.abs(joystick.kx - joystick.bx) < 0.5 && Math.abs(joystick.ky - joystick.by) < 0.5, `offset ${(joystick.kx - joystick.bx).toFixed(1)}, ${(joystick.ky - joystick.by).toFixed(1)}`);
    check('the joystick is centred on the screen', Math.abs(joystick.bx - joystick.vw / 2) < 1, `${joystick.bx} vs ${joystick.vw / 2}`);
  }
  // an interior on a phone: the "Look at" menu is in the storefront panel, not over the room, and choosing a spot there works
  await phone.eval(`window.__vvStore.getState().openInterior(window.__vvStore.getState().layout.malls[0].stores.find((x) => x.id === '${pickStores[0].id}'))`);
  await sleep(9000);
  const phoneSpots = JSON.parse(await phone.eval(`(() => {
    const shown = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    return JSON.stringify({ inline: shown('[data-testid="hotspots-inline"]'), overlay: shown('[data-testid="hotspots"]'), inPanel: Boolean(document.querySelector('aside [data-testid="hotspots-inline"]')) });
  })()`));
  check('on a phone the "Look at" menu is in the storefront panel, not over the room', phoneSpots.inline && phoneSpots.inPanel && !phoneSpots.overlay, JSON.stringify(phoneSpots));
  await phone.eval(`[...document.querySelectorAll('[data-testid="hotspots-inline"] button')].find((b) => b.innerText === 'Entrance')?.click()`);
  await sleep(400);
  check('and choosing a spot there marks it', await phone.eval(`[...document.querySelectorAll('[data-testid="hotspots-inline"] button')].find((b) => b.innerText === 'Entrance')?.getAttribute('aria-pressed') === 'true'`));
  await phone.eval(`window.__vvStore.getState().closeInterior()`);
  await sleep(500);
  check('no console errors or uncaught exceptions on the phone page', phone.problems().length === 0, phone.problems().slice(0, 3).join(' | '));

  // ---- what the server saw ----
  await sleep(3000);
  const status = await (await fetch(`http://localhost:${mpPort}/status`)).json();
  check('the multiplayer server sees both clients', status.players.length === 2, status.players.map((p) => p.name).join(', '));
  check('each client reported its device, frame rate and render stats', status.players.every((p) => p.device?.screen && p.fps > 0 && p.render?.calls > 0), JSON.stringify(status.players.map((p) => [p.device?.screen, p.fps, p.render?.calls])));
  check('one of them is the touch device', status.players.some((p) => p.device?.touch));
  check('the server received no error reports', status.recentErrors.length === 0, status.recentErrors.slice(0, 2).map((e) => e.message.slice(0, 100)).join(' | '));

  // iOS Safari must not turn the city number into a phone-number link (that broke hydration on an iPhone)
  check('iOS phone-number detection is switched off', await phone.eval(`document.querySelector('meta[name="format-detection"]')?.content.includes('telephone=no') ?? false`));
  check('no phone-number links were injected into the page', await phone.eval(`document.querySelectorAll('a[href^="tel:"]').length === 0`));

  // errors thrown by browser extensions / wallets are reported but labelled, so they are not mistaken for app bugs
  await page.eval(`window.dispatchEvent(new ErrorEvent('error', { message: "undefined is not an object (evaluating 'window.ethereum.selectedAddress = undefined')" }))`);
  await sleep(1500);
  const after = await (await fetch(`http://localhost:${mpPort}/status`)).json();
  check('an error from an injected wallet script is labelled as such', after.recentErrors.some((e) => e.kind === 'injected' && e.message.includes('window.ethereum')), JSON.stringify(after.recentErrors.map((e) => e.kind)));

  // ---- a browser without WebGL (switched off, as on a locked-down or very old machine): the plain fallback page, not a broken city
  const noGl = await openPage(url, { width: 1000, height: 800, webgl: false });
  const fallback = await waitFor(noGl, `/The 3D city cannot open in this browser/.test(document.body.innerText)`, 30);
  check('without WebGL the city shows its fallback page, not a blank or broken canvas', fallback && (await noGl.eval(`document.querySelectorAll('canvas').length === 0`)));
  const ways = JSON.parse(await noGl.eval(`JSON.stringify([...document.querySelectorAll('main a')].map((a) => ({ text: a.innerText.trim(), href: a.getAttribute('href'), tab: a.tabIndex })))`));
  check('it offers Discover and listing a business, as ordinary links a keyboard reaches', ['/discover', '/business/new'].every((h) => ways.some((w) => w.href === h && w.tab >= 0)), JSON.stringify(ways));
  check('the fallback page has one main heading, for screen readers', (await noGl.eval(`document.querySelectorAll('h1').length`)) === 1);
  await noGl.eval(`document.querySelector('main a[href="/discover"]').click(); 1`);
  check('and Discover opens without WebGL', await waitFor(noGl, `location.pathname === '/discover' && Boolean(document.querySelector('h1'))`, 30));
  check('no console errors or uncaught exceptions without WebGL', noGl.problems().length === 0, noGl.problems().slice(0, 3).join(' | '));
  await noGl.close();

  // ---- the admin pages (components/admin/AdminShell.jsx): without a session (this build has no API at all) an admin page sends you to the
  // sign-in, which keeps where you were going, needs no WebGL and fits a phone. Signing in for real is in live-browser.test.mjs.
  const adminPage = await openPage(`http://localhost:${webPort}/admin/pilot?weeks=8`, { width: 390, height: 800, mobile: true, webgl: false });
  check('an admin page without a session goes to the sign-in, keeping where it was going', await waitFor(adminPage, `location.pathname === '/admin/login' && new URLSearchParams(location.search).get('next') === '/admin/pilot?weeks=8'`, 30), await adminPage.eval('location.href'));
  check('the sign-in form is there: username, password and a button', await waitFor(adminPage, `Boolean(document.querySelector('[data-testid="admin-login-form"] input#username') && document.querySelector('[data-testid="admin-login-form"] input#password[type=password]') && document.querySelector('[data-testid="admin-login-form"] button[type=submit]'))`, 20));
  check('it fits a phone (nothing scrolls sideways) and draws no 3D', await adminPage.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1 && document.querySelectorAll('canvas').length === 0`));
  check('without the API it says so, and the form cannot be used', await adminPage.eval(`/need the API/.test(document.body.innerText) && document.querySelector('[data-testid="admin-login-form"] fieldset').disabled`));
  check('a form sent before the page is ready never puts the password in the address (method post)', await adminPage.eval(`document.querySelector('[data-testid="admin-login-form"]').method === 'post'`));
  check('search engines are told to stay away', await adminPage.eval(`/noindex/.test(document.querySelector('meta[name="robots"]')?.content ?? '')`));
  check('no console errors on the sign-in page', adminPage.problems().length === 0, adminPage.problems().slice(0, 3).join(' | '));
  // the forgotten password (apps/web/app/admin/forgot, reset, verify-email): open pages, no CLI hint on the sign-in any more
  check('the sign-in links to "Forgot your password?" and no longer names the command line', await adminPage.eval(`document.querySelector('[data-testid="admin-forgot-link"]')?.getAttribute('href') === '/admin/forgot' && !document.body.innerText.includes('admin:reset-password')`));
  await adminPage.eval(`document.querySelector('[data-testid="admin-forgot-link"]').click()`);
  check('it opens /admin/forgot without a session, with the email form (method post)', await waitFor(adminPage, `location.pathname === '/admin/forgot' && document.querySelector('[data-testid="admin-forgot-form"]')?.method === 'post' && Boolean(document.querySelector('input#login'))`, 20), await adminPage.eval('location.href'));
  check('two ways, as tabs: an email link and the admin token', await adminPage.eval(`[...document.querySelectorAll('[role=tab]')].map((t) => t.textContent).join('|') === 'Email me a link|Admin token'`));
  await adminPage.eval(`[...document.querySelectorAll('[role=tab]')][1].click()`);
  check('the token form: username, the token hidden as a password, the new password twice', await waitFor(adminPage, `(() => { const f = document.querySelector('[data-testid="admin-forgot-token-form"]'); return Boolean(f && f.method === 'post' && f.querySelector('input#reset-username') && f.querySelector('input#reset-token[type=password]') && f.querySelector('input#reset-password[type=password]') && f.querySelector('input#reset-confirm[type=password]')); })()`, 10));
  check('the forgot page fits a phone', await adminPage.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`));
  await adminPage.eval(`location.href = '/admin/reset#token=' + 'x'.repeat(43); 1`);
  check('/admin/reset opens without a session, takes the link out of the address, and (here, without the API) says the link does not work', await waitFor(adminPage, `location.pathname === '/admin/reset' && !location.hash && Boolean(document.querySelector('[data-testid="admin-reset-invalid"] a[href="/admin/forgot"]'))`, 20), await adminPage.eval('location.href'));
  await adminPage.eval(`location.href = '/admin/verify-email'; 1`);
  check('/admin/verify-email opens without a session', await waitFor(adminPage, `location.pathname === '/admin/verify-email' && document.querySelector('[data-testid="admin-verify-result"]')?.dataset.ok === '0'`, 20));
  check('no console errors on the forgotten-password pages', adminPage.problems().length === 0, adminPage.problems().slice(0, 3).join(' | '));
  await adminPage.close();

  // ---- the pilot walk-through (docs/product/pilot_tour.md) in demo mode (this build has no API), on a phone: tapped through with Next, every
  // stop reached with its caption and what it opens, the buttons big enough for a finger, and nothing saved. tests/journeys/pilot-tour.test.mjs
  // runs it against the API on a computer, with the keyboard.
  const { PILOT_TOUR } = await imp('tour/tours.js');
  const tourPage = await openPage(`http://localhost:${webPort}/?tour=pilot&tourSpeed=6`, { width: 412, height: 860, mobile: true });
  const tourCaption = (attr) => `document.querySelector('[data-testid="tour-caption"]')?.getAttribute('${attr}')`;
  check('tour: /?tour=pilot opens on its first stop', await waitFor(tourPage, `${tourCaption('data-tour-stop')} === ${JSON.stringify(PILOT_TOUR.stops[0].id)} && ${tourCaption('data-tour-arrived')} === '1'`, 120));
  await tourPage.eval(`document.querySelector('[data-testid="tour-pause"]').click(); 1`);
  const sizes = JSON.parse(await tourPage.eval(`JSON.stringify(['tour-back', 'tour-pause', 'tour-next', 'tour-exit'].map((id) => { const r = document.querySelector('[data-testid="' + id + '"]').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }))`));
  check('tour: its buttons are at least 44 px for a finger, and the card fits the phone', sizes.every(([w, h]) => w >= 44 && h >= 44) && (await tourPage.eval(`(() => { const r = document.querySelector('[data-testid="tour-caption"]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()`)), JSON.stringify(sizes));
  const reachedStops = [];
  for (const [i, s] of PILOT_TOUR.stops.entries()) {
    const ok = await waitFor(tourPage, `${tourCaption('data-tour-stop')} === ${JSON.stringify(s.id)} && ${tourCaption('data-tour-arrived')} === '1' && document.querySelector('[data-testid="tour-title"]').textContent === ${JSON.stringify(s.title)}`, 30);
    const kind = s.action?.kind;
    const opened = !kind || kind === 'card' || kind === 'interior'
      ? await waitFor(tourPage, kind === 'card' ? `document.body.innerText.includes('Step inside')` : kind === 'interior' ? `document.body.innerText.includes('(Plot #${s.action.plot})')` : 'true', 20)
      : await waitFor(tourPage, kind === 'page' ? `(document.querySelector('[data-testid="tour-frame"]')?.contentDocument?.querySelector('h1')?.textContent ?? '').length > 0` : `document.querySelector('[data-testid="tour-overlay"]')?.getAttribute('data-kind') === ${JSON.stringify(kind)}`, 30);
    if (ok && opened) reachedStops.push(s.id);
    if (i < PILOT_TOUR.stops.length - 1) {
      const r = JSON.parse(await tourPage.eval(`JSON.stringify(document.querySelector('[data-testid="tour-next"]').getBoundingClientRect())`));
      await tourPage.tap(r.x + r.width / 2, r.y + r.height / 2);
    }
  }
  check('tour: every stop is reached by tapping Next, and opens what it shows (demo mode)', reachedStops.length === PILOT_TOUR.stops.length, `${reachedStops.length}/${PILOT_TOUR.stops.length}: ${reachedStops.join(', ')}`);
  check('tour: nothing scrolls sideways on the phone', await tourPage.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`));
  check('tour: no game was saved in the browser', !(await tourPage.eval(`localStorage.getItem('voxelventure-save')`)));
  check('tour: no console errors or uncaught exceptions', tourPage.problems().length === 0, tourPage.problems().slice(0, 3).join(' | '));
  await tourPage.close();

  await page.close();
  await phone.close();
} catch (error) {
  fails++;
  console.log('FAIL the browser test crashed:', error.message);
} finally {
  await stop();
}
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
