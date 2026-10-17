// The city editor's engine (design time, pure so it is tested in Node): edits to a generated city as a list of operations that are replayed over it. A city is
// `generateCity(seed)`, then `applyEdits(city, ops)`: roads added, removed, moved or changed (their junctions and the pavement gaps follow, as the generator makes
// them), lots placed, removed or changed (one at a time, or filled along a road's frontage the way the generator lays lots), parks. `validate` says what is wrong
// (a road end with no junction, lots on roads, lots that face nothing). The editor page (apps/web/components/dev/CityEditor.jsx) makes the operations; the game replays them
// (lib/city/editedWorld.js) when it starts, in development.
//
// An operation is plain data (so it is saved as JSON and replayed the same every time):
//   { t: 'road+', road, clear?, clearMargin? }   add a road (its junctions are made; lots under it are removed unless clear === false, and so are lots within `clearMargin` of its pavement:
//                                       3.4 clears the two rows of lots that would stand beside it, to lay new lots there)
//   { t: 'road-', id }                  remove a road, its junctions and their gaps
//   { t: 'road~', id, set, clear? }     change fields of a road; changing where it is rebuilds its junctions
//   { t: 'plot+', plot }  { t: 'plot-', id }  { t: 'plot~', id, set }
//   { t: 'park+', park }  { t: 'park-', id }  { t: 'park~', id, set }
import { generatorParts as G, PLOT_PITCH, PLOT_TILE } from './cityGenerator';
import { RectIndex, cityRects, lawnRects } from './freeLand';
import { locationAttrsFor } from '../dev/locationAttrs';
import { landPrice } from '../game/landPrice';

export const EDIT_VERSION = 1;
export const HALF_CORRIDOR = 1.4; // half the width of a road (asphalt and both pavements)
export const EDIT_PLOT_BASE = 300000; // lots made in the editor are numbered from here, so they never shift the generated ones
export const ROAD_KINDS = ['street', 'avenue', 'ring', 'infill'];
export const ROAD_CLASSES = ['local', 'arterial'];
const GEOMETRY = ['axis', 'center', 'from', 'to'];
const eq = (a, b) => Math.abs(a - b) < 1e-6;
const r2 = (n) => Math.round(n * 100) / 100;

export const emptyEdits = () => [];
export const cloneCity = (city) => structuredClone(city);

// ---- roads ----------------------------------------------------------------------------------------------------------------------------------------------------------
export const corridorOf = (r) => (r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - HALF_CORRIDOR, z1: r.center + HALF_CORRIDOR } : { x0: r.center - HALF_CORRIDOR, x1: r.center + HALF_CORRIDOR, z0: r.from, z1: r.to });
const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.02 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.02;
export const plotBox = (p) => {
  const c = Math.abs(Math.cos(p.yaw ?? 0));
  const s = Math.abs(Math.sin(p.yaw ?? 0));
  return { x0: p.x - (p.w * c + p.d * s) / 2, x1: p.x + (p.w * c + p.d * s) / 2, z0: p.z - (p.w * s + p.d * c) / 2, z1: p.z + (p.w * s + p.d * c) / 2 };
};
const hashPhase = (id) => {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return (h % 1200) / 100; // a signal's timing offset, 0..12
};

// A complete road from the fields that matter: { axis, center, from, to, kind, class, name, id }. `from` is always the smaller end.
export function makeRoad(spec, existing = []) {
  const axis = spec.axis === 'z' ? 'z' : 'x';
  const from = Math.min(spec.from, spec.to);
  const to = Math.max(spec.from, spec.to);
  const ids = new Set(existing.map((r) => r.id));
  let n = 1;
  let id = spec.id;
  while (!id || ids.has(id)) id = `edit-road-${n++}`;
  return {
    id,
    kind: ROAD_KINDS.includes(spec.kind) ? spec.kind : 'street',
    class: spec.class === 'arterial' ? 'arterial' : 'local',
    axis,
    name: String(spec.name ?? 'New street').slice(0, 40),
    color: spec.color ?? '#e2e8f0',
    gaps: [],
    density: spec.density ?? 1,
    center: r2(spec.center),
    from: r2(from),
    to: r2(to),
    labelAt: axis === 'z' ? [r2(spec.center), r2(from + 4)] : [r2(from + 4), r2(spec.center)],
    frontage: spec.frontage ?? null,
    edited: true,
    ...(spec.setback != null && { setback: spec.setback }),
    ...(spec.pitch != null && { pitch: spec.pitch }),
    ...(spec.sides && { sides: spec.sides }),
  };
}

