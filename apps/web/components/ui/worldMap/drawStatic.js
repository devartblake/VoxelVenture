import { queryGrid } from '@/lib/city/spatialGrid';
import { hillHeight, HILL_MAX } from '@/lib/city/hills';

// The still part of the world map: land, fields, water, hills, roads, plots, labels. It is drawn into an offscreen canvas that is only redrawn when the
// view has moved far or zoomed; and only what is inside the view is drawn (plots come from a grid query, everything else is tested against the view's
// rectangle). So panning is a blit, and a close-up costs the same as a wide view.
//
// view: { cx, cz, scale }: the world point at the middle of the canvas, and pixels per world unit. North is up, east is right.
const CROP = { wheat: '#7a6d3a', corn: '#547126', plough: '#4d3622', meadow: '#2f6b2c' };

export const worldRectOf = (view, W, H) => ({ x0: view.cx - W / 2 / view.scale, x1: view.cx + W / 2 / view.scale, z0: view.cz - H / 2 / view.scale, z1: view.cz + H / 2 / view.scale });
const meets = (a, b) => a.x1 >= b.x0 && a.x0 <= b.x1 && a.z1 >= b.z0 && a.z0 <= b.z1;

export function drawStatic(ctx, W, H, view, data, layers, mineOf, stats) {
  const t0 = performance.now();
  const { layout, plots, billboards } = data;
  const s = view.scale;
  const X = (x) => (x - view.cx) * s + W / 2;
  const Z = (z) => (z - view.cz) * s + H / 2;
  const view$ = worldRectOf(view, W, H);
  const inView = (r) => meets(r, view$);
  const rectPx = (r, fill, stroke, lw = 1) => {
    ctx.beginPath();
    ctx.rect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
  };
  let drawn = { plots: 0, fields: 0, trees: 0, roads: 0, labels: 0, hills: 0 };

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, W, H);
  // the land
  rectPx(layout.land, '#173a24', '#3a2c1c', 2);
  if (layout.urban) rectPx(layout.urban, '#1c2a3a', null);

  // fields and woods
  if (layers.fields && s >= 0.7) {
    for (const f of layout.fields) if (inView(f)) { rectPx(f, CROP[f.crop] ?? '#2f6b2c', null); drawn.fields++; }
    if (s >= 2.2) {
      ctx.fillStyle = '#15803d';
      const r = Math.max(1.2, 0.35 * s);
      for (const t of layout.woods) {
        if (t.x < view$.x0 || t.x > view$.x1 || t.z < view$.z0 || t.z > view$.z1) continue;
        ctx.beginPath();
        ctx.arc(X(t.x), Z(t.z), r, 0, Math.PI * 2);
        ctx.fill();
        drawn.trees++;
      }
    }
  }

  // water
  for (const river of layout.rivers) if (inView(river)) rectPx(river, '#1d4ed8', '#38bdf8');
  for (const l of layout.lakes) {
    const r = { x0: l.x - l.rx, x1: l.x + l.rx, z0: l.z - l.rz, z1: l.z + l.rz };
    if (inView(r)) rectPx(r, '#1d4ed8', '#38bdf8');
  }

  // the hills: the ground's height, in squares of green
  if (layout.hills && inView(layout.hills.rect) && s >= 0.9) {
    const step = Math.max(1.5, 3 / Math.max(1, s / 3));
    const r = layout.hills.rect;
    for (let x = Math.max(r.x0, view$.x0); x < Math.min(r.x1, view$.x1); x += step) {
      for (let z = Math.max(r.z0, view$.z0); z < Math.min(r.z1, view$.z1); z += step) {
        const h = hillHeight(layout.hills, x + step / 2, z + step / 2);
        if (h < 0.05) continue;
        const k = h / HILL_MAX;
        ctx.fillStyle = `rgb(${Math.round(40 + 90 * k)}, ${Math.round(100 + 90 * k)}, ${Math.round(50 + 40 * k)})`;
        ctx.fillRect(X(x), Z(z), step * s + 0.6, step * s + 0.6);
        drawn.hills++;
      }
    }
  }

  // parks
  for (const p of layout.parks) {
    const r = { x0: p.center.x - p.width / 2, x1: p.center.x + p.width / 2, z0: p.center.z - p.depth / 2, z1: p.center.z + p.depth / 2 };
    if (inView(r)) rectPx(r, '#15803d', '#22c55e');
  }

  // the amusement park
  if (layout.amusement && inView(layout.amusement.rect)) rectPx(layout.amusement.rect, '#9f1239', '#f43f5e');

  // roads: a casing and the road, wider as you zoom in; a dashed centre line close up
  ctx.lineCap = 'butt';
  const roadPx = (r) => Math.max(1.4, (r.class === 'arterial' ? 3.4 : 2.7) * s);
  const roadRect = (r) => (r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - 1.5, z1: r.center + 1.5 } : { x0: r.center - 1.5, x1: r.center + 1.5, z0: r.from, z1: r.to });
  for (const pass of [0, 1]) {
    for (const r of layout.roads) {
      if (!inView(roadRect(r))) continue;
      const w = roadPx(r);
      ctx.lineWidth = pass === 0 ? w + 1.6 : w;
      ctx.strokeStyle = pass === 0 ? '#0f172a' : r.kind === 'avenue' ? r.color : r.class === 'arterial' ? '#cbd5e1' : '#64748b';
      ctx.globalAlpha = pass === 0 ? 1 : r.class === 'arterial' ? 1 : 0.85;
      ctx.beginPath();
      if (r.axis === 'x') { ctx.moveTo(X(r.from), Z(r.center)); ctx.lineTo(X(r.to), Z(r.center)); } else { ctx.moveTo(X(r.center), Z(r.from)); ctx.lineTo(X(r.center), Z(r.to)); }
      ctx.stroke();
      if (pass === 1) drawn.roads++;
    }
  }
  ctx.globalAlpha = 1;
  for (const d of layout.diagonals ?? []) {
    ctx.lineWidth = Math.max(1.6, 3.2 * s);
    ctx.strokeStyle = '#f43f5e';
    ctx.beginPath();
    ctx.moveTo(X(d.p0.x), Z(d.p0.z));
    ctx.lineTo(X(d.p1.x), Z(d.p1.z));
    ctx.stroke();
  }
  for (const cv of data.curves ?? []) {
    if (!meets(cv.rect, view$)) continue;
    for (const pass of [0, 1]) {
      ctx.lineWidth = pass === 0 ? Math.max(1.6, 2.7 * s) + 1.6 : Math.max(1.6, 2.7 * s);
      ctx.strokeStyle = pass === 0 ? '#0f172a' : '#94a3b8';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      cv.points.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
      ctx.stroke();
    }
    drawn.roads++;
  }
  if (s >= 4) {
    // dashed centre lines
    ctx.setLineDash([Math.max(3, 1.4 * s), Math.max(3, 1.4 * s)]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.55)';
    for (const r of layout.roads) {
      if (!inView(roadRect(r))) continue;
      ctx.beginPath();
      if (r.axis === 'x') { ctx.moveTo(X(r.from), Z(r.center)); ctx.lineTo(X(r.to), Z(r.center)); } else { ctx.moveTo(X(r.center), Z(r.from)); ctx.lineTo(X(r.center), Z(r.to)); }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // roundabouts
  for (const i of layout.intersections) {
    if (i.control !== 'circle' || i.x < view$.x0 - 5 || i.x > view$.x1 + 5 || i.z < view$.z0 - 5 || i.z > view$.z1 + 5) continue;
    ctx.fillStyle = '#1f2937';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(X(i.x), Z(i.z), Math.max(2.5, i.circle.outer * 0.9 * s), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // plots: only the ones in view, from the grid
  const visible = queryGrid(data.plotGrid, view$);
  const footprints = s >= 1.1;
  for (const p of visible) {
    const r = data.plotRect(p);
    const mine = mineOf(p);
    if (!p.owner && !footprints) continue;
    const fill = p.owner ? (p.admin ? '#22d3ee' : p.color) : p.luxury ? '#2e1065' : p.prime ? '#3b2f12' : '#1e293b';
    if (footprints) rectPx(r, fill, mine ? '#facc15' : p.grand ? '#fde68a' : p.luxury ? '#c084fc' : p.prime ? '#fbbf24' : null, mine ? 2 : 1);
    else {
      ctx.fillStyle = fill;
      ctx.fillRect(X(p.x) - 1, Z(p.z) - 1, 2.4, 2.4);
    }
    drawn.plots++;
  }

  // airports, malls, the reserved sites
  for (const a of layout.airports ?? []) {
    if (inView(a.rect)) { rectPx(a.apron, '#6b7280', null); rectPx(a.runway, '#e5e7eb', null); rectPx(a.terminal ? { x0: a.terminal.x - a.terminal.w / 2, x1: a.terminal.x + a.terminal.w / 2, z0: a.terminal.z - a.terminal.d / 2, z1: a.terminal.z + a.terminal.d / 2 } : a.apron, '#cbd5e1', null); }
  }
  for (const m of layout.malls ?? []) {
    const hw = (m.w * Math.abs(Math.cos(m.yaw)) + m.d * Math.abs(Math.sin(m.yaw))) / 2;
    const hd = (m.w * Math.abs(Math.sin(m.yaw)) + m.d * Math.abs(Math.cos(m.yaw))) / 2;
    const r = { x0: m.x - hw, x1: m.x + hw, z0: m.z - hd, z1: m.z + hd };
    if (inView(r)) rectPx(r, '#6366f1', '#c7d2fe');
  }
  ctx.setLineDash([4, 3]);
  for (const a of layout.reserved ?? []) if (inView(a)) rectPx(a, a.market ? 'rgba(245, 158, 11, 0.28)' : 'rgba(245, 158, 11, 0.1)', '#f59e0b', 1.3);
  ctx.setLineDash([]);
  if (s >= 3) {
    ctx.lineWidth = Math.max(2, 0.5 * s);
    for (const b of billboards) {
      if (b.kind === 'banner' || b.x < view$.x0 || b.x > view$.x1 || b.z < view$.z0 || b.z > view$.z1) continue;
      const across = b.yaw ? [0, b.width / 2] : [b.width / 2, 0];
      ctx.strokeStyle = b.ad ? '#818cf8' : '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(X(b.x - across[0]), Z(b.z - across[1]));
      ctx.lineTo(X(b.x + across[0]), Z(b.z + across[1]));
      ctx.stroke();
    }
  }

  // ---- labels, with the ones that would overlap left out
  const taken = [];
  const text = (str, x, y, { size = 11, color = '#e2e8f0', weight = 600, rot = 0, halo = '#0b1020', pad = 2, always = false } = {}) => {
    ctx.font = `${weight} ${size}px system-ui, sans-serif`;
    const w = ctx.measureText(str).width;
    const box = rot ? { x0: x - size / 2 - pad, x1: x + size / 2 + pad, y0: y - w / 2 - pad, y1: y + w / 2 + pad } : { x0: x - w / 2 - pad, x1: x + w / 2 + pad, y0: y - size / 2 - pad, y1: y + size / 2 + pad };
    if (box.x1 < 0 || box.x0 > W || box.y1 < 0 || box.y0 > H) return false;
    if (!always && taken.some((b) => b.x0 < box.x1 && b.x1 > box.x0 && b.y0 < box.y1 && b.y1 > box.y0)) return false;
    taken.push(box);
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = halo;
    ctx.lineJoin = 'round';
    ctx.strokeText(str, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(str, 0, 0);
    ctx.restore();
    drawn.labels++;
    return true;
  };
  // landmarks first (they win), then districts, roads, buildings
  if (layers.landmarks) {
    for (const lm of data.landmarks) {
      if (lm.x < view$.x0 - 20 || lm.x > view$.x1 + 20 || lm.z < view$.z0 - 20 || lm.z > view$.z1 + 20) continue;
      const x = X(lm.x);
      const y = Z(lm.z);
      const r = Math.max(7, Math.min(11, 4 + s));
      ctx.fillStyle = lm.color;
      ctx.strokeStyle = '#0b1020';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = `700 ${r + 1}px system-ui, sans-serif`;
      ctx.fillStyle = '#0b1020';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lm.glyph, x, y + 0.5);
      taken.push({ x0: x - r, x1: x + r, y0: y - r, y1: y + r });
      if (s >= 0.9) text(lm.name, x, y + r + 8, { size: 11, color: '#f8fafc', always: true });
    }
  }
  if (layers.districts && s < 5) {
    for (const d of data.districtLabels) text(d.name.toUpperCase(), X(d.x), Z(d.z), { size: Math.max(12, Math.min(28, 7 * s)), color: `${d.color}cc`, weight: 800, halo: 'rgba(11, 16, 32, 0.9)' });
  }
  if (layers.roads && s >= 2.2) {
    for (const r of data.roadLabels) {
      // the stretch of the road that is in view, labelled in its middle
      const a = Math.max(r.from, r.axis === 'x' ? view$.x0 : view$.z0);
      const b = Math.min(r.to, r.axis === 'x' ? view$.x1 : view$.z1);
      if (b - a < 12) continue;
      const mid = (a + b) / 2;
      if (r.axis === 'x') { if (r.center < view$.z0 || r.center > view$.z1) continue; text(r.name, X(mid), Z(r.center), { size: Math.min(13, 8 + s * 0.5), color: '#e2e8f0', halo: 'rgba(15, 23, 42, 0.95)' }); } else { if (r.center < view$.x0 || r.center > view$.x1) continue; text(r.name, X(r.center), Z(mid), { size: Math.min(13, 8 + s * 0.5), color: '#e2e8f0', rot: -Math.PI / 2, halo: 'rgba(15, 23, 42, 0.95)' }); }
    }
  }
  if (layers.buildings && s >= 6) {
    for (const p of visible) if (p.owner && p.title) text(p.title.length > 22 ? `${p.title.slice(0, 21)}…` : p.title, X(p.x), Z(p.z), { size: Math.min(12, 6 + s * 0.5), color: '#f1f5f9', weight: 500, halo: 'rgba(11, 16, 32, 0.9)' });
  }
  stats.staticMs = performance.now() - t0;
  stats.drawn = drawn;
  stats.plotsInView = visible.length;
  stats.plotsTotal = plots.length;
  stats.redraws = (stats.redraws ?? 0) + 1;
}
