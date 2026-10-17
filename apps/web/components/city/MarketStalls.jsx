"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import Label3D from './Label3D';
import { useCityStore } from '@/lib/state/store';
import { usePanel } from '@/lib/state/panelStore';
import { useMarket } from '@/lib/state/marketStore';
import { TIER_COLOURS } from '@/lib/market/layout';

// The pop-up market on its site: cobbled aisles, a plaza, gates, and every stall and booth of this week's layout. A free stall wears its price tier's
// colour (gold for the busiest spots); one that is let right now shows its owner's own colour and goods on the counter. Click a stall to open the market
// panel on it. Three instanced meshes draw all the stalls, so a hundred stalls cost three draw calls.
const Y = 0.03;
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const YAW = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 }; // the stall's front is its local +z
const dummy = new THREE.Object3D();
const col = new THREE.Color();

export default function MarketStalls() {
  const reserved = useCityStore((s) => s.layout.reserved);
  const roads = useCityStore((s) => s.layout.roads);
  const data = useMarket((s) => s.data);
  const setSite = useMarket((s) => s.setSite);
  const clock = useMarket((s) => s.clock);
  const tick = useMarket((s) => s.tick);
  const site = reserved.find((r) => r.market);

  // load the market for this city as soon as it is up, so the stalls are there before anyone opens the panel
  useEffect(() => {
    if (site) setSite({ ...site, road: roads.find((r) => r.id === site.frontRoad) ?? null });
  }, [site, roads, setSite]);

  // every half minute: what is open changes as stalls start and finish, and the player hears when theirs does
  useEffect(() => {
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [tick]);

  const stalls = useMemo(() => {
    if (!data || !site || data.site.code !== site.code) return [];
    const now = clock;
    return data.stalls.map((s) => {
      const mine = data.bookings.filter((b) => b.stallId === s.id);
      const live = mine.find((b) => b.start <= now && now < b.end) ?? null;
      const later = !live && mine.length > 0;
      const sideways = s.front === 'E' || s.front === 'W';
      return { ...s, width: sideways ? s.d : s.w, depth: sideways ? s.w : s.d, live, later };
    });
  }, [data, site, clock]);

  const counters = useRef(null);
  const awnings = useRef(null);
  const goods = useRef(null);
  useLayoutEffect(() => {
    if (!counters.current || !awnings.current || !goods.current) return;
    let g = 0;
    stalls.forEach((s, i) => {
      const yaw = YAW[s.front];
      // counter: against the back of the stall, a little narrower than it
      dummy.position.set(s.x, Y + 0.17, s.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(s.width * 0.9, 0.34, s.depth * 0.45);
      const back = -s.depth * 0.22;
      dummy.position.x += Math.sin(yaw) * back;
      dummy.position.z += Math.cos(yaw) * back;
      dummy.updateMatrix();
      counters.current.setMatrixAt(i, dummy.matrix);
      counters.current.setColorAt(i, col.set(s.live ? '#a16207' : '#78716c'));
      // awning: a flat canopy over the whole stall, tier-coloured if free, the owner's colour if let
      dummy.position.set(s.x, Y + 0.82, s.z);
      dummy.scale.set(s.width * 1.04, 0.06, s.depth * 1.04);
      dummy.updateMatrix();
      awnings.current.setMatrixAt(i, dummy.matrix);
      const free = col.set(TIER_COLOURS[s.tier]).lerp(new THREE.Color('#ffffff'), 0.25);
      if (s.live) col.setHSL((hash(s.live.brand) % 360) / 360, 0.6, 0.55);
      else if (s.later) col.copy(free).multiplyScalar(0.55);
      else col.copy(free);
      awnings.current.setColorAt(i, col);
      // goods on the counter of a stall that is open
      if (s.live) {
        const gf = 0.3;
        dummy.position.set(s.x + Math.sin(yaw) * back, Y + 0.4, s.z + Math.cos(yaw) * back);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(s.width * 0.6, 0.12, s.depth * gf);
        dummy.updateMatrix();
        goods.current.setMatrixAt(g, dummy.matrix);
        goods.current.setColorAt(g, col.setHSL(((hash(s.live.brand) >> 3) % 360) / 360, 0.7, 0.6));
        g++;
      }
    });
    for (const m of [counters.current, awnings.current]) {
      m.count = stalls.length;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    goods.current.count = g;
    goods.current.instanceMatrix.needsUpdate = true;
    if (goods.current.instanceColor) goods.current.instanceColor.needsUpdate = true;
  }, [stalls]);

  if (!site || !data || !stalls.length) return null;
  const cx = (site.x0 + site.x1) / 2;
  const cz = (site.z0 + site.z1) / 2;
  const openNow = stalls.filter((s) => s.live).length;
  const pick = (e) => {
    const s = stalls[e.instanceId];
    if (!s) return;
    e.stopPropagation();
    useMarket.getState().select(s.id);
    usePanel.getState().editReserved(site.id);
  };
  const entrance = data.gates[0];
  return (
    <group name="market">
      {data.aisles.map((a, i) => (
        <mesh key={`a${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[(a.x0 + a.x1) / 2, Y - 0.012, (a.z0 + a.z1) / 2]} receiveShadow>
          <planeGeometry args={[a.x1 - a.x0, a.z1 - a.z0]} />
          <meshStandardMaterial color="#8b7d6b" roughness={1} />
        </mesh>
      ))}
      {data.plaza && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(data.plaza.x0 + data.plaza.x1) / 2, Y - 0.006, (data.plaza.z0 + data.plaza.z1) / 2]} receiveShadow>
          <planeGeometry args={[data.plaza.x1 - data.plaza.x0, data.plaza.z1 - data.plaza.z0]} />
          <meshStandardMaterial color="#0f766e" roughness={0.9} />
        </mesh>
      )}
      <instancedMesh ref={counters} args={[undefined, undefined, Math.max(1, stalls.length)]} castShadow receiveShadow frustumCulled={false} onClick={pick}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={awnings} args={[undefined, undefined, Math.max(1, stalls.length)]} castShadow frustumCulled={false} onClick={pick}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={goods} args={[undefined, undefined, Math.max(1, stalls.length)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      {data.gates.map((g, i) => (
        <group key={`g${i}`} position={[g.x, 0, g.z]}>
          {[-1.4, 1.4].map((o) => (
            <mesh key={o} position={[data.frame?.alongX === false ? 0 : o, 0.9, data.frame?.alongX === false ? o : 0]} castShadow>
              <boxGeometry args={[0.18, 1.8, 0.18]} />
              <meshStandardMaterial color="#f8fafc" />
            </mesh>
          ))}
        </group>
      ))}
      <Label3D text={`Pop-up market · ${site.code}`} position={[entrance ? entrance.x : cx, 2.4, entrance ? entrance.z : cz]} background="#78350f" color="#fde68a" border="#f59e0b" height={0.8} />
      <Label3D text={`${openNow} open now · ${stalls.length} spots`} position={[cx, 1.4, cz]} background="#14532d" color="#bbf7d0" border="#22c55e" height={0.55} />
    </group>
  );
}
