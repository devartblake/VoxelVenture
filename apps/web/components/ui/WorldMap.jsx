"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, Flag, Footprints, Minus, Plus, Trash2, X } from 'lucide-react';
import { avatarState } from '@/lib/sim/avatarState';
import { remoteDots, remotePlayers, useNet } from '@/lib/net/multiplayer';
import { flightClock, flightPlanFor, flightState } from '@/lib/sim/flight';
import { queryGrid } from '@/lib/city/spatialGrid';
import { WALK_SPEED } from '@/lib/city/routing';
import { LAYERS, useMap } from '@/lib/state/mapStore';
import { useCityStore } from '@/lib/state/store';
import { usePanel } from '@/lib/state/panelStore';
import { insideHall } from '@/lib/city/mallHall';
import { buildMapData } from './worldMap/mapData';
import { drawStatic } from './worldMap/drawStatic';

// The world map (press M). A full-screen map of the whole world that never pauses it: the traffic, the planes, the other players and the server's clock keep
// running behind it, and the map shows them live. Drag to pan, wheel or pinch to zoom, click a building to open it or set a waypoint (right-click removes it), "Go there" walks the
// roads to it. Layers can be switched off in the panel on the right.
//
// Performance comes first. Only what is in view is drawn: the plots come from a grid query, everything else is tested against the view. The still part of the
// map lives in an offscreen canvas wider than the screen, so panning just moves it and it is redrawn only when the view has moved far or the zoom has settled.
// What moves (you, the planes, the other players, the route) is drawn on top, about thirty times a second. The numbers are in window.__vvMap.
const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
const MAX_SCALE = 16;
const FRAME_MS = 33;

