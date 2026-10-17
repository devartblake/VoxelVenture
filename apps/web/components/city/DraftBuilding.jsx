"use client";

import React, { useEffect, useMemo } from 'react';
import { modelFor } from '@/lib/content/models';
import { buildingSize } from '@/lib/city/cityGenerator';
import { useDraft } from '@/lib/state/draftStore';
import { Kind, ensureModels, useModels } from './ModelBuildings';

// The building a player is setting up on an empty lot, shown in the city while they choose its floors, shape and colours. It is drawn with the same models and
// the same placement as a real building (so what they see is what they get), and goes away when the claim form closes. Its rooftop feature is drawn by Crowns.jsx.
export default function DraftBuilding() {
  const plot = useDraft((s) => s.plot);
  const geometries = useModels((s) => s.geometries);
  const model = useMemo(() => (plot ? modelFor(plot) : null), [plot]);
  useEffect(() => {
    if (model) ensureModels([model.id]);
  }, [model?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!plot) return null;
  if (model && geometries[model.id]) return <Kind key={model.id} id={model.id} rows={[{ plot, m: model }]} selectedId={null} hoveredId={null} onSelect={() => {}} onHover={() => {}} />;
  // while the model loads (or with models off): a plain box of the right size
  const { bw, bd } = buildingSize(plot);
  return (
    <mesh position={[plot.x, plot.height / 2 + 0.1, plot.z]} rotation={[0, plot.yaw ?? 0, 0]} castShadow>
      <boxGeometry args={[bw, plot.height, bd]} />
      <meshStandardMaterial color={plot.wallColor ?? plot.color ?? '#94a3b8'} roughness={0.7} />
    </mesh>
  );
}
