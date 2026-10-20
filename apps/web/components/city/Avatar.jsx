"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { LOOPS } from '@/lib/performance/visibilityPolicy';
import { useGatedFrame } from '@/lib/performance/runtime';
import { fleetRefs, useFleet } from '@/lib/state/fleetStore';
import { usePanel } from '@/lib/state/panelStore';
import { avatarState } from '@/lib/sim/avatarState';
import { surfaceHeight, WATER_Y } from '@/lib/city/surfaceHeight';
import { seatWorld } from '@/lib/content/boatModels';
import { buildingHalf, buildCollisionMap, findSpawn, moveAvatar, resolveOverlap } from '@/lib/sim/collision';
import { CORNER_REACHED, findWalkPath, prepareWalkMap } from '@/lib/sim/pathfind';
import { graphFor } from '@/lib/city/routing';
import { COSMETIC_BY_ID } from '@/lib/game/cosmetics';
import { dailyChest, scavengerHunt } from '@/lib/game/daily';
import { useCityStore } from '@/lib/state/store';
import { useWorld } from '@/lib/state/worldStore';
import { insideHall, storeDoors } from '@/lib/city/mallHall';
import { PRESETS, useView } from '@/lib/state/viewStore';
import { useMarket } from '@/lib/state/marketStore';
import Label3D from './Label3D';
import { dressAvatar, useAvatarModel } from './avatarModel';

const WALK_SPEED = 3.0;
const RUN_MULTIPLIER = 1.8;
const TURN_RATE = 14;
const MAX_STEP = 0.05; // longest frame we simulate, so a lag spike can't carry us through a wall
export const SCALE = 1.25;
const doorCache = new WeakMap(); // a mall's store doors never change, so they are worked out once
const storeDoorsOf = (m) => {
  if (!doorCache.has(m)) doorCache.set(m, storeDoors(m));
  return doorCache.get(m);
};
const firstPerson = () => Boolean(PRESETS[useView.getState().view]?.fp);
export const FOOT_Y = 0; // model feet are relative to the sampled surface

const EMOTES = { wave: { key: '1', id: 'emote-wave', seconds: 1.8 }, dance: { key: '2', id: 'emote-dance', seconds: 3 }, jump: { key: '3', id: 'emote-jump', seconds: 0.7 } };

// Screen-relative controls, as [forward, right]: forward is the way the camera looks along the ground. In the isometric
// view that is (-1, -1); the follow cameras turn, so it comes from avatarState.cameraYaw.
const MOVE_KEYS = {
  w: [1, 0], arrowup: [1, 0],
  s: [-1, 0], arrowdown: [-1, 0],
  d: [0, 1], arrowright: [0, 1],
  a: [0, -1], arrowleft: [0, -1],
};

const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

// Click handler for the ground: walk there. Also clears any selection, since a click on empty
// ground no longer counts as a "miss" once something is there to catch it.
export function GroundClick({ center }) {
  const clear = useCityStore((s) => s.clearSelectedPlot);
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.001, 0]}
      onClick={(e) => {
        if (e.delta > 4) return; // that was a drag (panning the map), not a click
        clear();
        avatarState.target = { x: e.point.x + center.x, z: e.point.z + center.z };
      }}
    >
      <planeGeometry args={[400, 400]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

export function Hat({ id }) {
  const color = COSMETIC_BY_ID[id]?.color;
  if (id === 'hat-cap') {
    return (
      <group position={[0, 0.83, 0]}>
        <mesh castShadow><boxGeometry args={[0.23, 0.06, 0.23]} /><meshStandardMaterial color={color} /></mesh>
        <mesh position={[0, -0.02, 0.14]}><boxGeometry args={[0.2, 0.02, 0.1]} /><meshStandardMaterial color={color} /></mesh>
      </group>
    );
  }
  if (id === 'hat-party') {
    return (
      <mesh position={[0, 0.93, 0]} castShadow>
        <coneGeometry args={[0.09, 0.26, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    );
  }
  if (id === 'hat-top') {
    return (
      <group position={[0, 0.82, 0]}>
        <mesh position={[0, 0.02, 0]} castShadow><cylinderGeometry args={[0.15, 0.15, 0.02, 12]} /><meshStandardMaterial color={color} /></mesh>
        <mesh position={[0, 0.12, 0]} castShadow><cylinderGeometry args={[0.095, 0.095, 0.2, 12]} /><meshStandardMaterial color={color} /></mesh>
      </group>
    );
  }
  if (id === 'hat-crown') {
    return (
      <group position={[0, 0.84, 0]}>
        <mesh castShadow><boxGeometry args={[0.2, 0.07, 0.2]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} /></mesh>
        {[[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]].map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x, 0.07, z]}><boxGeometry args={[0.04, 0.07, 0.04]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} /></mesh>
        ))}
      </group>
    );
  }
  return null;
}

