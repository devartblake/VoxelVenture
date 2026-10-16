"use client";

import React from 'react';

export default function GroundGrid() {
  return (
    <group position={[0, -0.01, 0]}>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[240, 240]} />
        <meshStandardMaterial color="#090d16" roughness={1} />
      </mesh>
      <gridHelper args={[240, 120, '#1e293b', '#0f172a']} position={[0, 0.01, 0]} />
    </group>
  );
}