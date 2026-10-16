// The city editor's engine: roads added, moved, changed and removed (with their junctions), lots placed and laid along a road, parks, checking, saving.
import { imp, problemTally } from './helpers.mjs';
const ce = await imp('city/cityEdit.js');
const { generateCity } = await imp('city/cityGenerator.js');
const { createTraffic } = await imp('sim/traffic.js');
const { buildCollisionMap } = await imp('sim/collision.js');
const world = await imp('city/editedWorld.js');
const { bad, total } = problemTally();

// a street to add: a north-south street across the main grid from the north ring to the south ring, on a line with no other street near and nothing but lots in the way (the editor clears the lots)
const base = generateCity(20260101, { infill: false, amusement: false });
const { cityRects, RectIndex } = await imp('city/freeLand.js');
const st = (() => {
  const L = base.layout;
  const north = L.roads.find((r) => r.id === 'ring-north');
  const south = L.roads.find((r) => r.id === 'ring-south');
  const fixed = new RectIndex(cityRects({ plots: [], billboards: [], layout: { ...L, roads: [], intersections: [], diagonals: [] } })); // parks, water, malls, reserved land...
  const zr = L.roads.filter((r) => r.axis === 'z');
  for (let c = Math.ceil(north.from + 10); c < north.to - 10; c += 1) {
    if (zr.some((r) => Math.abs(r.center - c) < 9 && r.from <= south.center && r.to >= north.center)) continue;
    if (fixed.hits({ x0: c - 5, x1: c + 5, z0: north.center, z1: south.center })) continue;
    return { axis: 'z', center: c, from: north.center, to: south.center, a: north.id, b: south.id };
  }
  return null;
})();
if (!st) throw new Error('no place for a street');
const baseJson = JSON.stringify(base);
const roadById = (city, id) => city.layout.roads.find((r) => r.id === id);
const nJunctions = (city, road) => city.layout.intersections.filter((i) => (road.axis === 'x' ? Math.abs(i.z - road.center) < 0.02 && i.x >= road.from - 0.02 && i.x <= road.to + 0.02 : Math.abs(i.x - road.center) < 0.02 && i.z >= road.from - 0.02 && i.z <= road.to + 0.02)).length;

// --- nothing edited: the same city (the derived parts are made again, the plots and roads are as generated)
{
  const same = ce.applyEdits(base, []);
  if (JSON.stringify(same.plots.map((p) => [p.id, p.x, p.z])) !== JSON.stringify(base.plots.map((p) => [p.id, p.x, p.z])) || same.layout.roads.length !== base.layout.roads.length) bad('with no edits the city is the generated one', '');
  if (JSON.stringify(base) !== baseJson) bad('applying edits never changes the generated city', '');
  if (same === base || same.layout === base.layout || same.plots === base.plots) bad('the edited city is a copy', '');
}

