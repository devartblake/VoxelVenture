// The level of detail at run time (docs/architecture/performance_policy.md, "Level of detail"). The decision is pure and lives
// in lodPolicy.js; this keeps it current from the camera and the quality tier, and lets the city's components follow it:
//
//   useLod                the store: the level in force, what it hides, the zoom it was decided at, the ?lod= override, counts
//   useLodDirector()      inside the canvas, once (PerfProbe): reads the camera every frame and decides again (state changes only
//                         when the decision does)
//   useLodHidden(cls, n)  true while the class is hidden; `n` is how many things of that class the caller draws (for the counts)
//   reportLodCount(key, n)  a component's own count for the diagnostics (the stand-ins drawn, their draw calls)
//   useCulledInstances(ref) an instanced mesh draws only its instances near the view while the decision says `cull`
import { useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { create } from 'zustand';
import { decideLod, lodHides, parseLodOverride, viewZoom, visibleInstances } from './lodPolicy';
import { LOOPS } from './visibilityPolicy';
import { qualityGate, useGatedFrame, useQuality } from './runtime';
import { PRESETS, useView } from '../state/viewStore';

export const useLod = create(() => ({
  override: 'auto', // ?lod=
  level: 'full',
  buildings: 'full',
  hidden: [],
  cull: false, // only the instances near the view are drawn (lodPolicy.js: off screen)
  rule: 'high',
  reason: '',
  zoom: null, // the view's zoom (pixels per unit at the target) when the level last changed
  counts: {}, // { standIns, standInCalls, ... } reported by the components, and per hidden class how many things it holds
}));

// the view's zoom of the last frame (the diagnostics badge reads it once a second); the camera's projection x view matrix and a
// version that changes whenever it does (the culled meshes look again then); the instances culled in the last frame
export const lodLive = { zoom: null, viewVersion: 0, view: new THREE.Matrix4(), culled: 0 };
const culledBy = new Map(); // mesh -> instances it leaves out

const registered = {}; // per class: how many things of it are mounted
const reported = {};

function publishCounts() {
  useLod.setState({ counts: { ...reported, ...Object.fromEntries(Object.entries(registered).map(([k, v]) => [`class:${k}`, v])) } });
}
let pendingPublish = null;
function schedulePublish() {
  if (pendingPublish) return;
  pendingPublish = setTimeout(() => {
    pendingPublish = null;
    publishCounts();
  }, 250);
}

export function reportLodCount(key, n) {
  if (reported[key] === n) return;
  reported[key] = n;
  schedulePublish();
}

export function useLodHidden(cls, n = 1) {
  useEffect(() => {
    if (!n) return undefined;
    registered[cls] = (registered[cls] ?? 0) + n;
    schedulePublish();
    return () => {
      registered[cls] = (registered[cls] ?? 0) - n;
      schedulePublish();
    };
  }, [cls, n]);
  return useLod((s) => lodHides(s, cls));
}

// The level in force and its counts, for the measurement (runtime.js measureCity) and the badge.
export function lodSnapshot() {
  const s = useLod.getState();
  return { level: s.level, override: s.override, hidden: s.hidden, cull: s.cull, culled: lodLive.culled, standIns: reported.standIns ?? 0, standInCalls: reported.standInCalls ?? 0 };
}

let overrideRead = false;
function readOverride() {
  if (overrideRead || typeof window === 'undefined') return;
  overrideRead = true;
  useLod.setState({ override: parseLodOverride(window.location.search) });
}

const viewMatrix = new THREE.Matrix4();

// Inside the canvas, once. Runs after the quality director (which sets the tier) and before everything else draws.
export function useLodDirector() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    readOverride();
    if (typeof window === 'undefined') return undefined;
    const diag = process.env.NODE_ENV !== 'production' || new URLSearchParams(window.location.search).has('diag');
    if (!diag) return undefined;
    window.__vvLod = useLod;
    return () => {
      delete window.__vvLod;
    };
  }, []);
  useFrame(() => {
    const { camera, size } = get();
    const view = useView.getState();
    const preset = PRESETS[view.view] ?? {};
    const zoom = viewZoom({
      iso: Boolean(preset.iso && camera.isOrthographicCamera),
      zoom: camera.zoom,
      distance: view.distance,
      fov: camera.isPerspectiveCamera ? camera.fov : view.fov,
      height: size.height,
      firstPerson: Boolean(preset.fp),
    });
    lodLive.zoom = Number.isFinite(zoom) ? Math.round(zoom * 10) / 10 : null;
    camera.updateMatrixWorld();
    viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (!viewMatrix.equals(lodLive.view)) {
      lodLive.view.copy(viewMatrix);
      lodLive.viewVersion++;
    }
    let culled = 0;
    for (const n of culledBy.values()) culled += n;
    lodLive.culled = culled;
    const s = useLod.getState();
    const shadows = Boolean(qualityGate.settings.shadows && useQuality.getState().load.shadows);
    const d = decideLod({ tier: qualityGate.tier, zoom, override: s.override, previous: s.level, shadows });
    if (d.level !== s.level || d.rule !== s.rule || d.cull !== s.cull || d.hidden.join() !== s.hidden.join()) {
      useLod.setState({ ...d, zoom: lodLive.zoom });
    }
  }, -9);
}

