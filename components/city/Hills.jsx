"use client";

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { hillHeight } from '@/lib/city/hills';

const STEP = 1.5; // size of a ground square: chunky, in keeping with the voxel look
const BASE_Y = 0.006; // just above the land (0.004), below roads and lawns

// The low hills in the north-east (layout.hills, see lib/city/hills.js): one mesh, flat-shaded, green with lighter grass towards the tops
// and a few rocky patches on the steepest slopes. Squares that are flat ground are left out, so the land shows through there.
export default function Hills({ hills }) {
  const geometry = useMemo(() => {
    if (!hills) return null;
    const { rect } = hills;
    const nx = Math.ceil((rect.x1 - rect.x0) / STEP);
    const nz = Math.ceil((rect.z1 - rect.z0) / STEP);
    const xAt = (i) => Math.min(rect.x0 + i * STEP, rect.x1);
    const zAt = (j) => Math.min(rect.z0 + j * STEP, rect.z1);
    const h = (i, j) => hillHeight(hills, xAt(i), zAt(j));
    const grid = Array.from({ length: nz + 1 }, (_, j) => Array.from({ length: nx + 1 }, (_, i) => h(i, j)));
    const positions = [];
    const colors = [];
    const low = new THREE.Color('#3f7d34');
    const high = new THREE.Color('#86a84f');
    const rock = new THREE.Color('#7b7a6e');
    const c = new THREE.Color();
    const push = (i, j) => {
      const y = grid[j][i];
      positions.push(xAt(i), BASE_Y + y, zAt(j));
      return y;
    };
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const corners = [grid[j][i], grid[j][i + 1], grid[j + 1][i], grid[j + 1][i + 1]];
        if (Math.max(...corners) < 0.01) continue;
        const mean = corners.reduce((a, b) => a + b, 0) / 4;
        const slope = Math.max(...corners) - Math.min(...corners);
        c.copy(low).lerp(high, Math.min(1, mean / 1.6));
        if (slope > 0.5) c.lerp(rock, Math.min(0.7, (slope - 0.5) * 1.4)); // rock shows on the steep bits
        const tint = 0.94 + (((i * 73856093) ^ (j * 19349663)) % 100) / 1000; // a little variation square to square
        c.multiplyScalar(tint);
        // two triangles per square, counter-clockwise seen from above
        const tri = [[i, j], [i, j + 1], [i + 1, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
        for (const [ii, jj] of tri) {
          push(ii, jj);
          colors.push(c.r, c.g, c.b);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [hills]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} name="hills" castShadow receiveShadow frustumCulled={false}>
      <meshStandardMaterial vertexColors flatShading roughness={1} />
    </mesh>
  );
}
