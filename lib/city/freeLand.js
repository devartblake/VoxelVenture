// Free land: where on the map nothing stands (no road, plot, billboard, park, water, airport or hills) and a street with plots could go.
// Pure geometry on rectangles, so it is tested in Node and used by the generator's infill planner (lib/city/infill.js) and by the /land page.
//
// A rectangle is { x0, x1, z0, z1 }. Everything that is in the way is a list of rectangles (the generator's `obstacleRects`).

// A grid of buckets over the obstacles, so "does anything touch this rectangle?" looks at a few obstacles, not all of them.
export class RectIndex {
  constructor(rects = [], tile = 8) {
    this.tile = tile;
    this.buckets = new Map();
    this.all = [];
    for (const r of rects) this.add(r);
  }

  add(r) {
    this.all.push(r);
    const t = this.tile;
    for (let i = Math.floor(r.x0 / t); i <= Math.floor(r.x1 / t); i++) {
      for (let j = Math.floor(r.z0 / t); j <= Math.floor(r.z1 / t); j++) {
        const key = `${i},${j}`;
        const list = this.buckets.get(key);
        if (list) list.push(r);
        else this.buckets.set(key, [r]);
      }
    }
  }

  // true when some obstacle overlaps `q` by more than `eps` in both directions (touching edges do not count)
  hits(q, eps = 0.02) {
    const t = this.tile;
    for (let i = Math.floor(q.x0 / t); i <= Math.floor(q.x1 / t); i++) {
      for (let j = Math.floor(q.z0 / t); j <= Math.floor(q.z1 / t); j++) {
        const list = this.buckets.get(`${i},${j}`);
        if (!list) continue;
        for (const o of list) if (Math.min(q.x1, o.x1) - Math.max(q.x0, o.x0) > eps && Math.min(q.z1, o.z1) - Math.max(q.z0, o.z0) > eps) return true;
      }
    }
    return false;
  }
}

// How many lots a free area holds once streets are cut through it. Lots on the new streets stand back from the street, are spaced 5 apart along it and
// have a yard behind (lib/city/infill.js: LOTS): a street with its two rows takes about 14.8 across and 5 along per pair of lots, so about 0.027 lots per
// square unit; a quarter is lost to junctions, corners and keeping clear of what is round it.
export const PLOTS_PER_AREA = 0.027;
export const capacityOf = (area) => Math.floor(area * PLOTS_PER_AREA * 0.75);

// The free zones inside `bounds`: connected stretches of ground with nothing on them, found on a grid of `cell` units. A cell is free when no obstacle,
// grown by `clear`, touches it. Returns { zones, grid } where each zone is { id, area, cells, rect (its bounding box), capacity } largest first, and
// grid is { x0, z0, cell, nx, nz, label } (label = zone index + 1 for each cell, 0 for ground that is taken), for drawing a map.
export function freeZones(rects, bounds, { cell = 2, clear = 0.6, minArea = 40 } = {}) {
  const index = rects instanceof RectIndex ? rects : new RectIndex(rects);
  const nx = Math.max(1, Math.ceil((bounds.x1 - bounds.x0) / cell));
  const nz = Math.max(1, Math.ceil((bounds.z1 - bounds.z0) / cell));
  const free = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const q = { x0: bounds.x0 + i * cell - clear, x1: bounds.x0 + (i + 1) * cell + clear, z0: bounds.z0 + j * cell - clear, z1: bounds.z0 + (j + 1) * cell + clear };
      free[j * nx + i] = index.hits(q) ? 0 : 1;
    }
  }
  const label = new Int32Array(nx * nz);
  const zones = [];
  const stack = [];
  for (let start = 0; start < free.length; start++) {
    if (!free[start] || label[start]) continue;
    const id = zones.length + 1;
    let count = 0;
    let i0 = nx;
    let i1 = 0;
    let j0 = nz;
    let j1 = 0;
    stack.push(start);
    label[start] = id;
    while (stack.length) {
      const k = stack.pop();
      const i = k % nx;
      const j = (k - i) / nx;
      count++;
      if (i < i0) i0 = i;
      if (i > i1) i1 = i;
      if (j < j0) j0 = j;
      if (j > j1) j1 = j;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const n = b * nx + a;
        if (free[n] && !label[n]) {
          label[n] = id;
          stack.push(n);
        }
      }
    }
    zones.push({ id, cells: count, area: count * cell * cell, rect: { x0: bounds.x0 + i0 * cell, x1: bounds.x0 + (i1 + 1) * cell, z0: bounds.z0 + j0 * cell, z1: bounds.z0 + (j1 + 1) * cell } });
  }
  const kept = zones.filter((z) => z.area >= minArea).sort((a, b) => b.area - a.area);
  const remap = new Map(kept.map((z, n) => [z.id, n + 1]));
  for (let k = 0; k < label.length; k++) label[k] = remap.get(label[k]) ?? 0;
  kept.forEach((z, n) => {
    z.id = n + 1;
    z.capacity = capacityOf(z.area);
  });
  return { zones: kept, grid: { x0: bounds.x0, z0: bounds.z0, cell, nx, nz, label } };
}

