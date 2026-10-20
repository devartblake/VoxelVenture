// The capability policy (lib/performance/; docs/architecture/performance_policy.md), in plain Node:
//   - a profile is normalized the same way every time, and a software renderer is recognized from its renderer string
//   - the tier ceiling follows the device's capabilities (never its user-agent), and ?quality= overrides it
//   - "high" is what a desktop drew before the policy, "medium" what a touch device drew
//   - the measured frame rate steps the tier down and back up with hysteresis: it does not flap at a boundary
//   - the visibility rules pause, throttle or keep each class of frame loop as documented
//   - the decoration thinning and the measurement spots are deterministic
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { imp, root } from './helpers.mjs';

const { buildCapabilityProfile, isSoftwareRenderer, frameTimeStats, createFrameWindow } = await imp('performance/capabilityProfile.js');
const { TIERS, TIER_SETTINGS, tierCeiling, decideQuality, parseQualityOverride, createFpsGovernor, governFps, thinOut, FPS_FLOOR, FPS_RAISE, DROP_AFTER, RAISE_AFTER, COOLDOWN, MAX_RETRIES } = await imp('performance/qualityPolicy.js');
const { LOOP, LOOPS, loopCadence, readVisibility, animationLevel, worldRenderEvery, runsOnFrame, visibilityReasons, COVERED_RENDER_EVERY } = await imp('performance/visibilityPolicy.js');
const { measurementSpots } = await imp('performance/measureSpots.js');

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log('ok  ', name);
};

