"use client";

import React from 'react';
import StaticBatch from './StaticBatch';
import { lampHeadMaterial } from './nightLights';

// The riverwalk (lib/city/promenade.js): a paved walking area between the river drive and the water, with benches facing the river and lamp posts along the
// drive side. The paving is a little above the grass and the sandy bank (so it does not flicker against them); the benches and lamp posts are solid
// (lib/sim/collision.js). Everything stands still, so it is baked into a few meshes.
const PAVE_Y = 0.02;

function Bench({ b }) {
  return (
    <group position={[b.x, 0, b.z]} rotation={[0, b.yaw, 0]}>
      <mesh position={[0, 0.2, 0]} castShadow><boxGeometry args={[1, 0.06, 0.38]} /><meshStandardMaterial color="#a16207" roughness={0.9} /></mesh>
      <mesh position={[0, 0.38, -0.17]} castShadow><boxGeometry args={[1, 0.28, 0.05]} /><meshStandardMaterial color="#a16207" roughness={0.9} /></mesh>
      {[-0.42, 0.42].map((x) => <mesh key={x} position={[x, 0.1, 0]}><boxGeometry args={[0.06, 0.2, 0.34]} /><meshStandardMaterial color="#475569" roughness={0.6} /></mesh>)}
    </group>
  );
}

function Lamp({ l }) {
  return (
    <group position={[l.x, 0, l.z]}>
      <mesh position={[0, 0.5, 0]} castShadow><cylinderGeometry args={[0.03, 0.045, 1, 6]} /><meshStandardMaterial color="#334155" roughness={0.6} /></mesh>
      <mesh position={[0, 1.04, 0]}><sphereGeometry args={[0.1, 8, 6]} /><primitive object={lampHeadMaterial} attach="material" /></mesh>
    </group>
  );
}

export default function Promenade({ promenades }) {
  if (!promenades?.length) return null;
  const key = promenades.map((w) => w.id).join(',');
  return (
    <StaticBatch key={key} name="promenade" castShadow>
      {promenades.map((w) => (
        <group key={w.id}>
          <mesh position={[(w.rect.x0 + w.rect.x1) / 2, PAVE_Y, (w.rect.z0 + w.rect.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[w.rect.x1 - w.rect.x0, w.rect.z1 - w.rect.z0]} />
            <meshStandardMaterial color="#d8d2c4" roughness={0.95} />
          </mesh>
          {w.benches.map((b, i) => <Bench key={`b${i}`} b={b} />)}
          {w.lamps.map((l, i) => <Lamp key={`l${i}`} l={l} />)}
        </group>
      ))}
    </StaticBatch>
  );
}
