// More lots for the town, added AFTER the generator has finished (docs/world/world_recipe.md, "More plots in the first town"). The city generator (cityGenerator.js) is
// left exactly as it is: the live database holds claims on its plots, so no plot it makes may move, change or be renumbered. This module takes the finished city and
// adds to it, with its own deterministic choices, and `tests/town-extension.test.mjs` proves the first plots are byte for byte the same.
//
// How: the county ring's outer side is lined with lots, so a new street cannot branch off just anywhere. Where a lot was skipped there is a gap wider than a street (3.8
// against 2.8), so one connector can pass through it. Beyond the ring is farmland. A LOOP is one such connector out from the ring, ending at a closed rectangle of four new
// streets (their corners are junctions, so no street ends in nothing), with lots on both sides of every street. One gap serves a whole loop. Junctions, pavement gaps,
// lots and prices are made with the city editor's own functions (cityEdit.js), which make them the way the generator does.
//
//   extendTown(base, { target })       -> a new city: base's plots untouched, plus the new roads and lots (ids from the first free one up)
//   generateTown(seed, options)        -> generateCity(seed, options), extended unless options.extraPlots === false or NEXT_PUBLIC_EXTRA_PLOTS=0
//   checkExtension(city)               -> the editor's checks (loose ends, lots on roads, ...) on the new streets and lots: [] when nothing is wrong
import { generateCity, PLOT_TILE } from './cityGenerator';
import { HALF_CORRIDOR, applyEdits, makeLot, validate } from './cityEdit';
import { RectIndex, cityRects } from './freeLand';
import { LOTS } from './infill';

export const EXTRA_TARGET = 200; // lots to add (the loops that fit decide the exact number)
export const EXTENSION_VERSION = 1;
const NEAR = [18, 22]; // how far from the ring road the loop's near street runs
const LENGTHS = [120, 100, 84, 70, 58, 48, 40, 32, 26]; // the loop's size along the ring, longest tried first
const WIDTHS = [40, 32, 26, 20, 15]; // and out from it (two rows of lots back to back need about 12)
const SHARES = [0.5, 0.25, 0.75, 0.35, 0.65, 0.12, 0.88]; // where along the loop the connector lands
const MIN_LOOP_LOTS = 18; // a loop must carry at least this many lots to be worth its streets
const END_MARGIN = 14; // from the ends of the ring road (its corners)
const JUNCTION_SPACING = 6.5; // between junctions on one road
const STEP = 0.5;
const SIDES = ['county-north', 'county-east', 'county-south', 'county-west'];
const NAMES = ['Orchard Way', 'Hedgerow Lane', 'Millrace Road', 'Pasture Lane', 'Barley Close', 'Copse Road', 'Fallow Way', 'Haymow Lane', 'Furrow Street', 'Glebe Road', 'Granary Lane', 'Meadowsweet Way', 'Cowslip Road', 'Windrow Lane', 'Tithe Street', 'Sheepwalk Road', 'Hollow Lane', 'Stile Way', 'Culvert Road', 'Sedge Lane', 'Brookside Way', 'Thistle Close', 'Lark Rise', 'Plover Lane'];
const SUFFIX = ['', ' Row', ' End', ' Close'];

// the width of a street with its two rows of lots, from the street's middle to the far edge of the lots
const ROW_REACH = HALF_CORRIDOR + LOTS.setback + PLOT_TILE;
const r2 = (n) => Math.round(n * 100) / 100;
const rect = (axis, along0, along1, across0, across1) => (axis === 'x' ? { x0: along0, x1: along1, z0: across0, z1: across1 } : { x0: across0, x1: across1, z0: along0, z1: along1 });
const grow = (q, m) => ({ x0: q.x0 - m, x1: q.x1 + m, z0: q.z0 - m, z1: q.z1 + m });

/** The next plot id above every plot the generator made (design and editor lots sit far above these and are ignored). */
export const nextBaseId = (city) => Math.max(...city.plots.map((p) => p.id).filter((n) => n < 100000)) + 1;

