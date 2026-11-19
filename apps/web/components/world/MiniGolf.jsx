"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useFrame } from '@react-three/fiber';
import { COURSE } from '@/lib/world/minigolf';
import { aimFromDrag, previewPath } from '@/lib/world/golfPhysics';
import { avatarState } from '@/lib/sim/avatarState';
import { useGolf } from '@/lib/state/golfStore';
import Label3D from '@/components/city/Label3D';
import { golfLeaderboard } from '@/lib/data/golf';
import { apiOn } from '@/lib/data/api';

// Mini-golf in the world (docs/world/minigolf.md): loads the baked course (the manifest's `courses`), draws the ball, the aim arrow and the path the putt would take, and takes the controls while you play. The rules
// are lib/state/golfStore.js, the ball's physics lib/world/golfPhysics.js, the panel components/ui/GolfHud.jsx; the tiles, flags and boxes are baked into the chunks. Mounted with the baked world; `?golf=0` leaves it out.
//   Keys: A D or the arrows turn the aim, hold Space to charge, let go to putt, Enter for the next hole, Escape to put the club away.
//   Drag (a mouse or a finger): press anywhere on the world and pull back from the ball, as on a slingshot: the aim is the other way, the pull is the power; let go to putt.
//   Gamepad: the left stick or the pad turns the aim, hold A or the right trigger to charge and let go to putt, B puts the club away, A or Start for the next hole.
const FELT = COURSE.felt; // the kit's tile floor over the ground
const KEYS = { arrowleft: -1, a: -1, arrowright: 1, d: 1 };
const PREVIEW_POINTS = 48;

// the ball: the Kenney Minigolf Kit's red ball (kenney/minigolf/ball-red.glb), scaled to the physics ball's size; a plain sphere until it has loaded (or if it does not)
function useBallModel() {
  const [model, setModel] = useState(null);
  useEffect(() => {
    let alive = true;
    new GLTFLoader().load('/models/kenney/minigolf/ball-red.glb', (gltf) => {
      let mesh = null;
      gltf.scene.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
      if (!alive || !mesh) return;
      mesh.geometry.computeBoundingBox();
      const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
      setModel({ geometry: mesh.geometry, material: mesh.material, scale: (2 * COURSE.ball) / Math.max(size.x, size.y, size.z, 1e-6) });
    }, undefined, () => {});
    return () => { alive = false; };
  }, []);
  return model;
}

// Two cars on the park's access road: each comes in from the highway on the right-hand lane, parks by the gate for a few seconds, and leaves on the other lane, over and over (docs/world/minigolf.md). Scenery:
// they are not solid and are not sent to other players; drawn only near the park, two models of the Car Kit (a few hundred triangles each).
const CAR_FILES = ['sedan', 'taxi'], CAR_SPEED = 6, PARKED_FOR = 5, CAR_SCALE = 1.6, SHOW_RANGE = 260;
function ParkCars({ road }) {
  const [cars, setCars] = useState([]);
  useEffect(() => {
    let alive = true;
    CAR_FILES.forEach((f, i) => new GLTFLoader().load(`/models/kenney/cars/${f}.glb`, (gltf) => {
      if (!alive) return;
      gltf.scene.scale.setScalar(CAR_SCALE);
      gltf.scene.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      setCars((c) => { const n = [...c]; n[i] = gltf.scene; return n; });
    }, undefined, () => {}));
    return () => { alive = false; };
  }, []);
  const len = Math.abs(road.to.z - road.from.z), dir = Math.sign(road.to.z - road.from.z) || 1, lane = road.width / 4;
  const cycle = (2 * len) / CAR_SPEED + PARKED_FOR;
  useFrame(({ clock }) => {
    const near = Math.hypot(avatarState.x - road.to.x, avatarState.z - road.to.z) < SHOW_RANGE;
    cars.forEach((car, i) => {
      if (!car) return;
      car.visible = near;
      if (!near) return;
      const t = ((clock.elapsedTime + i * cycle * 0.5) % cycle), drive = len / CAR_SPEED;
      let along, side, face;
      if (t < drive) { along = t * CAR_SPEED; side = lane; face = dir; } // in
      else if (t < drive + PARKED_FOR) { along = len; side = lane; face = dir; } // parked by the gate
      else { along = len - (t - drive - PARKED_FOR) * CAR_SPEED; side = -lane; face = -dir; } // out
      car.position.set(road.from.x + side, 0.02, road.from.z + dir * along);
      car.rotation.y = face > 0 ? 0 : Math.PI;
    });
  });
  return <group name="park-cars">{cars.map((c, i) => c && <primitive key={i} object={c} />)}</group>;
}

