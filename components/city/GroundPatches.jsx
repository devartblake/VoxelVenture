"use client";

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { groundTexture } from './groundTextures';

const Y = 0.008; // above the land (0.004), below roads, lawns and shores (0.012 and up)
const KINDS = ['dirt', 'gravel', 'sand', 'dry', 'meadow', 'moss'];

// Patches of different ground in the open country: bare dirt, gravel, sand, dry grass, flowery meadow and moss.
// One instanced mesh per kind, so the whole lot is six draw calls. `patches` comes from generateCity():
// layout.landscape.patches, [{ x, z, w, d, kind }].
function Kind({ kind, patches }) {
  const ref = useRef(null);
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  const map = useMemo(() => groundTexture(kind), [kind]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    patches.forEach((p, i) => {
      m.makeScale(p.w, 1, p.d).setPosition(p.x, Y, p.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [patches]);
  if (!patches.length) return null;
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, patches.length]} receiveShadow frustumCulled={false}>
      <meshStandardMaterial map={map} roughness={1} />
    </instancedMesh>
  );
}

export default function GroundPatches({ patches }) {
  const byKind = useMemo(() => Object.fromEntries(KINDS.map((k) => [k, (patches ?? []).filter((p) => p.kind === k)])), [patches]);
  return (
    <group name="ground-patches">
      {KINDS.map((k) => (
        <Kind key={`${k}-${byKind[k].length}`} kind={k} patches={byKind[k]} />
      ))}
    </group>
  );
}
