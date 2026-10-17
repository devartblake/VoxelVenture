// The amusement park (design time, generated): one big attraction in the country outside the county road, with its gate on the county road. This file
// is pure geometry: where it goes (planAmusement), what is in it (amusementDesign), and what you cannot walk through (amusementSolids). The 3D drawing is
// apps/web/components/city/AmusementPark.jsx; the generator (cityGenerator.js) reserves the ground before it plans the new streets, so they go round it.
//
// The park is drawn in its own coordinates: u along the county road (0..width), v outward from it (0..depth), and turned into the world by `toWorld`.
import { RectIndex } from './freeLand';

export const AMUSEMENT = {
  width: 72, // along the county road
  depth: 44, // outward from it
  gap: 2.5, // between the road's pavement and the fence
  halfCorridor: 1.4,
  keepClear: 5, // ground round the fence that new lots and streets keep clear of
  gateWidth: 7,
  gateClear: 9, // the gate keeps this far from a junction on the county road
  name: 'Voxel Fun Park',
};

// u along the road, v outward from it; `site` is what planAmusement returns
export function toWorld(site, u, v) {
  const { axis, roadCenter, outward, u0 } = site;
  const along = u0 + u;
  const out = roadCenter + outward * (AMUSEMENT.halfCorridor + AMUSEMENT.gap + v);
  return axis === 'x' ? { x: along, z: out } : { x: out, z: along };
}

// The park's ground as a world rectangle
export function siteRect(road, outward, u0, width = AMUSEMENT.width, depth = AMUSEMENT.depth) {
  const n0 = AMUSEMENT.halfCorridor + AMUSEMENT.gap;
  const a = road.center + outward * n0;
  const b = road.center + outward * (n0 + depth);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return road.axis === 'x' ? { x0: u0, x1: u0 + width, z0: lo, z1: hi } : { x0: lo, x1: hi, z0: u0, z1: u0 + width };
}

const inflateRect = (r, m) => ({ x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m });
// the park's ground grown by `m` on every side but the one facing the county road (the road is no obstacle to its own gate)
function clearance(rect, axis, outward, m) {
  const out = inflateRect(rect, m);
  if (axis === 'x') {
    if (outward > 0) out.z0 = rect.z0;
    else out.z1 = rect.z1;
  } else if (outward > 0) out.x0 = rect.x0;
  else out.x1 = rect.x1;
  return out;
}

// Where the park goes: flush against the county road (its gate on the road), on the first side of the county road that has room, near the middle of that
// side. `obstacles` is what is in the way (a RectIndex or a list of rectangles); `sides` the order to try them in: the county road on that side of the city.
// Returns { roadId, axis, roadCenter, outward, u0, width, depth, rect, gate: { u, x, z }, facing: [dx, dz] (the way the gate looks, out of the park), keepOut, keepClear } or null
// (plain numbers and strings, so it can be kept in the city's layout).
export function planAmusement({ roads, obstacles, bounds, centre, sides = ['county-west', 'county-east', 'county-south', 'county-north'], opts = {} }) {
  const index = obstacles instanceof RectIndex ? obstacles : new RectIndex(obstacles);
  // the full size first; where the land is cut up by lakes, airports and hills a smaller park (the same rides, closer together) is tried
  for (const [width, depth] of [[AMUSEMENT.width, AMUSEMENT.depth], [60, 38]]) {
    const found = planAmusementOfSize({ roads, index, bounds, centre, sides, cfg: { ...AMUSEMENT, width, depth, ...opts } });
    if (found) return found;
  }
  return null;
}

