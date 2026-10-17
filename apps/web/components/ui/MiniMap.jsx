"use client";

import { useMap } from '@/lib/state/mapStore';
import React, { useEffect, useRef } from 'react';
import { avatarState } from '@/lib/sim/avatarState';
import { buildingSize } from '@/lib/city/cityGenerator';
import { create } from 'zustand';
import { useCityStore } from '@/lib/state/store';
import { useView } from '@/lib/state/viewStore';
import { dailyChest, plotOfTheDay } from '@/lib/game/daily';
import { sampleCurve } from '@/lib/city/curves';
import { flightClock, flightPlanFor, flightState } from '@/lib/sim/flight';

const REDRAW_MS = 110; // the whole-city map
const FOLLOW_REDRAW_MS = 33; // the following map: smooth while you walk
// How many world units the following map shows from its centre to its rim: close, around, and wide.
export const ZOOMS = [{ reach: 26, label: 'Close' }, { reach: 55, label: 'Around' }, { reach: 120, label: 'Wide' }];
const ZOOM_KEY = 'voxelventure-map-zoom';
const readZoom = () => {
  try {
    const n = Number(localStorage.getItem(ZOOM_KEY));
    return Number.isInteger(n) && n >= 0 && n < ZOOMS.length ? n : 0;
  } catch {
    return 0;
  }
};
export const useMapZoom = create((set, get) => ({
  level: 0,
  hydrate: () => set({ level: readZoom() }),
  zoom: (by) => {
    const level = Math.min(ZOOMS.length - 1, Math.max(0, get().level + by));
    set({ level });
    try {
      localStorage.setItem(ZOOM_KEY, String(level));
    } catch {
      /* the choice is not remembered */
    }
  },
}));
const curveCache = new WeakMap(); // spec -> sampled curve, so the map doesn't re-sample every redraw
const sampled = (spec) => {
  if (!curveCache.has(spec)) curveCache.set(spec, sampleCurve(spec));
  return curveCache.get(spec);
};

