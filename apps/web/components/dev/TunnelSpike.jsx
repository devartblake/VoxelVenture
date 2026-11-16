"use client";

import React, { useEffect, useState } from 'react';
import { TRAIN, pointAt, trainLine } from '@/lib/world/train';

// DEVELOPMENT SPIKE (docs/world/tunnel_evaluation.md): a plain tube under the sea beside the Harbor Causeway, to see it from above through the water and from inside. /world/stream?tunnel=1. Not part of the game.
const FLOOR = -5.5, ROOF = -1.0, WIDTH = 6.4, SIDE = -3.6; // the tube: floor and roof heights, inside width, and its distance from the causeway's centre line (the train's rail is on the other side)
export default function TunnelSpike() {
  const [line, setLine] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch('/world/manifest.json').then((r) => r.json()).then((m) => { if (alive && m.causeways?.length) setLine(trainLine(m.causeways[0])); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!line) return null;
  const from = line.sA - 40, to = line.sB + 40, len = to - from, mid = pointAt(line, (from + to) / 2, -TRAIN.lateral + SIDE); // (pointAt adds the rail's lateral: take it off, then the tube's own)
  const h = ROOF - FLOOR, wall = 0.4;
  const strips = Math.floor(len / 8);
  return (
    <group name="tunnel-spike" position={[mid.x, 0, mid.z]} rotation={[0, line.yaw, 0]}>
      <mesh position={[0, FLOOR - 0.2, 0]}><boxGeometry args={[WIDTH + wall * 2, 0.4, len]} /><meshStandardMaterial color="#475569" roughness={0.9} side={2} /></mesh>
      <mesh position={[0, ROOF + 0.2, 0]}><boxGeometry args={[WIDTH + wall * 2, 0.4, len]} /><meshStandardMaterial color="#64748b" roughness={0.9} side={2} /></mesh>
      {[-1, 1].map((k) => <mesh key={k} position={[k * (WIDTH / 2 + wall / 2), (FLOOR + ROOF) / 2, 0]}><boxGeometry args={[wall, h + 0.8, len]} /><meshStandardMaterial color="#94a3b8" roughness={0.9} side={2} /></mesh>)}
      {Array.from({ length: strips }, (_, i) => <mesh key={i} position={[0, ROOF - 0.05, -len / 2 + 4 + i * 8]}><boxGeometry args={[1.2, 0.08, 0.5]} /><meshStandardMaterial color="#fef3c7" emissive="#fde68a" emissiveIntensity={1.6} /></mesh>)}
      <pointLight position={[0, FLOOR + 3, 0]} intensity={30} distance={40} color="#fde68a" />
    </group>
  );
}
