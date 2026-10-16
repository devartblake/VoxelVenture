import { imp, problemTally } from './helpers.mjs';
const { generateCity } = await imp('city/cityGenerator.js');

const { tally, bad } = problemTally();
const H = 1.4;
const rectOfRoad = (r) => (r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - H, z1: r.center + H } : { x0: r.center - H, x1: r.center + H, z0: r.from, z1: r.to });
const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.02 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.02;
const plotRect = (p) => {
  // a plot turned along a road covers its turned bounds
  const c = Math.abs(Math.cos(p.yaw ?? 0)), sn = Math.abs(Math.sin(p.yaw ?? 0));
  const hw = (p.w * c + p.d * sn) / 2, hd = (p.w * sn + p.d * c) / 2;
  return { x0: p.x - hw, x1: p.x + hw, z0: p.z - hd, z1: p.z + hd };
};

const SEEDS = Number(process.argv[2] ?? process.env.SEEDS ?? 40);
let sizes = [], lakeCounts = [], lotCounts = [], bridgeCounts = [], ixKinds = { 4: 0, 3: 0, 2: 0 };
for (let seed = 1; seed <= SEEDS; seed++) {
  const c = generateCity(seed);
  const { layout, plots, billboards } = c;
  const { roads, intersections: ixs } = layout;

  // every end of every road is a junction
  const at = (x, z) => ixs.find((i) => Math.abs(i.x - x) < 1e-6 && Math.abs(i.z - z) < 1e-6);
  for (const r of roads) {
    const ends = r.axis === 'x' ? [[r.from, r.center, 'west'], [r.to, r.center, 'east']] : [[r.center, r.from, 'north'], [r.center, r.to, 'south']];
    for (const [x, z, missing] of ends) {
      const ix = at(x, z);
      if (!ix) { bad('road end is a junction', `${r.id} ends loose at ${x.toFixed(1)},${z.toFixed(1)}`); continue; }
      // the arm pointing back along the road must exist, and the one beyond the end must not
      const back = { west: 'east', east: 'west', north: 'south', south: 'north' }[missing];
      if (!ix.arms[back]) bad('end junction has an arm back along the road', `${r.id}`);
      if (ix.arms[missing]) bad('end junction has no arm beyond the end', `${r.id} ${ix.id}`);
    }
  }
  // arms vs approaches
  for (const i of ixs) {
    const n = Object.values(i.arms).filter(Boolean).length;
    ixKinds[n]++;
    for (const a of ['west', 'east', 'north', 'south']) {
      if (i.arms[a] && !i.approaches[a]) bad('every arm has a control', i.id);
      if (!i.arms[a] && i.approaches[a]) bad('no control on a missing arm', i.id);
    }
    if (i.control === 'roundabout' && n !== 4) bad('roundabouts are 4-way', i.id);
  }
  // spacing between junctions on one road
  for (const r of roads) {
    const js = ixs.filter((i) => (r.axis === 'x' ? i.z === r.center && i.x >= r.from - 1e-6 && i.x <= r.to + 1e-6 : i.x === r.center && i.z >= r.from - 1e-6 && i.z <= r.to + 1e-6)).map((i) => (r.axis === 'x' ? i.x : i.z)).sort((a, b) => a - b);
    for (let k = 1; k < js.length; k++) if (js[k] - js[k - 1] < 5.5) bad('junction spacing >= 5.5', `${r.id} ${(js[k] - js[k - 1]).toFixed(2)}`);
  }
  // no unintended touching: any two roads whose corridors overlap must have a junction
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) {
      const a = roads[i], b = roads[j];
      if (!overlap(rectOfRoad(a), rectOfRoad(b))) continue;
      if (a.axis === b.axis) { bad('parallel roads do not overlap', `${a.id}/${b.id}`); continue; }
      const h = a.axis === 'x' ? a : b, v = a.axis === 'x' ? b : a;
      if (!ixs.find((x) => x.x === v.center && x.z === h.center)) bad('overlapping roads meet at a junction', `${a.id}/${b.id}`);
    }
  }
  // plots clear of roads / each other / billboards / water
  const rects = plots.map(plotRect);
  const roadRects = roads.map(rectOfRoad);
  for (let i = 0; i < plots.length; i++) {
    for (const rr of roadRects) if (overlap(rects[i], rr)) { bad('plots clear of roads', plots[i].id); break; }
    for (let j = i + 1; j < plots.length; j++) if (overlap(rects[i], rects[j])) { bad('plots do not overlap', `${plots[i].id}/${plots[j].id}`); break; }
    for (const b of billboards) if (overlap(rects[i], (b.yaw ? { x0: b.x - 0.9, x1: b.x + 0.9, z0: b.z - b.width / 2, z1: b.z + b.width / 2 } : { x0: b.x - b.width / 2, x1: b.x + b.width / 2, z0: b.z - 0.9, z1: b.z + 0.9 }))) bad('plots clear of billboards', plots[i].id);
    for (const a of layout.reserved) if (overlap(rects[i], a)) bad('plots clear of reserved', plots[i].id);
    for (const rv of layout.rivers) if (overlap(rects[i], rv)) bad('plots clear of river', plots[i].id);
    for (const l of layout.lakes) if (overlap(rects[i], { x0: l.x - l.rx, x1: l.x + l.rx, z0: l.z - l.rz, z1: l.z + l.rz })) bad('plots clear of lakes', plots[i].id);
    const p = layout.parks[0];
    if (p && overlap(rects[i], { x0: p.center.x - p.width / 2, x1: p.center.x + p.width / 2, z0: p.center.z - p.depth / 2, z1: p.center.z + p.depth / 2 })) bad('plots clear of park', plots[i].id);
  }
  // roads clear of water (except bridges), and bridges exist where roads cross
  for (const r of roads) {
    for (const rv of layout.rivers) {
      if (!overlap(rectOfRoad(r), rv)) continue;
      if (r.axis === rv.axis) { bad('road does not run along the river', r.id); continue; }
      if (!layout.bridges.find((b) => b.roadId === r.id)) bad('a road over the river has a bridge', r.id);
      // roads that cross have to cross all the way
      const lo = rv.axis === 'z' ? rv.x0 : rv.z0, hi = rv.axis === 'z' ? rv.x1 : rv.z1;
      if (!(r.from < lo - 2 && r.to > hi + 2)) bad('roads cross the river completely', r.id);
    }
    for (const l of layout.lakes) if (overlap(rectOfRoad(r), { x0: l.x - l.rx - 1, x1: l.x + l.rx + 1, z0: l.z - l.rz - 1, z1: l.z + l.rz + 1 })) bad('roads clear of lakes', `${r.id} ${l.id}`);
  }
  for (const b of layout.bridges) {
    const road = roads.find((r) => r.id === b.roadId);
    const js = ixs.filter((i) => (road.axis === 'x' ? i.z === road.center : i.x === road.center)).map((i) => (road.axis === 'x' ? i.x : i.z));
    if (js.some((j) => j > b.u0 - 4 && j < b.u1 + 4)) bad('no junction on or beside a bridge', b.id);
  }
  // each lake: closed loop with 4 corner junctions and one T spur to somewhere
  for (const l of layout.lakes) {
    const loop = roads.filter((r) => r.group === `${l.id}-loop`);
    if (loop.length !== 4) bad('lake has 4 loop roads', l.id);
    const corners = ixs.filter((i) => loop.filter((r) => (r.axis === 'x' ? r.center === i.z : r.center === i.x)).length === 2 && Object.values(i.arms).filter(Boolean).length === 2);
    if (corners.length !== 4) bad('loop has four corner junctions', `${l.id} ${corners.length}`);
    const spur = roads.find((r) => r.id === `${l.id}-spur`);
    if (!spur) bad('lake has a spur', l.id);
  }
  // lots: count by district
  lotCounts.push(plots.length);
  lakeCounts.push(layout.lakes.length); (globalThis.hist ??= {})[layout.lakes.length] = ((globalThis.hist ??= {})[layout.lakes.length] ?? 0) + 1;
  bridgeCounts.push(layout.bridges.length);
  sizes.push([layout.land.x1 - layout.land.x0, layout.land.z1 - layout.land.z0]);
  // connected: every road reachable from ring-north via junctions
  const adj = new Map(roads.map((r) => [r.id, []]));
  const hs = roads.filter((r) => r.axis === 'x'), vs = roads.filter((r) => r.axis === 'z');
  for (const h of hs) for (const v of vs) if (ixs.find((x) => x.x === v.center && x.z === h.center)) { adj.get(h.id).push(v.id); adj.get(v.id).push(h.id); }
  const seen = new Set(['ring-north']);
  const stack = ['ring-north'];
  while (stack.length) for (const n of adj.get(stack.pop())) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  if (seen.size !== roads.length) bad('all roads connected', `seed ${seed}: ${seen.size}/${roads.length}`);
}
const mm = (a) => `${Math.min(...a).toFixed(0)}-${Math.max(...a).toFixed(0)}`;
console.log(`${SEEDS} cities: land ${mm(sizes.map((s) => s[0]))} x ${mm(sizes.map((s) => s[1]))}; lakes ${mm(lakeCounts)}; bridges ${mm(bridgeCounts)}; plots ${mm(lotCounts)}; junctions 4-arm ${ixKinds[4]}, T ${ixKinds[3]}, bend ${ixKinds[2]}`);
console.log('lake count histogram', JSON.stringify(globalThis.hist));
const problems = Object.values(tally).reduce((a, b) => a + b, 0);
console.log(problems === 0 ? 'ALL OK' : `${problems} problems ${JSON.stringify(tally)}`);
if (problems) process.exitCode = 1;

