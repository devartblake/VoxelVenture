"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box3, Vector3 } from 'three';
import { create } from 'zustand';
import { useScene } from '@pascal-app/editor';
import { COSMETIC_BY_ID } from '@/lib/game/cosmetics';
import { useCityStore } from '@/lib/state/store';
import { focusSection } from '@/lib/state/interiorFocus';
import { CORNER_REACHED, roomRoute, roomWalkMap, spawnPoint, spotReached } from '@/lib/content/interiorWalk';
import { dressAvatar, useAvatarModel } from '../city/avatarModel';

// The visitor's own avatar inside a building (the interior viewer, InteriorViewer.jsx): it comes in at the door, and a tap or click on the
// floor walks it there, round the furniture (lib/content/interiorWalk.js). Walking up to one of the room's offers lights that part of the
// storefront panel. The same character and Wardrobe colours as in the city; the box character until the model has loaded.
//
// What it walks on comes from useRoomWalk, which the viewer fills in (the room, the floor shown, its spots); `on` shows or hides it.
export const useRoomWalk = create(() => ({ on: true, room: null, levelId: null, floors: 1, floor: 0, doorX: null, baseY: 0, spots: [], key: null, request: null, reached: null }));
export const walkTo = (x, z) => useRoomWalk.setState({ request: { x, z, at: Date.now() } });

const HEIGHT = 1.75; // metres: the room is in metres, the city's avatar in city units
const BOX_HEIGHT = 0.8; // the box character's own height
const SPEED = 1.5; // metres a second: a stroll
const TURN = 10;
const FLOOR = 0.05; // the slab's top above the floor's base (interiorScenes.js: the slab's elevation)
// the longest frame simulated: the route is planned clear of everything, so a long frame (a slow phone, a headless browser) only means a
// longer stride along it, not a walk through a wall; this only stops a leap after the tab was in the background
const MAX_STEP = 0.25;

export default function RoomWalker() {
  const { on, room, levelId, floors, floor, doorX, baseY, spots, key, request } = useRoomWalk();
  const nodes = useScene((s) => s.nodes);
  const appearance = useCityStore((s) => s.appearance);
  const map = useMemo(() => (room && levelId ? roomWalkMap(nodes, levelId, room, floors) : null), [nodes, levelId, room, floors]);

  const root = useRef(null);
  const marker = useRef(null);
  const legs = useRef({});
  const me = useRef({ x: 0, z: 0, yaw: Math.PI, path: null, phase: 0, amp: 0, lastSpot: null });

  const shirt = COSMETIC_BY_ID[appearance?.shirt]?.color ?? '#3b82f6';
  const pants = COSMETIC_BY_ID[appearance?.pants]?.color ?? '#1e3a8a';
  const model = useAvatarModel();
  const dressed = useMemo(() => (model ? dressAvatar(model, { shirt, pants }) : null), [model, shirt, pants]);
  const scale = useMemo(() => {
    if (!dressed) return HEIGHT / BOX_HEIGHT;
    const h = new Box3().setFromObject(dressed).getSize(new Vector3()).y;
    return h > 0.01 ? HEIGHT / h : HEIGHT / BOX_HEIGHT;
  }, [dressed]);
  useEffect(() => {
    const src = dressed;
    legs.current = src ? { legL: src.getObjectByName('leg_l'), legR: src.getObjectByName('leg_r'), armL: src.getObjectByName('arm_l'), armR: src.getObjectByName('arm_r') } : legs.current;
  }, [dressed]);

  // a new room, or another floor of it: come in at the door (or beside the stairs, upstairs). Only then: the scene's data can change while
  // the room is on screen, and the avatar stays where it is.
  const mapRef = useRef(map);
  mapRef.current = map;
  const hasMap = Boolean(map);
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !room) return;
    const p = spawnPoint(room, doorX, m, { upstairs: floor > 0 });
    Object.assign(me.current, { x: p.x, z: p.z, yaw: Math.PI, path: null, lastSpot: null });
    if (marker.current) marker.current.visible = false;
    useRoomWalk.setState({ reached: null });
  }, [key, levelId, floor, hasMap, room, doorX]);

  // a tap on the floor, or a spot chosen in "Look at": plan the route there
  useEffect(() => {
    if (!request || !map) return;
    const path = roomRoute(me.current, request, map);
    me.current.path = path && path.length ? path : null;
    if (marker.current) {
      const end = me.current.path?.at(-1);
      marker.current.visible = Boolean(end);
      if (end) marker.current.position.set(end.x, baseY + FLOOR + 0.01, end.z);
    }
  }, [request, map, baseY]);

  // the floor can be read by tests and the monitor (only with ?diag=1, like the city's handles)
  useEffect(() => {
    if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('diag') !== '1') return undefined;
    window.__vvRoomWalk = { where: () => ({ x: me.current.x, z: me.current.z, walking: Boolean(me.current.path), map }), walkTo };
    return () => {
      delete window.__vvRoomWalk;
    };
  }, [map]);

  useFrame((_, rawDelta) => {
    const g = root.current;
    if (!g || !room) return;
    const dt = Math.min(rawDelta, MAX_STEP);
    const a = me.current;
    let moved = 0;
    if (a.path) {
      let budget = SPEED * dt;
      while (a.path && budget > 0) {
        const c = a.path[0];
        const dx = c.x - a.x;
        const dz = c.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d <= CORNER_REACHED || d <= budget) {
          a.x = c.x;
          a.z = c.z;
          budget -= d;
          moved += d;
          a.path.shift();
          if (!a.path.length) a.path = null;
          continue;
        }
        a.x += (dx / d) * budget;
        a.z += (dz / d) * budget;
        moved += budget;
        const want = Math.atan2(dx, dz);
        let turn = want - a.yaw;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        a.yaw += turn * Math.min(1, TURN * dt);
        budget = 0;
      }
      if (!a.path && marker.current) marker.current.visible = false;
    }
    // arms and legs swing while walking, and settle when it stops
    a.amp += ((moved > 0 ? 1 : 0) - a.amp) * Math.min(1, dt * 8);
    a.phase += moved * 4.2;
    const swing = Math.sin(a.phase) * 0.7 * a.amp;
    const { legL, legR, armL, armR } = legs.current;
    if (legL) legL.rotation.x = swing;
    if (legR) legR.rotation.x = -swing;
    if (armL) armL.rotation.x = -swing;
    if (armR) armR.rotation.x = swing;
    g.position.set(a.x, baseY + FLOOR + Math.abs(Math.sin(a.phase)) * 0.02 * a.amp, a.z);
    g.rotation.y = a.yaw;

    // walked up to an offer: light it in the storefront panel, once each time
    if (!a.path) {
      const spot = spotReached(a, spots);
      if (spot?.id !== a.lastSpot) {
        a.lastSpot = spot?.id ?? null;
        useRoomWalk.setState({ reached: a.lastSpot });
        if (spot) focusSection(spot.section);
      }
    }
  });

  if (!on || !room) return null;
  return (
    <>
      <group ref={root} scale={scale}>
        {dressed ? (
          <primitive object={dressed} />
        ) : (
          <BoxCharacter shirt={shirt} pants={pants} legs={legs} />
        )}
      </group>
      {/* the floor catches taps and clicks: walk there (a drag turns the camera, so only a tap that hardly moved counts) */}
      <mesh
        position={[room.width / 2, baseY + FLOOR + 0.005, room.depth / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          if (e.delta > 8) return;
          e.stopPropagation();
          walkTo(e.point.x, e.point.z);
        }}
      >
        <planeGeometry args={[room.width, room.depth]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.22, 0.34, 24]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </>
  );
}

