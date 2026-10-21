"use client";

import React, { useEffect, useMemo } from 'react';
import { lampHeadMaterial } from './nightLights';
import * as THREE from 'three';
import {
  asphaltData,
  dashData,
  lampPositions,
  sampleCurve,
  sidewalkData,
} from '@/lib/city/curves';
import Label3D from './Label3D';

const LAMP_HEIGHT = 0.95;
const SIDEWALK_Y = 0.08;

function toGeometry({ positions, indices }) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// A curved road, drawn from its design (see lib/city/curves.js for the format): asphalt, a pavement
// either side, a dashed centre line and street lamps, matching the straight roads. The surfaces
// are double-sided, so it doesn't matter which way the strips were wound.
export default function CurvedRoad({ spec, showLabel = true }) {
  const curve = useMemo(() => sampleCurve(spec), [spec]);

  const geo = useMemo(
    () => ({
      asphalt: toGeometry(asphaltData(curve)),
      left: toGeometry(sidewalkData(curve, -1)),
      right: toGeometry(sidewalkData(curve, 1)),
      dashes: toGeometry(dashData(curve)),
    }),
    [curve]
  );
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const lamps = useMemo(() => lampPositions(curve), [curve]);
  const start = curve.points[0];

  return (
    <group>
      <mesh geometry={geo.asphalt} receiveShadow>
        <meshStandardMaterial color="#1f2937" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {[geo.left, geo.right].map((g, i) => (
        <mesh key={i} geometry={g} castShadow receiveShadow>
          <meshStandardMaterial color="#64748b" roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh geometry={geo.dashes}>
        <meshStandardMaterial color="#e2e8f0" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>

      {lamps.map((l, i) => {
        // the head leans a little toward the road, like the straight roads' lamps
        const toRoad = [Math.cos(l.h) * l.side, -Math.sin(l.h) * l.side];
        return (
          <group key={i} position={[l.x, SIDEWALK_Y, l.z]}>
            <mesh position={[0, LAMP_HEIGHT / 2, 0]} castShadow>
              <cylinderGeometry args={[0.025, 0.03, LAMP_HEIGHT, 8]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.6} />
            </mesh>
            <mesh position={[toRoad[0] * 0.2, LAMP_HEIGHT - 0.03, toRoad[1] * 0.2]}>
              <boxGeometry args={[0.14, 0.05, 0.14]} />
              <primitive object={lampHeadMaterial} attach="material" />
            </mesh>
          </group>
        );
      })}

      {showLabel && curve.name && <Label3D text={curve.name} position={[start.x, 0.6, start.z]} background="#0f172a" color="#e2e8f0" border="#475569" lod="labels" />}
    </group>
  );
}
