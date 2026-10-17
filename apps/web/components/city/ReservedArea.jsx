"use client";

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import Label3D from './Label3D';
import { usePanel } from '@/lib/state/panelStore';
import { devToolsOn } from '@/lib/dev/devTools';

const DASH = 0.8;
const PITCH = 1.4;
const Y = 0.025;
const AMBER = '#f59e0b';

// Land kept clear for a hand-designed road and plot: a faint amber wash with a dashed border and a
// label. It is only a marker: nothing blocks the avatar or the traffic here. In development, clicking it opens the
// site designer in the side panel; once a site has a design only its outline stays (the design's own streets and lots
// are drawn like any others).
export default function ReservedArea({ area }) {
  const { x0, x1, z0, z1, designed } = area;
  const dev = devToolsOn();
  const market = Boolean(area.market);
  const label = designed ? `${area.designName ?? 'Designed site'} (designed)` : dev ? `${area.code ?? ''} Reserved: your road & plot (click to design)` : `${area.code ?? ''} ${area.label}`.trim();
  const w = x1 - x0;
  const d = z1 - z0;

  // dash positions around the border, relative to the area's centre
  const dashes = useMemo(() => {
    const out = [];
    for (let x = -w / 2 + DASH / 2; x < w / 2; x += PITCH) out.push({ x, z: -d / 2, alongX: true }, { x, z: d / 2, alongX: true });
    for (let z = -d / 2 + DASH / 2; z < d / 2; z += PITCH) out.push({ x: -w / 2, z, alongX: false }, { x: w / 2, z, alongX: false });
    return out;
  }, [w, d]);

  const mesh = useRef(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    dashes.forEach((dash, i) => {
      m.makeScale(dash.alongX ? DASH : 0.14, 1, dash.alongX ? 0.14 : DASH).setPosition(dash.x, Y, dash.z);
      mesh.current.setMatrixAt(i, m);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [dashes]);

  return (
    <group position={[(x0 + x1) / 2, 0, (z0 + z1) / 2]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.012, 0]}
        onClick={
          dev || market
            ? (e) => {
                e.stopPropagation();
                usePanel.getState().editReserved(area.id);
              }
            : undefined
        }
      >
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color={AMBER} transparent opacity={designed ? 0.02 : 0.07} depthWrite={false} />
      </mesh>
      <instancedMesh ref={mesh} args={[undefined, undefined, dashes.length]} frustumCulled={false}>
        <boxGeometry args={[1, 0.03, 1]} />
        <meshBasicMaterial color={AMBER} />
      </instancedMesh>
      {!market && <Label3D text={label} position={[0, 0.9, designed ? -d / 2 - 0.8 : -d / 2 + 2]} background="#78350f" color="#fde68a" border={AMBER} height={0.9} />}
    </group>
  );
}