// Off-screen culling for an instanced mesh whose instances never move (the building models, the trees and other props). The
// caller writes every instance as usual, then calls capture() with each instance's bounding sphere in the mesh's own space;
// while the decision says `cull`, each frame the view has changed the mesh is rewritten with only the instances near the view
// (in their order), and its count lowered. instance(id) turns a drawn instance's id (a click) back into the caller's index.
const CULL_MARGIN = 3; // world units round the view: an instance just off the edge is already drawn when the view moves
const frustum = new THREE.Frustum();
const meshView = new THREE.Matrix4();
export function useCulledInstances(ref) {
  const [state] = useState(() => ({ matrices: null, colors: null, spheres: null, count: 0, order: null, version: -1 }));
  useEffect(() => () => culledBy.delete(state), [state]);
  useGatedFrame(LOOPS.event, () => {
    const mesh = ref.current;
    if (!mesh || !state.spheres) return;
    const cull = useLod.getState().cull;
    if (!cull) {
      if (state.order) write(mesh, state, null);
      return;
    }
    if (state.version === lodLive.viewVersion && state.order) return;
    state.version = lodLive.viewVersion;
    mesh.updateWorldMatrix(true, false);
    frustum.setFromProjectionMatrix(meshView.multiplyMatrices(lodLive.view, mesh.matrixWorld));
    const planes = frustum.planes.map((p) => [p.normal.x, p.normal.y, p.normal.z, p.constant]);
    const order = visibleInstances(state.spheres, planes, CULL_MARGIN);
    if (state.order && order.length === state.order.length && order.every((v, i) => v === state.order[i])) return;
    write(mesh, state, order);
  });
  return {
    // after the caller has written every instance (and set mesh.count): keep them, and cull again on the next frame
    capture(spheres) {
      const mesh = ref.current;
      if (!mesh) return;
      state.matrices = mesh.instanceMatrix.array.slice(0, mesh.count * 16);
      state.colors = mesh.instanceColor ? mesh.instanceColor.array.slice(0, mesh.count * 3) : null;
      state.spheres = spheres;
      state.count = mesh.count;
      state.order = null;
      state.version = -1;
      culledBy.delete(state);
    },
    instance: (id) => (state.order ? state.order[id] : id),
  };
}

function write(mesh, state, order) {
  const n = order ? order.length : state.count;
  const m = mesh.instanceMatrix.array;
  const c = mesh.instanceColor?.array;
  for (let k = 0; k < n; k++) {
    const i = order ? order[k] : k;
    for (let j = 0; j < 16; j++) m[k * 16 + j] = state.matrices[i * 16 + j];
    if (c && state.colors) for (let j = 0; j < 3; j++) c[k * 3 + j] = state.colors[i * 3 + j];
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.boundingSphere = null;
  mesh.boundingBox = null;
  state.order = order;
  if (order) culledBy.set(state, state.count - n);
  else culledBy.delete(state);
}

// Each instance's bounding sphere in the mesh's space, from the geometry's sphere and the instance matrices as written.
const sphereTmp = new THREE.Sphere();
const matTmp = new THREE.Matrix4();
export function instanceSpheres(mesh) {
  const g = mesh.geometry;
  if (!g.boundingSphere) g.computeBoundingSphere();
  const out = new Float32Array(mesh.count * 4);
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matTmp);
    sphereTmp.copy(g.boundingSphere).applyMatrix4(matTmp);
    out[i * 4] = sphereTmp.center.x;
    out[i * 4 + 1] = sphereTmp.center.y;
    out[i * 4 + 2] = sphereTmp.center.z;
    out[i * 4 + 3] = sphereTmp.radius;
  }
  return out;
}
