"use client";

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MARKING_Y, ZebraCrossing } from './RoadMarkings';
import { signalState } from '@/lib/sim/signals';

const SIDEWALK_HEIGHT = 0.08;
// Distance from an intersection's center to the middle of a corner sidewalk block.
const CORNER_OFFSET = 1.1;
const POLE_HEIGHT = 0.75;

const CROSSWALK_DISTANCE = 1.75; // from the intersection center to the middle of the zebra
const STOP_BAR_DISTANCE = 2.15;
const STOP_BAR_THICKNESS = 0.07;
const LANE_LENGTH = 0.7;

// Where cars arrive from. `dir` points from the intersection toward that approach; `lane` is the
// side of the road cars drive on (right-hand traffic). The pole stands on the same side, on the
// corner block, facing oncoming cars (`yaw` turns local +Z toward the approach).
const APPROACHES = {
  west: { dir: [-1, 0], lane: [0, 1], corner: [-1, 1], yaw: -Math.PI / 2, onAvenue: true },
  east: { dir: [1, 0], lane: [0, -1], corner: [1, -1], yaw: Math.PI / 2, onAvenue: true },
  north: { dir: [0, -1], lane: [-1, 0], corner: [-1, -1], yaw: Math.PI, onAvenue: false },
  south: { dir: [0, 1], lane: [1, 0], corner: [1, 1], yaw: 0, onAvenue: false },
};

function Crosswalk({ dir }) {
  return <ZebraCrossing position={[dir[0] * CROSSWALK_DISTANCE, dir[1] * CROSSWALK_DISTANCE]} carsAlongX={dir[0] !== 0} />;
}

function StopBar({ dir, lane }) {
  const alongX = dir[0] !== 0;
  return (
    <mesh
      position={[
        dir[0] * STOP_BAR_DISTANCE + lane[0] * 0.4,
        MARKING_Y,
        dir[1] * STOP_BAR_DISTANCE + lane[1] * 0.4,
      ]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={alongX ? [STOP_BAR_THICKNESS, LANE_LENGTH] : [LANE_LENGTH, STOP_BAR_THICKNESS]} />
      <meshStandardMaterial color="#f8fafc" roughness={0.8} />
    </mesh>
  );
}

function Pole() {
  return (
    <mesh position={[0, POLE_HEIGHT / 2, 0]} castShadow>
      <cylinderGeometry args={[0.025, 0.025, POLE_HEIGHT, 8]} />
      <meshStandardMaterial color="#94a3b8" roughness={0.6} />
    </mesh>
  );
}

function StopSign() {
  return (
    <group>
      <Pole />
      <group position={[0, POLE_HEIGHT + 0.08, 0.03]}>
        <mesh rotation={[Math.PI / 2, Math.PI / 8, 0]} castShadow>
          <cylinderGeometry args={[0.17, 0.17, 0.02, 8]} />
          <meshStandardMaterial color="#dc2626" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.012]}>
          <boxGeometry args={[0.22, 0.04, 0.005]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      </group>
    </group>
  );
}

// Inverted triangle: a 3-sided cylinder laid on its side points its tip down.
function YieldSign() {
  return (
    <group>
      <Pole />
      <group position={[0, POLE_HEIGHT + 0.1, 0.03]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.02, 3]} />
          <meshStandardMaterial color="#dc2626" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.01, 0.012]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.11, 0.11, 0.01, 3]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      </group>
    </group>
  );
}

