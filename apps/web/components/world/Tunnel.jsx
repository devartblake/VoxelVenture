"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { avatarState } from '@/lib/sim/avatarState';
import Label3D from '@/components/city/Label3D';
import { TUNNEL, floorY, pointAt } from '@/lib/world/tunnel';

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
      D.position.set(p.x + line.normal.x * (TUNNEL.width / 2 - 0.06), floorY(route, s) + 2.1, p.z + line.normal.z * (TUNNEL.width / 2 - 0.06));
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

export default function Tunnel() {
  const route = useTunnel();
  if (!route || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tunnel') === '0')) return null;
  return (
    <>
      <Tube route={route} />
      <Portal route={route} s={route.s0} out={-1} label={route.name} />
      <Portal route={route} s={route.s1} out={1} label={route.name} />
      <ExitSigns route={route} />
      <TubeLight />
    </>
  );
}