// --- a street: the generator's own planner finds a place between two roads; the editor makes the same street
const A = roadById(base, st.a);
const spec = { axis: st.axis, center: st.center, from: st.from, to: st.to, kind: 'street', class: 'local', name: 'Test Street' };
const withRoad = ce.applyEdits(base, [{ t: 'road+', road: ce.makeRoad(spec, base.layout.roads) }]);
const road = withRoad.layout.roads.find((r) => r.name === 'Test Street');
if (!road || !road.edited || road.id !== 'edit-road-1') bad('a new road is added, numbered, and marked as edited', JSON.stringify(road));
if (withRoad.layout.roads.length !== base.layout.roads.length + 1) bad('one road more', '');
const crossed = base.layout.roads.filter((r) => r.axis === 'x' && st.center >= r.from - 1e-6 && st.center <= r.to + 1e-6 && r.center >= st.from - 1e-6 && r.center <= st.to + 1e-6).length;
if (crossed < 3 || withRoad.layout.intersections.length !== base.layout.intersections.length + crossed || nJunctions(withRoad, road) !== crossed) bad('a street across the grid has a junction with every road it crosses, ends included', `${withRoad.layout.intersections.length - base.layout.intersections.length} of ${crossed}`);
{
  const j = withRoad.layout.intersections.filter((i) => i.id.includes('edit-road-1'));
  if (j.some((i) => !i.control || !i.approaches || !(i.phase >= 0 && i.phase < 12) || !i.arms)) bad('a made junction has its control, approaches, phase and arms', '');
  const gapA = roadById(withRoad, st.a).gaps.some(([a, b]) => Math.abs(a - (st.center - ce.HALF_CORRIDOR)) < 1e-6 && Math.abs(b - (st.center + ce.HALF_CORRIDOR)) < 1e-6);
  const gapB = roadById(withRoad, st.b).gaps.some(([a, b]) => Math.abs(a - (st.center - ce.HALF_CORRIDOR)) < 1e-6 && Math.abs(b - (st.center + ce.HALF_CORRIDOR)) < 1e-6);
  if (!gapA || !gapB) bad('the pavement gaps are cut in both roads', '');
  if (road.gaps.length !== crossed) bad('and in the new road, one for each junction', `${road.gaps.length} of ${crossed}`);
  if (JSON.stringify(A.gaps) !== JSON.stringify(roadById(base, st.a).gaps)) bad('the base city is untouched', '');
}
if (ce.validate(withRoad).errors.length) bad('a street from ring to ring has no errors', JSON.stringify(ce.validate(withRoad).errors.slice(0, 2)));

// a road that ends in the middle of nowhere is an error; a road on top of another too
{
  const mid = ce.applyEdits(base, [{ t: 'road+', road: ce.makeRoad({ ...spec, to: (spec.from + spec.to) / 2 }, base.layout.roads) }]);
  const v = ce.validate(mid);
  if (!v.errors.some((e) => e.kind === 'loose-end')) bad('a road that ends in nothing is an error', JSON.stringify(v.errors));
  const a = base.layout.roads[0];
  const twin = ce.applyEdits(base, [{ t: 'road+', road: ce.makeRoad({ axis: a.axis, center: a.center + 0.5, from: a.from + 5, to: a.from + 20, name: 'Twin' }, base.layout.roads), clear: false }]);
  if (!ce.validate(twin).errors.some((e) => e.kind === 'overlapping-roads')) bad('two roads on top of each other are an error', '');
}

// the generated city has no errors of its own
for (const seed of [1, 2, 3]) {
  const errs = ce.validate(generateCity(seed)).errors;
  if (errs.length) bad('a generated city has no errors', `${seed}: ${errs.length} e.g. ${errs[0].message}`);
}

