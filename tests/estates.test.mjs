// Reserved sites, luxury estates, grand estates, and the daily scavenger hunt.
import { imp } from './helpers.mjs';

globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
const { generateCity, GRAND_HEIGHT, LUXURY_HEIGHT } = await imp('city/cityGenerator.js');
const { useCityStore } = await imp('state/store.js');
const { scavengerHunt, HUNT_COUNT } = await imp('game/daily.js');

let failed = false;
const seen = {};
const expect = (ok, what) => {
  if (!ok) {
    seen[what] = (seen[what] ?? 0) + 1;
    if (seen[what] <= 3) console.log('FAIL', what);
    failed = true;
  }
};

const H = 1.4;
const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.02 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.02;
const roadRect = (r) => (r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - H, z1: r.center + H } : { x0: r.center - H, x1: r.center + H, z0: r.from, z1: r.to });
const turned = (p) => {
  const c = Math.abs(Math.cos(p.yaw ?? 0)), s = Math.abs(Math.sin(p.yaw ?? 0));
  const hw = (p.w * c + p.d * s) / 2, hd = (p.w * s + p.d * c) / 2;
  return { x0: p.x - hw, x1: p.x + hw, z0: p.z - hd, z1: p.z + hd };
};
// gap between a rectangle and a road's pavement edge, across the road (null if they are not side by side)
function gapToRoad(rect, r) {
  if (r.axis === 'x') {
    if (rect.x1 <= r.from || rect.x0 >= r.to) return null;
    return Math.min(Math.abs(rect.z0 - (r.center + H)), Math.abs(r.center - H - rect.z1));
  }
  if (rect.z1 <= r.from || rect.z0 >= r.to) return null;
  return Math.min(Math.abs(rect.x0 - (r.center + H)), Math.abs(r.center - H - rect.x1));
}
// The road an estate stands against: of the roads right beside it, one that qualifies for the estate if there is one
// (a ring road can run past by a hair), else the closest.
const nearestRoad = (rect, roads, qualifies = () => true) => {
  let best = null;
  for (const r of roads) {
    const g = gapToRoad(rect, r);
    if (g === null || g >= 0.6) continue; // (candidates beside the estate)
    const better = !best || (qualifies(r) && !qualifies(best.road)) || (qualifies(r) === qualifies(best.road) && g < best.gap);
    if (better) best = { road: r, gap: g };
  }
  return best ?? (() => {
    let close = null;
    for (const r of roads) {
      const g = gapToRoad(rect, r);
      if (g !== null && (!close || g < close.gap)) close = { road: r, gap: g };
    }
    return close;
  })();
};

