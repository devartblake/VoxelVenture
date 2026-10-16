"use client";

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { avatarState } from '@/lib/sim/avatarState';
import { scavengerHunt } from '@/lib/game/daily';
import { useCityStore } from '@/lib/state/store';

// Today's three hidden gold stars (see scavengerHunt in lib/game/daily.js). A star spins and bobs until you collect
// it; click one to walk to it, then press E (or tap the button).
function Star({ spot }) {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 2.2;
    ref.current.position.y = 0.55 + Math.sin(clock.elapsedTime * 2.6 + spot.index) * 0.06;
  });
  return (
    <group
      position={[spot.x, 0.05, spot.z]}
      onClick={(e) => {
        e.stopPropagation();
        avatarState.target = { x: spot.x, z: spot.z + 0.4 };
      }}
    >
      <mesh ref={ref} castShadow>
        <octahedronGeometry args={[0.2]} />
        <meshStandardMaterial color="#fde047" emissive="#facc15" emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.28, 0.4, 24]} />
        <meshBasicMaterial color="#fde047" transparent opacity={0.45} />
      </mesh>
    </group>
  );
}

export default function ScavengerStars() {
  const day = useCityStore((s) => s.day);
  const layout = useCityStore((s) => s.layout);
  const plots = useCityStore((s) => s.plots);
  const found = useCityStore((s) => (s.daily.huntDay === s.day ? s.daily.huntFound : null));
  const spots = useMemo(() => (day ? scavengerHunt(layout, plots, layout.seed, day) : []), [day, layout, plots]);
  return spots.filter((s) => !found?.includes(s.index)).map((s) => <Star key={s.index} spot={s} />);
}
