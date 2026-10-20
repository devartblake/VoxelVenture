"use client";

import { useThree } from '@react-three/fiber';
import { LOOPS } from '@/lib/performance/visibilityPolicy';
import { useGatedFrame } from '@/lib/performance/runtime';
import * as THREE from 'three';
import { useView } from '@/lib/state/viewStore';

// Reads the real camera and tells the compass which way it looks in world space: degrees clockwise from world north (-Z), with +X east and +Z south.
// (Not worked out from a camera preset: whatever moves the camera, the compass follows what is actually on screen.) Looking straight down, the
// heading comes from the camera's up direction instead, which is the way "up the screen" points on the ground.
const dir = new THREE.Vector3();
const up = new THREE.Vector3();
let last = -999;

export default function CameraHeading() {
  const camera = useThree((s) => s.camera);
  useGatedFrame(LOOPS.event, () => {
    camera.getWorldDirection(dir);
    let x = dir.x;
    let z = dir.z;
    if (Math.abs(dir.y) > 0.97) {
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      x = up.x;
      z = up.z;
    }
    const deg = ((((Math.atan2(x, -z) * 180) / Math.PI) % 360) + 360) % 360;
    if (Math.abs(deg - last) > 0.1 && Math.abs(deg - last) < 359.9) {
      last = deg;
      useView.getState().setHeading(deg);
    }
  });
  return null;
}
