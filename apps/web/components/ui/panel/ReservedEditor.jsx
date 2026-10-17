"use client";

import { sampleCurve } from '@/lib/city/curves';
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Dices, Hammer, Trash2 } from 'lucide-react';
import { DESIGN_DEFAULTS, DESIGN_LIMITS, designReservedSite } from '@/lib/city/cityGenerator';
import { devToolsOn } from '@/lib/dev/devTools';
import { usePanel } from '@/lib/state/panelStore';
import { useCityStore } from '@/lib/state/store';

// The site designer: a development tool for the reserved sites ("Reserved: your road & plot"). Pick a site (click it in
// the city, or Places > Reserved land), shape a U-shaped street and its lots, watch the plan, then Apply: the
// city is built again with the design in place, and the land round it adapts (new junctions on the front road, greenery
// that is in the way is cleared, lots that would clash are kept out). It is not in release builds.

const DENSITY = [
  { label: 'Every lot', value: 1 },
  { label: 'Most lots', value: 0.85 },
  { label: 'Half the lots', value: 0.55 },
];
const randomSeed = () => 1 + Math.floor(Math.random() * 99999);
const NUDGE = 0.2; // a press of a compass button moves the entrances a fifth of the way along the site
const REACH = 0.15; // ... or lengthens / shortens the streets by this much of their range

// Which way is which for a site beside `front`: north is up the map (lower z), east is to the right (higher x). The site
// lies on `side` of the road; "along" is the road's own direction; "away" is the way into the site from the road.
function compass(front, side) {
  if (!front) return null;
  const alongX = front.axis === 'x';
  const away = alongX ? (side < 0 ? 'N' : 'S') : side < 0 ? 'W' : 'E';
  const toward = { N: 'S', S: 'N', E: 'W', W: 'E' }[away];
  const alongPlus = alongX ? 'E' : 'S';
  const alongMinus = alongX ? 'W' : 'N';
  return { away, toward, alongPlus, alongMinus };
}
const NAME = { N: 'north', E: 'east', S: 'south', W: 'west' };

