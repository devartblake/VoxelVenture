"use client";

import { useEffect, useMemo, useRef } from 'react';
import { sky } from '@/components/city/DayNight';
import { createEngine } from '@/components/sound/engine';
import { avatarState } from '@/lib/sim/avatarState';
import { listener } from '@/lib/sim/listener';
import { buildEmitters, describeMix, mixZones, roadSources, zoneWeights } from '@/lib/game/soundZones';
import { soundMix } from '@/lib/game/soundscape';
import { useSound, useSoundNow } from '@/lib/state/soundStore';
import { useCityStore } from '@/lib/state/store';

// The city's sound, presence based like the SimCity games (the rules are in lib/game/soundZones.js and lib/game/musicRules.js; the sounds are made by
// components/sound/engine.js with local CC0 recordings and procedural browser audio). Close to the ground you hear the places round you: an arcade's bleeps, a cafe's jazz, the offices,
// the market, a park's birds and fountain, water at a lake or a pier, the mall, the airport, the fun park's carousel organ, the countryside, and the traffic of a busy
// street. High above the map you hear the city's music instead, with a faint murmur under it, and in between they crossfade. Nothing starts until the player has clicked or
// pressed a key once (browsers do not allow sound before that), and the speaker and music buttons (components/ui/AmbientControls.jsx) turn it all off.
export default function SoundEngine() {
  const on = useSound((s) => s.on);
  const layout = useCityStore((s) => s.layout);
  const plots = useCityStore((s) => s.plots);
  // the places that make sound: rebuilt when the city or its buildings change
  const places = useMemo(() => ({ emitters: buildEmitters({ plots, layout }), roads: roadSources(layout), urban: layout.urban }), [plots, layout]);
  const placesRef = useRef(places);
  placesRef.current = places;

  useEffect(() => {
    useSound.getState().hydrate();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const diag = new URLSearchParams(window.location.search).has('diag');
    if (!on && !diag) {
      useSoundNow.setState({ text: '', far: 0 });
      return undefined;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    let engine = null;
    let ctx = null;
    let last = null;
    let lastText = 0;

    // what the listener hears right now
    const compute = () => {
      const x = listener.ready ? listener.x : avatarState.x;
      const z = listener.ready ? listener.z : avatarState.z;
      const far = listener.ready ? listener.far : 0;
      const weights = zoneWeights(x, z, placesRef.current);
      const indoors = Boolean(useCityStore.getState().activeInteriorPlot);
      const driving = Boolean(avatarState.vehicle);
      const s = useSound.getState();
      const mix = mixZones({ weights, far, sky: sky.current, indoors, driving, musicOn: s.musicOn });
      // birds and crickets: where it is green, and not high above the map
      const base = soundMix({ sky: sky.current, indoors, driving });
      const green = Math.max(weights.park, weights.farm);
      const extras = { sky: sky.current, volume: s.volume, musicOn: s.musicOn, driving, birds: base.birds * (0.15 + 0.85 * green) * (1 - far), crickets: base.crickets * (0.25 + 0.75 * weights.farm) * (1 - far) };
      return { x, z, far, weights, mix, extras };
    };
    if (diag) window.__vvSound = { last: () => last, compute };

    const loop = () => {
      last = compute();
      if (engine) {
        engine.update(last.mix, last.extras);
        engine.tick();
      }
      const now = performance.now();
      if (on && now - lastText > 500) {
        lastText = now;
        const text = describeMix(last.mix);
        if (useSoundNow.getState().text !== text) useSoundNow.setState({ text, far: last.far });
      }
    };
    loop();
    const timer = setInterval(loop, 120);

    let cleanup = () => {};
    if (on && Ctx) {
      const start = () => {
        if (engine) return;
        try {
          ctx = new Ctx();
          engine = createEngine(ctx);
        } catch {
          engine = null; // no audio available: stay silent
        }
      };
      const resume = () => {
        start();
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      };
      const visibility = () => {
        if (!ctx) return;
        if (document.hidden) ctx.suspend().catch(() => {});
        else ctx.resume().catch(() => {});
      };
      window.addEventListener('pointerdown', resume);
      window.addEventListener('keydown', resume);
      document.addEventListener('visibilitychange', visibility);
      cleanup = () => {
        window.removeEventListener('pointerdown', resume);
        window.removeEventListener('keydown', resume);
        document.removeEventListener('visibilitychange', visibility);
        if (engine) engine.close();
        engine = null;
      };
    }
    return () => {
      clearInterval(timer);
      cleanup();
      if (diag) delete window.__vvSound;
    };
  }, [on]);

  return null;
}
