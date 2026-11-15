"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { devToolsOn } from '@/lib/dev/devTools';
import { buildWorld } from '@/lib/world/buildWorld';
import { WORLD_RECIPE } from '@/lib/world/worldRecipe';

// DESIGN TOOL (not in release builds): the world recipe on one map (docs/world/world_recipe.md). The sea, each landmass's coast with its beach, harbour piers and hills,
// each town's roads and every plot as a dot in its district's colour, and the numbers: how many plots, which ids, how far apart. The game does NOT load the island yet:
// the streaming runtime (roadmap task 11) comes first. This page is how the recipe is checked by eye.
const W = 1500;
const H = 760;

const hex = (c, fallback = '#64748b') => (typeof c === 'string' && c.startsWith('#') ? c : fallback);

export default function WorldMap() {
  const on = devToolsOn();
  const world = useMemo(() => (on ? buildWorld(WORLD_RECIPE) : null), [on]);
  const [show, setShow] = useState({ roads: true, plots: true, features: true, land: true });
  const [focus, setFocus] = useState('all'); // 'all' or a town id
  const canvas = useRef(null);

  const view = useMemo(() => {
    if (!world) return null;
    const area = focus === 'all' ? world.ocean : (() => { const l = world.landmasses.find((m) => m.towns.includes(focus)); const b = l.bounds; const pad = 60; return { x0: b.x0 - pad, x1: b.x1 + pad, z0: b.z0 - pad, z1: b.z1 + pad }; })();
    const s = Math.min(W / (area.x1 - area.x0), H / (area.z1 - area.z0));
    const ox = (W - s * (area.x1 - area.x0)) / 2 - area.x0 * s;
    const oz = (H - s * (area.z1 - area.z0)) / 2 - area.z0 * s;
    return { s, X: (x) => ox + x * s, Z: (z) => oz + z * s };
  }, [world, focus]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !world || !view) return;
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    const { s, X, Z } = view;
    ctx.fillStyle = '#0a1f3d'; // the sea
    ctx.fillRect(0, 0, W, H);
    for (const m of world.landmasses) {
      const path = () => { ctx.beginPath(); m.outline.points.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Z(p.z)) : ctx.moveTo(X(p.x), Z(p.z)))); ctx.closePath(); };
      path();
      ctx.fillStyle = '#e8d9a8'; // the beach: the whole landmass first,
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#94a3b8';
      ctx.stroke();
      // then the grass inside the beach band
      ctx.save();
      if (m.outline.kind === 'template') {
        // a coast with a real shape (a variation of an island: lib/world/shapes.js): a beach band of the same width all round, which a shrunk copy of the outline would not give (thick at the
        // tips, thin along the sides)
        path();
        ctx.clip();
        path();
        ctx.fillStyle = '#1c3d24';
        ctx.fill();
        path();
        ctx.lineWidth = 2 * 16 * s;
        ctx.strokeStyle = '#e8d9a8';
        ctx.stroke();
      } else {
        ctx.beginPath();
        m.outline.points.forEach((p, i) => { const q = { x: m.centre.x + (p.x - m.centre.x) * 0.93, z: m.centre.z + (p.z - m.centre.z) * 0.93 }; if (i) ctx.lineTo(X(q.x), Z(q.z)); else ctx.moveTo(X(q.x), Z(q.z)); });
        ctx.closePath();
        ctx.fillStyle = '#1c3d24';
        ctx.fill();
      }
      ctx.restore();
      if (show.features) {
        const f = m.features ?? {};
        // mountain ranges (a template coast has them): a broad dark band along the line, a lighter ridge on top, and the name; the taller, the darker
        for (const rg of f.ranges ?? []) {
          const line = () => { ctx.beginPath(); rg.points.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Z(p.z)) : ctx.moveTo(X(p.x), Z(p.z)))); };
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          line();
          ctx.lineWidth = Math.max(4, rg.width * s);
          ctx.strokeStyle = rg.height >= 12 ? '#2c4a30' : '#336a3d';
          ctx.stroke();
          line();
          ctx.lineWidth = Math.max(2, rg.width * s * 0.35);
          ctx.strokeStyle = rg.height >= 12 ? '#6b8f64' : '#5f9a5c';
          ctx.stroke();
          ctx.lineCap = 'butt';
          const mid = rg.points[Math.floor(rg.points.length / 2)];
          ctx.fillStyle = '#e2e8f0';
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${rg.name} (${rg.height})`, X(mid.x), Z(mid.z) - Math.max(8, (rg.width * s) / 2 + 6));
          ctx.textAlign = 'left';
        }
        for (const h of f.hills ?? []) { ctx.beginPath(); ctx.arc(X(h.x), Z(h.z), h.radius * s, 0, Math.PI * 2); ctx.fillStyle = '#2f5a35'; ctx.fill(); }
        if (f.airstrip) {
          // the apron (a grey strip on the town's side), the runway (a wider grey line along its heading) and its white centreline, with the name beside it
          const a = f.airstrip;
          const [tx, tz] = a.frame.t;
          const half = a.frame.runwayHalf;
          ctx.lineCap = 'butt';
          ctx.strokeStyle = '#6b7280';
          ctx.lineWidth = Math.max(3, a.apron.across * s);
          ctx.beginPath(); ctx.moveTo(X(a.apron.x - tx * a.apron.along / 2), Z(a.apron.z - tz * a.apron.along / 2)); ctx.lineTo(X(a.apron.x + tx * a.apron.along / 2), Z(a.apron.z + tz * a.apron.along / 2)); ctx.stroke();
          ctx.strokeStyle = '#9aa3b2';
          ctx.lineWidth = Math.max(3, a.width * s);
          ctx.beginPath(); ctx.moveTo(X(a.at.x - tx * half), Z(a.at.z - tz * half)); ctx.lineTo(X(a.at.x + tx * half), Z(a.at.z + tz * half)); ctx.stroke();
          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(X(a.at.x - tx * half), Z(a.at.z - tz * half)); ctx.lineTo(X(a.at.x + tx * half), Z(a.at.z + tz * half)); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#e2e8f0';
          ctx.font = '11px sans-serif';
          // the name goes on the town's side of the apron, where the land is dark, not on the beach
          const [nx, nz] = a.frame.n;
          ctx.textAlign = nx < -0.3 ? 'right' : 'left';
          ctx.fillText(a.name ?? 'Airstrip', X(a.apron.x + nx * (a.apron.across / 2 + 6)), Z(a.apron.z + nz * (a.apron.across / 2 + 6)) + 4);
          ctx.textAlign = 'left';
        }
        if (f.harbour) {
          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = 3;
          for (const p of f.harbour.piers) { ctx.beginPath(); ctx.moveTo(X(p.x), Z(p.z)); ctx.lineTo(X(p.x + p.out.x * p.length), Z(p.z + p.out.z * p.length)); ctx.stroke(); }
          ctx.fillStyle = '#fde047';
          ctx.fillRect(X(f.harbour.quay.x) - 4, Z(f.harbour.quay.z) - 4, 8, 8);
        }
        for (const hd of f.headlands ?? []) { ctx.beginPath(); ctx.arc(X(hd.at.x), Z(hd.at.z), 5, 0, Math.PI * 2); ctx.fillStyle = '#f97316'; ctx.fill(); }
      }
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 22px sans-serif';
      ctx.fillText(m.name, X(m.centre.x) - ctx.measureText(m.name).width / 2, Z(m.bounds.z0) - 10);
    }
    // the highways (lib/world/highways.js): the coastal ring road and a spur from each side of the town's county road to it
    if (show.roads) {
      for (const h of world.highways ?? []) {
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = Math.max(1.5, h.width * s);
        ctx.beginPath(); h.ring.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Z(p.z)) : ctx.moveTo(X(p.x), Z(p.z)))); ctx.closePath(); ctx.stroke();
        for (const sp of h.spurs) { ctx.beginPath(); ctx.moveTo(X(sp.from.x), Z(sp.from.z)); ctx.lineTo(X(sp.to.x), Z(sp.to.z)); ctx.stroke(); }
      }
      // link roads: from the harbour's quay and from an airstrip's apron to the nearest spur
      for (const l of world.links ?? []) { ctx.strokeStyle = '#fb923c'; ctx.lineWidth = Math.max(1.5, l.width * s); ctx.beginPath(); ctx.moveTo(X(l.from.x), Z(l.from.z)); ctx.lineTo(X(l.to.x), Z(l.to.z)); ctx.stroke(); }
      // the causeways: the road is on land (amber), and the bridge over the water is lighter with dark edges
      for (const c of world.causeways ?? []) {
        ctx.lineCap = 'butt';
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = Math.max(1.5, c.width * s);
        ctx.beginPath(); ctx.moveTo(X(c.points[0].x), Z(c.points[0].z)); ctx.lineTo(X(c.points[1].x), Z(c.points[1].z)); ctx.stroke();
        ctx.strokeStyle = '#fef3c7';
        ctx.lineWidth = Math.max(1, (c.width - 3) * s);
        ctx.beginPath(); ctx.moveTo(X(c.bridge.from.x), Z(c.bridge.from.z)); ctx.lineTo(X(c.bridge.to.x), Z(c.bridge.to.z)); ctx.stroke();
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '11px sans-serif';
        ctx.fillText(c.name, X((c.bridge.from.x + c.bridge.to.x) / 2) - 30, Z((c.bridge.from.z + c.bridge.to.z) / 2) - 8);
      }
    }
    for (const t of world.towns) {
      if (show.land) { ctx.strokeStyle = 'rgba(148,163,184,0.45)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1; ctx.strokeRect(X(t.land.x0), Z(t.land.z0), (t.land.x1 - t.land.x0) * s, (t.land.z1 - t.land.z0) * s); ctx.setLineDash([]); }
      if (show.roads) {
        ctx.lineWidth = Math.max(1, 2.6 * s);
        for (const r of t.roads) {
          ctx.strokeStyle = r.id.includes(':ext-') ? '#a3e635' : r.class === 'arterial' ? '#cbd5e1' : '#64748b';
          ctx.beginPath();
          if (r.axis === 'x') { ctx.moveTo(X(r.from), Z(r.center)); ctx.lineTo(X(r.to), Z(r.center)); } else { ctx.moveTo(X(r.center), Z(r.from)); ctx.lineTo(X(r.center), Z(r.to)); }
          ctx.stroke();
        }
      }
      if (show.plots) {
        const colour = Object.fromEntries((t.city.layout.districts ?? []).map((d) => [d.id, hex(d.color)]));
        const first = t.city.layout.extension?.firstId ?? Infinity;
        const dot = Math.max(1.2, 3.2 * s);
        for (const p of t.plots) {
          ctx.fillStyle = p.localId >= first && p.localId < 100000 ? '#a3e635' : colour[p.districtId] ?? '#94a3b8'; // lime: the lots added to the first town
          ctx.fillRect(X(p.x) - dot / 2, Z(p.z) - dot / 2, dot, dot);
        }
      }
    }
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px sans-serif';
    ctx.fillText('0', 12, H - 22);
    ctx.fillRect(12, H - 16, 100 * s, 3);
    ctx.fillText('100 units', 12 + 100 * s + 6, H - 12);
  }, [world, view, show]);

  if (!on) return <p className="p-6 text-sm text-slate-400">The world map is a development tool: it is not in release builds.</p>;
  const toggle = (k) => setShow((s) => ({ ...s, [k]: !s[k] }));
  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-200" data-testid="world-map">
      <h1 className="text-lg font-bold">World map: {WORLD_RECIPE.name}</h1>
      <p className="mb-3 max-w-3xl text-xs text-slate-400">
        The recipe ([docs/world/world_recipe.md]) on one map. The game still loads the first town only: walking to the island needs the streaming runtime (roadmap task 11). Lime plots
        and streets are what the town extension added after the generator had finished (lib/city/townExtension.js): every town gets its own.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        {[['roads', 'Roads'], ['plots', 'Plots'], ['features', 'Coast features'], ['land', 'Land outline']].map(([k, label]) => (
          <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={show[k]} onChange={() => toggle(k)} /> {label}</label>
        ))}
        <span className="text-slate-500">View:</span>
        {['all', ...world.towns.map((t) => t.id)].map((id) => (
          <button key={id} onClick={() => setFocus(id)} className={`rounded px-2 py-1 ${focus === id ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{id === 'all' ? 'Both' : world.towns.find((t) => t.id === id).name}</button>
        ))}
      </div>
      <canvas ref={canvas} className="max-w-full rounded border border-slate-800" style={{ width: '100%', aspectRatio: `${W} / ${H}` }} />
      <table className="mt-4 w-full max-w-4xl text-left text-xs" data-testid="world-table">
        <thead className="text-slate-400"><tr><th className="py-1">Town</th><th>Landmass</th><th>Plots</th><th>First id</th><th>Last id</th><th>Roads</th><th>Origin (x, z)</th><th>In the game</th></tr></thead>
        <tbody>
          {world.towns.map((t) => {
            const st = world.stats.towns.find((x) => x.id === t.id);
            return (
              <tr key={t.id} className="border-t border-slate-800">
                <td className="py-1 font-semibold">{t.name} <span className="text-slate-500">(index {t.index}, seed {t.seed})</span></td>
                <td>{world.landmasses.find((m) => m.towns.includes(t.id)).name}</td>
                <td>{st.plots}</td><td>{st.firstId.toLocaleString()}</td><td>{st.lastId.toLocaleString()}</td><td>{st.roads}</td>
                <td>{t.origin.x.toFixed(1)}, {t.origin.z.toFixed(1)}</td><td>{t.live ? 'yes' : 'not yet'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-slate-400">
        {world.stats.gaps.map((g) => `Open water between ${g.between.join(' and ')}: ${g.water} units (${g.centresApart} between their centres). A boat does 3.6 units a second.`).join(' ')} {world.stats.plots.toLocaleString()} plots in all.
      </p>
    </div>
  );
}