// A course's signs (the gate, the clubhouse, the arch, the lighthouse: lib/world/golfPark.js) and its leaderboard: the top three saved rounds on its board, read when the world loads and again after a round is saved
// (services/api/golf.mjs); "NO ROUNDS YET" when there are none, and a plain board when there is no game server.
function ParkSigns({ course }) {
  const saved = useGolf((s) => s.round?.saved);
  const [leaders, setLeaders] = useState([]);
  useEffect(() => {
    if (!course.park?.board || !apiOn()) return undefined;
    let alive = true;
    golfLeaderboard(course.id, 3).then((r) => { if (alive) setLeaders(r.board ?? []); }).catch(() => {});
    return () => { alive = false; };
  }, [course, saved]);
  const board = course.park.board;
  return (
    <group name={`signs-${course.id}`}>
      {(course.park.labels ?? []).map((l) => <Label3D key={`${l.text}${l.x}`} text={l.text} position={[l.x, l.y, l.z]} background="#0f3d66" color="#ffffff" border="#7dd3fc" height={l.text.length > 14 ? 1.5 : 1.1} />)}
      {board && (leaders.length ? leaders : [{ rank: 1, name: 'be the first', empty: true }]).slice(0, 3).map((r, i) => (
        <Label3D key={`lead${i}${r.name}${r.strokes}`} text={r.empty ? 'NO ROUNDS YET' : `${r.rank}. ${r.name.slice(0, 12)}  ${r.strokes} (${r.diff === 0 ? 'E' : r.diff > 0 ? `+${r.diff}` : r.diff})`} position={[board.x, 3.75 - i * 0.7, board.z + 0.06]} background="#1a344e" color="#fde68a" height={0.55} />
      ))}
    </group>
  );
}

