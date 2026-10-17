"use client";

import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { COSMETIC_BY_ID } from '@/lib/game/cosmetics';
import { remotePlayers, useNet } from '@/lib/net/multiplayer';
import { Hat, SCALE } from './Avatar';
import { useCityStore } from '@/lib/state/store';
import { surfaceHeight, carSurfaceHeight, WATER_Y } from '@/lib/city/surfaceHeight';
import { seatWorld } from '@/lib/content/boatModels';
import Label3D from './Label3D';
import { BoatModel, CarModel } from './Vehicles';

const EMOTE_SECONDS = { wave: 1.8, dance: 3, jump: 0.7 };

// One other player: the same blocky figure as your own avatar, moved smoothly towards the position the
// server last reported (positions arrive ten times a second; frames come faster).
function RemoteAvatar({ id }) {
  const layout = useCityStore((s) => s.layout);
  const plots = useCityStore((s) => s.plots);
  const root = useRef(null);
  const body = useRef(null);
  const legL = useRef(null);
  const legR = useRef(null);
  const armL = useRef(null);
  const armR = useRef(null);
  const anim = useRef({ phase: 0, amp: 0, emote: null, t: 0 });
  const car = useRef(null); // the car or boat they are in, drawn where they are
  const [vehSig, setVehSig] = useState('');
  const info = remotePlayers.get(id);
  const shirt = COSMETIC_BY_ID[info?.appearance?.shirt]?.color ?? '#3b82f6';
  const pants = COSMETIC_BY_ID[info?.appearance?.pants]?.color ?? '#1e3a8a';

  useFrame((_, rawDelta) => {
    const p = remotePlayers.get(id);
    if (!p || !root.current) return;
    const dt = Math.min(rawDelta, 0.1);
    const a = anim.current;
    if (p.fresh) {
      p.x = p.tx;
      p.z = p.tz;
      p.yaw = p.tyaw;
      p.fresh = false;
    }
    const k = Math.min(1, dt * 10);
    const dx = (p.tx - p.x) * k;
    const dz = (p.tz - p.z) * k;
    p.x += dx;
    p.z += dz;
    const moved = Math.hypot(dx, dz);
    let diff = p.tyaw - p.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    p.yaw += diff * Math.min(1, dt * 12);

    a.phase += moved * 7;
    a.amp += ((p.moving || moved > 0.002 ? 1 : 0) - a.amp) * Math.min(1, dt * 12);
    const swing = Math.sin(a.phase) * 0.8 * a.amp;
    let lift = Math.abs(Math.sin(a.phase)) * 0.03 * a.amp;
    let armLRot = [swing, 0, 0];
    let armRRot = [-swing, 0, 0];
    let spin = 0;

    if (p.emote !== a.emote) {
      a.emote = p.emote;
      a.t = 0;
    }
    if (a.emote && EMOTE_SECONDS[a.emote]) {
      a.t += dt;
      if (a.t < EMOTE_SECONDS[a.emote]) {
        if (a.emote === 'wave') armRRot = [0, 0, -2.6 + Math.sin(a.t * 12) * 0.45];
        else if (a.emote === 'dance') {
          lift = Math.abs(Math.sin(a.t * 9)) * 0.1;
          armLRot = [0, 0, 2.4 + Math.sin(a.t * 9) * 0.5];
          armRRot = [0, 0, -2.4 - Math.sin(a.t * 9) * 0.5];
          spin = Math.sin(a.t * 4.5) * 0.7;
        } else if (a.emote === 'jump') {
          lift = Math.sin(Math.min(1, a.t / EMOTE_SECONDS.jump) * Math.PI) * 0.6;
          armLRot = [0, 0, 2.5];
          armRRot = [0, 0, -2.5];
        }
      }
    }

    // in a vehicle: it is drawn instead (a boat's passenger still shows, sitting)
    const sig = p.veh ? `${p.veh.kind}|${p.veh.boatKind}|${p.veh.color}` : '';
    if (sig !== vehSig) setVehSig(sig);
    if (car.current) {
      car.current.visible = Boolean(p.veh);
      car.current.position.set(p.x, p.veh?.kind === 'boat' ? WATER_Y : carSurfaceHeight(layout, p.x, p.z, p.yaw, 2, plots), p.z);
      car.current.rotation.y = p.yaw;
    }
    root.current.visible = !p.veh || p.veh.kind === 'boat';
    if (p.veh) {
      lift = 0;
      spin = 0;
      armLRot = [-0.7, 0, 0];
      armRRot = [-0.7, 0, 0];
    }
    if (p.veh?.kind === 'boat') {
      const seat = seatWorld({ ...p, boatKind: p.veh.boatKind });
      root.current.position.set(seat.x, WATER_Y + seat.y, seat.z);
    } else root.current.position.set(p.x, surfaceHeight(layout, p.x, p.z, plots) + lift, p.z);
    root.current.rotation.y = p.yaw + spin;
    legL.current.rotation.x = p.veh ? -1.2 : swing;
    legR.current.rotation.x = p.veh ? -1.2 : -swing;
    armL.current.rotation.set(...armLRot);
    armR.current.rotation.set(...armRRot);
    body.current.rotation.z = p.veh ? 0 : Math.sin(a.phase) * 0.04 * a.amp;
  });

  const [kind, boatKind, color] = vehSig.split('|');
  return (
    <>
    <group ref={car} visible={false}>
      {kind === 'car' ? <CarModel color={color} /> : kind === 'boat' ? <BoatModel kind={boatKind} color={color} /> : null}
      {kind === 'car' && <Label3D text={info?.name ?? 'Player'} position={[0, 1.5, 0]} background="#38bdf8" color="#0c1a2b" height={0.3} />}
    </group>
    <group ref={root} scale={SCALE}>
      <group ref={body}>
        <group ref={legL} position={[-0.065, 0.3, 0]}>
          <mesh position={[0, -0.15, 0]} castShadow><boxGeometry args={[0.11, 0.3, 0.11]} /><meshStandardMaterial color={pants} roughness={0.8} /></mesh>
        </group>
        <group ref={legR} position={[0.065, 0.3, 0]}>
          <mesh position={[0, -0.15, 0]} castShadow><boxGeometry args={[0.11, 0.3, 0.11]} /><meshStandardMaterial color={pants} roughness={0.8} /></mesh>
        </group>
        <mesh position={[0, 0.45, 0]} castShadow><boxGeometry args={[0.27, 0.3, 0.15]} /><meshStandardMaterial color={shirt} roughness={0.7} /></mesh>
        <group ref={armL} position={[-0.185, 0.58, 0]}>
          <mesh position={[0, -0.13, 0]} castShadow><boxGeometry args={[0.08, 0.28, 0.08]} /><meshStandardMaterial color={shirt} roughness={0.7} /></mesh>
        </group>
        <group ref={armR} position={[0.185, 0.58, 0]}>
          <mesh position={[0, -0.13, 0]} castShadow><boxGeometry args={[0.08, 0.28, 0.08]} /><meshStandardMaterial color={shirt} roughness={0.7} /></mesh>
        </group>
        <mesh position={[0, 0.7, 0]} castShadow><boxGeometry args={[0.2, 0.2, 0.2]} /><meshStandardMaterial color="#f2c9a0" roughness={0.8} /></mesh>
        <mesh position={[0, 0.72, 0.101]}><boxGeometry args={[0.12, 0.03, 0.005]} /><meshStandardMaterial color="#1f2937" /></mesh>
        <Hat id={info?.appearance?.hat} />
      </group>
      <Label3D text={info?.name ?? 'Player'} position={[0, 1.15, 0]} background="#38bdf8" color="#0c1a2b" height={0.3} />
    </group>
    </>
  );
}

// Every other player in your city (see lib/net/multiplayer.js). Mounts one avatar per player.
export default function RemotePlayers() {
  const players = useNet((s) => s.players);
  return players.map((p) => <RemoteAvatar key={`${p.id}-${p.name}-${p.appearance?.shirt}-${p.appearance?.pants}-${p.appearance?.hat}`} id={p.id} />);
}
