"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { SUSPENSION, deckSegments, suspension } from '@/lib/world/suspension';
import { trainLine } from '@/lib/world/train';

// The suspension bridge's towers, cables and suspenders (lib/world/suspension.js, docs/world/suspension_bridge.md): drawn over Harbor Causeway's deck, in International Orange. Mounted with the baked world (?world=baked)
// and on the dev page. Three instanced meshes (boxes for the towers, cylinders for the cables and the suspenders): a few hundred instances, three draw calls, always drawn (it is one structure of 400 units).
const D = new THREE.Object3D();
const UP = new THREE.Vector3(0, 1, 0);
const quat = new THREE.Quaternion();

export default function Suspension() {
  const [line, setLine] = useState(null);
  const boxes = useRef(null);
  const rods = useRef(null);
  const girder = useRef(null);
  const road = useRef(null);
  useEffect(() => {
    let alive = true;
    fetch('/world/manifest.json').then((r) => r.json()).then((m) => { const c = m.causeways?.find((x) => SUSPENSION.ids.includes(x.id)); if (alive && c) setLine(trainLine(c)); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // the structure, placed in the world: a point of the bridge (s along it, lateral across it, y high) to x, y, z
  const parts = useMemo(() => {
    if (!line) return null;
    const bridge = { id: line.id, span: line.bridgeLen, clearance: line.clearance };
    const st = suspension(bridge);
    const at = (s, lateral, y) => new THREE.Vector3(line.a.x + line.dir.x * (line.deckFrom + s) + line.normal.x * lateral, y, line.a.z + line.dir.z * (line.deckFrom + s) + line.normal.z * lateral);
    const boxList = [];
    for (const t of st.towers) {
      for (const leg of t.legs) for (const b of leg.boxes) boxList.push({ p: at(t.s, leg.lateral, (b.y0 + b.y1) / 2), size: [b.across, b.y1 - b.y0, b.along] });
      for (const br of t.braces) boxList.push({ p: at(t.s, (br.lateral0 + br.lateral1) / 2, br.y), size: [br.lateral1 - br.lateral0, 0.8, 1.1] });
    }
    const rodList = [];
    const rod = (a, b, r) => rodList.push({ a, b, r });
    for (const c of st.cables) for (let i = 1; i < c.points.length; i++) rod(at(c.points[i - 1].s, c.side * SUSPENSION.legOffset, c.points[i - 1].y), at(c.points[i].s, c.side * SUSPENSION.legOffset, c.points[i].y), SUSPENSION.cableRadius);
    for (const h of st.hangers) rod(at(h.s, h.side * SUSPENSION.legOffset, h.y0), at(h.s, h.side * SUSPENSION.legOffset, h.y1), SUSPENSION.hangerRadius);
    // the deck: for each piece along the slope, the girder under the road, the road, a kerb walk on each edge and the lane line
    const segs = deckSegments(bridge);
    const deckList = [];
    for (const g of segs) {
      const c = at(g.s, 0, g.y);
      deckList.push({ part: 'girder', p: new THREE.Vector3(c.x, g.y - SUSPENSION.deckThickness / 2 - 0.02, c.z), size: [SUSPENSION.deckWidth + 0.5, SUSPENSION.deckThickness, g.length * 1.02], pitch: g.pitch });
      deckList.push({ part: 'road', p: new THREE.Vector3(c.x, g.y - 0.02, c.z), size: [SUSPENSION.deckWidth - 1.2, 0.08, g.length * 1.02], pitch: g.pitch });
      for (const side of [-1, 1]) { const K = SUSPENSION.kerb; const w = at(g.s, side * K.centre, g.y + K.height / 2 - 0.02); deckList.push({ part: 'walk', p: w, size: [K.width, K.height + 0.04, g.length * 1.02], pitch: g.pitch }); }
      deckList.push({ part: 'line', p: new THREE.Vector3(c.x, g.y + 0.025, c.z), size: [0.14, 0.03, g.length * 0.55], pitch: g.pitch });
    }
    return { boxList, rodList, deckList };
  }, [line]);

  // the deck pieces in two instanced meshes: the girder in orange, and the road, kerbs and lane line in their own colours
  useLayoutEffect(() => {
    if (!parts || !girder.current || !road.current) return;
    const colors = { road: '#374151', walk: '#9ca3af', line: '#f8fafc' };
    const c = new THREE.Color();
    let gi = 0, ri = 0;
    for (const d of parts.deckList) {
      D.position.copy(d.p);
      D.rotation.set(0, 0, 0);
      D.rotateY(line.yaw);
      D.rotateX(-d.pitch);
      D.scale.set(d.size[0], d.size[1], d.size[2]);
      D.updateMatrix();
      if (d.part === 'girder') girder.current.setMatrixAt(gi++, D.matrix);
      else { road.current.setMatrixAt(ri, D.matrix); road.current.setColorAt(ri++, c.set(colors[d.part])); }
    }
    for (const m of [girder.current, road.current]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); }
  }, [parts, line]);

  useLayoutEffect(() => {
    if (!parts || !boxes.current || !rods.current) return;
    parts.boxList.forEach((b, i) => {
      D.position.copy(b.p);
      D.rotation.set(0, line.yaw, 0);
      D.scale.set(b.size[0], b.size[1], b.size[2]);
      D.updateMatrix();
      boxes.current.setMatrixAt(i, D.matrix);
    });
    boxes.current.instanceMatrix.needsUpdate = true;
    boxes.current.computeBoundingSphere();
    parts.rodList.forEach((r, i) => {
      const dir = r.b.clone().sub(r.a);
      const len = dir.length();
      D.position.copy(r.a).lerp(r.b, 0.5);
      D.quaternion.copy(quat.setFromUnitVectors(UP, dir.divideScalar(len || 1)));
      D.scale.set(r.r * 2, len, r.r * 2);
      D.updateMatrix();
      rods.current.setMatrixAt(i, D.matrix);
    });
    rods.current.instanceMatrix.needsUpdate = true;
    rods.current.computeBoundingSphere();
  }, [parts, line]);

  if (!parts) return null;
  const girders = parts.deckList.filter((d) => d.part === 'girder').length;
  return (
    <group name="suspension">
      <instancedMesh ref={girder} args={[undefined, undefined, girders]} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={SUSPENSION.color} roughness={0.6} metalness={0.2} />
      </instancedMesh>
      <instancedMesh ref={road} args={[undefined, undefined, parts.deckList.length - girders]} receiveShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={boxes} args={[undefined, undefined, parts.boxList.length]} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={SUSPENSION.color} roughness={0.55} metalness={0.25} />
      </instancedMesh>
      <instancedMesh ref={rods} args={[undefined, undefined, parts.rodList.length]} castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.5, 0.5, 1, 6]} />
        <meshStandardMaterial color={SUSPENSION.color} roughness={0.5} metalness={0.3} />
      </instancedMesh>
    </group>
  );
}