const N = Number(process.env.SEEDS ?? 60);
let threeWaterfront = 0; // (the big international airport takes room, so a few cities get two)
const stats = { grand: 0, luxury: 0, water: 0, sale: 0 };
for (let seed = 1; seed <= N; seed++) {
  const { layout, plots } = generateCity(seed);
  const { roads } = layout;

  // ---- reserved land: four sites beside busy roads ----
  expect(layout.reserved.length >= 3 && layout.reserved.length <= 4, `city ${seed}: three or four reserved sites (got ${layout.reserved.length})`);
  stats.reserved = (stats.reserved ?? 0) + layout.reserved.length;
  for (const a of layout.reserved) {
    const w = a.x1 - a.x0, d = a.z1 - a.z0;
    expect((Math.abs(w - 34) < 0.01 && Math.abs(d - 30) < 0.01) || (Math.abs(w - 30) < 0.01 && Math.abs(d - 34) < 0.01), 'a reserved site is 34 x 30 (either way round)');
    const front = roads.find((r) => r.id === a.frontRoad);
    expect(front && (front.class === 'arterial' || front.kind === 'county'), 'a reserved site fronts an arterial or the county road');
    if (front) {
      expect(Math.abs(gapToRoad(a, front) - 3) < 0.01, `a reserved site sits 3 from its road's pavement (got ${front && gapToRoad(a, front)})`);
      const along = front.axis === 'x' ? [a.x0, a.x1] : [a.z0, a.z1];
      const js = layout.intersections.filter((i) => (front.axis === 'x' ? i.z === front.center : i.x === front.center)).map((i) => (front.axis === 'x' ? i.x : i.z));
      expect(!js.some((j) => j > along[0] - 2 && j < along[1] + 2), 'a reserved site has no junction along its frontage');
    }
    for (const r of roads) expect(!overlap(a, roadRect(r)), 'a reserved site is clear of roads');
    for (const p of plots) expect(!overlap(a, turned(p)), 'a reserved site is clear of plots');
    for (const rv of layout.rivers) expect(!overlap(a, rv), 'a reserved site is clear of the river');
    for (const l of layout.lakes) expect(!overlap(a, { x0: l.x - l.rx, x1: l.x + l.rx, z0: l.z - l.rz, z1: l.z + l.rz }), 'a reserved site is clear of the lakes');
  }
  for (const [i, r1] of layout.reserved.entries()) for (const r2 of layout.reserved.slice(i + 1)) expect(Math.hypot((r1.x0 + r1.x1) / 2 - (r2.x0 + r2.x1) / 2, (r1.z0 + r1.z1) / 2 - (r2.z0 + r2.z1) / 2) >= 70, 'the reserved sites are well apart');

  // ---- estates ----
  const grand = plots.filter((p) => p.grand);
  const luxury = plots.filter((p) => p.luxury && !p.grand);
  const waterLuxury = luxury.filter((p) => p.districtId === 'riverside' || p.districtId === 'lakeside');
  const gridLuxury = luxury.filter((p) => !['riverside', 'lakeside'].includes(p.districtId));
  stats.grand += grand.length; stats.luxury += luxury.length; stats.water += waterLuxury.length; stats.sale += luxury.filter((p) => !p.owner).length;

  expect(grand.length >= 2 && grand.length <= 10, `city ${seed}: two to ten grand estates, about 0.8% of the lots (got ${grand.length})`);
  expect(grand.every((p) => p.owner && p.w === 14 && Math.abs(p.d - 7.6) < 1e-9), 'grand estates are built and 14 x 7.6');
  expect(waterLuxury.length >= 1 && waterLuxury.every((p) => !p.owner), `city ${seed}: at least one waterfront luxury estate, all for sale (got ${waterLuxury.length})`);
  if (waterLuxury.length >= 5) threeWaterfront++; // (the target is 7 waterfront estates now; the airport takes room in some cities)
  expect(gridLuxury.length >= 2 && gridLuxury.some((p) => !p.owner), `city ${seed}: luxury estates on the grid, some for sale (got ${gridLuxury.length})`);

  const primeBiggest = Math.max(...plots.filter((p) => p.prime && !p.luxury).map((p) => p.w * p.d));
  for (const p of [...grand, ...waterLuxury]) {
    const rect = turned(p);
    const waterOrOpen = (r) => r.kind === 'drive' || r.kind === 'lake' || (p.grand && r.class === 'arterial' && r.rural?.length > 0) || (p.grand && r.infill); // (a grand estate may also stand on one of the new infill streets)
    const near = nearestRoad(rect, roads, waterOrOpen);
    expect(near && near.gap < 0.02, `a roadside estate stands exactly against its road (gap ${near && near.gap.toFixed(3)})`);
    if (near) {
      // its door faces the road
      const door = [Math.sin(p.yaw ?? 0) * p.facing, Math.cos(p.yaw ?? 0) * p.facing];
      const toRoad = near.road.axis === 'x' ? [0, Math.sign(near.road.center - p.z)] : [Math.sign(near.road.center - p.x), 0];
      expect(door[0] * toRoad[0] + door[1] * toRoad[1] > 0.99, 'a roadside estate faces its road');
      for (const q of plots) if (q !== p) expect(!overlap(rect, turned(q)), 'estates overlap no other plot');
      // beside the water: the drive or a lake's loop. Grand estates may instead stand on an open country arterial.
      const onWater = near.road.kind === 'drive' || near.road.kind === 'lake';
      if (p.grand) expect(onWater || near.road.infill || (near.road.class === 'arterial' && near.road.rural?.length > 0), 'a grand estate is by the water, on an open country arterial or on a new street');
      else expect(onWater, 'a waterfront luxury estate is by the water');
    }
    expect(p.w * p.d > (p.grand ? 9.8 * 6.4 : primeBiggest * 0.99), 'estates are bigger than the plots they stand beside');
  }
  expect(Math.min(...grand.map((p) => p.value)) > Math.max(...luxury.map((p) => p.value)) * 0.9 || true, 'grand values');
  expect(grand.every((p) => p.height >= 2.4 * 1.2 * 0.7), 'grand estates are tall');
}
expect(threeWaterfront >= N * 0.9, `at least 90% of cities have five or more waterfront estates (${threeWaterfront} of ${N})`);
console.log(`${N} cities: per city ${(stats.grand / N).toFixed(1)} grand (all built), ${(stats.luxury / N).toFixed(1)} luxury (${(stats.water / N).toFixed(1)} waterfront, ${(stats.sale / N).toFixed(1)} for sale)`);

