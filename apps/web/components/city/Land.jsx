"use client";

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { groundTexture } from './groundTextures';

const THICKNESS = 0.6;
const TOP_Y = 0.004; // just above the dark backdrop grid, below every road, lawn and shore

// The ground the city stands on: a grass-green slab with a soil edge, so the city, its water and the
// open country between read as one piece of land with a clear boundary, rather than floating in the void.
// The built-up part sits on a paved slate base, so the line between city and country shows on the ground.
// `land` and `urban` come from generateCity(): { x0, x1, z0, z1 }.
export default function Land({ land, urban, lawns }) {
  const w = land.x1 - land.x0;
  const d = land.z1 - land.z0;
  // speckled grass over the whole land, rough slate under the built-up part (one tile of texture about every 6 units)
  const grass = useMemo(() => groundTexture('grass', { repeat: [Math.round(w / 6), Math.round(d / 6)] }), [w, d]);
  const slate = useMemo(() => (urban ? groundTexture('slate', { repeat: [Math.round((urban.x1 - urban.x0) / 6), Math.round((urban.z1 - urban.z0) / 6)] }) : null), [urban]);
  // the free ground inside the built-up area, drawn as grass over the slate: one mesh, with the grass texture laid out by world position (a tile every 6 units, like the land's)
  const lawnGrass = useMemo(() => groundTexture('grass', { repeat: [1, 1] }), []);
  const lawnGeometry = useMemo(() => {
    if (!lawns?.length) return null;
    const pos = new Float32Array(lawns.length * 12);
    const uv = new Float32Array(lawns.length * 8);
    const idx = new Uint32Array(lawns.length * 6);
    lawns.forEach((r, k) => {
      const c = [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];
      c.forEach(([x, z], v) => {
        pos.set([x, 0, z], k * 12 + v * 3);
        uv.set([x / 6, z / 6], k * 8 + v * 2);
      });
      idx.set([k * 4, k * 4 + 2, k * 4 + 1, k * 4, k * 4 + 3, k * 4 + 2], k * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    return g;
  }, [lawns]);
  return (
    <group>
      <mesh position={[(land.x0 + land.x1) / 2, TOP_Y - THICKNESS / 2, (land.z0 + land.z1) / 2]} receiveShadow>
        <boxGeometry args={[w, THICKNESS, d]} />
        {/* three.js box faces: +x, -x, +y (top), -y, +z, -z */}
        {['#4a3a24', '#4a3a24', '#ffffff', '#2a2118', '#4a3a24', '#4a3a24'].map((color, i) => (
          <meshStandardMaterial key={i} attach={`material-${i}`} color={color} map={i === 2 ? grass : null} roughness={1} />
        ))}
      </mesh>
      {lawnGeometry && (
        <mesh geometry={lawnGeometry} position={[0, TOP_Y + 0.006, 0]} receiveShadow>
          <meshStandardMaterial color="#ffffff" map={lawnGrass} roughness={1} />
        </mesh>
      )}
      {urban && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(urban.x0 + urban.x1) / 2, TOP_Y + 0.003, (urban.z0 + urban.z1) / 2]} receiveShadow>
          <planeGeometry args={[urban.x1 - urban.x0, urban.z1 - urban.z0]} />
          <meshStandardMaterial color="#ffffff" map={slate} roughness={1} />
        </mesh>
      )}
    </group>
  );
}
