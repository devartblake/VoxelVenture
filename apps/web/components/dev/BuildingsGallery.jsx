"use client";

import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Crowns from '@/components/city/Crowns';
import PropInstances, { usePropsReady } from '@/components/city/PropModels';
import { BUILD_PIECE_IDS } from '@/lib/content/modularBuild';
import { BUILD_STARTS, CORNERS, FRONTS, ROOFS, WINDOWS, startFor } from '@/lib/content/modularBuild';
import { buildingSize } from '@/lib/city/cityGenerator';

// DEVELOPMENT TOOL: the buildings designed from kit pieces (lib/content/modularBuild.js) on mock lots: /dev/buildings. ?set=starts shows the four business starts (default), ?set=fronts, ?set=windows,
// ?set=corners, ?set=roofs the options of one choice on a shop's start; ?floors=3 sets the floors. Each building is its box with the pieces over it, as in the game.
const GAP = 5;
export default function BuildingsGallery() {
  const ready = usePropsReady(BUILD_PIECE_IDS);
  const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const set = q.get('set') ?? 'starts';
  const floors = Number(q.get('floors')) || 2;
  const designs = useMemo(() => {
    const base = startFor('shop');
    if (set === 'fronts') return FRONTS.map((o) => ({ label: o.label, type: 'shop', build: { ...base, front: o.id } }));
    if (set === 'windows') return WINDOWS.map((o) => ({ label: o.label, type: 'shop', build: { ...base, windows: o.id } }));
    if (set === 'corners') return CORNERS.map((o) => ({ label: o.label, type: 'shop', build: { ...base, corners: o.id } }));
    if (set === 'roofs') return ROOFS.map((o) => ({ label: o.label, type: 'shop', build: { ...base, roof: o.id } }));
    if (set === 'pieces') return [];
    return Object.keys(BUILD_STARTS).map((t) => ({ label: t, type: t, build: startFor(t) }));
  }, [set]);
  const plots = useMemo(() => designs.map((d, i) => ({ id: i + 1, owner: 'x', x: i * GAP, z: 0, w: 3, d: 3, facing: 1, yaw: 0, height: floors * 1.2, buildingType: d.type, wallColor: '#d6c4a0', exterior: { floors, build: d.build, back: 'none', crown: 'none' } })), [designs, floors]);
  const mid = ((designs.length - 1) * GAP) / 2;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b1b33' }}>
      <div style={{ position: 'absolute', zIndex: 2, top: 6, left: 8, color: '#e2e8f0', font: '12px system-ui' }}>{designs.map((d) => d.label).join(' · ')}</div>
      <Canvas camera={{ position: [Number(q.get('cx') ?? mid), Number(q.get('cy') ?? 3.2), Number(q.get('cz') ?? 12)], fov: 32 }} shadows>
        <color attach="background" args={['#9ec5e8']} />
        <hemisphereLight args={['#ffffff', '#6b7a5a', 0.9]} />
        <directionalLight position={[8, 14, 6]} intensity={2.2} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[mid, 0, 0]} receiveShadow><planeGeometry args={[designs.length * GAP + 10, 30]} /><meshStandardMaterial color="#8fb16a" /></mesh>
        {plots.map((p) => { const { bw, bd } = buildingSize(p); return <mesh key={p.id} position={[p.x, p.height / 2 + 0.1, 0]} castShadow><boxGeometry args={[bw, p.height, bd]} /><meshStandardMaterial color="#d6c4a0" /></mesh>; })}
        <Crowns plots={plots} />
        {set === 'pieces' && ready && <PropInstances shadows={false} items={BUILD_PIECE_IDS.map((id, i) => ({ x: (i % 7) * 2.4 - 7, z: Math.floor(i / 7) * -3, y: 0.1, tint: [Number(q.get('b') ?? 1), Number(q.get('b') ?? 1), Number(q.get('b') ?? 1)], model: { id, scale: 0.5, rotY: Number(q.get('rot') ?? 0), offset: [0, 0, 0] } }))} />}
        <OrbitControls target={[Number(q.get('cx') ?? mid), 1, 0]} />
      </Canvas>
    </div>
  );
}
