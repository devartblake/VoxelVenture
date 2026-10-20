"use client";

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { LOOPS } from '@/lib/performance/visibilityPolicy';
import { useGatedFrame } from '@/lib/performance/runtime';
import { useWorld } from '@/lib/state/worldStore';
import { useCityStore } from '@/lib/state/store';
import { PRESETS, useView } from '@/lib/state/viewStore';

// Glides the map camera to wherever the UI asks (a search result, a place in the list) and applies the +/- zoom
// buttons. The map is drawn offset by the city's centre, so a city position is shifted before it is used.
export default function CameraFocus() {
  const controls = useThree((s) => s.controls);
  const camera = useThree((s) => s.camera);
  const center = useCityStore((s) => s.layout.center);
  const goal = useRef(null); // { x, z, zoom } in scene coordinates
  const zoomGoal = useRef(null);

  const focus = useWorld((s) => s.focus);
  const zoomRequest = useWorld((s) => s.zoomRequest);

  useEffect(() => {
    if (!focus) return;
    if (!PRESETS[useView.getState().view].iso) useView.getState().setView('iso'); // showing a place needs the map
    goal.current = { x: focus.x - center.x, z: focus.z - center.z, zoom: focus.zoom };
    if (focus.zoom) zoomGoal.current = focus.zoom;
  }, [focus, center]);

  useEffect(() => {
    if (!zoomRequest) return;
    if (!PRESETS[useView.getState().view].iso) {
      useView.getState().zoom(zoomRequest.by);
      return;
    }
    zoomGoal.current = Math.min(90, Math.max(5, (zoomGoal.current ?? camera.zoom) * zoomRequest.by));
  }, [zoomRequest, camera]);

  useGatedFrame(LOOPS.event, (_, delta) => {
    if (!controls) return;
    const k = Math.min(1, delta * 6);
    const g = goal.current;
    if (g) {
      const dx = (g.x - controls.target.x) * k;
      const dz = (g.z - controls.target.z) * k;
      controls.target.x += dx;
      controls.target.z += dz;
      camera.position.x += dx;
      camera.position.z += dz;
      if (Math.hypot(g.x - controls.target.x, g.z - controls.target.z) < 0.05) goal.current = null;
    }
    if (zoomGoal.current !== null) {
      camera.zoom += (zoomGoal.current - camera.zoom) * k;
      camera.updateProjectionMatrix();
      if (Math.abs(zoomGoal.current - camera.zoom) < 0.05) zoomGoal.current = null;
    }
  });
  return null;
}
