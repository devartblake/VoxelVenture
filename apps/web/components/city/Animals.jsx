"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ANIMAL_CATALOG } from '@/lib/content/animalCatalog';
import { parseVox, voxelMesh } from '@/lib/content/vox';
import { createAnimals } from '@/lib/sim/animals';

// The countryside animals (lib/sim/animals.js) drawn as voxel models (apps/web/public/models/vox/animals/*.vox): one instanced mesh per kind, so about a hundred and
// fifty animals cost ten draw calls. They wander in their meadows, woods, hills and waters; grazing ones lower their heads, birds flap as they circle.
// Until a model has loaded (or if it cannot) that kind is simply not drawn.
const byId = new Map(ANIMAL_CATALOG.map((m) => [m.id, m]));
const cache = new Map();
const load = (kind) => {
  if (!cache.has(kind)) {
    const m = byId.get(kind);
    cache.set(
      kind,
      fetch(m.url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${m.url}: ${r.status}`))))
        .then((buf) => {
          const mesh = voxelMesh(parseVox(new Uint8Array(buf)), m.unit);
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
          g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
          g.setAttribute('color', new THREE.Float32BufferAttribute(mesh.colors, 3));
          g.setIndex(mesh.indices);
          g.computeBoundingSphere();
          return g;
        })
    );
  }
  return cache.get(kind);
};

const dummy = new THREE.Object3D();
dummy.rotation.order = 'YZX';
const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });

export default function Animals({ layout }) {
  const sim = useMemo(() => (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('animals') === '0' ? null : createAnimals(layout)), [layout]);
  if (typeof window !== 'undefined') window.__vvAnimals = sim; // for the tests and the browser console
  const kinds = useMemo(() => {
    const out = new Map();
    for (const a of sim?.animals ?? []) out.set(a.kind, [...(out.get(a.kind) ?? []), a]);
    return [...out.entries()];
  }, [sim]);
  const [geoms, setGeoms] = useState({});
  useEffect(() => {
    let live = true;
    for (const [kind] of kinds) load(kind).then((g) => live && setGeoms((s) => (s[kind] ? s : { ...s, [kind]: g })), () => {});
    return () => {
      live = false;
    };
  }, [kinds]);
  const refs = useRef({});

  useFrame((state, delta) => {
    if (!sim) return;
    sim.update(delta, state.clock.elapsedTime);
    const t = state.clock.elapsedTime;
    for (const [kind, list] of kinds) {
      const mesh = refs.current[kind];
      if (!mesh) continue;
      list.forEach((a, i) => {
        const walking = !a.grazing && a.mode !== 'air';
        const bob = walking ? Math.sin(t * 9 + a.phase) * 0.012 : 0;
        const pitch = a.mode === 'air' ? 0 : a.grazing && a.kind !== 'duck' && a.kind !== 'bird' ? -0.22 : 0; // head down to graze
        dummy.position.set(a.x, a.y + bob, a.z);
        dummy.rotation.set(a.mode === 'air' ? Math.sin(t * 3 + a.phase) * 0.15 : walking ? Math.sin(t * 9 + a.phase) * 0.04 : 0, a.yaw, pitch);
        // birds flap by squashing the spread of their wings
        const flap = a.mode === 'air' ? 0.45 + 0.55 * Math.abs(Math.sin(t * 12 + a.phase)) : 1;
        dummy.scale.set(1, 1, flap);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  if (!sim) return null;
  return (
    <group name="animals">
      {kinds.map(([kind, list]) =>
        geoms[kind] ? (
          <instancedMesh
            key={kind}
            ref={(m) => {
              refs.current[kind] = m;
            }}
            args={[geoms[kind], material, list.length]}
            castShadow
            frustumCulled={false}
          />
        ) : null
      )}
    </group>
  );
}
