"use client";

import { remoteParkedCars, useNet } from '@/lib/net/multiplayer';
import React, { useEffect, useMemo, useRef } from 'react';
import { LOOPS } from '@/lib/performance/visibilityPolicy';
import { useGatedFrame } from '@/lib/performance/runtime';
import * as THREE from 'three';
import { avatarState } from '@/lib/sim/avatarState';
import { isBlocked } from '@/lib/sim/collision';
import { FISHING, VEHICLES, inWater, pullLine, stepVehicle, tickLine, waterRects } from '@/lib/sim/vehicles';
import { autopilot, hitsPier } from '@/lib/sim/docking';
import { carSurfaceHeight, WATER_Y } from '@/lib/city/surfaceHeight';
import { boatModel } from '@/lib/content/boatModels';
import { PropModel } from './PropModels';
import { fleetRefs, useFleet } from '@/lib/state/fleetStore';
import { useCityStore } from '@/lib/state/store';
import { useWorld } from '@/lib/state/worldStore';

const CAR = VEHICLES.car.scale;
const BOAT = VEHICLES.boat.scale;

const Z_AXIS = new THREE.Vector3(0, 0, 1);

// Put a thin box (the fishing line, the rod) between two points of the scene. (Object3D.lookAt works in world space, and this group is offset from the origin,
// so the box is turned with a quaternion instead.)
function aim(mesh, from, to, unit = 1) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  mesh.position.copy(from).lerp(to, 0.5);
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(Z_AXIS, dir.divideScalar(len));
  mesh.scale.set(1, 1, len / unit);
}

// ---- models (facing +Z; built at the size of the traffic cars, then scaled up so a person fits) -----------------------
export function CarModel({ color }) {
  return (
    <group scale={CAR}>
      <mesh position={[0, 0.17, 0]} castShadow><boxGeometry args={[0.4, 0.14, 0.8]} /><meshStandardMaterial color={color} roughness={0.45} metalness={0.2} /></mesh>
      <mesh position={[0, 0.31, -0.05]} castShadow><boxGeometry args={[0.34, 0.14, 0.42]} /><meshStandardMaterial color="#1e293b" roughness={0.2} metalness={0.4} /></mesh>
      {[[-0.21, 0.26], [0.21, 0.26], [-0.21, -0.26], [0.21, -0.26]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.07, z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.07, 0.07, 0.06, 10]} /><meshStandardMaterial color="#0f172a" roughness={0.9} /></mesh>
      ))}
      {[-0.12, 0.12].map((x) => (
        <mesh key={`h${x}`} position={[x, 0.19, 0.4]}><boxGeometry args={[0.08, 0.05, 0.02]} /><meshStandardMaterial color="#fef9c3" emissive="#fef08a" emissiveIntensity={1.4} /></mesh>
      ))}
      {[-0.12, 0.12].map((x) => (
        <mesh key={`t${x}`} position={[x, 0.19, -0.4]}><boxGeometry args={[0.08, 0.05, 0.02]} /><meshStandardMaterial color="#7f1d1d" emissive="#ef4444" emissiveIntensity={1} /></mesh>
      ))}
    </group>
  );
}

// The boat of this kind: the Kenney model (lib/content/boatModels.js), or the box boat until it has loaded.
export function BoatModel({ kind, color }) {
  const m = boatModel(kind);
  return <PropModel id={m.id} scale={m.scale} position={[0, -m.sink, 0]} fallback={<BoxBoat kind={kind} color={color} />} />;
}

