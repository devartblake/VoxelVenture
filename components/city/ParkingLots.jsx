"use client";

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PROP_CATALOG } from '@/lib/content/propCatalog';
import { buildingSize } from '@/lib/city/cityGenerator';
import { carModelFor } from '@/lib/content/props';
import { PARKING_SHARE } from '@/lib/content/models';
import PropInstances, { usePropsReady } from './PropModels';

// The car park behind some of the buildings: dark asphalt, white bay lines, and a few parked cars (Kenney Car Kit). The building takes the
// front of its plot (lib/content/models.js: hasParking), the lot the strip behind it. Drawn only where a building model stands, since the
// plain box buildings fill their whole plot.
const BAY = 0.58; // width of a parking bay
const SLAB_Y = 0.112;
const CAR_IDS = PROP_CATALOG.filter((m) => m.cls === 'car').map((m) => m.id);
const hash = (a, b) => (Math.imul(Math.floor(a) * 2654435761 + Math.floor(b) * 40503 + 7, 2246822519) >>> 0) / 4294967296;

// Everything in a lot, in the plot's own space, then moved to the world with the plot's position and turn.
export function lotLayout(plot) {
  const { bw, bd } = buildingSize(plot);
  const f = plot.facing ?? 1;
  const depth = bd * PARKING_SHARE - 0.08; // a small gap between the building and the lot
  const zc = -f * (bd / 2 - (bd * PARKING_SHARE) / 2 + 0.04);
  const bays = Math.max(2, Math.floor((bw - 0.1) / BAY));
  const pitch = (bw - 0.1) / bays;
  const lines = [];
  for (let k = 0; k <= bays; k++) lines.push({ x: -(bw - 0.1) / 2 + k * pitch });
  const cars = [];
  for (let k = 0; k < bays; k++) if (hash(plot.id, k) < 0.55) cars.push({ x: -(bw - 0.1) / 2 + (k + 0.5) * pitch, id: plot.id * 31 + k });
  return { slab: { x: 0, z: zc, w: bw, d: depth }, lines, lineZ: zc, lineLen: depth - 0.1, cars, f };
}

const toWorld = (plot, x, z) => {
  const yaw = plot.yaw ?? 0;
  return [plot.x + x * Math.cos(yaw) + z * Math.sin(yaw), plot.z - x * Math.sin(yaw) + z * Math.cos(yaw)];
};

export default function ParkingLots({ plots, assignments, ready }) {
  const lots = useMemo(() => (ready ? plots.filter((p) => assignments.get(p.id)?.parking).map((p) => ({ plot: p, ...lotLayout(p) })) : []), [plots, assignments, ready]);
  const slabs = useRef(null);
  const lineMesh = useRef(null);
  const lineCount = lots.reduce((n, l) => n + l.lines.length, 0);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    lots.forEach(({ plot, slab }, i) => {
      const [x, z] = toWorld(plot, slab.x, slab.z);
      dummy.position.set(x, SLAB_Y - 0.01, z);
      dummy.rotation.set(0, plot.yaw ?? 0, 0);
      dummy.scale.set(slab.w, 0.02, slab.d);
      dummy.updateMatrix();
      slabs.current?.setMatrixAt(i, dummy.matrix);
    });
    if (slabs.current) {
      slabs.current.count = lots.length;
      slabs.current.instanceMatrix.needsUpdate = true;
    }
    let n = 0;
    for (const { plot, lines, lineZ, lineLen } of lots) {
      for (const ln of lines) {
        const [x, z] = toWorld(plot, ln.x, lineZ);
        dummy.position.set(x, SLAB_Y + 0.002, z);
        dummy.rotation.set(0, plot.yaw ?? 0, 0);
        dummy.scale.set(0.025, 0.006, lineLen);
        dummy.updateMatrix();
        lineMesh.current?.setMatrixAt(n++, dummy.matrix);
      }
    }
    if (lineMesh.current) {
      lineMesh.current.count = lineCount;
      lineMesh.current.instanceMatrix.needsUpdate = true;
    }
  }, [lots, lineCount]);

  const carsReady = usePropsReady(CAR_IDS);
  const cars = useMemo(() => {
    if (!carsReady) return [];
    const out = [];
    for (const { plot, cars: list, lineZ, f } of lots) {
      for (const c of list) {
        const m = carModelFor({ id: c.id });
        const [x, z] = toWorld(plot, c.x, lineZ);
        // nose to the building or to the street, by the car's number
        const turn = hash(c.id, 5) < 0.5 ? 0 : Math.PI;
        out.push({ x, z, y: SLAB_Y, tint: `hsl(${Math.floor(hash(c.id, 9) * 360)} 45% 60%)`, model: { ...m, scale: m.scale * 0.8, offset: m.offset.map((v) => v * 0.8), rotY: (plot.yaw ?? 0) + (f < 0 ? Math.PI : 0) + turn } });
      }
    }
    return out;
  }, [lots, carsReady]);

  if (!lots.length) return null;
  return (
    <group name="parking-lots">
      <instancedMesh ref={slabs} args={[null, null, lots.length]} receiveShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1f2937" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={lineMesh} args={[null, null, Math.max(1, lineCount)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#e2e8f0" />
      </instancedMesh>
      <PropInstances items={cars} />
    </group>
  );
}
