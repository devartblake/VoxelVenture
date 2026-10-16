"use client";

import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { MapControls, OrthographicCamera } from '@react-three/drei';
import CurvedRoad from '@/components/city/CurvedRoad';
import PlotMesh from '@/components/city/PlotMesh';
import { DEMO_ROAD, demoPlots } from '@/lib/city/curveDemo';
import { plotProblems, sampleCurve, validateSpec } from '@/lib/city/curves';

// A sandbox for curved roads: one sample road with plots on both sides, away from the city, so the
// look can be judged (and a new design previewed by changing lib/city/curveDemo.js).
export default function CurvesPage() {
  const curve = useMemo(() => sampleCurve(DEMO_ROAD), []);
  const plots = useMemo(() => demoPlots(DEMO_ROAD), []);
  const problems = useMemo(
    () => [...validateSpec(DEMO_ROAD), ...plotProblems(curve, plots)],
    [curve, plots]
  );

  // look at the middle of the road
  const mid = curve.points[Math.floor(curve.points.length / 2)];

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#090d16]">
      <header className="absolute left-0 right-0 top-0 z-10 border-b border-slate-800 bg-slate-900/70 p-4 text-slate-100 backdrop-blur-md">
        <h1 className="text-base font-bold">Curved road sandbox</h1>
        <p className="text-xs text-slate-400">
          {DEMO_ROAD.name}: {curve.length.toFixed(0)} units long, {plots.length} plots (every one turned to face the road).{' '}
          {problems.length === 0 ? (
            <span className="text-emerald-400">No problems: nothing overlaps and nothing sits on the road.</span>
          ) : (
            <span className="text-amber-400">{problems.length} problem(s): {problems.slice(0, 2).join('; ')}</span>
          )}{' '}
          Drag to pan, scroll to zoom. The design is in lib/city/curveDemo.js.
        </p>
      </header>

      <Canvas shadows>
        <OrthographicCamera makeDefault zoom={22} position={[mid.x + 30, 30, mid.z + 30]} near={-100} far={300} />
        <MapControls makeDefault enableRotate={false} enableDamping dampingFactor={0.08} minZoom={8} maxZoom={80} target={[mid.x, 0, mid.z]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[mid.x + 20, 40, mid.z + 15]} intensity={1.5} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-45} shadow-camera-right={45} shadow-camera-top={45} shadow-camera-bottom={-45} />
        <directionalLight position={[-20, 20, -20]} intensity={0.3} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[mid.x, -0.01, mid.z]} receiveShadow>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="#0b1220" roughness={1} />
        </mesh>
        <gridHelper args={[200, 100, '#1e293b', '#0f172a']} position={[mid.x, 0, mid.z]} />

        <CurvedRoad spec={DEMO_ROAD} />
        {plots.map((plot) => (
          <PlotMesh key={plot.id} plot={plot} isSelected={false} onSelect={() => {}} />
        ))}
      </Canvas>
    </main>
  );
}
