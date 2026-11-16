"use client";

import React, { useMemo } from 'react';
import { ARCH, archBridge } from '@/lib/world/archBridge';
import { BridgeDeck, BridgeLights, Boxes, Rods, placeAt, useCauseway } from './BridgeKit';

// The arch bridge (lib/world/archBridge.js, docs/world/arch_bridge.md): the North Causeway drawn after the steel through-arch bridge of Sydney harbour: two latticed ribs, hangers and posts, cross struts, four stone pylons and a girder
// deck, in grey steel, with the night lights along the arch. Mounted with the baked world (?world=baked) and on the dev page. Instanced rods and boxes: about a thousand instances, a handful of draw calls.
export default function ArchBridge() {
  const found = useCauseway(ARCH.ids);
  const parts = useMemo(() => {
    if (!found) return null;
    const { line, bridge } = found;
    const a = archBridge(bridge);
    const L = ARCH.legOffset;
    const rods = [];
    for (const rib of a.ribs) {
      for (let i = 1; i < rib.top.length; i++) {
        rods.push({ a: placeAt(line, rib.top[i - 1].s, rib.lateral, rib.top[i - 1].y), b: placeAt(line, rib.top[i].s, rib.lateral, rib.top[i].y), r: ARCH.chordRadius });
        rods.push({ a: placeAt(line, rib.bottom[i - 1].s, rib.lateral, rib.bottom[i - 1].y), b: placeAt(line, rib.bottom[i].s, rib.lateral, rib.bottom[i].y), r: ARCH.chordRadius });
      }
      for (const w of rib.web) rods.push({ a: placeAt(line, w.from.s, rib.lateral, w.from.y), b: placeAt(line, w.to.s, rib.lateral, w.to.y), r: ARCH.webRadius });
      for (const u of rib.uprights) rods.push({ a: placeAt(line, u.s, rib.lateral, u.y0), b: placeAt(line, u.s, rib.lateral, u.y1), r: ARCH.webRadius });
    }
    const boxes = [];
    // (an outrigger below joins each hanger and post to the deck's edge)
    for (const side of [-1, 1]) {
      for (const h of a.hangers) rods.push({ a: placeAt(line, h.s, side * L, h.y0), b: placeAt(line, h.s, side * L, h.y1), r: ARCH.hangerRadius });
      for (const p of a.posts) rods.push({ a: placeAt(line, p.s, side * L, p.y0), b: placeAt(line, p.s, side * L, p.y1), r: ARCH.hangerRadius * 1.6 });
    }
    for (const h of a.hangers) for (const side of [-1, 1]) boxes.push({ p: placeAt(line, h.s, side * (ARCH.deckWidth / 2 + L) / 2, h.y0), size: [L - ARCH.deckWidth / 2 + 0.1, 0.3, 0.5], color: ARCH.steel });
    for (const p of a.posts) for (const side of [-1, 1]) boxes.push({ p: placeAt(line, p.s, side * (ARCH.deckWidth / 2 + L) / 2, p.y1), size: [L - ARCH.deckWidth / 2 + 0.1, 0.3, 0.5], color: ARCH.steel });
    for (const s of a.struts) boxes.push({ p: placeAt(line, s.s, 0, s.y), size: [s.lateral1 - s.lateral0, 0.5, 0.6], color: ARCH.steel });
    const stone = [];
    for (const py of a.pylons) for (const b of py.boxes) stone.push({ p: placeAt(line, py.s, py.lateral, (b.y0 + b.y1) / 2), size: [b.across, b.y1 - b.y0, b.along] });
    return { rods, boxes, stone, lights: a.lights };
  }, [found]);
  if (!parts) return null;
  const { line, bridge } = found;
  return (
    <group name="arch-bridge">
      <BridgeDeck line={line} bridge={bridge} color="#6b7280" />
      <Rods list={parts.rods} color={ARCH.steel} roughness={0.55} metalness={0.4} />
      <Boxes list={parts.boxes} line={line} color={ARCH.steel} roughness={0.55} metalness={0.4} />
      <Boxes list={parts.stone} line={line} color={ARCH.stone} roughness={0.9} metalness={0} />
      <BridgeLights line={line} lights={parts.lights} />
    </group>
  );
}
