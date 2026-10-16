"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { devToolsOn } from '@/lib/dev/devTools';
import { generateCity } from '@/lib/city/cityGenerator';
import { EDIT_PLOT_BASE, HALF_CORRIDOR, ROAD_CLASSES, ROAD_KINDS, applyEdits, corridorOf, fillFrontage, fromDocument, makeLot, makePark, makeRoad, plotBox, refitLots, summarizeEdits, toDocument, validate } from '@/lib/city/cityEdit';
import { STREET_NAME_ATTRIBUTION, STREET_NAME_SETS } from '@/lib/content/streetNames';
import { clearEdits, loadEdits, saveEdits } from '@/lib/city/editedWorld';

// DESIGN TOOL (not in release builds): the city editor. A top-down map of the generated city where roads, lots and parks can be added, moved, resized, changed and removed,
// the way the generator makes them: a road's junctions and pavement gaps follow, lots are laid along a road's frontage like the generator does (or placed one at a time),
// and what is wrong (a road that ends in nothing, lots on roads) is listed and marked. The edits are saved in the browser and "Open in the game" shows the edited city.
// The engine is lib/city/cityEdit.js (pure, tested); this page only draws and collects clicks.
const TOOLS = [
  ['select', 'Select (S)', 'Click a road, lot or park to change it. Drag a road to move it, drag its ends to resize it, drag a lot to move it.'],
  ['road', 'Road (R)', 'Drag to draw a road. It runs along x or z, joins the roads it meets (ends snap to a road\'s middle line) and clears the lots under it.'],
  ['plot', 'Lot (L)', 'Click to place a lot. Near a road it snaps beside the pavement facing the road; hold Shift to place it freely.'],
  ['fill', 'Fill (F)', 'Click a road to lay lots along its frontage, the way the generator does.'],
  ['park', 'Park (P)', 'Drag a rectangle for a park with trees, paths and a fountain.'],
  ['erase', 'Erase (E)', 'Click a road, lot or park to remove it.'],
];
const KEYS = { s: 'select', r: 'road', l: 'plot', f: 'fill', p: 'park', e: 'erase' };
const TIER_COLOUR = { ordinary: '#475569', prime: '#f59e0b', luxury: '#a855f7', grand: '#ef4444' };
const snap = (n, step = 0.5) => Math.round(n / step) * step;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const tierOf = (p) => (p.grand ? 'grand' : p.luxury ? 'luxury' : p.prime ? 'prime' : 'ordinary');

function Field({ label, children }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
      <span className="shrink-0">{label}</span>
      {children}
    </label>
  );
}
const ALL_STREET_NAMES = [...new Set(Object.values(STREET_NAME_SETS).flatMap((s) => s.names))].sort();
const INPUT = 'w-28 rounded bg-slate-800 px-2 py-0.5 text-right text-white';
function Num({ value, onCommit, step = 0.5, width = 'w-24' }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    if (Number.isFinite(n) && n !== value) onCommit(n);
    else setText(String(value));
  };
  return <input type="number" step={step} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className={`${INPUT} ${width}`} />;
}