/** The lots along a straight new street (a road object with `setback` and `pitch`): positions only, both sides, between the junctions' gaps. */
function lotSpots(road, index) {
  const spots = [];
  const blocks = [];
  let cursor = road.from;
  for (const [a, b] of [...road.gaps].sort((p, q) => p[0] - q[0])) {
    if (a > cursor) blocks.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < road.to) blocks.push([cursor, road.to]);
  // a road whose lots are only in its country stretches (`rural`) keeps to them
  const stretches = road.rural ? blocks.flatMap(([a, b]) => road.rural.map(([ra, rb]) => [Math.max(a, ra), Math.min(b, rb)])).filter(([a, b]) => b - a >= PLOT_TILE) : blocks;
  for (const side of road.sides ?? [-1, 1]) {
    const offset = side * (HALF_CORRIDOR + road.setback + PLOT_TILE / 2);
    for (const [a, b] of stretches) {
      for (let u = a + PLOT_TILE / 2; u + PLOT_TILE / 2 <= b + 1e-9; u += road.pitch) {
        const x = road.axis === 'x' ? u : road.center + offset;
        const z = road.axis === 'x' ? road.center + offset : u;
        const lot = { x0: x - PLOT_TILE / 2, x1: x + PLOT_TILE / 2, z0: z - PLOT_TILE / 2, z1: z + PLOT_TILE / 2 };
        if (index.hits(lot)) continue;
        index.add(lot);
        // the front door looks at the road: along Z for east-west roads, turned a quarter for north-south ones
        spots.push(road.axis === 'x' ? { x, z, facing: side < 0 ? 1 : -1, yaw: 0 } : { x, z, facing: 1, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2 });
      }
    }
  }
  return spots;
}

/** Whether a point or rectangle of the landscape lies in `rects` (grown by `m`). */
const touches = (rects, m) => (item) => {
  if (item.x0 !== undefined) return rects.some((r) => item.x0 < r.x1 + m && item.x1 > r.x0 - m && item.z0 < r.z1 + m && item.z1 > r.z0 - m);
  return rects.some((r) => item.x > r.x0 - m && item.x < r.x1 + m && item.z > r.z0 - m && item.z < r.z1 + m);
};

/** The loops that fit on one side of a road with lots (`outward` is -1 or 1, the side), best first: [{ C, outward, c, near, far, e0, e1, whole, link, score }], each checked against `index` (which it does not change). */
function loopsAlong(C, outward, city, index, claimed) {
  const L = city.layout;
  const junctions = L.roads.filter((q) => q.axis !== C.axis && q.center >= C.from - 1e-6 && q.center <= C.to + 1e-6 && C.center >= q.from - 1e-6 && C.center <= q.to + 1e-6).map((q) => q.center);
  const land = L.land;
  const inLand = (q) => q.x0 >= land.x0 + 4 && q.x1 <= land.x1 - 4 && q.z0 >= land.z0 + 4 && q.z1 <= land.z1 - 4;
  const acr = (n) => C.center + outward * n; // a distance out from the ring road, as a coordinate across
  const found = [];
  for (let c = Math.ceil(C.from + END_MARGIN); c <= C.to - END_MARGIN; c += STEP) {
    if (junctions.some((j) => Math.abs(j - c) < JUNCTION_SPACING) || (claimed.get(C.id) ?? []).some((q) => Math.abs(q - c) < JUNCTION_SPACING)) continue;
    for (const near of NEAR) {
      // the connector: from the ring road's edge to the loop's near street, through the gap
      const link = rect(C.axis, c - HALF_CORRIDOR, c + HALF_CORRIDOR, Math.min(acr(HALF_CORRIDOR), acr(near - HALF_CORRIDOR)), Math.max(acr(HALF_CORRIDOR), acr(near - HALF_CORRIDOR)));
      if (index.hits(link)) continue;
      for (const width of WIDTHS) {
        for (const length of LENGTHS) {
          for (const share of SHARES) {
            const e0 = r2(c - length * share);
            const e1 = r2(e0 + length);
            if (e0 < C.from + 6 || e1 > C.to - 6) continue;
            if (c - e0 < JUNCTION_SPACING || e1 - c < JUNCTION_SPACING) continue; // the connector keeps clear of the loop's corners
            const far = near + width;
            const whole = grow(rect(C.axis, e0, e1, Math.min(acr(near), acr(far)), Math.max(acr(near), acr(far))), ROW_REACH);
            if (!inLand(whole) || index.hits(whole)) continue;
            found.push({ C, outward, c, near: r2(acr(near)), far: r2(acr(far)), e0, e1, whole, link, score: length * width });
            break;
          }
        }
      }
    }
  }
  found.sort((a, b) => b.score - a.score || a.c - b.c);
  return found;
}

