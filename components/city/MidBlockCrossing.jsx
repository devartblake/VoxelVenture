"use client";

import React from 'react';
import { ZebraCrossing } from './RoadMarkings';

const SIDEWALK_HEIGHT = 0.08;
const SIDEWALK_OFFSET = 1.1; // middle of the sidewalk, from the road's center line

// Blue square "pedestrian crossing" sign, facing along the road toward oncoming cars.
function PedestrianSign({ side, yaw }) {
  return (
    <group position={[0, SIDEWALK_HEIGHT, side * SIDEWALK_OFFSET]} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.7, 8]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.78, 0.03]} castShadow>
        <boxGeometry args={[0.3, 0.3, 0.02]} />
        <meshStandardMaterial color="#2563eb" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.78, 0.045]}>
        <boxGeometry args={[0.16, 0.16, 0.005]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
    </group>
  );
}

// `crossing` comes from generateCity(): { x, z, axis }. Only avenues (axis 'x') get mid-block crossings.
export default function MidBlockCrossing({ crossing }) {
  const { x, z } = crossing;
  return (
    <group position={[x, 0, z]}>
      <ZebraCrossing position={[0, 0]} carsAlongX />
      {/* One sign per sidewalk, each facing the traffic that drives toward it */}
      <PedestrianSign side={1} yaw={-Math.PI / 2} />
      <PedestrianSign side={-1} yaw={Math.PI / 2} />
    </group>
  );
}
