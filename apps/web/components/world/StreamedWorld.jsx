"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useFrame, useThree } from '@react-three/fiber';
import { loadBakedWorld } from '@/lib/world/bakedWorld';
import { createChunkManager } from '@/lib/world/chunkManager';
import { buildChunkObject, createChunkMaterials, disposeChunkObject } from '@/lib/world/chunkObject';
import { createTerrain, setActiveTerrain } from '@/lib/world/terrain';
import { TRACK_MODELS } from '@/lib/world/track';
import { registerGlow } from '@/components/city/nightLights';

// The streaming runtime React layer (roadmap task 11, slice 3; docs/world/streaming_runtime.md). Mounts the baked chunks (public/world, scripts/bake-world.mjs) near the camera or a point the
// caller gives, and disposes the ones left behind, one chunk a frame. It owns no game state: with no `focus` it follows the camera, and `skip(chunk)` lets a caller leave out chunks it draws itself
// (the game leaves out the first town own land while that town is still drawn by the generator code). Nothing renders until the manifest has loaded; a missing world (no bake) renders nothing.
//   window.__vvStreamedWorld: { ready, mounted, mounts, unmounts, loads, triangles, drawCalls, profile, focus } for the tests and the dev page.
const stats = { ready: false, mounted: 0, mounts: 0, unmounts: 0, loads: 0, triangles: 0, drawCalls: 0, profile: '', focus: null };
if (typeof window !== 'undefined') window.__vvStreamedWorld = stats;

