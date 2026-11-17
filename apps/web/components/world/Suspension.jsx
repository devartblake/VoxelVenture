"use client";

import React, { useMemo } from 'react';
import { SUSPENSION, suspension } from '@/lib/world/suspension';
import { BridgeDeck, BridgeLights, Boxes, Rods, placeAt, useCauseway } from './BridgeKit';

// The suspension bridge's towers, cables and suspenders (lib/world/suspension.js, docs/world/suspension_bridge.md): drawn over Harbor Causeway's deck, in International Orange, with the night lights on the towers and
// cables. Mounted with the baked world (?world=baked) and on the dev page. Instanced meshes (boxes for the towers, rods for the cables and suspenders, the girder deck, the lights): a few hundred instances, a handful of draw calls.
export default function Suspension() {
  const found = useCauseway(SUSPENSION.ids);
  const parts = useMemo(() => {
    if (!found) return null;
    const { line, bridge } = found;
    const st = suspension(bridge);
    const boxes = [];
    for (const t of st.towers) {
      for (const leg of t.legs) for (const b of leg.boxes) boxes.push({ p: placeAt(line, t.s, leg.lateral, (b.y0 + b.y1) / 2), size: [b.across, b.y1 - b.y0, b.along] });
      for (const br of t.braces) boxes.push({ p: placeAt(line, t.s, (br.lateral0 + br.lateral1) / 2, br.y), size: [br.lateral1 - br.lateral0, 0.8, 1.1] });
    }
    const rods = [];
    for (const c of st.cables) for (let i = 1; i < c.points.length; i++) rods.push({ a: placeAt(line, c.points[i - 1].s, c.side * SUSPENSION.legOffset, c.points[i - 1].y), b: placeAt(line, c.points[i].s, c.side * SUSPENSION.legOffset, c.points[i].y), r: SUSPENSION.cableRadius });
    for (const h of st.hangers) rods.push({ a: placeAt(line, h.s, h.side * SUSPENSION.legOffset, h.y0), b: placeAt(line, h.s, h.side * SUSPENSION.legOffset, h.y1), r: SUSPENSION.hangerRadius });
    return { boxes, rods, lights: st.lights };
  }, [found]);
  if (!parts) return null;
  const { line, bridge } = found;
  return (
    <group name="suspension">
      <BridgeDeck line={line} bridge={bridge} color={SUSPENSION.color} />
      <Boxes list={parts.boxes} line={line} color={SUSPENSION.color} roughness={0.55} metalness={0.25} />
      <Rods list={parts.rods} color={SUSPENSION.color} />
      <BridgeLights line={line} lights={parts.lights} />
    </group>
  );
}
