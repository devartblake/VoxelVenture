"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { loadBakedWorld } from '@/lib/world/bakedWorld';
import { createChunkManager } from '@/lib/world/chunkManager';
import { buildChunkObject, createChunkMaterials, disposeChunkObject } from '@/lib/world/chunkObject';
import { createTerrain, setActiveTerrain } from '@/lib/world/terrain';

// The streaming runtime React layer (roadmap task 11, slice 3; docs/world/streaming_runtime.md). Mounts the baked chunks (public/world, scripts/bake-world.mjs) near the camera or a point the
// caller gives, and disposes the ones left behind, one chunk a frame. It owns no game state: with no `focus` it follows the camera, and `skip(chunk)` lets a caller leave out chunks it draws itself
// (the game leaves out the first town own land while that town is still drawn by the generator code). Nothing renders until the manifest has loaded; a missing world (no bake) renders nothing.
//   window.__vvStreamedWorld: { ready, mounted, mounts, unmounts, loads, triangles, drawCalls, profile, focus } for the tests and the dev page.
const stats = { ready: false, mounted: 0, mounts: 0, unmounts: 0, loads: 0, triangles: 0, drawCalls: 0, profile: '', focus: null };
if (typeof window !== 'undefined') window.__vvStreamedWorld = stats;

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
      if (cancelled) return;
      // the manager only knows the chunks the caller has not skipped
      const known = skip ? { ...baked, manifest: { ...baked.manifest, chunks: baked.manifest.chunks.filter((c) => !skip(c)) } } : baked;
      st.manager = createChunkManager(known, {
        profile,
        onMount: (chunk) => {
          const group = buildChunkObject(THREE, chunk, materials);
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

  useEffect(() => () => { materials.ground.dispose(); materials.roads.dispose(); materials.highways.dispose(); seaMaterial.dispose(); }, [materials, seaMaterial]);
  return (
    <group ref={root} name="streamed-world">
      <mesh ref={water} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={-1} material={seaMaterial} name="sea">
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  );
}
