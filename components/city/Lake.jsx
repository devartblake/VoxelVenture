"use client";

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { hashString } from '@/lib/game/daily';
import Label3D from './Label3D';

const TREE_COLORS = ['#15803d', '#16a34a', '#22c55e', '#4d7c0f'];

// A pond or lake: an oval of water with a sandy shore and a ring of trees. `lake` comes from
// generateCity(): { x, z, rx, rz, yaw, name }. The avatar cannot walk on it (see lib/sim/collision.js).
export default function Lake({ lake }) {
  const { x, z, rx, rz, yaw, name, id } = lake;
  const rect = lake.shape === 'rect';
  const water = useRef(null);

  // Trees round the shore, placed deterministically from the lake's id. A rectangular lake is ringed by a
  // road about 3 units beyond its shore, so its trees stand in the strip between water and road.
  const trees = useMemo(() => {
    const out = [];
    const count = rect ? Math.round(rx + rz) : Math.round(8 + (rx + rz) / 2);
    for (let i = 0; i < count; i++) {
      const h = hashString(`${id}-${i}`);
      const size = 0.45 + ((h >> 16) % 100) / 100 * 0.35;
      let tx;
      let tz;
      if (rect) {
        // walk the perimeter: trees at even steps, a little way off the water's edge
        const gap = 1.5 + ((h >> 8) % 100) / 100 * 0.7;
        const w = rx + gap;
        const d = rz + gap;
        let t = ((i + ((h % 100) / 100 - 0.5) * 0.4) / count) * 4 * (w + d);
        const along = [2 * w, 2 * d, 2 * w, 2 * d];
        let side = 0;
        while (side < 3 && t > along[side]) {
          t -= along[side];
          side++;
        }
        if (side === 0) [tx, tz] = [-w + t, -d];
        else if (side === 1) [tx, tz] = [w, -d + t];
        else if (side === 2) [tx, tz] = [w - t, d];
        else [tx, tz] = [-w, d - t];
      } else {
        const angle = (i / count) * Math.PI * 2 + ((h % 100) / 100 - 0.5) * 0.35;
        const reach = 1.8 + ((h >> 8) % 100) / 100 * 2.2; // distance beyond the shore
        tx = Math.cos(angle) * (rx + reach);
        tz = Math.sin(angle) * (rz + reach);
      }
      out.push({ x: tx, z: tz, size, trunk: 0.4 + size * 0.5, color: TREE_COLORS[h % TREE_COLORS.length] });
    }
    return out;
  }, [id, rx, rz, rect]);

  useFrame(({ clock }) => {
    if (water.current) water.current.material.emissiveIntensity = 0.18 + Math.sin(clock.elapsedTime * 1.3 + x) * 0.07;
  });

  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      {/* sandy shore */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} scale={rect ? [1, 1, 1] : [rx + 0.9, rz + 0.9, 1]} receiveShadow>
        {rect ? <planeGeometry args={[(rx + 0.9) * 2, (rz + 0.9) * 2]} /> : <circleGeometry args={[1, 40]} />}
        <meshStandardMaterial color="#d6c7a1" roughness={1} />
      </mesh>
      {/* water */}
      <mesh ref={water} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.026, 0]} scale={rect ? [1, 1, 1] : [rx, rz, 1]} receiveShadow>
        {rect ? <planeGeometry args={[rx * 2, rz * 2]} /> : <circleGeometry args={[1, 40]} />}
        <meshStandardMaterial color="#2563eb" emissive="#38bdf8" emissiveIntensity={0.18} roughness={0.7} metalness={0} />
      </mesh>
      {/* a lighter ripple in the middle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} scale={[rx * 0.55, rz * 0.55, 1]}>
        <ringGeometry args={[0.9, 1, 32]} />
        <meshBasicMaterial color="#bae6fd" transparent opacity={0.35} />
      </mesh>

      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          <mesh position={[0, t.trunk / 2, 0]} castShadow>
            <boxGeometry args={[0.14, t.trunk, 0.14]} />
            <meshStandardMaterial color="#78350f" roughness={0.9} />
          </mesh>
          <mesh position={[0, t.trunk + t.size / 2 - 0.05, 0]} castShadow>
            <boxGeometry args={[t.size, t.size, t.size]} />
            <meshStandardMaterial color={t.color} roughness={0.8} />
          </mesh>
        </group>
      ))}

      {/* the label stays upright whatever way the lake is turned */}
      <group rotation={[0, -yaw, 0]}>
        <Label3D text={name} position={[0, 0.7, 0]} background="#0c4a6e" color="#e0f2fe" border="#38bdf8" height={0.8} />
      </group>
    </group>
  );
}
