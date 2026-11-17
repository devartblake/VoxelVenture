"use client";

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { groundTexture } from './groundTextures';

import { TOWN_GROUND_TOP } from '@/lib/world/datum';
import { cutLand } from '@/lib/world/townWater';
const THICKNESS = 0.6;
const TOP_Y = TOWN_GROUND_TOP; // just above the dark backdrop grid, below every road, lawn and shore (lib/world/datum.js)

// The ground the city stands on: a grass-green slab with a soil edge, so the city, its water and the
// open country between read as one piece of land with a clear boundary, rather than floating in the void.
// The built-up part sits on a paved slate base, so the line between city and country shows on the ground.
// `land` and `urban` come from generateCity(): { x0, x1, z0, z1 }. The river runs in a trench through all of it (lib/world/townWater.js, River.jsx): the slab, the slate and the lawns are
// cut round the river's water, so the water is below the ground and joins the baked river and the sea.

const SIDE = '#4a3a24';
const FACES = [SIDE, SIDE, '#ffffff', '#2a2118', SIDE, SIDE]; // three.js box faces: +x, -x, +y (top), -y, +z, -z

// one piece of the slab: speckled grass on its top, a tile of texture about every 6 units
function SlabPiece({ rect }) {
  const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
  const grass = useMemo(() => groundTexture('grass', { repeat: [Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(d / 6))] }), [w, d]);
  return (
    <mesh position={[(rect.x0 + rect.x1) / 2, TOP_Y - THICKNESS / 2, (rect.z0 + rect.z1) / 2]} receiveShadow>
      <boxGeometry args={[w, THICKNESS, d]} />
      {FACES.map((color, i) => (
        <meshStandardMaterial key={i} attach={`material-${i}`} color={color} map={i === 2 ? grass : null} roughness={1} />
      ))}
    </mesh>
  );
}

// one piece of the built-up part: rough slate under it
function UrbanPiece({ rect }) {
  const slate = useMemo(() => groundTexture('slate', { repeat: [Math.max(1, Math.round((rect.x1 - rect.x0) / 6)), Math.max(1, Math.round((rect.z1 - rect.z0) / 6))] }), [rect.x0, rect.x1, rect.z0, rect.z1]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(rect.x0 + rect.x1) / 2, TOP_Y + 0.003, (rect.z0 + rect.z1) / 2]} receiveShadow>
      <planeGeometry args={[rect.x1 - rect.x0, rect.z1 - rect.z0]} />
      <meshStandardMaterial color="#ffffff" map={slate} roughness={1} />
    </mesh>
  );
}

export default function Land({ land, urban, lawns, rivers }) {
  const cut = useMemo(() => cutLand({ land, urban, lawns, rivers }), [land, urban, lawns, rivers]);
  // the free ground inside the built-up area, drawn as grass over the slate: one mesh, with the grass texture laid out by world position (a tile every 6 units, like the land's)
  const lawnGrass = useMemo(() => groundTexture('grass', { repeat: [1, 1] }), []);
  const lawnGeometry = useMemo(() => {
    const list = cut.lawns;
    if (!list.length) return null;
    const pos = new Float32Array(list.length * 12);
    const uv = new Float32Array(list.length * 8);
    const idx = new Uint32Array(list.length * 6);
    list.forEach((r, k) => {
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
  }, [cut]);
  return (
    <group>
      {cut.slab.map((r, i) => <SlabPiece key={`s${i}`} rect={r} />)}
      {lawnGeometry && (
        <mesh geometry={lawnGeometry} position={[0, TOP_Y + 0.006, 0]} receiveShadow>
          <meshStandardMaterial color="#ffffff" map={lawnGrass} roughness={1} />
        </mesh>
      )}
      {cut.urban.map((r, i) => <UrbanPiece key={`u${i}`} rect={r} />)}
    </group>
  );
}
