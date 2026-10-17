"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { create } from 'zustand';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PROP_CATALOG } from '@/lib/content/propCatalog';

// Kenney trees, bushes and cars (CC0) as instanced meshes. Each model is loaded once, merged into one geometry and drawn for every tree / car
// that uses it. Until a model has loaded (or if it cannot, or with `?models=0`) the callers keep drawing their box versions.
export const useProps = create(() => ({ geometries: {}, materials: {} }));
if (typeof window !== 'undefined') window.__vvProps = useProps;

export const propEntry = (id) => byId.get(id);
const byId = new Map(PROP_CATALOG.map((m) => [m.id, m]));
const loader = typeof window !== 'undefined' ? new GLTFLoader() : null;
const pending = new Set();
const failed = new Set();

// A model with plain material colours (trees) gets them baked into vertex colours so all its parts merge into one geometry.
async function loadProp(entry) {
  const gltf = await loader.loadAsync(entry.url);
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  let material = null;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!entry.textured) {
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      const c = mat.color ?? new THREE.Color('#ffffff');
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      g.deleteAttribute('uv');
    } else material ??= o.material;
    parts.push(g);
  });
  if (!parts.length) throw new Error(`${entry.url} has no mesh`);
  const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  geometry.computeBoundingSphere();
  return { geometry, material };
}

export async function loadProps(ids) {
  if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('models') === '0') return;
  const have = useProps.getState().geometries;
  const need = ids.filter((id) => byId.has(id) && !have[id] && !pending.has(id) && !failed.has(id));
  if (!need.length) return;
  need.forEach((id) => pending.add(id));
  await Promise.all(
    need.map(async (id) => {
      const entry = byId.get(id);
      try {
        const { geometry, material } = await loadProp(entry);
        const { geometries, materials } = useProps.getState();
        const m = { ...materials };
        if (entry.textured) {
          if (!m[entry.kit]) {
            m[entry.kit] = material.clone();
            m[entry.kit].roughness = 0.6;
            m[entry.kit].metalness = 0.1;
          }
        } else if (!m.vertex) m.vertex = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
        useProps.setState({ geometries: { ...geometries, [id]: geometry }, materials: m });
      } catch (e) {
        failed.add(id);
        console.warn(`The model ${id} could not be loaded; the box version stays.`, e?.message);
      } finally {
        pending.delete(id);
      }
    })
  );
}

export const propMaterial = (materials, entry) => (entry.textured ? materials[entry.kit] : materials.vertex);

const tmp = new THREE.Object3D();
const col = new THREE.Color();
function Group({ id, rows }) {
  const ref = useRef(null);
  const { geometries, materials } = useProps.getState();
  const entry = byId.get(id);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    rows.forEach((r, i) => {
      const cos = Math.cos(r.rotY);
      const sin = Math.sin(r.rotY);
      const [ox, oy, oz] = r.offset;
      tmp.position.set(r.x + ox * cos + oz * sin, r.y + oy, r.z - ox * sin + oz * cos);
      tmp.rotation.set(0, r.rotY, 0);
      tmp.scale.setScalar(r.scale);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      mesh.setColorAt(i, col.set(r.tint ?? '#ffffff'));
    });
    mesh.count = rows.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.boundingSphere = null;
  }, [rows]);
  return (
    <instancedMesh
      ref={(m) => {
        ref.current = m;
      }}
      args={[geometries[id], propMaterial(materials, entry), Math.max(1, rows.length)]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}

// Draws static props: items = [{ x, z, y?, tint?, model: { id, scale, rotY, offset } | null }]. An item whose model has not loaded is skipped.
export default function PropInstances({ items }) {
  const geometries = useProps((s) => s.geometries);
  const groups = useMemo(() => {
    const out = new Map();
    for (const it of items) {
      if (!it.model || !geometries[it.model.id]) continue;
      if (!out.has(it.model.id)) out.set(it.model.id, []);
      out.get(it.model.id).push({ x: it.x, y: it.y ?? 0, z: it.z, tint: it.tint, scale: it.model.scale, rotY: it.model.rotY ?? 0, offset: it.model.offset });
    }
    return out;
  }, [items, geometries]);
  return (
    <group>
      {[...groups.entries()].map(([id, rows]) => (
        <Group key={`${id}-${rows.length}`} id={id} rows={rows} />
      ))}
    </group>
  );
}

// Starts loading these models; true once every one of them has loaded.
export function usePropsReady(ids) {
  const geometries = useProps((s) => s.geometries);
  useEffect(() => {
    loadProps(ids);
  }, [ids]);
  return ids.length > 0 && ids.every((id) => geometries[id]);
}

// One model of the catalog, drawn once (a boat, a stall, the park gate): `position`, `rotation` and `scale` place it, and while the model has not loaded (or if it
// cannot, or with ?models=0) `fallback` is drawn instead, so nothing is ever missing. The model faces +Z like everything else.
export function PropModel({ id, position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, fallback = null, castShadow = true }) {
  const ids = useMemo(() => [id], [id]);
  const ready = usePropsReady(ids);
  const geometry = useProps((s) => s.geometries[id]);
  const materials = useProps((s) => s.materials);
  const entry = byId.get(id);
  if (!ready || !entry || !geometry) return fallback;
  return <mesh geometry={geometry} material={propMaterial(materials, entry)} position={position} rotation={rotation} scale={scale} castShadow={castShadow} receiveShadow />;
}
