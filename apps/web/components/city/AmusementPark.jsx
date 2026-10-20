"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { LOOPS } from '@/lib/performance/visibilityPolicy';
import { useGatedFrame } from '@/lib/performance/runtime';
import StaticBatch from './StaticBatch';
import Label3D from './Label3D';
import { registerGlow } from './nightLights';
import { PropModel, usePropsReady } from './PropModels';
import { AMUSEMENT, amusementDesign, toWorld, trackAt } from '@/lib/city/amusement';

// The amusement park (lib/city/amusement.js gives the layout). Everything that stands still is baked into a few merged meshes (StaticBatch); the ferris wheel,
// carousel, swings and the roller coaster's train move. The park is drawn in its own coordinates (x along the county road, z outward from it) inside a group
// that turns it into the world. Its lights come on at dusk with the street lamps.
// The Kenney Coaster Kit pieces the park uses (CC0; apps/web/public/models/kenney/coaster). Each is drawn with its box version until it has loaded.
const STALLS = ['coaster/stall-food', 'coaster/stall-drinks', 'coaster/stall-information', 'coaster/stall-toilets'];
const PARK_MODELS = ['coaster/park-entrance', ...STALLS, 'coaster/tree', 'coaster/tree-large', 'coaster/bench', 'coaster/trash', 'coaster/flowers', 'coaster/coaster-train-front', 'coaster/coaster-train'];
const ENTRANCE_SCALE = 2.5; // the gate is 3.1 wide: 7.7 here, a little wider than the 7 opening
const STALL_SCALE = 2.3;

const Box = ({ p, s, c, rough = 0.7, cast = false }) => (
  <mesh position={p} castShadow={cast}>
    <boxGeometry args={s} />
    <meshStandardMaterial color={c} roughness={rough} />
  </mesh>
);

// a segment of track between two points: a box turned along it
function Segment({ a, b, c = '#e11d48', w = 0.5, h = 0.18 }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(a[0], a[1], a[2]);
    const vb = new THREE.Vector3(b[0], b[1], b[2]);
    const dir = vb.clone().sub(va);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
    return { pos: va.clone().add(vb).multiplyScalar(0.5), quat: q, len: dir.length() };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat}>
      <boxGeometry args={[w, h, len + 0.05]} />
      <meshStandardMaterial color={c} roughness={0.5} />
    </mesh>
  );
}

function Tree({ p }) {
  return (
    <group position={[p[0], 0, p[1]]}>
      <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.12, 0.16, 1, 6]} /><meshStandardMaterial color="#78350f" roughness={0.9} /></mesh>
      <mesh position={[0, 1.5, 0]}><coneGeometry args={[0.8, 1.8, 7]} /><meshStandardMaterial color="#15803d" roughness={0.85} /></mesh>
    </group>
  );
}