// Totals for a list of zones: how much ground is free and how many plots it could hold.
export const summarizeZones = (zones) => ({ count: zones.length, area: zones.reduce((s, z) => s + z.area, 0), capacity: zones.reduce((s, z) => s + z.capacity, 0) });

// Everything that is in the way, as rectangles, read from a finished city ({ plots, billboards, layout }): the same things the generator keeps new
// lots clear of. Roads count as their 2.8 wide corridor.
export function cityRects(city) {
  const { plots, billboards = [], layout } = city;
  const rects = [];
  const around = (x, z, hw, hd) => ({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });
  for (const r of layout.roads) {
    rects.push(r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - 1.4, z1: r.center + 1.4 } : { x0: r.center - 1.4, x1: r.center + 1.4, z0: r.from, z1: r.to });
  }
  for (const p of plots) {
    const c = Math.abs(Math.cos(p.yaw ?? 0));
    const s = Math.abs(Math.sin(p.yaw ?? 0));
    rects.push(around(p.x, p.z, (p.w * c + p.d * s) / 2, (p.w * s + p.d * c) / 2));
  }
  for (const b of billboards) if (b.kind !== 'banner') rects.push(b.yaw ? around(b.x, b.z, 0.9, b.width / 2 + 0.3) : around(b.x, b.z, b.width / 2 + 0.3, 0.9));
  for (const pk of layout.parks) rects.push(around(pk.center.x, pk.center.z, pk.width / 2, pk.depth / 2));
  for (const a of layout.reserved) rects.push({ x0: a.x0 - 1, x1: a.x1 + 1, z0: a.z0 - 1, z1: a.z1 + 1 });
  for (const m of layout.malls) rects.push(m.rect);
  for (const l of layout.lakes) rects.push(around(l.x, l.z, l.rx + 1.3, l.rz + 1.3));
  for (const r of layout.rivers) rects.push({ x0: r.x0 - 1.6, x1: r.x1 + 1.6, z0: r.z0 - 1.6, z1: r.z1 + 1.6 });
  for (const a of layout.airports) rects.push(a.rect);
  if (layout.hills?.rect) rects.push(layout.hills.rect);
  if (layout.amusement) rects.push(layout.amusement.keepClear ?? layout.amusement.rect);
  for (const w of layout.promenades ?? []) rects.push(w.rect);
  for (const p of layout.piers ?? []) {
    rects.push({ x0: p.x0 - 0.6, x1: p.x1 + 0.6, z0: p.z0 - 0.6, z1: p.z1 + 0.6 });
    if (p.plaza) rects.push(p.plaza);
  }
  for (const i of layout.intersections) if (i.circle) rects.push(around(i.x, i.z, i.circle.clear, i.circle.clear));
  for (const d of layout.diagonals) for (let t = 0; t <= d.length; t += 1.2) rects.push(around(d.p0.x + d.dir[0] * t, d.p0.z + d.dir[1] * t, 1.5, 1.5));
  for (const c of layout.curvedRoads ?? []) for (const p of c.polyline ?? []) rects.push(around(p.x, p.z, 2, 2));
  return rects;
}

// The free ground inside `bounds` as a list of rectangles, for drawing it as lawn: ground that nothing stands on, found on a grid of `cell` units (a cell counts when
// no obstacle, grown by `clear`, touches it), with the cells joined into as few rectangles as possible (runs along x, joined down z when they line up).
// Returns [{ x0, x1, z0, z1 }] with every rectangle at least `minArea` square units and `cell` wide.
export function lawnRects(rects, bounds, { cell = 2, clear = 0.4, minArea = 8 } = {}) {
  const index = rects instanceof RectIndex ? rects : new RectIndex(rects);
  const nx = Math.max(1, Math.floor((bounds.x1 - bounds.x0) / cell));
  const nz = Math.max(1, Math.floor((bounds.z1 - bounds.z0) / cell));
  const out = [];
  let open = new Map(); // "i0-i1" -> the rectangle being grown down the rows: { i0, i1, j0, j1 }
  const finish = (r) => {
    const q = { x0: bounds.x0 + r.i0 * cell, x1: bounds.x0 + (r.i1 + 1) * cell, z0: bounds.z0 + r.j0 * cell, z1: bounds.z0 + (r.j1 + 1) * cell };
    if ((q.x1 - q.x0) * (q.z1 - q.z0) >= minArea) out.push(q);
  };
  for (let j = 0; j < nz; j++) {
    const next = new Map();
    let i = 0;
    while (i < nx) {
      const q = (a) => ({ x0: bounds.x0 + a * cell - clear, x1: bounds.x0 + (a + 1) * cell + clear, z0: bounds.z0 + j * cell - clear, z1: bounds.z0 + (j + 1) * cell + clear });
      if (index.hits(q(i))) {
        i++;
        continue;
      }
      let i1 = i;
      while (i1 + 1 < nx && !index.hits(q(i1 + 1))) i1++;
      const key = `${i}-${i1}`;
      const run = open.get(key);
      if (run) {
        run.j1 = j;
        next.set(key, run);
        open.delete(key);
      } else next.set(key, { i0: i, i1, j0: j, j1: j });
      i = i1 + 1;
    }
    for (const r of open.values()) finish(r); // the runs that did not carry on into this row
    open = next;
  }
  for (const r of open.values()) finish(r);
  return out;
}
