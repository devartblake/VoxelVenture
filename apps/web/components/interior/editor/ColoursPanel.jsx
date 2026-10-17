"use client";

import React, { useState } from 'react';
import { useScene } from '@pascal-app/editor';
import { material as makeMaterial } from '@/lib/content/brandPalette';

// The colours tab of the interior editor: the inside walls, the outside walls and the floor of the whole building in a click, from a small
// palette or any colour. (Each wall can still be set one by one by selecting it.) The outside colour is also the building's colour in the city.
const SWATCHES = ['#f8fafc', '#e5e7eb', '#d6c7a1', '#f5deb3', '#fde68a', '#fca5a5', '#f9a8d4', '#c4b5fd', '#93c5fd', '#7dd3fc', '#86efac', '#a7f3d0', '#94a3b8', '#64748b', '#475569', '#1f2937', '#b45309', '#7c2d12', '#166534', '#1e3a8a'];
// walls need both faces drawn: with only the front face a painted wall disappears
const material = (color, side = 'double') => makeMaterial(color, side);

function Row({ title, hint, value, onPick }) {
  return (
    <section className="border-b border-white/5 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[13px] font-medium text-white">{title}</h4>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value ?? '') ? value : '#ffffff'} onChange={(e) => onPick(e.target.value)} aria-label={`${title}: any colour`} className="h-7 w-9 cursor-pointer rounded border border-white/20 bg-transparent p-0.5" />
      </div>
      <p className="mb-2 text-[11px] text-slate-400">{hint}</p>
      <div className="grid grid-cols-10 gap-1">
        {SWATCHES.map((c) => (
          <button key={c} type="button" onClick={() => onPick(c)} aria-label={c} title={c} style={{ background: c }} className={`aspect-square rounded border ${value === c ? 'border-white ring-2 ring-indigo-400' : 'border-white/20'} hover:scale-110`} />
        ))}
      </div>
    </section>
  );
}

export default function ColoursPanel() {
  const [picked, setPicked] = useState({});
  const apply = (which, color) => {
    const { nodes, updateNodes } = useScene.getState();
    const updates = [];
    for (const n of Object.values(nodes)) {
      if (which === 'floor' && n?.type === 'slab') updates.push({ id: n.id, data: { material: material(color), materialPreset: undefined } });
      if (which === 'inside' && n?.type === 'wall') updates.push({ id: n.id, data: { interiorMaterial: material(color), interiorMaterialPreset: undefined } });
      if (which === 'outside' && n?.type === 'wall') updates.push({ id: n.id, data: { exteriorMaterial: material(color), exteriorMaterialPreset: undefined } });
    }
    if (updates.length) updateNodes(updates);
    setPicked((p) => ({ ...p, [which]: color }));
  };
  return (
    <div className="h-full overflow-y-auto text-slate-200">
      <div className="border-b border-white/10 p-3">
        <h3 className="text-sm font-semibold text-white">Colours</h3>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-400">Paint the whole building. To colour one wall, click it in the room.</p>
      </div>
      <Row title="Inside walls" hint="What visitors see when they step in." value={picked.inside} onPick={(c) => apply('inside', c)} />
      <Row title="Outside walls" hint="Also the colour of your building in the city." value={picked.outside} onPick={(c) => apply('outside', c)} />
      <Row title="Floor" hint="Every floor of the building." value={picked.floor} onPick={(c) => apply('floor', c)} />
    </div>
  );
}