function FerrisWheel({ d, bulbs }) {
  const wheel = useRef(null);
  const cars = useRef([]);
  const { radius, hub } = d;
  const gondolas = 10;
  useGatedFrame(LOOPS.distantOrnament, (_, dt) => {
    if (!wheel.current) return;
    wheel.current.rotation.z += dt * 0.18;
    for (const c of cars.current) if (c) c.rotation.z = -wheel.current.rotation.z; // the cabins hang level
  });
  const spokes = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI);
  return (
    <group position={[d.u, 0, d.v]}>
      {/* the two A-frame legs */}
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * 2.2, hub / 2, 0]} rotation={[0, 0, -k * 0.34]} castShadow>
          <boxGeometry args={[0.35, hub + 0.8, 0.35]} />
          <meshStandardMaterial color="#e5e7eb" roughness={0.5} />
        </mesh>
      ))}
      <group ref={wheel} position={[0, hub, 0]}>
        {[-0.7, 0.7].map((z) => (
          <mesh key={z} position={[0, 0, z]}>
            <torusGeometry args={[radius, 0.13, 6, 36]} />
            <meshStandardMaterial color="#f43f5e" roughness={0.4} />
          </mesh>
        ))}
        {spokes.map((a, i) => (
          <mesh key={i} rotation={[0, 0, a]}>
            <boxGeometry args={[radius * 2, 0.08, 0.08]} />
            <meshStandardMaterial color="#fde68a" roughness={0.5} />
          </mesh>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.45, 0.45, 1.6, 12]} /><meshStandardMaterial color="#e5e7eb" roughness={0.4} /></mesh>
        {Array.from({ length: gondolas }, (_, i) => {
          const a = (i / gondolas) * Math.PI * 2;
          return (
            <group key={i} position={[Math.cos(a) * radius, Math.sin(a) * radius, 0]} ref={(el) => (cars.current[i] = el)}>
              <mesh position={[0, -0.45, 0]}><boxGeometry args={[0.9, 0.7, 1.3]} /><meshStandardMaterial color={['#3b82f6', '#f59e0b', '#22c55e', '#a855f7', '#ef4444'][i % 5]} roughness={0.6} /></mesh>
              <mesh position={[0, -0.05, 0]}><boxGeometry args={[0.06, 0.7, 0.06]} /><meshStandardMaterial color="#cbd5e1" /></mesh>
            </group>
          );
        })}
        {/* the rim lights */}
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * radius, Math.sin(a) * radius, 0.85]}>
              <sphereGeometry args={[0.13, 6, 5]} />
              <primitive object={bulbs} attach="material" />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function Carousel({ d, bulbs }) {
  const spin = useRef(null);
  const horses = useRef([]);
  useGatedFrame(LOOPS.distantOrnament, (state, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.7;
    const t = state.clock.elapsedTime;
    horses.current.forEach((h, i) => h && (h.position.y = 0.9 + Math.sin(t * 2.4 + i) * 0.22));
  });
  const n = 8;
  return (
    <group position={[d.u, 0, d.v]}>
      <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[d.radius + 0.3, d.radius + 0.4, 0.3, 20]} /><meshStandardMaterial color="#fbbf24" roughness={0.6} /></mesh>
      <group ref={spin}>
        <mesh position={[0, 1.7, 0]}><cylinderGeometry args={[0.2, 0.2, 3.1, 8]} /><meshStandardMaterial color="#f8fafc" /></mesh>
        <mesh position={[0, 3.55, 0]}><coneGeometry args={[d.radius + 0.5, 1.6, 16]} /><meshStandardMaterial color="#ec4899" roughness={0.5} /></mesh>
        <mesh position={[0, 3.2, 0]}><cylinderGeometry args={[d.radius + 0.3, d.radius + 0.3, 0.25, 16]} /><meshStandardMaterial color="#fde68a" roughness={0.5} /></mesh>
        {Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2;
          return (
            <group key={i} position={[Math.cos(a) * d.radius * 0.72, 0, Math.sin(a) * d.radius * 0.72]} rotation={[0, -a, 0]}>
              <mesh position={[0, 1.7, 0]}><boxGeometry args={[0.05, 3, 0.05]} /><meshStandardMaterial color="#e5e7eb" /></mesh>
              <mesh ref={(el) => (horses.current[i] = el)} position={[0, 0.9, 0]}><boxGeometry args={[0.8, 0.55, 0.3]} /><meshStandardMaterial color={['#f8fafc', '#fbbf24', '#38bdf8', '#f472b6'][i % 4]} roughness={0.6} /></mesh>
            </group>
          );
        })}
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * (d.radius + 0.35), 3.2, Math.sin(a) * (d.radius + 0.35)]}>
              <sphereGeometry args={[0.12, 6, 5]} />
              <primitive object={bulbs} attach="material" />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function Swings({ d }) {
  const top = useRef(null);
  const chairs = useRef([]);
  useGatedFrame(LOOPS.distantOrnament, (state, dt) => {
    if (top.current) top.current.rotation.y += dt * 1.1;
    chairs.current.forEach((c) => c && (c.rotation.z = 0.5));
  });
  const n = 8;
  return (
    <group position={[d.u, 0, d.v]}>
      <mesh position={[0, d.height / 2, 0]}><cylinderGeometry args={[0.3, 0.42, d.height, 10]} /><meshStandardMaterial color="#e5e7eb" roughness={0.5} /></mesh>
      <group ref={top} position={[0, d.height, 0]}>
        <mesh><cylinderGeometry args={[d.radius * 0.8, d.radius * 0.8, 0.3, 16]} /><meshStandardMaterial color="#6366f1" roughness={0.5} /></mesh>
        {Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2;
          return (
            <group key={i} rotation={[0, a, 0]}>
              <group position={[d.radius * 0.7, 0, 0]} ref={(el) => (chairs.current[i] = el)}>
                <mesh position={[0, -1.7, 0]}><boxGeometry args={[0.04, 3.4, 0.04]} /><meshStandardMaterial color="#cbd5e1" /></mesh>
                <mesh position={[0, -3.4, 0]}><boxGeometry args={[0.6, 0.15, 0.6]} /><meshStandardMaterial color={['#f59e0b', '#22c55e', '#ec4899', '#38bdf8'][i % 4]} roughness={0.6} /></mesh>
              </group>
            </group>
          );
        })}
      </group>
    </group>
  );
}

