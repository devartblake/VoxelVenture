// The capability policy at run time, in the browser (docs/architecture/performance_policy.md). The decisions themselves are
// pure and live beside this file (capabilityProfile.js, qualityPolicy.js, visibilityPolicy.js); this wires them to the page:
//
//   useQuality            the store: the tier in force, its reasons and settings, the profile, the measured frame rate
//   qualityGate           the same, as a plain object read every frame without React (the frame counter, what covers the world)
//   initQuality()         reads the browser and ?quality= once the page has mounted (CityCanvas)
//   useQualityDirector()  inside the canvas (PerfProbe): reads the GPU, keeps qualityGate current, measures the frame rate and
//                         steps the tier down (or back up) with hysteresis
//   useGatedFrame(loop, callback)  useFrame for one class of loop: skipped, throttled or run as visibilityPolicy says
//   useWorldRenderGate()  draws the world each frame, and only a few frames a second while a modal covers it
//   measureCity()         the fixed-spot measurement (scripts/perf-measure.mjs and the diagnostics badge)
import { useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { create } from 'zustand';
import { REDUCED_MOTION_QUERY, createFrameWindow, frameTimeStats, readBrowserCapabilities } from './capabilityProfile';
import { TIER_SETTINGS, createFpsGovernor, decideQuality, governFps, parseQualityOverride, tierCeiling } from './qualityPolicy';
import { animationLevel, loopCadence, readVisibility, runsOnFrame, visibilityReasons, worldRenderEvery } from './visibilityPolicy';
import { measurementSpots, MAP_CAMERA_OFFSET } from './measureSpots';
import { perfStats } from '../dev/perfStats';
import { lodSnapshot } from './lodRuntime';
import { useCityStore } from '../state/store';
import { useMap } from '../state/mapStore';
import { usePanel } from '../state/panelStore';
import { PRESETS, useView } from '../state/viewStore';

const WARM_UP_MS = 10000; // the first seconds (shaders compiling, models streaming in) are not measured
const FAR_ZOOM = 9; // the map camera below this zoom counts as zoomed out over the city

export const qualityGate = {
  frame: 0,
  visibility: readVisibility(),
  settings: TIER_SETTINGS.high,
  tier: 'high',
  measureFrom: 0, // performance.now() after which frames count for the governor
};

export const useQuality = create(() => ({
  ready: false, // the browser has been read
  gpuKnown: false, // ... and the renderer too
  override: 'auto',
  profile: null,
  tier: 'high',
  source: 'auto',
  ceiling: 'high',
  reasons: [],
  settings: TIER_SETTINGS.high,
  // The settings the city was set up with once the GPU was known: the canvas's shadow map and the decoration densities
  // follow these, not later tier changes (rebuilding them mid-visit would stutter). Shadows can still be switched off later.
  load: TIER_SETTINGS.high,
  fps: null, // the last window: { fps, p50, p95, frames }
  visibility: [],
  animation: 'full',
  changes: [], // tier changes since load: { at, from, to, reason }
}));

let governor = null;

function apply(decision, extra = {}) {
  const prev = useQuality.getState();
  const changed = prev.tier !== decision.tier;
  qualityGate.settings = decision.settings;
  qualityGate.tier = decision.tier;
  if (changed) qualityGate.measureFrom = Math.max(qualityGate.measureFrom, performance.now() + 3000); // (never shortens the warm-up)
  perfStats.quality = decision.tier;
  perfStats.qualityReasons = decision.reasons.join(',').slice(0, 120);
  useQuality.setState({
    tier: decision.tier,
    source: decision.source,
    ceiling: decision.ceiling,
    reasons: decision.reasons,
    settings: decision.settings,
    changes: changed && prev.ready ? [...prev.changes, { at: Math.round(performance.now()), from: prev.tier, to: decision.tier, reason: decision.reasons.at(-1) }].slice(-10) : prev.changes,
    ...extra,
  });
}

function decide(profile, override) {
  return decideQuality(profile, { override, measured: governor && governor.changes ? governor : null });
}

// Once, after mount.
export function initQuality() {
  if (useQuality.getState().ready) return;
  const override = parseQualityOverride(window.location.search);
  const profile = readBrowserCapabilities();
  governor = createFpsGovernor(tierCeiling(profile).tier);
  qualityGate.measureFrom = performance.now() + WARM_UP_MS;
  const decision = decide(profile, override);
  apply(decision, { ready: true, override, profile, load: decision.settings });
  qualityGate.visibility = readVisibility({ ...qualityGate.visibility, reducedMotion: profile.reducedMotion });
  try {
    const q = window.matchMedia(REDUCED_MOTION_QUERY);
    q.addEventListener('change', () => {
      const p = { ...useQuality.getState().profile, reducedMotion: q.matches };
      useQuality.setState({ profile: p });
    });
  } catch {
    /* no media queries: the preference is read once */
  }
}

// The renderer exists: read the GPU and decide again (a software renderer lowers the ceiling). The load settings are fixed here.
function refineWithRenderer(context) {
  const s = useQuality.getState();
  if (!s.ready || s.gpuKnown) return;
  const profile = readBrowserCapabilities(context);
  profile.reducedMotion = s.profile?.reducedMotion ?? profile.reducedMotion;
  governor = createFpsGovernor(tierCeiling(profile).tier, governor?.tier);
  const decision = decide(profile, s.override);
  apply(decision, { gpuKnown: true, profile, load: decision.settings });
}

// Inside the canvas, once (PerfProbe). Runs before every other frame callback.
export function useQualityDirector() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const [win] = useState(() => createFrameWindow(2));

  useEffect(() => {
    initQuality();
    refineWithRenderer(gl.getContext());
  }, [gl]);

  useFrame((_, delta) => {
    qualityGate.frame++;
    const s = useQuality.getState();
    const panelOpen = Boolean(usePanel.getState().view);
    const visibility = readVisibility({
      hidden: typeof document !== 'undefined' && document.hidden,
      covered: Boolean(useCityStore.getState().activeInteriorPlot), // the storefront interior is a full-screen modal
      overlay: useMap.getState().open || (panelOpen && Boolean(s.profile?.smallScreen)), // the world map's veil; the panel over most of a phone
      reducedMotion: Boolean(s.profile?.reducedMotion),
      viewFar: Boolean(PRESETS[useView.getState().view]?.iso && camera.isOrthographicCamera && camera.zoom < FAR_ZOOM),
    });
    qualityGate.visibility = visibility;

    // the measured frame rate: only frames of the plain, uncovered city count
    if (visibility.hidden || visibility.covered || visibility.overlay || performance.now() < qualityGate.measureFrom) {
      win.clear();
    } else {
      win.push(delta * 1000);
      if (win.full()) {
        const stats = win.stats();
        win.clear();
        if (s.source === 'auto' && governor) {
          const before = governor.tier;
          // the typical frame (the median), not the mean: a few long frames while a model loads or a panel opens are not a slow device
          governor = governFps(governor, stats.p50 > 0 ? 1000 / stats.p50 : 0);
          if (governor.tier !== before) apply(decide(s.profile, s.override));
        }
        perfStats.frameP95 = stats.p95; // (the telemetry's own `fps` is counted by lib/net/multiplayer.js)
        useQuality.setState({ fps: stats });
      }
    }
    // what the diagnostics show (only when it changes)
    const reasons = visibilityReasons(visibility);
    const animation = animationLevel(visibility, qualityGate.settings);
    if (animation !== s.animation || reasons.join() !== s.visibility.join()) useQuality.setState({ visibility: reasons, animation });
  }, -10);
}