// Make the junctions of a road with every road that crosses or meets it, and cut the pavement gaps, exactly as the generator does (generator buildIntersections).
function joinRoad(city, road) {
  const L = city.layout;
  for (const q of L.roads) {
    if (q === road || q.axis === road.axis) continue;
    const h = road.axis === 'x' ? road : q;
    const v = road.axis === 'x' ? q : road;
    const arms = G.junctionArms(h, v);
    if (!arms) continue;
    const id = `x-${h.id}-${v.id}`;
    if (L.intersections.some((i) => i.id === id)) continue;
    L.intersections.push({ id, x: v.center, z: h.center, arms, ...G.planIntersection(h.class === 'arterial', v.class === 'arterial', arms), phase: hashPhase(id) });
    h.gaps.push([v.center - HALF_CORRIDOR, v.center + HALF_CORRIDOR]);
    v.gaps.push([h.center - HALF_CORRIDOR, h.center + HALF_CORRIDOR]);
  }
  for (const q of [road, ...L.roads]) q.gaps.sort((a, b) => a[0] - b[0]);
}

// Take a road's junctions out, and the gaps they cut in the roads that met it.
function unjoinRoad(city, road) {
  const L = city.layout;
  for (const q of L.roads) {
    if (q === road || q.axis === road.axis) continue;
    const ids = new Set([`x-${road.id}-${q.id}`, `x-${q.id}-${road.id}`]);
    const before = L.intersections.length;
    L.intersections = L.intersections.filter((i) => !ids.has(i.id));
    if (L.intersections.length !== before) {
      const k = q.gaps.findIndex(([a, b]) => eq(a, road.center - HALF_CORRIDOR) && eq(b, road.center + HALF_CORRIDOR));
      if (k >= 0) q.gaps.splice(k, 1);
    }
  }
}

// Lots that stand on a road's pavement
const lotsUnder = (city, road, margin = 0) => {
  const c = corridorOf(road);
  const area = { x0: c.x0 - margin, x1: c.x1 + margin, z0: c.z0 - margin, z1: c.z1 + margin };
  return city.plots.filter((p) => overlap(plotBox(p), area));
};

// ---- the operations -------------------------------------------------------------------------------------------------------------------------------------------------
function applyOp(city, op) {
  const L = city.layout;
  switch (op.t) {
    case 'road+': {
      const road = makeRoad(op.road, L.roads);
      road.id = op.road.id ?? road.id;
      L.roads.push(road);
      if (op.clear !== false) {
        const gone = new Set(lotsUnder(city, road, op.clearMargin ?? 0).map((p) => p.id));
        city.plots = city.plots.filter((p) => !gone.has(p.id));
      }
      joinRoad(city, road);
      break;
    }
    case 'road-': {
      const road = L.roads.find((r) => r.id === op.id);
      if (!road) break;
      unjoinRoad(city, road);
      L.roads = L.roads.filter((r) => r !== road);
      break;
    }
    case 'road~': {
      const i = L.roads.findIndex((r) => r.id === op.id);
      if (i < 0) break;
      const old = L.roads[i];
      const moves = GEOMETRY.some((k) => op.set[k] !== undefined && op.set[k] !== old[k]);
      if (!moves) {
        Object.assign(old, op.set);
        break;
      }
      unjoinRoad(city, old);
      const next = makeRoad({ ...old, ...op.set, id: old.id }, L.roads.filter((r) => r !== old));
      next.edited = true;
      next.color = old.color;
      L.roads[i] = next;
      if (op.clear !== false) {
        const gone = new Set(lotsUnder(city, next).map((p) => p.id));
        city.plots = city.plots.filter((p) => !gone.has(p.id));
      }
      joinRoad(city, next);
      break;
    }
    case 'plot+':
      if (!city.plots.some((p) => p.id === op.plot.id)) city.plots.push(structuredClone(op.plot));
      break;
    case 'plot-':
      city.plots = city.plots.filter((p) => p.id !== op.id);
      break;
    case 'plot~': {
      const p = city.plots.find((q) => q.id === op.id);
      if (p) Object.assign(p, op.set, { edited: true });
      break;
    }
    case 'park+':
      if (!L.parks.some((k) => k.id === op.park.id)) L.parks.push(structuredClone(op.park));
      break;
    case 'park-':
      L.parks = L.parks.filter((k) => k.id !== op.id);
      break;
    case 'park~': {
      const k = L.parks.find((q) => q.id === op.id);
      if (k) Object.assign(k, op.set);
      break;
    }
    default:
      break;
  }
}

