"use client";

import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Crowns from '@/components/city/Crowns';
import { BACKS } from '@/lib/content/backyards';

// DEVELOPMENT TOOL: every back (the solid ones and the yards made of models) on its own mock lot, in a row, so the yards can be looked at: /dev/yards. ?back=<id> shows only that one, ?look=x,y,z moves
// the camera. Each lot is a plain box facing +z, so its yard is toward -z. The game draws them with the same Crowns layer.
const GAP = 5;
export default function YardsGallery() {
  const only = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('back') : null;
  const list = BACKS.filter((b) => b.id !== 'none' && (!only || b.id === only));
  const plots = useMemo(() => list.map((b, i) => ({ id: i + 1, owner: 'x', x: i * GAP, z: 0, w: 3, d: 3, facing: 1, yaw: 0, height: 1.8, buildingType: 'shop', exterior: { back: b.id, crown: 'none', crownColor: '#fbbf24' } })), [list]);
  const mid = ((list.length - 1) * GAP) / 2;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b1b33' }}>
      <div style={{ position: 'absolute', zIndex: 2, top: 6, left: 8, color: '#e2e8f0', font: '12px system-ui' }}>{list.map((b) => b.label).join(' · ')}</div>
      <Canvas camera={{ position: [mid, 5, -9], fov: 45 }} shadows>
        <color attach="background" args={['#9ec5e8']} />
        <hemisphereLight args={['#ffffff', '#6b7a5a', 0.9]} />
        <directionalLight position={[8, 14, -6]} intensity={2.2} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[mid, 0, 0]} receiveShadow><planeGeometry args={[list.length * GAP + 10, 30]} /><meshStandardMaterial color="#8fb16a" /></mesh>
        {plots.map((p) => <mesh key={p.id} position={[p.x, 0.9, 0]} castShadow><boxGeometry args={[3, 1.8, 3]} /><meshStandardMaterial color="#e5e7eb" /></mesh>)}
        <Crowns plots={plots} />
        <OrbitControls target={[mid, 0.3, -2.4]} />
      </Canvas>
    </div>
  );
}
