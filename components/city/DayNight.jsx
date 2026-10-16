"use client";

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color } from 'three';
import { modeHour, skyAt } from '@/lib/game/dayCycle';
import { useTime } from '@/lib/state/timeStore';
import { applyGlow } from './nightLights';

// The city's lights, following the shared day and night (lib/game/dayCycle.js). At noon they are exactly the original ones. The sun carries the
// shadows and sets in the west; at night only a blue ambient and fill light are left, and the street lamps stand out.
// The current sky is also kept in `sky` for other things (the sound, the clock button) to read without re-rendering.
export const sky = { current: skyAt(12) };

export default function DayNight({ touch }) {
  const ambient = useRef();
  const sun = useRef();
  const fill = useRef();
  const colors = useRef({ a: new Color(), s: new Color(), f: new Color() });
  useFrame(() => {
    const { mode, offset } = useTime.getState();
    const s = skyAt(modeHour(mode, Date.now(), offset));
    sky.current = s;
    applyGlow(s.lamps);
    if (ambient.current) {
      ambient.current.color.set(colors.current.a.set(s.ambient.color));
      ambient.current.intensity = s.ambient.intensity;
    }
    if (sun.current) {
      sun.current.color.set(colors.current.s.set(s.sun.color));
      sun.current.intensity = s.sun.intensity;
      sun.current.castShadow = s.sun.intensity > 0.05; // no shadow work in the dark
      sun.current.position.set(s.sunDir[0] * 52, s.sunDir[1] * 52, s.sunDir[2] * 52);
    }
    if (fill.current) {
      fill.current.color.set(colors.current.f.set(s.fill.color));
      fill.current.intensity = s.fill.intensity;
    }
  });
  return (
    <>
      <ambientLight ref={ambient} intensity={0.7} />
      <directionalLight
        ref={sun}
        position={[20, 40, 15]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={touch ? 2048 : 4096}
        shadow-mapSize-height={touch ? 2048 : 4096}
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={150}
        shadow-camera-bottom={-150}
      />
      <directionalLight ref={fill} position={[-20, 20, -20]} intensity={0.3} />
    </>
  );
}
