"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { TUNNEL, floorY, pointAt, tunnelRoute } from '@/lib/world/tunnel';
const CHUNK = 128; // the baked world's chunk size
import { trainLine } from '@/lib/world/train';

// DEVELOPMENT SPIKE (docs/world/tunnel_evaluation.md): the tunnel beside the Harbor Causeway, with its own road entrance that starts before the bridge's road, a lit tube, ramps and covered portals, and a free
// camera to fly through it. /world/stream?tunnel=1&cam=free (&at=x,y,z&yaw=degrees&pitch=degrees to start somewhere). Not part of the game; nothing here is imported by it.

export function useRoute() {
  const [route, setRoute] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = await (await fetch('/world/manifest.json')).json();
        if (!m.causeways?.length) return;
        const line = trainLine(m.causeways[0]);
        // the main roads near each portal (rings and spurs of the chunks round it), so the tunnel's road joins them
        const base = tunnelRoute(line);
        const want = new Set();
        for (const s of [base.s0, base.s1]) { const p = pointAt(line, s); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) want.add(`${Math.floor(p.x / CHUNK) + dx}_${Math.floor(p.z / CHUNK) + dz}`); }
        const roads = [];
        await Promise.all([...want].map(async (key) => {
          try { const c = await (await fetch(`/world/chunks/${key}.json`)).json(); for (const h of c.highways ?? []) if (h.a && h.b && /^(ring|spur|link)$/.test(h.kind)) roads.push({ a: h.a, b: h.b, id: h.id }); } catch { /* no chunk there */ }
        }));
        if (alive) setRoute(tunnelRoute(line, roads));
      } catch { /* no world */ }
    })();
    return () => { alive = false; };
  }, []);
  return route;
}

// the tunnel's road: a link from the main road of the area (the ring road) to each portal, and a marker at the bridge road's first point, for comparison (the tunnel's road starts before it)
function Approach({ route }) {
  const line = route.line;
  const ribbons = route.links.length ? route.links.map((l) => [l.from, l.to]) : [[pointAt(line, route.approach0), pointAt(line, route.s0)], [pointAt(line, route.s1), pointAt(line, route.approach1)]];
  return (
    <group name="tunnel-approach">
      {ribbons.map(([a, b], i) => {
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        return <mesh key={i} position={[(a.x + b.x) / 2, TUNNEL.ground - 0.04, (a.z + b.z) / 2]} rotation={[0, Math.atan2(b.x - a.x, b.z - a.z), 0]}><boxGeometry args={[TUNNEL.width, 0.12, len]} /><meshStandardMaterial color="#1f2937" roughness={0.9} /></mesh>;
      })}
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
    camera.near = 0.05; // (and out with height: useFrame below)
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
    // the near plane moves out with the height (up to 6): a 24-bit depth buffer has a grain of distance squared over near, and at 0.05 it is 0.1 of a unit at 300 away, which shows as stripes of the sea through the ground
    const near = camera.position.y < 1 ? 0.05 : Math.min(6, 0.025 * camera.position.y + 0.05);
    if (Math.abs(camera.near - near) > near * 0.1) { camera.near = near; camera.updateProjectionMatrix(); }
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
      <Approach route={route} />
      <CameraLight />
    </group>
  );
}

