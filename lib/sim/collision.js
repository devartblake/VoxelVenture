import { buildingSize } from '../city/cityGenerator';
import { sampleCurve } from '../city/curves';
import { hillBlocked } from '../city/hills';
import { PARK_BENCH_OFFSETS, PARK_POND_RADIUS, parkHedges } from '../city/parkGeometry';
import { amusementSolids } from '../city/amusement';
import { deckRect } from '../city/piers';
import { hallWalls } from '../city/mallHall';

// Static collision for the avatar: axis-aligned rectangles in city coordinates (the same space the
// roads, plots and park are drawn in). Only things you would bump into are solid: buildings,
// the park's hedge/fountain/monument/benches/tree trunks, billboard posts and the islands of the circles.
// Empty lots, sidewalks, roads and the park's paths and gates are walkable.

export const AVATAR_RADIUS = 0.17;
// Buildings fill 85% of their plot (see PlotMesh). Returns the building's half-width and half-depth.
export const buildingHalf = (p) => {
  const { bw, bd } = buildingSize(p);
  return { hw: bw / 2, hd: bd / 2 };
};
const BILLBOARD_POST_HALF = 0.3;
const BILLBOARD_POST_SPREAD = 0.32; // posts stand at +/- this share of the screen width

export function buildCollisionMap({ plots, layout, billboards, extra = [] }) {
  const rects = [];
  // A box centred on (cx, cz), `hw` / `hd` half-width / half-depth, optionally turned by `yaw` (plots
  // along a curved road). Turned boxes keep their enclosing axis-aligned box for a quick first test.
  const add = (cx, cz, hw, hd, kind, yaw = 0) => {
    if (!yaw) {
      rects.push({ x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd, kind });
      return;
    }
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const ex = Math.abs(hw * c) + Math.abs(hd * s);
    const ez = Math.abs(hw * s) + Math.abs(hd * c);
    rects.push({ x0: cx - ex, x1: cx + ex, z0: cz - ez, z1: cz + ez, kind, obb: { cx, cz, hw, hd, c, s } });
  };

  for (const p of plots) {
    if (p.owner) {
      const { hw, hd } = buildingHalf(p);
      add(p.x, p.z, hw, hd, 'building', p.yaw ?? 0);
    }
  }

  for (const park of layout.parks) {
    const { x: cx, z: cz } = park.center;
    for (const h of parkHedges(park.width, park.depth)) add(cx + h.x, cz + h.z, h.w / 2, h.d / 2, 'hedge');
    add(cx, cz, PARK_POND_RADIUS * 0.85, PARK_POND_RADIUS * 0.85, 'fountain');
    add(park.monument.x, park.monument.z, 0.22, 0.22, 'monument');
    for (const [dx, dz] of PARK_BENCH_OFFSETS) add(cx + dx, cz + dz, 0.25, 0.1, 'bench');
    for (const t of park.trees) add(t.x, t.z, 0.1, 0.1, 'tree');
  }

  // The amusement park: the fence (with the gate open), the rides, the stalls and the coaster's supports are solid; the paths and lawn are walkable.
  if (layout.amusement) for (const r of amusementSolids(layout.amusement)) rects.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, kind: r.kind === 'fence' ? 'hedge' : r.kind === 'ride' ? 'building' : 'monument' });

  for (const b of billboards) {
    if (b.kind === 'banner') continue; // planes fly overhead
    // The screen is turned by `yaw` about Y: local (x, z) -> world (x cos + z sin, -x sin + z cos).
    for (const side of [-1, 1]) {
      const lx = side * b.width * BILLBOARD_POST_SPREAD;
      add(b.x + lx * Math.cos(b.yaw), b.z - lx * Math.sin(b.yaw), BILLBOARD_POST_HALF, BILLBOARD_POST_HALF, 'billboard');
    }
  }

  // Airports: the terminal, the tower and the hangars are solid; the runways and aprons are walkable.
  for (const airport of layout.airports ?? []) {
    for (const bld of [airport.terminal, airport.tower, ...airport.hangars, ...(airport.airliners ?? [])]) add(bld.x, bld.z, bld.w / 2, bld.d / 2, 'building');
  }

  // The malls are hollow (lib/city/mallHall.js): four walls, with the doorway in the front wall, and the concourse inside is walkable.
  for (const mall of layout.malls ?? []) for (const wall of hallWalls(mall)) add(wall.x, wall.z, wall.hw, wall.hd, 'building', mall.yaw);

  for (const i of layout.intersections) {
    // a circle's raised island (a square that stays inside the island's circle, clear of the ring)
    if (i.control === 'circle') add(i.x, i.z, i.circle.island * 0.8, i.circle.island * 0.8, 'island');
  }

  // Rectangular lakes are plain boxes; an oval pond (older layouts) keeps its enclosing box for the quick test.
  for (const lake of layout.lakes ?? []) {
    if (lake.shape === 'rect') {
      rects.push({ x0: lake.x - lake.rx, x1: lake.x + lake.rx, z0: lake.z - lake.rz, z1: lake.z + lake.rz, kind: 'lake' });
      continue;
    }
    const c = Math.cos(lake.yaw);
    const s = Math.sin(lake.yaw);
    const ex = Math.hypot(lake.rx * c, lake.rz * s);
    const ez = Math.hypot(lake.rx * s, lake.rz * c);
    rects.push({ x0: lake.x - ex, x1: lake.x + ex, z0: lake.z - ez, z1: lake.z + ez, kind: 'lake', ellipse: { cx: lake.x, cz: lake.z, rx: lake.rx, rz: lake.rz, c, s } });
  }

  // A river is wall-to-wall water except where a bridge crosses it.
  for (const river of layout.rivers ?? []) {
    const bridges = (layout.bridges ?? []).filter((br) => br.riverId === river.id).sort((p, q) => p.center - q.center);
    const lo = river.axis === 'z' ? river.z0 : river.x0;
    const hi = river.axis === 'z' ? river.z1 : river.x1;
    let cursor = lo;
    const spans = [];
    for (const br of bridges) {
      if (br.center - 1.4 > cursor) spans.push([cursor, br.center - 1.4]);
      cursor = Math.max(cursor, br.center + 1.4);
    }
    if (cursor < hi) spans.push([cursor, hi]);
    for (const [a, b] of spans) {
      rects.push(river.axis === 'z' ? { x0: river.x0, x1: river.x1, z0: a, z1: b, kind: 'river' } : { x0: a, x1: b, z0: river.z0, z1: river.z1, kind: 'river' });
    }
  }

  // The riverwalk (lib/city/promenade.js): the paving is walkable; the benches and lamp posts are solid.
  for (const w of layout.promenades ?? []) {
    for (const b of w.benches) add(b.x, b.z, 0.5, 0.2, 'bench', b.yaw);
    for (const l of w.lamps) add(l.x, l.z, 0.08, 0.08, 'monument');
  }

  // A pier's deck is walkable even though it stands in the water: cut it out of the lake and river rectangles.
  for (const pier of layout.piers ?? []) carveDeck(rects, deckRect(pier));

  // Anything else solid that the caller knows about (the market's stalls): { x, z, w, d } world rectangles.
  for (const e of extra) add(e.x, e.z, e.w / 2, e.d / 2, e.kind ?? 'stall');

  // The hills: the ground is too high and steep to walk up (the roads and the meadow through them stay level, so they are open).
  if (layout.hills) rects.push({ x0: layout.hills.rect.x0, x1: layout.hills.rect.x1, z0: layout.hills.rect.z0, z1: layout.hills.rect.z1, kind: 'hill', hills: layout.hills });

  // Trees in the woods have trunks you walk round.
  for (const t of layout.woods ?? []) add(t.x, t.z, 0.1, 0.1, 'tree');
  for (const t of layout.landscape?.trees ?? []) add(t.x, t.z, 0.1, 0.1, 'tree');

  // Walkable area: the road network plus a margin (so you can reach the billboards beyond its ends).
  const MARGIN = 5;
  const xs = layout.roads.filter((r) => r.axis === 'x');
  const zs = layout.roads.filter((r) => r.axis === 'z');
  const xsAll = [...xs.flatMap((r) => [r.from, r.to])];
  const zsAll = [...zs.flatMap((r) => [r.from, r.to])];
  for (const a of layout.reserved ?? []) {
    xsAll.push(a.x0, a.x1);
    zsAll.push(a.z0, a.z1);
  }
  for (const lake of layout.lakes ?? []) {
    xsAll.push(lake.x - lake.rx, lake.x + lake.rx);
    zsAll.push(lake.z - lake.rx, lake.z + lake.rx);
  }
  for (const spec of layout.curvedRoads ?? []) {
    for (const pt of sampleCurve(spec).points) {
      xsAll.push(pt.x);
      zsAll.push(pt.z);
    }
  }
  const bounds = {
    x0: Math.min(...xsAll) - MARGIN,
    x1: Math.max(...xsAll) + MARGIN,
    z0: Math.min(...zsAll) - MARGIN,
    z1: Math.max(...zsAll) + MARGIN,
  };
  // The whole land is walkable (ponds block themselves), not just the ground near the roads.
  if (layout.land) {
    const inset = 1;
    bounds.x0 = Math.min(bounds.x0, layout.land.x0 + inset);
    bounds.x1 = Math.max(bounds.x1, layout.land.x1 - inset);
    bounds.z0 = Math.min(bounds.z0, layout.land.z0 + inset);
    bounds.z1 = Math.max(bounds.z1, layout.land.z1 - inset);
  }
  return { rects, bounds };
}

