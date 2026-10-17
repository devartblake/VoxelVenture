"use client";

import React, { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { parseVox, voxelMesh } from '@/lib/content/vox';

// A landmark made in MagicaVoxel: loads apps/web/public/models/vox/<name>.vox and draws it. While it loads, or if the file is missing or not a
// valid .vox, `fallback` (the procedural version) is drawn instead, so nothing is ever missing. `unit` is one voxel's size; or give `fit`
// ([width, height, depth] in game units) to stretch the model to a building's size, whatever size it was modelled at.
const cache = new Map();
const load = (url) => {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${url}: ${r.status}`))))
        .then((buf) => voxelMesh(parseVox(new Uint8Array(buf)), 1))
    );
  }
  return cache.get(url);
};

export default function VoxLandmark({ name, unit = 0.05, fit = null, fallback = null, ...props }) {
  const [mesh, setMesh] = useState(null);
  useEffect(() => {
    let live = true;
    load(`/models/vox/${name}.vox`).then((m) => live && setMesh(m), () => cache.delete(`/models/vox/${name}.vox`));
    return () => { live = false; };
  }, [name]);
  const geometry = useMemo(() => {
    if (!mesh) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(mesh.colors, 3));
    g.setIndex(mesh.indices);
    return g;
  }, [mesh]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return fallback;
  let scale = unit;
  if (fit) {
    geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    scale = [fit[0] / size.x, fit[1] / size.y, fit[2] / size.z];
  }
  return (
    <mesh geometry={geometry} scale={scale} castShadow receiveShadow {...props}>
      <meshStandardMaterial vertexColors roughness={0.85} />
    </mesh>
  );
}