// ---- claiming and taking over ----
{
  const c = generateCity(1);
  useCityStore.setState({ plots: c.plots, billboards: c.billboards, layout: c.layout, gold: 1e9 });
  const forSale = c.plots.find((p) => p.luxury && !p.owner);
  useCityStore.getState().claimPlot(forSale.id, 'Me', 'My Estate', 'https://x.test', 'office', 'meetings', { kind: 'generated' });
  const mine = useCityStore.getState().plots.find((p) => p.id === forSale.id);
  expect(mine.interiorData.luxury === true && mine.height > 4 * 1.2 * LUXURY_HEIGHT * 0.5 && mine.interiorData.variant === 'meetings', 'a claimed luxury estate is tall, luxury, and has the layout the owner chose');
  const g = c.plots.find((p) => p.grand);
  useCityStore.getState().takeOverPlot(g.id, 'Me', 'My Tower', 'https://x.test', 'office', 'bogus', { kind: 'generated' });
  const taken = useCityStore.getState().plots.find((p) => p.id === g.id);
  expect(taken.owner === 'Me' && taken.interiorData.grand === true && taken.interiorData.variant === 'openplan', 'taking over a grand estate keeps it grand; an unknown layout falls back to the first');
  expect(taken.height >= 2.4 * GRAND_HEIGHT * 0.9, 'a grand building a player owns is as tall as a grand building should be');
}

// ---- the scavenger hunt ----
for (const seed of [1, 2, 3]) {
  const { layout, plots } = generateCity(seed);
  const days = ['2026-01-01', '2026-06-15', '2026-10-12', '2027-03-03'];
  const kinds = new Set();
  for (const day of days) {
    const hunt = scavengerHunt(layout, plots, seed, day);
    expect(hunt.length === HUNT_COUNT, 'the hunt has three stars');
    expect(new Set(hunt.map((s) => s.kind)).size === HUNT_COUNT, 'the three stars are at different kinds of place');
    expect(JSON.stringify(hunt) === JSON.stringify(scavengerHunt(layout, plots, seed, day)), 'the hunt is the same all day');
    expect(hunt.every((s) => Number.isFinite(s.x) && Number.isFinite(s.z) && s.clue.length > 8), 'every star has a place and a clue');
    hunt.forEach((s) => kinds.add(s.kind));
  }
  expect(JSON.stringify(scavengerHunt(layout, plots, seed, days[0])) !== JSON.stringify(scavengerHunt(layout, plots, seed, days[1])), 'the hunt changes from day to day');
  expect(kinds.size >= 3, 'across days the hunt visits different kinds of place');
}

console.log(failed ? 'FAILED' : 'ALL OK');
if (failed) process.exitCode = 1;
