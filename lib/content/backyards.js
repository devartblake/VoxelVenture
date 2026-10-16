// What an owner can put behind their building: a car park, a garden, a patio, a storage shed or a pool. Pure (no three.js), tested in Node and drawn by
// components/city/Crowns.jsx together with the rooftop features (same instanced shapes, so it costs no extra draw calls).
//
// The space behind a lot is whatever the streets left: 1.5 on a new street, 0.6 where two rows of the old grid back onto each other. `backRoom` measures it
// (never more than MAX_ROOM) and the items are fitted to it, so nothing ever stands on a neighbour's building.
//
// A part is { shape, pos, scale, color, fit } like a crown's, in a frame where x runs across the back of the building as a fraction of its width (-0.5 to 0.5)
// and z runs away from the back wall as a fraction of the room (0 to 1); heights are in world units. fit 'area' stretches the part over the width and the
// room, fit 'ball' keeps its proportions and only shrinks it when the room or the lot is small.
export const BACKS = [
  { id: 'none', label: 'Nothing', hint: 'Leave the back as it is' },
  { id: 'parking', label: 'Car park', hint: 'Bays and a couple of parked cars' },
  { id: 'garden', label: 'Garden', hint: 'Lawn, shrubs and a bench' },
  { id: 'patio', label: 'Patio', hint: 'Tables and umbrellas' },
  { id: 'shed', label: 'Storage', hint: 'A shed and stacked crates' },
  { id: 'pool', label: 'Pool', hint: 'A pool with a deck' },
];
export const BACK_IDS = BACKS.map((b) => b.id);
export const MIN_ROOM = 0.3;
export const MAX_ROOM = 1.6;

const SLAB = 0.04;
const slab = (color) => ({ shape: 'box', pos: [0, SLAB / 2, 0.5], scale: [1, SLAB, 1], color, fit: 'area' });
const PARTS = {
  none: [],
  parking: [
    slab('#475569'),
    { shape: 'box', pos: [-0.17, SLAB + 0.01, 0.5], scale: [0.012, 0.02, 0.9], color: '#f8fafc', fit: 'area' },
    { shape: 'box', pos: [0.17, SLAB + 0.01, 0.5], scale: [0.012, 0.02, 0.9], color: '#f8fafc', fit: 'area' },
    { shape: 'box', pos: [-0.33, SLAB + 0.07, 0.5], scale: [0.2, 0.12, 0.62], color: '#ef4444', fit: 'area' },
    { shape: 'box', pos: [0.0, SLAB + 0.07, 0.5], scale: [0.2, 0.12, 0.62], color: '#3b82f6', fit: 'area' },
  ],
  garden: [
    slab('#4ade80'),
    { shape: 'sphere', pos: [-0.36, 0.14, 0.3], scale: [0.26, 0.26, 0.26], color: '#15803d', fit: 'ball' },
    { shape: 'sphere', pos: [0.38, 0.16, 0.65], scale: [0.3, 0.3, 0.3], color: '#16a34a', fit: 'ball' },
    { shape: 'box', pos: [0, 0.07, 0.55], scale: [0.26, 0.05, 0.16], color: '#92400e', fit: 'area' },
    { shape: 'box', pos: [0, 0.03, 0.55], scale: [0.2, 0.06, 0.1], color: '#78350f', fit: 'area' },
  ],
  patio: [
    slab('#d6c4a0'),
    { shape: 'cyl', pos: [-0.25, 0.1, 0.5], scale: [0.06, 0.2, 0.06], color: '#e2e8f0', fit: 'ball' },
    { shape: 'cone', pos: [-0.25, 0.3, 0.5], scale: [0.26, 0.14, 0.26], color: 'accent', fit: 'ball' },
    { shape: 'cyl', pos: [0.25, 0.1, 0.5], scale: [0.06, 0.2, 0.06], color: '#e2e8f0', fit: 'ball' },
    { shape: 'cone', pos: [0.25, 0.3, 0.5], scale: [0.26, 0.14, 0.26], color: 'accent', fit: 'ball' },
  ],
  shed: [
    slab('#a8a29e'),
    { shape: 'box', pos: [-0.2, 0.17, 0.5], scale: [0.4, 0.3, 0.7], color: '#78716c', fit: 'area' },
    { shape: 'box', pos: [-0.2, 0.34, 0.5], scale: [0.44, 0.05, 0.76], color: '#475569', fit: 'area' },
    { shape: 'box', pos: [0.28, 0.08, 0.35], scale: [0.16, 0.12, 0.28], color: '#b45309', fit: 'area' },
    { shape: 'box', pos: [0.28, 0.2, 0.35], scale: [0.14, 0.12, 0.24], color: '#d97706', fit: 'area' },
  ],
  pool: [
    slab('#e7e5e4'),
    { shape: 'box', pos: [0, SLAB + 0.015, 0.5], scale: [0.78, 0.03, 0.7], color: '#38bdf8', fit: 'area' },
  ],
};
export const backParts = (id) => PARTS[id] ?? [];