// Dashed give-way line across the entering lane.
function YieldLine({ dir, lane }) {
  const alongX = dir[0] !== 0;
  return (
    <>
      {[-0.27, -0.09, 0.09, 0.27].map((offset) => (
        <mesh
          key={offset}
          position={[
            dir[0] * STOP_BAR_DISTANCE + lane[0] * (0.4 + offset),
            MARKING_Y,
            dir[1] * STOP_BAR_DISTANCE + lane[1] * (0.4 + offset),
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={alongX ? [STOP_BAR_THICKNESS, 0.12] : [0.12, STOP_BAR_THICKNESS]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.8} />
        </mesh>
      ))}
    </>
  );
}

const LAMP_COLORS = { red: '#ef4444', yellow: '#facc15', green: '#22c55e' };

function TrafficLight({ onAvenue, phase }) {
  const lamps = useRef({});
  const current = useRef(null);

  useFrame(({ clock }) => {
    const state = signalState(clock.elapsedTime + phase, onAvenue);
    if (state === current.current) return;
    current.current = state;
    for (const [name, mesh] of Object.entries(lamps.current)) {
      if (mesh) mesh.material.emissiveIntensity = name === state ? 2.5 : 0.05;
    }
  });

  return (
    <group>
      <Pole />
      <mesh position={[0, POLE_HEIGHT + 0.14, 0]} castShadow>
        <boxGeometry args={[0.13, 0.34, 0.1]} />
        <meshStandardMaterial color="#0f172a" roughness={0.6} />
      </mesh>
      {[['red', 0.1], ['yellow', 0], ['green', -0.1]].map(([name, dy]) => (
        <mesh key={name} ref={(m) => {
            lamps.current[name] = m; // (no return value: React 19 treats a returned value as the ref's cleanup)
          }} userData={{ keep: true }} position={[0, POLE_HEIGHT + 0.14 + dy, 0.055]}>
          <sphereGeometry args={[0.035, 12, 12]} />
          <meshStandardMaterial color={LAMP_COLORS[name]} emissive={LAMP_COLORS[name]} emissiveIntensity={0.05} />
        </mesh>
      ))}
    </group>
  );
}

// Where a road ends against another (a T) or two roads end at each other (a bend), the pavement of the
// road that carries on runs straight across the missing arm, so the sidewalk loop is closed there too.
const MOUTH_STRIPS = {
  west: { position: [-CORNER_OFFSET, 0], size: [0.6, 2.8] },
  east: { position: [CORNER_OFFSET, 0], size: [0.6, 2.8] },
  north: { position: [0, -CORNER_OFFSET], size: [2.8, 0.6] },
  south: { position: [0, CORNER_OFFSET], size: [2.8, 0.6] },
};

// --- circles: the big circles on the diagonal and the compact ones that replaced the old roundabouts ---------------------------------------------------------
// A circle has a raised island, an asphalt ring, and sidewalk round the outside of the ring, cut open
// wherever a road meets it (a "leg"). Every leg has a zebra crossing and a give-way line with a sign.
const AXIS_DIRS = { west: [-1, 0], east: [1, 0], north: [0, -1], south: [0, 1] };

function CircleSidewalks({ spec, angles }) {
  // The sidewalk is a ring (a lathe of a small rectangle) cut into arcs between the legs.
  const arcs = useMemo(() => {
    const mid = (spec.ringOut + spec.outer) / 2;
    const half = Math.asin(Math.min(0.99, 1.4 / mid)); // half the opening a 2.8-wide road needs at the ring
    const sorted = [...angles].sort((a, b) => a - b);
    const out = [];
    sorted.forEach((a, i) => {
      const next = i === sorted.length - 1 ? sorted[0] + Math.PI * 2 : sorted[i + 1];
      const t1 = a + half;
      const t2 = next - half;
      if (t2 - t1 > 0.05) out.push([t1, t2]);
    });
    return out.map(([t1, t2]) => {
      const profile = [new THREE.Vector2(spec.ringOut, 0), new THREE.Vector2(spec.ringOut, SIDEWALK_HEIGHT), new THREE.Vector2(spec.outer, SIDEWALK_HEIGHT), new THREE.Vector2(spec.outer, 0)];
      // a lathe turns from +Z towards +X; our angles run from +X towards +Z
      return new THREE.LatheGeometry(profile, Math.max(3, Math.ceil((t2 - t1) / 0.12)), Math.PI / 2 - t2, t2 - t1);
    });
  }, [spec, angles]);
  return arcs.map((geometry, i) => (
    <mesh key={i} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#64748b" roughness={0.8} side={THREE.DoubleSide} />
    </mesh>
  ));
}

function CircleLeg({ dir, spec, signPhase }) {
  void signPhase;
  const yaw = Math.atan2(dir[0], dir[1]); // local +Z points out along the leg
  const cw = spec.ringOut + 0.5;
  const stop = spec.ringOut + 1.1;
  return (
    <group rotation={[0, yaw, 0]}>
      <ZebraCrossing position={[0, cw]} carsAlongX={false} />
      {[-0.27, -0.09, 0.09, 0.27].map((o) => (
        <mesh key={o} position={[0.4 + o, MARKING_Y, stop]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.12, STOP_BAR_THICKNESS]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.8} />
        </mesh>
      ))}
      <group position={[1.15, SIDEWALK_HEIGHT, stop - 0.4]}>
        <YieldSign />
      </group>
    </group>
  );
}

function CircleJunction({ intersection }) {
  const { x, z, arms, diag, circle: spec } = intersection;
  const legs = useMemo(() => [...Object.entries(AXIS_DIRS).filter(([name]) => arms[name]).map(([, d]) => d), ...diag.map((l) => l.dir)], [arms, diag]);
  const angles = useMemo(() => legs.map((d) => Math.atan2(d[1], d[0])), [legs]);
  const big = spec.island > 1.5;
  return (
    <group position={[x, 0, z]}>
      {/* the asphalt ring, with a paved apron round the island */}
      <mesh position={[0, 0.015, 0]} receiveShadow>
        <cylinderGeometry args={[spec.ringOut, spec.ringOut, 0.03, 48]} />
        <meshStandardMaterial color="#1f2937" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <cylinderGeometry args={[spec.ringIn, spec.ringIn, 0.04, 40]} />
        <meshStandardMaterial color="#64748b" roughness={0.9} />
      </mesh>
      {/* raised island: kerb, lawn, then a monument and trees on the big ones, one tree on the small */}
      <mesh position={[0, 0.07, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[spec.island, spec.island, 0.1, 40]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.126, 0]} receiveShadow>
        <cylinderGeometry args={[spec.island - 0.12, spec.island - 0.12, 0.02, 40]} />
        <meshStandardMaterial color="#166534" roughness={1} />
      </mesh>
      {big ? (
        <group>
          <mesh position={[0, 0.3, 0]} castShadow>
            <cylinderGeometry args={[0.55, 0.65, 0.34, 20]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.1, 0]} castShadow>
            <boxGeometry args={[0.22, 1.5, 0.22]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.95, 0]} castShadow>
            <coneGeometry args={[0.2, 0.3, 4]} />
            <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.5} />
          </mesh>
          {[0, 1, 2, 3].map((i) => {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            return (
              <group key={i} position={[Math.cos(a) * 1.25, 0.13, Math.sin(a) * 1.25]}>
                <mesh position={[0, 0.2, 0]} castShadow>
                  <boxGeometry args={[0.08, 0.4, 0.08]} />
                  <meshStandardMaterial color="#78350f" roughness={0.9} />
                </mesh>
                <mesh position={[0, 0.55, 0]} castShadow>
                  <boxGeometry args={[0.38, 0.38, 0.38]} />
                  <meshStandardMaterial color="#22c55e" roughness={0.8} />
                </mesh>
              </group>
            );
          })}
        </group>
      ) : (
        <group position={[0, 0.13, 0]}>
          <mesh position={[0, 0.2, 0]} castShadow>
            <boxGeometry args={[0.1, 0.4, 0.1]} />
            <meshStandardMaterial color="#78350f" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.55, 0]} castShadow>
            <boxGeometry args={[0.36, 0.36, 0.36]} />
            <meshStandardMaterial color="#22c55e" roughness={0.8} />
          </mesh>
        </group>
      )}
      <CircleSidewalks spec={spec} angles={angles} />
      {legs.map((d, i) => (
        <CircleLeg key={i} dir={d} spec={spec} />
      ))}
    </group>
  );
}

