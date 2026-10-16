// The amusement park: where it goes (flush to the county road, gate on the road, clear of everything), what is in it, and what is solid.
import { imp, problemTally } from './helpers.mjs';
const { generateCity } = await imp('city/cityGenerator.js');
const am = await imp('city/amusement.js');
const { buildCollisionMap, isBlocked } = await imp('sim/collision.js');
const { bad, total } = problemTally();

const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.02 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.02;
const inside = (r, x, z, m = 0) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;
const corridor = (r) => (r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - 1.4, z1: r.center + 1.4 } : { x0: r.center - 1.4, x1: r.center + 1.4, z0: r.from, z1: r.to });
const plotRect = (p) => {
  const c = Math.abs(Math.cos(p.yaw ?? 0));
  const s = Math.abs(Math.sin(p.yaw ?? 0));
  return { x0: p.x - (p.w * c + p.d * s) / 2, x1: p.x + (p.w * c + p.d * s) / 2, z0: p.z - (p.w * s + p.d * c) / 2, z1: p.z + (p.w * s + p.d * c) / 2 };
};

// --- the layout, in park coordinates
const d = am.amusementDesign();
if (d.track.length < 40 || d.supports.length < 10) bad('the coaster has a track and supports', `${d.track.length} ${d.supports.length}`);
for (const p of d.track) if (!(p.u > 0 && p.u < am.AMUSEMENT.width && p.v > 0 && p.v < am.AMUSEMENT.depth && p.y >= 1.4)) bad('the track stays inside the park and above the ground', JSON.stringify(p));
for (const r of [d.ferris, d.carousel, d.swings, d.bumpers]) {
  const hu = r.base?.hu ?? 0;
  const hv = r.base?.hv ?? 0;
  if (r.u - hu < 0 || r.u + hu > am.AMUSEMENT.width || r.v - hv < 0 || r.v + hv > am.AMUSEMENT.depth) bad('every ride stands inside the fence', JSON.stringify(r));
}
// the rides do not stand on each other
const boxes = [d.ferris, d.carousel, d.swings, d.bumpers].map((r) => ({ x0: r.u - r.base.hu, x1: r.u + r.base.hu, z0: r.v - r.base.hv, z1: r.v + r.base.hv }));
for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlap(boxes[i], boxes[j])) bad('the rides do not overlap', `${i} ${j}`);
for (const s of d.stalls) if (s.u - s.w / 2 < 0 || s.u + s.w / 2 > am.AMUSEMENT.width || Math.abs(s.u - am.AMUSEMENT.width / 2) < am.AMUSEMENT.gateWidth / 2 + 1) bad('the stalls are inside and leave the gate clear', JSON.stringify(s));
// benches stand inside the park, on the grass beside the main path, clear of the rides, stalls and coaster supports, and face the path
if (d.benches.length < 6 || d.flowers.length < 2) bad('the park has benches and flower beds', `${d.benches.length} ${d.flowers.length}`);
const ovl = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0;
const rects = [...boxes, ...d.stalls.map((q) => ({ x0: q.u - q.w / 2, x1: q.u + q.w / 2, z0: q.v - q.d / 2, z1: q.v + q.d / 2 })), ...d.supports.map((q) => ({ x0: q.u - 0.18, x1: q.u + 0.18, z0: q.v - 0.18, z1: q.v + 0.18 }))];
for (const b of d.benches) {
  const r = { x0: b.u - 0.25, x1: b.u + 0.25, z0: b.v - 0.55, z1: b.v + 0.55 };
  if (r.x0 < 0 || r.x1 > am.AMUSEMENT.width || r.z0 < 0 || r.z1 > am.AMUSEMENT.depth) bad('a bench is inside the fence', JSON.stringify(b));
  if (rects.some((q) => ovl(r, q))) bad('a bench is clear of the rides, stalls and supports', JSON.stringify(b));
  if (Math.sign(Math.sin(b.yaw)) !== Math.sign(am.AMUSEMENT.width / 2 - b.u)) bad('a bench faces the path', JSON.stringify(b));
  if (Math.abs(b.u - am.AMUSEMENT.width / 2) < 2.4) bad('a bench is beside the path, not on it', JSON.stringify(b));
}
// the train: it goes round and joins up, and stays on the track
const a0 = am.trackAt(d.track, 0);
const a1 = am.trackAt(d.track, 1);
if (Math.hypot(a0.u - a1.u, a0.v - a1.v, a0.y - a1.y) > 1e-6) bad('the train comes back to where it started', '');
for (let t = 0; t < 1; t += 0.013) {
  const p = am.trackAt(d.track, t);
  if (!(Number.isFinite(p.u) && Number.isFinite(p.y) && p.y >= 1.4)) bad('the train is always on the track', String(t));
}
if (am.trackAt(d.track, -0.25).u === undefined || Math.abs(am.trackAt(d.track, 0.75).u - am.trackAt(d.track, -0.25).u) > 1e-9) bad('a negative position wraps round', '');

