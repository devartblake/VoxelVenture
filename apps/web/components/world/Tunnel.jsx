"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { LOOPS } from '@/lib/performance/visibilityPolicy';
import { useGatedFrame } from '@/lib/performance/runtime';
import { avatarState } from '@/lib/sim/avatarState';
import Label3D from '@/components/city/Label3D';
import { TUNNEL, floorY, pointAt } from '@/lib/world/tunnel';
import { tubePieces } from '@/lib/world/tunnelSpec';

const FLAT = 32; // under the sea, where the road is level, a piece is this long (a ramp's pieces are SEG: they follow the slope)

// The undersea tunnel in the world (docs/world/tunnel.md): the tube beside the Harbor Causeway, from the manifest's `tunnels` (lib/world/tunnel.js buildTunnels, baked): a road slab, walls, a roof with two lamp
// strips and a slab under it, all double-sided so the water never shows from inside, laid in 4-unit pieces along the profile (down from a portal, level under the sea, up again). The portals' trench is cut into
// the ground by the bake and the sea's plane is left out over it (lib/world/tunnelSpec.js). Mounted with the baked world and on the dev page. `?tunnel=0` leaves it out.
const SEG = 4; // the length of one piece of the tube
const D = new THREE.Object3D();

/** The tunnel of the baked world as a route ({ line (with yaw), s0, s1, ... }): null until the manifest is read, and where the world has none. */
export function useTunnel() {
  const [route, setRoute] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = await (await fetch('/world/manifest.json')).json();
        const t = m.tunnels?.[0];
        if (t && alive) setRoute({ ...t, line: { ...t.line, yaw: Math.atan2(t.line.dir.x, t.line.dir.z) } });
      } catch { /* no world */ }
    })();
    return () => { alive = false; };
  }, []);
  return route;
}

// one instanced set of boxes along the route: for each piece, a box at (lateral, y, length) in the piece's own frame, laid along the slope
function Strip({ route, y, lateral, width, thick, color, emissive, side = 0 }) {
  const ref = useRef(null);
  const pieces = React.useMemo(() => tubePieces(route, SEG, FLAT), [route]);
  const n = pieces.length;
  useLayoutEffect(() => {
    const line = route.line;
    pieces.forEach(({ s, len }, i) => {
      const p = pointAt(line, s);
      const y0 = floorY(route, s - len / 2), y1 = floorY(route, s + len / 2);
      const pitch = Math.atan2(y1 - y0, len);
      D.position.set(p.x + line.normal.x * lateral, y((y0 + y1) / 2, route, s), p.z + line.normal.z * lateral);
      D.rotation.set(0, 0, 0);
      D.rotateY(line.yaw);
      D.rotateX(-pitch);
      D.scale.set(width, thick, len * 1.02);
      D.updateMatrix();
      ref.current.setMatrixAt(i, D.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [route, pieces, y, lateral, width, thick, side]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} emissive={emissive ?? '#000000'} emissiveIntensity={emissive ? 1.6 : 0} />
    </instancedMesh>
  );
}

export function Tube({ route }) {
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
      <Strip route={route} lateral={L - 1.5} width={0.14} thick={0.04} color="#f8fafc" y={(f) => f + 0.02} />
      {/* the kerb between the rail's side and the road lane (TUNNEL.laneFrom) */}
      <Strip route={route} lateral={-(TUNNEL.laneFrom - 0.1)} width={0.2} thick={0.3} color="#cbd5e1" y={(f) => f + 0.15} />
      <Strip route={route} lateral={L - half + 0.5} width={0.3} thick={0.06} color="#fde68a" emissive="#fde68a" y={(f) => f + TUNNEL.height - 0.05} />
      <Strip route={route} lateral={L + half - 0.5} width={0.3} thick={0.06} color="#fde68a" emissive="#fde68a" y={(f) => f + TUNNEL.height - 0.05} />
    </group>
  );
}


// A portal: a frame round the mouth (two jambs and a lintel, with yellow-and-black hazard bands on the jambs) and a name board over it, at the tube's end `s` (route.s0 or route.s1); the opening faces `out` (-1 at the
// mainland's portal, whose outside is toward smaller s; +1 at the isle's).
function Portal({ route, s, out, label }) {
  const line = route.line, c = pointAt(line, s);
  const floor = floorY(route, s), half = TUNNEL.width / 2, h = TUNNEL.height + TUNNEL.wall;
  return (
    <group position={[c.x, floor, c.z]} rotation={[0, line.yaw, 0]} name={`portal-${out < 0 ? 'a' : 'b'}`}>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (half + TUNNEL.wall / 2 + 0.2), h / 2, 0]}><boxGeometry args={[0.9, h + 0.5, 1.2]} /><meshStandardMaterial color="#e5e7eb" roughness={0.8} /></mesh>
          {[0.5, 1.5, 2.5, 3.5].map((y) => <mesh key={y} position={[side * (half + TUNNEL.wall / 2 + 0.2), y, out * 0.61]}><boxGeometry args={[0.92, 0.45, 0.04]} /><meshStandardMaterial color={y % 1 === 0.5 && Math.floor(y) % 2 === 0 ? '#facc15' : '#111827'} roughness={0.7} /></mesh>)}
        </group>
      ))}
      <mesh position={[0, h + 0.25, 0]}><boxGeometry args={[TUNNEL.width + TUNNEL.wall * 2 + 2.2, 0.9, 1.2]} /><meshStandardMaterial color="#e5e7eb" roughness={0.8} /></mesh>
      <mesh position={[0, h + 1.35, out * 0.2]}><boxGeometry args={[TUNNEL.width + 1.2, 1.1, 0.25]} /><meshStandardMaterial color="#0f3d66" roughness={0.6} /></mesh>
      <Label3D text={label} position={[0, h + 1.35, out * 0.45]} background="#0f3d66" color="#ffffff" border="#7dd3fc" height={0.8} />
    </group>
  );
}

