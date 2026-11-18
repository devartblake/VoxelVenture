// Harbor Town as the baked world draws it (docs/world/harbor_town.md): Mill Creek runs through it to the sea (the generator's river, the width it gave, bridged by every street that crosses it), its three lakes are
// raised ponds at the datum's heights, and nothing of its streets lies in the water. The town stays vacant and not live (no database, no claims): this is only what is drawn.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const D = await imp('world/datum.js');
const { pondMeshes, POND, POND_LIFT_OK } = await imp('world/ponds.js');
const { riverField } = await imp('world/rivers.js');
const { ROAD_WIDTH } = await imp('world/chunkMesh.js');
const { inside, nearestOnCoast } = await imp('world/riverPlan.js');
const { WORLD_RECIPE } = await imp('world/worldRecipe.js');
const { bad, total } = problemTally();
const dir = path.join(root, 'apps/web/public/world');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const town = manifest.towns.find((t) => t.id === 'harbor');
const isle = manifest.landmasses.find((l) => l.id === 'harbor-isle');
const creek = manifest.rivers.find((r) => r.id === 'mill-creek');

if (town.live || !town.vacant) bad('Harbor Town stays vacant and not live: drawing it opens nothing', JSON.stringify({ live: town.live, vacant: town.vacant }));
if (WORLD_RECIPE.towns.find((t) => t.id === 'harbor').live) bad('the recipe keeps it not live', '');

// ---- Mill Creek
if (!creek) bad('Mill Creek is in the manifest', '');
else {
  const tr = town.rivers[0];
  const cx = (tr.x0 + tr.x1) / 2;
  if (creek.townWidth < 12 || Math.abs(creek.townWidth - (tr.x1 - tr.x0)) > 0.01) bad('through the town the creek is the width the generator gave its river', String(creek.townWidth));
  // dead straight through the town land, on the river's own axis
  const through = creek.course.filter((p) => p.z > town.land.z0 + 4 && p.z < town.land.z1 - 4);
  if (through.length < 10 || through.some((p) => Math.abs(p.x - cx) > 1.2)) bad('the course keeps to the town river axis through the town', `${through.length}`);
  const mouth = creek.course.at(-1), src = creek.course[0];
  if (nearestOnCoast(isle.coast.points, mouth.x, mouth.z).d > 3) bad('the creek reaches the sea', String(nearestOnCoast(isle.coast.points, mouth.x, mouth.z).d));
  if (!inside(isle.coast.points, src.x, src.z)) bad('the spring is on the island', '');
  if (!(creek.townT[0] > 0 && creek.townT[1] < 1 && creek.townT[1] > creek.townT[0])) bad('the town part is in the middle of the course', JSON.stringify(creek.townT));
  const field = riverField(manifest.rivers);
  if (!(field.sdAt(cx, (town.land.z0 + town.land.z1) / 2) < -3)) bad('the channel is cut under the town river', '');
}

// ---- the streets over the creek
if (ROAD_WIDTH.arterial !== 3.2 || ROAD_WIDTH.local !== 2.2) bad('the bake uses the mesh street widths (lib/world/bake.js keeps its own copy)', JSON.stringify(ROAD_WIDTH));
const field = riverField(manifest.rivers);
const bridges = [], wetRoads = [];
for (const c of manifest.chunks) {
  const chunk = JSON.parse(fs.readFileSync(path.join(dir, 'chunks', `${c.key}.json`), 'utf8'));
  for (const h of chunk.highways ?? []) if (h.id === 'mill-creek-bridge') bridges.push(h);
  for (const r of chunk.roads ?? []) if (r.town === 'harbor') for (const t of [0.25, 0.5, 0.75]) { const x = r.a.x + (r.b.x - r.a.x) * t, z = r.a.z + (r.b.z - r.a.z) * t; if (field.sdAt(x, z, 4) < -1.1) wetRoads.push(r.id); }
}
const streets = new Set(bridges.filter((h) => h.on.startsWith('harbor:')).map((h) => h.on));
if (streets.size < 4) bad('the streets that cross the creek are bridged (the three avenues and the county roads)', [...streets].join());
if (wetRoads.length) bad('no street of the town runs through the water', [...new Set(wetRoads)].join());
for (const h of bridges.filter((b) => b.on.startsWith('harbor:'))) if (h.clearance !== 1.1 || h.width !== (ROAD_WIDTH[h.class] ?? ROAD_WIDTH.default)) { bad('a town bridge is low and as wide as its street', `${h.on} ${h.clearance} ${h.width}`); break; }