const turned = (p) => Math.abs(Math.sin(p.yaw ?? 0)) > 0.7;
// a lot's footprint in world axes (a lot turned a quarter has its width along z)
const boxOf = (p) => {
  const w = (turned(p) ? p.d : p.w) ?? 3;
  const d = (turned(p) ? p.w : p.d) ?? 3;
  return { x0: p.x - w / 2, x1: p.x + w / 2, z0: p.z - d / 2, z1: p.z + d / 2 };
};
// the direction (in world axes) that points away from the lot's front
const backDir = (p) => {
  const yaw = p.yaw ?? 0;
  const f = p.facing ?? 1;
  return { dx: -f * Math.sin(yaw), dz: -f * Math.cos(yaw) };
};

// Free ground behind a lot: the gap between its back wall and the nearest other lot straight behind it (at most MAX_ROOM).
export function backRoom(plot, plots) {
  const me = boxOf(plot);
  const { dx, dz } = backDir(plot);
  const alongZ = Math.abs(dz) > Math.abs(dx);
  let room = MAX_ROOM;
  for (const o of plots) {
    if (o === plot || o.id === plot.id) continue;
    const b = boxOf(o);
    let gap;
    if (alongZ) {
      if (b.x1 <= me.x0 + 0.01 || b.x0 >= me.x1 - 0.01) continue; // not behind it
      gap = dz < 0 ? me.z0 - b.z1 : b.z0 - me.z1;
    } else {
      if (b.z1 <= me.z0 + 0.01 || b.z0 >= me.z1 - 0.01) continue;
      gap = dx < 0 ? me.x0 - b.x1 : b.x0 - me.x1;
    }
    if (gap >= -0.01 && gap < room) room = gap;
  }
  return Math.max(0, Math.round(room * 100) / 100);
}

// The items to draw, in the same form as crownInstances: [{ id, x, z, y, yaw, scale: 1, parts }], the part positions in the plot's own frame (turned by `yaw`,
// z along its front-to-back line with the front at +z * facing).
export function backInstances(plots, allPlots = plots) {
  const out = [];
  for (const plot of plots) {
    const cfg = plot.exterior;
    if (!plot.owner || !cfg || !cfg.back || cfg.back === 'none') continue;
    const parts = backParts(cfg.back);
    if (!parts.length) continue;
    const room = backRoom(plot, allPlots) - 0.08; // a little clear ground before the next lot
    if (room < MIN_ROOM) continue;
    const bw = plot.w ?? 3; // the building's width and depth in its own frame
    const bd = plot.d ?? 3;
    const f = plot.facing ?? 1;
    const w = Math.min(bw, 6);
    const ball = Math.min(1, room / 0.8, w / 3);
    out.push({
      id: plot.id,
      x: plot.x,
      z: plot.z,
      y: 0.1,
      yaw: plot.yaw ?? 0,
      scale: 1,
      parts: parts.map((p) => {
        const zAway = bd / 2 + 0.04 + p.pos[2] * room; // away from the back wall
        const fitted = p.fit === 'ball' ? [p.scale[0] * ball, p.scale[1] * Math.max(ball, 0.6), p.scale[2] * ball] : [p.scale[0] * w, p.scale[1], p.scale[2] * room];
        return { shape: p.shape, pos: [p.pos[0] * w, p.pos[1], -f * zAway], scale: fitted, color: p.color === 'accent' ? cfg.crownColor ?? '#fbbf24' : p.color };
      }),
    });
  }
  return out;
}
