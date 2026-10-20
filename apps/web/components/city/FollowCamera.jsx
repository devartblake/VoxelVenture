"use client";

import { useEffect } from 'react';
import { PerspectiveCamera } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { LOOPS } from '@/lib/performance/visibilityPolicy';
import { useGatedFrame } from '@/lib/performance/runtime';
import { avatarState } from '@/lib/sim/avatarState';
import { useCityStore } from '@/lib/state/store';
import { PRESETS, useView } from '@/lib/state/viewStore';

const HEAD = 1.0; // the camera looks at the avatar's chest, not its feet
const EYE = 1.3; // first person: the height of the avatar's eyes (a little higher in a car)
const EYE_CAR = 1.45;
const isFirst = () => Boolean(PRESETS[useView.getState().view]?.fp);

// The follow cameras (every view except the isometric map): a perspective camera that follows the avatar from a distance,
// at a tilt, distance and heading set by the view (see lib/state/viewStore.js). It writes its heading to
// avatarState.cameraYaw so that walking is relative to the view.
//   wheel / pinch   zoom         Q / E  turn      R / F  tilt      V  next view      Home  reset the view
//   right-drag      turn and tilt
export default function FollowCamera() {
  const center = useCityStore((s) => s.layout.center);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const fov = useView((s) => s.fov);

  useEffect(() => {
    const el = gl.domElement;
    const view = () => useView.getState();
    const wheel = (e) => {
      e.preventDefault();
      if (!isFirst()) view().zoom(Math.exp(-e.deltaY * 0.0014));
    };
    const touches = new Map();
    let pinch = null;
    let orbit = null;
    // in first person turning to the right is a negative change of azimuth (the camera stands on the other side of the avatar)
    const turn = (dx) => view().rotate(isFirst() ? -dx : dx);
    let pan = null; // look-around: a left-button drag moves the camera over the city
    const down = (e) => {
      if (view().free && e.pointerType !== 'touch' && e.button === 0) pan = { x: e.clientX, y: e.clientY };
      if (e.pointerType === 'touch') touches.set(e.pointerId, [e.clientX, e.clientY]);
      else if (e.button === 2) {
        orbit = { x: e.clientX, y: e.clientY };
        el.setPointerCapture?.(e.pointerId);
      }
    };
    const move = (e) => {
      if (pan) {
        view().panFree(e.clientX - pan.x, e.clientY - pan.y, useCityStore.getState().layout.land);
        pan = { x: e.clientX, y: e.clientY };
        return;
      }
      if (orbit) {
        turn((e.clientX - orbit.x) * 0.006);
        view().tilt((e.clientY - orbit.y) * 0.004);
        orbit = { x: e.clientX, y: e.clientY };
        return;
      }
      if (!touches.has(e.pointerId)) return;
      const before = touches.get(e.pointerId);
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size === 1 && view().free) {
        view().panFree(e.clientX - before[0], e.clientY - before[1], useCityStore.getState().layout.land);
        return;
      }
      if (touches.size === 1 && isFirst()) {
        // one finger looks round in first person
        turn((e.clientX - before[0]) * 0.006);
        view().tilt((e.clientY - before[1]) * 0.004);
        return;
      }
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) view().zoom(d / pinch);
        pinch = d;
      }
    };
    const up = (e) => {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = null;
      if (e.button === 2) orbit = null;
      if (e.button === 0) pan = null;
    };
    const menu = (e) => e.preventDefault();
    const key = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.ctrlKey || e.metaKey || e.altKey || !e.key) return; // (some key events have no key: autofill, extensions)
      const k = e.key.toLowerCase();
      if (k === 'g') {
        if (view().free) view().endFree();
        else view().startFree();
        return;
      }
      if (view().free && (k === 'escape' || k === 'w' || k === 'a' || k === 's' || k === 'd' || k.startsWith('arrow'))) view().endFree(); // moving ends the look-around
      if (k === 'q') turn(-0.26);
      else if (k === 'e') turn(0.26);
      else if (k === 'r') view().tilt(0.08);
      else if (k === 'f') view().tilt(-0.08);
      else if (k === 'v') view().cycle();
      else if (e.key === 'Home') {
        view().endFree();
        view().reset();
      }
    };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', menu);
    window.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('contextmenu', menu);
      window.removeEventListener('keydown', key);
    };
  }, [gl]);

  useGatedFrame(LOOPS.visible, (_, delta) => {
    const { azimuth, pitch, distance, look } = useView.getState();
    if (PRESETS[useView.getState().view]?.fp) {
      // first person: at the eyes, looking along the heading (no smoothing, so looking round is immediate)
      const px = avatarState.x - center.x;
      const pz = avatarState.z - center.z;
      const py = avatarState.vehicle ? EYE_CAR : EYE;
      camera.position.set(px, py, pz);
      if (Math.abs(camera.near - 0.1) > 0.01) {
        camera.near = 0.1;
        camera.updateProjectionMatrix();
      }
      camera.up.set(0, 1, 0);
      const c = Math.cos(look);
      camera.lookAt(px - Math.sin(azimuth) * c, py + Math.sin(look), pz - Math.cos(azimuth) * c);
      avatarState.cameraYaw = azimuth;
      return;
    }
    // the avatar, in the scene's own coordinates (the city is drawn shifted by its centre)
    const free = useView.getState().free;
    const tx = (free ? free.x : avatarState.x) - center.x;
    const tz = (free ? free.z : avatarState.z) - center.z;
    const flat = Math.cos(pitch) * distance;
    const want = { x: tx + Math.sin(azimuth) * flat, y: HEAD + Math.sin(pitch) * distance, z: tz + Math.cos(azimuth) * flat };
    const k = 1 - Math.exp(-delta * 8);
    camera.position.x += (want.x - camera.position.x) * k;
    camera.position.y += (want.y - camera.position.y) * k;
    camera.position.z += (want.z - camera.position.z) * k;
    // the near plane moves out with the distance: depth precision is spent where it is needed, so the ground's thin layers
    // (grass, paving, roads, lawns) do not flicker against each other when zoomed out
    const near = Math.min(6, Math.max(0.15, distance * 0.03));
    if (Math.abs(camera.near - near) > near * 0.05) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
    camera.up.set(0, 1, 0);
    camera.lookAt(tx, HEAD * 0.6, tz);
    avatarState.cameraYaw = azimuth;
  });

  return <PerspectiveCamera makeDefault fov={fov} near={0.1} far={900} position={[20, 14, 20]} />;
}

