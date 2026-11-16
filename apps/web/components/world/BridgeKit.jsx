"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { deckSegments } from '@/lib/world/suspension';
import { DECK } from '@/lib/world/bridgeDeckSpec';
import { registerGlow } from '@/components/city/nightLights';
import { trainLine } from '@/lib/world/train';

// What the styled bridges (Suspension.jsx, ArchBridge.jsx) share: finding the causeway, placing a point of the bridge in the world, instanced boxes and rods, the girder deck and the night lights.
const D = new THREE.Object3D();
const UP = new THREE.Vector3(0, 1, 0);
const q = new THREE.Quaternion();

/** The causeway of the manifest with one of these ids, as a line (lib/world/train.js trainLine) and a bridge ({ id, span, clearance }); null until it is loaded. */
export function useCauseway(ids) {
  const [found, setFound] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch('/world/manifest.json').then((r) => r.json()).then((m) => {
      const c = m.causeways?.find((x) => ids.includes(x.id));
      if (alive && c) { const line = trainLine(c); setFound({ line, bridge: { id: line.id, span: line.bridgeLen, clearance: line.clearance } }); }
    }).catch(() => {});
    return () => { alive = false; };
  }, [ids]);
  return found;
}

/** A point of the bridge (s along it, lateral across it, y high) as x, y, z. */
export const placeAt = (line, s, lateral, y) => new THREE.Vector3(line.a.x + line.dir.x * (line.deckFrom + s) + line.normal.x * lateral, y, line.a.z + line.dir.z * (line.deckFrom + s) + line.normal.z * lateral);

/** Instanced boxes: `list` of { p (a Vector3), size: [x across, y high, z along], pitch? }, turned to the bridge's line. */
export function Boxes({ list, line, color, roughness = 0.6, metalness = 0.2, cast = true, vertexColors = null }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const c = new THREE.Color();
    list.forEach((b, i) => {
      D.position.copy(b.p);
      D.rotation.set(0, 0, 0);
      D.rotateY(line.yaw);
      if (b.pitch) D.rotateX(-b.pitch);
      D.scale.set(b.size[0], b.size[1], b.size[2]);
      D.updateMatrix();
      ref.current.setMatrixAt(i, D.matrix);
      if (vertexColors && b.color) ref.current.setColorAt(i, c.set(b.color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [list, line, vertexColors]);
  if (!list.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, list.length]} castShadow={cast} receiveShadow frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={vertexColors ? '#ffffff' : color} roughness={roughness} metalness={metalness} />
    </instancedMesh>
  );
}

/** Instanced rods: `list` of { a, b (Vector3s), r (the radius) }. */
export function Rods({ list, color, roughness = 0.5, metalness = 0.3, cast = true }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    list.forEach((r, i) => {
      const dir = r.b.clone().sub(r.a);
      const len = dir.length();
      D.position.copy(r.a).lerp(r.b, 0.5);
      D.quaternion.copy(q.setFromUnitVectors(UP, dir.divideScalar(len || 1)));
      D.scale.set(r.r * 2, len, r.r * 2);
      D.updateMatrix();
      ref.current.setMatrixAt(i, D.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [list]);
  if (!list.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, list.length]} castShadow={cast} frustumCulled={false}>
      <cylinderGeometry args={[0.5, 0.5, 1, 6]} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </instancedMesh>
  );
}

/** The girder deck of a styled bridge: the girder in `color`, the road, a kerb on each edge and the lane line (the road surface is the game's deckHeight, so what is on the deck is on it). */
export function BridgeDeck({ line, bridge, color }) {
  const girders = useMemo(() => {
    const out = [];
    for (const g of deckSegments(bridge)) out.push({ p: placeAt(line, g.s, 0, g.y - DECK.thickness / 2 - 0.02), size: [DECK.width + 0.5, DECK.thickness, g.length * 1.02], pitch: g.pitch });
    return out;
  }, [line, bridge]);
  const surface = useMemo(() => {
    const out = [];
    const K = DECK.kerb;
    for (const g of deckSegments(bridge)) {
      out.push({ p: placeAt(line, g.s, 0, g.y - 0.02), size: [DECK.width - 1.2, 0.08, g.length * 1.02], pitch: g.pitch, color: '#374151' });
      for (const side of [-1, 1]) out.push({ p: placeAt(line, g.s, side * K.centre, g.y + K.height / 2 - 0.02), size: [K.width, K.height + 0.04, g.length * 1.02], pitch: g.pitch, color: '#9ca3af' });
      out.push({ p: placeAt(line, g.s, 0, g.y + 0.025), size: [0.14, 0.03, g.length * 0.55], pitch: g.pitch, color: '#f8fafc' });
    }
    return out;
  }, [line, bridge]);
  return (
    <group name="bridge-deck">
      <Boxes list={girders} line={line} color={color} roughness={0.6} metalness={0.2} />
      <Boxes list={surface} line={line} vertexColors roughness={0.9} metalness={0} cast={false} />
    </group>
  );
}

// the night lights: a glowing material is registered once with the game's dusk (components/city/nightLights.js): faint by day, bright at night
const beaconMaterial = new THREE.MeshStandardMaterial({ color: '#7f1d1d', emissive: '#ff2a1a', emissiveIntensity: 0.3 });
registerGlow(beaconMaterial, { day: 0.25, night: 5 });
const warmMaterial = new THREE.MeshStandardMaterial({ color: '#78350f', emissive: '#ffd27a', emissiveIntensity: 0 });
registerGlow(warmMaterial, { day: 0, night: 3.2 });

/** Small glowing lights: `lights` of { kind: 'beacon' | 'warm', s, lateral, y } placed on the bridge. Two instanced meshes. */
export function BridgeLights({ line, lights, size = 0.36 }) {
  const beacons = useMemo(() => lights.filter((l) => l.kind === 'beacon').map((l) => placeAt(line, l.s, l.lateral, l.y)), [line, lights]);
  const warms = useMemo(() => lights.filter((l) => l.kind === 'warm').map((l) => placeAt(line, l.s, l.lateral, l.y)), [line, lights]);
  const refs = [useRef(null), useRef(null)];
  useLayoutEffect(() => {
    [[refs[0], beacons, size * 1.7], [refs[1], warms, size]].forEach(([ref, list, sc]) => {
      if (!ref.current) return;
      list.forEach((p, i) => { D.position.copy(p); D.rotation.set(0, 0, 0); D.scale.setScalar(sc); D.updateMatrix(); ref.current.setMatrixAt(i, D.matrix); });
      ref.current.instanceMatrix.needsUpdate = true;
      ref.current.computeBoundingSphere();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beacons, warms, size]);
  return (
    <group name="bridge-lights">
      {beacons.length > 0 && <instancedMesh ref={refs[0]} args={[undefined, undefined, beacons.length]} material={beaconMaterial} frustumCulled={false}><sphereGeometry args={[1, 8, 6]} /></instancedMesh>}
      {warms.length > 0 && <instancedMesh ref={refs[1]} args={[undefined, undefined, warms.length]} material={warmMaterial} frustumCulled={false}><sphereGeometry args={[1, 8, 6]} /></instancedMesh>}
    </group>
  );
}