// What follows from the edits: every lot's location attributes and price, the lawn, the districts the new lots use.
function finish(city, count) {
  const L = city.layout;
  for (const p of city.plots) {
    p.land = locationAttrsFor(p, { roads: L.roads, parks: L.parks, amusement: L.amusement }, city.plots);
    p.price = landPrice(p.land);
  }
  const known = new Set(L.districts.map((d) => d.id));
  for (const p of city.plots) {
    if (p.districtId && !known.has(p.districtId)) {
      const d = G.districtById[p.districtId];
      if (d) {
        L.districts.push({ id: d.id, name: d.name, color: d.color });
        known.add(d.id);
      }
    }
  }
  L.lawns = lawnRects(cityRects(city), L.urban);
  L.edits = { ops: count };
  return city;
}

// The edited city: `base` is generateCity(seed) (it is not changed), `ops` the edits.
export function applyEdits(base, ops) {
  const city = cloneCity(base);
  for (const op of ops ?? []) applyOp(city, op);
  return finish(city, (ops ?? []).length);
}

// The edits as a saved document, and back (anything that is not a known operation is dropped)
export const toDocument = (seed, ops) => ({ version: EDIT_VERSION, seed, ops });
export function fromDocument(doc) {
  if (!doc || typeof doc !== 'object' || doc.version !== EDIT_VERSION || !Number.isFinite(doc.seed) || !Array.isArray(doc.ops)) return null;
  const ok = ['road+', 'road-', 'road~', 'plot+', 'plot-', 'plot~', 'park+', 'park-', 'park~'];
  return { seed: doc.seed, ops: doc.ops.filter((o) => o && ok.includes(o.t)) };
}

// ---- making things --------------------------------------------------------------------------------------------------------------------------------------------------
export const nextPlotId = (city) => Math.max(EDIT_PLOT_BASE - 1, ...city.plots.map((p) => p.id).filter((n) => Number.isFinite(n))) + 1;
export const nextParkId = (city) => {
  let n = 1;
  while (city.layout.parks.some((k) => k.id === `edit-park-${n}`)) n++;
  return `edit-park-${n}`;
};

// The district a spot belongs to: the one most of the nearby lots are in.
export function districtAt(city, x, z, radius = 25) {
  const count = new Map();
  for (const p of city.plots) {
    if (!p.districtId || Math.hypot(p.x - x, p.z - z) > radius) continue;
    count.set(p.districtId, (count.get(p.districtId) ?? 0) + 1);
  }
  const best = [...count.entries()].filter(([id]) => G.districtById[id]).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : 'outskirts';
}

// A lot at (x, z), made the way the generator makes one. spec: { x, z, yaw?, facing?, status?: 'empty' | 'built' | 'mixed', district?, w?, d?, tier?: 'ordinary' | 'prime' | 'luxury' | 'grand' }
export function makeLot(city, spec, id = nextPlotId(city)) {
  const district = G.districtById[spec.district ?? districtAt(city, spec.x, spec.z)] ?? G.districtById.outskirts;
  const rand = G.mulberry32(id * 2654435761);
  const tier = spec.tier ?? 'ordinary';
  const w = spec.w ?? PLOT_TILE;
  const d = spec.d ?? PLOT_TILE;
  const cells = Math.max(1, Math.round((w * d) / (PLOT_TILE * PLOT_TILE)));
  const shape = tier === 'ordinary' ? null : { kind: tier, cells: Array.from({ length: cells }, () => [null, null]), w, d, built: tier === 'grand' };
  const plot = G.makePlot(rand, id, { x: r2(spec.x), z: r2(spec.z) }, null, null, district, spec.facing ?? 1, shape, spec.status === 'built', spec.status === 'empty');
  if (spec.yaw) plot.yaw = Math.round(spec.yaw * 1e6) / 1e6; // (not 2 decimals: a quarter turn must stay a quarter turn)
  plot.edited = true;
  return plot;
}

