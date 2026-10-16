"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { devToolsOn } from '@/lib/dev/devTools';
import { generateCity } from '@/lib/city/cityGenerator';
import { analyzeCity, mismatches } from '@/lib/dev/locationAttrs';
import { LAND_PRICING, summarize, tierTargets } from '@/lib/game/landPrice';

// DESIGN TOOL (not in release builds): the land prices of a whole generated city at full occupancy, as a heatmap, with the rules' numbers on sliders so a price list
// can be calibrated before the real, hand-authored world exists. The rules are in lib/game/landPrice.js; this page only shows them.
const STOPS = [[5, '#1e3a8a'], [20, '#0ea5e9'], [50, '#22c55e'], [100, '#facc15'], [250, '#f97316'], [800, '#dc2626']];
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function heat(t) {
  // t in 0..1 along the colour stops
  const x = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const a = hexRgb(STOPS[i][1]);
  const b = hexRgb(STOPS[i + 1][1]);
  const f = x - i;
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`;
}
const logT = (v, lo, hi) => (Math.log(Math.max(v, lo)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));

const MODES = [
  { id: 'price', label: 'Land price', hint: 'What a plot costs: basic plots $5, the rest by worth' },
  { id: 'worth', label: 'Worth index (every plot)', hint: 'How much each plot is worth against a basic plot with no advantages, ordinary plots too' },
  { id: 'grade', label: 'Location grade (A / B / C)', hint: 'How good the site is, whatever is built on it: A is the best tenth of the city, B the next quarter' },
  { id: 'tier', label: 'Tier', hint: 'Ordinary, prime, luxury, grand' },
];
const TIER_COLOUR = { ordinary: '#334155', prime: '#f59e0b', luxury: '#a855f7', grand: '#ef4444' };
const GRADE_COLOUR = { A: '#ef4444', B: '#f59e0b', C: '#1e3a8a' };
const money = (n) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function Slider({ label, value, min, max, step, onChange }) {
  return (
    <label className="block text-[11px] text-slate-300">
      <span className="flex justify-between">{label}<span className="font-mono text-white">{value}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-amber-400" />
    </label>
  );
}

export default function PricingHeatmap() {
  const [seed, setSeed] = useState(20260101);
  const [mode, setMode] = useState('price');
  const [cfg, setCfg] = useState(LAND_PRICING);
  const canvas = useRef(null);
  const city = useMemo(() => (devToolsOn() ? generateCity(seed) : null), [seed]);
  const rows = useMemo(() => (city ? analyzeCity(city.plots, city.layout, cfg) : []), [city, cfg]);
  const sum = useMemo(() => summarize(rows), [rows]);
  const mm = useMemo(() => mismatches(rows), [rows]);
  const maxPrice = Math.max(...rows.map((r) => r.price), 10);
  const maxWorth = Math.max(...rows.map((r) => r.worth), 2);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !city) return;
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
    const Z = (z) => oz + (land.z0 === undefined ? 0 : (z - land.z0) * s);
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#14301c';
    ctx.fillRect(X(land.x0), Z(land.z0), (land.x1 - land.x0) * s, (land.z1 - land.z0) * s);
    if (layout.urban) {
      ctx.fillStyle = '#1b2638';
      ctx.fillRect(X(layout.urban.x0), Z(layout.urban.z0), (layout.urban.x1 - layout.urban.x0) * s, (layout.urban.z1 - layout.urban.z0) * s);
    }
    ctx.fillStyle = '#1d4ed8';
    for (const r of layout.rivers ?? []) ctx.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
    for (const l of layout.lakes ?? []) ctx.fillRect(X(l.x - l.rx), Z(l.z - l.rz), 2 * l.rx * s, 2 * l.rz * s);
    ctx.fillStyle = '#166534';
    for (const p of layout.parks ?? []) ctx.fillRect(X(p.center.x - p.width / 2), Z(p.center.z - p.depth / 2), p.width * s, p.depth * s);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = Math.max(1, 2.4 * s);
    ctx.lineCap = 'butt';
    for (const r of layout.roads) {
      ctx.beginPath();
      if (r.axis === 'x') (ctx.moveTo(X(r.from), Z(r.center)), ctx.lineTo(X(r.to), Z(r.center)));
      else (ctx.moveTo(X(r.center), Z(r.from)), ctx.lineTo(X(r.center), Z(r.to)));
      ctx.stroke();
    }
    ctx.strokeStyle = '#be123c';
    for (const d of layout.diagonals ?? []) (ctx.beginPath(), ctx.moveTo(X(d.p0.x), Z(d.p0.z)), ctx.lineTo(X(d.p1.x), Z(d.p1.z)), ctx.stroke());
    // the plots
    const colour = (r) => (mode === 'tier' ? TIER_COLOUR[r.tier] : mode === 'grade' ? GRADE_COLOUR[r.grade] : mode === 'worth' ? heat(((r.worth - 1) / (maxWorth - 1)) ** 0.5) : heat(logT(r.price, 5, Math.max(maxPrice, 40))));
    const sorted = [...rows].sort((a, b) => a.price - b.price);
    for (const r of sorted) {
      ctx.save();
      ctx.translate(X(r.x), Z(r.z));
      ctx.rotate(-(r.yaw ?? 0));
      const w = (r.w ?? 3) * 0.86 * s;
      const d = (r.d ?? 3) * 0.86 * s;
      ctx.fillStyle = colour(r);
      ctx.fillRect(-w / 2, -d / 2, w, d);
      if (r.tier !== 'ordinary') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(-w / 2, -d / 2, w, d);
      }
      ctx.restore();
    }
    // labels on the special lots: each goes where it overlaps no other label (above, below, left or right of its lot)
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const placedBoxes = [];
    const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    for (const r of rows.filter((q) => q.tier !== 'ordinary').sort((a, b) => b.price - a.price)) {
      const text = mode === 'worth' ? `${r.worth.toFixed(0)}x` : mode === 'tier' ? r.tier[0].toUpperCase() : mode === 'grade' ? `${r.grade} · ${r.tier[0].toUpperCase()}` : money(r.price);
      const tw = ctx.measureText(text).width;
      const half = Math.max(10, ((r.d ?? 3) * s) / 2 + 4);
      const wide = Math.max(10, ((r.w ?? 3) * s) / 2 + 4) + tw / 2;
      const cx = X(r.x);
      const cz = Z(r.z);
      const spots = [[0, -half], [0, half + 12], [-wide, 5], [wide, 5], [0, -half - 17], [0, half + 29], [-wide, -12], [wide, -12]];
      let pick = spots[0];
      for (const sp of spots) {
        const box = { x0: cx + sp[0] - tw / 2 - 2, x1: cx + sp[0] + tw / 2 + 2, y0: cz + sp[1] - 14, y1: cz + sp[1] + 3 };
        if (!placedBoxes.some((b) => overlaps(b, box))) {
          pick = sp;
          break;
        }
      }
      placedBoxes.push({ x0: cx + pick[0] - tw / 2 - 2, x1: cx + pick[0] + tw / 2 + 2, y0: cz + pick[1] - 14, y1: cz + pick[1] + 3 });
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0b1020';
      ctx.strokeText(text, cx + pick[0], cz + pick[1]);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, cx + pick[0], cz + pick[1]);
    }
    // legend
    const lx = 40;
    const ly = H - 70;
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = mode === 'tier' || mode === 'grade' ? 'transparent' : heat(i / 399);
      ctx.fillRect(lx + i, ly, 1, 16);
    }
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'left';
    if (mode === 'price') {
      const hi = Math.max(maxPrice, 40);
      for (const v of [5, 20, 50, 100, 250, 500, 800].filter((q) => q <= hi * 1.01)) {
        const x = lx + logT(v, 5, hi) * 399;
        ctx.fillRect(x, ly + 16, 1, 5);
        ctx.fillText(money(v), x - 10, ly + 36);
      }
    } else if (mode === 'worth') {
      for (const v of [1, 2, 10, 50, 100, 150].filter((q) => q <= maxWorth * 1.01)) {
        const x = lx + (((v - 1) / (maxWorth - 1)) ** 0.5) * 399;
        ctx.fillRect(x, ly + 16, 1, 5);
        ctx.fillText(`${v}x`, x - 8, ly + 36);
      }
    } else if (mode === 'grade') {
      let x = lx;
      for (const [t, c] of Object.entries(GRADE_COLOUR)) (ctx.fillStyle = c, ctx.fillRect(x, ly, 14, 14), ctx.fillStyle = '#e2e8f0', ctx.fillText(`grade ${t}`, x + 20, ly + 12), (x += 110));
      ctx.fillText('lots are labelled grade · tier (O/P/L/G)', x + 10, ly + 12);
    } else {
      let x = lx;
      for (const [t, c] of Object.entries(TIER_COLOUR)) (ctx.fillStyle = c, ctx.fillRect(x, ly, 14, 14), ctx.fillStyle = '#e2e8f0', ctx.fillText(t, x + 20, ly + 12), (x += 110));
    }
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`Generated test city ${seed} · all ${rows.length} plots taken · north is up`, 40, 30);
  }, [city, rows, mode, seed, maxPrice, maxWorth]);

  if (!devToolsOn()) return <p className="p-8 text-sm text-slate-300">The pricing designer is a development tool and is not in release builds.</p>;

  const special = rows.filter((r) => r.tier !== 'ordinary').sort((a, b) => b.price - a.price);
  const csv = () => {
    const head = ['id', 'tier', 'cells', 'frontage', 'corner', 'centrality', 'park', 'anchor', 'waterfront', 'district', 'location_grade', 'worth_index', 'land_price'];
    const lines = [head.join(','), ...rows.map((r) => [r.id, r.tier, r.cells, r.frontage, r.corner, r.centrality.toFixed(2), r.park, r.anchor, r.waterfront, `"${r.district}"`, r.grade, r.worth.toFixed(2), r.price].join(','))];
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: `land-prices-city-${seed}.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const setW = (k, v) => setCfg((c) => ({ ...c, weights: { ...c.weights, [k]: v } }));
  const setP = (k, v) => setCfg((c) => ({ ...c, premium: { ...c.premium, [k]: v } }));

  return (
    <div className="min-h-screen bg-[#090d16] p-4 text-slate-100" data-testid="pricing-page">
      <h1 className="text-lg font-bold">Land prices: a whole city at full occupancy</h1>
      <p className="mb-3 max-w-3xl text-xs text-slate-400">A design tool. The generated city is only a stand-in: the rules (lib/game/landPrice.js) take a few attributes of a plot (its tier, size, frontage, park, neighbours and water), so they carry over to the hand-authored world, whose plots carry the same attributes.</p>
      <div className="flex flex-wrap gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2" role="group" aria-label="Map view">
            {MODES.map((m) => (
              <button key={m.id} type="button" onClick={() => setMode(m.id)} aria-pressed={mode === m.id} title={m.hint} className={`rounded-full px-3 py-1 text-xs ${mode === m.id ? 'bg-amber-500 font-bold text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`} data-testid={`mode-${m.id}`}>{m.label}</button>
            ))}
            <label className="ml-2 text-xs text-slate-400">City <input type="number" value={seed} onChange={(e) => setSeed(Math.max(1, Number(e.target.value) || 1))} className="w-28 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-white" /></label>
            <button type="button" onClick={csv} className="rounded-full border border-slate-600 px-3 py-1 text-xs hover:bg-slate-800">Download all plots as CSV</button>
          </div>
          <canvas ref={canvas} className="w-full max-w-[1500px] rounded-lg border border-slate-700" data-testid="pricing-canvas" />
        </div>
        <aside className="w-full space-y-4 lg:w-80">
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
            <h2 className="mb-2 text-sm font-bold">The rules</h2>
            <div className="space-y-2">
              <Slider label="Basic plot ($)" value={cfg.base} min={1} max={20} step={1} onChange={(v) => setCfg((c) => ({ ...c, base: v }))} />
              <Slider label="Prime: worth per cell" value={cfg.premium.prime} min={1} max={10} step={0.5} onChange={(v) => setP('prime', v)} />
              <Slider label="Luxury: worth per cell" value={cfg.premium.luxury} min={2} max={20} step={0.5} onChange={(v) => setP('luxury', v)} />
              <Slider label="Grand: worth per cell" value={cfg.premium.grand} min={4} max={30} step={0.5} onChange={(v) => setP('grand', v)} />
              <Slider label="Per point of frontage" value={cfg.weights.frontage} min={0} max={0.5} step={0.01} onChange={(v) => setW('frontage', v)} />
              <Slider label="On a corner" value={cfg.weights.corner} min={0} max={0.5} step={0.01} onChange={(v) => setW('corner', v)} />
              <Slider label="In the centre" value={cfg.weights.centrality} min={0} max={0.8} step={0.05} onChange={(v) => setW('centrality', v)} />
              <Slider label="Beside a park" value={cfg.weights.park} min={0} max={1} step={0.05} onChange={(v) => setW('park', v)} />
              <Slider label="Next to a big lot" value={cfg.weights.anchor} min={0} max={1} step={0.05} onChange={(v) => setW('anchor', v)} />
              <Slider label="Assembled lot (per extra cell)" value={cfg.plottage.perCell} min={0} max={0.1} step={0.005} onChange={(v) => setCfg((c) => ({ ...c, plottage: { ...c.plottage, perCell: v } }))} />
              <Slider label="On the water" value={cfg.weights.waterfront} min={0} max={1} step={0.05} onChange={(v) => setW('waterfront', v)} />
              <button type="button" onClick={() => setCfg(LAND_PRICING)} className="text-[11px] text-slate-400 underline hover:text-white">Back to the standard rules</button>
            </div>
          </section>
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-3" data-testid="pricing-summary">
            <h2 className="mb-2 text-sm font-bold">Every plot taken</h2>
            <table className="w-full text-[11px]">
              <thead><tr className="text-left text-slate-400"><th>Tier</th><th className="text-right">Plots</th><th className="text-right">Share (target)</th><th className="text-right">Lowest</th><th className="text-right">Middle</th><th className="text-right">Highest</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {Object.entries(sum.tiers).map(([t, v]) => (
                  <tr key={t} className="border-t border-slate-800"><td className="capitalize">{t}</td><td className="text-right">{v.count}</td><td className="text-right">{(100 * v.count / sum.count).toFixed(1)}%{tierTargets(sum.count)[t] !== undefined && t !== 'ordinary' ? ` (${tierTargets(sum.count)[t]})` : ''}</td><td className="text-right">{money(v.min)}</td><td className="text-right">{money(v.median)}</td><td className="text-right">{money(v.max)}</td><td className="text-right">{money(v.sum)}</td></tr>
                ))}
                <tr className="border-t border-slate-600 font-bold"><td>All</td><td className="text-right">{sum.count}</td><td /><td /><td /><td /><td className="text-right" data-testid="pricing-total">{money(sum.total)}</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-[10px] text-slate-500">Land only. Anything the owner customises (floors, shape, colours, roof) is added to this, at the prices you set for each.</p>
          </section>
        </aside>
      </div>
      <section className="mt-4 max-w-5xl rounded-xl border border-slate-700 bg-slate-900/70 p-3">
        <h2 className="mb-2 text-sm font-bold">The prime, luxury and grand lots ({special.length})</h2>
        <table className="w-full text-[11px]">
          <thead><tr className="text-left text-slate-400"><th className="pr-3">Lot</th><th className="pr-3">Tier</th><th className="pr-3">District</th><th className="pr-3 text-right">Plots of land</th><th className="pr-3 text-right">Frontage</th><th className="pr-3">Corner</th><th className="pr-3 text-right">Centre</th><th className="pr-3">Park</th><th className="pr-3">Big neighbour</th><th className="pr-3">Water</th><th className="pr-3">Grade</th><th className="pr-3 text-right">Worth</th><th className="text-right">Price</th></tr></thead>
          <tbody>
            {special.map((r) => (
              <tr key={r.id} className="border-t border-slate-800"><td className="pr-3">#{r.id}</td><td className="pr-3 capitalize">{r.tier}</td><td className="pr-3">{r.district}</td><td className="pr-3 text-right">{r.cells}</td><td className="pr-3 text-right">{r.frontage}</td><td className="pr-3">{r.corner ? 'yes' : ''}</td><td className="pr-3 text-right">{Math.round(r.centrality * 100)}%</td><td className="pr-3">{r.park ? 'yes' : ''}</td><td className="pr-3">{r.anchor ? 'yes' : ''}</td><td className="pr-3">{r.waterfront ? 'yes' : ''}</td><td className="pr-3 font-bold">{r.grade}</td><td className="pr-3 text-right">{r.worth.toFixed(1)}x</td><td className="text-right font-bold">{money(r.price)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="mt-4 max-w-5xl rounded-xl border border-slate-700 bg-slate-900/70 p-3" data-testid="grade-crosstab">
        <h2 className="mb-1 text-sm font-bold">Real-estate check: the lot's label against how good its location is</h2>
        <p className="mb-2 text-[11px] text-slate-400">Sites are graded by location alone (frontage, corner, centre, park, water, neighbours): grade A is the best tenth of the city, B the next quarter, C the rest. Where the label and the grade disagree is worth a look before the real world is laid out.</p>
        <table className="mb-3 text-[11px]">
          <thead><tr className="text-left text-slate-400"><th className="pr-6">Label</th><th className="pr-6 text-right">Grade A</th><th className="pr-6 text-right">Grade B</th><th className="pr-6 text-right">Grade C</th></tr></thead>
          <tbody>
            {mm.crossTab.map((t) => (
              <tr key={t.tier} className="border-t border-slate-800"><td className="pr-6 capitalize">{t.tier}</td><td className="pr-6 text-right">{t.A}</td><td className="pr-6 text-right">{t.B}</td><td className="pr-6 text-right">{t.C}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-slate-300"><b>{mm.upgrade.length}</b> basic plots stand on grade A sites: candidates to be prime lots (or to carry a location premium).</p>
        <p className="text-[11px] text-slate-300"><b>{mm.weak.length}</b> prime, luxury or grand lots stand on grade C sites{mm.weak.length ? `: ${mm.weak.map((r) => `#${r.id} (${r.tier})`).join(', ')}` : ''}. Their size and tier carry the price; a better site would justify it.</p>
      </section>
    </div>
  );
}
