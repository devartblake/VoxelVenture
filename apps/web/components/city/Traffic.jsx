"use client";

import { remoteParkedCars, useNet } from '@/lib/net/multiplayer';
import React, { useEffect, useMemo, useRef } from 'react';
import { LOOPS } from '@/lib/performance/visibilityPolicy';
import { useGatedFrame } from '@/lib/performance/runtime';
import * as THREE from 'three';
import { avatarState } from '@/lib/sim/avatarState';
import { surfaceHeight } from '@/lib/city/surfaceHeight';
import { createTraffic } from '@/lib/sim/traffic';
import { fleetRefs, useFleet } from '@/lib/state/fleetStore';
import { PROP_CATALOG } from '@/lib/content/propCatalog';
import { carModelFor } from '@/lib/content/props';
import { propEntry, propMaterial, usePropsReady, useProps } from './PropModels';

const MAX_CARS = 64;
const MAX_WALKERS = 72;


// Parts of a car / walker as local transforms, so every vehicle is a handful of instanced meshes
// (one draw call per part for ALL cars, and for ALL walkers) instead of dozens of separate meshes.
const local = (x, y, z, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

const CAR_PARTS = {
  body: local(0, 0.17, 0),
  cabin: local(0, 0.31, -0.05),
  wheels: [[-0.21, 0.07, 0.26], [0.21, 0.07, 0.26], [-0.21, 0.07, -0.26], [0.21, 0.07, -0.26]].map(([x, y, z]) => local(x, y, z, 0, 0, Math.PI / 2)),
  headlights: [-0.12, 0.12].map((x) => local(x, 0.19, 0.4)),
  taillights: [-0.12, 0.12].map((x) => local(x, 0.19, -0.4)),
};

// Fixed offsets for the walker's parts, built once (not per person per frame).
const LEG_OFFSET = local(0, -0.1, 0);
const ARM_OFFSET = local(0, -0.08, 0);
const TORSO_AT = local(0, 0.3, 0);
const HEAD_AT = local(0, 0.47, 0);

// Kenney car models (CC0) replace the box cars once every one of them has loaded.
const CAR_MODEL_IDS = PROP_CATALOG.filter((m) => m.cls === 'car' || m.cls === 'truck').map((m) => m.id);
const WHITE = new THREE.Color('#ffffff');
const tmpCar = new THREE.Matrix4();
const tmpPart = new THREE.Matrix4();
const tmpWalker = new THREE.Matrix4();
const dummy = new THREE.Object3D();
const color = new THREE.Color();

function Instanced({ geometry, material, count, castShadow = false, refProp }) {
  return (
    <instancedMesh ref={refProp} args={[geometry, material, count]} frustumCulled={false} castShadow={castShadow}>
      {null}
    </instancedMesh>
  );
}

// Cars driving the roads and people walking the sidewalks, from the simulation in lib/sim/traffic.js.
// Cars stop for red lights, stop signs and people on crosswalks; people cross at the zebras.
export default function Traffic({ layout }) {
  const sim = useMemo(
    () => createTraffic(layout, { seed: layout.seed, maxCars: 46, maxWalkers: 56, avatar: avatarState }),
    [layout]
  );

  // the cars the player left parked: remembered between visits, and traffic queues behind them
  useEffect(() => {
    useFleet.getState().hydrate(layout.seed);
    // our parked cars, and the ones other players left
    const sync = () => {
      sim.obstacles.length = 0;
      for (const p of useFleet.getState().parked) sim.obstacles.push({ x: p.x, z: p.z });
      for (const p of remoteParkedCars()) sim.obstacles.push({ x: p.x, z: p.z });
    };
    sync();
    const offFleet = useFleet.subscribe((s, prev) => {
      if (s.parked !== prev.parked) sync();
    });
    const offNet = useNet.subscribe((s, prev) => {
      if (s.parkedV !== prev.parkedV) sync();
    });
    return () => {
      offFleet();
      offNet();
    };
  }, [sim, layout.seed]);

  // the player can take one of these cars (lib/state/fleetStore.js)
  useEffect(() => {
    fleetRefs.sim = sim;
    return () => {
      if (fleetRefs.sim === sim) fleetRefs.sim = null;
    };
  }, [sim]);

  const geo = useMemo(
    () => ({
      body: new THREE.BoxGeometry(0.4, 0.14, 0.8),
      cabin: new THREE.BoxGeometry(0.34, 0.14, 0.42),
      wheel: new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10),
      light: new THREE.BoxGeometry(0.08, 0.05, 0.02),
      leg: new THREE.BoxGeometry(0.07, 0.2, 0.07),
      torso: new THREE.BoxGeometry(0.17, 0.2, 0.1),
      arm: new THREE.BoxGeometry(0.05, 0.18, 0.05),
      head: new THREE.BoxGeometry(0.13, 0.13, 0.13),
    }),
    []
  );
  const mat = useMemo(
    () => ({
      paint: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.2 }),
      glass: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.2, metalness: 0.4 }),
      tyre: new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.9 }),
      head: new THREE.MeshStandardMaterial({ color: '#fef9c3', emissive: '#fef08a', emissiveIntensity: 1.6 }),
      tail: new THREE.MeshStandardMaterial({ color: '#7f1d1d', emissive: '#ef4444', emissiveIntensity: 1.2 }),
      cloth: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
      skin: new THREE.MeshStandardMaterial({ color: '#f2c9a0', roughness: 0.8 }),
    }),
    []
  );

  const carModelsReady = usePropsReady(CAR_MODEL_IDS);
  const propGeoms = useProps((s) => s.geometries);
  const propMats = useProps((s) => s.materials);
  const modelMeshes = useRef({});
  const modelOfCar = useRef(new Map());
  const body = useRef(null);
  const cabin = useRef(null);
  const wheels = useRef(null);
  const headlights = useRef(null);
  const taillights = useRef(null);
  const legs = useRef(null);
  const torsos = useRef(null);
  const arms = useRef(null);
  const heads = useRef(null);

  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mat).forEach((m) => m.dispose());
    },
    [geo, mat]
  );

  useGatedFrame(LOOPS.distantSimulation, (state, delta) => {
    sim.update(delta, state.clock.elapsedTime);
    if (!body.current || !legs.current) return; // first frame, before the meshes exist

    // ---- cars
    const cars = sim.curveCars.length ? sim.cars.concat(sim.curveCars) : sim.cars; // (the cars of curved streets are drawn the same way)
    const n = Math.min(cars.length, MAX_CARS);
    for (let i = 0; i < n; i++) {
      const c = cars[i];
      dummy.position.set(c.x, surfaceHeight(layout, c.x, c.z), c.z);
      dummy.rotation.set(0, c.yaw, 0);
      dummy.updateMatrix();
      tmpCar.copy(dummy.matrix);
      body.current.setMatrixAt(i, tmpPart.multiplyMatrices(tmpCar, CAR_PARTS.body));
      body.current.setColorAt(i, color.set(c.color));
      cabin.current.setMatrixAt(i, tmpPart.multiplyMatrices(tmpCar, CAR_PARTS.cabin));
      for (let k = 0; k < 4; k++) wheels.current.setMatrixAt(i * 4 + k, tmpPart.multiplyMatrices(tmpCar, CAR_PARTS.wheels[k]));
      for (let k = 0; k < 2; k++) {
        headlights.current.setMatrixAt(i * 2 + k, tmpPart.multiplyMatrices(tmpCar, CAR_PARTS.headlights[k]));
        taillights.current.setMatrixAt(i * 2 + k, tmpPart.multiplyMatrices(tmpCar, CAR_PARTS.taillights[k]));
      }
    }
    if (carModelsReady) {
      // the Kenney models draw the cars; the box parts are hidden
      const used = {};
      for (let i = 0; i < n; i++) {
        const c = cars[i];
        let m = modelOfCar.current.get(c.id);
        if (!m) {
          m = carModelFor(c);
          modelOfCar.current.set(c.id, m);
          if (modelOfCar.current.size > 400) modelOfCar.current.delete(modelOfCar.current.keys().next().value);
        }
        const mesh = m && modelMeshes.current[m.id];
        if (!mesh) continue;
        const k = (used[m.id] = (used[m.id] ?? -1) + 1);
        dummy.position.set(c.x, surfaceHeight(layout, c.x, c.z), c.z);
        dummy.rotation.set(0, c.yaw, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        tmpCar.copy(dummy.matrix);
        tmpPart.compose(new THREE.Vector3(m.offset[0], m.offset[1], m.offset[2]), new THREE.Quaternion(), new THREE.Vector3(m.scale, m.scale, m.scale));
        mesh.setMatrixAt(k, tmpPart.premultiply(tmpCar));
        mesh.setColorAt(k, color.copy(WHITE).lerp(new THREE.Color(c.color), 0.5));
      }
      for (const id of CAR_MODEL_IDS) {
        const mesh = modelMeshes.current[id];
        if (!mesh) continue;
        mesh.count = used[id] ?? 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
    body.current.count = cabin.current.count = carModelsReady ? 0 : n;
    wheels.current.count = carModelsReady ? 0 : n * 4;
    headlights.current.count = taillights.current.count = carModelsReady ? 0 : n * 2;
    for (const m of [body, cabin, wheels, headlights, taillights]) m.current.instanceMatrix.needsUpdate = true;
    if (body.current.instanceColor) body.current.instanceColor.needsUpdate = true;

    // ---- people
    const people = sim.curveWalkers.length ? sim.walkers.concat(sim.curveWalkers) : sim.walkers;
    const w = Math.min(people.length, MAX_WALKERS);
    for (let i = 0; i < w; i++) {
      const p = people[i];
      const y = surfaceHeight(layout, p.x, p.z);
      const swing = p.moving ? Math.sin(p.phase) * 0.7 : 0;
      dummy.position.set(p.x, y, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.updateMatrix();
      tmpWalker.copy(dummy.matrix);

      // legs and arms swing from the hip / shoulder
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1;
        dummy.position.set(side * 0.04, 0.2, 0);
        dummy.rotation.set(swing * side, 0, 0);
        dummy.updateMatrix();
        tmpPart.copy(dummy.matrix).multiply(LEG_OFFSET);
        legs.current.setMatrixAt(i * 2 + k, tmpPart.premultiply(tmpWalker));
        legs.current.setColorAt(i * 2 + k, color.set(p.pants));

        dummy.position.set(side * 0.11, 0.38, 0);
        dummy.rotation.set(-swing * side, 0, 0);
        dummy.updateMatrix();
        tmpPart.copy(dummy.matrix).multiply(ARM_OFFSET);
        arms.current.setMatrixAt(i * 2 + k, tmpPart.premultiply(tmpWalker));
        arms.current.setColorAt(i * 2 + k, color.set(p.shirt));
      }
      torsos.current.setMatrixAt(i, tmpPart.copy(tmpWalker).multiply(TORSO_AT));
      torsos.current.setColorAt(i, color.set(p.shirt));
      heads.current.setMatrixAt(i, tmpPart.copy(tmpWalker).multiply(HEAD_AT));
    }
    legs.current.count = arms.current.count = w * 2;
    torsos.current.count = heads.current.count = w;
    for (const m of [legs, arms, torsos, heads]) m.current.instanceMatrix.needsUpdate = true;
    for (const m of [legs, arms, torsos]) if (m.current.instanceColor) m.current.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      {carModelsReady &&
        CAR_MODEL_IDS.map((id) => (
          <instancedMesh
            key={id}
            ref={(m) => {
              modelMeshes.current[id] = m;
            }}
            args={[propGeoms[id], propMaterial(propMats, propEntry(id)), MAX_CARS]}
            frustumCulled={false}
            castShadow
          />
        ))}
      <Instanced refProp={body} geometry={geo.body} material={mat.paint} count={MAX_CARS} castShadow />
      <Instanced refProp={cabin} geometry={geo.cabin} material={mat.glass} count={MAX_CARS} castShadow />
      <Instanced refProp={wheels} geometry={geo.wheel} material={mat.tyre} count={MAX_CARS * 4} />
      <Instanced refProp={headlights} geometry={geo.light} material={mat.head} count={MAX_CARS * 2} />
      <Instanced refProp={taillights} geometry={geo.light} material={mat.tail} count={MAX_CARS * 2} />

      <Instanced refProp={legs} geometry={geo.leg} material={mat.cloth} count={MAX_WALKERS * 2} />
      <Instanced refProp={torsos} geometry={geo.torso} material={mat.cloth} count={MAX_WALKERS} castShadow />
      <Instanced refProp={arms} geometry={geo.arm} material={mat.cloth} count={MAX_WALKERS * 2} />
      <Instanced refProp={heads} geometry={geo.head} material={mat.skin} count={MAX_WALKERS} />
    </group>
  );
}