// The lots along a road's frontage, the way the generator lays them (generator frontageLots): beside the pavement on one side or both, a lot every `pitch`,
// skipping the junctions' gaps and anything already in the way. Returns the 'plot+' operations. opts: { side: -1 | 1 | 0 (both), pitch, setback, status, tier, district, from, to }
export function fillFrontage(city, road, opts = {}) {
  const pitch = opts.pitch ?? road.pitch ?? PLOT_PITCH;
  const setback = opts.setback ?? road.setback ?? 0;
  const sides = opts.side ? [opts.side] : [-1, 1];
  const index = new RectIndex(cityRects(city));
  const ops = [];
  let id = nextPlotId(city);
  const lo = Math.max(road.from, opts.from ?? road.from);
  const hi = Math.min(road.to, opts.to ?? road.to);
  // the stretches between the junctions' gaps
  const blocks = [];
  let cursor = lo;
  for (const [a, b] of [...road.gaps].sort((p, q) => p[0] - q[0])) {
    if (a > cursor) blocks.push([cursor, Math.min(a, hi)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < hi) blocks.push([cursor, hi]);
  for (const side of sides) {
    const offset = side * (HALF_CORRIDOR + PLOT_TILE / 2 + setback);
    for (const [a, b] of blocks) {
      for (let u = a + PLOT_TILE / 2; u + PLOT_TILE / 2 <= b + 1e-9; u += pitch) {
        const x = road.axis === 'x' ? u : road.center + offset;
        const z = road.axis === 'x' ? road.center + offset : u;
        const box = { x0: x - PLOT_TILE / 2, x1: x + PLOT_TILE / 2, z0: z - PLOT_TILE / 2, z1: z + PLOT_TILE / 2 };
        if (index.hits(box)) continue;
        index.add(box);
        // the front door looks at the road: along Z for east-west roads, turned a quarter for north-south ones
        const lot = road.axis === 'x' ? { facing: side < 0 ? 1 : -1, yaw: 0 } : { facing: 1, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2 };
        ops.push({ t: 'plot+', plot: makeLot(city, { x, z, ...lot, status: opts.status ?? 'mixed', tier: opts.tier, district: opts.district }, id++) });
      }
    }
  }
  return ops;
}

// A park of the given rectangle, with its trees, monument and fountain as the generator makes them
export function makePark(city, rect, name = 'New Park', id = nextParkId(city)) {
  const rand = G.mulberry32(id.length * 7919 + Math.round(rect.x0 * 31 + rect.z0 * 17));
  const { monument, trees } = G.parkContents(rand, rect.x0, rect.x1, rect.z0, rect.z1, 1.0);
  return {
    id,
    name,
    edited: true,
    center: { x: r2((rect.x0 + rect.x1) / 2), z: r2((rect.z0 + rect.z1) / 2) },
    width: r2(rect.x1 - rect.x0),
    depth: r2(rect.z1 - rect.z0),
    trees,
    monument,
    landmarks: ['Fountain', 'Monument'],
    visits: 3000,
    boostPercent: 25,
    neighborIds: [],
  };
}

// ---- re-fitting lots ------------------------------------------------------------------------------------------------------------------------------------------
// After roads were moved, added or removed, some lots stand on a road or a park, on each other, or look at nothing. `refitLots` finds them and moves each to the nearest free
// place along a road's frontage (the lot keeps its size and tier; it turns to face the road). Returns { ops: ['plot~' ...], moved: [ids], stuck: [ids] }; the lots that found no
// room are left where they are, so the player can remove or move them. opts: { setback (gap between pavement and lot, default 0), reach (how far to look, default 30), ids (only these) }
const faceRoad = (road, side) => (road.axis === 'x' ? { facing: side < 0 ? 1 : -1, yaw: 0 } : { facing: 1, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2 });
const looksAtRoad = (L, p) => {
  const yaw = p.yaw ?? 0;
  const f = (p.facing ?? 1) * ((p.d ?? PLOT_TILE) / 2 + 2.2);
  const fx = p.x + Math.sin(yaw) * f;
  const fz = p.z + Math.cos(yaw) * f;
  return L.roads.some((r) => (r.axis === 'x' ? Math.abs(fz - r.center) < 4 && fx >= r.from - 1 && fx <= r.to + 1 : Math.abs(fx - r.center) < 4 && fz >= r.from - 1 && fz <= r.to + 1));
};
export function refitLots(city, opts = {}) {
  const L = city.layout;
  const setback = opts.setback ?? 0;
  const reach = opts.reach ?? 30;
  const only = opts.ids ? new Set(opts.ids) : null;
  const parkBoxes = L.parks.map((k) => ({ x0: k.center.x - k.width / 2, x1: k.center.x + k.width / 2, z0: k.center.z - k.depth / 2, z1: k.center.z + k.depth / 2 }));
  const hardIndex = new RectIndex([...L.roads.map(corridorOf), ...parkBoxes]);
  const shrink = (b) => ({ x0: b.x0 + 0.05, x1: b.x1 - 0.05, z0: b.z0 + 0.05, z1: b.z1 - 0.05 });
  // which lots are out of place: on a road or a park, or looking at no road
  const strandedIds = new Set();
  for (const p of city.plots) {
    if (only && !only.has(p.id)) continue;
    if (hardIndex.hits(shrink(plotBox(p))) || !looksAtRoad(L, p)) strandedIds.add(p.id);
  }
  // lots standing on each other: the later one is moved
  const seen = new RectIndex([]);
  for (const p of city.plots) {
    const b = shrink(plotBox(p));
    if (!strandedIds.has(p.id) && seen.hits(b) && (!only || only.has(p.id))) strandedIds.add(p.id);
    else if (!strandedIds.has(p.id)) seen.add(plotBox(p));
  }
  const stranded = city.plots.filter((p) => strandedIds.has(p.id)).sort((a, b) => a.id - b.id);
  // the ground that stays taken: roads, parks, and every lot that is not moving
  const taken = new RectIndex([...L.roads.map(corridorOf), ...parkBoxes, ...city.plots.filter((p) => !strandedIds.has(p.id)).map(plotBox)]);
  const ops = [];
  const moved = [];
  const stuck = [];
  for (const p of stranded) {
    const w = p.w ?? PLOT_TILE;
    const d = p.d ?? PLOT_TILE;
    let best = null;
    for (const road of L.roads) {
      for (const side of [-1, 1]) {
        const off = side * (HALF_CORRIDOR + d / 2 + setback);
        const along = road.axis === 'x' ? p.x : p.z;
        const across = road.axis === 'x' ? p.z : p.x;
        if (Math.abs(across - (road.center + off)) > reach) continue;
        for (let u = Math.max(road.from + w / 2, along - reach); u <= Math.min(road.to - w / 2, along + reach) + 1e-9; u += 0.5) {
          if (road.gaps.some(([a, b]) => u + w / 2 > a && u - w / 2 < b)) continue; // not across a junction
          const x = road.axis === 'x' ? u : road.center + off;
          const z = road.axis === 'x' ? road.center + off : u;
          const dist = Math.hypot(x - p.x, z - p.z);
          if (best && dist >= best.dist) continue;
          const box = road.axis === 'x' ? { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 } : { x0: x - d / 2, x1: x + d / 2, z0: z - w / 2, z1: z + w / 2 };
          if (taken.hits(shrink(box))) continue;
          best = { dist, x: r2(x), z: r2(z), box, ...faceRoad(road, side) };
        }
      }
    }
    if (!best || best.dist > reach) {
      stuck.push(p.id);
      taken.add(plotBox(p)); // it stays, and others keep clear of it
      continue;
    }
    taken.add(best.box);
    moved.push(p.id);
    ops.push({ t: 'plot~', id: p.id, set: { x: best.x, z: best.z, facing: best.facing, yaw: best.yaw } });
  }
  return { ops, moved, stuck };
}

// ---- checking -------------------------------------------------------------------------------------------------------------------------------------------------------
// What is wrong with a city, as { level: 'error' | 'warn', kind, message, x, z, ids }. Errors would break the game's traffic or walking (a road that ends in nothing, two roads on top
// of each other); warnings are things that look wrong (a lot on a road, a lot whose door faces nothing, two junctions too close).
export function validate(city) {
  const L = city.layout;
  const issues = [];
  const add = (level, kind, message, x, z, ids = []) => issues.push({ level, kind, message, x: r2(x), z: r2(z), ids });
  // every road starts and ends at a junction (the traffic simulation needs it)
  for (const r of L.roads) {
    if (r.to - r.from < 4) add('error', 'short-road', `${r.name} is shorter than 4`, r.axis === 'x' ? (r.from + r.to) / 2 : r.center, r.axis === 'x' ? r.center : (r.from + r.to) / 2, [r.id]);
    for (const end of [r.from, r.to]) {
      const [x, z] = r.axis === 'x' ? [end, r.center] : [r.center, end];
      if (!L.intersections.some((i) => Math.abs(i.x - x) < 0.02 && Math.abs(i.z - z) < 0.02)) add('error', 'loose-end', `${r.name} ends in nothing here: end it on another road`, x, z, [r.id]);
    }
    // junctions no closer than 5.5
    const at = L.intersections.filter((i) => (r.axis === 'x' ? Math.abs(i.z - r.center) < 0.02 && i.x >= r.from - 0.02 && i.x <= r.to + 0.02 : Math.abs(i.x - r.center) < 0.02 && i.z >= r.from - 0.02 && i.z <= r.to + 0.02)).map((i) => (r.axis === 'x' ? i.x : i.z)).sort((a, b) => a - b);
    for (let k = 1; k < at.length; k++) if (at[k] - at[k - 1] < 5.5 - 1e-6 && at[k] - at[k - 1] > 1e-6) add('warn', 'close-junctions', `two junctions on ${r.name} are ${r2(at[k] - at[k - 1])} apart (at least 5.5 is safe)`, r.axis === 'x' ? at[k] : r.center, r.axis === 'x' ? r.center : at[k], [r.id]);
  }
  // roads on top of each other
  for (let i = 0; i < L.roads.length; i++) {
    for (let j = i + 1; j < L.roads.length; j++) {
      const a = L.roads[i];
      const b = L.roads[j];
      if (a.axis !== b.axis || Math.abs(a.center - b.center) >= 2 * HALF_CORRIDOR - 1e-6) continue;
      const lo = Math.max(a.from, b.from);
      const hi = Math.min(a.to, b.to);
      if (hi - lo > 0.5) add('error', 'overlapping-roads', `${a.name} and ${b.name} lie on top of each other`, a.axis === 'x' ? (lo + hi) / 2 : a.center, a.axis === 'x' ? a.center : (lo + hi) / 2, [a.id, b.id]);
    }
  }
  // lots: on a road, on each other, in a park, facing nothing
  const roadIndex = new RectIndex(L.roads.map(corridorOf));
  const parkIndex = new RectIndex(L.parks.map((k) => ({ x0: k.center.x - k.width / 2, x1: k.center.x + k.width / 2, z0: k.center.z - k.depth / 2, z1: k.center.z + k.depth / 2 })));
  const lotIndex = new RectIndex([]);
  for (const p of city.plots) {
    const box = plotBox(p);
    if (roadIndex.hits(box)) add('warn', 'lot-on-road', `lot #${p.id} stands on a road`, p.x, p.z, [p.id]);
    else if (parkIndex.hits(box) && p.edited) add('warn', 'lot-in-park', `lot #${p.id} stands in a park`, p.x, p.z, [p.id]);
    if (p.edited && lotIndex.hits({ x0: box.x0 + 0.05, x1: box.x1 - 0.05, z0: box.z0 + 0.05, z1: box.z1 - 0.05 })) add('warn', 'lots-overlap', `lot #${p.id} overlaps another lot`, p.x, p.z, [p.id]);
    lotIndex.add(box);
  }
  for (const p of city.plots.filter((q) => q.edited)) {
    // the front door's point, 1 in front of the plot (its +Z, turned by yaw, times facing)
    const yaw = p.yaw ?? 0;
    const f = (p.facing ?? 1) * ((p.d ?? PLOT_TILE) / 2 + 2.2);
    const fx = p.x + Math.sin(yaw) * f;
    const fz = p.z + Math.cos(yaw) * f;
    if (!roadIndex.hits({ x0: fx - 0.3, x1: fx + 0.3, z0: fz - 0.3, z1: fz + 0.3 }) && !L.roads.some((r) => (r.axis === 'x' ? Math.abs(fz - r.center) < 4 && fx >= r.from - 1 && fx <= r.to + 1 : Math.abs(fx - r.center) < 4 && fz >= r.from - 1 && fz <= r.to + 1))) add('warn', 'no-road', `lot #${p.id}'s door faces no road`, p.x, p.z, [p.id]);
  }
  return { issues, errors: issues.filter((i) => i.level === 'error'), warnings: issues.filter((i) => i.level === 'warn') };
}

// A one-line summary of what was edited, for the editor's header
export function summarizeEdits(ops) {
  const n = (t) => ops.filter((o) => o.t === t).length;
  return { roadsAdded: n('road+'), roadsRemoved: n('road-'), roadsChanged: n('road~'), lotsAdded: n('plot+'), lotsRemoved: n('plot-'), lotsChanged: n('plot~'), parks: n('park+') + n('park-') + n('park~') };
}
