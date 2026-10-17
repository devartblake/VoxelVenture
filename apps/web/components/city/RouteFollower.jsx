"use client";

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { avatarState } from '@/lib/sim/avatarState';
import { useMap } from '@/lib/state/mapStore';

// (Drawn inside the city group, which is already shifted to the city's centre, so it uses world coordinates.)
// The waypoint set on the world map, in the city itself: a tall light at the waypoint and the route drawn on the ground. And, once "Go there" is pressed,
// the avatar's click target is moved along the route one corner at a time, so it walks the roads to the waypoint. Anything else you do (a key, the joystick,
// a click on the ground) takes over at once and the walk stops.
export default function RouteFollower() {
  const waypoint = useMap((s) => s.waypoint);
  const route = useMap((s) => s.route);
  const beam = useRef(null);
  const walk = useRef({ idx: 1, ref: null, mine: null, route: null });

  const line = useMemo(() => {
    if (!route) return null;
    const g = new THREE.BufferGeometry().setFromPoints(route.points.map((p) => new THREE.Vector3(p.x, 0.09, p.z)));
    return new THREE.Line(g, new THREE.LineDashedMaterial({ color: '#22d3ee', dashSize: 0.5, gapSize: 0.3, linewidth: 2 }));
  }, [route]);
  useMemo(() => line?.computeLineDistances(), [line]);

  useFrame((state) => {
    if (beam.current) beam.current.scale.y = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.08;
    const { autoWalk, route: r } = useMap.getState();
    const w = walk.current;
    if (!autoWalk || !r) {
      w.ref = null;
      w.mine = null;
      w.route = null;
      return;
    }
    if (w.route !== r) {
      w.route = r;
      w.idx = 1;
      w.ref = null;
      w.mine = null;
    }
    const next = () => {
      if (w.idx >= r.points.length) {
        useMap.getState().clearWaypoint(); // arrived
        return;
      }
      w.mine = r.points[w.idx];
      w.ref = { x: w.mine.x, z: w.mine.z };
      avatarState.target = w.ref;
    };
    if (!w.ref) return next();
    if (avatarState.target !== w.ref) {
      // the avatar reached the corner (it clears its target) or the player took over
      if (avatarState.target == null && Math.hypot(avatarState.x - w.mine.x, avatarState.z - w.mine.z) < 0.8) {
        w.idx++;
        next();
      } else useMap.getState().stop();
    }
  });

  if (!waypoint) return null;
  return (
    <group name="waypoint">
      <group position={[waypoint.x, 0, waypoint.z]}>
        <mesh ref={beam} position={[0, 3, 0]} raycast={() => {}}>
          <cylinderGeometry args={[0.06, 0.06, 6, 8]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.55} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
          <ringGeometry args={[0.35, 0.5, 24]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.9} />
        </mesh>
      </group>
      {line && <primitive object={line} raycast={() => {}} />}
    </group>
  );
}
