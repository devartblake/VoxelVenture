"use client";

import React, { useRef } from 'react';
import { LOOPS } from '@/lib/performance/visibilityPolicy';
import { useGatedFrame } from '@/lib/performance/runtime';

const BANK = 1.2; // sandy bank beyond the water on each side
const WATER_Y = 0.026;
const DECK_HALF_WIDTH = 1.45;

// A river that runs wall to wall across the land (see layout.rivers), with a bridge wherever a road
// crosses it (layout.bridges). The road itself is drawn by <Road>; the bridge adds the parapets and the
// piers so the road reads as crossing over water. `river` is { axis, x0, x1, z0, z1, name }.
export default function River({ river, bridges }) {
  const water = useRef(null);
  const { axis, x0, x1, z0, z1 } = river;
  const alongZ = axis === 'z';
  const width = alongZ ? x1 - x0 : z1 - z0;
  const length = alongZ ? z1 - z0 : x1 - x0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;

  useGatedFrame(LOOPS.ornament, ({ clock }) => {
    if (water.current) water.current.material.emissiveIntensity = 0.16 + Math.sin(clock.elapsedTime * 1.1) * 0.06;
  });

  return (
    <group>
      {/* banks */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.012, cz]} receiveShadow>
        <planeGeometry args={alongZ ? [width + BANK * 2, length] : [length, width + BANK * 2]} />
        <meshStandardMaterial color="#d6c7a1" roughness={1} />
      </mesh>
      {/* water */}
      <mesh ref={water} rotation={[-Math.PI / 2, 0, 0]} position={[cx, WATER_Y, cz]}>
        <planeGeometry args={alongZ ? [width, length] : [length, width]} />
        <meshStandardMaterial color="#2563eb" emissive="#38bdf8" emissiveIntensity={0.16} roughness={0.7} metalness={0} />
      </mesh>

      {bridges.map((b) => {
        const span = b.u1 - b.u0 + 1.2; // a little onto the banks at each end
        const mid = (b.u0 + b.u1) / 2;
        const onX = b.axis === 'x'; // the road runs along X
        const at = (u, y, v) => (onX ? [u, y, b.center + v] : [b.center + v, y, u]);
        const box = (len, h, wide) => (onX ? [len, h, wide] : [wide, h, len]);
        return (
          <group key={b.id}>
            {/* the pier: a slab under the road, standing in the water */}
            {/* (its top is below the road's surface, 0.03: level with it, the two fought and flickered) */}
            <mesh position={at(mid, -0.3, 0)}>
              <boxGeometry args={box(span, 0.46, DECK_HALF_WIDTH * 2)} />
              <meshStandardMaterial color="#64748b" roughness={0.9} />
            </mesh>
            {/* parapets along both edges, with a post at each end */}
            {[-1, 1].map((side) => (
              <group key={side}>
                <mesh position={at(mid, 0.2, side * (DECK_HALF_WIDTH - 0.05))} castShadow>
                  <boxGeometry args={box(span, 0.2, 0.1)} />
                  <meshStandardMaterial color="#94a3b8" roughness={0.7} />
                </mesh>
                {[b.u0 - 0.5, b.u1 + 0.5].map((u) => (
                  <mesh key={u} position={at(u, 0.22, side * (DECK_HALF_WIDTH - 0.05))} castShadow>
                    <boxGeometry args={box(0.16, 0.28, 0.16)} />
                    <meshStandardMaterial color="#cbd5e1" roughness={0.7} />
                  </mesh>
                ))}
              </group>
            ))}
          </group>
        );
      })}
    </group>
  );
}
