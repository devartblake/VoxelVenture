"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { LOOPS } from '@/lib/performance/visibilityPolicy';
import { useGatedFrame } from '@/lib/performance/runtime';
import { propEntry, propMaterial, useProps, usePropsReady } from '@/components/city/PropModels';
import { fleetRefs } from '@/lib/state/fleetStore';
import { activeTerrain } from '@/lib/world/terrain';
import { TRAIN, TRAIN_MODEL_IDS, cars, pointAt, railTiles, railY, station, trainLine, trainState } from '@/lib/world/train';

// The train on the first causeway (lib/world/train.js, docs/world/train.md): the rail beside the road, a station at each end, and the train, placed from the clock every frame (so everyone sees it
// in the same place). Mounted with the baked world (?world=baked) and on the dev page. It also tells the rest of the game where the line is (fleetRefs.trainLine) so a player can board.
const model = (name) => `train/${name}`;
// the clock the train runs on: the wall clock (every player sees it in the same place); ?trainat=<seconds> holds it at that second of the cycle, to look at it
const held = typeof window !== 'undefined' ? Number(new URLSearchParams(window.location.search).get('trainat')) : NaN;
const now = () => (Number.isFinite(held) ? held * 1000 : Date.now());
// the ground under the rail on the shore: the baked terrain once the chunks near it are loaded (0 before)
const ground = (x, z) => activeTerrain()?.groundY(x, z) ?? 0;
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const quat = new THREE.Quaternion();
const mat = new THREE.Matrix4();
const pos = new THREE.Vector3();
const scl = new THREE.Vector3(TRAIN.scale, TRAIN.scale, TRAIN.scale);

// yaw about the vertical, then the slope (a positive pitch is nose up, which is a negative turn about x)
// `shift` moves the model in its own frame first, in model units (the rail's origin is not its middle: it runs 0 to 4 along z and lies 1 below y 0, the catalogue's cz = 2 and y0 = -1)
const shiftV = new THREE.Vector3();
const place = (m, x, y, z, yaw, pitch, shift = null) => {
  euler.set(-pitch, yaw, 0);
  quat.setFromEuler(euler);
  pos.set(x, y, z);
  if (shift) pos.add(shiftV.set(shift[0], shift[1], shift[2]).multiplyScalar(TRAIN.scale).applyQuaternion(quat));
  return m.compose(pos, quat, scl);
};
const RAIL_SHIFT = [0, 1, -2]; // (-cx, -y0, -cz) of railroad-straight: its middle to the tile's middle, its underside to the rail height

function Station({ line, which, tick }) {
  const st = useMemo(() => station(line, which), [line, which]);
  const y = useMemo(() => railY(line, st.s, ground), [line, st.s, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const along = { x: line.dir.x, z: line.dir.z }, side = { x: line.normal.x, z: line.normal.z };
  const roofAt = (k) => [st.x + along.x * k, y + 1.9, st.z + along.z * k];
  return (
    <group name={`station-${which}`}>
      {/* the platform, with a roof on four posts */}
      <mesh position={[st.x, y + 0.14, st.z]} rotation={[0, line.yaw, 0]} castShadow receiveShadow><boxGeometry args={[2.6, 0.3, 11]} /><meshStandardMaterial color="#94a3b8" roughness={0.9} /></mesh>
      <mesh position={[st.x, y + 0.31, st.z]} rotation={[0, line.yaw, 0]}><boxGeometry args={[0.18, 0.02, 11]} /><meshStandardMaterial color="#fbbf24" roughness={0.8} /></mesh>
      <mesh position={roofAt(0)} rotation={[0, line.yaw, 0]} castShadow><boxGeometry args={[2.9, 0.14, 8]} /><meshStandardMaterial color={which === 'A' ? '#ef4444' : '#0ea5e9'} roughness={0.7} /></mesh>
      {[-3.4, 3.4].flatMap((k) => [-0.9, 0.9].map((o) => (
        <mesh key={`${k}${o}`} position={[st.x + along.x * k + side.x * o, y + 1.0, st.z + along.z * k + side.z * o]} castShadow><cylinderGeometry args={[0.07, 0.07, 1.8, 8]} /><meshStandardMaterial color="#e2e8f0" /></mesh>
      )))}
      {/* a bench */}
      <mesh position={[st.x + side.x * 0.7, y + 0.52, st.z + side.z * 0.7]} rotation={[0, line.yaw, 0]}><boxGeometry args={[0.35, 0.1, 2.2]} /><meshStandardMaterial color="#92400e" /></mesh>
    </group>
  );
}

export default function Train() {
  const [line, setLine] = useState(null);
  const ready = usePropsReady(TRAIN_MODEL_IDS);
  const geometries = useProps((s) => s.geometries);
  const materials = useProps((s) => s.materials);
  const rails = useRef(null);
  const carRefs = useRef([]);

  useEffect(() => {
    let alive = true;
    fetch('/world/manifest.json').then((r) => r.json()).then((m) => { if (alive && m.causeways?.length) { const l = trainLine(m.causeways[0]); fleetRefs.trainLine = l; setLine(l); } }).catch(() => {});
    return () => { alive = false; fleetRefs.trainLine = null; };
  }, []);

  // the shore's height is known once the terrain near it has loaded: look again every few seconds, and lay the rail and the platforms again when it changed
  const [tick, setTick] = useState(0);
  const seen = useRef('');
  useEffect(() => {
    if (!line) return undefined;
    const look = () => { const k = [line.sA, line.sB, line.deckFrom - 5].map((s) => { const p = pointAt(line, s); return ground(p.x, p.z).toFixed(2); }).join(); if (k !== seen.current) { seen.current = k; setTick((n) => n + 1); } };
    look();
    const id = setInterval(look, 3000);
    return () => clearInterval(id);
  }, [line]);
  const tiles = useMemo(() => (line ? railTiles(line, undefined, undefined, ground) : []), [line, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const mesh = rails.current;
    if (!mesh || !tiles.length) return;
    tiles.forEach((t, i) => mesh.setMatrixAt(i, place(mat, t.x, t.y, t.z, t.yaw, t.pitch, RAIL_SHIFT)));
    mesh.count = tiles.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [tiles, ready]);

  // the train: from the clock, every frame
  useGatedFrame(LOOPS.visible, () => {
    if (!line) return;
    const consist = cars(line, trainState(line, now()), ground);
    consist.forEach((c, i) => {
      const m = carRefs.current[i];
      if (!m) return;
      euler.set(-c.pitch, c.yaw, 0);
      m.quaternion.setFromEuler(euler);
      m.position.set(c.x, c.y, c.z);
    });
  });

  if (!line) return null;
  const railEntry = propEntry(model('railroad-straight'));
  return (
    <group name="train">
      <Station line={line} which="A" tick={tick} />
      <Station line={line} which="B" tick={tick} />
      {ready && geometries[model('railroad-straight')] && (
        <instancedMesh ref={rails} args={[geometries[model('railroad-straight')], propMaterial(materials, railEntry), Math.max(1, tiles.length)]} receiveShadow frustumCulled={false} />
      )}
      {ready && TRAIN.cars.map((name, i) => {
        const id = model(name);
        const entry = propEntry(id);
        return geometries[id] ? <mesh key={i} ref={(m) => { carRefs.current[i] = m; }} geometry={geometries[id]} material={propMaterial(materials, entry)} scale={TRAIN.scale} castShadow receiveShadow frustumCulled={false} /> : null;
      })}
    </group>
  );
}

