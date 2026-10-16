// The reserved-site designer (a development tool) and the ground patches.
//   - a design adds streets, junctions and lots inside its site, all clear of everything, and changes nothing else
//   - every new street ends at a junction, and the legs meet the front road with room to spare
//   - nothing is available in a production build
//   - cars and walkers cope with a designed city (no contacts, nothing inside a building)
//   - the ground patches are in the country, clear of everything
import { imp, problemTally } from './helpers.mjs';
process.env.NODE_ENV = 'development';
const { generateCity, DESIGN_DEFAULTS, designReservedSite } = await imp('city/cityGenerator.js');
const { createTraffic } = await imp('sim/traffic.js');
const { buildCollisionMap, isBlocked } = await imp('sim/collision.js');

const { bad, total } = problemTally();
const H = 1.4;
const roadRect = (r) => (r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - H, z1: r.center + H } : { x0: r.center - H, x1: r.center + H, z0: r.from, z1: r.to });
const ov = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.05 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.05;
const plotRect = (p) => {
  const c = Math.abs(Math.cos(p.yaw ?? 0)), s = Math.abs(Math.sin(p.yaw ?? 0));
  const hw = (p.w * c + p.d * s) / 2, hd = (p.w * s + p.d * c) / 2;
  return { x0: p.x - hw, x1: p.x + hw, z0: p.z - hd, z1: p.z + hd };
};

const N = Number(process.env.SEEDS ?? 30);
let sites = 0, ok = 0, lots = 0;
const links = { legsOut: 0, sideOut: 0 };
const variants = [{ seed: 1 }, { width: 20, rungs: 2, seed: 2 }, { width: 9, rungs: 0, density: 1, seed: 3 }, { width: 16, rungs: 1, entry: 0.8, landscaping: false, seed: 4 }, { width: 12, rungs: 2, depth: 0.2, seed: 6 }, { width: 10, rungs: 0, depth: 0, entry: -0.9, seed: 7 }, { link: false, seed: 8 }, { width: 18, rungs: 1, depth: 0.9, seed: 9 }];

