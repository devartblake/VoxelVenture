"use client";

import { useMarket } from '@/lib/state/marketStore';
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { perfStats } from '@/lib/dev/perfStats';
import { LOOPS } from '@/lib/performance/visibilityPolicy';
import { measureCity, qualityGate, useGatedFrame, useQuality, useQualityDirector, useWorldRenderGate } from '@/lib/performance/runtime';
import { usePanel } from '@/lib/state/panelStore';
import { useView } from '@/lib/state/viewStore';
import { avatarState } from '@/lib/sim/avatarState';
import { fleetRefs, useFleet } from '@/lib/state/fleetStore';
import { useDraft } from '@/lib/state/draftStore';
import { useCityStore } from '@/lib/state/store';
import { useWorld } from '@/lib/state/worldStore';

// Diagnostics are on in development, and in a production build when the address has `?diag=1`.
const diagnosticsOn = () => process.env.NODE_ENV !== 'production' || new URLSearchParams(window.location.search).has('diag');

// Copies the renderer's per-frame counters into lib/dev/perfStats.js, which the multiplayer client sends to
// the monitor. With diagnostics on it also publishes handles for a test driver or the browser console:
//   window.__vvPerf   draw calls, triangles, geometries, textures per frame
//   window.__vvStore  the city store (read the plots, claim one, regenerate)
//   window.__vvPanel  the side panel's store (open a view)
//   window.__vvAvatar the avatar's live state; window.__vvFleet { store, refs } the vehicles
//   window.__vvThree  the three.js state (camera, controls)
//   window.__vvScene  the scene (count meshes)
//   window.__vvQuality  the quality policy's store: the tier in force, its reasons, settings, profile and measured frame rate
//   window.__vvFrameGate  the policy's per-frame state (the frame counter, what covers the world)
//   window.__vvMeasure  measureCity(): frame times, draw calls and triangles at the fixed camera spots (scripts/perf-measure.mjs)
// It also runs the capability policy (lib/performance/runtime.js): the quality director, which keeps the tier and the
// visibility state current before any other frame callback, and the gate that draws the world.
// Renders nothing.
export default function PerfProbe() {
  useQualityDirector();
  useWorldRenderGate();
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const get = useThree((s) => s.get);

  useEffect(() => {
    if (!diagnosticsOn()) return undefined;
    window.__vvStore = useCityStore;
    window.__vvDraft = useDraft;
    window.__vvWorld = useWorld;
    window.__vvPanel = usePanel;
    window.__vvMarket = useMarket;
    window.__vvView = useView;
    window.__vvAvatar = avatarState;
    window.__vvFleet = { store: useFleet, refs: fleetRefs };
    window.__vvThree = get;
    window.__vvScene = scene;
    window.__vvPerf = perfStats;
    window.__vvQuality = useQuality;
    window.__vvFrameGate = qualityGate;
    window.__vvMeasure = (options = {}) => measureCity({ get, ...options });
    return () => {
      delete window.__vvStore;
      delete window.__vvDraft;
      delete window.__vvWorld;
      delete window.__vvPanel;
      delete window.__vvView;
      delete window.__vvAvatar;
      delete window.__vvFleet;
      delete window.__vvThree;
      delete window.__vvScene;
      delete window.__vvPerf;
      delete window.__vvQuality;
      delete window.__vvFrameGate;
      delete window.__vvMeasure;
    };
  }, [get, scene]);

  // (sampled at the tier's diagnostic rate; the counters are those of the last frame drawn)
  useGatedFrame(LOOPS.diagnostics, () => {
    const { render, memory } = gl.info;
    perfStats.calls = render.calls;
    perfStats.triangles = render.triangles;
    perfStats.geometries = memory.geometries;
    perfStats.textures = memory.textures;
  });
  return null;
}