// The causeway bridge models: the Kenney City Kit (Roads) deck and pillar (public/models/kenney/roads, CC0, docs/licences/kenney/). Loaded once and shared by every chunk; if they cannot be loaded the
// bridges are flat ribbons (chunkMesh.js), so nothing breaks.
let bridgeModels = null;
function loadBridgeModels() {
  bridgeModels ??= (async () => {
    const loader = new GLTFLoader();
    // a model is one geometry with a group for each of its materials (a track tile is road, kerb and grass; a flag is cloth and pole): every mesh of the file, in the file's own placement, merged
    const first = async (file) => {
      const gltf = await loader.loadAsync(`/models/kenney/roads/${file}`);
      gltf.scene.updateMatrixWorld(true);
      const parts = [];
      // a road tile carries its own grass, coplanar with the road: the ground is already grass, and two surfaces at one height flicker, so a tile's grass is left out (trees keep theirs: it is their leaves)
      gltf.scene.traverse((o) => { if (o.isMesh && !(/^road/.test(file.replace(/^.*\//, '')) && o.material?.name === 'grass')) parts.push(o); });
      if (!parts.length) throw new Error(`${file} has no mesh`);
      const geometries = parts.map((o) => {
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name); // the kit's colours are in its materials, not textures
        return g;
      });
      const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, true);
      // the road surface is drawn over the tile's grey base, which is at the same height: pulled toward the camera it always wins
      const materials = parts.map((o) => { if (o.material?.name === 'road') { const m = o.material.clone(); m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; return m; } return o.material; });
      return { geometry, material: materials.length === 1 ? materials[0] : materials };
    };
    const models = { deck: await first('road-bridge.glb'), pillar: await first('bridge-pillar-wide.glb'), props: null };
    // the racing track's models (Kenney Racing Kit, public/models/kenney/racing): a circuit that cannot load them stays a ribbon
    try {
      const entries = await Promise.all(TRACK_MODELS.map(async (name) => [name, await first(`../racing/${name}.glb`)]));
      models.props = Object.fromEntries(entries);
    } catch { models.props = null; }
    // night (components/city/nightLights.js drives these with the game's own dusk): the lamp heads and the pit windows glow, and each lamp throws a pool of light on the road
    if (models.props) {
      const warm = (material, night, day = 0) => { const m = material.clone(); m.emissive.set('#ffe2a0'); registerGlow(m, { day, night }); return m; };
      const lamp = models.props.lightPostModern;
      if (lamp) lamp.material = [].concat(lamp.material).map((m) => (m.name === '_defaultMat' ? warm(m, 3.2, 0.15) : m));
      const mast = models.props.lightPostLarge;
      if (mast) mast.material = [].concat(mast.material).map((m) => (m.name === '_defaultMat' ? warm(m, 5, 0.2) : m)); // the lamp bank of a stadium mast
      const pits = models.props.pitsOffice;
      if (pits) pits.material = [].concat(pits.material).map((m) => (m.name === 'glass' ? warm(m, 1.3) : m));
      if (typeof document !== 'undefined') {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 64;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.5, '#808080');
        grad.addColorStop(1, '#000000');
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        const tex = new THREE.CanvasTexture(c);
        const geometry = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
        const material = new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffc872', emissiveIntensity: 0, alphaMap: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
        registerGlow(material, { day: 0, night: 0.9 });
        models.pool = { geometry, material };
        // the stadium lights' pools: much wider, and a little dimmer where they overlap
        const floodMaterial = new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#fff0d4', emissiveIntensity: 0, alphaMap: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
        registerGlow(floodMaterial, { day: 0, night: 0.3 });
        models.floodPool = { geometry, material: floodMaterial };
      }
    }
    return models;
  })().catch(() => null);
  return bridgeModels;
}

export const SEA_LEVEL = -0.3; // the water plane: the shallows (ground sloping to -1.5 beyond the coast) meet it a little out from the shore

export default function StreamedWorld({ base = '/world', profile = 'desktop', focus = null, skip = null, onReady = null, sea = true }) {
  const root = useRef(null);
  const camera = useThree((s) => s.camera);
  const materials = useMemo(() => createChunkMaterials(THREE), []);
  const state = useRef({ manager: null, objects: new Map(), last: null, velocity: { x: 0, z: 0 } });
  const water = useRef(null);
  const seaMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1f6a99', roughness: 0.22, metalness: 0.05, transparent: true, opacity: 0.88 }), []);

  useEffect(() => {
    let cancelled = false;
    const st = state.current;
    const objects = st.objects;
    const parent = root.current; // the group is attached before an effect runs
    (async () => {
      let baked;
      try {
        baked = await loadBakedWorld(async (name) => { const r = await fetch(`${base}/${name}`); if (!r.ok) throw new Error(`${name}: ${r.status}`); return r.json(); });
      } catch { return; } // no baked world here: draw nothing
      const models = await loadBridgeModels(); // null when they cannot be loaded: the bridges are then ribbons
      if (cancelled) return;
      // the manager only knows the chunks the caller has not skipped
      const known = skip ? { ...baked, manifest: { ...baked.manifest, chunks: baked.manifest.chunks.filter((c) => !skip(c)) } } : baked;
      st.manager = createChunkManager(known, {
        profile,
        onMount: (chunk) => {
          const group = buildChunkObject(THREE, chunk, materials, { models });
          objects.set(`${chunk.cx}_${chunk.cz}`, group);
          parent?.add(group);
          stats.mounts++; stats.mounted = objects.size; stats.triangles += group.userData.triangles; stats.drawCalls += group.children.length;
        },
        onUnmount: (key) => {
          const group = objects.get(key);
          if (!group) return;
          stats.triangles -= group.userData.triangles; stats.drawCalls -= group.children.length;
          parent?.remove(group);
          disposeChunkObject(group);
          objects.delete(key);
          stats.unmounts++; stats.mounted = objects.size;
        },
      });
      // the sea: one plane over the whole ocean of the world (the manifest's bounds, with a margin), under every chunk's shore
      if (sea && water.current) {
        const o = baked.manifest.ocean;
        water.current.scale.set(o.x1 - o.x0 + 4000, o.z1 - o.z0 + 4000, 1);
        water.current.position.set((o.x0 + o.x1) / 2, SEA_LEVEL, (o.z0 + o.z1) / 2);
        water.current.visible = true;
      }
      // the ground under things: the avatar and the vehicles ask it (lib/world/terrain.js) through setActiveTerrain, only while this layer is mounted
      const here = new Set(baked.manifest.chunks.map((c) => c.key));
      const o = baked.manifest.ocean;
      const terrain = createTerrain({
        chunkAt: (cx, cz) => st.manager?.chunk(`${cx}_${cz}`) ?? undefined,
        has: (cx, cz) => here.has(`${cx}_${cz}`),
        skipped: (cx, cz) => (skip ? skip({ cx, cz }) : false),
        bounds: { x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1 },
      });
      setActiveTerrain(terrain);
      stats.sample = (x, z) => terrain.sample(x, z);
      stats.describe = () => [...objects.entries()].map(([k, g]) => `${k}: ${g.children.map((m) => `${m.name.split(':')[1]}${m.isInstancedMesh ? `x${m.count}` : ''}`).join(',')}`); // for the tests and the dev page
      stats.bridgeModels = Boolean(models?.deck);
      stats.trackModels = Boolean(models?.props);
      stats.ready = true; stats.profile = profile;
      onReady?.(baked.manifest);
    })();
    return () => {
      cancelled = true;
      setActiveTerrain(null);
      for (const group of objects.values()) { parent?.remove(group); disposeChunkObject(group); }
      objects.clear();
      st.manager = null;
      stats.ready = false; stats.mounted = 0; stats.triangles = 0; stats.drawCalls = 0;
    };
  }, [base, profile, skip, materials, onReady, sea]);

  useFrame((_, delta) => {
    const m = state.current.manager;
    if (!m) return;
    const at = focus ? focus() : camera.position; // { x, z } or a Vector3: z is the ground z in both
    const prev = state.current.last;
    if (prev && delta > 0) state.current.velocity = { x: (at.x - prev.x) / delta, z: (at.z - prev.z) / delta };
    state.current.last = { x: at.x, z: at.z };
    stats.focus = { x: Math.round(at.x), z: Math.round(at.z) };
    m.focus(at.x, at.z, state.current.velocity.x, state.current.velocity.z);
    m.step().then(() => { stats.loads = m.stats().loads; });
  });

  useEffect(() => () => { materials.ground.dispose(); materials.roads.dispose(); materials.highways.dispose(); materials.track.dispose(); seaMaterial.dispose(); }, [materials, seaMaterial]);
  return (
    <group ref={root} name="streamed-world">
      <mesh ref={water} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={-1} material={seaMaterial} name="sea">
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  );
}
