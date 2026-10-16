"use client";

import React, { useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { avatarState } from '@/lib/sim/avatarState';
import { PRESETS, useView } from '@/lib/state/viewStore';
import StaticBatch from './StaticBatch';
import Road from './Road';
import IntersectionControl from './IntersectionControl';
import MidBlockCrossing from './MidBlockCrossing';

// PROTOTYPE (feasibility study of a streamed world, switched on with ?stream=<chunk size>[&radius=<chunks>] in the address).
// The road network (roads, junctions, mid-block crossings: about nine tenths of the scene's objects) is cut into square chunks, and
// only the chunks near where you are looking are mounted, each as its own baked batch. Walking or panning on mounts the chunks
// that come into range and unmounts (and disposes) the ones that leave. Nothing else about the city changes: this measures what
// the streaming costs and saves; it is not the finished design (see docs/study_world_streaming.md).
const stats = { mounted: 0, mounts: 0, unmounts: 0, lastSwitchMs: 0 };
if (typeof window !== 'undefined') window.__vvStream = stats;

// Cut every road into pieces that each lie in one chunk (a long road becomes several short ones), and bucket the junctions and
// crossings by the chunk they stand in.
export function chunkNetwork(layout, size) {
  const cells = new Map();
  const cell = (cx, cz) => {
    const key = `${cx},${cz}`;
    if (!cells.has(key)) cells.set(key, { key, cx, cz, roads: [], junctions: [], crossings: [] });
    return cells.get(key);
  };
  const at = (v) => Math.floor(v / size);
  for (const road of layout.roads) {
    for (let i = at(road.from); i <= at(road.to - 1e-6); i++) {
      const from = Math.max(road.from, i * size);
      const to = Math.min(road.to, (i + 1) * size);
      if (to - from < 1e-6) continue;
      const labelAt = road.labelAt && (road.axis === 'x' ? road.labelAt[0] : road.labelAt[1]) >= from && (road.axis === 'x' ? road.labelAt[0] : road.labelAt[1]) < to ? road.labelAt : null;
      const seg = { ...road, id: `${road.id}#${i}`, from, to, labelAt, crossings: (road.crossings ?? []).filter((c) => c >= from && c < to) };
      (road.axis === 'x' ? cell(i, at(road.center)) : cell(at(road.center), i)).roads.push(seg);
    }
  }
  for (const ix of layout.intersections) cell(at(ix.x), at(ix.z)).junctions.push(ix);
  for (const c of layout.crossings) cell(at(c.x), at(c.z)).crossings.push(c);
  return cells;
}

function Chunk({ chunk, batchKey }) {
  React.useEffect(() => {
    stats.mounted++;
    stats.mounts++;
    return () => {
      stats.mounted--;
      stats.unmounts++;
    };
  }, []);
  return (
    <StaticBatch key={`${batchKey}-${chunk.key}`} name={`chunk-${chunk.key}`}>
      {chunk.roads.map((r) => (
        <Road key={r.id} road={r} />
      ))}
      {chunk.junctions.map((i) => (
        <IntersectionControl key={i.id} intersection={i} />
      ))}
      {chunk.crossings.map((c) => (
        <MidBlockCrossing key={c.id} crossing={c} />
      ))}
    </StaticBatch>
  );
}

export default function StreamedNetwork({ layout, batchKey, size, radius }) {
  const cells = useMemo(() => chunkNetwork(layout, size), [layout, size]);
  const controls = useThree((s) => s.controls);
  const [focus, setFocus] = useState(null);

  useFrame(() => {
    // where the world is being looked at, in city coordinates: the avatar in the follow views, the map's centre in the isometric one
    let x = avatarState.x;
    let z = avatarState.z;
    if (PRESETS[useView.getState().view].iso && controls) {
      x = controls.target.x + layout.center.x;
      z = controls.target.z + layout.center.z;
    }
    const cx = Math.floor(x / size);
    const cz = Math.floor(z / size);
    setFocus((f) => (f && f.cx === cx && f.cz === cz ? f : { cx, cz }));
  });

  const visible = useMemo(() => {
    if (!focus) return [];
    const out = [];
    for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
      const c = cells.get(`${focus.cx + dx},${focus.cz + dz}`);
      if (c) out.push(c);
    }
    return out;
  }, [focus, cells, radius]);

  return (
    <group name="streamed-network">
      {visible.map((c) => (
        <Chunk key={c.key} chunk={c} batchKey={batchKey} />
      ))}
    </group>
  );
}