// The box character (as the city draws it before its model has loaded), with its limbs registered for the walk.
function BoxCharacter({ shirt, pants, legs }) {
  const set = (k) => (el) => {
    if (el) legs.current = { ...legs.current, [k]: el };
  };
  return (
    <>
      <group ref={set('legL')} position={[-0.065, 0.3, 0]}>
        <mesh position={[0, -0.15, 0]} castShadow><boxGeometry args={[0.11, 0.3, 0.11]} /><meshStandardMaterial color={pants} roughness={0.8} /></mesh>
      </group>
      <group ref={set('legR')} position={[0.065, 0.3, 0]}>
        <mesh position={[0, -0.15, 0]} castShadow><boxGeometry args={[0.11, 0.3, 0.11]} /><meshStandardMaterial color={pants} roughness={0.8} /></mesh>
      </group>
      <mesh position={[0, 0.45, 0]} castShadow><boxGeometry args={[0.27, 0.3, 0.15]} /><meshStandardMaterial color={shirt} roughness={0.7} /></mesh>
      <group ref={set('armL')} position={[-0.185, 0.58, 0]}>
        <mesh position={[0, -0.13, 0]} castShadow><boxGeometry args={[0.08, 0.28, 0.08]} /><meshStandardMaterial color={shirt} roughness={0.7} /></mesh>
      </group>
      <group ref={set('armR')} position={[0.185, 0.58, 0]}>
        <mesh position={[0, -0.13, 0]} castShadow><boxGeometry args={[0.08, 0.28, 0.08]} /><meshStandardMaterial color={shirt} roughness={0.7} /></mesh>
      </group>
      <mesh position={[0, 0.7, 0]} castShadow><boxGeometry args={[0.2, 0.2, 0.2]} /><meshStandardMaterial color="#f2c9a0" roughness={0.8} /></mesh>
      <mesh position={[0, 0.72, 0.101]}><boxGeometry args={[0.12, 0.03, 0.005]} /><meshStandardMaterial color="#1f2937" /></mesh>
    </>
  );
}
