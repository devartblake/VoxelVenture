"use client";

import { glowFromMap } from './nightLights';
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { create } from 'zustand';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ALL_MODELS, modelFor } from '@/lib/content/models';
import { parseVox, voxelMesh } from '@/lib/content/vox';

// The buildings as real 3D models (Kenney City Kit, CC0) instead of boxes. Each model kind is loaded once, merged into one geometry, and
// drawn for every plot that uses it with a single InstancedMesh, so 700 buildings cost a few dozen draw calls, not 700.
//
//   - nothing changes in how the city is generated: the model is chosen from each plot's size, type and height (lib/content/models.js)
//   - while the models load, or if they cannot (a missing file, an old browser), the box buildings in Plots.jsx are drawn: nothing is ever missing
//   - `?models=0` in the address turns them off (the box buildings stay)
export const useModels = create(() => ({ status: 'idle', geometries: {}, materials: {} })); // idle | loading | ready | failed | off
if (typeof window !== 'undefined') window.__vvModels = useModels;

const byId = new Map(ALL_MODELS.map((m) => [m.id, m]));
const loader = typeof window !== 'undefined' ? new GLTFLoader() : null;

// A voxel building (.vox): its faces as one geometry with vertex colours, one voxel `unit` big, floor at y = 0 and centred on x / z.
async function loadVox(entry) {
  const res = await fetch(entry.url);
  if (!res.ok) throw new Error(`${entry.url}: ${res.status}`);
  const mesh = voxelMesh(parseVox(new Uint8Array(await res.arrayBuffer())), entry.unit);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(mesh.colors, 3));
  geometry.setIndex(mesh.indices);
  geometry.computeBoundingSphere();
  return { geometry, material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }) };
}

// Loads one .glb and returns { geometry, material }: every mesh in it merged, in the model's own units.
async function loadModel(entry) {
  if (entry.format === 'vox') return loadVox(entry);
  const url = entry.url;
  const gltf = await loader.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  let material = null;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    parts.push(g);
    material ??= o.material;
  });
  if (!parts.length) throw new Error(`${url} has no mesh`);
  const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  geometry.computeBoundingSphere();
  return { geometry, material };
}

// Loads the models that are not loaded yet (the first call loads what the city needs; a later claim may need one more).
const pending = new Set();
async function loadMissing(ids) {
  const have = useModels.getState().geometries;
  const need = ids.filter((id) => !have[id] && !pending.has(id));
  if (!need.length) return;
  need.forEach((id) => pending.add(id));
  if (useModels.getState().status === 'idle') useModels.setState({ status: 'loading' });
  try {
    const loaded = await Promise.all(need.map(async (id) => [id, await loadModel(byId.get(id))]));
    const { geometries, materials } = useModels.getState();
    const g = { ...geometries };
    const m = { ...materials }; // one material per kit: every model of a kit shares its colour texture
    for (const [id, { geometry, material }] of loaded) {
      const kit = byId.get(id).kit;
      g[id] = geometry;
      if (!m[kit]) {
        const mat = byId.get(id).format === 'vox' ? material : material.clone();
        mat.roughness = 0.85;
        mat.metalness = 0;
        m[kit] = mat;
        if (byId.get(id).format !== 'vox') glowFromMap(mat); // the windows are lit at night
      }
    }
    useModels.setState({ status: 'ready', geometries: g, materials: m });
  } catch (e) {
    console.warn('The 3D building models could not be loaded; the box buildings stay.', e?.message);
    useModels.setState({ status: 'failed' });
  } finally {
    need.forEach((id) => pending.delete(id));
  }
}

// Load some models now (a building being set up may need one the city has not loaded).
export const ensureModels = (ids) => loadMissing(ids);

// The model for every plot, or null. (Only plots with a building have one.)
export const assignModels = (plots) => new Map(plots.map((p) => [p.id, modelFor(p)]).filter(([, m]) => m));

const tmp = new THREE.Object3D();
const WHITE = new THREE.Color('#ffffff');
const tint = new THREE.Color();
const base = new THREE.Color();
const SELECTED = new THREE.Color('#fcd34d');
const HOVER = new THREE.Color('#bae6fd');

export function Kind({ id, rows, selectedId, hoveredId, onSelect, onHover }) {
  const ref = useRef(null);
  const { geometries, materials } = useModels.getState();
  const model = byId.get(id);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    rows.forEach(({ plot, m }, i) => {
      tmp.position.set(plot.x, 0, plot.z);
      // the plot's own turn (a plot along a curved road), then the model's: p' = T(plot) * R(plot.yaw) * (T(offset) * R(rotY) * S)
      const yaw = plot.yaw ?? 0;
      const [ox, oy, oz] = m.offset;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      tmp.position.set(plot.x + ox * cos + oz * sin, 0.1 + oy, plot.z - ox * sin + oz * cos);
      tmp.rotation.set(0, yaw + m.rotY, 0);
      tmp.scale.set(m.scale[0], m.scale[1], m.scale[2]);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      // the owner's wall colour if they chose one; otherwise the model keeps its own colours, with a hint of the business's colour so a street is not all one shade; selected and hovered ones glow
      mesh.setColorAt(i, plot.id === selectedId ? SELECTED : plot.id === hoveredId ? HOVER : tint.copy(WHITE).lerp(base.set(plot.wallColor ?? (/^#[0-9a-f]{6}$/i.test(plot.color ?? '') ? plot.color : '#ffffff')), plot.wallColor ? 0.9 : 0.4));
    });
    mesh.count = rows.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.boundingSphere = null;
    mesh.boundingBox = null;
  }, [rows, selectedId, hoveredId]);

  const plotAt = (e) => rows[e.instanceId]?.plot;
  return (
    <instancedMesh
      ref={(m) => {
        ref.current = m; // (no return value: React 19 treats a returned value as the ref's cleanup)
      }}
      args={[geometries[id], materials[model.kit], Math.max(1, rows.length)]}
      castShadow
      receiveShadow
      frustumCulled={false}
      onClick={(e) => {
        const p = plotAt(e);
        if (!p) return;
        e.stopPropagation();
        onSelect(p);
      }}
      onPointerMove={(e) => {
        const p = plotAt(e);
        if (!p) return;
        e.stopPropagation();
        onHover(p.id);
      }}
      onPointerOut={() => onHover(null)}
    />
  );
}

export default function ModelBuildings({ plots, assignments, selectedId, hoveredId, onSelect, onHover }) {
  const status = useModels((s) => s.status);
  const geometries = useModels((s) => s.geometries);
  const ids = useMemo(() => [...new Set([...assignments.values()].map((m) => m.id))].sort(), [assignments]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('models') === '0') {
      useModels.setState({ status: 'off' });
      return;
    }
    if (ids.length) loadMissing(ids);
  }, [ids]);

  // the plots grouped by model, so each model is one instanced mesh
  const groups = useMemo(() => {
    const out = new Map();
    for (const p of plots) {
      const m = assignments.get(p.id);
      if (!m || !geometries[m.id]) continue; // a model still loading: the plot keeps its box for now
      if (!out.has(m.id)) out.set(m.id, []);
      out.get(m.id).push({ plot: p, m });
    }
    return out;
  }, [plots, assignments, geometries]);

  if (status !== 'ready') return null;
  return (
    <group name="model-buildings">
      {[...groups.entries()].map(([id, rows]) => (
        <Kind key={`${id}-${rows.length}`} id={id} rows={rows} selectedId={selectedId} hoveredId={hoveredId} onSelect={onSelect} onHover={onHover} />
      ))}
    </group>
  );
}
