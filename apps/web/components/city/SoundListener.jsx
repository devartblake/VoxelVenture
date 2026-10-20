"use client";

import { useThree } from '@react-three/fiber';
import { LOOPS } from '@/lib/performance/visibilityPolicy';
import { useGatedFrame } from '@/lib/performance/runtime';
import { avatarState } from '@/lib/sim/avatarState';
import { listener } from '@/lib/sim/listener';
import { viewFarness } from '@/lib/game/soundZones';
import { useView } from '@/lib/state/viewStore';
import { useMap } from '@/lib/state/mapStore';
import { useCityStore } from '@/lib/state/store';

// Tells the sound where the listener is and how high they look from (lib/sim/listener.js). In the original (isometric) view you hear what is under the middle of the
// screen and how far you have zoomed out decides between the places round you and the music; in the follow views you hear round the avatar (or where you look round
// to), and the camera's distance decides. Renders nothing.
export default function SoundListener() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  useGatedFrame(LOOPS.event, () => {
    const v = useView.getState();
    const center = useCityStore.getState().layout.center;
    listener.view = v.view;
    listener.mapOpen = useMap.getState().open;
    if (v.view === 'iso') {
      // the orbit controls' target is the point on the ground at the middle of the screen (in the scene, which is offset by the city's centre)
      const t = controls?.target;
      listener.x = (t?.x ?? 0) + center.x;
      listener.z = (t?.z ?? 0) + center.z;
      listener.zoom = camera.zoom ?? 14;
    } else {
      listener.x = v.free?.x ?? avatarState.x;
      listener.z = v.free?.z ?? avatarState.z;
      listener.distance = v.distance;
    }
    listener.far = viewFarness({ view: v.view, zoom: listener.zoom, distance: listener.distance, mapOpen: listener.mapOpen });
    listener.ready = true;
  });
  return null;
}
