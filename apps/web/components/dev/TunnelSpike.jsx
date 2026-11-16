"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { TUNNEL, floorY, pointAt, tunnelRoute } from '@/lib/world/tunnel';
import { trainLine } from '@/lib/world/train';

// DEVELOPMENT SPIKE (docs/world/tunnel_evaluation.md): the tunnel beside the Harbor Causeway, with its own road entrance that starts before the bridge's road, a lit tube, ramps and covered portals, and a free
// camera to fly through it. /world/stream?tunnel=1&cam=free (&at=x,y,z&yaw=degrees&pitch=degrees to start somewhere). Not part of the game; nothing here is imported by it.
const SEG = 4; // the length of one piece of the tube
const D = new THREE.Object3D();

export function useRoute() {
  const [route, setRoute] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch('/world/manifest.json').then((r) => r.json()).then((m) => { if (alive && m.causeways?.length) setRoute(tunnelRoute(trainLine(m.causeways[0]))); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return route;
}

// one instanced set of boxes along the route: for each segment, a box at (lateral, y, length) in the segment's own frame, laid along the slope
function Strip({ route, y, lateral, width, thick, color, emissive, side = 0 }) {
  const ref = useRef(null);
  const n = Math.ceil((route.s1 - route.s0) / SEG);
  useLayoutEffect(() => {
    const line = route.line;
    for (let i = 0; i < n; i++) {
      const s = route.s0 + (i + 0.5) * SEG;
      const p = pointAt(line, s);
      const y0 = floorY(route, s - SEG / 2), y1 = floorY(route, s + SEG / 2);
      const pitch = Math.atan2(y1 - y0, SEG);
      D.position.set(p.x + line.normal.x * lateral, y((y0 + y1) / 2, route, s), p.z + line.normal.z * lateral);
      D.rotation.set(0, 0, 0);
      D.rotateY(line.yaw);
      D.rotateX(-pitch);
      D.scale.set(width, thick, SEG * 1.02);
      D.updateMatrix();
      ref.current.setMatrixAt(i, D.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [route, n, y, lateral, width, thick, side]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} emissive={emissive ?? '#000000'} emissiveIntensity={emissive ? 1.6 : 0} />
    </instancedMesh>
  );
}

function Tube({ route }) {
  const half = TUNNEL.width / 2;
  const L = 0; // the strips are laid from the tube's own centre line (pointAt is already beside the causeway)
  const mid = (floor) => floor + TUNNEL.height / 2;
  return (
    <group name="tunnel">
      {/* the road, the roof, the two walls (each a box a little thicker than the inside needs) */}
      <Strip route={route} lateral={L} width={TUNNEL.width} thick={0.12} color="#374151" y={(f) => f - 0.06} />
      <Strip route={route} lateral={L} width={TUNNEL.width + TUNNEL.wall * 2} thick={TUNNEL.wall} color="#64748b" y={(f) => f + TUNNEL.height + TUNNEL.wall / 2} />
      <Strip route={route} lateral={L - half - TUNNEL.wall / 2} width={TUNNEL.wall} thick={TUNNEL.height + 0.6} color="#94a3b8" y={(f) => mid(f)} />
      <Strip route={route} lateral={L + half + TUNNEL.wall / 2} width={TUNNEL.wall} thick={TUNNEL.height + 0.6} color="#94a3b8" y={(f) => mid(f)} />
      {/* the underside, so the water never shows through from inside: a slab below the road */}
      <Strip route={route} lateral={L} width={TUNNEL.width + TUNNEL.wall * 2} thick={TUNNEL.wall} color="#334155" y={(f) => f - 0.12 - TUNNEL.wall / 2} />
      {/* the lane line and the lamps */}
      <Strip route={route} lateral={L} width={0.14} thick={0.04} color="#f8fafc" y={(f) => f + 0.02} />
      <Strip route={route} lateral={L - half + 0.5} width={0.3} thick={0.06} color="#fde68a" emissive="#fde68a" y={(f) => f + TUNNEL.height - 0.05} />
      <Strip route={route} lateral={L + half - 0.5} width={0.3} thick={0.06} color="#fde68a" emissive="#fde68a" y={(f) => f + TUNNEL.height - 0.05} />
    </group>
  );
}

// the approach roads: a flat ribbon on the ground from each end of the road to its portal (the tunnel's own road, before the bridge's)
function Approach({ route }) {
  const line = route.line;
  const ends = [[route.approach0, route.s0], [route.s1, route.approach1]];
  return (
    <group name="tunnel-approach">
      {ends.map(([a, b], i) => {
        const pa = pointAt(line, a), pb = pointAt(line, b);
        const len = Math.hypot(pb.x - pa.x, pb.z - pa.z);
        return <mesh key={i} position={[(pa.x + pb.x) / 2, TUNNEL.ground - 0.06, (pa.z + pb.z) / 2]} rotation={[0, line.yaw, 0]}><boxGeometry args={[TUNNEL.width, 0.12, len]} /><meshStandardMaterial color="#374151" roughness={0.9} /></mesh>;
      })}
      {/* a marker at the bridge road's first point, for comparison: the tunnel's road starts before it */}
      <mesh position={[line.a.x, 3, line.a.z]}><cylinderGeometry args={[0.2, 0.2, 6, 8]} /><meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={0.6} /></mesh>
    </group>
  );
}

// a camera you fly: drag to look, W A S D to move, Q and E down and up, shift to go fast
export function FreeCam({ start, onMove }) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set());
  const look = useRef({ yaw: start.yaw, pitch: start.pitch });
  useEffect(() => {
    camera.near = 0.05;
    camera.updateProjectionMatrix();
    camera.position.set(start.x, start.y, start.z);
    const el = gl.domElement;
    let drag = null;
    const down = (e) => { drag = { x: e.clientX, y: e.clientY }; };
    const up = () => { drag = null; };
    const move = (e) => {
      if (!drag) return;
      look.current.yaw -= (e.clientX - drag.x) * 0.005;
      look.current.pitch = Math.max(-1.5, Math.min(1.5, look.current.pitch - (e.clientY - drag.y) * 0.005));
      drag = { x: e.clientX, y: e.clientY };
    };
    const kd = (e) => e.key && keys.current.add(e.key.toLowerCase());
    const ku = (e) => e.key && keys.current.delete(e.key.toLowerCase());
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointermove', move);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); window.removeEventListener('pointermove', move); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [camera, gl, start]);
  useFrame((_, dt) => {
    camera.rotation.order = 'YXZ';
    camera.rotation.set(look.current.pitch, look.current.yaw, 0);
    const k = keys.current;
    const v = (k.has('shift') ? 60 : 9) * Math.min(dt, 0.1);
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    const right = new THREE.Vector3(1, 0, 0).applyEuler(camera.rotation);
    if (k.has('w')) camera.position.addScaledVector(fwd, v);
    if (k.has('s')) camera.position.addScaledVector(fwd, -v);
    if (k.has('d')) camera.position.addScaledVector(right, v);
    if (k.has('a')) camera.position.addScaledVector(right, -v);
    if (k.has('e')) camera.position.y += v;
    if (k.has('q')) camera.position.y -= v;
    onMove?.(camera.position);
  });
  return null;
}

export function CameraLight() {
  const { camera } = useThree();
  const ref = useRef(null);
  useFrame(() => { if (ref.current) ref.current.position.copy(camera.position); });
  return <pointLight ref={ref} intensity={40} distance={30} color="#fff1c2" />;
}

/** Where the free camera starts, from the page's query: ?at=x,y,z&yaw=degrees&pitch=degrees (the default: inside the tube just past the mainland portal, looking along it toward the isle). */
export function startFromQuery(route) {
  const q = new URLSearchParams(window.location.search);
  const at = (q.get('at') ?? '').split(',').map(Number);
  const given = at.length === 3 && at.every(Number.isFinite);
  const p = route ? pointAt(route.line, route.s0 + 12) : { x: 0, z: 0 };
  const along = route ? Math.atan2(-route.line.dir.x, -route.line.dir.z) : 0; // the camera looks down -z at yaw 0: this turns it along the causeway
  return {
    x: given ? at[0] : p.x, y: given ? at[1] : route ? floorY(route, route.s0 + 12) + 2 : 0, z: given ? at[2] : p.z,
    yaw: q.get('yaw') !== null ? (Number(q.get('yaw')) * Math.PI) / 180 : along,
    pitch: ((Number(q.get('pitch')) || 0) * Math.PI) / 180,
  };
}

export default function TunnelSpike() {
  const route = useRoute();
  if (!route) return null;
  return (
    <group>
      <Tube route={route} />
      <Approach route={route} />
      <CameraLight />
    </group>
  );
}