// the roller coaster's train: three cars that follow the track
function Train({ track, tilt, ready }) {
  const cars = useRef([]);
  useGatedFrame(LOOPS.distantOrnament, (state) => {
    const t = (state.clock.elapsedTime / 38) % 1;
    cars.current.forEach((car, i) => {
      if (!car) return;
      const p = trackAt(track, t - i * 0.0135);
      car.position.set(p.u, p.y + 0.08, p.v);
      car.rotation.set(0, Math.atan2(p.du, p.dv), 0);
      car.rotateX(-Math.atan2(p.dy, Math.hypot(p.du, p.dv)) * tilt);
    });
  });
  return (
    <>
      {[0, 1, 2].map((i) => (
        <group key={i} ref={(el) => (cars.current[i] = el)}>
          {ready ? (
            <PropModel id={i === 0 ? 'coaster/coaster-train-front' : 'coaster/coaster-train'} scale={1.15} />
          ) : (
            <mesh position={[0, 0.27, 0]}>
              <boxGeometry args={[0.7, 0.45, 1.1]} />
              <meshStandardMaterial color={i === 0 ? '#f59e0b' : '#facc15'} roughness={0.5} />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}

export default function AmusementPark({ site }) {
  const d = useMemo(() => amusementDesign(site.width, site.depth), [site.width, site.depth]);
  const bulbs = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fde68a', emissive: '#fde68a', emissiveIntensity: 0.4 }), []);
  useEffect(() => registerGlow(bulbs, { day: 0.4, night: 3.5 }), [bulbs]);
  // the park's own coordinates (x along the county road, z outward) turned into the world; a mirror when it lies the other way round
  const matrix = useMemo(() => {
    const o = toWorld(site, 0, 0);
    const eu = toWorld(site, 1, 0);
    const ev = toWorld(site, 0, 1);
    return new THREE.Matrix4().set(eu.x - o.x, 0, ev.x - o.x, o.x, 0, 1, 0, 0, eu.z - o.z, 0, ev.z - o.z, o.z, 0, 0, 0, 1);
  }, [site]);
  const W = site.width;
  const D = site.depth;
  const gate = AMUSEMENT.gateWidth / 2;
  const track = d.track;
  const ready = usePropsReady(PARK_MODELS); // the static part is baked once, so it is built again when the Kenney models have loaded
  const key = `${site.roadId}-${site.u0}-${ready}`;
  return (
    <group matrix={matrix} matrixAutoUpdate={false} name="amusement">
      <StaticBatch key={key} name="amusement-static" castShadow>
        {/* the ground: lawn, and a paved plaza and paths */}
        <mesh position={[W / 2, 0.012, D / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[W, D]} /><meshStandardMaterial color="#3f8f46" roughness={0.95} /></mesh>
        <mesh position={[d.plaza.u, 0.02, d.plaza.v]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[d.plaza.w, d.plaza.d]} /><meshStandardMaterial color="#d6d3d1" roughness={0.9} /></mesh>
        <mesh position={[W / 2, 0.02, D / 2 + 4]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[4, D - 10]} /><meshStandardMaterial color="#d6d3d1" roughness={0.9} /></mesh>
        <mesh position={[W / 2, 0.02, d.loop.cv]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[W - 14, 3]} /><meshStandardMaterial color="#d6d3d1" roughness={0.9} /></mesh>
        {/* the fence: rails and posts, with the gate left open */}
        {[[(W / 2 - gate) / 2, (W / 2 - gate)], [W - (W / 2 - gate) / 2, (W / 2 - gate)]].map(([u, len], i) => (
          <React.Fragment key={i}>
            <Box p={[u, 0.55, 0]} s={[len, 0.08, 0.08]} c="#f8fafc" />
            <Box p={[u, 0.9, 0]} s={[len, 0.08, 0.08]} c="#f8fafc" />
          </React.Fragment>
        ))}
        <Box p={[W / 2, 0.55, D]} s={[W, 0.08, 0.08]} c="#f8fafc" />
        <Box p={[W / 2, 0.9, D]} s={[W, 0.08, 0.08]} c="#f8fafc" />
        <Box p={[0, 0.55, D / 2]} s={[0.08, 0.08, D]} c="#f8fafc" />
        <Box p={[0, 0.9, D / 2]} s={[0.08, 0.08, D]} c="#f8fafc" />
        <Box p={[W, 0.55, D / 2]} s={[0.08, 0.08, D]} c="#f8fafc" />
        <Box p={[W, 0.9, D / 2]} s={[0.08, 0.08, D]} c="#f8fafc" />
        {Array.from({ length: Math.floor(W / 3) + 1 }, (_, i) => i * 3).filter((u) => Math.abs(u - W / 2) > gate + 0.3).flatMap((u) => [<Box key={`f${u}`} p={[u, 0.5, 0]} s={[0.12, 1, 0.12]} c="#94a3b8" />, <Box key={`b${u}`} p={[u, 0.5, D]} s={[0.12, 1, 0.12]} c="#94a3b8" />])}
        {Array.from({ length: Math.floor(D / 3) + 1 }, (_, i) => i * 3).flatMap((v) => [<Box key={`l${v}`} p={[0, 0.5, v]} s={[0.12, 1, 0.12]} c="#94a3b8" />, <Box key={`r${v}`} p={[W, 0.5, v]} s={[0.12, 1, 0.12]} c="#94a3b8" />])}
        {/* the gate: the Kenney park entrance (towers, flags and an arch), or a plain arch until it has loaded */}
        {ready ? (
          <PropModel id="coaster/park-entrance" position={[d.arch.u, 0, d.arch.v + 0.3]} rotation={[0, Math.PI, 0]} scale={ENTRANCE_SCALE} />
        ) : (
          <>
            <Box p={[d.arch.u - d.arch.w / 2, d.arch.h / 2, d.arch.v]} s={[0.6, d.arch.h, 0.6]} c="#f43f5e" cast />
            <Box p={[d.arch.u + d.arch.w / 2, d.arch.h / 2, d.arch.v]} s={[0.6, d.arch.h, 0.6]} c="#f43f5e" cast />
            <Box p={[d.arch.u, d.arch.h, d.arch.v]} s={[d.arch.w + 0.6, 0.9, 0.7]} c="#fbbf24" cast />
          </>
        )}
        {/* the carousel's base is drawn by the Carousel; the bumper-car pavilion and the stalls */}
        <Box p={[d.bumpers.u, 0.15, d.bumpers.v]} s={[d.bumpers.w, 0.3, d.bumpers.d]} c="#475569" />
        {[-1, 1].map((k) => <Box key={k} p={[d.bumpers.u + (k * d.bumpers.w) / 2, 1.6, d.bumpers.v]} s={[0.3, 3, 0.3]} c="#e5e7eb" />)}
        <Box p={[d.bumpers.u, 3.2, d.bumpers.v]} s={[d.bumpers.w + 1, 0.4, d.bumpers.d + 1]} c="#6366f1" cast />
        {[0, 1, 2, 3, 4].map((i) => <Box key={i} p={[d.bumpers.u - 4 + i * 2, 0.55, d.bumpers.v + (i % 2 ? 1.4 : -1.4)]} s={[0.9, 0.5, 0.7]} c={['#ef4444', '#22c55e', '#f59e0b', '#38bdf8', '#ec4899'][i]} />)}
        {d.stalls.map((s, i) =>
          ready ? (
            <PropModel key={i} id={STALLS[i % STALLS.length]} position={[s.u, 0, s.v]} scale={STALL_SCALE} />
          ) : (
            <React.Fragment key={i}>
              <Box p={[s.u, 0.7, s.v]} s={[s.w, 1.4, s.d]} c="#fef3c7" cast />
              <Box p={[s.u, 1.55, s.v - 0.3]} s={[s.w + 0.4, 0.2, s.d + 0.8]} c={s.colour} cast />
            </React.Fragment>
          )
        )}
        {/* the roller coaster: track, a rail beneath it, and its supports */}
        {track.map((p, i) => {
          const q = track[(i + 1) % track.length];
          return <Segment key={i} a={[p.u, p.y, p.v]} b={[q.u, q.y, q.v]} />;
        })}
        {track.map((p, i) => {
          const q = track[(i + 1) % track.length];
          return <Segment key={`r${i}`} a={[p.u, p.y - 0.28, p.v]} b={[q.u, q.y - 0.28, q.v]} c="#475569" w={0.16} h={0.16} />;
        })}
        {d.supports.map((s, i) => <Box key={i} p={[s.u, s.h / 2 - 0.15, s.v]} s={[0.22, s.h - 0.3, 0.22]} c="#cbd5e1" />)}
        {d.trees.map((t, i) => (ready ? <PropModel key={i} id={i % 3 ? 'coaster/tree' : 'coaster/tree-large'} position={[t[0], 0, t[1]]} scale={2.3} /> : <Tree key={i} p={t} />))}
        {ready && d.benches.map((b, i) => <PropModel key={`bench${i}`} id="coaster/bench" position={[b.u, 0.02, b.v]} rotation={[0, b.yaw, 0]} scale={2} />)}
        {ready && d.benches.filter((_, i) => i % 2 === 0).map((b, i) => <PropModel key={`trash${i}`} id="coaster/trash" position={[b.u + Math.cos(b.yaw) * 1.5, 0.02, b.v - Math.sin(b.yaw) * 1.5]} scale={1.9} />)}
        {ready && d.flowers.map((f, i) => <PropModel key={`flowers${i}`} id="coaster/flowers" position={[f[0], 0.02, f[1]]} rotation={[0, i, 0]} scale={2.2} castShadow={false} />)}
      </StaticBatch>
      <FerrisWheel d={d.ferris} bulbs={bulbs} />
      <Carousel d={d.carousel} bulbs={bulbs} />
      <Swings d={d.swings} />
      <Train track={track} tilt={0.7} ready={ready} />
      <Label3D text={site.name} position={[d.arch.u, d.arch.h + 3.2, d.arch.v]} background="#f43f5e" color="#ffffff" height={1.1} />
    </group>
  );
}
