// Free land and the infill planner: new streets across the free ground between roads, outer blocks in the country, and what they do to the city.
import { imp, problemTally } from './helpers.mjs';
const { generateCity, PLOT_TILE } = await imp('city/cityGenerator.js');
const fl = await imp('city/freeLand.js');
const inf = await imp('city/infill.js');
const lp = await imp('game/landPrice.js');
const { bad, total } = problemTally();

// --- the geometry helpers
const idx = new fl.RectIndex([{ x0: 0, x1: 10, z0: 0, z1: 10 }, { x0: 100, x1: 101, z0: 100, z1: 101 }]);
if (!idx.hits({ x0: 5, x1: 6, z0: 5, z1: 6 }) || idx.hits({ x0: 10, x1: 20, z0: 0, z1: 10 }) || idx.hits({ x0: 20, x1: 30, z0: 20, z1: 30 }) || !idx.hits({ x0: 100.5, x1: 120, z0: 90, z1: 100.5 })) bad('the rectangle index finds overlaps, not touching edges', '');
if (inf.GEOM.tile !== PLOT_TILE) bad('the infill planner uses the generator\'s plot size', `${inf.GEOM.tile} vs ${PLOT_TILE}`);
const z = fl.freeZones([{ x0: 0, x1: 20, z0: 0, z1: 4 }], { x0: 0, x1: 20, z0: 0, z1: 20 }, { cell: 2, clear: 0, minArea: 4 });
if (z.zones.length !== 1 || z.zones[0].area !== 320) bad('free zones: a 20 x 20 square with a 4 deep strip taken has 320 free', JSON.stringify(z.zones.map((q) => q.area)));
if (fl.capacityOf(1000) !== Math.floor(1000 * fl.PLOTS_PER_AREA * 0.75)) bad('capacity of 1000 square units', String(fl.capacityOf(1000)));

// --- a planned street: it runs between two roads, with lots both sides
const roads = [
  { id: 'a', kind: 'avenue', axis: 'x', center: 0, from: -100, to: 100, gaps: [] },
  { id: 'b', kind: 'avenue', axis: 'x', center: 30, from: -100, to: 100, gaps: [] },
];
const wall = [{ x0: -100, x1: 100, z0: -1.4, z1: 1.4 }, { x0: -100, x1: 100, z0: 28.6, z1: 31.4 }];
const plan = inf.planInfill({ roads, obstacles: wall, bounds: { x0: -100, x1: 100, z0: -10, z1: 40 }, extra: 1000, centre: { x: 0, z: 15 } });
if (plan.streets.length < 10) bad('a 200 x 30 gap between two avenues takes many streets', String(plan.streets.length));
for (const st of plan.streets) {
  if (st.axis !== 'z' || st.from !== 0 || st.to !== 30 || st.perSide < 3) bad('each street runs from one avenue to the next', JSON.stringify(st));
}
const centres = plan.streets.map((s) => s.center).sort((p, q) => p - q);
for (let i = 1; i < centres.length; i++) if (centres[i] - centres[i - 1] < 2 * inf.STRIP_HALF_WIDTH - 0.01) bad('streets are far enough apart for a yard between their back-to-back lots', `${centres[i - 1]} ${centres[i]}`);
const few = inf.planInfill({ roads, obstacles: wall, bounds: { x0: -100, x1: 100, z0: -10, z1: 40 }, extra: 20, centre: { x: 0, z: 15 } });
if (few.streets.length < 1 || few.streets.length > 3) bad('it stops once it has planned enough lots', String(few.streets.length));
const blocked = inf.planInfill({ roads, obstacles: [...wall, { x0: -100, x1: 100, z0: 10, z1: 20 }], bounds: { x0: -100, x1: 100, z0: -10, z1: 40 }, extra: 1000, centre: { x: 0, z: 15 } });
if (blocked.streets.length !== 0) bad('a street never goes through something that is in the way', String(blocked.streets.length));
const same = inf.planInfill({ roads, obstacles: wall, bounds: { x0: -100, x1: 100, z0: -10, z1: 40 }, extra: 1000, centre: { x: 0, z: 15 } });
if (JSON.stringify(same) !== JSON.stringify(plan)) bad('the same input gives the same plan', '');

