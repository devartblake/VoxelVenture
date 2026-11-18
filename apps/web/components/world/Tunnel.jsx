"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
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
      <Strip route={route} lateral={L} width={0.14} thick={0.04} color="#f8fafc" y={(f) => f + 0.02} />
      <Strip route={route} lateral={L - half + 0.5} width={0.3} thick={0.06} color="#fde68a" emissive="#fde68a" y={(f) => f + TUNNEL.height - 0.05} />
      <Strip route={route} lateral={L + half - 0.5} width={0.3} thick={0.06} color="#fde68a" emissive="#fde68a" y={(f) => f + TUNNEL.height - 0.05} />
    </group>
  );
}


export default function Tunnel() {
  const route = useTunnel();
  if (!route || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tunnel') === '0')) return null;
  return <Tube route={route} />;
}