export default function CityEditor() {
  const on = devToolsOn();
  const [seed, setSeed] = useState(20260101);
  const [seedText, setSeedText] = useState('20260101');
  const base = useMemo(() => (on ? generateCity(seed) : null), [on, seed]);
  const [ops, setOps] = useState([]);
  const [redo, setRedo] = useState([]);
  const [tool, setTool] = useState('select');
  const [sel, setSel] = useState(null); // { type: 'road' | 'plot' | 'park', id }
  const [view, setView] = useState({ cx: 0, cz: 0, scale: 3 });
  const [ghost, setGhost] = useState(null); // what the tool is about to make or what is being dragged: { kind, ... }
  const [status, setStatus] = useState('');
  const [opts, setOpts] = useState({ kind: 'street', class: 'local', name: 'New street', fill: true, side: 0, pitch: 3.4, setback: 0, lotStatus: 'mixed', tier: 'ordinary', w: 3, d: 3, parkName: 'New Park', showIssues: true, showLots: true });
  const canvas = useRef(null);
  const wrap = useRef(null);
  const drag = useRef(null);
  const city = useMemo(() => (base ? applyEdits(base, ops) : null), [base, ops]);
  const check = useMemo(() => (city ? validate(city) : { issues: [], errors: [], warnings: [] }), [city]);
  const summary = useMemo(() => summarizeEdits(ops), [ops]);

  // start from what was saved for this seed (once)
  const loaded = useRef(false);
  useEffect(() => {
    if (!on || loaded.current) return;
    loaded.current = true;
    const saved = loadEdits();
    if (saved) {
      setSeed(saved.seed);
      setSeedText(String(saved.seed));
      setOps(saved.ops);
      setStatus(`Loaded ${saved.ops.length} saved edits.`);
    }
  }, [on]);

  const commit = useCallback((newOps, note) => {
    setOps((o) => [...o, ...newOps]);
    setRedo([]);
    if (note) setStatus(note);
  }, []);
  const undo = useCallback(() => {
    setOps((o) => {
      if (!o.length) return o;
      // an edit that came as a group (a road and its lots) shares a `group` and is undone together
      const last = o[o.length - 1];
      let n = 1;
      while (last.group != null && o.length - n - 1 >= 0 && o[o.length - n - 1].group === last.group) n++;
      setRedo((r) => [...r, o.slice(o.length - n)]);
      return o.slice(0, o.length - n);
    });
  }, []);
  const redoIt = useCallback(() => {
    setRedo((r) => {
      if (!r.length) return r;
      const top = r[r.length - 1];
      setOps((o) => [...o, ...top]);
      return r.slice(0, -1);
    });
  }, []);
  const refit = () => {
    const r = refitLots(city);
    if (!r.moved.length && !r.stuck.length) return setStatus('Every lot is in place.');
    const g = { group: Date.now() + Math.random() };
    commit(r.ops.map((o) => ({ ...o, ...g })), `Moved ${r.moved.length} lots${r.stuck.length ? `; ${r.stuck.length} found no room (lots ${r.stuck.slice(0, 6).map((n) => `#${n}`).join(', ')}${r.stuck.length > 6 ? '...' : ''}): move or remove them` : ''}.`);
  };
  const group = () => ({ group: Date.now() + Math.random() });

  // ---- the view
  const toScreen = useCallback((x, z, w, h) => [(x - view.cx) * view.scale + w / 2, (z - view.cz) * view.scale + h / 2], [view]);
  const toWorld = useCallback((sx, sz) => {
    const el = wrap.current;
    const w = el?.clientWidth ?? 1000;
    const h = el?.clientHeight ?? 700;
    return [(sx - w / 2) / view.scale + view.cx, (sz - h / 2) / view.scale + view.cz];
  }, [view]);
  useEffect(() => {
    if (!city) return;
    const l = city.layout;
    setView({ cx: (l.land.x0 + l.land.x1) / 2, cz: (l.land.z0 + l.land.z1) / 2, scale: 2.2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  // ---- what is under a point
  const hitTest = useCallback((x, z) => {
    if (!city) return null;
    const margin = 6 / view.scale;
    for (const p of city.plots) {
      const b = plotBox(p);
      if (x >= b.x0 - 0.3 && x <= b.x1 + 0.3 && z >= b.z0 - 0.3 && z <= b.z1 + 0.3) return { type: 'plot', id: p.id };
    }
    let best = null;
    for (const r of city.layout.roads) {
      const across = Math.abs((r.axis === 'x' ? z : x) - r.center);
      const along = r.axis === 'x' ? x : z;
      if (across <= Math.max(HALF_CORRIDOR, margin) && along >= r.from - margin && along <= r.to + margin && (!best || across < best.across)) best = { type: 'road', id: r.id, across };
    }
    if (best) return { type: 'road', id: best.id };
    for (const k of city.layout.parks) if (Math.abs(x - k.center.x) <= k.width / 2 && Math.abs(z - k.center.z) <= k.depth / 2) return { type: 'park', id: k.id };
    return null;
  }, [city, view.scale]);

  // snap a point to the roads: to the middle line of a road it is near, so roads meet exactly
  const snapPoint = useCallback((x, z, free) => {
    let sx = snap(x);
    let sz = snap(z);
    if (free || !city) return [sx, sz];
    const near = 1.6;
    for (const r of city.layout.roads) {
      if (r.axis === 'x' && Math.abs(z - r.center) < near && x >= r.from - near && x <= r.to + near) sz = r.center;
      if (r.axis === 'z' && Math.abs(x - r.center) < near && z >= r.from - near && z <= r.to + near) sx = r.center;
    }
    return [sx, sz];
  }, [city]);

  // a lot placed near a road snaps beside its pavement, facing it
  const lotAt = useCallback((x, z, free) => {
    if (!city) return null;
    const spec = { x: snap(x), z: snap(z), facing: 1, yaw: 0 };
    if (!free) {
      let best = null;
      for (const r of city.layout.roads) {
        const across = (r.axis === 'x' ? z : x) - r.center;
        const along = r.axis === 'x' ? x : z;
        if (along < r.from + 1 || along > r.to - 1) continue;
        const d = Math.abs(across);
        if (d < 9 && (!best || d < best.d)) best = { r, d, side: across < 0 ? -1 : 1 };
      }
      if (best) {
        const { r, side } = best;
        const off = side * (HALF_CORRIDOR + opts.d / 2 + (r.setback ?? 0));
        if (r.axis === 'x') Object.assign(spec, { x: snap(x, 0.2), z: r.center + off, facing: side < 0 ? 1 : -1, yaw: 0 });
        else Object.assign(spec, { x: r.center + off, z: snap(z, 0.2), facing: 1, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2 });
      }
    }
    return { ...spec, w: opts.w, d: opts.d, tier: opts.tier, status: opts.lotStatus === 'mixed' ? 'mixed' : opts.lotStatus };
  }, [city, opts]);

  // ---- drawing
  const draw = useCallback(() => {
    const cv = canvas.current;
    const el = wrap.current;
    if (!cv || !el || !city) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    const ctx = cv.getContext('2d');
    const L = city.layout;
    const S = view.scale;
    const P = (x, z) => toScreen(x, z, w, h);
    const rect = (r, fill, stroke) => {
      const [x0, z0] = P(r.x0, r.z0);
      const [x1, z1] = P(r.x1, r.z1);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.strokeRect(x0, z0, x1 - x0, z1 - z0);
      }
    };
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, w, h);
    rect(L.land, '#14301c');
    if (L.urban) rect(L.urban, '#1b2638');
    for (const g of L.lawns ?? []) rect(g, '#1f4a2a');
    ctx.fillStyle = '#1d4ed8';
    for (const r of L.rivers ?? []) rect({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 }, '#1d4ed8');
    for (const l of L.lakes ?? []) rect({ x0: l.x - l.rx, x1: l.x + l.rx, z0: l.z - l.rz, z1: l.z + l.rz }, '#1d4ed8');
    for (const k of L.parks) rect({ x0: k.center.x - k.width / 2, x1: k.center.x + k.width / 2, z0: k.center.z - k.depth / 2, z1: k.center.z + k.depth / 2 }, k.edited ? '#15803d' : '#166534', sel?.id === k.id ? '#22d3ee' : null);
    for (const a of L.airports ?? []) rect(a.rect, '#334155');
    for (const m of L.malls ?? []) rect(m.rect, '#4338ca');
    if (L.amusement) rect(L.amusement.rect, '#9f1239');
    for (const a of L.reserved ?? []) rect({ x0: a.x0, x1: a.x1, z0: a.z0, z1: a.z1 }, 'rgba(14,165,233,0.35)');
    // roads
    for (const r of L.roads) {
      const c = corridorOf(r);
      rect(c, r.edited ? '#84cc16' : r.class === 'arterial' ? '#94a3b8' : '#64748b');
      if (sel?.type === 'road' && sel.id === r.id) rect(c, null, '#22d3ee');
    }
    // lots
    if (opts.showLots) {
      for (const p of city.plots) {
        const b = plotBox(p);
        const [x0, z0] = P(b.x0, b.z0);
        const [x1, z1] = P(b.x1, b.z1);
        const tier = tierOf(p);
        ctx.fillStyle = p.owner ? (tier === 'ordinary' ? '#cbd5e1' : TIER_COLOUR[tier]) : tier === 'ordinary' ? '#334155' : TIER_COLOUR[tier];
        ctx.fillRect(x0, z0, Math.max(1, x1 - x0 - 0.5), Math.max(1, z1 - z0 - 0.5));
        if (p.edited) {
          ctx.strokeStyle = '#a3e635';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(x0, z0, x1 - x0, z1 - z0);
        }
        if (sel?.type === 'plot' && sel.id === p.id) {
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 2;
          ctx.strokeRect(x0 - 1, z0 - 1, x1 - x0 + 2, z1 - z0 + 2);
        }
      }
    }
    ctx.lineWidth = 1;
    // junctions
    ctx.fillStyle = '#e2e8f0';
    if (S > 3) for (const i of L.intersections) {
      const [x, z] = P(i.x, i.z);
      ctx.fillRect(x - 1.5, z - 1.5, 3, 3);
    }
    // the handles of a selected road
    const sr = sel?.type === 'road' ? L.roads.find((r) => r.id === sel.id) : null;
    if (sr) {
      for (const end of [sr.from, sr.to]) {
        const [x, z] = sr.axis === 'x' ? P(end, sr.center) : P(sr.center, end);
        ctx.fillStyle = '#22d3ee';
        ctx.fillRect(x - 4, z - 4, 8, 8);
      }
    }
    // problems
    if (opts.showIssues) {
      for (const i of check.issues) {
        const [x, z] = P(i.x, i.z);
        ctx.strokeStyle = i.level === 'error' ? '#ef4444' : '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, z, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // the tool's ghost
    if (ghost) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      if (ghost.kind === 'road') {
        rect(corridorOf(ghost.road), '#facc15');
        for (const end of [ghost.road.from, ghost.road.to]) {
          const [x, z] = ghost.road.axis === 'x' ? P(end, ghost.road.center) : P(ghost.road.center, end);
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(x - 3, z - 3, 6, 6);
        }
      } else if (ghost.kind === 'lot') {
        rect(plotBox({ x: ghost.x, z: ghost.z, yaw: ghost.yaw ?? 0, w: ghost.w, d: ghost.d }), '#facc15');
      } else if (ghost.kind === 'rect') rect(ghost.rect, '#22c55e');
      ctx.restore();
    }
  }, [city, view, sel, ghost, check, opts.showIssues, opts.showLots, toScreen]);
  useEffect(() => {
    const id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [draw]);
  useEffect(() => {
    const on = () => draw();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [draw]);

  // ---- the pointer
  const pointer = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const roadFrom = (a, b, id) => {
    // a straight road between two points: along the longer way, on the first point's other coordinate
    const dx = Math.abs(b[0] - a[0]);
    const dz = Math.abs(b[1] - a[1]);
    const axis = dx >= dz ? 'x' : 'z';
    const center = axis === 'x' ? a[1] : a[0];
    return { id, axis, center, from: axis === 'x' ? a[0] : a[1], to: axis === 'x' ? b[0] : b[1], kind: opts.kind, class: opts.class, name: opts.name };
  };
  // the road's ends snap to the middle line of a road they reach (so it joins)
  const onPointerDown = (e) => {
    const [sx, sz] = pointer(e);
    const [wx, wz] = toWorld(sx, sz);
    canvas.current.setPointerCapture?.(e.pointerId);
    if (e.button === 1 || e.button === 2 || e.altKey || drag.current?.space) {
      drag.current = { mode: 'pan', sx, sz, cx: view.cx, cz: view.cz };
      return;
    }
    if (e.button !== 0 || !city) return;
    if (tool === 'select') {
      // a handle of the selected road first
      const sr = sel?.type === 'road' ? city.layout.roads.find((r) => r.id === sel.id) : null;
      if (sr) {
        for (const [key, end] of [['from', sr.from], ['to', sr.to]]) {
          const [ex, ez] = sr.axis === 'x' ? toScreen(end, sr.center, wrap.current.clientWidth, wrap.current.clientHeight) : toScreen(sr.center, end, wrap.current.clientWidth, wrap.current.clientHeight);
          if (Math.hypot(ex - sx, ez - sz) < 9) {
            drag.current = { mode: 'end', key, road: sr };
            return;
          }
        }
      }
      const hit = hitTest(wx, wz);
      setSel(hit);
      if (hit?.type === 'road') drag.current = { mode: 'road', road: city.layout.roads.find((r) => r.id === hit.id), start: [wx, wz] };
      else if (hit?.type === 'plot') drag.current = { mode: 'plot', plot: city.plots.find((p) => p.id === hit.id), start: [wx, wz] };
      else if (hit?.type === 'park') drag.current = { mode: 'park', park: city.layout.parks.find((k) => k.id === hit.id), start: [wx, wz] };
      else drag.current = { mode: 'pan', sx, sz, cx: view.cx, cz: view.cz };
    } else if (tool === 'road') {
      const a = snapPoint(wx, wz, e.shiftKey);
      drag.current = { mode: 'draw', a };
      setGhost({ kind: 'road', road: roadFrom(a, a) });
    } else if (tool === 'park') {
      drag.current = { mode: 'rect', a: [snap(wx), snap(wz)] };
    } else if (tool === 'plot') {
      const spec = lotAt(wx, wz, e.shiftKey);
      if (!spec) return;
      const lot = makeLot(city, spec);
      commit([{ t: 'plot+', plot: lot }], `Placed lot #${lot.id}.`);
      setSel({ type: 'plot', id: lot.id });
    } else if (tool === 'fill') {
      const hit = hitTest(wx, wz);
      if (hit?.type === 'road') {
        const road = city.layout.roads.find((r) => r.id === hit.id);
        const lots = fillFrontage(city, road, { side: opts.side, pitch: opts.pitch, setback: opts.setback, status: opts.lotStatus, tier: opts.tier === 'ordinary' ? undefined : opts.tier });
        const g = group();
        commit(lots.map((o) => ({ ...o, ...g })), lots.length ? `Laid ${lots.length} lots along ${road.name}.` : `No room for lots along ${road.name}.`);
        setSel({ type: 'road', id: road.id });
      }
    } else if (tool === 'erase') {
      const hit = hitTest(wx, wz);
      if (hit) {
        commit([{ t: `${hit.type}-`, id: hit.id }], `Removed ${hit.type} ${hit.id}.`);
        setSel(null);
      }
    }
  };
  const onPointerMove = (e) => {
    const [sx, sz] = pointer(e);
    const [wx, wz] = toWorld(sx, sz);
    const d = drag.current;
    if (d?.mode === 'pan') {
      setView((v) => ({ ...v, cx: d.cx - (sx - d.sx) / v.scale, cz: d.cz - (sz - d.sz) / v.scale }));
      return;
    }
    if (d?.mode === 'draw') {
      const b = snapPoint(wx, wz, e.shiftKey);
      setGhost({ kind: 'road', road: roadFrom(d.a, b) });
      return;
    }
    if (d?.mode === 'rect') {
      const b = [snap(wx), snap(wz)];
      setGhost({ kind: 'rect', rect: { x0: Math.min(d.a[0], b[0]), x1: Math.max(d.a[0], b[0]), z0: Math.min(d.a[1], b[1]), z1: Math.max(d.a[1], b[1]) } });
      return;
    }
    if (d?.mode === 'road') {
      const across = (d.road.axis === 'x' ? wz : wx) - (d.road.axis === 'x' ? d.start[1] : d.start[0]);
      setGhost({ kind: 'road', road: { ...d.road, center: snap(d.road.center + across) } });
      return;
    }
    if (d?.mode === 'end') {
      const raw = d.road.axis === 'x' ? wx : wz;
      const [px, pz] = snapPoint(wx, wz, e.shiftKey);
      const v = d.road.axis === 'x' ? px : pz;
      setGhost({ kind: 'road', road: { ...d.road, [d.key]: Number.isFinite(v) ? v : raw } });
      return;
    }
    if (d?.mode === 'plot') {
      setGhost({ kind: 'lot', x: snap(d.plot.x + wx - d.start[0]), z: snap(d.plot.z + wz - d.start[1]), yaw: d.plot.yaw ?? 0, w: d.plot.w, d: d.plot.d });
      return;
    }
    if (d?.mode === 'park') {
      const dx = snap(wx - d.start[0]);
      const dz = snap(wz - d.start[1]);
      const k = d.park;
      setGhost({ kind: 'rect', rect: { x0: k.center.x - k.width / 2 + dx, x1: k.center.x + k.width / 2 + dx, z0: k.center.z - k.depth / 2 + dz, z1: k.center.z + k.depth / 2 + dz } });
      return;
    }
    if (tool === 'plot') {
      const spec = lotAt(wx, wz, e.shiftKey);
      setGhost(spec ? { kind: 'lot', x: spec.x, z: spec.z, yaw: spec.yaw, w: spec.w, d: spec.d } : null);
    } else if (tool === 'road') {
      const a = snapPoint(wx, wz, e.shiftKey);
      setGhost({ kind: 'road', road: { axis: 'x', center: a[1], from: a[0] - 1, to: a[0] + 1 } });
    } else if (ghost) setGhost(null);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !city) return;
    const g = ghost;
    setGhost(null);
    if (d.mode === 'draw' && g?.road && g.road.to - g.road.from >= 4) {
      const grp = group();
      const road = makeRoad(g.road, city.layout.roads);
      const clearMargin = opts.fill ? 3.4 + opts.setback : 0; // with lots to lay, the two rows of lots that would stand beside it are cleared
      const newOps = [{ t: 'road+', road, clearMargin, ...grp }];
      if (opts.fill) {
        const after = applyEdits(city, [{ t: 'road+', road, clearMargin }]);
        const placed = after.layout.roads.find((r) => r.id === road.id);
        for (const o of fillFrontage(after, placed, { side: 0, pitch: opts.pitch, setback: opts.setback, status: opts.lotStatus, tier: opts.tier === 'ordinary' ? undefined : opts.tier })) newOps.push({ ...o, ...grp });
      }
      commit(newOps, `Added ${road.name}${opts.fill ? ` with ${newOps.length - 1} lots` : ''}.`);
      setSel({ type: 'road', id: road.id });
    } else if (d.mode === 'rect' && g?.rect && g.rect.x1 - g.rect.x0 >= 6 && g.rect.z1 - g.rect.z0 >= 6) {
      const park = makePark(city, g.rect, opts.parkName);
      commit([{ t: 'park+', park }], `Added ${park.name}.`);
      setSel({ type: 'park', id: park.id });
    } else if (d.mode === 'road' && g?.road && g.road.center !== d.road.center) {
      commit([{ t: 'road~', id: d.road.id, set: { center: g.road.center } }], `Moved ${d.road.name}.`);
    } else if (d.mode === 'end' && g?.road && (g.road.from !== d.road.from || g.road.to !== d.road.to)) {
      if (g.road.to - g.road.from >= 4) commit([{ t: 'road~', id: d.road.id, set: { from: g.road.from, to: g.road.to } }], `Resized ${d.road.name}.`);
    } else if (d.mode === 'plot' && g?.kind === 'lot' && (g.x !== d.plot.x || g.z !== d.plot.z)) {
      commit([{ t: 'plot~', id: d.plot.id, set: { x: g.x, z: g.z } }], `Moved lot #${d.plot.id}.`);
    } else if (d.mode === 'park' && g?.rect) {
      const k = d.park;
      const cx = (g.rect.x0 + g.rect.x1) / 2;
      const cz = (g.rect.z0 + g.rect.z1) / 2;
      if (cx !== k.center.x || cz !== k.center.z) {
        // moving a park moves its trees with it: it is made again at the new place
        const moved = makePark(city, g.rect, k.name, k.id);
        const grp = group();
        commit([{ t: 'park-', id: k.id, ...grp }, { t: 'park+', park: { ...moved, id: k.id }, ...grp }], `Moved ${k.name}.`);
      }
    }
  };
  const onWheel = (e) => {
    const [sx, sz] = pointer(e);
    const [wx, wz] = toWorld(sx, sz);
    const s = clamp(view.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.6, 30);
    const w = wrap.current.clientWidth;
    const h = wrap.current.clientHeight;
    setView({ scale: s, cx: wx - (sx - w / 2) / s, cz: wz - (sz - h / 2) / s });
  };

  // ---- the keyboard
  useEffect(() => {
    const down = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redoIt();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redoIt();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel) {
          commit([{ t: `${sel.type}-`, id: sel.id }], `Removed ${sel.type} ${sel.id}.`);
          setSel(null);
        }
      } else if (e.key === 'Escape') {
        drag.current = null;
        setGhost(null);
        setSel(null);
      } else if (KEYS[e.key.toLowerCase()] && !e.ctrlKey) setTool(KEYS[e.key.toLowerCase()]);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [sel, undo, redoIt, commit]);

  // ---- saving and opening
  const save = () => {
    const ok = saveEdits(seed, ops);
    setStatus(ok ? `Saved ${ops.length} edits in this browser.` : 'Could not save (browser storage is off).');
  };
  const openInGame = () => {
    if (check.errors.length && !window.confirm(`${check.errors.length} errors (roads that end in nothing, roads on top of each other) can break the traffic. Open the game anyway?`)) return;
    saveEdits(seed, ops);
    try {
      window.localStorage.removeItem('voxelventure-save'); // the saved game is for the old city
    } catch {
      /* nothing saved */
    }
    window.open('/', '_blank');
  };
  const revert = () => {
    if (!ops.length || window.confirm('Remove all edits and go back to the generated city?')) {
      setOps([]);
      setRedo([]);
      clearEdits();
      setSel(null);
      setStatus('All edits removed.');
    }
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(toDocument(seed, ops), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `voxelventure-city-${seed}-edits.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (file) => {
    try {
      const doc = fromDocument(JSON.parse(await file.text()));
      if (!doc) throw new Error('not an edit file');
      setSeed(doc.seed);
      setSeedText(String(doc.seed));
      setOps(doc.ops);
      setRedo([]);
      setStatus(`Imported ${doc.ops.length} edits.`);
    } catch (err) {
      setStatus(`Could not import: ${err.message}`);
    }
  };

  if (!on) return <main className="p-8 text-slate-300">This page is a design tool and is not part of release builds.</main>;
  const selRoad = sel?.type === 'road' ? city.layout.roads.find((r) => r.id === sel.id) : null;
  const selPlot = sel?.type === 'plot' ? city.plots.find((p) => p.id === sel.id) : null;
  const selPark = sel?.type === 'park' ? city.layout.parks.find((k) => k.id === sel.id) : null;
  const setRoad = (set) => commit([{ t: 'road~', id: selRoad.id, set }], `Changed ${selRoad.name}.`);
  const setPlot = (set) => commit([{ t: 'plot~', id: selPlot.id, set }], `Changed lot #${selPlot.id}.`);
  // a change that makes the lot again (its business, tier, size): the same place and id
  const remakePlot = (changes) => {
    const spec = { x: selPlot.x, z: selPlot.z, yaw: selPlot.yaw, facing: selPlot.facing, w: selPlot.w, d: selPlot.d, tier: tierOf(selPlot), status: selPlot.owner ? 'built' : 'empty', district: selPlot.districtId, ...changes };
    const lot = makeLot(city, spec, selPlot.id);
    const grp = group();
    commit([{ t: 'plot-', id: selPlot.id, ...grp }, { t: 'plot+', plot: lot, ...grp }], `Remade lot #${selPlot.id}.`);
  };
  const zoomTo = (x, z) => setView((v) => ({ ...v, cx: x, cz: z, scale: Math.max(v.scale, 6) }));
  const btn = 'rounded-lg border border-slate-600 px-2.5 py-1 text-xs hover:bg-slate-700';

  return (
    <main className="flex h-screen flex-col bg-[#090d16] text-white" data-testid="city-editor">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs">
        <b className="mr-1 text-sm">City editor</b>
        <label className="flex items-center gap-1">Seed
          <input value={seedText} onChange={(e) => setSeedText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && Number(seedText) > 0 && (setSeed(Math.floor(Number(seedText))), setOps([]), setRedo([]), setSel(null))} className="w-24 rounded bg-slate-800 px-2 py-0.5" />
        </label>
        <button className={btn} onClick={() => Number(seedText) > 0 && (setSeed(Math.floor(Number(seedText))), setOps([]), setRedo([]), setSel(null))}>Generate</button>
        <span className="mx-1 h-4 w-px bg-slate-600" />
        <button className={btn} onClick={undo} disabled={!ops.length} data-testid="undo">Undo</button>
        <button className={btn} onClick={redoIt} disabled={!redo.length}>Redo</button>
        <button className={btn} onClick={revert}>Revert all</button>
        <button className={btn} title="Move lots that stand on a road or a park, on each other, or face nothing to the nearest free place beside a road" onClick={refit} data-testid="refit">Re-fit lots</button>
        <span className="mx-1 h-4 w-px bg-slate-600" />
        <button className={btn} onClick={save} data-testid="save">Save</button>
        <button className={`${btn} border-lime-500 text-lime-300`} onClick={openInGame} data-testid="open-game">Open in the game</button>
        <button className={btn} onClick={exportJson}>Export</button>
        <label className={`${btn} cursor-pointer`}>Import<input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} /></label>
        <span className="ml-2 text-slate-400" data-testid="edit-summary">{ops.length} edits: {summary.roadsAdded} roads added, {summary.roadsRemoved} removed, {summary.roadsChanged} changed; {summary.lotsAdded} lots added, {summary.lotsRemoved} removed, {summary.lotsChanged} changed; {summary.parks} park edits</span>
        <span className="ml-auto text-slate-300">{city.plots.length} lots · {city.layout.roads.length} roads · {city.layout.intersections.length} junctions</span>
        <span className={check.errors.length ? 'text-red-400' : 'text-emerald-400'} data-testid="problems">{check.errors.length} errors, {check.warnings.length} warnings</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-40 flex-col gap-1 border-r border-slate-700 bg-slate-900/60 p-2 text-xs">
          {TOOLS.map(([id, label, hint]) => (
            <button key={id} title={hint} onClick={() => setTool(id)} data-testid={`tool-${id}`} className={`rounded-lg border px-2 py-1.5 text-left ${tool === id ? 'border-sky-400 bg-sky-900/50' : 'border-slate-700 hover:bg-slate-800'}`}>{label}</button>
          ))}
          <p className="mt-1 text-[10px] leading-snug text-slate-400">{TOOLS.find((t) => t[0] === tool)?.[2]}</p>
          {(tool === 'road' || tool === 'fill') && (
            <section className="mt-2 space-y-1 border-t border-slate-700 pt-2">
              {tool === 'road' && (
                <>
                  <Field label="Name"><input value={opts.name} onChange={(e) => setOpts({ ...opts, name: e.target.value })} className={INPUT} /></Field>
                  <Field label="Kind"><select value={opts.kind} onChange={(e) => setOpts({ ...opts, kind: e.target.value })} className={INPUT}>{ROAD_KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
                  <Field label="Class"><select value={opts.class} onChange={(e) => setOpts({ ...opts, class: e.target.value })} className={INPUT}>{ROAD_CLASSES.map((k) => <option key={k}>{k}</option>)}</select></Field>
                  <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={opts.fill} onChange={(e) => setOpts({ ...opts, fill: e.target.checked })} /> Lay lots on both sides</label>
                </>
              )}
              {tool === 'fill' && <Field label="Side"><select value={opts.side} onChange={(e) => setOpts({ ...opts, side: Number(e.target.value) })} className={INPUT}><option value={0}>both</option><option value={-1}>one (-)</option><option value={1}>other (+)</option></select></Field>}
              <Field label="Lot every"><Num value={opts.pitch} step={0.1} onCommit={(n) => setOpts({ ...opts, pitch: clamp(n, 3.4, 12) })} /></Field>
              <Field label="Set back"><Num value={opts.setback} step={0.5} onCommit={(n) => setOpts({ ...opts, setback: clamp(n, 0, 6) })} /></Field>
            </section>
          )}
          {(tool === 'plot' || tool === 'fill' || tool === 'road') && (
            <section className="mt-2 space-y-1 border-t border-slate-700 pt-2">
              <Field label="Lots"><select value={opts.lotStatus} onChange={(e) => setOpts({ ...opts, lotStatus: e.target.value })} className={INPUT}><option value="mixed">some built</option><option value="empty">for sale</option><option value="built">built</option></select></Field>
              <Field label="Tier"><select value={opts.tier} onChange={(e) => setOpts({ ...opts, tier: e.target.value, ...(e.target.value === 'ordinary' ? { w: 3, d: 3 } : e.target.value === 'prime' ? { w: 6.4, d: 3 } : e.target.value === 'luxury' ? { w: 10.2, d: 6.4 } : { w: 14, d: 7.6 }) })} className={INPUT}><option>ordinary</option><option>prime</option><option>luxury</option><option>grand</option></select></Field>
              {tool === 'plot' && <><Field label="Width"><Num value={opts.w} onCommit={(n) => setOpts({ ...opts, w: clamp(n, 3, 20) })} /></Field><Field label="Depth"><Num value={opts.d} onCommit={(n) => setOpts({ ...opts, d: clamp(n, 3, 20) })} /></Field></>}
            </section>
          )}
          {tool === 'park' && <section className="mt-2 border-t border-slate-700 pt-2"><Field label="Name"><input value={opts.parkName} onChange={(e) => setOpts({ ...opts, parkName: e.target.value })} className={INPUT} /></Field></section>}
          <section className="mt-2 space-y-1 border-t border-slate-700 pt-2 text-[11px]">
            <label className="flex items-center gap-1"><input type="checkbox" checked={opts.showLots} onChange={(e) => setOpts({ ...opts, showLots: e.target.checked })} /> Show lots</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={opts.showIssues} onChange={(e) => setOpts({ ...opts, showIssues: e.target.checked })} /> Mark problems</label>
          </section>
          <p className="mt-auto text-[10px] leading-snug text-slate-500">Wheel zooms, middle or right drag (or Alt-drag) pans. Delete removes the selection. Ctrl+Z undoes.</p>
        </nav>
        <div ref={wrap} className="relative min-w-0 flex-1" onContextMenu={(e) => e.preventDefault()}>
          <canvas ref={canvas} data-testid="editor-canvas" className="absolute inset-0 h-full w-full touch-none" style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={onWheel} />
          {status && <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-slate-900/90 px-2 py-1 text-xs text-slate-200" data-testid="status">{status}</div>}
        </div>
        <aside className="w-72 space-y-3 overflow-y-auto border-l border-slate-700 bg-slate-900/60 p-3 text-xs">
          <section data-testid="properties">
            <h2 className="mb-1 text-sm font-bold">{selRoad ? `Road: ${selRoad.name}` : selPlot ? `Lot #${selPlot.id}` : selPark ? `Park: ${selPark.name}` : 'Nothing selected'}</h2>
            {selRoad && (
              <div className="space-y-1">
                <Field label="Name"><input list="street-names" onBlur={(e) => e.target.value !== selRoad.name && setRoad({ name: e.target.value })} defaultValue={selRoad.name} key={selRoad.id + selRoad.name} className={INPUT} /></Field>
                <datalist id="street-names">{ALL_STREET_NAMES.map((n) => <option key={n} value={n} />)}</datalist>
                {ALL_STREET_NAMES.length > 0 && (
                  <button className={btn} title={STREET_NAME_ATTRIBUTION} onClick={() => { const used = new Set(city.layout.roads.map((r) => r.name)); const free = ALL_STREET_NAMES.filter((n) => !used.has(n) && n.length <= 22); if (free.length) setRoad({ name: free[Math.floor(Math.random() * free.length)] }); }}>Suggest a real street name</button>
                )}
                <Field label="Kind"><select value={selRoad.kind} onChange={(e) => setRoad({ kind: e.target.value })} className={INPUT}>{[...new Set([selRoad.kind, ...ROAD_KINDS, 'county', 'drive', 'lake', 'spur'])].map((k) => <option key={k}>{k}</option>)}</select></Field>
                <Field label="Class"><select value={selRoad.class} onChange={(e) => setRoad({ class: e.target.value })} className={INPUT}>{ROAD_CLASSES.map((k) => <option key={k}>{k}</option>)}</select></Field>
                <Field label={selRoad.axis === 'x' ? 'Along x, at z' : 'Along z, at x'}><Num value={selRoad.center} onCommit={(n) => setRoad({ center: n })} /></Field>
                <Field label="From"><Num value={selRoad.from} onCommit={(n) => n < selRoad.to - 4 && setRoad({ from: n })} /></Field>
                <Field label="To"><Num value={selRoad.to} onCommit={(n) => n > selRoad.from + 4 && setRoad({ to: n })} /></Field>
                <div className="flex flex-wrap gap-1 pt-1">
                  <button className={btn} onClick={() => { const lots = fillFrontage(city, selRoad, { side: opts.side, pitch: opts.pitch, setback: opts.setback, status: opts.lotStatus, tier: opts.tier === 'ordinary' ? undefined : opts.tier }); const g = group(); commit(lots.map((o) => ({ ...o, ...g })), `Laid ${lots.length} lots.`); }}>Lay lots along it</button>
                  <button className={btn} onClick={() => { const near = city.plots.filter((p) => { const b = plotBox(p); return (selRoad.axis === 'x' ? Math.abs(p.z - selRoad.center) < 6 && b.x1 > selRoad.from && b.x0 < selRoad.to : Math.abs(p.x - selRoad.center) < 6 && b.z1 > selRoad.from && b.z0 < selRoad.to); }); const g = group(); commit(near.map((p) => ({ t: 'plot-', id: p.id, ...g })), `Removed ${near.length} lots beside ${selRoad.name}.`); }}>Clear lots beside it</button>
                  <button className={`${btn} border-red-500 text-red-300`} onClick={() => { commit([{ t: 'road-', id: selRoad.id }], `Removed ${selRoad.name}.`); setSel(null); }}>Remove road</button>
                </div>
                <p className="text-[10px] text-slate-400">{selRoad.edited ? 'Made in the editor.' : 'Generated.'} {city.layout.intersections.filter((i) => i.id.includes(selRoad.id)).length} junctions.</p>
              </div>
            )}
            {selPlot && (
              <div className="space-y-1">
                <Field label="Title"><input defaultValue={selPlot.title} key={selPlot.id + selPlot.title} onBlur={(e) => e.target.value !== selPlot.title && setPlot({ title: e.target.value })} className={INPUT} /></Field>
                <Field label="Status"><select value={selPlot.owner ? 'built' : 'empty'} onChange={(e) => remakePlot({ status: e.target.value })} className={INPUT}><option value="empty">for sale</option><option value="built">built</option></select></Field>
                <Field label="Tier"><select value={tierOf(selPlot)} onChange={(e) => remakePlot({ tier: e.target.value, ...(e.target.value === 'ordinary' ? { w: 3, d: 3 } : e.target.value === 'prime' ? { w: 6.4, d: 3 } : e.target.value === 'luxury' ? { w: 10.2, d: 6.4 } : { w: 14, d: 7.6 }) })} className={INPUT}><option>ordinary</option><option>prime</option><option>luxury</option><option>grand</option></select></Field>
                <Field label="District"><select value={selPlot.districtId} onChange={(e) => remakePlot({ district: e.target.value })} className={INPUT}>{city.layout.districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
                <Field label="x"><Num value={selPlot.x} onCommit={(n) => setPlot({ x: n })} /></Field>
                <Field label="z"><Num value={selPlot.z} onCommit={(n) => setPlot({ z: n })} /></Field>
                <Field label="Turn (degrees)"><Num value={Math.round(((selPlot.yaw ?? 0) * 180) / Math.PI)} step={90} onCommit={(n) => setPlot({ yaw: (n * Math.PI) / 180 })} /></Field>
                <Field label="Door faces"><select value={selPlot.facing ?? 1} onChange={(e) => setPlot({ facing: Number(e.target.value) })} className={INPUT}><option value={1}>forward</option><option value={-1}>back</option></select></Field>
                <p className="text-[10px] text-slate-400">{selPlot.edited ? 'Placed in the editor.' : 'Generated.'} Land price ${selPlot.price} · {selPlot.w} x {selPlot.d}</p>
                <button className={`${btn} border-red-500 text-red-300`} onClick={() => { commit([{ t: 'plot-', id: selPlot.id }], `Removed lot #${selPlot.id}.`); setSel(null); }}>Remove lot</button>
              </div>
            )}
            {selPark && (
              <div className="space-y-1">
                <Field label="Name"><input defaultValue={selPark.name} key={selPark.id + selPark.name} onBlur={(e) => e.target.value !== selPark.name && commit([{ t: 'park~', id: selPark.id, set: { name: e.target.value } }], 'Renamed the park.')} className={INPUT} /></Field>
                <p className="text-[10px] text-slate-400">{selPark.width} x {selPark.depth}, {selPark.trees.length} trees. Drag it to move it; remove it and draw a new one to change its size.</p>
                <button className={`${btn} border-red-500 text-red-300`} onClick={() => { commit([{ t: 'park-', id: selPark.id }], `Removed ${selPark.name}.`); setSel(null); }}>Remove park</button>
              </div>
            )}
            {!sel && <p className="text-slate-400">Pick a tool, or click a road, lot or park with Select.</p>}
          </section>
          <section data-testid="issues">
            <h2 className="mb-1 text-sm font-bold">Problems ({check.issues.length})</h2>
            {check.issues.length === 0 && <p className="text-emerald-400">None: every road ends in a junction and no lot is on a road.</p>}
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {check.issues.slice(0, 80).map((i, k) => (
                <li key={k}>
                  <button className="w-full rounded border border-slate-700 px-2 py-1 text-left hover:bg-slate-800" onClick={() => { zoomTo(i.x, i.z); if (i.ids[0]) setSel({ type: String(i.ids[0]).startsWith('edit-road') || (typeof i.ids[0] === 'string') ? 'road' : 'plot', id: i.ids[0] }); }}>
                    <span className={i.level === 'error' ? 'text-red-400' : 'text-amber-400'}>{i.level === 'error' ? 'Error' : 'Warning'}</span> {i.message}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="text-[10px] leading-snug text-slate-500">
            <p>Lots made here are numbered from {EDIT_PLOT_BASE}. In the game the edited city is built from the same seed with these edits replayed over it (development builds only); a different seed has no edits. "Open in the game" clears the saved game, which belongs to the old city.</p>
            <p className="mt-1">Colours: grey roads, lime roads and outlines are yours; lots are slate (for sale), pale (built), amber, purple and red (prime, luxury, grand).</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
