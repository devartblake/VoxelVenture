"use client";

import React, { useCallback, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { applyGlow } from '@/components/city/nightLights';
import { OrbitControls } from '@react-three/drei';
import StreamedWorld from '@/components/world/StreamedWorld';
import Train from '@/components/world/Train';
import Suspension from '@/components/world/Suspension';
import ArchBridge from '@/components/world/ArchBridge';
import TunnelSpike, { FreeCam, startFromQuery, useRoute } from '@/components/dev/TunnelSpike';
import { DatumLegend, DatumPlanes, useDatumLayers } from '@/components/dev/DatumOverlay';

// DEVELOPMENT TOOL: the baked world (public/world) streamed by the chunk manager and flown over with an orbit camera, so the React layer of roadmap task 11 can be seen working without the game.
// The point the orbit controls look at is the focus, so dragging or the jump buttons make chunks mount and unmount. ?profile=phone|desktop|overview. window.__vvStreamedWorld (StreamedWorld.jsx) has the counts.
function Night({ on }) {
  useFrame(() => applyGlow(on ? 1 : 0)); // the game's DayNight does this in the game: here a button
  return null;
}

function Rig({ target, offset }) {
  const { camera } = useThree();
  // a low, oblique view: relief of 18 units needs it
  React.useEffect(() => { camera.position.set(target.x + offset[0], offset[1], target.z + offset[2]); camera.lookAt(target.x, 0, target.z); }, [camera, target, offset]);
  return null;
}

const centre = (land) => [(land.x0 + land.x1) / 2, (land.z0 + land.z1) / 2];

export default function WorldStream() {
  const [manifest, setManifest] = useState(null);
  // ?look=x,z,dx,dy,dz opens at a place with the camera that far from it (for looking at a detail)
  const look = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('look') ?? '').split(',').map(Number) : [];
  const [target, setTarget] = useState(look.length >= 2 && look.every(Number.isFinite) ? { x: look[0], z: look[1] } : { x: 100, z: 100 });
  const [night, setNight] = useState(typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('night') === '1'); // ?night=1 opens at night
  const [offset, setOffset] = useState(look.length === 5 && look.every(Number.isFinite) ? look.slice(2) : [150, 130, 260]);
  const controls = useRef(null);
  const free = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('cam') === 'free'; // ?cam=free: fly (the tunnel spike), instead of orbiting
  const camAt = useRef({ x: target.x, z: target.z });
  const route = useRoute();
  // ?skiptown=1: the game's own arrangement round the first town (lib/world/townJoin.js): the chunks wholly inside the town's land are left out, those that overlap it are joined, and a plain slab stands for the town's land (docs/world/datum.md, "The town border")
  const [townLand, setTownLand] = useState(null);
  const skipTown = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('skiptown') === '1';
  React.useEffect(() => { if (skipTown) fetch('/world/manifest.json').then((r) => r.json()).then((m) => setTownLand(m.towns[0].land)).catch(() => {}); }, [skipTown]);
  // ?datum=1: the world's datum drawn as grids at every named height, with a legend (components/dev/DatumOverlay.jsx)
  const [datum, setDatum] = useState(typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('datum') === '1');
  const datumLayers = useDatumLayers(manifest);
  const [datumOn, setDatumOn] = useState({ sea: true, townGround: true, deck: true, tunnelFloor: true, tunnelRoof: true });
  const profile = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('profile') || 'desktop' : 'desktop';
  const onReady = useCallback((m) => setManifest(m), []);
  const focus = useCallback(() => (free ? { x: camAt.current.x, z: camAt.current.z } : controls.current ? { x: controls.current.target.x, z: controls.current.target.z } : { x: target.x, z: target.z }), [target, free]);
  const places = manifest ? [
    ['Voxel Town', ...centre(manifest.towns[0].land)],
    ['Harbor Town', ...centre(manifest.towns[1].land)],
    ['Blue Mountains', manifest.landmasses[0].features.ranges[0].points[4].x, manifest.landmasses[0].features.ranges[0].points[4].z],
    ['Causeway', (manifest.causeways[0].span.from.x + manifest.causeways[0].span.to.x) / 2, (manifest.causeways[0].span.from.z + manifest.causeways[0].span.to.z) / 2],
    ['Coast', manifest.causeways[0].points[0].x - 150, manifest.causeways[0].points[0].z + 120],
    ...(manifest.tracks ?? []).map((t) => [t.name, (t.bounds.x0 + t.bounds.x1) / 2, (t.bounds.z0 + t.bounds.z1) / 2, [90, 110, 200]]),
  ] : [];
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b1b33' }}>
      <div style={{ position: 'absolute', zIndex: 2, top: 8, left: 8, color: '#e2e8f0', font: '13px sans-serif', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>Streamed world</b>
        {places.map(([name, x, z, look]) => (
          <button key={name} onClick={() => { setOffset(look ?? [150, 130, 260]); setTarget({ x, z }); }} style={{ padding: '2px 8px' }}>{name}</button>
        ))}
        <button onClick={() => setNight((v) => !v)} style={{ padding: '2px 8px' }}>{night ? 'Day' : 'Night'}</button>
        <button onClick={() => setDatum((v) => !v)} style={{ padding: '2px 8px' }}>{datum ? 'Hide datum' : 'Datum'}</button>
      </div>
      {datum && <DatumLegend layers={datumLayers} enabled={datumOn} onToggle={(id) => setDatumOn((o) => ({ ...o, [id]: !o[id] }))} />}
      <Canvas camera={{ fov: free ? 70 : 50, near: free ? 0.05 : 1, far: 6000 }} gl={{ antialias: true }}>
        <color attach="background" args={[night ? '#04070d' : '#0b1b33']} />
        <fog attach="fog" args={[night ? '#04070d' : '#0b1b33', 600, 2600]} />
        <hemisphereLight args={['#bcd4ff', '#2a3a22', night ? 0.12 : 0.7]} />
        <directionalLight position={[-500, 260, 300]} intensity={night ? 0.25 : 2.6} color="#fff1d6" />
        <Night on={night} />
        {free ? (route && <FreeCam start={startFromQuery(route)} onMove={(p) => { camAt.current.x = p.x; camAt.current.z = p.z; }} />) : (
          <>
            <Rig target={target} offset={offset} />
            <OrbitControls ref={controls} key={`${target.x},${target.z}`} target={[target.x, 0, target.z]} maxPolarAngle={Math.PI / 2.05} maxDistance={2500} />
          </>
        )}
        {datum && <DatumPlanes layers={datumLayers} enabled={datumOn} focus={focus} />}
        <Train />
        <Suspension />
        <ArchBridge />
        {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tunnel') === '1' && <TunnelSpike />}
        {skipTown && townLand && <mesh position={[(townLand.x0 + townLand.x1) / 2, 0.004 - 0.3, (townLand.z0 + townLand.z1) / 2]}><boxGeometry args={[townLand.x1 - townLand.x0, 0.6, townLand.z1 - townLand.z0]} /><meshStandardMaterial color="#4d8a4d" /></mesh>}
        <StreamedWorld profile={profile} focus={focus} onReady={onReady} town={skipTown && townLand ? townLand : null} />
      </Canvas>
    </div>
  );
}