// The player: a voxel character (about 1 unit tall) wearing whatever the player has equipped.
export default function Avatar() {
  const huntCache = useRef({ key: '', spots: [] });
  const layout = useCityStore((s) => s.layout);
  const plots = useCityStore((s) => s.plots);
  const appearance = useCityStore((s) => s.appearance);
  const controls = useThree((s) => s.controls);
  const camera = useThree((s) => s.camera);

  const root = useRef(null);
  const body = useRef(null);
  const legL = useRef(null);
  const legR = useRef(null);
  const armL = useRef(null);
  const armR = useRef(null);
  const marker = useRef(null);
  const keys = useRef(new Set());
  // goal: the click target the route was planned for; path: the corners still to walk (lib/sim/pathfind.js); replanned: planned again
  // once after getting stuck
  const anim = useRef({ phase: 0, amp: 0, stuck: 0, goal: null, path: null, replanned: false });
  const lastPromptId = useRef(null);

  // the market's stalls are solid (you walk the aisles); they change with the week, so the map is rebuilt when its layout does
  const marketStalls = useMarket((s) => s.data?.stalls);
  const collision = useMemo(() => {
    const { billboards } = useCityStore.getState(); // posts never move; no need to rebuild when ads change
    const map = buildCollisionMap({ plots, layout, billboards, extra: (marketStalls ?? []).map((s) => ({ x: s.x, z: s.z, w: s.w * 0.92, d: s.d * 0.92 })) });
    prepareWalkMap(map); // so the first click's route is planned at once
    return map;
  }, [plots, layout, marketStalls]);
  const collisionRef = useRef(collision);
  collisionRef.current = collision;
  fleetRefs.collision = collision; // the vehicles use the same map

  const shirt = COSMETIC_BY_ID[appearance.shirt]?.color ?? '#3b82f6';
  const pants = COSMETIC_BY_ID[appearance.pants]?.color ?? '#1e3a8a';

  // The Blockbench character (apps/web/public/models/avatar/player.glb) once it has loaded; the box character until then, or if it cannot
  const avatarModel = useAvatarModel();
  const dressed = useMemo(() => (avatarModel ? dressAvatar(avatarModel, { shirt, pants }) : null), [avatarModel, shirt, pants]);
  useLayoutEffect(() => {
    if (!dressed) return;
    legL.current = dressed.getObjectByName('leg_l');
    legR.current = dressed.getObjectByName('leg_r');
    armL.current = dressed.getObjectByName('arm_l');
    armR.current = dressed.getObjectByName('arm_r');
  }, [dressed]);

  // A building may have just appeared where we stand (we claimed that lot): step out of it.
  useEffect(() => {
    if (!avatarState.ready) return;
    const free = resolveOverlap(avatarState.x, avatarState.z, collision);
    avatarState.x = free.x;
    avatarState.z = free.z;
  }, [collision]);

  // Start on the arterial avenue, and again whenever the city is regenerated.
  useEffect(() => {
    const spawn = findSpawn(layout, collisionRef.current);
    avatarState.x = spawn.x;
    avatarState.z = spawn.z;
    avatarState.yaw = Math.PI / 2;
    avatarState.target = null;
    avatarState.emote = null;
    avatarState.ready = true;
    if (controls) {
      const tx = spawn.x - layout.center.x;
      const tz = spawn.z - layout.center.z;
      const dx = camera.position.x - controls.target.x;
      const dy = camera.position.y - controls.target.y;
      const dz = camera.position.z - controls.target.z;
      controls.target.set(tx, 0, tz);
      camera.position.set(tx + dx, dy, tz + dz);
    }
    return () => {
      avatarState.ready = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.seed, controls]);

  // Keyboard: WASD / arrows to move, Shift to run, E to interact, 1-3 for emotes.
  useEffect(() => {
    const down = (e) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey || !e.key) return; // (some key events have no key: autofill, extensions)
      const state = useCityStore.getState();
      if (state.activeInteriorPlot || state.wardrobeOpen) return;
      const key = e.key.toLowerCase();
      if (key === 'e') {
        useWorld.getState().prompt?.action();
        return;
      }
      const emote = Object.entries(EMOTES).find(([, v]) => v.key === key);
      if (emote) {
        const [name, def] = emote;
        if (state.owned[def.id]) avatarState.emote = { name, t: 0 };
        else state.notify(`Buy the ${COSMETIC_BY_ID[def.id].name} emote in the Wardrobe first`);
        return;
      }
      if (MOVE_KEYS[key]) {
        keys.current.add(key);
        avatarState.target = null;
        e.preventDefault();
      } else if (key === 'shift') {
        keys.current.add('shift');
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

  useGatedFrame(LOOPS.visible, (_, rawDelta) => {
    if (!avatarState.ready || !root.current) return;
    const dt = Math.min(rawDelta, MAX_STEP);
    const store = useCityStore.getState();
    const frozen = Boolean(store.activeInteriorPlot);
    const a = anim.current;

    // --- in a car or a boat: it drives (apps/web/components/city/Vehicles.jsx); we just sit in it and the camera follows
    const vehicle = avatarState.vehicle;
    if (vehicle) {
      root.current.visible = vehicle.kind === 'boat' && !firstPerson(); // a boat's passenger shows; in a car you are inside
      if (vehicle.kind === 'boat') {
        const seat = seatWorld(vehicle); // where this kind of boat's seat is (lib/content/boatModels.js)
        root.current.position.set(seat.x, WATER_Y + seat.y, seat.z);
      } else root.current.position.set(avatarState.x, surfaceHeight(layout, avatarState.x, avatarState.z, plots), avatarState.z);
      root.current.rotation.y = avatarState.yaw;
      legL.current.rotation.x = legR.current.rotation.x = -1.2; // sitting
      armL.current.rotation.set(-0.7, 0, 0);
      armR.current.rotation.set(-0.7, 0, 0);
      body.current.rotation.z = 0;
      lastPromptId.current = '__vehicle__'; // the vehicle sets the prompt; recompute it when we get out
      if (controls) {
        const ex = avatarState.x - layout.center.x - controls.target.x;
        const ez = avatarState.z - layout.center.z - controls.target.z;
        const k = Math.min(1, dt * 6);
        controls.target.x += ex * k;
        controls.target.z += ez * k;
        camera.position.x += ex * k;
        camera.position.z += ez * k;
      }
      return;
    }
    root.current.visible = !firstPerson(); // in first person you are the camera

    // --- intent: keys win over a click target
    let ix = 0;
    let iz = 0;
    if (!frozen) {
      // forward and right on the ground, for the camera's heading
      const az = avatarState.cameraYaw;
      const fwd = [-Math.sin(az), -Math.cos(az)];
      const right = [Math.cos(az), -Math.sin(az)];
      let f = 0;
      let r = 0;
      for (const k of keys.current) {
        if (MOVE_KEYS[k]) {
          f += MOVE_KEYS[k][0];
          r += MOVE_KEYS[k][1];
        }
      }
      ix = f * fwd[0] + r * right[0];
      iz = f * fwd[1] + r * right[1];
      // on-screen joystick: up is forward, right is right
      const joy = avatarState.joy;
      if (!ix && !iz && joy && Math.hypot(joy.x, joy.y) > 0.15) {
        ix = joy.y * fwd[0] + joy.x * right[0];
        iz = joy.y * fwd[1] + joy.x * right[1];
        avatarState.target = null;
      }
      if (!ix && !iz && avatarState.target) {
        // a new click target: plan the way round whatever is in between (straight at it if no way is found, as before)
        if (a.goal !== avatarState.target) {
          a.goal = avatarState.target;
          a.replanned = false;
          a.stuck = 0;
          a.path = findWalkPath(avatarState, avatarState.target, collisionRef.current, { graph: graphFor(layout) }) ?? [avatarState.target];
        }
        // the next corner; the last one is where the walk ends (beside a building when the click was on one)
        let next = a.path[0];
        while (next && Math.hypot(next.x - avatarState.x, next.z - avatarState.z) < (a.path.length > 1 ? CORNER_REACHED : 0.12)) {
          a.path.shift();
          next = a.path[0];
        }
        if (!next) {
          avatarState.target = null;
          a.goal = null;
        } else {
          ix = next.x - avatarState.x;
          iz = next.z - avatarState.z;
        }
      }
    }
    const len = Math.hypot(ix, iz);
    const speed = WALK_SPEED * (keys.current.has('shift') || avatarState.run ? RUN_MULTIPLIER : 1);

    let moved = 0;
    if (len > 0) {
      const dx = (ix / len) * speed * dt;
      const dz = (iz / len) * speed * dt;
      const next = moveAvatar(avatarState.x, avatarState.z, dx, dz, collisionRef.current);
      moved = Math.hypot(next.x - avatarState.x, next.z - avatarState.z);
      avatarState.x = next.x;
      avatarState.z = next.z;

      // Stuck on the way to a click target (something moved into the way, or there was no route): plan again once from here, then give up.
      if (avatarState.target && !keys.current.size) {
        a.stuck = moved < speed * dt * 0.25 ? a.stuck + dt : 0;
        if (a.stuck > 0.4) {
          a.stuck = 0;
          const again = !a.replanned && findWalkPath(avatarState, avatarState.target, collisionRef.current, { graph: graphFor(layout) });
          if (again) {
            a.path = again;
            a.replanned = true;
          } else {
            avatarState.target = null;
            a.goal = null;
          }
        }
      }

      // Turn smoothly toward the way we are heading.
      const want = Math.atan2(ix, iz);
      let diff = want - avatarState.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      avatarState.yaw += diff * Math.min(1, dt * TURN_RATE);
    }
    avatarState.moving = moved > 0;

    // --- pose
    const { phase } = a;
    a.phase += moved * 7;
    a.amp += ((moved > 0 ? 1 : 0) - a.amp) * Math.min(1, dt * 12);
    const swing = Math.sin(phase) * 0.8 * a.amp;
    let lift = Math.abs(Math.sin(phase)) * 0.03 * a.amp;
    let armLRot = [swing, 0, 0];
    let armRRot = [-swing, 0, 0];
    let spin = 0;

    if (avatarState.emote) {
      const e = avatarState.emote;
      e.t += dt;
      if (e.t >= EMOTES[e.name].seconds) avatarState.emote = null;
      else if (e.name === 'wave') armRRot = [0, 0, -2.6 + Math.sin(e.t * 12) * 0.45];
      else if (e.name === 'dance') {
        lift = Math.abs(Math.sin(e.t * 9)) * 0.1;
        armLRot = [0, 0, 2.4 + Math.sin(e.t * 9) * 0.5];
        armRRot = [0, 0, -2.4 - Math.sin(e.t * 9) * 0.5];
        spin = Math.sin(e.t * 4.5) * 0.7;
      } else if (e.name === 'jump') {
        lift = Math.sin(Math.min(1, e.t / EMOTES.jump.seconds) * Math.PI) * 0.6;
        armLRot = [0, 0, 2.5];
        armRRot = [0, 0, -2.5];
      }
    }
    if (moved > 0) avatarState.emote = null; // walking cancels an emote

    root.current.position.set(avatarState.x, surfaceHeight(layout, avatarState.x, avatarState.z, plots) + lift, avatarState.z);
    root.current.rotation.y = avatarState.yaw + spin;
    legL.current.rotation.x = swing;
    legR.current.rotation.x = -swing;
    armL.current.rotation.set(...armLRot);
    armR.current.rotation.set(...armRRot);
    body.current.rotation.z = Math.sin(phase) * 0.04 * a.amp;

    // --- tap-to-move marker
    if (marker.current) {
      marker.current.visible = Boolean(avatarState.target);
      // where the walk will end: beside a building when the click was on one
      const end = (a.goal === avatarState.target && a.path?.at(-1)) || avatarState.target;
      if (avatarState.target) marker.current.position.set(end.x, surfaceHeight(layout, end.x, end.z, plots) + 0.01, end.z);
    }

    // --- the camera follows while we walk, and can still be panned away when we stand still
    if (controls && moved > 0) {
      const ex = avatarState.x - layout.center.x - controls.target.x;
      const ez = avatarState.z - layout.center.z - controls.target.z;
      const k = Math.min(1, dt * 3.5);
      controls.target.x += ex * k;
      controls.target.z += ez * k;
      camera.position.x += ex * k;
      camera.position.z += ez * k;
    }

    // --- what can we interact with here? (only touches React when the answer changes)
    let best = null;
    const consider = (id, label, score, action) => {
      if (!best || score < best.score) best = { id, label, score, action };
    };
    if (!frozen) {
      const { x, z } = avatarState;
      const { day, daily } = store;
      if (day && daily.chestDay !== day) {
        const chest = dailyChest(store.layout.intersections, store.layout.seed, day);
        const d = Math.hypot(chest.x - x, chest.z - z);
        if (d < 1.1) consider('chest', 'Open the daily chest', d / 1.1 - 1, () => useCityStore.getState().openDailyChest());
      }
      if (day) {
        // today's scavenger-hunt stars (computed once per city and day)
        const key = `${store.layout.seed}|${day}`;
        if (huntCache.current.key !== key) huntCache.current = { key, spots: scavengerHunt(store.layout, store.plots, store.layout.seed, day) };
        const found = store.daily.huntDay === day ? store.daily.huntFound : [];
        for (const spot of huntCache.current.spots) {
          if (found.includes(spot.index)) continue;
          const d = Math.hypot(spot.x - x, spot.z - z);
          if (d < 1.2) consider(`hunt-${spot.index}`, 'Collect the gold star', d / 1.2 - 0.9, () => useCityStore.getState().collectHuntStar(spot.index));
        }
      }
      for (const m of store.layout.malls ?? []) {
        const d = Math.hypot(m.door.x - x, m.door.z - z);
        if (d < 2.4) consider(m.id, `Directory: ${m.name}`, d / 2.4 - 0.4, () => usePanel.getState().openMall(m.id));
        // inside the hall: each store has a door on a long wall
        if (insideHall(m, x, z, 0)) {
          for (const sd of storeDoorsOf(m)) {
            const ds = Math.hypot(sd.x - x, sd.z - z);
            if (ds < 1.7) consider(`store-${sd.store.id}`, `Enter ${sd.store.title}`, ds / 1.7 - 0.2, () => useCityStore.getState().openInterior(sd.store));
          }
        }
      }
      // vehicles: take a car off the road, or one you left parked, or sail a boat from its mooring
      const sim = fleetRefs.sim;
      if (sim) {
        for (const c of sim.cars) {
          const d = Math.hypot(c.x - x, c.z - z);
          if (d < 1.5) consider(`car-${c.id}`, 'Drive this car', d / 1.5 - 0.35, () => useFleet.getState().enterCar(c));
        }
      }
      const fleet = useFleet.getState();
      for (const c of fleet.parked) {
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < 1.9) consider(`parked-${c.id}`, 'Drive your car', d / 1.9 - 0.35, () => useFleet.getState().enterParked(c.id));
      }
      for (const b of store.layout.boats ?? []) {
        const at = fleet.moved[b.id] ?? b;
        const d = Math.hypot(at.x - x, at.z - z);
        if (d < 2.8) consider(`boat-${b.id}`, 'Sail this boat (and fish)', d / 2.8 - 0.35, () => useFleet.getState().enterBoat(b));
      }
      // piers: fish from the end of one (the same line, bite and Gold as from a boat)
      for (const pier of store.layout.piers ?? []) {
        const f = pier.fish;
        const d = Math.hypot(f.x - x, f.z - z);
        if (d >= 1.4) continue;
        const phase = fleetRefs.pierFishing?.pier === pier ? fleetRefs.line.phase : 'idle';
        const label = phase === 'bite' ? 'Bite! Reel it in!' : phase === 'waiting' ? 'Line out: press to reel in' : 'Fish from the pier';
        consider(`pier-${pier.id}-${phase}`, label, d / 1.4 - 0.5, () => {
          const r = useFleet.getState().pierFish(pier);
          avatarState.yaw = f.yaw;
          if (r?.event === 'caught') useCityStore.getState().catchFish(r.fish);
          else if (r?.event === 'reeled-empty') useCityStore.getState().notify('You pulled the line in with nothing on it.');
        });
      }
      for (const p of store.plots) {
        const px = p.x;
        const pz = p.z;
        if (p.owner) {
          // standing at the front door (the plot's own +Z, turned by its yaw on a curved road)
          const out = p.facing * (buildingHalf(p).hd + 0.33);
          const yaw = p.yaw ?? 0;
          const d = Math.hypot(px + Math.sin(yaw) * out - x, pz + Math.cos(yaw) * out - z);
          if (d < 0.9) consider(`plot-${p.id}`, `Enter ${p.title}`, d / 0.9, () => useCityStore.getState().openInterior(p));
        } else {
          const d = Math.hypot(px - x, pz - z);
          if (d < 1.0) consider(`plot-${p.id}`, `Look at lot #${p.id}`, d + 0.6, () => useCityStore.getState().setSelectedPlot(p));
        }
      }
      for (const b of store.billboards) {
        if (b.kind === 'banner') continue; // the banners are clicked in the sky
        const d = Math.hypot(b.x + Math.sin(b.yaw) * 1.8 - x, b.z + Math.cos(b.yaw) * 1.8 - z);
        if (d < 2.2) consider(b.id, b.ad ? `View ${b.ad.headline} billboard` : 'View the open billboard', d / 2.2 + 0.3, () => useCityStore.getState().setSelectedBillboard(b));
      }
      // the pop-up market: walk in through a gate, then stop at an open stall to see what it sells
      const mk = useMarket.getState();
      const market = mk.data;
      const msite = store.layout.reserved.find((r) => r.market);
      if (market && msite && market.site.code === msite.code) {
        const now = Date.now();
        for (const st of market.stalls) {
          const d = Math.hypot(st.x - x, st.z - z);
          const reach = Math.max(st.w, st.d) / 2 + 1.1;
          if (d > reach) continue;
          const live = market.bookings.find((b) => b.stallId === st.id && b.start <= now && now < b.end);
          if (live) consider(`stall-${st.id}`, `Browse ${live.brand}`, d / reach - 0.3, () => { mk.select(st.id); usePanel.getState().editReserved(msite.id); });
        }
        for (const g of market.gates) {
          const d = Math.hypot(g.x - x, g.z - z);
          if (d < 3) {
            const open = market.bookings.filter((b) => b.start <= now && now < b.end).length;
            consider(`gate-${g.u}`, open ? `Pop-up market: ${open} stalls open` : 'Pop-up market', d / 3 + 0.2, () => { mk.select(null); usePanel.getState().editReserved(msite.id); });
          }
        }
      }
      for (const park of store.layout.parks) {
        if (Math.abs(x - park.center.x) < park.width / 2 && Math.abs(z - park.center.z) < park.depth / 2) {
          consider(park.id, `Visit ${park.name}`, 0.9, () => useCityStore.getState().setSelectedPark(park));
        }
      }
    }
    const id = best ? best.id : null;
    if (id !== lastPromptId.current) {
      lastPromptId.current = id;
      useWorld.setState({ prompt: best ? { id: best.id, label: best.label, action: best.action } : null });
    }
  });

  return (
    <>
      <group ref={root} scale={SCALE}>
        <group ref={body}>
          {dressed ? (
            <primitive object={dressed} />
          ) : (
            <>
          {/* legs: pivot at the hip */}
          <group ref={legL} position={[-0.065, 0.3, 0]}>
            <mesh position={[0, -0.15, 0]} castShadow><boxGeometry args={[0.11, 0.3, 0.11]} /><meshStandardMaterial color={pants} roughness={0.8} /></mesh>
          </group>
          <group ref={legR} position={[0.065, 0.3, 0]}>
            <mesh position={[0, -0.15, 0]} castShadow><boxGeometry args={[0.11, 0.3, 0.11]} /><meshStandardMaterial color={pants} roughness={0.8} /></mesh>
          </group>
          {/* torso */}
          <mesh position={[0, 0.45, 0]} castShadow><boxGeometry args={[0.27, 0.3, 0.15]} /><meshStandardMaterial color={shirt} roughness={0.7} /></mesh>
          {/* arms: pivot at the shoulder */}
          <group ref={armL} position={[-0.185, 0.58, 0]}>
            <mesh position={[0, -0.13, 0]} castShadow><boxGeometry args={[0.08, 0.28, 0.08]} /><meshStandardMaterial color={shirt} roughness={0.7} /></mesh>
          </group>
          <group ref={armR} position={[0.185, 0.58, 0]}>
            <mesh position={[0, -0.13, 0]} castShadow><boxGeometry args={[0.08, 0.28, 0.08]} /><meshStandardMaterial color={shirt} roughness={0.7} /></mesh>
          </group>
          {/* head */}
          <mesh position={[0, 0.7, 0]} castShadow><boxGeometry args={[0.2, 0.2, 0.2]} /><meshStandardMaterial color="#f2c9a0" roughness={0.8} /></mesh>
          <mesh position={[0, 0.72, 0.101]}><boxGeometry args={[0.12, 0.03, 0.005]} /><meshStandardMaterial color="#1f2937" /></mesh>
            </>
          )}
          <Hat id={appearance.hat} />
        </group>
        <Label3D text="You" position={[0, 1.15, 0]} background="#facc15" color="#1c1917" height={0.3} />
      </group>

      {/* where a click sent us */}
      <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.14, 0.22, 20]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.85} />
      </mesh>
    </>
  );
}