// Remove `deck` from every water rectangle it overlaps (a lake or river rectangle becomes up to four pieces round it).
function carveDeck(rects, deck) {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if ((r.kind !== 'lake' && r.kind !== 'river') || r.ellipse) continue;
    if (!(Math.min(r.x1, deck.x1) - Math.max(r.x0, deck.x0) > 1e-6 && Math.min(r.z1, deck.z1) - Math.max(r.z0, deck.z0) > 1e-6)) continue;
    rects.splice(i, 1);
    const cut = { x0: Math.max(r.x0, deck.x0), x1: Math.min(r.x1, deck.x1), z0: Math.max(r.z0, deck.z0), z1: Math.min(r.z1, deck.z1) };
    const pieces = [
      { x0: r.x0, x1: cut.x0, z0: r.z0, z1: r.z1 },
      { x0: cut.x1, x1: r.x1, z0: r.z0, z1: r.z1 },
      { x0: cut.x0, x1: cut.x1, z0: r.z0, z1: cut.z0 },
      { x0: cut.x0, x1: cut.x1, z0: cut.z1, z1: r.z1 },
    ];
    for (const q of pieces) if (q.x1 - q.x0 > 1e-6 && q.z1 - q.z0 > 1e-6) rects.push({ ...q, kind: r.kind });
  }
}