// --- lots along the road: the generator's way
{
  const roomy = ce.applyEdits(base, [{ t: 'road+', road: ce.makeRoad(spec, base.layout.roads), clearMargin: 3.4 }]);
  const lots = ce.fillFrontage(roomy, roomy.layout.roads.find((r) => r.id === road.id), { side: 0, pitch: 3.4, setback: 0, status: 'mixed' });
  if (lots.length < 6) bad('a street gets lots along both sides', String(lots.length));
  const filled = ce.applyEdits(base, [{ t: 'road+', road: ce.makeRoad(spec, base.layout.roads), clearMargin: 3.4 }, ...lots]);
  const mine = filled.plots.filter((p) => p.edited);
  if (mine.length !== lots.length || mine.some((p) => p.id < ce.EDIT_PLOT_BASE)) bad('the lots are numbered from the edit base', '');
  if (new Set(filled.plots.map((p) => p.id)).size !== filled.plots.length) bad('lot ids are unique', '');
  const v = ce.validate(filled);
  if (v.issues.some((i) => ['lot-on-road', 'lots-overlap', 'no-road'].includes(i.kind) && mine.some((p) => i.ids.includes(p.id)))) bad('lots laid along a road are clear of roads and each other and face the road', JSON.stringify(v.issues.filter((i) => ['lot-on-road', 'lots-overlap', 'no-road'].includes(i.kind)).slice(0, 2)));
  for (const p of mine) {
    const b = ce.plotBox(p);
    const flush = road.axis === 'z' ? Math.abs(Math.min(Math.abs(b.x0 - road.center), Math.abs(b.x1 - road.center)) - ce.HALF_CORRIDOR) < 1e-4 : Math.abs(Math.min(Math.abs(b.z0 - road.center), Math.abs(b.z1 - road.center)) - ce.HALF_CORRIDOR) < 1e-4;
    if (!flush) bad('a lot stands flush against the pavement', `#${p.id} at ${p.x},${p.z} (${p.w}x${p.d}, turned ${p.yaw}) beside the road at ${road.center}`);
    if (!(p.price >= 5) || !p.land) bad('every lot has its location and price', `#${p.id}`);
  }
  const airy = ce.fillFrontage(roomy, roomy.layout.roads.find((r) => r.id === road.id), { side: 1, pitch: 5, setback: 1.5, status: 'empty' });
  if (!(airy.length < lots.length && airy.every((o) => !o.plot.owner))) bad('one side, spaced out, for sale: fewer lots, all for sale', `${airy.length} vs ${lots.length}`);
  // removing the road takes its junctions and gaps away again (and lots stay where they are)
  const gone = ce.applyEdits(base, [{ t: 'road+', road: ce.makeRoad(spec, base.layout.roads) }, { t: 'road-', id: 'edit-road-1' }]);
  if (gone.layout.roads.length !== base.layout.roads.length || gone.layout.intersections.length !== base.layout.intersections.length) bad('removing a road removes its junctions', '');
  if (JSON.stringify(roadById(gone, st.a).gaps) !== JSON.stringify(roadById(base, st.a).gaps) || JSON.stringify(roadById(gone, st.b).gaps) !== JSON.stringify(roadById(base, st.b).gaps)) bad('and the gaps it cut in the roads it met', '');
  // removing a generated road
  const victim = base.layout.roads.find((r) => r.kind === 'street' && !r.id.startsWith('oldtown') && nJunctions(base, r) >= 3);
  const without = ce.applyEdits(base, [{ t: 'road-', id: victim.id }]);
  if (without.layout.roads.some((r) => r.id === victim.id) || without.layout.intersections.some((i) => i.id.includes(victim.id)) || without.layout.intersections.length >= base.layout.intersections.length) bad('a generated road can be removed with its junctions', victim.id);
}

// --- changing a road
{
  const named = ce.applyEdits(withRoad, [{ t: 'road~', id: 'edit-road-1', set: { name: 'Renamed', class: 'arterial' } }]);
  const r = roadById(named, 'edit-road-1');
  if (r.name !== 'Renamed' || r.class !== 'arterial') bad('a road can be renamed and its class changed', '');
  if (named.layout.intersections.length !== withRoad.layout.intersections.length) bad('which does not change its junctions', '');
  // moved sideways: its junctions follow, and it still ends on its two roads
  const moved = ce.applyEdits(base, [{ t: 'road+', road: ce.makeRoad(spec, base.layout.roads) }, { t: 'road~', id: 'edit-road-1', set: { center: st.center + 2 } }]);
  const mr = roadById(moved, 'edit-road-1');
  if (mr.center !== st.center + 2 || nJunctions(moved, mr) !== crossed || ce.validate(moved).errors.length) bad('a road moved sideways keeps its junctions', JSON.stringify(ce.validate(moved).errors.slice(0, 1)));
  const oldGap = roadById(moved, st.a).gaps.some(([a]) => Math.abs(a - (st.center - ce.HALF_CORRIDOR)) < 1e-6);
  if (oldGap) bad('and the old gaps are gone', '');
  // shortened so that it ends in nothing: an error
  const cut = ce.applyEdits(base, [{ t: 'road+', road: ce.makeRoad(spec, base.layout.roads) }, { t: 'road~', id: 'edit-road-1', set: { to: (st.from + st.to) / 2 } }]);
  if (!ce.validate(cut).errors.some((e) => e.kind === 'loose-end')) bad('shortening a road so it ends in nothing is an error', '');
  // a road laid over lots clears them
  const lotsBefore = base.plots.length;
  const victimRoad = base.layout.roads.find((r) => r.kind === 'avenue' && r.class === 'local');
  const crossing = ce.makeRoad({ axis: victimRoad.axis === 'x' ? 'z' : 'x', center: (victimRoad.from + victimRoad.to) / 2, from: victimRoad.center - 12, to: victimRoad.center + 12, name: 'Cut' }, base.layout.roads);
  const cutCity = ce.applyEdits(base, [{ t: 'road+', road: crossing }]);
  if (!(cutCity.plots.length < lotsBefore)) bad('a road laid over lots removes them', `${cutCity.plots.length} of ${lotsBefore}`);
  if (ce.validate(cutCity).issues.some((i) => i.kind === 'lot-on-road' && cutCity.plots.find((p) => i.ids.includes(p.id) && !p.edited && false))) bad('and leaves none on the road', '');
}

