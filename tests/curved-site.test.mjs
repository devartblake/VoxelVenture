// The curved reserved site (the "crescent"): a curved street that leaves the front road, sweeps round and returns, with turned lots on both sides.
//   - a curved design changes nothing but its own site, and the street and every lot lie inside the site
//   - lots do not overlap one another, the street or the front road; every door is on open ground
//   - the street is walkable end to end, and the front road's traffic still runs with the design in the city
import { imp, problemTally } from './helpers.mjs';
process.env.NODE_ENV = 'development';
const { generateCity } = await imp('city/cityGenerator.js');
const { sampleCurve, boxesOverlap, plotProblems } = await imp('city/curves.js');
const { buildCollisionMap, isBlocked, buildingHalf } = await imp('sim/collision.js');
const { createTraffic } = await imp('sim/traffic.js');
const { bad, total } = problemTally();

const variants = [{ style: 'curve', seed: 1 }, { style: 'curve', radius: 9, width: 22, seed: 2 }, { style: 'curve', radius: 6.5, width: 13, depth: 0.5, seed: 3 }, { style: 'curve', width: 20, entry: 0.8, seed: 4, landscaping: false }];
const N = Number(process.env.SEEDS ?? 30);
let tried = 0, built = 0, lotsTotal = 0, refused = 0;
const reasons = new Map();

for (let seed = 1; seed <= N; seed++) {
  const plain = generateCity(seed);
  const sites = plain.layout.reserved.filter((a) => !a.market);
  const designs = Object.fromEntries(sites.map((a, i) => [a.id, variants[(seed + i) % variants.length]]));
  const city = generateCity(seed, { designs });
  const { layout, plots } = city;
  if (JSON.stringify(plain.plots) !== JSON.stringify(plots.filter((p) => !p.designSite))) bad('a curved design leaves every other plot untouched', seed);
  if (plain.billboards.length !== city.billboards.length) bad('a curved design leaves the billboards alone', seed);
  const map = buildCollisionMap(city);

  for (const site of sites) {
    tried++;
    const real = layout.reserved.find((r) => r.id === site.id);
    if (!real.designed) {
      refused++;
      reasons.set(real.designError ?? 'no reason given', (reasons.get(real.designError ?? 'no reason given') ?? 0) + 1);
      if (!real.designError) bad('a refused design says why', `${seed} ${site.id}`);
      continue;
    }
    built++;
    const spec = layout.curvedRoads.find((c) => c.design === site.id);
    if (!spec) { bad('a curved design adds its street to curvedRoads', `${seed} ${site.id}`); continue; }
    if (real.designSummary?.curved !== true || real.designSummary.junctions !== 2) bad('the summary says a curve with two mouths', JSON.stringify(real.designSummary));
    const curve = sampleCurve(spec);
    const mine = plots.filter((p) => p.designSite === site.id);
    lotsTotal += mine.length;
    if (mine.length < 4) bad('a crescent has lots along it', `${seed} ${site.id}: ${mine.length}`);

    // the street is inside the site's width; walking: nowhere along it is solid
    const front = layout.roads.find((r) => r.id === site.frontRoad);
    for (let i = 0; i < curve.points.length; i += 6) {
      const pt = curve.points[i];
      const along = front.axis === 'x' ? pt.x : pt.z;
      const lo = front.axis === 'x' ? site.x0 : site.z0;
      const hi = front.axis === 'x' ? site.x1 : site.z1;
      if (along < lo - 0.01 || along > hi + 0.01) bad('the street lies inside the site across', `${seed} ${site.id} ${along.toFixed(1)}`);
      if (isBlocked(pt.x, pt.z, map.rects)) bad('the street is walkable end to end', `${seed} ${site.id} at ${pt.x.toFixed(1)},${pt.z.toFixed(1)}`);
    }
    // its two ends are at the front road's pavement, on the site's side
    const ends = [curve.points[0], curve.points[curve.points.length - 1]];
    for (const e of ends) {
      const n = Math.abs((front.axis === 'x' ? e.z : e.x) - front.center);
      if (Math.abs(n - 1.4) > 0.06) bad('the street meets the front road at its pavement', `${seed} ${site.id}: ${n.toFixed(2)}`);
    }
    // the mouths are curb cuts in the front road's pavement
    if (front.gaps.filter((g) => ends.some((e) => { const u = front.axis === 'x' ? e.x : e.z; return Math.abs((g[0] + g[1]) / 2 - u) < 0.05 && Math.abs(g[1] - g[0] - 2.8) < 0.05; })).length < 2) bad('the mouths are gaps in the front road pavement', `${seed} ${site.id}`);

    // lots: inside the site, clear of each other, the street and the rest of the city; doors on open ground
    const boxes = mine.map((p) => ({ x: p.x, z: p.z, hw: p.w / 2, hd: p.d / 2, yaw: p.yaw ?? 0 }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) if (boxesOverlap(boxes[i], boxes[j])) bad('lots do not overlap', `${seed} ${site.id}: ${i} and ${j}`);
    }
    const problems = plotProblems(curve, mine.map((p) => ({ x: p.x, z: p.z, yaw: p.yaw ?? 0 })), 3, 0.4).filter((m) => /reaches into the road/.test(m));
    if (problems.length) bad('no lot reaches into the street', `${seed} ${site.id}: ${problems[0]}`);
    for (const p of mine) {
      const c = Math.abs(Math.cos(p.yaw ?? 0)), s = Math.abs(Math.sin(p.yaw ?? 0));
      const hw = (p.w * c + p.d * s) / 2, hd = (p.w * s + p.d * c) / 2;
      if (p.x - hw < site.x0 - 0.01 || p.x + hw > site.x1 + 0.01 || p.z - hd < site.z0 - 0.01 || p.z + hd > site.z1 + 0.01) bad('lots are inside the site', `${seed} ${site.id} #${p.id}`);
      const out = (p.facing ?? 1) * (buildingHalf(p).hd + 0.33);
      const yaw = p.yaw ?? 0;
      if (isBlocked(p.x + Math.sin(yaw) * out, p.z + Math.cos(yaw) * out, map.rects)) bad('every door opens on open ground', `${seed} ${site.id} #${p.id}`);
      const frontDist = Math.abs((front.axis === 'x' ? p.z : p.x) - front.center);
      if (frontDist - hd < 1.4 + 0.05) bad('lots are clear of the front road', `${seed} ${site.id} #${p.id}`);
    }
    if (mine.some((p) => !p.designSite || p.owner)) bad('curved lots start empty and tagged to the site', site.id);
  }

  // the front road's traffic and walkers cope with a city that has a curved site (a short run)
  if (seed <= 4) {
    const sim = createTraffic(layout, { seed, maxCars: 30, maxWalkers: 30 });
    for (let t = 0; t < 40; t += 0.05) sim.update(0.05, t);
    if (sim.cars.some((c) => !Number.isFinite(c.x) || !Number.isFinite(c.z))) bad('traffic runs with a curved site in the city', seed);
  }
}
if (built < tried * 0.5) bad('most reserved sites take a crescent', `${built} of ${tried}`);
console.log(`${built} of ${tried} sites took a crescent (${lotsTotal} lots); ${refused} refused: ${[...reasons].map(([r, n]) => `${n}x ${r.slice(0, 50)}`).join('; ')}`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