export function extendTown(base, { target = EXTRA_TARGET } = {}) {
  const L = base.layout;
  const index = new RectIndex(cityRects(base));
  const claimed = new Map();
  const taken = new Set(L.roads.map((r) => r.id));
  // every straight road with lots along it can carry a loop out from either side; the county ring first, the rest in order
  const sides = [...L.roads].filter((r) => r.frontage && !r.design && r.to - r.from > 2 * END_MARGIN + 20).sort((a, b) => (SIDES.includes(a.id) ? 0 : 1) - (SIDES.includes(b.id) ? 0 : 1) || (a.id < b.id ? -1 : 1)).flatMap((r) => [{ C: r, outward: -1 }, { C: r, outward: 1 }]);
  const ops = [];
  const roads = [];
  const newRects = [];
  let nameAt = 0;
  let planned = 0;

  // one loop per side in turn (so they are spread round the town), the biggest that fits on that side, until enough lots are planned
  for (let round = 0; round < 6 && planned < target; round++) {
    let progressed = false;
    for (const { C, outward } of sides) {
      if (planned >= target) break;
      const choice = loopsAlong(C, outward, base, index, claimed).find((o) => !index.hits(o.whole) && !index.hits(o.link));
      if (!choice) continue;
      const perimeterLots = Math.floor(2 * ((2 * (choice.e1 - choice.e0) + 2 * Math.abs(choice.far - choice.near)) / LOTS.pitch) * 0.8);
      if (perimeterLots < MIN_LOOP_LOTS) continue;
      progressed = true;
      const mk = (kind) => { let i = 1; while (taken.has(`ext-${kind}-${i}`)) i++; taken.add(`ext-${kind}-${i}`); return `ext-${kind}-${i}`; };
      const base_ = NAMES[nameAt % NAMES.length] + (nameAt >= NAMES.length ? ` ${Math.floor(nameAt / NAMES.length) + 1}` : '');
      nameAt++;
      const cross = C.axis === 'x' ? 'z' : 'x';
      const spec = (axis, center, from, to, name, frontage) => ({ id: mk(frontage ? 'street' : 'link'), axis, center: r2(center), from: r2(from), to: r2(to), kind: frontage ? 'infill' : 'street', class: 'local', name, frontage, ...(frontage && { setback: LOTS.setback, pitch: LOTS.pitch }), color: '#e2e8f0' });
      const lo = Math.min(choice.near, choice.far);
      const hi = Math.max(choice.near, choice.far);
      const loop = [
        spec(C.axis, choice.near, choice.e0, choice.e1, base_ + SUFFIX[0], 'infill'), // the near street, parallel to the ring
        spec(C.axis, choice.far, choice.e0, choice.e1, base_ + SUFFIX[1], 'infill'), // the far one
        spec(cross, choice.e0, lo, hi, base_ + SUFFIX[2], 'infill'), // the two ends
        spec(cross, choice.e1, lo, hi, base_ + SUFFIX[3], 'infill'),
      ];
      const link = spec(cross, choice.c, Math.min(C.center, choice.near), Math.max(C.center, choice.near), `${base_} Link`, null);
      roads.push(...loop, link);
      ops.push(...[...loop, link].map((road) => ({ t: 'road+', road, clear: false })));
      index.add(choice.whole);
      index.add(choice.link);
      newRects.push(choice.whole, { ...choice.link, link: true });
      claimed.set(C.id, [...(claimed.get(C.id) ?? []), choice.c]);
      planned += perimeterLots; // an estimate: the lots are counted for real below
    }
    if (!progressed) break;
  }

  // the roads first (junctions and pavement gaps are made as the generator makes them), then the lots on the new streets
  const withRoads = applyEdits(base, ops);
  const road = (id) => withRoads.layout.roads.find((r) => r.id === id);
  const lotIndex = new RectIndex(cityRects(base));
  for (const r of roads) if (r.frontage) lotIndex.add(grow(rect(r.axis, r.from, r.to, r.center - HALF_CORRIDOR, r.center + HALF_CORRIDOR), 0)); // the streets themselves are in the way too
  let nextId = nextBaseId(base);
  const lots = [];
  for (const r of roads.filter((x) => x.frontage)) {
    const built = road(r.id);
    built.setback = r.setback;
    built.pitch = r.pitch;
    for (const spot of lotSpots(built, lotIndex)) {
      const plot = makeLot(withRoads, { ...spot, status: 'mixed', district: 'meadow' }, nextId++);
      delete plot.edited;
      lots.push(plot);
    }
  }
  // then the single free places along the roads that already have lots (where the generator skipped one), by the road's own rules; not on the lake roads, which are capped
  const DISTRICT_OF = { country: 'countryside', outskirts: 'outskirts', riverside: 'riverside', infill: 'meadow' };
  const taken_ = new RectIndex([]);
  for (const q of lotIndex.all) taken_.add(q);
  for (const r of roads) taken_.add(rect(r.axis, r.from, r.to, r.center - HALF_CORRIDOR, r.center + HALF_CORRIDOR));
  for (const rc of newRects) if (rc.link) taken_.add(rc);
  for (const r of L.roads) {
    if (!r.frontage || !DISTRICT_OF[r.frontage] || r.design || r.id.startsWith('ext-')) continue;
    const built = withRoads.layout.roads.find((q) => q.id === r.id);
    for (const spot of lotSpots({ ...built, setback: built.setback ?? 0, pitch: built.pitch ?? PLOT_TILE + 0.4 }, taken_)) {
      const plot = makeLot(withRoads, { ...spot, status: 'mixed', district: DISTRICT_OF[r.frontage] }, nextId++);
      delete plot.edited;
      lots.push(plot);
    }
  }
  const ext = applyEdits(withRoads, lots.map((plot) => ({ t: 'plot+', plot })));
  // the editor recomputes every lot's land and price against all the lots: the first town's own stay exactly as the generator made them
  const original = new Map(base.plots.map((p) => [p.id, p]));
  for (const p of ext.plots) {
    const o = original.get(p.id);
    if (o) { p.land = o.land; p.price = o.price; }
  }
  for (const r of ext.layout.roads) if (r.id.startsWith('ext-')) { delete r.edited; r.extension = EXTENSION_VERSION; }
  delete ext.layout.edits;
  // the farmland, trees and ground under the new streets and lots give way
  for (const plot of lots) newRects.push({ x0: plot.x - PLOT_TILE / 2, x1: plot.x + PLOT_TILE / 2, z0: plot.z - PLOT_TILE / 2, z1: plot.z + PLOT_TILE / 2 });
  const gone = touches(newRects, 0.6);
  const ls = ext.layout.landscape;
  ls.trees = ls.trees.filter((t) => !gone(t));
  if (ls.bushes) ls.bushes = ls.bushes.filter((b) => !gone(b));
  if (ls.patches) ls.patches = ls.patches.filter((p) => !gone(p));
  ext.layout.fields = ext.layout.fields.filter((f) => !gone(f));
  ext.layout.woods = ext.layout.woods.filter((w) => !gone(w));
  ext.layout.extension = { version: EXTENSION_VERSION, firstId: nextBaseId(base), lots: lots.length, roads: roads.length, loops: roads.filter((r) => r.frontage).length / 4 };
  return ext;
}

/** What is wrong with the added streets and lots (the editor's own checks): [] when nothing is. */
export function checkExtension(city) {
  const marked = structuredClone(city);
  const first = city.layout.extension?.firstId ?? Infinity;
  for (const p of marked.plots) if (p.id >= first && p.id < 100000) p.edited = true;
  const { issues } = validate(marked);
  const mine = (i) => (i.ids ?? []).some((id) => (typeof id === 'string' ? id.startsWith('ext-') : id >= first && id < 100000));
  return issues.filter((i) => i.level === 'error' || mine(i));
}

export function generateTown(seed, options = {}) {
  const base = generateCity(seed, options);
  if (options.extraPlots === false || (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_EXTRA_PLOTS === '0')) return base;
  return extendTown(base, { target: typeof options.extraPlots === 'number' ? options.extraPlots : EXTRA_TARGET });
}