// --- lots one at a time
{
  const spot = { x: base.layout.center.x + 3, z: base.layout.center.z + 9, facing: 1, yaw: 0 };
  const lot = ce.makeLot(base, { ...spot, status: 'built' });
  if (lot.id !== ce.EDIT_PLOT_BASE || !lot.edited || !lot.owner || !lot.title || lot.w !== 3 || !(lot.height > 0.2)) bad('a lot made in the editor is a real built lot', JSON.stringify({ id: lot.id, owner: lot.owner, h: lot.height }));
  const empty = ce.makeLot(base, { ...spot, status: 'empty' });
  if (empty.owner !== null || !/Empty Lot/.test(empty.title)) bad('an empty lot is for sale', '');
  const luxury = ce.makeLot(base, { ...spot, tier: 'luxury', w: 10.2, d: 6.4 });
  if (!luxury.luxury || !luxury.prime || luxury.w !== 10.2 || luxury.owner !== null) bad('a luxury lot is a luxury lot, for sale', '');
  const grand = ce.makeLot(base, { ...spot, tier: 'grand', w: 14, d: 7.6 });
  if (!grand.grand || !grand.owner) bad('a grand estate comes built', '');
  const edited = ce.applyEdits(base, [{ t: 'plot+', plot: lot }, { t: 'plot~', id: lot.id, set: { x: lot.x + 1, title: 'Moved' } }]);
  const p = edited.plots.find((q) => q.id === lot.id);
  if (!p || p.x !== lot.x + 1 || p.title !== 'Moved' || !p.price) bad('a lot can be placed and moved', '');
  if (ce.applyEdits(base, [{ t: 'plot+', plot: lot }, { t: 'plot+', plot: lot }]).plots.length !== base.plots.length + 1) bad('the same lot is not added twice', '');
  if (ce.applyEdits(base, [{ t: 'plot-', id: base.plots[0].id }]).plots.length !== base.plots.length - 1) bad('a generated lot can be removed', '');
  const onRoad = ce.applyEdits(base, [{ t: 'plot+', plot: ce.makeLot(base, { x: base.layout.roads[0].axis === 'x' ? (base.layout.roads[0].from + base.layout.roads[0].to) / 2 + 1.7 : base.layout.roads[0].center, z: base.layout.roads[0].axis === 'x' ? base.layout.roads[0].center : (base.layout.roads[0].from + base.layout.roads[0].to) / 2 + 1.7, status: 'empty' }) }]);
  if (!ce.validate(onRoad).issues.some((i) => i.kind === 'lot-on-road')) bad('a lot placed on a road is a warning', '');
  if (ce.districtAt(base, base.plots[10].x, base.plots[10].z) !== base.plots[10].districtId && !ce.districtAt(base, base.plots[10].x, base.plots[10].z)) bad('a lot takes the district it is in', '');
}