function BoxBoat({ kind, color }) {
  return (
    <group scale={BOAT}>
      <mesh position={[0, 0.07, 0]} castShadow><boxGeometry args={[0.5, 0.14, 1.1]} /><meshStandardMaterial color={color} roughness={0.7} /></mesh>
      <mesh position={[0, 0.07, 0.62]} rotation={[0, Math.PI / 4, 0]} castShadow><boxGeometry args={[0.35, 0.14, 0.35]} /><meshStandardMaterial color={color} roughness={0.7} /></mesh>
      <mesh position={[0, 0.145, -0.05]}><boxGeometry args={[0.38, 0.02, 0.86]} /><meshStandardMaterial color="#d6b98c" roughness={0.9} /></mesh>
      <mesh position={[0, 0.17, -0.2]}><boxGeometry args={[0.4, 0.03, 0.1]} /><meshStandardMaterial color="#92400e" roughness={0.9} /></mesh>
      {kind === 'sailboat' && (
        <>
          <mesh position={[0, 0.55, 0.15]} castShadow><cylinderGeometry args={[0.015, 0.015, 0.9, 6]} /><meshStandardMaterial color="#e2e8f0" /></mesh>
          <mesh position={[0, 0.58, -0.05]} rotation={[0, Math.PI / 2, 0]} castShadow><planeGeometry args={[0.55, 0.62]} /><meshStandardMaterial color="#f8fafc" side={THREE.DoubleSide} roughness={0.9} /></mesh>
        </>
      )}
    </group>
  );
}

