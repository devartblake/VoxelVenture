"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { loadBakedWorld } from '@/lib/world/bakedWorld';
import { createChunkManager } from '@/lib/world/chunkManager';
import { buildChunkObject, createChunkMaterials, disposeChunkObject } from '@/lib/world/chunkObject';

// The streaming runtime React layer (roadmap task 11, slice 3; docs/world/streaming_runtime.md). Mounts the baked chunks (public/world, scripts/bake-world.mjs) near the camera or a point the
// caller gives, and disposes the ones left behind, one chunk a frame. It owns no game state: with no `focus` it follows the camera, and `skip(chunk)` lets a caller leave out chunks it draws itself
// (the game leaves out the first town own land while that town is still drawn by the generator code). Nothing renders until the manifest has loaded; a missing world (no bake) renders nothing.
//   window.__vvStreamedWorld: { ready, mounted, mounts, unmounts, loads, triangles, drawCalls, profile, focus } for the tests and the dev page.
const stats = { ready: false, mounted: 0, mounts: 0, unmounts: 0, loads: 0, triangles: 0, drawCalls: 0, profile: '', focus: null };
if (typeof window !== 'undefined') window.__vvStreamedWorld = stats;

export default function StreamedWorld({ base = '/world', profile = 'desktop', focus = null, skip = null, onReady = null }) {
  const root = useRef(null);
  const camera = useThree((s) => s.camera);
  const materials = useMemo(() => createChunkMaterials(THREE), []);
  const state = useRef({ manager: null, objects: new Map(), last: null, velocity: { x: 0, z: 0 } });

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
      stats.ready = true; stats.profile = profile;
      onReady?.(baked.manifest);
    })();
    return () => {
      cancelled = true;
      for (const group of objects.values()) { parent?.remove(group); disposeChunkObject(group); }
      objects.clear();
      st.manager = null;
      stats.ready = false; stats.mounted = 0; stats.triangles = 0; stats.drawCalls = 0;
    };
  }, [base, profile, skip, materials, onReady]);

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

  useEffect(() => () => { materials.ground.dispose(); materials.roads.dispose(); materials.highways.dispose(); }, [materials]);
  return <group ref={root} name="streamed-world" />;
}