// `intersection` comes from generateCity(): { x, z, control, arms, approaches: { west|east|north|south: 'stop'|'signal'|'yield'|'free'|null }, phase }.
export default function IntersectionControl({ intersection }) {
  const { x, z, control, approaches, phase, arms } = intersection;
  if (control === 'circle') return <CircleJunction intersection={intersection} />;

  return (
    <group position={[x, 0, z]}>
      {/* road surface across the middle, so a bend or T has no hole at its corner */}
      <mesh position={[0, 0.015, 0]} receiveShadow>
        <boxGeometry args={[1.6, 0.03, 1.6]} />
        <meshStandardMaterial color="#1f2937" roughness={0.95} />
      </mesh>
      {Object.entries(MOUTH_STRIPS).map(([name, strip]) =>
        arms[name] ? null : (
          <mesh key={`mouth-${name}`} position={[strip.position[0], SIDEWALK_HEIGHT / 2, strip.position[1]]} receiveShadow>
            <boxGeometry args={[strip.size[0], SIDEWALK_HEIGHT, strip.size[1]]} />
            <meshStandardMaterial color="#64748b" roughness={0.8} />
          </mesh>
        )
      )}
      {Object.entries(APPROACHES).map(([name, a]) => {
        const kind = approaches[name];
        if (!kind) return null;
        return (
          <group key={name}>
            <Crosswalk dir={a.dir} />
            {(kind === 'stop' || kind === 'signal') && <StopBar dir={a.dir} lane={a.lane} />}
            {kind === 'yield' && <YieldLine dir={a.dir} lane={a.lane} />}
            {kind !== 'free' && (
              <group
                position={[a.corner[0] * CORNER_OFFSET, SIDEWALK_HEIGHT, a.corner[1] * CORNER_OFFSET]}
                rotation={[0, a.yaw, 0]}
              >
                {kind === 'stop' && <StopSign />}
                {kind === 'yield' && <YieldSign />}
                {kind === 'signal' && <TrafficLight onAvenue={a.onAvenue} phase={phase} />}
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}
