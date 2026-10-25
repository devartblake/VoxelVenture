// Touch and keyboard navigation, and the capability policy, in a real (headless) browser (docs/architecture/performance_policy.md).
// Like tests/browser.test.mjs it starts the production server and the presence server itself, so run `npm run build` first; it
// skips (exit 0) when no Edge or Chrome is installed or there is no build. Run it on its own: `node tests/browser-touch.test.mjs`.
//
// On an emulated phone (touch, coarse pointer), through the DevTools touch events a finger sends:
//   - a tap on a lot selects it; a one-finger drag pans the map and selects nothing; a pinch zooms in and out
//   - a long press does nothing (no gesture is bound to it) and leaves the map where it was
//   - the joystick walks the avatar while it is held, and stops when it is let go
//   - the quality tier is decided from the device (coarse pointer, small screen, the software renderer), shown with ?diag=1 and
//     reported to the presence server
//   - the storefront interior pauses the decoration and draws the city behind it a few times a second; reduced motion holds
//     the ornaments still
// On a desktop, with the keyboard: WASD walks, Escape clears a selection, M opens the world map and Escape closes it, and
// ?quality=high draws with shadows at the desktop pixel ratio, as before the policy.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { root, sleep } from './helpers.mjs';
import { findBrowser, openPage } from './browser-driver.mjs';

