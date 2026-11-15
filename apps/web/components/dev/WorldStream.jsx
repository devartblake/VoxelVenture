"use client";

import React, { useCallback, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import StreamedWorld from '@/components/world/StreamedWorld';

// DEVELOPMENT TOOL: the baked world (public/world) streamed by the chunk manager and flown over with an orbit camera, so the React layer of roadmap task 11 can be seen working without the game.
// The point the orbit controls look at is the focus, so dragging or the jump buttons make chunks mount and unmount. ?profile=phone|desktop|overview. window.__vvStreamedWorld (StreamedWorld.jsx) has the counts.
function Rig({ target }) {
  const { camera } = useThree();
  // a low, oblique view: relief of 18 units needs it
  React.useEffect(() => { camera.position.set(target.x + 150, 130, target.z + 260); camera.lookAt(target.x, 0, target.z); }, [camera, target]);
  return null;
}

const centre = (land) => [(land.x0 + land.x1) / 2, (land.z0 + land.z1) / 2];

export default function WorldStream() {
  const [manifest, setManifest] = useState(null);
  const [target, setTarget] = useState({ x: 100, z: 100 });
  const controls = useRef(null);
  const profile = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('profile') || 'desktop' : 'desktop';
  const onReady = useCallback((m) => setManifest(m), []);
  const focus = useCallback(() => (controls.current ? { x: controls.current.target.x, z: controls.current.target.z } : { x: target.x, z: target.z }), [target]);
  const places = manifest ? [
    ['Voxel Town', ...centre(manifest.towns[0].land)],
    ['Harbor Town', ...centre(manifest.towns[1].land)],
    ['Blue Mountains', manifest.landmasses[0].features.ranges[0].points[4].x, manifest.landmasses[0].features.ranges[0].points[4].z],
  ] : [];
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b1b33' }}>
      <div style={{ position: 'absolute', zIndex: 2, top: 8, left: 8, color: '#e2e8f0', font: '13px sans-serif', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>Streamed world</b>
        {places.map(([name, x, z]) => (
          <button key={name} onClick={() => setTarget({ x, z })} style={{ padding: '2px 8px' }}>{name}</button>
        ))}
      </div>
      <Canvas camera={{ fov: 50, near: 1, far: 6000 }} gl={{ antialias: true }}>
        <color attach="background" args={['#0b1b33']} />
        <fog attach="fog" args={['#0b1b33', 600, 2600]} />
        <hemisphereLight args={['#bcd4ff', '#2a3a22', 0.7]} />
        <directionalLight position={[-500, 260, 300]} intensity={2.6} color="#fff1d6" />
        <Rig target={target} />
        <OrbitControls ref={controls} key={`${target.x},${target.z}`} target={[target.x, 0, target.z]} maxPolarAngle={Math.PI / 2.05} maxDistance={2500} />
        <StreamedWorld profile={profile} focus={focus} onReady={onReady} />
      </Canvas>
    </div>
  );
}
