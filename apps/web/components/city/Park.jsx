"use client";

import React, { useMemo, useState } from 'react';
import Label3D from './Label3D';
import VoxLandmark from './VoxLandmark';
import { Woods } from './Farmland';
import { PARK_BENCH_OFFSETS, PARK_POND_RADIUS, parkHedges } from '@/lib/city/parkGeometry';

const GRASS_HEIGHT = 0.06;
const PATH_HEIGHT = 0.065;
const PATH_WIDTH = 0.8;
const HEDGE_HEIGHT = 0.22;

// `park` comes from generateCity(): center, width/depth, monument spot and a seeded list of trees.
// Click handlers sit on the outer group so clicks on trees, benches and landmarks count too.
// The hedge, pond and benches come from lib/city/parkGeometry.js, which the collision map also uses.
export default function Park({ park, isSelected, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const { center, width, depth, trees, monument, name } = park;
  const hedges = parkHedges(width, depth);
  const localTrees = useMemo(() => trees.map((t) => ({ ...t, x: t.x - center.x, z: t.z - center.z })), [trees, center.x, center.z]);

  const setHover = (value) => {
    setHovered(value);
    document.body.style.cursor = value ? 'pointer' : '';
  };

  return (
    <group
      position={[center.x, 0, center.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(park);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
    >
      {/* Lawn */}
      <mesh position={[0, GRASS_HEIGHT / 2, 0]} receiveShadow>
        <boxGeometry args={[width, GRASS_HEIGHT, depth]} />
        <meshStandardMaterial color={isSelected ? '#22c55e' : hovered ? '#15803d' : '#166534'} roughness={1} />
      </mesh>

      {/* Hedge border with a gate at each path entrance */}
      {hedges.map((h, i) => (
        <mesh key={i} position={[h.x, GRASS_HEIGHT + HEDGE_HEIGHT / 2, h.z]} castShadow>
          <boxGeometry args={[h.w, HEDGE_HEIGHT, h.d]} />
          <meshStandardMaterial color="#14532d" roughness={1} />
        </mesh>
      ))}

      {/* Cross paths */}
      <mesh position={[0, PATH_HEIGHT / 2 + 0.001, 0]} receiveShadow>
        <boxGeometry args={[width, PATH_HEIGHT, PATH_WIDTH]} />
        <meshStandardMaterial color="#d6d3d1" roughness={0.9} />
      </mesh>
      <mesh position={[0, PATH_HEIGHT / 2 + 0.001, 0]} receiveShadow>
        <boxGeometry args={[PATH_WIDTH, PATH_HEIGHT, depth]} />
        <meshStandardMaterial color="#d6d3d1" roughness={0.9} />
      </mesh>

      {/* Fountain: pond, stone basin, tier and water jet */}
      <mesh position={[0, PATH_HEIGHT + 0.01, 0]} receiveShadow>
        <cylinderGeometry args={[PARK_POND_RADIUS, PARK_POND_RADIUS, 0.04, 24]} />
        <meshStandardMaterial color="#38bdf8" roughness={0.2} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.17, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.38, 0.16, 16]} />
        <meshStandardMaterial color="#a8a29e" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.33, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.2, 0.16, 16]} />
        <meshStandardMaterial color="#a8a29e" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.03, 0.06, 0.2, 8]} />
        <meshStandardMaterial color="#bae6fd" emissive="#38bdf8" emissiveIntensity={0.6} transparent opacity={0.8} />
      </mesh>

      {/* Monument */}
      <group position={[monument.x - center.x, GRASS_HEIGHT, monument.z - center.z]}>
        <VoxLandmark
          name="monument"
          fallback={
            <>
              <mesh position={[0, 0.05, 0]} castShadow>
                <boxGeometry args={[0.42, 0.1, 0.42]} />
                <meshStandardMaterial color="#78716c" roughness={0.9} />
              </mesh>
              <mesh position={[0, 0.7, 0]} castShadow>
                <cylinderGeometry args={[0.07, 0.12, 1.2, 4]} />
                <meshStandardMaterial color="#d6d3d1" roughness={0.7} />
              </mesh>
              <mesh position={[0, 1.38, 0]} castShadow>
                <coneGeometry args={[0.07, 0.16, 4]} />
                <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.4} />
              </mesh>
            </>
          }
        />
      </group>

      {/* Benches */}
      {PARK_BENCH_OFFSETS.map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.16, z]} castShadow>
          <boxGeometry args={[0.5, 0.1, 0.18]} />
          <meshStandardMaterial color="#92400e" roughness={0.8} />
        </mesh>
      ))}

      {/* Trees: positions are world-space, so offset back into this group; one instanced mesh each for trunks and crowns */}
      <group position={[0, GRASS_HEIGHT, 0]}>
        <Woods trees={localTrees} park />
      </group>

      <Label3D text={name} position={[0, park.big ? 2.6 : 1.9, 0]} background="#10b981" color="#022c22" />
    </group>
  );
}