function Slider({ label, value, min, max, step = 1, onChange, hint }) {
  return (
    <label className="mb-2.5 block text-xs">
      <span className="flex justify-between text-slate-300">
        {label} <span className="font-mono text-slate-100">{hint ?? value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-amber-400" />
    </label>
  );
}

function Plan({ site, layout, plots, result }) {
  const pad = 9;
  const box = { x0: site.x0 - pad, x1: site.x1 + pad, z0: site.z0 - pad, z1: site.z1 + pad };
  const w = box.x1 - box.x0;
  const d = box.z1 - box.z0;
  const inBox = (r) => r.x1 > box.x0 && r.x0 < box.x1 && r.z1 > box.z0 && r.z0 < box.z1;
  const roadRect = (r) => (r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - 1.4, z1: r.center + 1.4 } : { x0: r.center - 1.4, x1: r.center + 1.4, z0: r.from, z1: r.to });
  const rect = (r, fill, { key, ...extra } = {}) => <rect key={key} x={r.x0} y={r.z0} width={r.x1 - r.x0} height={r.z1 - r.z0} fill={fill} {...extra} />;
  const roads = layout.roads.filter((r) => !r.design && inBox(roadRect(r)));
  const near = plots.filter((p) => !p.designSite && Math.abs(p.x - (site.x0 + site.x1) / 2) < w / 2 + 3 && Math.abs(p.z - (site.z0 + site.z1) / 2) < d / 2 + 3);
  return (
    <svg viewBox={`${box.x0} ${box.z0} ${w} ${d}`} className="mb-3 w-full rounded-lg border border-sx-stroke bg-[#14301c]" role="img" aria-label="Plan of the site">
      {[['N', box.x0 + w / 2, box.z0 + 2.2], ['S', box.x0 + w / 2, box.z1 - 0.9], ['W', box.x0 + 1.2, box.z0 + d / 2 + 0.8], ['E', box.x1 - 1.2, box.z0 + d / 2 + 0.8]].map(([t, x, y]) => (
        <text key={t} x={x} y={y} fontSize="2.6" fill="#94a3b8" textAnchor="middle" fontWeight="700">
          {t}
        </text>
      ))}
      {roads.map((r) => rect(roadRect(r), '#1e293b', { key: r.id }))}
      {near.map((p) => rect({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 }, p.owner ? '#475569' : '#334155', { key: `p${p.id}`, opacity: 0.9 }))}
      <rect x={site.x0} y={site.z0} width={site.x1 - site.x0} height={site.z1 - site.z0} fill="#f59e0b" fillOpacity="0.08" stroke="#f59e0b" strokeWidth="0.25" strokeDasharray="1 0.8" />
      {result?.ok && (
        <>
          {result.roads.map((r) => rect(roadRect(r), '#475569', { key: r.id }))}
          {(result.curvedRoads ?? []).map((spec) => (
            <polyline key={spec.id} points={sampleCurve(spec).points.map((pt) => `${pt.x.toFixed(2)},${pt.z.toFixed(2)}`).join(' ')} fill="none" stroke="#475569" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {result.roads.map((r) => (r.axis === 'x' ? <line key={`l${r.id}`} x1={r.from} x2={r.to} y1={r.center} y2={r.center} stroke="#e2e8f0" strokeWidth="0.12" strokeDasharray="0.6 0.6" /> : <line key={`l${r.id}`} y1={r.from} y2={r.to} x1={r.center} x2={r.center} stroke="#e2e8f0" strokeWidth="0.12" strokeDasharray="0.6 0.6" />))}
          {result.lots.map((l, i) => (
            <rect key={i} x={l.x - 1.4} y={l.z - 1.4} width="2.8" height="2.8" fill="#fbbf24" stroke="#78350f" strokeWidth="0.1" rx="0.2" transform={l.yaw ? `rotate(${(-l.yaw * 180) / Math.PI} ${l.x} ${l.z})` : undefined} />
          ))}
          {result.bushes.map((b, i) => (
            <circle key={`b${i}`} cx={b.x} cy={b.z} r={b.w / 2 + 0.1} fill="#4d7c0f" opacity="0.9" />
          ))}
          {result.trees.map((t, i) => (
            <circle key={`t${i}`} cx={t.x} cy={t.z} r={t.size / 2 + 0.25} fill="#16a34a" />
          ))}
        </>
      )}
    </svg>
  );
}

export default function ReservedEditor({ siteId: forcedId, hideTabs = false }) {
  const panelId = usePanel((s) => s.reservedId);
  const id = forcedId ?? panelId;
  const layout = useCityStore((s) => s.layout);
  const plots = useCityStore((s) => s.plots);
  const billboards = useCityStore((s) => s.billboards);
  const setReservedDesign = useCityStore((s) => s.setReservedDesign);
  const site = layout.reserved.find((a) => a.id === id) ?? layout.reserved[0];
  const [params, setParams] = useState(() => ({ ...DESIGN_DEFAULTS, ...(site?.design ?? {}), seed: site?.design?.seed ?? randomSeed() }));
  const siteId = site?.id;
  useEffect(() => {
    const current = useCityStore.getState().layout.reserved.find((a) => a.id === siteId);
    setParams({ ...DESIGN_DEFAULTS, ...(current?.design ?? {}), seed: current?.design?.seed ?? randomSeed() });
  }, [siteId]);

  const result = useMemo(
    () => (site ? designReservedSite({ roads: layout.roads, plots, billboards, parks: layout.parks, reserved: layout.reserved, landscape: layout.landscape, seed: layout.seed }, site, params) : null),
    [site, layout, plots, billboards, params]
  );
  if (!devToolsOn() || !site) return null;

  const set = (patch) => setParams((p) => ({ ...p, ...patch }));
  // The plan always shows the settings below; the city shows what was last applied. Say so when they differ.
  const key = (q) => (q ? JSON.stringify([q.style ?? 'street', q.radius ?? 7, q.width, q.rungs, q.density, q.entry, q.depth ?? 1, q.link !== false, q.landscaping, q.seed]) : '');
  const applied = site.designed ? site.design : null;
  const unapplied = result?.ok && key(result.params) !== key(applied);
  const front = layout.roads.find((r) => r.id === site.frontRoad);
  const dir = compass(front, site.frontSide);
  const nudge = (d) =>
    setParams((p) => {
      if (d === dir.alongPlus) return { ...p, entry: Math.min(1, Math.round((p.entry + NUDGE) * 10) / 10) };
      if (d === dir.alongMinus) return { ...p, entry: Math.max(-1, Math.round((p.entry - NUDGE) * 10) / 10) };
      if (d === dir.away) return { ...p, depth: Math.min(1, Math.round((p.depth + REACH) * 100) / 100) };
      return { ...p, depth: Math.max(0, Math.round((p.depth - REACH) * 100) / 100) };
    });
  const hint = (d) => (d === dir.alongPlus || d === dir.alongMinus ? `Slide the entrances ${NAME[d]} along ${front?.name ?? 'the road'}` : d === dir.away ? `Reach further ${NAME[d]}, into the site` : `Shorter: pull the far street back ${NAME[d]} towards ${front?.name ?? 'the road'}`);
  const claimed = plots.filter((p) => p.designSite === site.id && p.userClaimed).length;
  const curved = params.style === 'curve';
  const span = site.x1 - site.x0 > site.z1 - site.z0 ? site.x1 - site.x0 : site.z1 - site.z0;
  const maxWidth = curved ? Math.min(DESIGN_LIMITS.curveWidth[1], Math.floor(span - 9.4)) : Math.min(DESIGN_LIMITS.width[1], Math.floor(span - 9));
  const minWidth = curved ? Math.ceil(2 * (params.radius ?? 7)) : DESIGN_LIMITS.width[0];

  return (
    <div className="text-slate-100">
      <p className="mb-3 rounded-md border border-amber-600/40 bg-amber-950/40 px-2.5 py-1.5 text-[11px] text-amber-200">
        Development tool. It is not in release builds, and designs are saved only in this browser.
      </p>
      {!hideTabs && (
      <div className="mb-2 flex gap-1">
        {layout.reserved.map((a, i) => (
          <button key={a.id} onClick={() => usePanel.getState().editReserved(a.id)} className={`flex-1 rounded-md py-1 text-[11px] font-medium ${a.id === site.id ? 'bg-amber-500 text-slate-950' : 'bg-sx-alt text-slate-300 hover:bg-sx-stroke'}`}>
            Site {a.number ?? i + 1}
            {a.designed ? ' ✓' : ''}
          </button>
        ))}
      </div>
      )}
      <p className="mb-2 text-[11px] text-slate-400">
        <span className="mr-1 rounded bg-sx-stroke px-1 font-mono text-[10px] text-slate-300">{site.code}</span>
        {(site.x1 - site.x0).toFixed(0)} × {(site.z1 - site.z0).toFixed(0)}, beside {result?.summary?.frontRoad ?? layout.roads.find((r) => r.id === site.frontRoad)?.name}
        {site.designed ? ` · now designed (${site.designName})` : ' · not designed yet'}
      </p>

      <Plan site={site} layout={layout} plots={plots} result={result} />
      {unapplied && (
        <p className="mb-3 flex items-center justify-between gap-2 rounded-md border border-sky-600/40 bg-sky-950/40 px-2.5 py-1.5 text-[11px] text-sky-200">
          <span>{applied ? 'This plan is not in the city yet: the city still shows the design you applied before.' : 'This plan is a preview: the city has no design here yet.'}</span>
          {applied && (
            <button onClick={() => setParams({ ...DESIGN_DEFAULTS, ...applied })} className="shrink-0 rounded border border-sky-500/60 px-2 py-0.5 hover:bg-sky-900/60">
              Revert
            </button>
          )}
        </p>
      )}

      <div className="mb-3 flex items-center gap-3">
        <div className="grid shrink-0 grid-cols-3 gap-1" role="group" aria-label="Move the design">
          {[
            [null, null],
            ['N', ArrowUp],
            [null, null],
            ['W', ArrowLeft],
            [null, null],
            ['E', ArrowRight],
            [null, null],
            ['S', ArrowDown],
            [null, null],
          ].map(([d, Icon], i) =>
            d ? (
              <button key={d} onClick={() => nudge(d)} title={hint(d)} aria-label={hint(d)} className="flex h-8 w-8 items-center justify-center rounded-md border border-sx-line bg-sx-alt text-slate-200 hover:bg-amber-500 hover:text-slate-950" data-nudge={d}>
                <Icon className="h-4 w-4" />
              </button>
            ) : (
              <span key={`s${i}`} className="h-8 w-8" />
            )
          )}
        </div>
        <p className="text-[11px] leading-snug text-slate-400">
          The entrances open to the <b className="text-slate-200">{NAME[dir.toward]}</b> onto {front?.name ?? 'the front road'}; the streets run <b className="text-slate-200">{NAME[dir.away]}</b> into the site. The arrows slide the design along the road or lengthen it into the site.
        </p>
      </div>
      <div className="mb-2.5" role="group" aria-label="Street shape">
        <span className="mb-1 block text-xs text-slate-300">Shape of the street</span>
        <div className="flex gap-1">
          {[['street', 'Straight streets (U shape)'], ['curve', 'Curved crescent']].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={(params.style ?? 'street') === id} onClick={() => set(id === 'curve' ? { style: 'curve', width: Math.max(params.width, 16) } : { style: 'street', width: Math.min(params.width, 22) })} className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium ${(params.style ?? 'street') === id ? 'bg-amber-500 text-slate-950' : 'bg-sx-alt text-slate-300 hover:bg-sx-stroke'}`} data-testid={`style-${id}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <Slider label="Distance between the two entrances" value={params.width} min={minWidth} max={maxWidth} step={1} onChange={(width) => set({ width })} hint={`${result?.ok ? result.params.width : params.width}`} />
      {curved ? (
        <Slider label="How tight the bend is (radius)" value={params.radius ?? 7} min={DESIGN_LIMITS.radius[0]} max={DESIGN_LIMITS.radius[1]} step={0.5} onChange={(radius) => set({ radius, width: Math.max(params.width, Math.ceil(2 * radius)) })} hint={`${params.radius ?? 7} units: tighter bends fit fewer lots on the inside`} />
      ) : (
        <Slider label="Cross streets inside" value={params.rungs} min={DESIGN_LIMITS.rungs[0]} max={DESIGN_LIMITS.rungs[1]} onChange={(rungs) => set({ rungs })} />
      )}
      <Slider label={`Slide along the road (${NAME[dir.alongMinus]} to ${NAME[dir.alongPlus]})`} value={params.entry} min={-1} max={1} step={0.1} onChange={(entry) => set({ entry })} hint={params.entry.toFixed(1)} />
      <Slider label={`How far it reaches ${NAME[dir.away]} into the site`} value={params.depth} min={0} max={1} step={0.05} onChange={(depth) => set({ depth })} hint={`${Math.round(params.depth * 100)}%`} />
      <label className="mb-2.5 block text-xs text-slate-300">
        Lots
        <select value={params.density} onChange={(e) => set({ density: Number(e.target.value) })} className="mt-1 w-full rounded border border-sx-stroke bg-sx-alt px-2 py-1 text-xs text-white">
          {DENSITY.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-1.5 flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={params.link !== false} onChange={(e) => set({ link: e.target.checked })} className="accent-amber-400" /> Link up with neighbouring streets (where there are some)
      </label>
      <label className="mb-3 flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={params.landscaping} onChange={(e) => set({ landscaping: e.target.checked })} className="accent-amber-400" /> Landscaping (shrubs and trees in the gaps)
      </label>

      <div className="mb-3 flex gap-2">
        <button onClick={() => set({ width: 8 + Math.floor(Math.random() * 13), rungs: Math.floor(Math.random() * 3), density: DENSITY[Math.floor(Math.random() * 3)].value, entry: Math.round((Math.random() * 1.2 - 0.6) * 10) / 10, depth: 0.5 + Math.round(Math.random() * 10) / 20, seed: randomSeed() })} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-sx-line bg-sx-alt py-1.5 text-xs font-medium hover:bg-sx-stroke">
          <Dices className="h-3.5 w-3.5" /> Generate a design
        </button>
        <button onClick={() => set({ seed: randomSeed() })} className="rounded-lg border border-sx-line bg-sx-alt px-2.5 text-xs hover:bg-sx-stroke" title="Same shape, different lots and greenery">
          Reshuffle
        </button>
      </div>

      {result && !result.ok && <p className="mb-3 rounded-md border border-red-700/50 bg-red-950/40 px-2.5 py-1.5 text-[11px] text-red-200">{result.error}</p>}
      {result?.ok && (
        <ul className="mb-3 space-y-0.5 rounded-lg border border-sx-alt bg-sx-panel/60 p-2.5 text-[11px] text-slate-300">
          <li>
            <b className="text-slate-100">{result.name}</b>: {result.summary.streets} streets, {result.summary.junctions} junctions ({result.summary.junctions ? 2 : 0} new T junctions on {result.summary.frontRoad})
          </li>
          <li>
            <b className="text-slate-100">{result.summary.lots}</b> new lots for players, all empty and for sale
          </li>
          {result.summary.curved && <li>A curved street {result.summary.length} units long, with a curb cut at each end; cars drive it, and the lots follow the bend</li>}
      {result.summary.links.length > 0 && <li>Links up with {[...new Set(result.summary.links)].join(', ')}: the streets carry on to them instead of stopping</li>}
          <li>{result.summary.greenery} shrubs and trees planted; {result.summary.displaced} existing trees and shrubs cleared from the site</li>
          <li className="text-slate-500">Everything else in the city, and every plot built or claimed so far, stays exactly as it is.</li>
        </ul>
      )}
      {claimed > 0 && <p className="mb-2 text-[11px] text-amber-300">{claimed} lot(s) in this site's current design are claimed. Applying a new design replaces them.</p>}

      <div className="flex gap-2">
        <button disabled={!result?.ok || (site.designed && !unapplied)} onClick={() => setReservedDesign(site.id, params)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40">
          <Hammer className="h-3.5 w-3.5" /> {site.designed ? (unapplied ? 'Apply the new design' : 'Applied') : 'Apply to the city'}
        </button>
        {site.designed && (
          <button onClick={() => setReservedDesign(site.id, null)} className="flex items-center gap-1.5 rounded-lg border border-red-700/60 px-3 text-xs text-red-300 hover:bg-red-950/50">
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
