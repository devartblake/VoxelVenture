"use client";

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const colorKey = (c) => (c ? c.getHexString() : '-');

// Meshes that look the same (same material settings) can be drawn as one. The key says when they do.
function materialKey(m) {
  return [
    m.type, colorKey(m.color), colorKey(m.emissive), m.emissiveIntensity, m.roughness, m.metalness, m.opacity, m.transparent,
    m.side, m.map ? m.map.uuid : '-', m.alphaTest, m.wireframe, m.flatShading,
  ].join('|');
}

// Bakes everything static inside it into a handful of merged meshes.
//
// A road, a junction or a crossing is dozens of small meshes (sidewalks, dashes, lamps, zebra stripes), and
// the browser pays a draw call for each. Once the children have mounted, this walks them, merges the
// ones that share a material into one mesh each, and hides the originals. The originals stay in the
// React tree (so unmounting and re-rendering work as usual); only what is drawn changes.
//
//   - Meshes with `userData.keep` (anything that animates, such as the traffic-light lamps) are left alone.
//   - Sprites, instanced meshes and meshes with several materials are left alone.
//   - Merged meshes do not cast shadows (lamp posts and signs are too small for it to matter); they still
//     receive them. Pass `castShadow` to keep shadows.
//   - It reads the children once. Remount it (change its `key`) when what is inside changes, such as when
//     the city is regenerated.
export default function StaticBatch({ children, name, castShadow = false }) {
  const group = useRef(null);

  useEffect(() => {
    const root = group.current;
    if (!root) return undefined;
    root.updateWorldMatrix(true, true);
    const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const buckets = new Map();
    const hidden = [];

    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.keep || !o.visible) return;
      if (Array.isArray(o.material) || !o.geometry?.attributes?.position) return;
      const g = o.geometry;
      const attrs = Object.keys(g.attributes).sort().join(',');
      const key = `${materialKey(o.material)}#${attrs}#${g.index ? 'i' : 'n'}#${o.receiveShadow ? 'r' : '-'}`;
      let bucket = buckets.get(key);
      if (!bucket) buckets.set(key, (bucket = { material: o.material, receiveShadow: o.receiveShadow, geometries: [] }));
      const baked = g.clone();
      baked.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, o.matrixWorld));
      bucket.geometries.push(baked);
      hidden.push(o);
    });

    const merged = [];
    for (const bucket of buckets.values()) {
      const geometry = bucket.geometries.length === 1 ? bucket.geometries[0] : mergeGeometries(bucket.geometries, false);
      if (!geometry) continue;
      if (bucket.geometries.length > 1) for (const g of bucket.geometries) g.dispose();
      const mesh = new THREE.Mesh(geometry, bucket.material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      mesh.matrixAutoUpdate = false; // it never moves
      mesh.userData.batched = true;
      mesh.raycast = () => {}; // nothing in here is clickable
      root.add(mesh);
      merged.push(mesh);
    }
    for (const o of hidden) o.visible = false;

    return () => {
      for (const o of hidden) o.visible = true;
      for (const m of merged) {
        root.remove(m);
        m.geometry.dispose();
      }
    };
  }, [castShadow]);

  return (
    <group ref={group} name={name}>
      {children}
    </group>
  );
}