export default function MiniGolf() {
  const courses = useGolf((s) => s.courses); // (the park's two nines: the first, Harbor Mini-Golf, and The Adventure Loop; each has its own signs and board)
  const ball = useRef(null), arrow = useRef(null), path = useRef(null), held = useRef(new Set());
  const pad = useRef({ a: false, b: false, start: false });
  const model = useBallModel();
  const pathGeometry = useRef(null);
  if (!pathGeometry.current) {
    pathGeometry.current = new THREE.BufferGeometry();
    pathGeometry.current.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PREVIEW_POINTS * 3), 3));
    pathGeometry.current.setDrawRange(0, 0);
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('golf') === '0') return undefined;
    let alive = true;
    fetch('/world/manifest.json').then((r) => r.json()).then((m) => { if (alive && m.courses?.length) useGolf.getState().setCourses(m.courses); }).catch(() => {});
    return () => { alive = false; useGolf.getState().quit(); useGolf.getState().setCourse(null); };
  }, []);

  // the keys
  useEffect(() => {
    const down = (e) => {
      const g = useGolf.getState();
      if (!g.active || !e.key) return;
      const k = e.key.toLowerCase();
      if (KEYS[k]) { held.current.add(k); e.preventDefault(); }
      else if (k === ' ') { if (!e.repeat) g.charge(true); e.preventDefault(); }
      else if (k === 'enter') { g.next(); e.preventDefault(); }
      else if (k === 'escape') g.quit();
    };
    const up = (e) => {
      const k = e.key?.toLowerCase();
      if (!k) return;
      held.current.delete(k);
      if (k === ' ') useGolf.getState().release();
    };
    const clear = () => held.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); };
  }, []);

  // the drag: press on the world (the canvas) while aiming, pull back from where you pressed
  useEffect(() => {
    let start = null;
    const down = (e) => {
      const g = useGolf.getState();
      if (!g.active || g.phase !== 'aim' || e.button > 0 || e.target?.tagName !== 'CANVAS') return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const move = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x, dz = e.clientY - start.y;
      if (Math.hypot(dx, dz) < 6) return;
      const { angle, power } = aimFromDrag({ dx, dz }, avatarState.cameraYaw);
      useGolf.getState().drag(angle, power);
    };
    const up = (e) => {
      if (!start || e.pointerId !== start.id) return;
      start = null;
      useGolf.getState().dragEnd();
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, []);

  useFrame((_, delta) => {
    const g = useGolf.getState();
    const b = ball.current, a = arrow.current, pl = path.current;
    if (!g.active || !g.ball || g.phase === 'card') { if (b) b.visible = false; if (a) a.visible = false; if (pl) pl.visible = false; return; }
    const dt = Math.min(delta, 0.05);
    let dir = 0;
    for (const k of held.current) dir += KEYS[k] ?? 0;
    // a gamepad: the stick or the pad turns the aim; A or the right trigger charges and putts; B puts the club away; A or Start goes on after a hole
    const gp = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (gp) {
      const x = gp.axes[0] ?? 0;
      if (Math.abs(x) > 0.2) dir += x;
      if (gp.buttons[14]?.pressed) dir -= 1;
      if (gp.buttons[15]?.pressed) dir += 1;
      const a1 = Boolean(gp.buttons[0]?.pressed) || (gp.buttons[7]?.value ?? 0) > 0.3, b1 = Boolean(gp.buttons[1]?.pressed), st = Boolean(gp.buttons[9]?.pressed);
      if (g.phase === 'aim') { if (a1 && !pad.current.a) g.charge(true); if (!a1 && pad.current.a) g.release(); }
      else if (g.phase === 'done' && ((a1 && !pad.current.a) || (st && !pad.current.start))) g.next();
      if (b1 && !pad.current.b) g.quit();
      pad.current = { a: a1, b: b1, start: st };
    }
    if (dir) g.turn(Math.max(-1, Math.min(1, dir)), dt);
    g.tick(dt);
    g.hold();
    const s = useGolf.getState();
    if (!s.ball) return;
    if (b) { b.visible = true; b.position.set(s.ball.x, FELT + COURSE.ball, s.ball.z); }
    const hole = s.course.holes.find((h) => h.n === s.hole);
    if (a) {
      a.visible = s.phase === 'aim';
      const len = 1.4 + s.power * 3.2;
      a.position.set(s.ball.x + Math.cos(s.aim) * (COURSE.ball + len / 2 + 0.1), FELT + 0.12, s.ball.z + Math.sin(s.aim) * (COURSE.ball + len / 2 + 0.1));
      a.rotation.set(0, -s.aim, 0);
      a.scale.set(len, 1, 1);
      a.material.color.setRGB(0.2 + 0.8 * s.power, 0.9 - 0.7 * s.power, 0.25);
    }
    // the path the putt would take at the power so far (a short one at no power: the direction)
    if (pl) {
      pl.visible = s.phase === 'aim';
      if (pl.visible && hole) {
        const phys = { cup: hole.cup, segments: hole.segments.map(([ax, az, bx, bz, nx, nz]) => ({ a: { x: ax, z: az }, b: { x: bx, z: bz }, nx, nz })) };
        const pts = previewPath(s.ball, phys, s.aim, Math.max(0.25, s.power), 1.8, 0.04);
        const pos = pathGeometry.current.attributes.position;
        const n = Math.min(PREVIEW_POINTS, pts.length);
        for (let i = 0; i < n; i++) pos.setXYZ(i, pts[i].x, FELT + 0.16, pts[i].z);
        pos.needsUpdate = true;
        pathGeometry.current.setDrawRange(0, n);
      }
    }
  });

  return (
    <group name="minigolf">
      {courses.map((c) => c.park && <ParkSigns key={c.id} course={c} />)}
      {courses.map((c) => c.park?.road && <ParkCars key={c.id} road={c.park.road} />)}
      {model
        ? <mesh ref={ball} visible={false} castShadow geometry={model.geometry} material={model.material} scale={model.scale} />
        : <mesh ref={ball} visible={false} castShadow><sphereGeometry args={[COURSE.ball, 16, 12]} /><meshStandardMaterial color="#f8fafc" roughness={0.35} /></mesh>}
      <mesh ref={arrow} visible={false}><boxGeometry args={[1, 0.05, 0.16]} /><meshBasicMaterial color="#4ade80" transparent opacity={0.9} depthTest={false} /></mesh>
      <line ref={path} visible={false} frustumCulled={false} geometry={pathGeometry.current}><lineBasicMaterial color="#fde047" depthTest={false} transparent opacity={0.85} /></line>
    </group>
  );
}