if (!findBrowser()) {
  console.log('SKIP: no Edge or Chrome found (set BROWSER_PATH to run the browser tests)');
  process.exit(0);
}
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
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-touch-log-'));
const children = [];
const start = (cmd, args, env = {}) => children.push(spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'ignore' }));
start(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', 'apps/web', '-p', String(webPort)]);
start(process.execPath, [path.join(root, 'services', 'multiplayer', 'server.mjs')], { MP_PORT: String(mpPort), MP_LOG_DIR: logDir });

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
const json = async (page, expression) => JSON.parse(await page.eval(`JSON.stringify(${expression})`));
const camera = (page) => json(page, `(() => { const { camera, controls } = window.__vvThree(); return { x: controls.target.x, z: controls.target.z, zoom: camera.zoom }; })()`);

// Puts the map camera over a plot and returns where the plot is on screen (as tests/browser.test.mjs does for its clicks).
async function aimAt(page, p, center, zoom = 40) {
  return json(page, `(() => {
    const { camera, controls } = window.__vvThree(); const cx = ${p.x - center.x}, cz = ${p.z - center.z};
    controls.target.set(cx, 0, cz); camera.position.set(cx + 30, 30, cz + 30); camera.zoom = ${zoom}; camera.updateProjectionMatrix(); controls.update(); camera.updateMatrixWorld();
    const e = camera.matrixWorldInverse.elements, q = camera.projectionMatrix.elements, y = Math.max(0.3, ${p.h ?? 0} * 0.45);
    const vx = e[0] * cx + e[4] * y + e[8] * cz + e[12], vy = e[1] * cx + e[5] * y + e[9] * cz + e[13];
    return { x: ((q[0] * vx + q[12]) + 1) / 2 * innerWidth, y: (1 - (q[5] * vy + q[13])) / 2 * innerHeight };
  })()`);
}
const lotPick = `(() => { const st = window.__vvStore.getState(); const front = (p) => st.plots.some((q) => q !== p && q.owner && q.x > p.x - 1 && q.x < p.x + 9 && q.z > p.z - 1 && q.z < p.z + 9);
  const p = st.plots.filter((p) => !p.owner && !p.prime && p.districtId !== 'outskirts' && !front(p))[20]; return { center: st.layout.center, lot: { id: p.id, x: p.x, z: p.z, h: p.height } }; })()`;

try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`http://localhost:${webPort}/`)).ok) break;
    } catch {
      /* starting */
    }
    await sleep(500);
  }
  const base = `http://localhost:${webPort}/?view=iso&mp=${mpPort}`;

  // ---- a phone ----
  const phone = await openPage(`${base}&diag=1`, { width: 412, height: 860, mobile: true });
  check('the city loads on a phone', await waitFor(phone, 'Boolean(window.__vvPerf && window.__vvPerf.calls > 0 && window.__vvQuality && window.__vvQuality.getState().gpuKnown)'));
  await sleep(3000);
  await phone.eval(`window.__vvPanel.getState().close(); window.__vvStore.getState().clearSelectedPlot(); 1`);

  const q = await json(phone, `(() => { const s = window.__vvQuality.getState(); return { tier: s.tier, source: s.source, ceiling: s.ceiling, reasons: s.reasons, coarse: s.profile.coarsePointer, small: s.profile.smallScreen, software: s.profile.webgl?.software, dpr: window.__vvThree().gl.getPixelRatio(), shadows: window.__vvThree().gl.shadowMap.enabled }; })()`);
  check('the phone is read as a coarse pointer on a small screen', q.coarse && q.small, JSON.stringify(q));
  check('its tier is decided automatically from the device: low on the software renderer the tests draw with', q.source === 'auto' && q.tier === 'low' && q.reasons.includes('software-renderer'), JSON.stringify(q));
  check('the low tier draws at pixel ratio 1 with no shadow map', q.dpr === 1 && q.shadows === false, JSON.stringify(q));
  check('?diag=1 shows the tier and why', await waitFor(phone, `(() => { const b = document.querySelector('[data-testid="quality-badge"]'); return b && b.dataset.tier === 'low' && /Quality: low/.test(b.innerText); })()`, 10));
  await phone.eval(`document.querySelector('[data-testid="quality-badge"] button').click(); 1`);
  check('opening the badge lists the reasons and the GPU', await waitFor(phone, `/software-renderer/.test(document.querySelector('[data-testid="quality-reasons"]')?.innerText ?? '') && /gpu: .+/i.test(document.querySelector('[data-testid="quality-badge"]').innerText)`, 5));
  await phone.eval(`document.querySelector('[data-testid="quality-badge"] button').click(); 1`);

  // a tap on a lot selects it
  const { center, lot } = await json(phone, lotPick);
  let at = await aimAt(phone, lot, center);
  await sleep(2500);
  await phone.tap(at.x, at.y);
  await waitFor(phone, `window.__vvStore.getState().selectedPlot?.id === ${lot.id}`, 8);
  const tapped = await phone.eval('window.__vvStore.getState().selectedPlot?.id ?? null');
  check('a tap on a lot selects it', tapped === lot.id, `tapped #${lot.id}, selected ${tapped}`);
  check('and its card opens in the panel', await waitFor(phone, `/building/i.test(document.querySelector('[data-testid="side-panel"] h2')?.textContent ?? '')`, 8));
  check('with a card open the compact HUD steps aside: four tools, no More, no compass, no clock', await phone.eval(`document.querySelectorAll('[data-testid="toolbar"] [data-tool]').length === 4 && !document.querySelector('[data-testid="hud-more"]') && !document.querySelector('[data-testid="compass"]') && !document.querySelector('[data-testid="ambient-controls"]')`));
  await phone.eval(`window.__vvStore.getState().clearSelectedPlot(); 1`);
  await sleep(600);

  // the compact HUD on a phone, and a plain way into the businesses
  check('a phone gets the compact HUD: the main tools, the camera and More', await phone.eval(`document.querySelector('[data-testid="toolbar"]')?.dataset.compact === 'true' && document.querySelectorAll('[data-testid="toolbar"] [data-tool]').length === 4 && Boolean(document.querySelector('[data-testid="hud-more"]'))`));
  check('the clock and sound buttons sit bottom left, clear of the joystick', await phone.eval(`(() => { const r = document.querySelector('[data-testid="ambient-controls"]').getBoundingClientRect(); return r.left < 40 && r.right < window.innerWidth / 2 - 50; })()`));
  check('every tool bar button is at least 44 px', await phone.eval(`[...document.querySelectorAll('[data-testid="toolbar"] button')].every((b) => { const r = b.getBoundingClientRect(); return r.width >= 43.5 && r.height >= 43.5; })`));
  await phone.eval(`document.querySelector('[data-testid="explore-businesses"]').click(); 1`);
  check('Explore businesses opens the directory', await waitFor(phone, `Boolean(document.querySelector('[data-testid="directory-list"]'))`, 8));
  await phone.eval(`document.querySelector('[data-testid="directory-type-restaurant"]').click(); 1`);
  await sleep(400);
  check('the kind filter keeps only that kind', await phone.eval(`(() => { const ids = [...document.querySelectorAll('[data-testid="directory-list"] > li')].length; return ids > 0 && window.__vvStore.getState().plots.filter((p) => p.owner && p.buildingType === 'restaurant' && p.height > 0.2).length === ids; })()`));
  await phone.eval(`document.querySelector('[data-testid="directory-list"] > li button').click(); 1`);
  await sleep(800);
  await phone.eval(`window.__vvStore.getState().clearSelectedPlot(); 1`);
  await sleep(800);
  check('coming back from a building keeps the filter', await waitFor(phone, `document.querySelector('[data-testid="directory-type-restaurant"]')?.getAttribute('aria-pressed') === 'true'`, 6));
  await phone.eval(`document.querySelector('[data-testid="directory-type-restaurant"]').click(); window.__vvPanel?.getState().close?.(); 1`);
  await sleep(400);

  // a one-finger drag pans the map (MapControls: one finger pans) and selects nothing
  at = await aimAt(phone, lot, center, 20);
  await sleep(1500);
  const before = await camera(phone);
  await phone.touchDrag(206, 300, 120, 200, 12);
  await sleep(1500);
  const panned = await camera(phone);
  check('a one-finger drag pans the map', Math.hypot(panned.x - before.x, panned.z - before.z) > 2, `${JSON.stringify(before)} -> ${JSON.stringify(panned)}`);
  check('and the zoom stays', Math.abs(panned.zoom - before.zoom) < 0.5, `${before.zoom} -> ${panned.zoom}`);
  check('a drag selects nothing', (await phone.eval('window.__vvStore.getState().selectedPlot?.id ?? null')) === null);

  // a pinch zooms: fingers apart zooms in, together zooms out
  const z0 = (await camera(phone)).zoom;
  await phone.pinch(206, 320, 2.2);
  await sleep(1200);
  const z1 = (await camera(phone)).zoom;
  check('spreading two fingers zooms in', z1 > z0 * 1.2, `${z0.toFixed(1)} -> ${z1.toFixed(1)}`);
  await phone.pinch(206, 320, 0.4, { from: 120 });
  await sleep(1200);
  const z2 = (await camera(phone)).zoom;
  check('bringing them together zooms out', z2 < z1 * 0.85, `${z1.toFixed(1)} -> ${z2.toFixed(1)}`);
  check('the zoom stays within the map limits', z1 <= 90 && z2 >= 5, `${z1}, ${z2}`);

  // a long press: nothing is bound to it (docs/architecture/performance_policy.md, gestures); it must leave the map where it was
  const held = await camera(phone);
  const errorsBefore = phone.problems().length;
  await phone.longPress(206, 300, 900);
  await sleep(1000);
  const afterHold = await camera(phone);
  check('a long press leaves the map where it was', Math.hypot(afterHold.x - held.x, afterHold.z - held.z) < 0.5 && Math.abs(afterHold.zoom - held.zoom) < 0.5, `${JSON.stringify(held)} -> ${JSON.stringify(afterHold)}`);
  check('and throws nothing', phone.problems().length === errorsBefore, phone.problems().slice(errorsBefore).join(' | '));
  await phone.eval(`window.__vvStore.getState().clearSelectedPlot(); window.__vvPanel.getState().close(); 1`);
  await sleep(600);

  // the joystick walks the avatar while it is held
  const stick = await json(phone, `(() => { const b = document.querySelector('[aria-label="Walk joystick"]')?.getBoundingClientRect(); return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; })()`);
  check('the joystick is shown', Boolean(stick));
  if (stick) {
    const a0 = await json(phone, '({ x: window.__vvAvatar.x, z: window.__vvAvatar.z })');
    await phone.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: stick.x, y: stick.y, id: 1 }] });
    await phone.cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: stick.x, y: stick.y - 45, id: 1 }] });
    await sleep(1500);
    const a1 = await json(phone, '({ x: window.__vvAvatar.x, z: window.__vvAvatar.z })');
    await phone.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(800);
    const a2 = await json(phone, '({ x: window.__vvAvatar.x, z: window.__vvAvatar.z })');
    await sleep(800);
    const a3 = await json(phone, '({ x: window.__vvAvatar.x, z: window.__vvAvatar.z })');
    check('pushing the joystick walks the avatar', Math.hypot(a1.x - a0.x, a1.z - a0.z) > 0.5, `${JSON.stringify(a0)} -> ${JSON.stringify(a1)}`);
    check('letting go stops it', Math.hypot(a3.x - a2.x, a3.z - a2.z) < 0.05, `${JSON.stringify(a2)} -> ${JSON.stringify(a3)}`);
  }

  // the storefront interior covers the city: the decoration pauses and the city behind is drawn a few times a second
  // (frames: the canvas's frame callbacks run; drawn: the renderer drew the scene. The software renderer is slow, so this counts
  // both rather than timing them.)
  const frames = async (ms) => {
    const read = () => json(phone, '({ frames: window.__vvFrameGate.frame, drawn: window.__vvThree().gl.info.render.frame })');
    const a = await read();
    await sleep(ms);
    const b = await read();
    return { frames: b.frames - a.frames, drawn: b.drawn - a.drawn };
  };
  const open = await frames(3000);
  check('the uncovered city is drawn on every frame', open.frames > 0 && open.drawn >= open.frames - 1, JSON.stringify(open));
  await phone.eval(`(() => { const st = window.__vvStore.getState(); st.openInterior(st.plots.find((p) => p.owner && !p.admin && p.buildingType !== 'house')); return 1; })()`);
  await waitFor(phone, `window.__vvQuality.getState().visibility.includes('world-covered')`, 10);
  const covered = await frames(3000);
  const coveredState = await json(phone, `(() => { const s = window.__vvQuality.getState(); return { visibility: s.visibility, animation: s.animation }; })()`);
  check('with the interior open the decoration is still', coveredState.animation === 'still' && coveredState.visibility.includes('world-covered'), JSON.stringify(coveredState));
  check('and the city behind it is drawn on one frame in fifteen', covered.frames >= 5 && covered.drawn <= Math.ceil(covered.frames / 15) + 1, JSON.stringify(covered));
  await phone.eval(`window.__vvStore.getState().closeInterior(); 1`);
  check('closing it brings the animation back', await waitFor(phone, `!window.__vvQuality.getState().visibility.includes('world-covered') && window.__vvQuality.getState().animation !== 'still'`, 10));
  const reopened = await frames(3000);
  check('and the city is drawn on every frame again', reopened.frames > 0 && reopened.drawn >= reopened.frames - 1, JSON.stringify(reopened));

  // prefers-reduced-motion: the ornaments hold still, and the city still answers taps
  await phone.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  check('reduced motion holds the ornaments still', await waitFor(phone, `window.__vvQuality.getState().animation === 'still' && window.__vvQuality.getState().visibility.includes('reduced-motion')`, 10));
  at = await aimAt(phone, lot, center);
  await sleep(2000);
  await phone.tap(at.x, at.y);
  check('and a tap still selects the lot', await waitFor(phone, `window.__vvStore.getState().selectedPlot?.id === ${lot.id}`, 8));
  await phone.eval(`window.__vvStore.getState().clearSelectedPlot(); 1`);
  await phone.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  check('no console errors or uncaught exceptions on the phone', phone.problems().length === 0, phone.problems().slice(0, 3).join(' | '));

  // ---- a desktop, with the keyboard; ?quality=high is the desktop drawing of before the policy ----
  const desk = await openPage(`${base}&diag=1&quality=high`, { width: 1280, height: 800 });
  check('the city loads on a desktop', await waitFor(desk, 'Boolean(window.__vvThree && window.__vvStore && window.__vvAvatar && window.__vvAvatar.ready)'));
  await sleep(3000);
  const high = await json(desk, `(() => { const { gl } = window.__vvThree(); return { tier: window.__vvQuality.getState().tier, source: window.__vvQuality.getState().source, shadows: gl.shadowMap.enabled, dpr: gl.getPixelRatio() }; })()`);
  check('?quality=high draws with shadows', high.tier === 'high' && high.source === 'override' && high.shadows === true, JSON.stringify(high));
  await desk.eval(`window.__vvPanel.getState().close(); document.activeElement?.blur?.(); 1`);
  const k0 = await json(desk, '({ x: window.__vvAvatar.x, z: window.__vvAvatar.z })');
  await desk.key('d', { code: 'KeyD', hold: 5000 }); // (long: the software renderer draws a few frames a second)
  await sleep(300);
  const k1 = await json(desk, '({ x: window.__vvAvatar.x, z: window.__vvAvatar.z })');
  check('holding D walks the avatar', Math.hypot(k1.x - k0.x, k1.z - k0.z) > 0.25, `${JSON.stringify(k0)} -> ${JSON.stringify(k1)}`);
  await sleep(800);
  const k2 = await json(desk, '({ x: window.__vvAvatar.x, z: window.__vvAvatar.z })');
  await sleep(800);
  const k3 = await json(desk, '({ x: window.__vvAvatar.x, z: window.__vvAvatar.z })');
  check('and letting go of it stops', Math.hypot(k3.x - k2.x, k3.z - k2.z) < 0.05, `${JSON.stringify(k2)} -> ${JSON.stringify(k3)}`);
  await desk.eval(`(() => { const st = window.__vvStore.getState(); st.setSelectedPlot(st.plots.find((p) => p.owner && !p.admin)); return 1; })()`);
  await waitFor(desk, `window.__vvPanel.getState().view === 'plot'`, 5);
  await desk.key('Escape');
  check('Escape clears the selection', await waitFor(desk, `window.__vvStore.getState().selectedPlot === null`, 5));
  await desk.key('m', { code: 'KeyM' });
  check('M opens the world map', await waitFor(desk, `Boolean(document.querySelector('[data-testid="world-map"]'))`, 10));
  check('the map veil throttles the decoration, not the avatar', await waitFor(desk, `window.__vvQuality.getState().visibility.includes('world-partly-covered')`, 5));
  await desk.key('Escape');
  check('Escape closes it', await waitFor(desk, `!document.querySelector('[data-testid="world-map"]')`, 10));
  check('no console errors or uncaught exceptions on the desktop', desk.problems().length === 0, desk.problems().slice(0, 3).join(' | '));

  // ---- what the presence server saw: the tier with its reasons ----
  await sleep(6000);
  const status = await (await fetch(`http://localhost:${mpPort}/status`)).json();
  const quality = status.players.map((p) => ({ touch: p.device?.touch, quality: p.quality }));
  check('the presence server has each device\'s tier and reasons', quality.length === 2 && quality.every((p) => p.quality?.tier), JSON.stringify(quality));
  check('the phone reported low (software renderer), the desktop high', quality.some((p) => p.touch && p.quality?.tier === 'low' && /software-renderer/.test(p.quality.reasons)) && quality.some((p) => !p.touch && p.quality?.tier === 'high' && /quality=high/.test(p.quality.reasons)), JSON.stringify(quality));

  await phone.close();
  await desk.close();
} catch (error) {
  fails++;
  console.log('FAIL the touch test crashed:', error.message);
} finally {
  for (const c of children) c.kill();
  await sleep(500);
  fs.rmSync(logDir, { recursive: true, force: true });
}
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
