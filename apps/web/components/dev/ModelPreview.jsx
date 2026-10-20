"use client";

import React, { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { devToolsOn } from '@/lib/dev/devTools';
import { PROP_CATALOG } from '@/lib/content/propCatalog';
import { loadProps, propMaterial, useProps } from '@/components/city/PropModels';
import Label3D from '@/components/city/Label3D';

// DESIGN TOOL (not in release builds): every model in the prop catalog laid out in rows by kit and class, at its real size, with its name above it and a
// small arrow on the ground showing which way the model faces (+Z). Each model is lifted to rest on the floor and centred (some, such as the coaster track pieces, are
// modelled with their origin at the top of the track, so they sit below y = 0 where they are used unless a caller lifts them by the catalog's `y0`). Used to check the size and the way round of the Kenney models before they are placed.
// ?kit=coaster shows one kit; ?cam=x,y,z,tx,ty,tz sets the camera and what it looks at.
// ?frameloop=demand draws only when something changes (a model loads, the camera moves): the demand-rendering spike of
// docs/architecture/performance_policy.md. window.__vvPreview.frames() counts the frames drawn, to compare it with the default.
function Row({ models, z, label }) {
  const { geometries, materials } = useProps();
  let x = 0;
  return (
    <group position={[0, 0, z]}>
      <Label3D text={label} position={[-3, 0.2, 0]} background="#1e293b" height={0.7} />
      {models.map((m) => {
        const span = Math.max(m.w, m.d, 1.2) + 0.8;
        const at = x + span / 2;
        x += span;
        const g = geometries[m.id];
        return (
          <group key={m.id} position={[at, 0, 0]}>
            {g && (
              <mesh geometry={g} material={propMaterial(materials, m)} castShadow position={[-m.cx, -m.y0, -m.cz]} />
            )}
            <mesh position={[0, 0.01, m.d / 2 + 0.35]} rotation={[-Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.18, 0.4, 3]} />
              <meshBasicMaterial color="#f43f5e" />
            </mesh>
            <Label3D text={m.id.split('/')[1]} position={[0, m.h + 0.55, 0]} background="#0f172a" height={0.45} />
          </group>
        );
      })}
    </group>
  );
}

function FrameCounter() {
  const gl = useThree((s) => s.gl);
  const frameloop = useThree((s) => s.frameloop);
  useEffect(() => {
    window.__vvPreview = { frames: () => gl.info.render.frame, frameloop };
    return () => {
      delete window.__vvPreview;
    };
  }, [gl, frameloop]);
  return null;
}

export default function ModelPreview() {
  const on = devToolsOn();
  const kit = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('kit') : null;
  const cam = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('cam') ?? '').split(',').map(Number) : [];
  const camOk = cam.length === 6 && cam.every(Number.isFinite);
  const frameloop = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('frameloop') === 'demand' ? 'demand' : 'always';
  const groups = useMemo(() => {
    const by = new Map();
    for (const m of PROP_CATALOG) {
      if (kit && m.kit !== kit) continue;
      const key = `${m.kit} / ${m.cls}`;
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(m);
    }
    return [...by.entries()];
  }, [kit]);
  useEffect(() => {
    if (on) loadProps(PROP_CATALOG.filter((m) => !kit || m.kit === kit).map((m) => m.id));
  }, [on, kit]);
  if (!on) return <main className="p-8 text-slate-300">This page is a design tool and is not part of release builds.</main>;
  return (
    <main className="h-screen w-screen bg-[#0b1020]" data-testid="model-preview">
      <Canvas camera={{ position: camOk ? cam.slice(0, 3) : [18, 26, 40], fov: 38 }} shadows frameloop={frameloop}>
        <FrameCounter />
        <ambientLight intensity={0.9} />
        <directionalLight position={[10, 20, 14]} intensity={1.6} castShadow />
        <OrbitControls target={camOk ? cam.slice(3) : [18, 0, groups.length * 2.4]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[30, -0.01, groups.length * 2.4]} receiveShadow>
          <planeGeometry args={[160, 120]} />
          <meshStandardMaterial color="#1f3b2a" />
        </mesh>
        {groups.map(([label, models], i) => (
          <Row key={label} label={label} models={models} z={i * 5.2} />
        ))}
      </Canvas>
    </main>
  );
}