// Driving, sailing and fishing (the rules are in lib/sim/vehicles.js). The avatar takes a car off the road or a boat from its
// mooring with E; while in one, W / S speed up and brake, A / D steer, E gets out of a car, X gets out of anything, and from a
// boat Space (or E) casts the line and reels in. The driven vehicle is drawn here, with the cars the player left parked and
// the moored boats.
export default function Vehicles() {
  useNet((s) => s.parkedV); // redraw when another player parks or leaves
  const remoteParked = remoteParkedCars();
  const layout = useCityStore((s) => s.layout);
  const plots = useCityStore((s) => s.plots);
  const parked = useFleet((s) => s.parked);
  const drivenKind = useFleet((s) => s.hud?.kind ?? null); // re-render when you get in or out (the vehicle itself changes every frame)
  const water = useMemo(() => waterRects(layout), [layout]);
  const keys = useRef(new Set());
  const driven = useRef(null);
  const boatRefs = useRef({});
  const line = useRef({ rod: null, bobber: null, string: null });
  const last = useRef({ prompt: '', hud: '' });
  const bobTime = useRef(0);

  useEffect(() => {
    fleetRefs.water = water;
  }, [water]);
  const piers = useMemo(() => layout.piers ?? [], [layout]);
  useEffect(() => {
    fleetRefs.piers = piers;
  }, [piers]);
  // a new city: forget the vehicles
  useEffect(() => () => useFleet.getState().reset(), [layout.seed]);

  const leave = () => {
    const r = useFleet.getState().exit();
    const notify = useCityStore.getState().notify;
    if (r === 'docking') notify('Heading for the nearest pier. Take the wheel (W A S D) to stop.');
    else if (!r) notify(avatarState.vehicle?.kind === 'boat' ? 'There is no pier on this water: steer closer to the shore to get out.' : 'No room to get out here.');
  };
  const fish = () => {
    const v = avatarState.vehicle;
    if (!v || v.kind !== 'boat') return;
    if (fleetRefs.dock) {
      useCityStore.getState().notify('The boat is sailing to the pier. Take the wheel to fish.');
      return;
    }
    const l = fleetRefs.line;
    if (l.phase === 'idle' && Math.abs(v.speed) > FISHING.maxBoatSpeed) {
      useCityStore.getState().notify('Slow the boat right down to fish.');
      return;
    }
    const r = pullLine(l, Math.random);
    if (r.event === 'caught') useCityStore.getState().catchFish(r.fish);
    else if (r.event === 'reeled-empty') useCityStore.getState().notify('You pulled the line in with nothing on it.');
  };

  useEffect(() => {
    const typing = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
    const down = (e) => {
      // (!e.key: some key events have none, e.g. Chrome's autofill and some extensions send them; this threw in production, 2026-10-18)
      if (!avatarState.vehicle || typing(e.target) || !e.key) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) keys.current.add(k);
      else if (k === 'x') leave();
      else if (k === ' ') {
        e.preventDefault();
        fish();
      }
    };
    const up = (e) => e.key && keys.current.delete(e.key.toLowerCase());
    const clear = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  useGatedFrame(LOOPS.visible, (state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    bobTime.current += dt;
    const t = bobTime.current;
    const v = avatarState.vehicle;
    const moved = useFleet.getState().moved;

    // moored boats rock gently; the one being sailed is not here
    for (const b of layout.boats ?? []) {
      const g = boatRefs.current[b.id];
      if (!g) continue;
      const at = moved[b.id] ?? b;
      g.visible = !(v && v.id === b.id);
      g.position.set(at.x, WATER_Y + Math.sin(t * 1.4 + b.x) * 0.012, at.z);
      g.rotation.set(Math.sin(t * 1.1 + b.z) * 0.02, at.yaw, Math.sin(t * 0.9 + b.x) * 0.03);
    }

    const notify = useCityStore.getState().notify;
    const { rod, bobber, string } = line.current;
    // the fishing rod, line and bobber: from `from` (the rod's hand), out along `yaw`, bobbing on the water
    const drawLine = (x, z, yaw, phase, reach = 1.0) => {
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const tip = new THREE.Vector3(x + fx * reach, 0.7, z + fz * reach);
      const dip = phase === 'bite' ? -0.05 + Math.sin(t * 30) * 0.03 : Math.sin(t * 2.2) * 0.01;
      const far = new THREE.Vector3(x + fx * (reach + 2.1), WATER_Y + 0.02 + dip, z + fz * (reach + 2.1));
      bobber.position.copy(far);
      aim(string, tip, far);
      aim(rod, new THREE.Vector3(x + fx * 0.3, 0.35, z + fz * 0.3), tip, 1.1);
    };
    const showLine = (on) => {
      for (const part of [rod, bobber, string]) if (part) part.visible = on;
    };

    if (!v) {
      if (driven.current) driven.current.visible = false;
      // fishing from a pier on foot: the line stays out while you stand at the end of it
      const pf = fleetRefs.pierFishing;
      const l = fleetRefs.line;
      if (pf) {
        const f = pf.pier.fish;
        if (Math.hypot(avatarState.x - f.x, avatarState.z - f.z) > 1.8) {
          useFleet.getState().stopPierFishing();
          notify('You walked away and reeled the line in.');
        } else {
          if (tickLine(l, dt) === 'escaped') notify('It got away!');
          if (l.phase === 'idle') fleetRefs.pierFishing = null;
          else if (rod && bobber && string) {
            showLine(true);
            drawLine(avatarState.x, avatarState.z, f.yaw, l.phase, 0.9);
          }
        }
      }
      if (!fleetRefs.pierFishing) showLine(false);
      if (last.current.hud) {
        last.current.hud = '';
        useFleet.getState().setHud(null);
      }
      return;
    }
    showLine(false);

    // ---- input
    const k = keys.current;
    let throttle = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    let steer = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const joy = avatarState.joy;
    if (!throttle && !steer && joy && Math.hypot(joy.x, joy.y) > 0.15) {
      throttle = joy.y;
      steer = joy.x;
    }
    // ---- a boat sailing itself to a pier (the player asked to get out too far from the shore): any steering takes the wheel back
    const docking = v.kind === 'boat' ? fleetRefs.dock : null;
    if (docking) {
      if (throttle || steer) {
        useFleet.getState().cancelDock();
        notify('You have the wheel.');
      } else {
        const ap = autopilot(v, docking, dt);
        throttle = ap.throttle;
        steer = ap.steer;
        if (ap.failed) {
          useFleet.getState().cancelDock();
          notify('The boat could not reach the pier. Steer it yourself.');
        } else if (ap.done) {
          useFleet.getState().finishDock();
          notify('Docked. You step onto the pier; the boat is tied up beside it.');
          return;
        }
      }
    }
    // ---- drive
    const map = fleetRefs.collision;
    const canMove =
      v.kind === 'car'
        ? (x, z, r) => !map || (!isBlocked(x, z, map.rects, r) && x > map.bounds.x0 && x < map.bounds.x1 && z > map.bounds.z0 && z < map.bounds.z1)
        : (x, z, r) => inWater(x, z, water, r * 0.6) && !hitsPier(x, z, r * 0.8, piers); // (a boat sails round a pier, not through it)
    stepVehicle(v, { throttle, steer }, dt, canMove);
    avatarState.x = v.x;
    avatarState.z = v.z;
    avatarState.yaw = v.yaw;
    avatarState.moving = Math.abs(v.speed) > 0.3;

    // ---- fishing
    const l = fleetRefs.line;
    if (v.kind === 'boat') {
      if (l.phase !== 'idle' && Math.abs(v.speed) > FISHING.maxBoatSpeed * 1.6) {
        Object.assign(l, { phase: 'idle', timer: 0, fish: null });
        notify('You reeled the line in as the boat moved off.');
      }
      if (tickLine(l, dt) === 'escaped') notify('It got away!');
    }

    // ---- what the prompt and the panel say (only when they change)
    const moving = Math.abs(v.speed) > FISHING.maxBoatSpeed;
    const sailing = Boolean(fleetRefs.dock);
    const label = v.kind === 'car' ? 'Get out of the car' : sailing ? 'Sailing to the pier (steer to stop)' : l.phase === 'bite' ? 'Bite! Reel it in!' : l.phase === 'waiting' ? 'Line out: press to reel in' : moving ? 'Slow down to fish' : 'Cast your line';
    const promptKey = `${v.kind}-${label}`;
    if (promptKey !== last.current.prompt) {
      last.current.prompt = promptKey;
      useWorld.setState({ prompt: { id: `vehicle-${promptKey}`, label, action: v.kind === 'car' ? leave : sailing ? () => useFleet.getState().cancelDock() : fish } });
    }
    const speed = Math.round(Math.abs(v.speed) * 4) / 4;
    const hudKey = `${v.kind}|${speed}|${l.phase}|${sailing}`;
    if (hudKey !== last.current.hud) {
      last.current.hud = hudKey;
      useFleet.getState().setHud({ kind: v.kind, speed, phase: l.phase, docking: sailing });
    }

    // ---- draw it
    const g = driven.current;
    if (g) {
      g.visible = true;
      g.position.set(v.x, v.kind === 'boat' ? WATER_Y : carSurfaceHeight(layout, v.x, v.z, v.yaw, CAR, plots), v.z);
      g.rotation.set(0, v.yaw, 0);
    }
    if (v.kind === 'boat' && l.phase !== 'idle' && rod && bobber && string) {
      showLine(true);
      drawLine(v.x, v.z, v.yaw, l.phase, boatModel(v.boatKind).bow);
    }
  });

  return (
    <group name="vehicles">
      {(layout.boats ?? []).map((b) => (
        <group key={b.id} ref={(g) => { boatRefs.current[b.id] = g; }} position={[b.x, WATER_Y, b.z]} rotation={[0, b.yaw, 0]}>
          <BoatModel kind={b.kind} color={b.color} />
        </group>
      ))}
      {parked.map((c) => (
        <group key={c.id} position={[c.x, carSurfaceHeight(layout, c.x, c.z, c.yaw, CAR, plots), c.z]} rotation={[0, c.yaw, 0]}>
          <CarModel color={c.color} />
        </group>
      ))}
      {/* the cars other players left parked */}
      {remoteParked.map((c) => (
        <group key={`${c.owner}-${c.i}`} position={[c.x, carSurfaceHeight(layout, c.x, c.z, c.yaw, CAR, plots), c.z]} rotation={[0, c.yaw, 0]}>
          <CarModel color={c.color} />
        </group>
      ))}
      {/* the one being driven or sailed */}
      <group ref={driven} visible={false}>
        {drivenKind === 'boat' ? <BoatModel kind={avatarState.vehicle?.boatKind ?? 'rowboat'} color={avatarState.vehicle?.color ?? '#b45309'} /> : drivenKind === 'car' ? <CarModel color={avatarState.vehicle?.color ?? '#3b82f6'} /> : null}
      </group>
      {/* the fishing rod, line and bobber */}
      <mesh ref={(m) => { line.current.rod = m; }} visible={false}><boxGeometry args={[0.025, 0.025, 1.1]} /><meshStandardMaterial color="#78350f" /></mesh>
      <mesh ref={(m) => { line.current.string = m; }} visible={false}><boxGeometry args={[0.008, 0.008, 1]} /><meshBasicMaterial color="#e2e8f0" /></mesh>
      <mesh ref={(m) => { line.current.bobber = m; }} visible={false}><sphereGeometry args={[0.06, 10, 8]} /><meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} /></mesh>
    </group>
  );
}