// A round, top-down map. Two ways to draw it:
//   follow   (the corner map) centred on the avatar, close, and turned so "up" on the map is "up" on your screen: it turns with the camera, the way the
//            compass does. How close is set with the + and - beside it. Redrawn about 30 times a second so it glides as you walk.
//   whole city (the map in the city guide) the whole city fitted in the circle, turned 45 degrees to match the isometric view.
// Everything is drawn straight from the store, so claims, ads and the avatar stay current without re-rendering React.
export default function MiniMap({ size = 168, follow = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const radius = size / 2;

    function draw(time) {
      const { layout, plots, billboards, day, daily } = useCityStore.getState();
      let cx = layout.center.x;
      let cz = layout.center.z;
      let scale;
      let heading = 315; // degrees clockwise from north that "up" on the map points to: the isometric view looks north-west
      if (follow) {
        // centred on the avatar (the city's middle until it has appeared), close, turned to the real camera
        if (avatarState.ready) {
          cx = avatarState.x;
          cz = avatarState.z;
        }
        heading = useView.getState().heading ?? 315;
        scale = (radius - 5) / ZOOMS[useMapZoom.getState().level].reach;
      } else {
        // Fit the farthest thing (road ends, billboards) inside the circle.
        let reach = 10;
        for (const r of layout.roads) {
          const ends = r.axis === 'x' ? [[r.from, r.center], [r.to, r.center]] : [[r.center, r.from], [r.center, r.to]];
          for (const [x, z] of ends) reach = Math.max(reach, Math.hypot(x - cx, z - cz));
        }
        for (const b of billboards) if (b.kind !== 'banner') reach = Math.max(reach, Math.hypot(b.x - cx, b.z - cz));
        for (const l of layout.lakes) reach = Math.max(reach, Math.hypot(l.x - cx, l.z - cz) + Math.max(l.rx, l.rz));
        for (const [x, z] of [[layout.land.x0, layout.land.z0], [layout.land.x1, layout.land.z0], [layout.land.x0, layout.land.z1], [layout.land.x1, layout.land.z1]]) reach = Math.max(reach, Math.hypot(x - cx, z - cz) * 0.8);
        for (const a of layout.reserved) for (const [x, z] of [[a.x0, a.z0], [a.x1, a.z0], [a.x0, a.z1], [a.x1, a.z1]]) reach = Math.max(reach, Math.hypot(x - cx, z - cz));
        scale = (radius - 5) / (reach + 1);
      }

      // World coordinates -> map pixels: "up" on the map is the way the camera looks (f), "right" is its right-hand side (r).
      const hr = (heading * Math.PI) / 180;
      const fx = Math.sin(hr);
      const fz = -Math.cos(hr);
      const rx = Math.cos(hr);
      const rz = Math.sin(hr);
      const px = (x, z) => radius + ((x - cx) * rx + (z - cz) * rz) * scale;
      const py = (x, z) => radius - ((x - cx) * fx + (z - cz) * fz) * scale;
      const poly = (points, fill, stroke) => {
        ctx.beginPath();
        points.forEach(([x, z], i) => (i ? ctx.lineTo(px(x, z), py(x, z)) : ctx.moveTo(px(x, z), py(x, z))));
        ctx.closePath();
        if (fill) {
          ctx.fillStyle = fill;
          ctx.fill();
        }
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.stroke();
        }
      };
      const rect = (x, z, hw, hd) => [[x - hw, z - hd], [x + hw, z - hd], [x + hw, z + hd], [x - hw, z + hd]];

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(0, 0, size, size);

      // The land and the built-up area, under everything; fields and woods in the country
      poly([[layout.land.x0, layout.land.z0], [layout.land.x1, layout.land.z0], [layout.land.x1, layout.land.z1], [layout.land.x0, layout.land.z1]], '#173a24', '#3a2c1c');
      const u = layout.urban;
      if (u) poly([[u.x0, u.z0], [u.x1, u.z0], [u.x1, u.z1], [u.x0, u.z1]], '#1e2a3a', null);
      for (const f of layout.fields) poly([[f.x0, f.z0], [f.x1, f.z0], [f.x1, f.z1], [f.x0, f.z1]], f.crop === 'wheat' ? '#7a6d3a' : f.crop === 'corn' ? '#547126' : f.crop === 'plough' ? '#4d3622' : '#2f6b2c', null);
      for (const river of layout.rivers) {
        poly([[river.x0, river.z0], [river.x1, river.z0], [river.x1, river.z1], [river.x0, river.z1]], '#1d4ed8', '#38bdf8');
      }

      // Roads
      ctx.lineCap = 'round';
      for (const r of layout.roads) {
        const a = r.axis === 'x' ? [r.from, r.center] : [r.center, r.from];
        const b = r.axis === 'x' ? [r.to, r.center] : [r.center, r.to];
        const arterial = r.class === 'arterial';
        ctx.globalAlpha = arterial ? 0.95 : 0.55;
        ctx.lineWidth = arterial ? 3 : 2;
        ctx.strokeStyle = r.kind === 'avenue' ? r.color : arterial ? '#cbd5e1' : '#64748b';
        ctx.beginPath();
        ctx.moveTo(px(a[0], a[1]), py(a[0], a[1]));
        ctx.lineTo(px(b[0], b[1]), py(b[0], b[1]));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Ponds
      for (const l of layout.lakes) {
        if (l.shape === 'rect') {
          poly([[l.x - l.rx, l.z - l.rz], [l.x + l.rx, l.z - l.rz], [l.x + l.rx, l.z + l.rz], [l.x - l.rx, l.z + l.rz]], '#1d4ed8', '#38bdf8');
          continue;
        }
        const c = Math.cos(l.yaw);
        const s = Math.sin(l.yaw);
        const outline = Array.from({ length: 28 }, (_, i) => {
          const t = (i / 28) * Math.PI * 2;
          const lx = Math.cos(t) * l.rx;
          const lz = Math.sin(t) * l.rz;
          return [l.x + lx * c + lz * s, l.z - lx * s + lz * c];
        });
        poly(outline, '#1d4ed8', '#38bdf8');
      }

      // Reserved land: a dashed amber outline
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#f59e0b';
      for (const a of layout.reserved) poly([[a.x0, a.z0], [a.x1, a.z0], [a.x1, a.z1], [a.x0, a.z1]], 'rgba(245, 158, 11, 0.12)', '#f59e0b');
      ctx.restore();

      // The two malls
      for (const m of layout.malls ?? []) {
        const c = Math.abs(Math.cos(m.yaw));
        const sn = Math.abs(Math.sin(m.yaw));
        const hw = (m.w * c + m.d * sn) / 2;
        const hd = (m.w * sn + m.d * c) / 2;
        poly([[m.x - hw, m.z - hd], [m.x + hw, m.z - hd], [m.x + hw, m.z + hd], [m.x - hw, m.z + hd]], '#6366f1', '#c7d2fe');
      }

      // Curved roads
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#94a3b8';
      for (const spec of layout.curvedRoads) {
        ctx.beginPath();
        sampled(spec).points.forEach((pt, i) => (i ? ctx.lineTo(px(pt.x, pt.z), py(pt.x, pt.z)) : ctx.moveTo(px(pt.x, pt.z), py(pt.x, pt.z))));
        ctx.stroke();
      }

      // The diagonal avenue and the circles
      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#f43f5e';
      for (const d of layout.diagonals) {
        ctx.beginPath();
        ctx.moveTo(px(d.p0.x, d.p0.z), py(d.p0.x, d.p0.z));
        ctx.lineTo(px(d.p1.x, d.p1.z), py(d.p1.x, d.p1.z));
        ctx.stroke();
      }
      ctx.lineWidth = 1.5;
      for (const i of layout.intersections) {
        if (i.control !== 'circle') continue;
        ctx.strokeStyle = '#e2e8f0';
        ctx.fillStyle = '#1f2937';
        ctx.beginPath();
        ctx.arc(px(i.x, i.z), py(i.x, i.z), Math.max(2.5, i.circle.outer * 0.85 * scale), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Amusement park
      if (layout.amusement) {
        const a = layout.amusement.rect;
        poly([[a.x0, a.z0], [a.x1, a.z0], [a.x1, a.z1], [a.x0, a.z1]], '#9f1239', '#f43f5e');
      }

      // Park
      for (const park of layout.parks) {
        poly(
          [
            [park.center.x - park.width / 2, park.center.z - park.depth / 2],
            [park.center.x + park.width / 2, park.center.z - park.depth / 2],
            [park.center.x + park.width / 2, park.center.z + park.depth / 2],
            [park.center.x - park.width / 2, park.center.z + park.depth / 2],
          ],
          '#15803d',
          '#22c55e'
        );
      }

      // Plots: solid = claimed, dim = empty lot
      for (const p of plots) {
        const size = buildingSize(p);
        const corners = rect(p.x, p.z, size.bw / 2, size.bd / 2);
        // prime plots get a gold outline, so you can spot the big ones
        if (p.prime) ctx.lineWidth = 1.2;
        poly(corners, p.owner ? p.color : p.luxury ? '#2e1065' : p.prime ? '#3b2f12' : '#1e293b', p.grand ? '#fde68a' : p.luxury ? '#c084fc' : p.prime ? '#fbbf24' : null);
      }

      // The waypoint you set on the world map, and the road route to it
      const { route: wpRoute, waypoint: wp } = useMap.getState();
      if (wpRoute) {
        ctx.lineJoin = 'round';
        for (const [w, c] of [[4.5, 'rgba(8, 47, 73, 0.9)'], [2.2, '#22d3ee']]) {
          ctx.lineWidth = w;
          ctx.strokeStyle = c;
          if (c === '#22d3ee') ctx.setLineDash([5, 4]);
          ctx.beginPath();
          wpRoute.points.forEach((pt, i) => (i ? ctx.lineTo(px(pt.x, pt.z), py(pt.x, pt.z)) : ctx.moveTo(px(pt.x, pt.z), py(pt.x, pt.z))));
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      if (wp) {
        ctx.fillStyle = '#22d3ee';
        ctx.strokeStyle = '#082f49';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px(wp.x, wp.z), py(wp.x, wp.z), 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Today: a gold ring on the Plot of the Day, and a gold dot where the daily chest is
      if (day) {
        const potd = plotOfTheDay(plots, layout.seed, day);
        if (potd) {
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px(potd.x, potd.z), py(potd.x, potd.z), 4.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (daily.chestDay !== day) {
          const chest = dailyChest(layout.intersections, layout.seed, day);
          if (chest) {
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.arc(px(chest.x, chest.z), py(chest.x, chest.z), 2.8 + Math.sin(time / 300) * 0.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Billboards: a bar across the screen, indigo when taken, amber when open
      ctx.lineWidth = 3;
      for (const b of billboards) {
        if (b.kind === 'banner') continue;
        const across = b.yaw ? [0, b.width / 2] : [b.width / 2, 0];
        ctx.strokeStyle = b.ad ? '#818cf8' : '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(px(b.x - across[0], b.z - across[1]), py(b.x - across[0], b.z - across[1]));
        ctx.lineTo(px(b.x + across[0], b.z + across[1]), py(b.x + across[0], b.z + across[1]));
        ctx.stroke();
      }

      // Airports: a grey runway and apron, and the planes as white dots (a ring while a banner is out)
      for (const a of layout.airports ?? []) {
        poly([[a.apron.x0, a.apron.z0], [a.apron.x1, a.apron.z0], [a.apron.x1, a.apron.z1], [a.apron.x0, a.apron.z1]], '#6b7280', null);
        poly([[a.runway.x0, a.runway.z0], [a.runway.x1, a.runway.z0], [a.runway.x1, a.runway.z1], [a.runway.x0, a.runway.z1]], '#e5e7eb', null);
      }
      if ((layout.airports ?? []).length >= 2) {
        const plan = flightPlanFor(layout, plots);
        for (let i = 0; i < plan.planes.length; i++) {
          const f = flightState(plan, i, flightClock());
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px(f.x, f.z), py(f.x, f.z), f.towing ? 3.2 : 2.2, 0, Math.PI * 2);
          ctx.fill();
          if (f.towing) ctx.stroke();
        }
      }

      // The avatar: a pulsing ring and an arrow pointing the way it faces
      if (avatarState.ready) {
        const ax = px(avatarState.x, avatarState.z);
        const ay = py(avatarState.x, avatarState.z);
        const pulse = 4.5 + Math.sin(time / 260) * 1.2;
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ax, ay, pulse + 2, 0, Math.PI * 2);
        ctx.stroke();

        const dx = Math.sin(avatarState.yaw);
        const dz = Math.cos(avatarState.yaw);
        // the heading in map pixels: along r for screen-right, along -f for screen-down (y is flipped)
        const hx = dx * rx + dz * rz;
        const hy = -(dx * fx + dz * fz);
        const angle = Math.atan2(hy, hx);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(ax + Math.cos(angle) * 6, ay + Math.sin(angle) * 6);
        ctx.lineTo(ax + Math.cos(angle + 2.5) * 4.5, ay + Math.sin(angle + 2.5) * 4.5);
        ctx.lineTo(ax + Math.cos(angle - 2.5) * 4.5, ay + Math.sin(angle - 2.5) * 4.5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Rim, and a red N where world north is
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#475569';
      ctx.beginPath();
      ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2);
      ctx.stroke();
      // (north is -z, so on the map it lies along (0, -1))
      const northX = radius + (0 * rx + -1 * rz) * (radius - 9);
      const northY = radius - (0 * fx + -1 * fz) * (radius - 9);
      ctx.font = `bold ${Math.max(9, Math.round(size / 14))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(11, 16, 32, 0.8)';
      ctx.beginPath();
      ctx.arc(northX, northY, Math.max(6, size / 22), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f87171';
      ctx.fillText('N', northX, northY + 0.5);
    }

    let frame;
    let last = -Infinity;
    const loop = (time) => {
      if (time - last >= (follow ? FOLLOW_REDRAW_MS : REDRAW_MS)) {
        last = time;
        draw(time);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [size, follow]);

  return <canvas ref={canvasRef} style={{ width: size, height: size }} className="block rounded-full" aria-label={follow ? 'Mini-map, following you' : 'City map'} />;
}
