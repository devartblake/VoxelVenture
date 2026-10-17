"use client";

import React from 'react';
import { lampHeadMaterial } from './nightLights';
import Label3D from './Label3D';

// Roads are 1.6 wide asphalt inside a 2.8 corridor, with a 0.6 sidewalk on each side.
const ROAD_WIDTH = 1.6;
const SIDEWALK_WIDTH = 0.6;
const SIDEWALK_HEIGHT = 0.08;
const ROAD_HEIGHT = 0.03;
const DASH_LENGTH = 0.6;
const DASH_WIDTH = 0.07;
const DASH_PITCH = 1.2;
const LAMP_PITCH = 4.8;
const LAMP_HEIGHT = 0.95;

// Ranges of [from, to] left after removing the gaps (where a crossing road passes through).
function subtractGaps(from, to, gaps) {
  const segments = [];
  let cursor = from;
  for (const [a, b] of [...gaps].sort((x, y) => x[0] - y[0])) {
    if (a > cursor) segments.push([cursor, Math.min(a, to)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < to) segments.push([cursor, to]);
  return segments;
}

// `road` comes from generateCity(). axis 'x' runs along X at z=center; axis 'z' along Z at x=center.
export default function Road({ road }) {
  const { axis, center, from, to, gaps, color, kind, name, labelAt } = road;
  const isArterial = road.class === 'arterial';
  const lineColor = kind === 'avenue' ? color : '#e2e8f0';
  const alongX = axis === 'x';
  const sidewalkOffset = ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2;

  // u = distance along the road, v = offset across it.
  const pos = (u, y, v) => (alongX ? [u, y, center + v] : [center + v, y, u]);
  const box = (length, height, width) => (alongX ? [length, height, width] : [width, height, length]);

  // Country roads get longer, sparser dashes: far fewer meshes over the long county road.
  const rural = ['county', 'spur', 'lake'].includes(kind);
  const dashPitch = rural ? DASH_PITCH * 3 : DASH_PITCH;
  const dashLength = rural ? DASH_LENGTH * 2 : DASH_LENGTH;
  const dashes = [];
  for (let u = from + dashPitch / 2; u + dashLength / 2 < to; u += dashPitch) {
    const blocked = gaps.some(([a, b]) => u + dashLength / 2 > a && u - dashLength / 2 < b);
    if (!blocked) dashes.push(u);
  }

  const sidewalkSegments = subtractGaps(from, to, gaps);

  // Street lamps stand on the sidewalks, alternating sides, and skip the intersections.
  const lamps = [];
  const lampPitch = ['county', 'spur', 'lake'].includes(kind) || (road.rural && road.rural.length) ? LAMP_PITCH * 3 : LAMP_PITCH;
  for (let u = from + lampPitch / 2, n = 0; u < to - 1; u += lampPitch, n++) {
    if (gaps.some(([a, b]) => u > a - 0.5 && u < b + 0.5)) continue;
    if ((road.crossings ?? []).some((c) => Math.abs(u - c) < 1)) continue;
    lamps.push({ u, side: n % 2 === 0 ? -1 : 1 });
  }

  return (
    <group>
      <mesh position={pos((from + to) / 2, ROAD_HEIGHT / 2, 0)} receiveShadow>
        <boxGeometry args={box(to - from, ROAD_HEIGHT, ROAD_WIDTH)} />
        <meshStandardMaterial color="#1f2937" roughness={0.95} />
      </mesh>

      {/* Arterials get a solid double center line, locals a dashed one */}
      {isArterial &&
        subtractGaps(from, to, gaps).flatMap(([a, b]) =>
          [-1, 1].map((side) => (
            <mesh
              key={`line-${a}-${side}`}
              position={pos((a + b) / 2, ROAD_HEIGHT + 0.002, side * 0.05)}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={alongX ? [b - a, 0.03] : [0.03, b - a]} />
              <meshStandardMaterial color={lineColor} roughness={0.6} />
            </mesh>
          ))
        )}

      {!isArterial && dashes.map((u) => (
        <mesh key={u} position={pos(u, ROAD_HEIGHT + 0.002, 0)} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={alongX ? [dashLength, DASH_WIDTH] : [DASH_WIDTH, dashLength]} />
          <meshStandardMaterial color={lineColor} roughness={0.6} />
        </mesh>
      ))}

      {sidewalkSegments.flatMap(([a, b]) =>
        [-1, 1].map((side) => (
          <mesh
            key={`${a}-${side}`}
            position={pos((a + b) / 2, SIDEWALK_HEIGHT / 2, side * sidewalkOffset)}
            castShadow
            receiveShadow
          >
            <boxGeometry args={box(b - a, SIDEWALK_HEIGHT, SIDEWALK_WIDTH)} />
            <meshStandardMaterial color="#64748b" roughness={0.8} />
          </mesh>
        ))
      )}

      {lamps.map(({ u, side }) => (
        <group key={`lamp-${u}`}>
          <mesh position={pos(u, SIDEWALK_HEIGHT + LAMP_HEIGHT / 2, side * sidewalkOffset)} castShadow>
            <cylinderGeometry args={[0.025, 0.03, LAMP_HEIGHT, 8]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.6} />
          </mesh>
          <mesh position={pos(u, SIDEWALK_HEIGHT + LAMP_HEIGHT, side * (sidewalkOffset - 0.1))}>
            <boxGeometry args={box(0.03, 0.03, 0.2)} />
            <meshStandardMaterial color="#94a3b8" roughness={0.6} />
          </mesh>
          <mesh position={pos(u, SIDEWALK_HEIGHT + LAMP_HEIGHT - 0.03, side * (sidewalkOffset - 0.2))}>
            <boxGeometry args={box(0.14, 0.05, 0.14)} />
            <primitive object={lampHeadMaterial} attach="material" />
          </mesh>
        </group>
      ))}

      {/* Corner blocks close the sidewalk loop at each intersection (avenues own them, so they aren't doubled). */}
      {alongX &&
        gaps.filter(([a, b]) => b - a < 3).flatMap(([a, b]) =>
          [-1, 1].flatMap((sideU) =>
            [-1, 1].map((sideV) => (
              <mesh
                key={`corner-${a}-${sideU}-${sideV}`}
                position={pos((a + b) / 2 + sideU * sidewalkOffset, SIDEWALK_HEIGHT / 2, sideV * sidewalkOffset)}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[SIDEWALK_WIDTH, SIDEWALK_HEIGHT, SIDEWALK_WIDTH]} />
                <meshStandardMaterial color="#64748b" roughness={0.8} />
              </mesh>
            ))
          )
        )}

      {labelAt && (
        <Label3D
          text={name}
          position={[labelAt[0], 0.6, labelAt[1]]}
          background={kind === 'avenue' ? color : '#0f172a'}
          color={kind === 'avenue' ? '#0b1020' : '#e2e8f0'}
          border={kind === 'avenue' ? null : '#475569'}
        />
      )}
    </group>
  );
}