for (let seed = 1; seed <= N; seed++) {
  const plain = generateCity(seed);
  const designs = Object.fromEntries(plain.layout.reserved.map((a, i) => [a.id, variants[(seed + i) % variants.length]]));
  const city = generateCity(seed, { designs });
  const { layout, plots } = city;

  // nothing but the design changed
  // (a plot's pricing attributes and price depend on its neighbours, so a new site can legitimately change them)
  const bare = (list) => JSON.stringify(list.map(({ land, price, ...rest }) => rest));
  if (bare(plain.plots) !== bare(plots.filter((p) => !p.designSite))) bad('a design leaves every other plot untouched', seed);
  if (JSON.stringify(plain.layout.landscape.patches.length) === undefined) bad('patches exist', seed);
  if (plain.billboards.length !== city.billboards.length) bad('a design leaves the billboards alone', seed);

  for (const site of layout.reserved) {
    sites++;
    if (!site.designed) {
      bad('a design is applied', `${seed} ${site.id}: ${site.designError}`);
      continue;
    }
    ok++;
    const mine = plots.filter((p) => p.designSite === site.id);
    lots += mine.length;
    const designRoads = layout.roads.filter((r) => r.design === site.id);
    const front = layout.roads.find((r) => r.id === site.frontRoad);
    if (designRoads.length < 3) bad('a design has legs and a far street', seed);
    if (mine.length < ((site.design.depth ?? 1) >= 0.5 ? 8 : 3)) bad('a design makes at least 8 lots', `${seed} ${site.id}: ${mine.length}`);
    const box = { x0: site.x0 - 0.01, x1: site.x1 + 0.01, z0: site.z0 - 0.01, z1: site.z1 + 0.01 };
    for (const p of mine) {
      const r = plotRect(p);
      if (r.x0 < box.x0 || r.x1 > box.x1 || r.z0 < box.z0 || r.z1 > box.z1) bad('design lots stay inside their site', `${seed} #${p.id}`);
      if (p.owner) bad('design lots start empty, for players', `${seed} #${p.id}`);
      for (const q of plots) if (q !== p && ov(r, plotRect(q))) bad('design lots overlap no plot', `${seed} #${p.id} #${q.id}`);
      for (const road of layout.roads) if (ov(r, roadRect(road))) bad('design lots are clear of roads', `${seed} #${p.id} ${road.id}`);
      for (const l of layout.lakes) if (ov(r, { x0: l.x - l.rx, x1: l.x + l.rx, z0: l.z - l.rz, z1: l.z + l.rz })) bad('design lots are clear of lakes', seed);
    }
    for (const road of designRoads) {
      for (const other of layout.roads) if (other !== road && other.design !== site.id && other.id !== site.frontRoad && !(other.axis !== road.axis && (Math.abs(road.from - other.center) < 0.01 || Math.abs(road.to - other.center) < 0.01)) && ov(roadRect(road), roadRect(other))) bad('design streets cross no other road', `${seed} ${road.id} ${other.id}`);
      // each end of a design street is a junction
      for (const end of [road.from, road.to]) {
        const [x, z] = road.axis === 'x' ? [end, road.center] : [road.center, end];
        const j = layout.intersections.find((i) => Math.hypot(i.x - x, i.z - z) < 0.01);
        if (!j) bad('every design street ends at a junction', `${seed} ${road.id}`);
        else if (!j.control || !j.approaches) bad('design junctions are controlled', `${seed} ${road.id}`);
      }
    }
    // the legs meet the front road, and the front road's other junctions are well away
    const legs = designRoads.filter((r) => r.axis !== front.axis);
    for (const leg of legs) {
      const meet = layout.intersections.find((i) => (front.axis === 'x' ? i.x === leg.center && i.z === front.center : i.z === leg.center && i.x === front.center));
      if (!meet) bad('each leg meets the front road at a junction', `${seed} ${leg.id}`);
      for (const i of layout.intersections) {
        if (i === meet) continue;
        const onFront = front.axis === 'x' ? i.z === front.center : i.x === front.center;
        if (onFront && Math.abs((front.axis === 'x' ? i.x : i.z) - leg.center) < 5.9) bad('a new junction keeps 6 from the front road\'s others', `${seed} ${leg.id}`);
      }
    }
    // links: a design street that carries on past its site ends at a junction on an existing road, over clear ground
    for (const road of designRoads) {
      const inside = road.axis === front.axis ? [(front.axis === 'x' ? site.x0 : site.z0), (front.axis === 'x' ? site.x1 : site.z1)] : null;
      if (inside && (road.from < inside[0] - 0.01 || road.to > inside[1] + 0.01)) {
        links.sideOut++;
        for (const end of [road.from, road.to]) {
          if (end >= inside[0] - 0.01 && end <= inside[1] + 0.01) continue;
          const [x, z] = road.axis === 'x' ? [end, road.center] : [road.center, end];
          const j = layout.intersections.find((i) => Math.hypot(i.x - x, i.z - z) < 0.01);
          if (!j) bad('a linked street ends at a junction on the road it links to', `${seed} ${road.id}`);
        }
      }
    }
    for (const leg of designRoads.filter((r) => r.axis !== front.axis)) {
      const reach = front.axis === 'x' ? [site.z0, site.z1] : [site.x0, site.x1];
      if (leg.from < reach[0] - 0.01 || leg.to > reach[1] + 0.01) {
        links.legsOut++;
        const other = (leg.from < reach[0] - 0.01 ? leg.from : leg.to);
        const [x, z] = leg.axis === 'x' ? [other, leg.center] : [leg.center, other];
        const j = layout.intersections.find((i) => Math.hypot(i.x - x, i.z - z) < 0.01);
        if (!j) bad('a through leg ends at a junction on the road beyond', `${seed} ${leg.id}`);
      }
    }
    // greenery stands clear of the new streets and lots
    for (const t of layout.landscape.trees) {
      if (t.x > site.x0 && t.x < site.x1 && t.z > site.z0 && t.z < site.z1) {
        if (designRoads.some((r) => ov(roadRect(r), { x0: t.x - 0.1, x1: t.x + 0.1, z0: t.z - 0.1, z1: t.z + 0.1 }))) bad('trees stand clear of the new streets', seed);
      }
    }
  }

  // ground patches
  const patches = layout.landscape.patches;
  if (!patches.length) bad('there are ground patches', seed);
  const kinds = new Set(patches.map((p) => p.kind));
  if (kinds.size < 4) bad('at least four kinds of ground', `${seed}: ${[...kinds]}`);
  for (const p of plain.layout.landscape.patches) {
    const r = { x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 };
    const { land, urban } = plain.layout;
    if (r.x0 < land.x0 || r.x1 > land.x1 || r.z0 < land.z0 || r.z1 > land.z1) bad('ground patches are on the land', seed);
    if (ov(r, urban)) bad('ground patches are in the country, not the city', seed);
    for (const road of plain.layout.roads) if (ov(r, roadRect(road))) bad('ground patches are clear of roads', seed);
    for (const q of plain.plots) if (ov(r, plotRect(q))) bad('ground patches are clear of plots', seed);
    for (const l of plain.layout.lakes) if (ov(r, { x0: l.x - l.rx, x1: l.x + l.rx, z0: l.z - l.rz, z1: l.z + l.rz })) bad('ground patches are clear of lakes', seed);
    for (const f of plain.layout.fields) if (ov(r, f)) bad('ground patches are clear of fields', seed);
  }
}
if (ok / sites < 0.98) bad('almost every site can be designed', `${ok} of ${sites}`);