// Always mounted: the M key, and the overlay while it is open.
export default function WorldMap() {
  const open = useMap((s) => s.open);
  useEffect(() => {
    useMap.getState().hydrate();
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        useMap.getState().toggle();
      } else if (e.key === 'Escape' && useMap.getState().open) useMap.getState().close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return open ? <MapOverlay /> : null;
}

const nice = (units) => [1, 2, 5, 10, 20, 50, 100, 200, 500].reduce((best, n) => (Math.abs(n - units) < Math.abs(best - units) ? n : best), 1);
const seconds = (len) => {
  const s = Math.round(len / WALK_SPEED);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
};

function MapOverlay() {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const layers = useMap((s) => s.layers);
  const route = useMap((s) => s.route);
  const waypoint = useMap((s) => s.waypoint);
  const autoWalk = useMap((s) => s.autoWalk);
  const [hover, setHover] = useState(null);
  const [card, setCard] = useState(null); // a building or mall you clicked: { kind, plot | mall, x, y, wx, wz }
  const st = useRef({ view: { ...useMap.getState().view }, size: { W: 0, H: 0 }, cache: null, data: null, dataKey: null, stats: {}, zoomAt: 0, moveAt: 0, ptrs: new Map(), drag: null, hover: null, mouse: null, dirty: true });

  // keep the view in the store too (it is the map's memory between openings) and resize with the window
  useEffect(() => {
    const el = wrap.current;
    const cv = canvas.current;
    const S = st.current;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const resize = () => {
      const r = el.getBoundingClientRect();
      S.size = { W: Math.max(300, Math.round(r.width)), H: Math.max(300, Math.round(r.height)) };
      cv.width = S.size.W * dpr;
      cv.height = S.size.H * dpr;
      cv.style.width = `${S.size.W}px`;
      cv.style.height = `${S.size.H}px`;
      S.cache = null;
      S.dirty = true;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const S = st.current;
    const cv = canvas.current;
    const ctx = cv.getContext('2d');
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    let raf = 0;
    let last = 0;
    window.__vvMap = S.stats;
    S.stats.goTo = (v) => { Object.assign(S.view, v); S.dirty = true; S.moveAt = performance.now(); }; // for tests: move the view

    const getData = () => {
      const { layout, plots, billboards } = useCityStore.getState();
      if (S.dataKey?.layout !== layout || S.dataKey?.plots !== plots || S.dataKey?.billboards !== billboards) {
        S.dataKey = { layout, plots, billboards };
        S.data = buildMapData(layout, plots, billboards);
        S.cache = null;
      }
      return S.data;
    };
    // The still layer: an offscreen canvas wider than the screen. Redrawn when the view moves past its margin, when the zoom has settled, or when a plot changes.
    const ensureStatic = (view, now) => {
      const { W, H } = S.size;
      const M = Math.round(Math.max(W, H) * 0.3);
      let c = S.cache;
      const moved = c ? Math.max(Math.abs(c.view.cx - view.cx), Math.abs(c.view.cz - view.cz)) * view.scale : 0;
      const ratio = c ? view.scale / c.view.scale : 1;
      const zooming = now - S.zoomAt < 140;
      const stale = !c || S.dirty || c.W !== W || c.H !== H || moved > M * 0.8 || ratio > 1.6 || ratio < 0.62 || (Math.abs(ratio - 1) > 0.004 && !zooming);
      if (!stale) return c;
      if (!c || c.W !== W || c.H !== H) {
        const canvas2 = document.createElement('canvas');
        canvas2.width = (W + 2 * M) * dpr;
        canvas2.height = (H + 2 * M) * dpr;
        c = { canvas: canvas2, W, H, M, view: null };
        S.cache = c;
      }
      const cctx = c.canvas.getContext('2d');
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.view = { ...view };
      drawStatic(cctx, W + 2 * M, H + 2 * M, c.view, getData(), useMap.getState().layers, (p) => p.userClaimed, S.stats);
      S.dirty = false;
      return c;
    };

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const interacting = now - S.moveAt < 250;
      if (now - last < (interacting ? 16 : FRAME_MS)) return;
      last = now;
      const t0 = performance.now();
      const { W, H } = S.size;
      if (!W) return;
      const view = S.view;
      const { layout, plots } = getData();
      const c = ensureStatic(view, now);
      const s = view.scale;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // the still layer, moved and (while the zoom settles) scaled
      const r = s / c.view.scale;
      const dx = (c.view.cx - view.cx) * s;
      const dy = (c.view.cz - view.cz) * s;
      const cw = (c.W + 2 * c.M) * r;
      const ch = (c.H + 2 * c.M) * r;
      ctx.drawImage(c.canvas, W / 2 + dx - cw / 2, H / 2 + dy - ch / 2, cw, ch);
      const X = (x) => (x - view.cx) * s + W / 2;
      const Z = (z) => (z - view.cz) * s + H / 2;
      const L = useMap.getState().layers;

      // the route and the waypoint
      const { route: rt, waypoint: wp } = useMap.getState();
      if (rt) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (const pass of [0, 1]) {
          ctx.lineWidth = pass === 0 ? 7 : 3.5;
          ctx.strokeStyle = pass === 0 ? 'rgba(8, 47, 73, 0.9)' : '#22d3ee';
          if (pass === 1) ctx.setLineDash([9, 6]);
          ctx.beginPath();
          rt.points.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Z(p.z)) : ctx.moveTo(X(p.x), Z(p.z))));
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      if (wp) {
        const x = X(wp.x);
        const y = Z(wp.z);
        ctx.fillStyle = '#22d3ee';
        ctx.strokeStyle = '#082f49';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x - 11, y - 12, x - 9, y - 26, x, y - 26);
        ctx.bezierCurveTo(x + 9, y - 26, x + 11, y - 12, x, y);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#082f49';
        ctx.beginPath();
        ctx.arc(x, y - 17, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // planes, and the other players
      if (L.planes && (layout.airports ?? []).length >= 2) {
        const plan = flightPlanFor(layout, plots);
        for (let i = 0; i < plan.planes.length; i++) {
          const f = flightState(plan, i, flightClock());
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(X(f.x), Z(f.z), 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      if (L.players) {
        // everyone farther away than the server tells us about in full: small dots
        ctx.fillStyle = 'rgba(74, 222, 128, 0.75)';
        for (const [id, dx, dz] of remoteDots.list) {
          if (remotePlayers.has(id)) continue;
          ctx.beginPath();
          ctx.arc(X(dx), Z(dz), 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (const p of remotePlayers.values()) {
          if (!Number.isFinite(p.x)) continue;
          ctx.fillStyle = '#4ade80';
          ctx.strokeStyle = '#052e16';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(X(p.x), Z(p.z), 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          if (s >= 2.5 && p.name) {
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#0b1020';
            ctx.strokeText(p.name, X(p.x), Z(p.z) - 10);
            ctx.fillStyle = '#bbf7d0';
            ctx.fillText(p.name, X(p.x), Z(p.z) - 10);
          }
        }
      }

      // you: a pulsing ring and an arrow the way you face (north is up, so facing (sin yaw, cos yaw) is the same in pixels)
      if (avatarState.ready) {
        const x = X(avatarState.x);
        const y = Z(avatarState.z);
        const pulse = 9 + Math.sin(now / 260) * 2;
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, pulse, 0, Math.PI * 2);
        ctx.stroke();
        const ang = Math.atan2(Math.cos(avatarState.yaw), Math.sin(avatarState.yaw));
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0b1020';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ang) * 8, y + Math.sin(ang) * 8);
        ctx.lineTo(x + Math.cos(ang + 2.5) * 6, y + Math.sin(ang + 2.5) * 6);
        ctx.lineTo(x + Math.cos(ang - 2.5) * 6, y + Math.sin(ang - 2.5) * 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // the scale bar
      const units = nice(90 / s);
      ctx.fillStyle = 'rgba(11, 16, 32, 0.8)';
      ctx.fillRect(16, H - 40, units * s + 24, 24);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(28, H - 24, units * s, 2);
      ctx.fillRect(28, H - 28, 2, 10);
      ctx.fillRect(28 + units * s - 2, H - 28, 2, 10);
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${units}`, 32, H - 31);
      void L;
      S.stats.frameMs = performance.now() - t0;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // a layer toggled or a plot changed: the still layer is drawn again
  useEffect(() => {
    st.current.dirty = true;
  }, [layers]);

  // ---- input
  const worldAt = (px, py) => {
    const { view, size } = st.current;
    return { x: view.cx + (px - size.W / 2) / view.scale, z: view.cz + (py - size.H / 2) / view.scale };
  };
  const clampView = () => {
    const S = st.current;
    const land = useCityStore.getState().layout.land;
    S.view.cx = Math.min(land.x1, Math.max(land.x0, S.view.cx));
    S.view.cz = Math.min(land.z1, Math.max(land.z0, S.view.cz));
    const min = Math.min(S.size.W / (land.x1 - land.x0), S.size.H / (land.z1 - land.z0)) * 0.95;
    S.view.scale = Math.min(MAX_SCALE, Math.max(min, S.view.scale));
    useMap.getState().setView({ ...S.view });
  };
  const zoomAt = (px, py, factor) => {
    const S = st.current;
    const before = worldAt(px, py);
    S.view.scale *= factor;
    clampView();
    const after = worldAt(px, py);
    S.view.cx += before.x - after.x;
    S.view.cz += before.z - after.z;
    clampView();
    S.zoomAt = performance.now();
    S.moveAt = S.zoomAt;
  };
  const pick = (px, py) => {
    const S = st.current;
    if (!S.data) return null;
    const w = worldAt(px, py);
    const pad = 3 / S.view.scale;
    const hit = queryGrid(S.data.plotGrid, { x0: w.x - pad, x1: w.x + pad, z0: w.z - pad, z1: w.z + pad }).find((p) => {
      const r = S.data.plotRect(p);
      return w.x >= r.x0 - pad && w.x <= r.x1 + pad && w.z >= r.z0 - pad && w.z <= r.z1 + pad;
    });
    return hit ?? null;
  };
  const local = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e) => {
    const S = st.current;
    canvas.current.setPointerCapture(e.pointerId);
    const p = local(e);
    S.ptrs.set(e.pointerId, p);
    S.drag = { x: p.x, y: p.y, moved: false, pinch: S.ptrs.size === 2 ? Math.hypot(...[...S.ptrs.values()].reduce((a, q, i) => (i ? [a[0] - q.x, a[1] - q.y] : [q.x, q.y]), [])) : null };
  };
  const onMove = (e) => {
    const S = st.current;
    const p = local(e);
    S.mouse = p;
    if (!S.ptrs.has(e.pointerId)) {
      const hit = pick(p.x, p.y);
      if (hit?.id !== S.hover?.id) {
        S.hover = hit;
        setHover(hit ? { title: hit.title, owner: hit.owner, x: p.x, y: p.y, admin: hit.admin, district: hit.district } : null);
      } else if (hit) setHover((h) => (h ? { ...h, x: p.x, y: p.y } : h));
      return;
    }
    const prev = S.ptrs.get(e.pointerId);
    S.ptrs.set(e.pointerId, p);
    if (S.ptrs.size === 2) {
      const [a, b] = [...S.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (S.drag?.pinch) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / S.drag.pinch);
      if (S.drag) { S.drag.pinch = d; S.drag.moved = true; }
      return;
    }
    if (!S.drag) return;
    if (!S.drag.moved && Math.hypot(p.x - S.drag.x, p.y - S.drag.y) < 5) return;
    S.drag.moved = true;
    S.view.cx -= (p.x - prev.x) / S.view.scale;
    S.view.cz -= (p.y - prev.y) / S.view.scale;
    clampView();
    S.moveAt = performance.now();
    S.hover = null;
    setHover(null);
  };
  const onUp = (e) => {
    const S = st.current;
    const p = local(e);
    const click = S.drag && !S.drag.moved && S.ptrs.size === 1;
    S.ptrs.delete(e.pointerId);
    if (S.ptrs.size === 0) S.drag = null;
    if (!click || e.button === 2) return;
    const hit = pick(p.x, p.y);
    const w = worldAt(p.x, p.y);
    if (e.shiftKey && hit) {
      useMap.getState().close();
      useCityStore.getState().setSelectedPlot(hit, 'search');
      return;
    }
    // a click on a building or a mall offers to open it (wherever you are: the map can reach every building) or to put a waypoint on it
    const mall = (useCityStore.getState().layout.malls ?? []).find((m) => insideHall(m, w.x, w.z, -0.5));
    if (hit && hit.owner) setCard({ kind: 'plot', plot: hit, x: p.x, y: p.y, wx: w.x, wz: w.z });
    else if (mall) setCard({ kind: 'mall', mall, x: p.x, y: p.y, wx: w.x, wz: w.z });
    else {
      setCard(null);
      useMap.getState().setWaypoint(w.x, w.z);
    }
  };
  const onWheel = (e) => {
    e.preventDefault();
    const p = local(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0016));
  };
  useEffect(() => {
    // a wheel listener that can preventDefault (React's are passive)
    const cv = canvas.current;
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const centreOnMe = () => {
    const S = st.current;
    if (avatarState.ready) {
      S.view.cx = avatarState.x;
      S.view.cz = avatarState.z;
      S.moveAt = performance.now();
      clampView();
    }
  };
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(e.target)) return;
      if (e.key === 'c' || e.key === 'C') centreOnMe();
      else if (e.key === '+' || e.key === '=') zoomAt(st.current.size.W / 2, st.current.size.H / 2, 1.4);
      else if (e.key === '-' || e.key === '_') zoomAt(st.current.size.W / 2, st.current.size.H / 2, 1 / 1.4);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => useMap.getState().close();
  const toggleLayer = useMap((s) => s.toggleLayer);
  const netPlayers = useNet((s) => Math.max(0, s.online - 1));
  return (
    <div className="pointer-events-none fixed inset-0 z-[55] bg-black/35 p-3 sm:p-8">
    <div className="pointer-events-auto relative h-full w-full overflow-hidden rounded-2xl border border-sx-stroke bg-sx-page shadow-2xl ring-1 ring-black/40" role="dialog" aria-label="World map" data-testid="world-map">
      <div ref={wrap} className="absolute inset-0 touch-none select-none">
        <canvas ref={canvas} className="block cursor-crosshair" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={(e) => { const p = local(e); zoomAt(p.x, p.y, 2); }} onContextMenu={(e) => { e.preventDefault(); useMap.getState().clearWaypoint(); }} data-testid="world-map-canvas" />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto rounded-xl border border-sx-stroke bg-sx-panel/90 px-3 py-2 shadow-lg backdrop-blur">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-white">City map</h2>
          <p className="text-[11px] text-slate-400">The world keeps running · drag to pan · wheel to zoom · click a building to open it, or the ground for a waypoint · right-click clears it</p>
        </div>
        <button type="button" onClick={close} aria-label="Close the map" className="pointer-events-auto flex items-center gap-2 rounded-xl border border-sx-stroke bg-sx-panel/90 px-3 py-2 text-xs text-slate-200 shadow-lg backdrop-blur hover:bg-sx-alt">
          <kbd className="rounded bg-sx-alt px-1.5 py-0.5 font-mono text-[10px]">M</kbd> or <kbd className="rounded bg-sx-alt px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd>
          <X className="h-4 w-4" />
        </button>
      </header>

      <aside className="absolute right-3 top-20 w-52 rounded-2xl border border-sx-stroke bg-sx-panel/90 p-3 text-xs text-slate-200 shadow-lg backdrop-blur" aria-label="Map layers">
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Show</h3>
        <ul className="space-y-1">
          {LAYERS.map((l) => (
            <li key={l.id}>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={Boolean(layers[l.id])} onChange={() => toggleLayer(l.id)} className="accent-sx-cyan" />
                {l.label}
                {l.id === 'players' && <span className="ml-auto text-[10px] text-slate-500">{netPlayers}</span>}
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-1.5">
          <button type="button" onClick={centreOnMe} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-sx-stroke px-2 py-1.5 hover:bg-sx-alt" title="Centre on me (C)">
            <Crosshair className="h-3.5 w-3.5" /> Me
          </button>
          <button type="button" onClick={() => zoomAt(st.current.size.W / 2, st.current.size.H / 2, 1.4)} aria-label="Zoom in" className="rounded-lg border border-sx-stroke px-2 py-1.5 hover:bg-sx-alt">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => zoomAt(st.current.size.W / 2, st.current.size.H / 2, 1 / 1.4)} aria-label="Zoom out" className="rounded-lg border border-sx-stroke px-2 py-1.5 hover:bg-sx-alt">
            <Minus className="h-3.5 w-3.5" />
          </button>
        </div>
        <ul className="mt-3 space-y-1 border-t border-sx-stroke pt-2 text-[10px] text-slate-400">
          <li><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-yellow-300" />You</li>
          <li><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-400" />Other players</li>
          <li><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-white ring-1 ring-rose-500" />Planes</li>
          <li><span className="mr-1.5 inline-block h-2 w-3 border border-dashed border-amber-400" />Reserved sites and the market</li>
        </ul>
      </aside>

      {waypoint && route && (
        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-cyan-500/40 bg-sx-panel/95 px-4 py-2.5 text-xs text-slate-100 shadow-xl backdrop-blur" data-testid="waypoint-card">
          <Flag className="h-4 w-4 text-cyan-300" />
          <div>
            <div className="font-bold text-white">Waypoint</div>
            <div className="text-[11px] text-slate-400">
              {Math.round(route.length)} units{route.onRoad ? ' along the roads' : ' as the crow flies'} · about {seconds(route.length)} on foot
            </div>
          </div>
          {autoWalk ? (
            <button type="button" onClick={() => useMap.getState().stop()} className="rounded-lg border border-sx-stroke px-3 py-1.5 font-medium hover:bg-sx-alt">
              Stop
            </button>
          ) : (
            <button type="button" onClick={() => useMap.getState().go()} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-3 py-1.5 font-bold text-white hover:brightness-110">
              <Footprints className="h-3.5 w-3.5" /> Go there
            </button>
          )}
          <button type="button" onClick={() => useMap.getState().clearWaypoint()} aria-label="Remove the waypoint" className="rounded-lg p-1.5 text-slate-300 hover:bg-sx-alt">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {card && (
        <div className="absolute z-20 w-56 rounded-xl border border-sx-line bg-sx-panel p-3 text-xs shadow-2xl" style={{ left: Math.min(card.x + 10, (st.current.size.W || 800) - 240), top: Math.min(card.y + 10, (st.current.size.H || 600) - 150) }} data-testid="map-card">
          <div className="font-bold text-white">{card.kind === 'plot' ? card.plot.title : card.mall.name}</div>
          <div className="mb-2 text-[11px] text-slate-400">{card.kind === 'plot' ? `${card.plot.owner} · ${card.plot.district}` : `Mega mall · ${card.mall.stores.length} stores`}</div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                useMap.getState().close();
                if (card.kind === 'plot') useCityStore.getState().setSelectedPlot(card.plot, 'search');
                else usePanel.getState().openMall(card.mall.id);
              }}
              className="flex-1 rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue px-2 py-1.5 font-bold text-white hover:brightness-110"
              data-testid="map-card-open"
            >
              {card.kind === 'plot' ? 'Open' : 'Open directory'}
            </button>
            <button type="button" onClick={() => { useMap.getState().setWaypoint(card.wx, card.wz); setCard(null); }} className="rounded-lg border border-sx-stroke px-2 py-1.5 text-slate-200 hover:bg-sx-alt">Waypoint</button>
            <button type="button" onClick={() => setCard(null)} aria-label="Close" className="rounded-lg px-1.5 text-slate-400 hover:text-white"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}

      {hover && (
        <div className="pointer-events-none absolute z-10 max-w-[220px] rounded-lg border border-sx-stroke bg-sx-panel/95 px-2.5 py-1.5 text-[11px] shadow-lg" style={{ left: Math.min(hover.x + 14, (st.current.size.W || 800) - 230), top: hover.y + 14 }}>
          <div className="font-bold text-white">{hover.title}</div>
          <div className="text-slate-400">{hover.owner ? `${hover.admin ? 'Admin headquarters' : hover.owner}` : 'Empty lot'} · {hover.district}</div>
          <div className="text-[10px] text-slate-500">Shift-click to open</div>
        </div>
      )}
    </div>
    </div>
  );
}