// useFrame for one class of loop (visibilityPolicy.LOOPS). The time of skipped frames is added up and handed to the next run, so
// a throttled simulation moves at the same speed; while paused, the time is dropped (it resumes where it stopped).
let offsets = 0;
const nextOffset = () => (offsets = (offsets + 1) % 7919);
export function useGatedFrame(loop, callback, priority = 0) {
  const [state] = useState(() => ({ offset: nextOffset(), time: 0 }));
  useFrame((root, delta, frame) => {
    const every = loopCadence(loop, qualityGate.visibility, qualityGate.settings);
    if (every === 0) {
      state.time = 0;
      return;
    }
    state.time += delta;
    if (!runsOnFrame(every, qualityGate.frame, state.offset)) return;
    const elapsed = state.time;
    state.time = 0;
    callback(root, elapsed, frame);
  }, priority);
}

// Takes over drawing the world (a frame callback with a positive priority tells React Three Fiber not to draw by itself).
// Every frame, as before; only while the storefront interior covers the city is it drawn a few times a second.
export function useWorldRenderGate() {
  useFrame((root) => {
    const every = worldRenderEvery(qualityGate.visibility);
    if (every === 0 || (every > 1 && qualityGate.frame % every !== 0)) return;
    root.gl.render(root.scene, root.camera);
  }, 1);
}

// ---- measurement ------------------------------------------------------------------------------------------------------
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