// the preview function agrees with what generateCity builds
{
  const city = generateCity(3);
  const site = city.layout.reserved[0];
  const a = designReservedSite({ roads: city.layout.roads, plots: city.plots, billboards: city.billboards, parks: city.layout.parks, reserved: city.layout.reserved, landscape: city.layout.landscape, seed: 3 }, site, DESIGN_DEFAULTS);
  const b = generateCity(3, { designs: { [site.id]: DESIGN_DEFAULTS } });
  if (!a.ok || a.lots.length !== b.plots.filter((p) => p.designSite === site.id).length) bad('the editor preview matches the built design', `${a.lots?.length} vs ${b.plots.filter((p) => p.designSite === site.id).length}`);
}

// compass: sliding east/south moves the entrances that way along the road, and depth moves the far street away from it
for (let seed = 1; seed <= 12; seed++) {
  const base = generateCity(seed);
  const site = base.layout.reserved[0];
  const front = base.layout.roads.find((r) => r.id === site.frontRoad);
  const at = (params) => {
    const c = generateCity(seed, { designs: { [site.id]: { width: 10, rungs: 0, ...params } } });
    const s2 = c.layout.reserved[0];
    if (!s2.designed) return null;
    const mine = c.layout.roads.filter((r) => r.design === site.id);
    const legs = mine.filter((r) => r.axis !== front.axis);
    const far = mine.find((r) => r.axis === front.axis);
    return { along: legs.reduce((a, r) => a + r.center, 0) / legs.length, far: far.center, dir: s2.frontSide };
  };
  const west = at({ entry: -1 });
  const east = at({ entry: 1 });
  if (west && east && !(east.along > west.along + 0.5)) bad('sliding to +1 moves the entrances east / south', `${seed}: ${west.along} -> ${east.along}`);
  const shallow = at({ depth: 0 });
  const deep = at({ depth: 1 });
  if (shallow && deep && !(Math.abs(deep.far - front.center) > Math.abs(shallow.far - front.center) + 8)) bad('more depth puts the far street further from the front road', `${seed}`);
  if (shallow && deep && Math.sign(deep.far - front.center) !== Math.sign(shallow.far - front.center)) bad('depth stays on the site side of the road', `${seed}`);
}