function planAmusementOfSize({ roads, index, bounds, centre, sides, cfg }) {
  for (const id of sides) {
    const road = roads.find((r) => r.id === id);
    if (!road) continue;
    const outward = (road.axis === 'x' ? road.center < centre.z : road.center < centre.x) ? -1 : 1;
    const mid = (road.from + road.to) / 2;
    // the junctions on the county road, so the gate is not opposite one
    const junctions = roads.filter((q) => q.axis !== road.axis && q.center >= road.from - 1e-6 && q.center <= road.to + 1e-6 && road.center >= q.from - 1e-6 && road.center <= q.to + 1e-6).map((q) => q.center);
    const candidates = [];
    for (let u0 = Math.ceil(road.from + 12); u0 + cfg.width <= road.to - 12; u0 += 2) {
      const rect = siteRect(road, outward, u0, cfg.width, cfg.depth);
      if (junctions.some((j) => Math.abs(j - (u0 + cfg.width / 2)) < cfg.gateClear)) continue; // (streets end at the county road from the inside, so the far side is free; only the gate keeps off a junction)
      const wide = clearance(rect, road.axis, outward, cfg.keepClear);
      if (wide.x0 < bounds.x0 || wide.x1 > bounds.x1 || wide.z0 < bounds.z0 || wide.z1 > bounds.z1) continue;
      if (index.hits(wide)) continue;
      candidates.push({ u0, rect, away: Math.abs(u0 + cfg.width / 2 - mid) });
    }
    if (!candidates.length) continue;
    candidates.sort((p, q) => p.away - q.away || p.u0 - q.u0);
    const best = candidates[0];
    const site = { id: 'amusement', roadId: road.id, axis: road.axis, roadCenter: road.center, outward, u0: best.u0, width: cfg.width, depth: cfg.depth, rect: best.rect, name: cfg.name };
    const gate = toWorld(site, cfg.width / 2, 0);
    site.gate = { u: cfg.width / 2, ...gate };
    site.facing = road.axis === 'x' ? [0, -outward] : [-outward, 0];
    site.visits = 4200;
    site.keepOut = { road: road.id, u0: best.u0, u1: best.u0 + cfg.width };
    site.keepClear = clearance(best.rect, road.axis, outward, cfg.keepClear);
    return site;
  }
  return null;
}

