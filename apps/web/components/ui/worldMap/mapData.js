import { buildingSize } from '@/lib/city/cityGenerator';
import { buildGrid } from '@/lib/city/spatialGrid';
import { sampleCurve } from '@/lib/city/curves';

// Everything the world map needs worked out once per city (and again when a plot changes): a grid of plots to query by area, the label positions, the
// landmarks. Drawing a frame then only touches what is in view.
export function buildMapData(layout, plots, billboards) {
  const plotRect = (p) => {
    const { bw, bd } = buildingSize(p);
    const c = Math.abs(Math.cos(p.yaw ?? 0));
    const s = Math.abs(Math.sin(p.yaw ?? 0));
    const hw = (bw * c + bd * s) / 2;
    const hd = (bw * s + bd * c) / 2;
    return { x0: p.x - hw, x1: p.x + hw, z0: p.z - hd, z1: p.z + hd };
  };
  const plotGrid = buildGrid(plots, plotRect, 24);
  // district names at the middle of their plots
  const by = new Map();
  for (const p of plots) {
    if (!p.districtId || p.designSite) continue;
    const d = by.get(p.districtId) ?? { x: 0, z: 0, n: 0 };
    d.x += p.x;
    d.z += p.z;
    d.n++;
    by.set(p.districtId, d);
  }
  const districtLabels = layout.districts
    .map((d) => ({ name: d.name, color: d.color, ...(by.get(d.id) ? { x: by.get(d.id).x / by.get(d.id).n, z: by.get(d.id).z / by.get(d.id).n } : {}), n: by.get(d.id)?.n ?? 0, id: d.id }))
    .filter((d) => d.n > 6 && ['saas', 'creator', 'bazaar', 'arcade', 'suburb'].includes(d.id));
  const roadLabels = layout.roads.filter((r) => r.name && r.labelAt !== null).map((r) => ({ name: r.name, axis: r.axis, x: r.axis === 'x' ? (r.from + r.to) / 2 : r.center, z: r.axis === 'x' ? r.center : (r.from + r.to) / 2, from: r.from, to: r.to, center: r.center, arterial: r.class === 'arterial' }));
  const landmarks = [];
  for (const m of layout.malls ?? []) landmarks.push({ kind: 'mall', name: m.name, x: m.x, z: m.z, glyph: 'M', color: '#6366f1' });
  for (const a of layout.airports ?? []) landmarks.push({ kind: 'airport', name: a.name, x: a.centre.x, z: a.centre.z, glyph: '✈', color: '#94a3b8' });
  for (const p of layout.parks ?? []) landmarks.push({ kind: 'park', name: p.name, x: p.center.x, z: p.center.z, glyph: 'P', color: '#22c55e' });
  if (layout.amusement) landmarks.push({ kind: 'amusement', name: layout.amusement.name, x: layout.amusement.gate.x, z: layout.amusement.gate.z, glyph: '🎡', color: '#f43f5e' });
  for (const l of layout.lakes ?? []) landmarks.push({ kind: 'lake', name: l.name, x: l.x, z: l.z, glyph: '~', color: '#38bdf8' });
  const river = layout.rivers?.[0];
  if (river) landmarks.push({ kind: 'river', name: river.name, x: (river.x0 + river.x1) / 2, z: (river.z0 + river.z1) / 2, glyph: '≈', color: '#38bdf8', alongX: river.axis === 'x' });
  for (const r of layout.reserved ?? []) if (r.market) landmarks.push({ kind: 'market', name: `Pop-up market ${r.code}`, x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, glyph: '$', color: '#f59e0b' });
  if (layout.hills) landmarks.push({ kind: 'hills', name: layout.hills.name ?? 'Hills', x: (layout.hills.rect.x0 + layout.hills.rect.x1) / 2, z: (layout.hills.rect.z0 + layout.hills.rect.z1) / 2, glyph: '▲', color: '#86efac' });
  for (const p of plots) if (p.admin) landmarks.push({ kind: 'hq', name: p.title, x: p.x, z: p.z, glyph: '★', color: '#22d3ee' });
  const bounds = layout.land;
  // curved streets (a curved reserved site), sampled once: [{ id, points: [[x, z]], rect }]
  const curves = (layout.curvedRoads ?? []).map((spec) => {
    const pts = sampleCurve(spec).points.filter((_, i, a) => i % 3 === 0 || i === a.length - 1).map((p) => [p.x, p.z]);
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    return { id: spec.id, points: pts, rect: { x0: Math.min(...xs) - 2, x1: Math.max(...xs) + 2, z0: Math.min(...zs) - 2, z1: Math.max(...zs) + 2 } };
  });
  return { layout, plots, billboards, plotGrid, plotRect, districtLabels, roadLabels, landmarks, bounds, curves };
}