// The land's depth along the camera's view (its rectangle, from the ground to the tallest building), against the camera's near
// and far planes: whether the zoomed-out views clip the city, and how much depth range the depth buffer has to spread over.
function depthReport(layout, plots, camera) {
  const land = layout?.land;
  if (!land) return null;
  const c = layout.center ?? { x: 0, z: 0 };
  const top = Math.max(10, ...plots.map((p) => p.height ?? 0));
  camera.updateMatrixWorld();
  const v = new THREE.Vector3();
  let min = Infinity;
  let max = -Infinity;
  for (const x of [land.x0 - c.x, land.x1 - c.x]) for (const y of [0, top]) for (const z of [land.z0 - c.z, land.z1 - c.z]) {
    v.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    min = Math.min(min, -v.z);
    max = Math.max(max, -v.z);
  }
  // what is on screen: where the rays through the screen's corners and edge midpoints meet the ground (y = 0), inside the land
  // (the line through the near and far planes, extended either way: a point of the ground before the near plane is what is clipped)
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const hit = new THREE.Vector3();
  let onMin = Infinity;
  let onMax = -Infinity;
  for (const [nx, ny] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]]) {
    a.set(nx, ny, -1).unproject(camera);
    b.set(nx, ny, 1).unproject(camera);
    if (Math.abs(b.y - a.y) < 1e-9) continue;
    hit.copy(a).lerp(b, -a.y / (b.y - a.y));
    const x = Math.min(land.x1 - c.x, Math.max(land.x0 - c.x, hit.x));
    const z = Math.min(land.z1 - c.z, Math.max(land.z0 - c.z, hit.z));
    v.set(x, 0, z).applyMatrix4(camera.matrixWorldInverse);
    onMin = Math.min(onMin, -v.z);
    onMax = Math.max(onMax, -v.z);
  }
  const r = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);
  return {
    near: camera.near,
    far: camera.far,
    sceneNearest: r(min),
    sceneFarthest: r(max),
    clipsNear: min < camera.near,
    clipsFar: max > camera.far,
    groundOnScreen: [r(onMin), r(onMax)], // the depth of the ground that is on screen
    clipsOnScreen: onMin < camera.near || onMax > camera.far, // part of the ground in view lies outside the camera's depth range
  };
}

// Puts the map camera at each fixed spot, lets it settle, then records `seconds` of frames there.
export async function measureCity({ get, seconds = 6, settle = 2000, only = null, onSpot = null } = {}) {
  const st = useCityStore.getState();
  const spots = measurementSpots(st.layout, st.plots).filter((s) => !only || only.includes(s.id));
  if (!PRESETS[useView.getState().view]?.iso) {
    useView.getState().setView('iso');
    await pause(1500);
  }
  usePanel.getState().close?.();
  const results = [];
  for (const spot of spots) {
    onSpot?.(spot);
    const { camera, controls } = get();
    controls.target.set(spot.x, 0, spot.z);
    camera.position.set(spot.x + MAP_CAMERA_OFFSET[0], MAP_CAMERA_OFFSET[1], spot.z + MAP_CAMERA_OFFSET[2]);
    camera.zoom = spot.zoom;
    camera.updateProjectionMatrix();
    controls.update();
    await pause(settle);
    const times = [];
    const calls = [];
    const triangles = [];
    let last = await nextFrame();
    const end = last + seconds * 1000;
    while (last < end) {
      const now = await nextFrame();
      times.push(now - last);
      calls.push(perfStats.calls);
      triangles.push(perfStats.triangles);
      last = now;
    }
    const mean = (a) => Math.round(a.reduce((s, x) => s + x, 0) / Math.max(1, a.length));
    results.push({
      id: spot.id,
      ...(spot.name ? { name: spot.name } : {}),
      zoom: spot.zoom,
      target: [spot.x, spot.z],
      frameTime: frameTimeStats(times),
      drawCalls: { mean: mean(calls), max: Math.max(0, ...calls) },
      triangles: { mean: mean(triangles), max: Math.max(0, ...triangles) },
      geometries: perfStats.geometries,
      textures: perfStats.textures,
      depth: depthReport(st.layout, st.plots, camera),
      lod: lodSnapshot(), // the level of detail in force at the spot, and the stand-ins drawn
      fromShadowCentre: Math.round(Math.hypot(spot.x, spot.z)), // the sun's shadow camera covers +-150 round the scene's origin
    });
  }
  const q = useQuality.getState();
  const { gl, size } = get();
  return {
    tier: q.tier,
    source: q.source,
    ceiling: q.ceiling,
    reasons: q.reasons,
    settings: q.settings,
    load: q.load,
    changes: q.changes,
    renderer: q.profile?.webgl?.renderer ?? null,
    vendor: q.profile?.webgl?.vendor ?? null,
    pixelRatio: gl.getPixelRatio(),
    canvas: [Math.round(size.width), Math.round(size.height)],
    devicePixelRatio: window.devicePixelRatio,
    shadowMap: gl.shadowMap.enabled,
    spots: results,
  };
}
