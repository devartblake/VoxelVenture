"use client";

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { avatarState } from '@/lib/sim/avatarState';
import { dailyChest } from '@/lib/game/daily';
import { useCityStore } from '@/lib/state/store';

// Today's mystery chest. It sits on a sidewalk (a different spot every day) until it is opened,
// then is gone until tomorrow. Walk up to it and press E, or click it to walk there.
export default function DailyChest() {
  const day = useCityStore((s) => s.day);
  const collected = useCityStore((s) => s.daily.chestDay === s.day);
  const seed = useCityStore((s) => s.layout.seed);
  const intersections = useCityStore((s) => s.layout.intersections);
  const glow = useRef(null);
  const gem = useRef(null);

  const chest = useMemo(() => (day ? dailyChest(intersections, seed, day) : null), [day, seed, intersections]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (gem.current) {
      gem.current.rotation.y = t * 2;
      gem.current.position.y = 0.62 + Math.sin(t * 2.4) * 0.05;
    }
    if (glow.current) glow.current.material.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.3;
  });

  if (!chest || collected) return null;

  return (
    <group
      position={[chest.x, 0.08, chest.z]}
      onClick={(e) => {
        e.stopPropagation();
        avatarState.target = { x: chest.x, z: chest.z + 0.5 };
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <mesh position={[0, 0.14, 0]} castShadow>
        <boxGeometry args={[0.5, 0.28, 0.34]} />
        <meshStandardMaterial color="#92400e" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.32, 0]} castShadow>
        <boxGeometry args={[0.52, 0.1, 0.36]} />
        <meshStandardMaterial color="#b45309" roughness={0.7} />
      </mesh>
      <mesh ref={glow} position={[0, 0.2, 0.175]}>
        <boxGeometry args={[0.08, 0.1, 0.02]} />
        <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.8} />
      </mesh>
      {[-0.18, 0.18].map((x) => (
        <mesh key={x} position={[x, 0.18, 0]}>
          <boxGeometry args={[0.05, 0.4, 0.38]} />
          <meshStandardMaterial color="#facc15" roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
      <mesh ref={gem} position={[0, 0.62, 0]}>
        <octahedronGeometry args={[0.09]} />
        <meshStandardMaterial color="#fde047" emissive="#fde047" emissiveIntensity={1.5} />
      </mesh>
    </group>
  );
}
