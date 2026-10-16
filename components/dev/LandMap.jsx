"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { devToolsOn } from '@/lib/dev/devTools';
import { generateCity } from '@/lib/city/cityGenerator';
import { cityRects, freeZones, summarizeZones } from '@/lib/city/freeLand';
import { tierTargets } from '@/lib/game/landPrice';

// DESIGN TOOL (not in release builds): the free land of a generated city, and what the infill planner does with it. Amber is ground where nothing stands
// (a street with lots could go there); the lime roads and green lots are the new streets and their lots. Switch the new streets off to see the city as it was.
// The planner is lib/city/infill.js, the finder lib/city/freeLand.js.
const ZONE = ['#f59e0b', '#fb923c', '#fbbf24', '#f97316', '#eab308'];

export default function LandMap() {
  const [seed, setSeed] = useState(20260101);
  const [target, setTarget] = useState(1000);
  const [infill, setInfill] = useState(true);
  const [showFree, setShowFree] = useState(true);
  const canvas = useRef(null);
  const on = devToolsOn();
  const city = useMemo(() => (on ? generateCity(seed, { infill: infill ? { target } : false }) : null), [on, seed, target, infill]);
  const base = useMemo(() => (on ? generateCity(seed, { infill: false }) : null), [on, seed]);
  const free = useMemo(() => (city ? freeZones(cityRects(city), city.layout.land, { cell: 2, clear: 1 }) : null), [city]);
  const freeBase = useMemo(() => (base ? freeZones(cityRects(base), base.layout.land, { cell: 2, clear: 1 }) : null), [base]);
  const inside = (zones, county) => zones.filter((z) => z.rect.x0 >= county.x0 - 6 && z.rect.x1 <= county.x1 + 6 && z.rect.z0 >= county.z0 - 6 && z.rect.z1 <= county.z1 + 6);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !city || !free) return;
    const { layout } = city;
    const W = 1500;
    const H = 1000;
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    const land = layout.land;
    const pad = 30;
    const s = Math.min((W - 2 * pad) / (land.x1 - land.x0), (H - 2 * pad) / (land.z1 - land.z0));
    const ox = (W - s * (land.x1 - land.x0)) / 2;
    const oz = (H - s * (land.z1 - land.z0)) / 2;
    const X = (x) => ox + (x - land.x0) * s;
    const Z = (z) => oz + (z - land.z0) * s;
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#14301c';
    ctx.fillRect(X(land.x0), Z(land.z0), (land.x1 - land.x0) * s, (land.z1 - land.z0) * s);
    if (showFree) {
      const g = free.grid;
      for (let j = 0; j < g.nz; j++) {
        for (let i = 0; i < g.nx; i++) {
          const id = g.label[j * g.nx + i];
          if (!id) continue;
          ctx.fillStyle = `${ZONE[(id - 1) % ZONE.length]}99`;
          ctx.fillRect(X(g.x0 + i * g.cell), Z(g.z0 + j * g.cell), g.cell * s + 0.5, g.cell * s + 0.5);
        }
      }
    }
    ctx.fillStyle = '#1d4ed8';
    for (const r of layout.rivers ?? []) ctx.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
    for (const l of layout.lakes ?? []) ctx.fillRect(X(l.x - l.rx), Z(l.z - l.rz), 2 * l.rx * s, 2 * l.rz * s);
    ctx.fillStyle = '#166534';
    for (const p of layout.parks ?? []) ctx.fillRect(X(p.center.x - p.width / 2), Z(p.center.z - p.depth / 2), p.width * s, p.depth * s);
    ctx.strokeStyle = '#94a3b8';
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    const k = layout.county;
    ctx.strokeRect(X(k.x0), Z(k.z0), (k.x1 - k.x0) * s, (k.z1 - k.z0) * s);
    ctx.setLineDash([]);
    if (layout.amusement) {
      ctx.fillStyle = '#f43f5e';
      const a = layout.amusement.rect;
      ctx.fillRect(X(a.x0), Z(a.z0), (a.x1 - a.x0) * s, (a.z1 - a.z0) * s);
    }
    ctx.fillStyle = '#0ea5e9';
    for (const a of layout.reserved ?? []) ctx.fillRect(X(a.x0), Z(a.z0), (a.x1 - a.x0) * s, (a.z1 - a.z0) * s);
    for (const r of layout.roads) {
      ctx.strokeStyle = r.infill ? '#a3e635' : '#64748b';
      ctx.lineWidth = Math.max(1.2, (r.infill ? 2.6 : 2.4) * s);
      ctx.beginPath();
      if (r.axis === 'x') (ctx.moveTo(X(r.from), Z(r.center)), ctx.lineTo(X(r.to), Z(r.center)));
      else (ctx.moveTo(X(r.center), Z(r.from)), ctx.lineTo(X(r.center), Z(r.to)));
      ctx.stroke();
    }
    for (const p of city.plots) {
      ctx.save();
      ctx.translate(X(p.x), Z(p.z));
      ctx.rotate(-(p.yaw ?? 0));
      const w = (p.w ?? 3) * 0.86 * s;
      const d = (p.d ?? 3) * 0.86 * s;
      ctx.fillStyle = p.districtId === 'meadow' ? '#4ade80' : p.grand ? '#ef4444' : p.luxury ? '#a855f7' : p.prime ? '#f59e0b' : '#cbd5e1';
      ctx.fillRect(-w / 2, -d / 2, w, d);
      ctx.restore();
    }
  }, [city, free, showFree]);

  if (!on) return <main className="p-8 text-slate-300">This page is a design tool and is not part of release builds.</main>;
  const county = city.layout.county;
  const sumAll = summarizeZones(free.zones);
  const sumIn = summarizeZones(inside(free.zones, county));
  const sumBaseAll = summarizeZones(freeBase.zones);
  const sumBaseIn = summarizeZones(inside(freeBase.zones, county));
  const newPlots = city.plots.filter((p) => p.districtId === 'meadow').length;
  const targets = tierTargets(city.plots.length);
  const have = (f) => city.plots.filter(f).length;
  return (
    <main className="min-h-screen bg-[#090d16] p-4 text-white">
      <h1 className="text-lg font-bold">Free land and new streets <span className="text-sm font-normal text-slate-400">(design tool)</span></h1>
      <p className="mb-3 max-w-3xl text-xs text-slate-400">Amber is ground with nothing on it. Lime roads and green lots are the new streets the infill planner adds across it (and outer blocks in the country). The dashed line is the county road; blue squares are the reserved sites, kept free for player designs; the red rectangle is the amusement park.</p>
      <div className="flex flex-wrap gap-4">
        <canvas ref={canvas} className="h-auto w-full max-w-5xl rounded-xl border border-slate-700" data-testid="land-canvas" />
        <aside className="w-72 space-y-3 text-xs">
          <section className="space-y-2 rounded-xl border border-slate-700 bg-slate-900/70 p-3">
            <label className="flex items-center justify-between">City seed<input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 1)} className="w-28 rounded bg-slate-800 px-2 py-1 text-right" /></label>
            <label className="block">
              <span className="flex justify-between">Lots wanted in all<span className="font-mono">{target}</span></span>
              <input type="range" min="700" max="1600" step="50" value={target} onChange={(e) => setTarget(Number(e.target.value))} className="w-full accent-lime-400" />
            </label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={infill} onChange={(e) => setInfill(e.target.checked)} /> New streets on</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={showFree} onChange={(e) => setShowFree(e.target.checked)} /> Show the free ground</label>
          </section>
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-3" data-testid="land-summary">
            <table className="w-full">
              <thead><tr className="text-left text-slate-400"><th /><th className="text-right">Before</th><th className="text-right">Now</th></tr></thead>
              <tbody>
                <tr><td>Lots</td><td className="text-right">{base.plots.length}</td><td className="text-right font-bold" data-testid="land-lots">{city.plots.length}</td></tr>
                <tr><td>Roads</td><td className="text-right">{base.layout.roads.length}</td><td className="text-right">{city.layout.roads.length}</td></tr>
                <tr><td>Junctions</td><td className="text-right">{base.layout.intersections.length}</td><td className="text-right">{city.layout.intersections.length}</td></tr>
                <tr><td>Free ground, inside the county road</td><td className="text-right">{sumBaseIn.area}</td><td className="text-right">{sumIn.area}</td></tr>
                <tr><td>...room for lots</td><td className="text-right">{sumBaseIn.capacity}</td><td className="text-right">{sumIn.capacity}</td></tr>
                <tr><td>Free ground, outside it</td><td className="text-right">{sumBaseAll.area - sumBaseIn.area}</td><td className="text-right">{sumAll.area - sumIn.area}</td></tr>
                <tr><td>...room for lots</td><td className="text-right">{sumBaseAll.capacity - sumBaseIn.capacity}</td><td className="text-right">{sumAll.capacity - sumIn.capacity}</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-[10px] text-slate-500">{newPlots} lots are on the new streets. Free ground in square units; room for lots is an estimate (streets and corners use a quarter).</p>
          </section>
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
            <h2 className="mb-1 font-bold">Mix of tiers ({city.plots.length} lots)</h2>
            <table className="w-full">
              <thead><tr className="text-left text-slate-400"><th /><th className="text-right">Have</th><th className="text-right">Target</th></tr></thead>
              <tbody>
                <tr><td>Prime</td><td className="text-right">{have((p) => p.prime && !p.luxury)}</td><td className="text-right">{targets.prime}</td></tr>
                <tr><td>Luxury</td><td className="text-right">{have((p) => p.luxury && !p.grand)}</td><td className="text-right">{targets.luxury}</td></tr>
                <tr><td>Grand</td><td className="text-right">{have((p) => p.grand)}</td><td className="text-right">{targets.grand}</td></tr>
              </tbody>
            </table>
          </section>
        </aside>
      </div>
    </main>
  );
}
