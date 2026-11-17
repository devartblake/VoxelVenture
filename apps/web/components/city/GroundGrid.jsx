"use client";

import React from 'react';
import { RIVER_BED } from '@/lib/world/datum';

export default function GroundGrid() {
  return (
    // the dark backdrop under the town: below the river's bed (lib/world/datum.js RIVER_BED), or it would cover the trench the river runs in
    <group position={[0, RIVER_BED - 0.1, 0]}>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[240, 240]} />
        <meshStandardMaterial color="#090d16" roughness={1} />
      </mesh>
      <gridHelper args={[240, 120, '#1e293b', '#0f172a']} position={[0, 0.01, 0]} />
    </group>
  );
}