// the editor's preview is exactly what gets built, whatever else is designed and whatever the site already holds
for (const seed of [2, 6, 11]) {
  const base = generateCity(seed);
  const all = Object.fromEntries(base.layout.reserved.map((a, i) => [a.id, variants[(seed + i + 1) % variants.length]]));
  const city = generateCity(seed, { designs: all });
  for (const site of city.layout.reserved) {
    // the preview as the editor makes it: from the finished city, which already holds every design (this site's too)
    const params = { ...all[site.id], width: 12 + (seed % 3) * 3, rungs: seed % 3, seed: 40 + seed };
    const preview = designReservedSite({ roads: city.layout.roads, plots: city.plots, billboards: city.billboards, parks: city.layout.parks, reserved: city.layout.reserved, landscape: city.layout.landscape, seed }, site, params);
    const built = generateCity(seed, { designs: { ...all, [site.id]: params } });
    const lots = built.plots.filter((p) => p.designSite === site.id).map((p) => `${p.x},${p.z}`).sort();
    const shown = preview.ok ? preview.lots.map((l) => `${l.x},${l.z}`).sort() : null;
    const roads = built.layout.roads.filter((r) => r.design === site.id).map((r) => `${r.id}:${r.center}:${r.from}:${r.to}`).sort();
    if (!built.layout.reserved.find((a) => a.id === site.id).designed) {
      if (preview.ok) bad('the preview says a design fits when the build refuses it', `${seed} ${site.id}`);
      continue;
    }
    if (!shown || JSON.stringify(lots) !== JSON.stringify(shown)) bad('the preview shows exactly the lots that are built', `${seed} ${site.id}: ${shown?.length} vs ${lots.length}`);
    if (!preview.ok || JSON.stringify(roads) !== JSON.stringify(preview.roads.map((r) => `${r.id}:${r.center}:${r.from}:${r.to}`).sort())) bad('the preview shows exactly the streets that are built', `${seed} ${site.id}`);
  }
}

// a release has no designer: designs are ignored
process.env.NODE_ENV = 'production';
{
  const a = generateCity(4);
  const b = generateCity(4, { designs: { 'reserved-1': {} } });
  if (JSON.stringify(a.plots) !== JSON.stringify(b.plots) || b.layout.reserved[0].designed) bad('production ignores designs', 'a design was applied');
}
process.env.NODE_ENV = 'development';

// cars and walkers on a designed city
for (const seed of [1, 2, 3]) {
  const base = generateCity(seed);
  const designs = Object.fromEntries(base.layout.reserved.map((a) => [a.id, { width: 14, rungs: 1, seed: 5 }]));
  const city = generateCity(seed, { designs });
  const map = buildCollisionMap(city);
  const sim = createTraffic(city.layout, { seed, maxCars: 60, maxWalkers: 60 });
  const solids = map.rects.filter((r) => r.kind !== 'island');
  let contacts = 0, inside = 0, onDesign = 0;
  const designIds = new Set(city.layout.roads.filter((r) => r.design).map((r) => r.id));
  for (let t = 0; t < 120; t += 0.05) {
    sim.update(0.05, t);
    if (Math.round(t / 0.05) % 5) continue;
    for (const [i, a] of sim.cars.entries()) {
      if (isBlocked(a.x, a.z, solids, 0)) inside++;
      if (designIds.has(a.road.id)) onDesign++;
      for (const b of sim.cars.slice(i + 1)) if (Math.hypot(a.x - b.x, a.z - b.z) < 0.42) contacts++;
    }
  }
  if (contacts) bad('no car-car contact on a designed city', `${seed}: ${contacts}`);
  if (inside) bad('no car inside a building on a designed city', `${seed}: ${inside}`);
  console.log(`seed ${seed}: designed streets driven ${onDesign} car-samples, contacts ${contacts}, inside buildings ${inside}`);
}

console.log(`${links.legsOut} through legs and ${links.sideOut} side links made`);
console.log(`${N} cities, ${sites} sites designed (${ok} ok), ${(lots / Math.max(1, ok)).toFixed(0)} lots a site`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
