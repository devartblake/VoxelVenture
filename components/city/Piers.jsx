"use client";

import React from 'react';
import StaticBatch from './StaticBatch';
import { lampHeadMaterial } from './nightLights';
import { PropModel, usePropsReady } from './PropModels';

// The piers (lib/city/piers.js): a wooden deck on posts out into the water, with mooring posts beside the dock and a lantern at the end where you fish. The deck is a
// little above the water and the bank (it is walkable: lib/sim/collision.js cuts it out of the water). Everything here stands still, so it is baked into a few meshes.
const DECK_Y = 0.06;
const SLAB_SCALE_Y = 0.64; // the platform is 0.23 thick: 0.15 here, its top at the deck height
const SLAB_Y = DECK_Y - 0.23 * SLAB_SCALE_Y;
const PIER_MODELS = ['pirate/platform', 'pirate/barrel', 'pirate/crate'];
const PLANK = '#a16207';
const POST = '#78350f';

function Pier({ p, ready }) {
  const alongX = p.axis === 'x';
  const len = Math.abs(p.x1 - p.x0 > p.z1 - p.z0 ? p.x1 - p.x0 : p.z1 - p.z0);
  const cx = (p.x0 + p.x1) / 2;
  const cz = (p.z0 + p.z1) / 2;
  // positions along the pier, from the land end to the tip
  const steps = Math.max(2, Math.round(len / 1.5));
  const at = (u, v, y) => {
    // u: 0 at the land end .. 1 at the tip; v: across the deck
    const pos = alongX ? [p.start.x + (p.tip.x - p.start.x) * u, y, p.start.z + v] : [p.start.x + v, y, p.start.z + (p.tip.z - p.start.z) * u];
    return pos;
  };
  const dims = (along, across, h) => (alongX ? [along, h, across] : [across, h, along]);
  const side = p.dock.side;
  const slabCount = Math.max(2, Math.round(len / 1.7));
  const slabs = Array.from({ length: slabCount }, (_, i) => (i + 0.5) / slabCount);
  return (
    <group>
      {/* the paved landing where the pier meets the bank */}
      {p.plaza && (
        <mesh position={[(p.plaza.x0 + p.plaza.x1) / 2, 0.018, (p.plaza.z0 + p.plaza.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[p.plaza.x1 - p.plaza.x0, p.plaza.z1 - p.plaza.z0]} />
          <meshStandardMaterial color="#d8d2c4" roughness={0.95} />
        </mesh>
      )}
      {/* the deck: the Pirate Kit's platform, one slab per 1.7 along the pier (the plank deck below is the fallback until the model has loaded) */}
      {/* a dark base under the deck, so the gaps between the planks are not see-through */}
      <mesh position={[cx, DECK_Y - 0.03, cz]}>
        <boxGeometry args={dims(len, p.width, 0.03)} />
        <meshStandardMaterial color="#4a2f14" roughness={1} />
      </mesh>
      {ready ? (
        slabs.map((u) => <PropModel key={u} id="pirate/platform" position={at(u, 0, SLAB_Y)} rotation={[0, alongX ? 0 : Math.PI / 2, 0]} scale={[len / slabs.length / 2.5, SLAB_SCALE_Y, p.width / 2.51]} />)
      ) : (
        <>
          <mesh position={[cx, DECK_Y - 0.05, cz]} receiveShadow>
            <boxGeometry args={dims(len, p.width, 0.1)} />
            <meshStandardMaterial color={PLANK} roughness={0.9} />
          </mesh>
          {Array.from({ length: Math.round(len / 0.45) }, (_, i) => (
            <mesh key={i} position={at((i + 0.5) / Math.round(len / 0.45), 0, DECK_Y + 0.003)}>
              <boxGeometry args={dims(0.04, p.width, 0.01)} />
              <meshStandardMaterial color="#713f12" roughness={1} />
            </mesh>
          ))}
        </>
      )}
      {/* a barrel and a crate on the landing */}
      {ready && p.plaza && (
        <>
          <PropModel id="pirate/barrel" position={[(p.plaza.x0 + p.plaza.x1) / 2 + (alongX ? 0 : 1.2), 0.02, (p.plaza.z0 + p.plaza.z1) / 2 + (alongX ? 1.2 : 0)]} scale={0.8} />
          <PropModel id="pirate/crate" position={[(p.plaza.x0 + p.plaza.x1) / 2 + (alongX ? 0.3 : -1.2), 0.02, (p.plaza.z0 + p.plaza.z1) / 2 + (alongX ? -1.2 : 0.3)]} rotation={[0, 0.5, 0]} scale={0.7} />
        </>
      )}
      {/* the posts under the deck, standing in the water */}
      {Array.from({ length: steps + 1 }, (_, i) => i / steps).flatMap((u) => [-1, 1].map((k) => (
        <mesh key={`${u}${k}`} position={at(u, (k * p.width) / 2 - k * 0.08, -0.2)} castShadow>
          <cylinderGeometry args={[0.07, 0.08, 0.7, 6]} />
          <meshStandardMaterial color={POST} roughness={0.95} />
        </mesh>
      )))}
      {/* mooring posts on the dock side, where a boat ties up */}
      {[0.35, 0.75].map((u) => (
        <mesh key={u} position={at(u, side * (p.width / 2 + 0.06), 0.3)}>
          <cylinderGeometry args={[0.07, 0.09, 0.5, 6]} />
          <meshStandardMaterial color={POST} roughness={0.9} />
        </mesh>
      ))}
      {/* a rail along the side away from the dock, and the lantern post at the end */}
      <mesh position={at(0.5, -side * (p.width / 2 - 0.04), 0.32)}>
        <boxGeometry args={dims(len * 0.9, 0.05, 0.05)} />
        <meshStandardMaterial color={POST} roughness={0.9} />
      </mesh>
      <mesh position={at(1, -side * (p.width / 2 - 0.1), 0.35)}>
        <cylinderGeometry args={[0.04, 0.05, 0.7, 6]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.6} />
      </mesh>
      <mesh position={at(1, -side * (p.width / 2 - 0.1), 0.78)}>
        <sphereGeometry args={[0.09, 8, 6]} />
        <primitive object={lampHeadMaterial} attach="material" />
      </mesh>
    </group>
  );
}

export default function Piers({ piers }) {
  const ready = usePropsReady(PIER_MODELS);
  if (!piers?.length) return null;
  // the batch is baked once, so it is built again when the models have loaded
  const key = `${piers.map((p) => p.id).join(',')}-${ready}`;
  return (
    <StaticBatch key={key} name="piers" castShadow>
      {piers.map((p) => <Pier key={p.id} p={p} ready={ready} />)}
    </StaticBatch>
  );
}