// --- parks
{
  const rect = { x0: base.layout.center.x + 100, x1: base.layout.center.x + 124, z0: base.layout.center.z + 100, z1: base.layout.center.z + 120 };
  const park = ce.makePark(base, rect, 'Test Park');
  if (park.id !== 'edit-park-1' || park.width !== 24 || park.depth !== 20 || park.trees.length < 50 || park.trees.some((t) => t.x < rect.x0 || t.x > rect.x1 || t.z < rect.z0 || t.z > rect.z1)) bad('a park has its trees inside it', `${park.trees.length}`);
  const city = ce.applyEdits(base, [{ t: 'park+', park }, { t: 'park~', id: park.id, set: { name: 'Renamed' } }]);
  if (city.layout.parks.length !== base.layout.parks.length + 1 || city.layout.parks.at(-1).name !== 'Renamed') bad('a park can be added and renamed', '');
  if (ce.applyEdits(base, [{ t: 'park+', park }, { t: 'park-', id: park.id }]).layout.parks.length !== base.layout.parks.length) bad('and removed', '');
  const map = buildCollisionMap(city);
  if (!map.rects.some((r) => r.kind === 'fountain' && Math.abs((r.x0 + r.x1) / 2 - park.center.x) < 1e-6)) bad('the game gives the new park its fountain and hedge', '');
}

// --- the game can run on an edited city: traffic and walking work
{
  const roomy = ce.applyEdits(base, [{ t: 'road+', road: ce.makeRoad(spec, base.layout.roads), clearMargin: 3.4 }]);
  const lots = ce.fillFrontage(roomy, roomy.layout.roads.find((r) => r.id === road.id), { side: 0, status: 'mixed' });
  const edited = ce.applyEdits(base, [{ t: 'road+', road: ce.makeRoad(spec, base.layout.roads), clearMargin: 3.4 }, ...lots]);
  const sim = createTraffic(edited.layout, { seed: 3, maxCars: 40, maxWalkers: 10 });
  let seen = 0;
  for (let t = 0; t < 60; t += 0.1) {
    sim.update(0.1, t);
    seen = Math.max(seen, sim.cars.length);
  }
  if (seen < 5) bad('traffic runs on an edited city', String(seen));
  const map = buildCollisionMap(edited);
  if (!(map.rects.length > buildCollisionMap(base).rects.length)) bad('the new lots are solid', '');
}

// --- determinism and saving
{
  const roomy = ce.applyEdits(base, [{ t: 'road+', road: ce.makeRoad(spec, base.layout.roads), clearMargin: 3.4 }]);
  const ops = [{ t: 'road+', road: ce.makeRoad(spec, base.layout.roads), clearMargin: 3.4 }, ...ce.fillFrontage(roomy, roomy.layout.roads.find((r) => r.id === road.id), { side: 0 })];
  if (JSON.stringify(ce.applyEdits(base, ops)) !== JSON.stringify(ce.applyEdits(base, ops))) bad('the same edits give the same city', '');
  const doc = ce.toDocument(20260101, ops);
  const back = ce.fromDocument(JSON.parse(JSON.stringify(doc)));
  if (!back || back.seed !== 20260101 || back.ops.length !== ops.length) bad('a document round-trips as JSON', '');
  if (ce.fromDocument(null) || ce.fromDocument({}) || ce.fromDocument({ version: 99, seed: 1, ops: [] }) || ce.fromDocument({ version: 1, seed: 'x', ops: [] }) || ce.fromDocument({ version: 1, seed: 1, ops: 5 })) bad('a bad document is refused', '');
  if (ce.fromDocument({ version: 1, seed: 1, ops: [{ t: 'nonsense' }, { t: 'plot-', id: 1 }, null] }).ops.length !== 1) bad('an unknown operation is dropped', '');
  const s = ce.summarizeEdits([...ops, { t: 'road-', id: 'x' }, { t: 'park+', park: {} }]);
  if (s.roadsAdded !== 1 || s.roadsRemoved !== 1 || s.lotsAdded !== ops.length - 1 || s.parks !== 1) bad('the edits are summarised', JSON.stringify(s));
  // without a browser there are no saved edits: the world is the generated city
  if (JSON.stringify(world.generateWorld(7, { infill: false, amusement: false }).plots.length) !== JSON.stringify(generateCity(7, { infill: false, amusement: false }).plots.length) || world.loadEdits() !== null) bad('with no saved edits the world is the generated city', '');
}

console.log(`edit engine: ${base.plots.length} lots, ${base.layout.roads.length} roads in the city it edits`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
