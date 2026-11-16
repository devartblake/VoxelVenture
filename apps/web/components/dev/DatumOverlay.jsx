"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { DATUM_ISSUES, layers as datumLayers } from '@/lib/world/datum';
import { TUNNEL } from '@/lib/world/tunnel';

// DEVELOPMENT TOOL (docs/world/datum.md): the world's datum drawn in the scene: a grid at every named height (lib/world/datum.js: the sea plane, the seabed, the town's ground and water, the shore, the rail, a bridge deck, the
// tunnel's roof and road), centred on where you are looking, each switched on or off from the legend. /world/stream?datum=1 (or the Datum button). `useDatumLayers(manifest)` gives the list; <DatumPlanes> draws it inside the canvas and
// <DatumLegend> lists it beside it, with the camera's height and the disagreements the datum has not settled.
export function useDatumLayers(manifest) {
  const deck = manifest?.causeways?.[0]?.clearance ?? 9;
  return useMemo(() => datumLayers({ deck, tunnelFloor: TUNNEL.floor, tunnelRoof: TUNNEL.floor + TUNNEL.height }), [deck]);
}

const SIZE = 800; // a grid is this wide, in units, round the focus
const SNAP = 40;

export function DatumPlanes({ layers, enabled, focus }) {
  const { camera } = useThree();
  const group = useRef(null);
  const grids = useMemo(() => layers.map((l) => {
    const g = new THREE.GridHelper(SIZE, SIZE / SNAP, l.color, l.color);
    g.material.transparent = true;
    g.material.opacity = 0.75;
    g.material.depthWrite = false;
    g.renderOrder = 10;
    g.position.y = l.y;
    g.userData.id = l.id;
    // a faint sheet of the layer's colour under the grid, so a layer can be told from the next at a glance
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshBasicMaterial({ color: l.color, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false }));
    sheet.rotation.x = -Math.PI / 2;
    sheet.renderOrder = 9;
    g.add(sheet);
    return g;
  }), [layers]);
  useEffect(() => { grids.forEach((g) => { g.visible = Boolean(enabled[g.userData.id]); }); }, [grids, enabled]);
  useEffect(() => () => grids.forEach((g) => { g.geometry.dispose(); g.material.dispose(); g.children.forEach((c) => { c.geometry.dispose(); c.material.dispose(); }); }), [grids]);
  let last = 0;
  useFrame((state) => {
    const f = focus();
    if (group.current) group.current.position.set(Math.round(f.x / SNAP) * SNAP, 0, Math.round(f.z / SNAP) * SNAP);
    if (state.clock.elapsedTime - last > 0.25) { last = state.clock.elapsedTime; const el = document.getElementById('datum-cam-y'); if (el) el.textContent = camera.position.y.toFixed(2); }
  });
  return <group ref={group}>{grids.map((g) => <primitive key={g.userData.id} object={g} />)}</group>;
}

export function DatumLegend({ layers, enabled, onToggle }) {
  return (
    <div style={{ position: 'absolute', zIndex: 3, top: 44, right: 8, width: 330, maxHeight: '86vh', overflow: 'auto', background: 'rgba(11,27,51,0.9)', color: '#e2e8f0', font: '12px system-ui', padding: 10, borderRadius: 8 }} data-testid="datum-legend">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>The world datum <span style={{ fontWeight: 400, opacity: 0.8 }}>(camera y: <b id="datum-cam-y">-</b>)</span></div>
      {[...layers].sort((a, b) => b.y - a.y).map((l) => (
        <label key={l.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', margin: '3px 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={Boolean(enabled[l.id])} onChange={() => onToggle(l.id)} />
          <span style={{ width: 10, height: 10, background: l.color, marginTop: 3, flex: 'none' }} />
          <span><b>{l.y.toFixed(3)}</b> {l.label}<br /><span style={{ opacity: 0.7 }}>{l.note}</span></span>
        </label>
      ))}
      <div style={{ fontWeight: 700, margin: '10px 0 4px' }}>Not settled yet</div>
      {DATUM_ISSUES.map((i) => <div key={i.id} style={{ margin: '3px 0', opacity: 0.9 }}>• {i.what} <span style={{ opacity: 0.7 }}>({i.gap.toFixed(3)})</span></div>)}
    </div>
  );
}