// Stop zones never overlap: a car waiting at one junction's stop line must not sit on the next junction's zebra.
{
  const { generateCity } = await imp('city/cityGenerator.js');
  const { tally, bad } = problemTally();
  const geo = (ix) => (ix.control === 'circle' ? { stop: ix.circle.ringOut + 1.1, cw: ix.circle.ringOut + 0.5 } : { stop: 2.15, cw: 1.75 });
  for (let seed = 1; seed <= Math.min(SEEDS, 40); seed++) {
    const { layout } = generateCity(seed);
    for (const r of layout.roads) {
      const js = layout.intersections
        .filter((i) => (r.axis === 'x' ? i.z === r.center && i.x >= r.from - 1e-6 && i.x <= r.to + 1e-6 : i.x === r.center && i.z >= r.from - 1e-6 && i.z <= r.to + 1e-6))
        .map((i) => ({ ix: i, u: r.axis === 'x' ? i.x : i.z }))
        .sort((a, b) => a.u - b.u);
      for (let k = 1; k < js.length; k++) {
        const d = js[k].u - js[k - 1].u;
        const A = geo(js[k - 1].ix), B = geo(js[k].ix);
        if (d < A.stop + B.cw + 0.3 || d < B.stop + A.cw + 0.3) bad('stop zones do not overlap', `${r.id}: ${js[k - 1].ix.id} and ${js[k].ix.id} are ${d.toFixed(2)} apart`);
      }
    }
  }
  console.log(Object.keys(tally).length ? `stop zones: ${JSON.stringify(tally)}` : 'stop zones never overlap');
  if (Object.keys(tally).length) process.exitCode = 1;
}
