"use client";

import { useMarket } from '@/lib/state/marketStore';
import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { perfStats } from '@/lib/dev/perfStats';
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
// Renders nothing.
export default function PerfProbe() {
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
    };
  }, [get, scene]);

  useFrame(() => {
    const { render, memory } = gl.info;
    perfStats.calls = render.calls;
    perfStats.triangles = render.triangles;
    perfStats.geometries = memory.geometries;
    perfStats.textures = memory.textures;
  });
  return null;
}