// ---- the ponds: raised, at the datum's heights, one for each of the town's lakes
const ponds = manifest.ponds ?? [];
if (ponds.length !== 3 || ponds.some((p) => p.town !== 'harbor')) bad('the three lakes of Harbor Town are ponds in the manifest', String(ponds.length));
const m = pondMeshes(ponds);
const ys = (a) => { const out = new Set(); for (let i = 1; i < a.length; i += 3) out.add(+a[i].toFixed(4)); return [...out]; };
if (ys(m.water.positions).join() !== String(D.waterLevel('pond')) || ys(m.shore.positions).join() !== String(POND.shoreY)) bad('a pond is at the datum TOWN_WATER and its sand a hair under it', `${ys(m.water.positions)} ${ys(m.shore.positions)}`);
if (!POND_LIFT_OK) bad('the water is over the sand and under the streets', '');
if (m.water.indices.length !== ponds.length * 6) bad('a pond is two triangles', String(m.water.indices.length));
for (const p of ponds) {
  if (!(field.sdAt(p.x, p.z) > 5)) bad('a pond is on land, away from the creek', p.id);
  if (!(p.x > town.land.x0 && p.x < town.land.x1 && p.z > town.land.z0 && p.z < town.land.z1)) bad('a pond is inside the town land', p.id);
}
// ---- the town's own street shapes (lib/world/harborStreets.js): a boulevard through a roundabout and a crescent each side, besides the generator's streets
{
  const { harborStreets, arcBetween, HARBOR_STREETS } = await imp('world/harborStreets.js');
  const { buildWorld } = await imp('world/buildWorld.js');
  const world = buildWorld();
  const t = world.towns.find((q) => q.id === 'harbor'), first = world.towns[0];
  if (!t.streets.length || first.streets.length) bad('Harbor Town has its own streets and the first town has none', `${t.streets.length} ${first.streets.length}`);
  if (JSON.stringify(t.streets) !== JSON.stringify(harborStreets({ id: t.id, land: t.land, roads: t.roads }))) bad('the streets are the same every build', '');
  if (t.roads.some((r) => /boulevard|circle|crescent/.test(r.id)) || t.roads.length !== 80) bad('the generator roads are untouched: the new streets are separate', String(t.roads.length));
  const ids = new Set(t.streets.map((q) => q.id));
  for (const id of ['harbor:boulevard', 'harbor:circle', 'harbor:crescent-east', 'harbor:crescent-west']) if (!ids.has(id)) bad('a street shape is there', id);
  // continuous: each street's pieces join end to start
  for (const id of ids) { const q = t.streets.filter((x) => x.id === id); for (let i = 1; i < q.length; i++) if (Math.hypot(q[i].a.x - q[i - 1].b.x, q[i].a.z - q[i - 1].b.z) > 1e-6 && id !== 'harbor:boulevard') bad('a street is one line', id); }
  // the boulevard runs through the roundabout's centre, from corner to corner of the county ring, and the crescents bulge out of it
  const centre = t.streets.filter((q) => q.id === 'harbor:circle').reduce((c, q, _, all) => ({ x: c.x + q.a.x / all.length, z: c.z + q.a.z / all.length }), { x: 0, z: 0 });
  const bl = t.streets.filter((q) => q.id === 'harbor:boulevard'), d = (p, a, b) => Math.abs((b.x - a.x) * (a.z - p.z) - (a.x - p.x) * (b.z - a.z)) / Math.hypot(b.x - a.x, b.z - a.z);
  if (d(centre, bl[0].a, bl[1].b) > 1) bad('the boulevard runs through the roundabout', String(d(centre, bl[0].a, bl[1].b)));
  const eastRoad = t.roads.find((r) => r.id === 'harbor:county-east'), arcE = t.streets.filter((q) => q.id === 'harbor:crescent-east');
  if (!(Math.max(...arcE.map((q) => q.b.x)) > eastRoad.center + HARBOR_STREETS.crescents[0].sag - 2) || arcE[0].a.x !== eastRoad.center) bad('the east crescent leaves the county ring and bulges out', '');
  const arc = arcBetween({ x: 0, z: 0 }, { x: 0, z: 100 }, 20, 1);
  if (Math.abs(Math.abs(arc[7].x) - 20) > 0.6 || arc[0].z !== 0 || Math.abs(arc.at(-1).z - 100) > 1e-6) bad('an arc bulges by its sag between its ends', JSON.stringify(arc[7]));
  // no pond is under a new street
  for (const p of ponds) for (const q of t.streets) { const dd = d(p, q.a, q.b), len = Math.hypot(q.b.x - q.a.x, q.b.z - q.a.z), along = ((p.x - q.a.x) * (q.b.x - q.a.x) + (p.z - q.a.z) * (q.b.z - q.a.z)) / len; if (along > 0 && along < len && dd < p.rz + 3) bad('a new street does not cross a pond', `${q.id} ${p.id}`); }
  // and the streets are baked, bridged where they meet the creek: the boulevard crosses it on a bridge (the avenues and county roads still do)
  if (!bridges.some((h) => h.on === 'harbor:boulevard')) bad('the boulevard crosses Mill Creek on a bridge', '');
  let baked = 0;
  for (const c of manifest.chunks) { const chunk = JSON.parse(fs.readFileSync(path.join(dir, 'chunks', `${c.key}.json`), 'utf8')); baked += (chunk.roads ?? []).filter((r) => /^harbor:(circle|crescent|boulevard)/.test(r.id)).length; }
  if (baked < t.streets.length - 2) bad('the new streets are baked', `${baked} of ${t.streets.length}`);
}
console.log(`harbor town: Mill Creek ${creek?.length} units, ${bridges.length} bridge pieces on ${streets.size} streets and the ring, ${ponds.length} ponds at ${D.waterLevel('pond')}`);
total();