// Emergency exit signs along the road side's wall, every 40 units (emissive green: they are seen from a long way down the tube)
function ExitSigns({ route }) {
  const ref = useRef(null);
  const marks = useRef([]);
  const list = [];
  for (let s = route.s0 + 40; s < route.s1 - 20; s += 40) list.push(s);
  marks.current = list;
  useLayoutEffect(() => {
    const line = route.line;
    marks.current.forEach((s, i) => {
      const p = pointAt(line, s);
      D.position.set(p.x - line.normal.x * (TUNNEL.width / 2 - 0.06), floorY(route, s) + 2.1, p.z - line.normal.z * (TUNNEL.width / 2 - 0.06)); // (the road side is -normal)
      D.rotation.set(0, 0, 0);
      D.rotateY(line.yaw);
      D.scale.set(0.1, 0.34, 0.9);
      D.updateMatrix();
      ref.current.setMatrixAt(i, D.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [route]);
  if (!list.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, list.length]} frustumCulled={false} name="tunnel-exit-signs">
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#16a34a" emissive="#22c55e" emissiveIntensity={1.4} />
    </instancedMesh>
  );
}

// Emergency telephones: an orange cabinet with a blue lamp over it on the road side's wall every 80 units (between the exit signs); the tube's fittings are what a real one has, for the look: nothing uses them.
function Phones({ route }) {
  const box = useRef(null), lamp = useRef(null);
  const at = [];
  for (let s = route.s0 + 60; s < route.s1 - 40; s += 80) at.push(s);
  useLayoutEffect(() => {
    const line = route.line, off = TUNNEL.width / 2 - 0.15;
    at.forEach((s, i) => {
      const p = pointAt(line, s), f = floorY(route, s);
      for (const [ref, y, sc] of [[box, 1.35, [0.3, 0.7, 0.5]], [lamp, 2.0, [0.12, 0.12, 0.12]]]) {
        D.position.set(p.x - line.normal.x * off, f + y, p.z - line.normal.z * off);
        D.rotation.set(0, 0, 0);
        D.rotateY(line.yaw);
        D.scale.set(...sc);
        D.updateMatrix();
        ref.current.setMatrixAt(i, D.matrix);
      }
    });
    for (const r of [box, lamp]) { r.current.instanceMatrix.needsUpdate = true; r.current.computeBoundingSphere(); }
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!at.length) return null;
  return (
    <group name="tunnel-phones">
      <instancedMesh ref={box} args={[undefined, undefined, at.length]} frustumCulled={false}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#f97316" roughness={0.6} /></instancedMesh>
      <instancedMesh ref={lamp} args={[undefined, undefined, at.length]} frustumCulled={false}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1.6} /></instancedMesh>
    </group>
  );
}

// Jet fans: a housing hung from the roof's middle every 60 units, with a blade that turns (slowly: a few instances, updated on the ornament loop, and only when someone is in or near the tube)
function Fans({ route }) {
  const housing = useRef(null), blade = useRef(null);
  const at = [];
  for (let s = route.s0 + 80; s < route.s1 - 60; s += 60) at.push(s);
  const place = (ref, i, s, y, scale, spin) => {
    const line = route.line, p = pointAt(line, s);
    D.position.set(p.x, floorY(route, s) + TUNNEL.height - y, p.z);
    D.rotation.set(0, 0, 0);
    D.rotateY(line.yaw);
    D.rotateX(Math.PI / 2); // (a cylinder stands on y: lay it along the tube)
    D.rotateY(spin);
    D.scale.set(...scale);
    D.updateMatrix();
    ref.current.setMatrixAt(i, D.matrix);
  };
  useLayoutEffect(() => {
    at.forEach((s, i) => { place(housing, i, s, 0.7, [0.5, 1.3, 0.5], 0); place(blade, i, s, 0.7, [0.44, 0.06, 0.44], 0); });
    for (const r of [housing, blade]) { r.current.instanceMatrix.needsUpdate = true; r.current.computeBoundingSphere(); }
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps
  useGatedFrame(LOOPS.ornament, ({ clock }) => {
    if (!blade.current || !(avatarState.layer === 'tunnel' || avatarState.vehicle?.inTube || (clock.elapsedTime | 0) % 4 === 0)) return;
    at.forEach((s, i) => place(blade, i, s, 0.7, [0.44, 0.06, 0.44], clock.elapsedTime * 6 + i));
    blade.current.instanceMatrix.needsUpdate = true;
  });
  if (!at.length) return null;
  return (
    <group name="tunnel-fans">
      <instancedMesh ref={housing} args={[undefined, undefined, at.length]} frustumCulled={false}><cylinderGeometry args={[1, 1, 1, 14]} /><meshStandardMaterial color="#9ca3af" roughness={0.5} metalness={0.4} /></instancedMesh>
      <instancedMesh ref={blade} args={[undefined, undefined, at.length]} frustumCulled={false}><boxGeometry args={[2, 1, 0.12]} /><meshStandardMaterial color="#4b5563" roughness={0.6} /></instancedMesh>
    </group>
  );
}

// A light that goes with a person or a car inside the tube (the scene's lights do not reach down there): the tube's own strips are emissive, this lights the walls and the floor near you. Off everywhere else.
function TubeLight() {
  const ref = useRef(null);
  useFrame(() => {
    const l = ref.current;
    if (!l) return;
    const inside = avatarState.layer === 'tunnel' || Boolean(avatarState.vehicle?.inTube);
    l.visible = inside;
    if (inside) l.position.set(avatarState.x, (avatarState.vehicle?.kind === 'train' ? avatarState.vehicle.y : avatarState.y) + 2.6, avatarState.z);
  });
  return <pointLight ref={ref} intensity={30} distance={26} color="#fff1c2" visible={false} />;
}

// The tube is only drawn when someone is within VISIBLE_FROM units of it (or in it): it is under the sea, and a phone's view is a few hundred units. The distance is from the avatar in the game and from the camera on the dev page.
export const VISIBLE_FROM = 420;
function Gate({ route, children }) {
  const ref = useRef(null);
  useGatedFrame(LOOPS.ornament, ({ camera }) => {
    const g = ref.current;
    if (!g) return;
    const { a, dir } = route.line;
    const px = avatarState.ready ? avatarState.x : camera.position.x, pz = avatarState.ready ? avatarState.z : camera.position.z;
    const s = Math.max(route.s0, Math.min(route.s1, (px - a.x) * dir.x + (pz - a.z) * dir.z));
    const c = pointAt(route.line, s);
    g.visible = Math.hypot(px - c.x, pz - c.z) < VISIBLE_FROM;
  });
  return <group ref={ref}>{children}</group>;
}

export default function Tunnel() {
  const route = useTunnel();
  if (!route || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tunnel') === '0')) return null;
  return (
    <>
      <Gate route={route}>
      <Tube route={route} />
      <Portal route={route} s={route.s0} out={-1} label={route.name} />
      <Portal route={route} s={route.s1} out={1} label={route.name} />
      <ExitSigns route={route} />
      <Phones route={route} />
      <Fans route={route} />
      </Gate>
      <TubeLight />
    </>
  );
}
