"use client";

import React from 'react';
import { lampHeadMaterial } from './nightLights';
import Label3D from './Label3D';

const ROAD_WIDTH = 1.6;
const SIDEWALK_WIDTH = 0.6;
const SIDEWALK_HEIGHT = 0.08;
const ROAD_HEIGHT = 0.03;
const LAMP_PITCH = 4.8;
const LAMP_HEIGHT = 0.95;

// One stretch of the diagonal avenue, from one circle to the next (layout.diagonals). It is drawn in its
// own frame: the group sits at the first circle's centre and turns so local +Z runs along the road.
// The asphalt reaches a little into each circle's ring; the sidewalks stop where the circle's own
// sidewalk begins. `from` / `to` are the two circles' sizes (their `circle` specs).
export default function DiagonalRoad({ road, from, to, showLabel }) {
  const { p0, dir, length, name } = road;
  const yaw = Math.atan2(dir[0], dir[1]);
  const a0 = from.ringOut - 0.3; // asphalt from here...
  const a1 = length - (to.ringOut - 0.3); // ...to here
  const s0 = from.outer - 0.2; // sidewalks and lines from here...
  const s1 = length - (to.outer - 0.2); // ...to here
  const side = ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2;
  const lamps = [];
  for (let u = s0 + 1.4, n = 0; u < s1 - 0.8; u += LAMP_PITCH, n++) lamps.push({ u, side: n % 2 === 0 ? -1 : 1 });

  return (
    <group position={[p0.x, 0, p0.z]} rotation={[0, yaw, 0]}>
      <mesh position={[0, ROAD_HEIGHT / 2, (a0 + a1) / 2]} receiveShadow>
        <boxGeometry args={[ROAD_WIDTH, ROAD_HEIGHT, a1 - a0]} />
        <meshStandardMaterial color="#1f2937" roughness={0.95} />
      </mesh>
      {/* an arterial: solid double centre line */}
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * 0.05, ROAD_HEIGHT + 0.002, (s0 + s1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.03, s1 - s0]} />
          <meshStandardMaterial color="#f43f5e" roughness={0.6} />
        </mesh>
      ))}
      {[-1, 1].map((k) => (
        <mesh key={`w${k}`} position={[k * side, SIDEWALK_HEIGHT / 2, (s0 + s1) / 2]} castShadow receiveShadow>
          <boxGeometry args={[SIDEWALK_WIDTH, SIDEWALK_HEIGHT, s1 - s0]} />
          <meshStandardMaterial color="#64748b" roughness={0.8} />
        </mesh>
      ))}
      {lamps.map(({ u, side: k }) => (
        <group key={u}>
          <mesh position={[k * side, SIDEWALK_HEIGHT + LAMP_HEIGHT / 2, u]} castShadow>
            <cylinderGeometry args={[0.025, 0.03, LAMP_HEIGHT, 8]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.6} />
          </mesh>
          <mesh position={[k * (side - 0.2), SIDEWALK_HEIGHT + LAMP_HEIGHT - 0.03, u]}>
            <boxGeometry args={[0.14, 0.05, 0.14]} />
            <primitive object={lampHeadMaterial} attach="material" />
          </mesh>
        </group>
      ))}
      {showLabel && (
        // the label stays upright whatever way the road is turned
        <group position={[0, 0, length / 2]} rotation={[0, -yaw, 0]}>
          <Label3D text={name} position={[0, 0.6, 0]} background="#f43f5e" color="#0b1020" border={null} />
        </group>
      )}
    </group>
  );
}
