"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useFrame } from '@react-three/fiber';
import { COURSE } from '@/lib/world/minigolf';
import { useGolf } from '@/lib/state/golfStore';

// Mini-golf in the world (docs/world/minigolf.md): loads the baked course (the manifest's `courses`), draws the ball and the aim arrow, and takes the keys while you play. The rules are lib/state/golfStore.js, the
// ball's physics lib/world/golfPhysics.js, the panel components/ui/GolfHud.jsx; the felt and walls are baked into the chunks. Mounted with the baked world; `?golf=0` leaves it out.
//   A D or the arrows turn the aim, hold Space to charge, let go to putt, Enter for the next hole, Escape to put the club away.
const FELT = 0.05; // the felt's height over the ground (lib/world/track.js palette: LIFT.paint.asphalt)
const KEYS = { arrowleft: -1, a: -1, arrowright: 1, d: 1 };

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

export default function MiniGolf() {
  const ball = useRef(null), arrow = useRef(null), held = useRef(new Set());
  const model = useBallModel();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('golf') === '0') return undefined;
    let alive = true;
    fetch('/world/manifest.json').then((r) => r.json()).then((m) => { if (alive && m.courses?.length) useGolf.getState().setCourse(m.courses[0]); }).catch(() => {});
    return () => { alive = false; useGolf.getState().quit(); useGolf.getState().setCourse(null); };
  }, []);

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

  useFrame((_, delta) => {
    const g = useGolf.getState();
    const b = ball.current, a = arrow.current;
    if (!g.active || !g.ball || g.phase === 'card') { if (b) b.visible = false; if (a) a.visible = false; return; }
    const dt = Math.min(delta, 0.05);
    let dir = 0;
    for (const k of held.current) dir += KEYS[k] ?? 0;
    if (dir) g.turn(Math.sign(dir), dt);
    g.tick(dt);
    g.hold();
    const s = useGolf.getState();
    if (!s.ball) return;
    if (b) { b.visible = true; b.position.set(s.ball.x, FELT + COURSE.ball, s.ball.z); }
    if (a) {
      a.visible = s.phase === 'aim';
      const len = 1.4 + s.power * 3.2;
      a.position.set(s.ball.x + Math.cos(s.aim) * (COURSE.ball + len / 2 + 0.1), FELT + 0.12, s.ball.z + Math.sin(s.aim) * (COURSE.ball + len / 2 + 0.1));
      a.rotation.set(0, -s.aim, 0);
      a.scale.set(len, 1, 1);
      a.material.color.setRGB(0.2 + 0.8 * s.power, 0.9 - 0.7 * s.power, 0.25);
    }
  });

  return (
    <group name="minigolf">
      {model
        ? <mesh ref={ball} visible={false} castShadow geometry={model.geometry} material={model.material} scale={model.scale} />
        : <mesh ref={ball} visible={false} castShadow><sphereGeometry args={[COURSE.ball, 16, 12]} /><meshStandardMaterial color="#f8fafc" roughness={0.35} /></mesh>}
      <mesh ref={arrow} visible={false}><boxGeometry args={[1, 0.05, 0.16]} /><meshBasicMaterial color="#4ade80" transparent opacity={0.9} depthTest={false} /></mesh>
    </group>
  );
}