// --- the park in cities
const N = Number(process.env.SEEDS ?? 30);
let have = 0;
let west = 0;
const sideCount = {};
for (let seed = 1; seed <= N; seed++) {
  const city = generateCity(seed);
  const { layout, plots, billboards } = city;
  const site = layout.amusement;
  if (generateCity(seed, { amusement: false }).layout.amusement !== null) bad('the park can be switched off', seed);
  if (!site) continue;
  have++;
  if (site.roadId === 'county-west') west++;
  sideCount[site.roadId] = (sideCount[site.roadId] ?? 0) + 1;
  const road = layout.roads.find((r) => r.id === site.roadId);
  if (!road || road.kind !== 'county') { bad('the park is on the county road', `${seed} ${site.roadId}`); continue; }
  // flush to the road: 1.4 (the corridor) + 2.5 (the gap) from its middle line, on the outer side
  const away = road.axis === 'x' ? (site.outward > 0 ? site.rect.z0 - road.center : road.center - site.rect.z1) : site.outward > 0 ? site.rect.x0 - road.center : road.center - site.rect.x1;
  if (Math.abs(away - (1.4 + am.AMUSEMENT.gap)) > 1e-6) bad('the park stands 2.5 from the road\'s pavement', `${seed}: ${away}`);
  const k = layout.county;
  if (overlap(site.rect, { x0: k.x0 + 1.5, x1: k.x1 - 1.5, z0: k.z0 + 1.5, z1: k.z1 - 1.5 })) bad('the park is outside the county road, away from the city', seed);
  // the gate is on the road side, in the middle, and faces the road
  const g = site.gate;
  const gateAway = road.axis === 'x' ? Math.abs(g.z - road.center) : Math.abs(g.x - road.center);
  if (Math.abs(gateAway - (1.4 + am.AMUSEMENT.gap)) > 1e-6) bad('the gate is on the road side', seed);
  if (road.axis === 'x' ? site.facing[1] * site.outward !== -1 : site.facing[0] * site.outward !== -1) bad('the gate faces the road', `${seed} ${site.facing}`);
  // not opposite a junction
  const js = layout.intersections.filter((i) => (road.axis === 'x' ? Math.abs(i.z - road.center) < 1e-6 : Math.abs(i.x - road.center) < 1e-6)).map((i) => (road.axis === 'x' ? i.x : i.z));
  const gu = road.axis === 'x' ? g.x : g.z;
  if (js.some((j) => Math.abs(j - gu) < am.AMUSEMENT.gateClear - 1e-6)) bad('the gate is not opposite a junction', seed);
  // nothing else is on the park's ground: no plot, road, billboard, lake, river, airport or reserved site, and no street comes near it
  const r = site.rect;
  const keep = site.keepClear;
  if (plots.some((p) => overlap(plotRect(p), keep))) bad('no lot is on or beside the park', `${seed}`);
  if (layout.roads.some((q) => q.id !== road.id && overlap(corridor(q), keep))) bad('no street runs through or beside the park', `${seed}`);
  if (billboards.some((b) => b.kind !== 'banner' && inside(keep, b.x, b.z))) bad('no billboard in the park', seed);
  if ([...layout.lakes.map((l) => ({ x0: l.x - l.rx, x1: l.x + l.rx, z0: l.z - l.rz, z1: l.z + l.rz })), ...layout.rivers.map((v) => ({ x0: v.x0, x1: v.x1, z0: v.z0, z1: v.z1 })), ...layout.airports.map((a) => a.rect), ...layout.reserved.map((a) => ({ x0: a.x0, x1: a.x1, z0: a.z0, z1: a.z1 })), ...layout.malls.map((m) => m.rect), ...(layout.hills ? [layout.hills.rect] : [])].some((q) => overlap(q, keep))) bad('the park is clear of water, airports, reserved land, malls and hills', seed);
  // no new street makes a junction on the county road in front of the park
  for (const q of layout.roads.filter((x) => x.infill)) {
    const at = road.axis === 'x' ? (q.axis === 'z' ? [q.center, q.from, q.to] : []) : q.axis === 'x' ? [q.center, q.from, q.to] : [];
    const meets = (road.axis === 'x' ? [q.from, q.to].includes(road.center) && q.axis === 'z' : [q.from, q.to].includes(road.center) && q.axis === 'x');
    if (meets && at[0] > site.keepOut.u0 && at[0] < site.keepOut.u1) bad('no new junction on the county road in front of the park', `${seed} ${q.id}`);
  }
  // the fence and rides are solid, the gate, paths and lawn are not
  const map = buildCollisionMap(city);
  const free = (x, z) => !isBlocked(x, z, map.rects);
  const toW = (u, v) => am.toWorld(site, u, v);
  const dd = am.amusementDesign(site.width, site.depth);
  if (!free(...Object.values(toW(site.width / 2, 0)))) bad('the gate is open', seed);
  if (!free(...Object.values(toW(site.width / 2, 3)))) bad('the way in from the gate is open', seed);
  if (!free(...Object.values(toW(site.width / 2, site.depth * 0.3)))) bad('the lawn and paths are walkable', seed);
  const solid = (x, z) => isBlocked(x, z, map.rects);
  if (!solid(...Object.values(toW(dd.ferris.u, dd.ferris.v)))) bad('the ferris wheel is solid', seed);
  if (!solid(...Object.values(toW(dd.carousel.u, dd.carousel.v)))) bad('the carousel is solid', seed);
  if (!solid(...Object.values(toW(2, 0)))) bad('the fence is solid', seed);
  if (!solid(...Object.values(toW(site.width / 2, site.depth)))) bad('the back fence is solid', seed);
  // all the park's solids stay inside its ground (a little over for the fence's thickness)
  for (const s of am.amusementSolids(site)) if (s.x0 < r.x0 - 0.5 || s.x1 > r.x1 + 0.5 || s.z0 < r.z0 - 0.5 || s.z1 > r.z1 + 0.5) bad('everything solid is inside the park', `${seed} ${s.kind}`);
  // the world map can find it
  if (generateCity(seed).layout.amusement.u0 !== site.u0) bad('the same seed gives the same park', seed);
  if (plots.some((p) => !(p.price >= 5))) bad('every lot has a price', seed);
}
if (have < N * 0.9) bad('nearly every city has an amusement park', `${have} of ${N}`);
if (west < have * 0.3) bad('the west side is tried first and is used in a good share of cities', JSON.stringify(sideCount));
const dflt = generateCity(20260101).layout.amusement;
if (!dflt || dflt.roadId !== 'county-west') bad('the default city\'s park is on the west side (beside the two new blocks)', dflt ? dflt.roadId : 'none');
console.log(`${have} of ${N} cities have a park; sides ${JSON.stringify(sideCount)}`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