const gpu = (renderer) => ({ available: true, version: 2, renderer, vendor: 'Google Inc.', maxTextureSize: 16384 });
const desktop = buildCapabilityProfile({ coarsePointer: false, dpr: 1, viewport: { width: 1600, height: 900 }, deviceMemory: 8, hardwareConcurrency: 16, webgl: gpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)') });
const phone = buildCapabilityProfile({ coarsePointer: true, dpr: 2.625, viewport: { width: 412, height: 915 }, deviceMemory: 8, hardwareConcurrency: 8, webgl: gpu('Adreno (TM) 730') });
const weakPhone = buildCapabilityProfile({ coarsePointer: true, dpr: 2, viewport: { width: 360, height: 760 }, deviceMemory: 2, hardwareConcurrency: 4, webgl: gpu('Mali-G52') });
const software = buildCapabilityProfile({ coarsePointer: false, dpr: 1, viewport: { width: 1280, height: 800 }, webgl: gpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)') });

ok('a profile is normalized: missing hints are null, the screen size decides "small"', () => {
  const p = buildCapabilityProfile({});
  assert.equal(p.dpr, 1);
  assert.equal(p.deviceMemory, null);
  assert.equal(p.hardwareConcurrency, null);
  assert.equal(p.webgl, null);
  assert.equal(p.smallScreen, false);
  assert.equal(phone.smallScreen, true);
  assert.equal(desktop.smallScreen, false);
  assert.equal(buildCapabilityProfile({ viewport: { width: 768, height: 1024 } }).smallScreen, false); // a tablet is not small
  assert.deepEqual(buildCapabilityProfile({ dpr: 2, viewport: { width: 400, height: 800 } }), buildCapabilityProfile({ dpr: 2, viewport: { width: 400, height: 800 } }));
});

ok('a software renderer is recognized from the renderer string', () => {
  for (const r of ['SwiftShader', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'Microsoft Basic Render Driver', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)']) assert.ok(isSoftwareRenderer(r), r);
  for (const r of ['Adreno (TM) 730', 'Apple GPU', 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', '']) assert.ok(!isSoftwareRenderer(r), r);
  assert.equal(software.webgl.software, true);
});

ok('the ceiling: desktop high, a phone medium, a low-memory phone and a software renderer low', () => {
  assert.deepEqual(tierCeiling(desktop), { tier: 'high', reasons: ['capable-device'] });
  assert.deepEqual(tierCeiling(phone), { tier: 'medium', reasons: ['coarse-pointer', 'small-screen'] });
  assert.deepEqual(tierCeiling(weakPhone), { tier: 'low', reasons: ['memory<=2GB'] });
  assert.deepEqual(tierCeiling(software), { tier: 'low', reasons: ['software-renderer'] });
  assert.equal(tierCeiling(buildCapabilityProfile({ viewport: { width: 1600, height: 900 }, hardwareConcurrency: 2 })).tier, 'low');
  assert.equal(tierCeiling(buildCapabilityProfile({ viewport: { width: 1600, height: 900 }, deviceMemory: 4 })).tier, 'medium');
  assert.equal(tierCeiling(buildCapabilityProfile({ viewport: { width: 1600, height: 900 }, saveData: true })).tier, 'medium');
  assert.equal(tierCeiling(buildCapabilityProfile({ viewport: { width: 1600, height: 900 }, webgl: { available: false } })).tier, 'low');
  // before the GPU is known (webgl: null) a desktop is still high, as it always drew
  assert.equal(tierCeiling(buildCapabilityProfile({ viewport: { width: 1600, height: 900 } })).tier, 'high');
});

ok('the policy never reads the user agent', () => {
  const src = ['capabilityProfile.js', 'qualityPolicy.js', 'visibilityPolicy.js'].map((f) => fs.readFileSync(path.join(root, 'lib', 'performance', f), 'utf8')).join('\n');
  assert.ok(!/userAgent|navigator\.platform|\b(iPhone|iPad|Android|Pixel|Galaxy)\b/.test(src.replace(/\/\/.*$/gm, '')), 'a user-agent check crept into the policy');
});

ok('"high" is what a desktop drew before the policy, "medium" what a touch device drew', () => {
  assert.deepEqual(TIER_SETTINGS.high.dpr, [1, 1.5]);
  assert.equal(TIER_SETTINGS.high.shadows, true);
  assert.equal(TIER_SETTINGS.high.shadowMapSize, 4096);
  assert.equal(TIER_SETTINGS.high.anisotropy, 8);
  for (const k of ['ornamentEvery', 'simulationEvery', 'distantEvery', 'decorationDensity', 'diagnosticSampleEvery']) assert.equal(TIER_SETTINGS.high[k], 1, k);
  assert.deepEqual(TIER_SETTINGS.medium.dpr, [1, 1.25]);
  assert.equal(TIER_SETTINGS.medium.shadows, false);
  assert.equal(TIER_SETTINGS.medium.shadowMapSize, 2048);
  // each step down draws no more than the one above
  for (let i = 1; i < TIERS.length; i++) {
    const lo = TIER_SETTINGS[TIERS[i - 1]];
    const hi = TIER_SETTINGS[TIERS[i]];
    assert.ok(lo.dpr[1] <= hi.dpr[1] && lo.decorationDensity <= hi.decorationDensity && lo.ornamentEvery >= hi.ornamentEvery && lo.simulationEvery >= hi.simulationEvery && lo.distantEvery >= hi.distantEvery && (!lo.shadows || hi.shadows));
  }
});

ok('?quality= overrides the tier; anything else is auto', () => {
  assert.equal(parseQualityOverride('?quality=low'), 'low');
  assert.equal(parseQualityOverride('?diag=1&quality=HIGH'), 'high');
  assert.equal(parseQualityOverride('?quality=ultra'), 'auto');
  assert.equal(parseQualityOverride(''), 'auto');
  const d = decideQuality(phone, { override: 'high' });
  assert.equal(d.tier, 'high');
  assert.equal(d.source, 'override');
  assert.deepEqual(d.reasons, ['quality=high']);
  assert.equal(d.ceiling, 'medium'); // still reported
  assert.equal(decideQuality(desktop, { override: 'low' }).settings, TIER_SETTINGS.low);
  const auto = decideQuality(phone);
  assert.equal(auto.tier, 'medium');
  assert.equal(auto.source, 'auto');
  assert.deepEqual(auto.reasons, ['coarse-pointer', 'small-screen']);
});

ok('the frame rate steps the tier down only after sustained slow windows, and back up only well above the floor', () => {
  let g = createFpsGovernor('high');
  for (let i = 0; i < COOLDOWN; i++) g = governFps(g, 10); // the first windows after load are not counted
  assert.equal(g.tier, 'high');
  for (let i = 0; i < DROP_AFTER - 1; i++) g = governFps(g, FPS_FLOOR.high - 1);
  assert.equal(g.tier, 'high');
  g = governFps(g, FPS_FLOOR.high + 5); // one good window resets the count
  for (let i = 0; i < DROP_AFTER - 1; i++) g = governFps(g, FPS_FLOOR.high - 1);
  assert.equal(g.tier, 'high');
  g = governFps(g, FPS_FLOOR.high - 1);
  assert.equal(g.tier, 'medium');
  assert.equal(g.reason, `fps<${FPS_FLOOR.high}`);
  const d = decideQuality(desktop, { measured: g });
  assert.equal(d.tier, 'medium');
  assert.deepEqual(d.reasons, [`fps<${FPS_FLOOR.high}`]);
  // between the floor and the raise threshold nothing changes, however long it lasts (no flapping)
  for (let i = 0; i < 50; i++) g = governFps(g, (FPS_FLOOR.medium + FPS_RAISE.medium) / 2);
  assert.equal(g.tier, 'medium');
  assert.equal(g.changes, 1);
  // back to a tier it was dropped from takes twice as long
  for (let i = 0; i < RAISE_AFTER; i++) g = governFps(g, FPS_RAISE.medium + 3);
  assert.equal(g.tier, 'medium');
  for (let i = 0; i < RAISE_AFTER; i++) g = governFps(g, FPS_RAISE.medium + 3);
  assert.equal(g.tier, 'high');
  assert.equal(decideQuality(desktop, { measured: g }).tier, 'high');
});

ok('a device fast on medium but slow on high does not go round for ever', () => {
  let g = createFpsGovernor('high');
  const tiers = [];
  for (let i = 0; i < 400; i++) {
    g = governFps(g, g.tier === 'high' ? 25 : 60);
    tiers.push(g.tier);
  }
  assert.equal(g.tier, 'medium');
  assert.equal(g.drops.high, MAX_RETRIES);
  assert.ok(g.changes <= 2 * MAX_RETRIES, `${g.changes} changes`);
});

ok('the governor never goes above the ceiling, nor below low', () => {
  let g = createFpsGovernor('medium');
  for (let i = 0; i < 40; i++) g = governFps(g, 60);
  assert.equal(g.tier, 'medium');
  for (let i = 0; i < 40; i++) g = governFps(g, 5);
  assert.equal(g.tier, 'low');
  assert.equal(createFpsGovernor('low', 'high').tier, 'low');
  // the same readings always give the same tiers
  const run = () => [50, 25, 25, 25, 25, 25, 18, 18, 18, 18, 18, 60, 60, 60, 60, 60, 60, 60].reduce((s, f) => governFps(s, f), createFpsGovernor('high')).tier;
  assert.equal(run(), run());
});

ok('frame-time statistics and the frame window', () => {
  const s = frameTimeStats([16, 16, 17, 16, 50, 16, 16, 17, 16, 16]);
  assert.equal(s.frames, 10);
  assert.equal(s.p50, 16);
  assert.equal(s.p95, 50);
  assert.equal(s.max, 50);
  assert.equal(frameTimeStats([]).frames, 0);
  const w = createFrameWindow(0.1);
  for (let i = 0; i < 5; i++) w.push(16);
  assert.equal(w.full(), false);
  w.push(5000); // a stalled tab is not a frame
  for (let i = 0; i < 2; i++) w.push(16);
  assert.equal(w.full(), true);
  assert.equal(w.stats().frames, 7);
});

ok('every class of loop: visible and event loops always run, diagnostics at the sample rate', () => {
  const v = readVisibility({ covered: true, overlay: true, reducedMotion: true, viewFar: true });
  for (const tier of TIERS) {
    assert.equal(loopCadence(LOOPS.visible, v, TIER_SETTINGS[tier]), 1);
    assert.equal(loopCadence(LOOPS.event, v, TIER_SETTINGS[tier]), 1);
    assert.equal(loopCadence(LOOPS.diagnostics, v, TIER_SETTINGS[tier]), TIER_SETTINGS[tier].diagnosticSampleEvery);
  }
  const hidden = readVisibility({ hidden: true });
  for (const loop of Object.values(LOOPS)) assert.equal(loopCadence(loop, hidden, TIER_SETTINGS.high), 0, `${loop.cls} runs in a hidden tab`);
});

ok('pausable loops: paused while covered, ornaments still for reduced motion, throttled by tier, distance and the overlay', () => {
  const plain = readVisibility();
  for (const loop of [LOOPS.ornament, LOOPS.simulation, LOOPS.distantOrnament, LOOPS.distantSimulation]) {
    assert.equal(loopCadence(loop, plain, TIER_SETTINGS.high), 1, 'high runs everything every frame, as before');
    assert.equal(loopCadence(loop, readVisibility({ covered: true }), TIER_SETTINGS.high), 0);
  }
  assert.equal(loopCadence(LOOPS.ornament, readVisibility({ reducedMotion: true }), TIER_SETTINGS.high), 0);
  assert.equal(loopCadence(LOOPS.simulation, readVisibility({ reducedMotion: true }), TIER_SETTINGS.high), 1); // traffic keeps moving
  assert.equal(loopCadence(LOOPS.ornament, plain, TIER_SETTINGS.low), 3);
  assert.equal(loopCadence(LOOPS.simulation, plain, TIER_SETTINGS.low), 2);
  assert.equal(loopCadence(LOOPS.distantSimulation, readVisibility({ viewFar: true }), TIER_SETTINGS.low), 4);
  assert.equal(loopCadence(LOOPS.distantSimulation, readVisibility({ viewFar: true }), TIER_SETTINGS.medium), 2);
  assert.equal(loopCadence(LOOPS.simulation, readVisibility({ viewFar: true }), TIER_SETTINGS.medium), 1); // only distant systems
  assert.equal(loopCadence(LOOPS.simulation, readVisibility({ overlay: true }), TIER_SETTINGS.high), 2);
  assert.equal(animationLevel(plain, TIER_SETTINGS.high), 'full');
  assert.equal(animationLevel(plain, TIER_SETTINGS.low), 'reduced');
  assert.equal(animationLevel(readVisibility({ reducedMotion: true }), TIER_SETTINGS.high), 'still');
  assert.deepEqual(visibilityReasons(readVisibility({ hidden: true, viewFar: true })), ['document-hidden', 'zoomed-out']);
  assert.equal(LOOPS.ornament.cls, LOOP.PAUSABLE);
});

ok('the world is drawn every frame, a few times a second while covered, and not at all while hidden', () => {
  assert.equal(worldRenderEvery(readVisibility()), 1);
  assert.equal(worldRenderEvery(readVisibility({ overlay: true })), 1);
  assert.equal(worldRenderEvery(readVisibility({ covered: true })), COVERED_RENDER_EVERY);
  assert.equal(worldRenderEvery(readVisibility({ hidden: true })), 0);
  // the instances of a throttled loop are spread over the frames
  const ran = [0, 1, 2].map((offset) => [0, 1, 2, 3, 4, 5].filter((f) => runsOnFrame(3, f, offset)));
  assert.deepEqual(ran, [[0, 3], [2, 5], [1, 4]]);
  assert.equal(runsOnFrame(0, 0, 0), false);
});

ok('decorations are thinned to a fixed, evenly spread share', () => {
  const list = Array.from({ length: 10 }, (_, i) => i);
  assert.equal(thinOut(list, 1), list);
  assert.deepEqual(thinOut(list, 0.5), [1, 3, 5, 7, 9]);
  assert.deepEqual(thinOut(list, 0.5), thinOut(list, 0.5));
  assert.equal(thinOut(list, 0.25).length, 2);
  assert.deepEqual(thinOut(list, 0), []);
});

ok('the measurement spots are fixed for a city', () => {
  const layout = { center: { x: 100, z: 50 }, airports: [{ name: 'Pixel Heights Airport', centre: { x: 300, z: -40 } }] };
  const plots = [{ owner: 'a', x: 90, z: 40 }, { owner: 'b', x: 95, z: 45 }, { owner: null, x: 500, z: 500 }, { owner: 'c', x: 400, z: 400 }];
  const spots = measurementSpots(layout, plots);
  assert.deepEqual(spots.map((s) => s.id), ['center', 'downtown', 'whole-city', 'airport', 'airport-far']);
  assert.deepEqual([spots[0].x, spots[0].z, spots[0].zoom], [0, 0, 13]);
  assert.deepEqual([spots[1].x, spots[1].z], [-7.5, -7.5]);
  assert.equal(spots[2].zoom, 5);
  assert.deepEqual([spots[3].x, spots[3].z], [200, -90]);
  assert.deepEqual(measurementSpots(layout, plots), spots);
});

// the policy is wired in: no city component calls useFrame directly, and the canvas takes its pixel ratio and shadows from the policy
ok('every frame loop in the city goes through the policy', () => {
  const dir = path.join(root, 'apps', 'web', 'components', 'city');
  const direct = fs.readdirSync(dir).filter((f) => f.endsWith('.jsx')).filter((f) => /\buseFrame\(/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.deepEqual(direct, [], `useFrame used directly in ${direct.join(', ')} (use useGatedFrame with a LOOPS class: lib/performance/runtime.js)`);
  const canvas = fs.readFileSync(path.join(dir, 'CityCanvas.jsx'), 'utf8');
  assert.ok(!/pointer: coarse/.test(canvas), 'CityCanvas still checks for touch itself');
  assert.ok(/dpr=\{dpr\}/.test(canvas) && /load\.shadows/.test(canvas));
  assert.ok(!/frameloop=/.test(canvas), 'the main canvas must stay on the default (always) frame loop');
});

console.log(`\n${n} checks passed`);