// Is a square avatar of half-size `r` centred at (x, z) overlapping a solid?
export function isBlocked(x, z, rects, r = AVATAR_RADIUS) {
  for (const rect of rects) {
    if (!(x > rect.x0 - r && x < rect.x1 + r && z > rect.z0 - r && z < rect.z1 + r)) continue;
    if (rect.hills) {
      if (hillBlocked(rect.hills, x, z)) return true;
      continue;
    }
    if (rect.ellipse) {
      // an oval pond, grown by the avatar's size
      const { cx, cz, rx, rz, c, s } = rect.ellipse;
      const dx = x - cx;
      const dz = z - cz;
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if ((lx / (rx + r)) ** 2 + (lz / (rz + r)) ** 2 < 1) return true;
      continue;
    }
    if (!rect.obb) return true;
    // a turned box: move the point into the box's own frame and test it there
    const { cx, cz, hw, hd, c, s } = rect.obb;
    const dx = x - cx;
    const dz = z - cz;
    if (Math.abs(dx * c - dz * s) < hw + r && Math.abs(dx * s + dz * c) < hd + r) return true;
  }
  return false;
}

// Moves by (dx, dz), one axis at a time, so the avatar slides along walls instead of sticking.
// Returns the new { x, z }.
export function moveAvatar(x, z, dx, dz, { rects, bounds }, r = AVATAR_RADIUS) {
  let nx = x;
  let nz = z;
  const tryX = Math.min(Math.max(x + dx, bounds.x0), bounds.x1);
  if (!isBlocked(tryX, nz, rects, r)) nx = tryX;
  const tryZ = Math.min(Math.max(z + dz, bounds.z0), bounds.z1);
  if (!isBlocked(nx, tryZ, rects, r)) nz = tryZ;
  return { x: nx, z: nz };
}

// If something solid now covers (x, z) (e.g. the player claimed the lot they were standing on),
// find the nearest free spot instead of leaving the avatar trapped inside it.
export function resolveOverlap(x, z, { rects, bounds }, r = AVATAR_RADIUS) {
  if (!isBlocked(x, z, rects, r)) return { x, z };
  for (let radius = 0.1; radius <= 4; radius += 0.1) {
    let best = null;
    for (let a = 0; a < 32; a++) {
      const angle = (a / 32) * Math.PI * 2;
      const cx = Math.min(Math.max(x + Math.cos(angle) * radius, bounds.x0), bounds.x1);
      const cz = Math.min(Math.max(z + Math.sin(angle) * radius, bounds.z0), bounds.z1);
      if (!isBlocked(cx, cz, rects, r)) {
        best = { x: cx, z: cz };
        break;
      }
    }
    if (best) return best;
  }
  return { x, z };
}

// A free starting spot on the first arterial avenue, as near its middle as possible.
export function findSpawn(layout, { rects }) {
  const avenue = layout.roads.find((r) => r.kind === 'avenue' && r.class === 'arterial') ?? layout.roads[0];
  for (let offset = 0; offset < 30; offset += 0.6) {
    for (const sign of [1, -1]) {
      const x = (avenue.from + avenue.to) / 2 + sign * offset;
      if (!isBlocked(x, avenue.center, rects)) return { x, z: avenue.center };
    }
  }
  return { x: 0, z: avenue.center };
}