// --- outer blocks: a far road and legs from the county road, the legs sliding along to clear its junctions
{
  const county = { id: 'county-north', kind: 'county', axis: 'x', center: 0, from: -200, to: 200, gaps: [] };
  const cross = [-110, -82.4, -54.8, -27.2, 0.4, 28, 55.6, 83.2, 110.8].map((c, i) => ({ id: `s${i}`, kind: 'street', axis: 'z', center: c, from: 0, to: 120, gaps: [] })); // streets coming in from the city side, 27.6 apart
  const bands = inf.planBands({ roads: [county, ...cross], obstacles: [], bounds: { x0: -300, x1: 300, z0: -200, z1: 200 }, extra: 400, centre: { x: 0, z: 200 } });
  if (bands.blocks.length < 2) bad('the county road gets outer blocks', String(bands.blocks.length));
  for (const b of bands.blocks) {
    if (b.legs.length < 3) bad('a block has several legs, not just a pair, even with junctions every 27.6', String(b.legs.length));
    for (let i = 0; i < b.legs.length; i++) {
      if (cross.some((q) => Math.abs(q.center - b.legs[i].center) < inf.BANDS.junctionSpacing - 1e-6)) bad('no leg is next to a junction on the county road', String(b.legs[i].center));
      if (i && (b.legs[i].center - b.legs[i - 1].center < 2 * inf.STRIP_HALF_WIDTH - 1e-6 || b.legs[i].center - b.legs[i - 1].center > 2 * inf.STRIP_HALF_WIDTH + inf.BANDS.slide + 1e-6)) bad('legs are one pitch apart, or a little more where one slid', String(b.legs[i].center - b.legs[i - 1].center));
    }
    if (!(b.far.from === b.legs[0].center && b.far.to === b.legs[b.legs.length - 1].center && b.far.axis === 'x')) bad('the far road joins the outer two legs', JSON.stringify(b.far));
    if (!(b.legs.every((l) => l.axis === 'z' && l.from === -b.depth && l.to === 0))) bad('each leg runs from the county road out to the far road', JSON.stringify(b.legs[0]));
  }
  const walled = inf.planBands({ roads: [county, ...cross], obstacles: [{ x0: -300, x1: 300, z0: -8, z1: -1 }], bounds: { x0: -300, x1: 300, z0: -200, z1: 200 }, extra: 400, centre: { x: 0, z: 200 } });
  if (walled.blocks.length !== 0) bad('nothing is built across a wall just outside the county road', String(walled.blocks.length));
  const why = {};
  inf.planBands({ roads: [county, ...cross], obstacles: [{ x0: -300, x1: 300, z0: -8, z1: -1 }], bounds: { x0: -300, x1: 300, z0: -200, z1: 200 }, extra: 400, centre: { x: 0, z: 200 }, why });
  if (!Object.keys(why).some((k) => /in the way/.test(k))) bad('the reasons a place is turned down are counted', JSON.stringify(why));
}