// ---- what is inside ---------------------------------------------------------------------------------------------------------------------------------
// Everything is in park coordinates { u, v } and sizes in world units. A ride's `base` is its footprint (half sizes) for collision.
export function amusementDesign(width = AMUSEMENT.width, depth = AMUSEMENT.depth) {
  const cx = width / 2;
  // the roller coaster: a closed loop round the middle of the park, with hills; its supports stand every few units
  const loop = { cu: cx, cv: depth * 0.66, ru: width * 0.43, rv: depth * 0.26 };
  const track = [];
  const N = 72;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const hill = 2.4 + 1.8 * Math.sin(a * 3 + 0.6) + 1.2 * Math.sin(a * 5);
    track.push({ u: loop.cu + Math.cos(a) * loop.ru, v: loop.cv + Math.sin(a) * loop.rv, y: Math.max(1.4, hill + 1.8) });
  }
  const supports = track.filter((_, i) => i % 4 === 0).map((p) => ({ u: p.u, v: p.v, h: p.y }));
  const stalls = [];
  for (let i = 0; i < 4; i++) stalls.push({ u: 8 + i * 6.5, v: 5.5, w: 3.2, d: 2.8, colour: ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6'][i] });
  for (let i = 0; i < 3; i++) stalls.push({ u: width - 22 + i * 6.5, v: 5.5, w: 3.2, d: 2.8, colour: ['#a855f7', '#ec4899', '#14b8a6'][i] });
  return {
    arch: { u: cx, v: 0.8, w: AMUSEMENT.gateWidth, h: 5.2 },
    ferris: { u: cx, v: depth * 0.66, radius: 5.4, hub: 6.4, base: { hu: 6, hv: 1.6 } },
    carousel: { u: loop.cu - loop.ru * 0.62, v: loop.cv, radius: 3.8, base: { hu: 4.2, hv: 4.2 } },
    swings: { u: loop.cu + loop.ru * 0.62, v: loop.cv, radius: 3.2, height: 6, base: { hu: 3.2, hv: 3.2 } },
    bumpers: { u: width - 14, v: 13, w: 12, d: 7, base: { hu: 6, hv: 3.5 } },
    loop,
    track,
    supports,
    stalls,
    plaza: { u: cx, v: 6, w: 22, d: 9 },
    // benches along the main path (yaw: the way each faces: towards the path), and flower beds by the entrance
    benches: [12, 17, 22, 34].flatMap((v) => [{ u: cx - 3, v, yaw: Math.PI / 2 }, { u: cx + 3, v, yaw: -Math.PI / 2 }]),
    flowers: [[cx - 9, 2.5], [cx + 9, 2.5], [cx - 13, 8.5], [cx + 13, 8.5]],
    trees: [
      [4, 9], [4, 14], [8, 11], [width - 4, 9], [width - 4, 14], [width - 8, 11], [4, depth - 4], [width - 4, depth - 4], [cx - 12, depth - 3.5], [cx + 12, depth - 3.5], [cx - 26, 11], [cx + 26, 11],
    ],
  };
}

// Everything in the park that cannot be walked through, as world rectangles: the fence (with the gap for the gate), each ride's base, the stalls, the
// bumper-car pavilion, and the coaster's supports.
export function amusementSolids(site) {
  const { width, depth } = site;
  const d = amusementDesign(width, depth);
  const out = [];
  const box = (u, v, hu, hv, kind) => {
    const a = toWorld(site, u - hu, v - hv);
    const b = toWorld(site, u + hu, v + hv);
    out.push({ x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z), kind });
  };
  const t = 0.2; // the fence is this thick
  const gate = AMUSEMENT.gateWidth / 2;
  box((width / 2 - gate) / 2, 0, (width / 2 - gate) / 2, t, 'fence'); // the front, in two halves with the gate between
  box(width - (width / 2 - gate) / 2, 0, (width / 2 - gate) / 2, t, 'fence');
  box(width / 2, depth, width / 2, t, 'fence'); // the back
  box(0, depth / 2, t, depth / 2, 'fence'); // the sides
  box(width, depth / 2, t, depth / 2, 'fence');
  box(d.ferris.u, d.ferris.v, d.ferris.base.hu, d.ferris.base.hv, 'ride');
  box(d.carousel.u, d.carousel.v, d.carousel.base.hu, d.carousel.base.hv, 'ride');
  box(d.swings.u, d.swings.v, d.swings.base.hu, d.swings.base.hv, 'ride');
  box(d.bumpers.u, d.bumpers.v, d.bumpers.base.hu, d.bumpers.base.hv, 'ride');
  for (const s of d.stalls) box(s.u, s.v, s.w / 2, s.d / 2, 'stall');
  box(d.arch.u - d.arch.w / 2, d.arch.v, 0.3, 0.3, 'arch'); // the two posts of the gate arch
  box(d.arch.u + d.arch.w / 2, d.arch.v, 0.3, 0.3, 'arch');
  for (const s of d.supports) box(s.u, s.v, 0.18, 0.18, 'support');
  for (const b of d.benches) box(b.u, b.v, 0.25, 0.55, 'bench'); // (a bench is 1 along the path's direction: 0.5 each side)
  return out;
}

// A point on the coaster at position `t` (0..1 round the loop), for the train: its park coordinates, height, and the direction it is heading (park coordinates).
export function trackAt(track, t) {
  const n = track.length;
  const f = ((t % 1) + 1) % 1 * n;
  const i = Math.floor(f) % n;
  const k = f - Math.floor(f);
  const a = track[i];
  const b = track[(i + 1) % n];
  return { u: a.u + (b.u - a.u) * k, v: a.v + (b.v - a.v) * k, y: a.y + (b.y - a.y) * k, du: b.u - a.u, dv: b.v - a.v, dy: b.y - a.y };
}