// --- whole cities
const SEEDS = Number(process.env.SEEDS ?? 8);
const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.02 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.02;
let sizes = [];
let usedUp = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const off = generateCity(seed, { infill: false });
  const city = generateCity(seed);
  const { plots, layout } = city;
  const streets = layout.roads.filter((r) => r.infill);
  sizes.push(plots.length);
  if (off.layout.roads.some((r) => r.infill) || off.plots.some((p) => p.districtId === 'meadow')) bad('infill can be switched off', seed);
  if (plots.length < 780 || plots.length > 1200) bad('about a thousand lots with the new streets (fewer where the land is cut up by lakes, airports and hills)', `${seed}: ${plots.length}`);
  if (!streets.length) { bad('a city gets new streets', seed); continue; }
  // every new road ends in a junction at both ends: some other road (not itself) has its middle line there, within its span
  const meets = (r, end) => {
    const at = end === 'from' ? r.from : r.to;
    return layout.roads.some((q) => q !== r && q.axis !== r.axis && Math.abs(q.center - at) < 1e-6 && r.center >= q.from - 1e-6 && r.center <= q.to + 1e-6);
  };
  for (const r of streets) if (!meets(r, 'from') || !meets(r, 'to')) bad('every new road ends in a junction at both ends', `${seed} ${r.id}`);
  // each has a junction in the list of junctions at both ends
  for (const r of streets) {
    const ends = layout.intersections.filter((i) => (r.axis === 'z' ? Math.abs(i.x - r.center) < 1e-6 : Math.abs(i.z - r.center) < 1e-6));
    if (ends.length < 2) bad('new roads have their junctions', `${seed} ${r.id}: ${ends.length}`);
  }
  // the lots on the new streets stand on them, clear of every road and of each other
  const mine = plots.filter((p) => p.districtId === 'meadow');
  if (mine.length < 100) bad('the new streets carry lots', `${seed}: ${mine.length}`);
  const rect = (p) => {
    const c = Math.abs(Math.cos(p.yaw ?? 0));
    const s = Math.abs(Math.sin(p.yaw ?? 0));
    return { x0: p.x - (p.w * c + p.d * s) / 2, x1: p.x + (p.w * c + p.d * s) / 2, z0: p.z - (p.w * s + p.d * c) / 2, z1: p.z + (p.w * s + p.d * c) / 2 };
  };
  const corridor = (r) => (r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - 1.4, z1: r.center + 1.4 } : { x0: r.center - 1.4, x1: r.center + 1.4, z0: r.from, z1: r.to });
  const roadRects = layout.roads.map(corridor);
  let onRoad = 0;
  let touching = 0;
  for (const p of mine) {
    const r = rect(p);
    if (roadRects.some((q) => overlap(r, q))) onRoad++;
    if (plots.some((o) => o !== p && overlap(r, rect(o)))) touching++;
  }
  if (onRoad) bad('a lot is never on a road', `${seed}: ${onRoad}`);
  if (touching) bad('lots never overlap', `${seed}: ${touching}`);
  // nothing else was moved into the new streets: no plot of any kind overlaps a new road
  const streetRects = streets.map(corridor);
  const trespass = plots.filter((p) => streetRects.some((q) => overlap(rect(p), q))).length;
  if (trespass) bad('no plot stands on a new street', `${seed}: ${trespass}`);
  // the new roads keep clear of the reserved sites, water, parks, airports and malls
  const keepClear = [...layout.reserved.map((a) => ({ x0: a.x0, x1: a.x1, z0: a.z0, z1: a.z1 })), ...layout.parks.map((k) => ({ x0: k.center.x - k.width / 2, x1: k.center.x + k.width / 2, z0: k.center.z - k.depth / 2, z1: k.center.z + k.depth / 2 })), ...layout.airports.map((a) => a.rect), ...layout.malls.map((m) => m.rect), ...layout.lakes.map((l) => ({ x0: l.x - l.rx, x1: l.x + l.rx, z0: l.z - l.rz, z1: l.z + l.rz })), ...layout.rivers.map((v) => ({ x0: v.x0, x1: v.x1, z0: v.z0, z1: v.z1 }))];
  if (streetRects.some((q) => keepClear.some((k) => overlap(q, k)))) bad('new streets keep clear of reserved land, parks, airports, malls and water', seed);
  if (plots.some((p) => p.districtId === 'meadow' && layout.reserved.some((a) => overlap(rect(p), a)))) bad('no lot on reserved land', seed);
  // the mix of tiers holds for the bigger city
  const want = lp.tierTargets(plots.length);
  const have = (t) => plots.filter((p) => (t === 'grand' ? p.grand : t === 'luxury' ? p.luxury && !p.grand : p.prime && !p.luxury)).length;
  if (Math.abs(have('prime') - want.prime) > want.prime * 0.25) bad('about 8% prime', `${seed}: ${have('prime')} vs ${want.prime}`);
  if (Math.abs(have('luxury') - want.luxury) > want.luxury * 0.3) bad('about 2.5% luxury', `${seed}: ${have('luxury')} vs ${want.luxury}`);
  if (Math.abs(have('grand') - want.grand) > Math.max(2, want.grand * 0.4)) bad('about 0.8% grand', `${seed}: ${have('grand')} vs ${want.grand}`);
  // ids are unique, and every plot has a price
  if (new Set(plots.map((p) => p.id)).size !== plots.length) bad('plot ids are unique', seed);
  if (plots.some((p) => !(p.price >= 5))) bad('every lot has a price', seed);
  // generating twice gives the same city
  if (JSON.stringify(generateCity(seed).plots.map((p) => [p.id, p.x, p.z])) !== JSON.stringify(plots.map((p) => [p.id, p.x, p.z]))) bad('the same seed gives the same city', seed);
  // the land holds it all
  const { land } = layout;
  if (plots.some((p) => p.x < land.x0 || p.x > land.x1 || p.z < land.z0 || p.z > land.z1)) bad('every lot is on the land', seed);
  // how much free ground is left inside the county road (the planner took most of it)
  const county = layout.county;
  const left = fl.summarizeZones(fl.freeZones(fl.cityRects(city), county, { cell: 2, clear: 1 }).zones);
  const before = fl.summarizeZones(fl.freeZones(fl.cityRects(off), county, { cell: 2, clear: 1 }).zones);
  if (left.capacity > before.capacity + 12) bad('the new streets never add free ground inside the county road', `${seed}: ${before.capacity} -> ${left.capacity}`);
  if (left.capacity < before.capacity) usedUp++;
}
if (usedUp < SEEDS * 0.6) bad('in most cities the new streets use up free ground inside the county road', `${usedUp} of ${SEEDS}`);
console.log(`${SEEDS} cities: ${Math.min(...sizes)} to ${Math.max(...sizes)} lots`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
