// The mainland's river plan (lib/world/riverPlan.js, docs/world/river_plan.md): the real map placed on the game map, every river's course, mouth, width, fall and crossings, and the ports.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const R = await imp('world/riverPlan.js');
const D = await imp('world/datum.js');
const { generateCity } = await imp('city/cityGenerator.js');
const { bad, total } = problemTally();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
const highways = new Map();
for (const c of manifest.chunks) {
  if (!c.highways) continue;
  for (const h of JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/chunks', `${c.key}.json`), 'utf8')).highways ?? []) if (!['track', 'causeway', 'causeway-bridge'].includes(h.kind)) highways.set(`${h.id}|${h.a.x}|${h.a.z}`, h);
}
const townRiver = generateCity(20260101).layout?.rivers?.[0] ?? generateCity(20260101).rivers[0];
const plan = R.planRivers({ manifest, highways: [...highways.values()], townRiver });
const main = manifest.landmasses.find((l) => l.id === 'mainland');

// ---- the real map on the game map
if (plan.projection.worst > 0.05 || plan.projection.pairs < 15) bad('the real longitude and latitude are placed on the game map to within 0.05 units, from the mountain ranges', JSON.stringify(plan.projection));
const proj = R.projectionFor(main);
const town = proj.at(-77.28, 18.02);
if (Math.hypot(town.x - 0, town.z - 0) > 40) bad('the first town (May Pen, lon -77.28 lat 18.02) is where the game puts Voxel Town', JSON.stringify(town));

// ---- the data
const ids = R.RIVERS.map((r) => r.id);
if (new Set(ids).size !== ids.length || ids.length !== 14) bad('fourteen rivers, each once', ids.join());
for (const r of R.RIVERS) {
  if (!['page', 'approx'].includes(r.basis) || !['mouth', 'delta', 'harbour', 'gorge'].includes(r.kind) || !r.note || !(r.srcM > 0)) bad('every river says where its position comes from, what its mouth is, its source height and a note', r.id);
  if (!/^(south|north|east|west)$/.test(r.coast)) bad('every river says which coast it reaches', r.id);
}
const names = R.RIVERS.map((r) => r.name).join();
for (const n of ['Rio Minho', 'Black River', 'Rio Cobre', 'Great River', 'White River']) if (!names.includes(n)) bad('the real rivers named in the data are in the plan', n);

// ---- every planned river
if (plan.problems.length) bad('the plan has no problems (a source off the land, a mouth far from the coast, rivers that cross)', plan.problems.join('; '));
const coast = main.coast.points;
for (const r of plan.rivers) {
  if (!r.sourceInLand) bad('a source is on the mainland', r.id);
  if (r.course.length < 8 || r.length < 100) bad('a river has a real length', `${r.id} ${r.length}`);
  const end = r.course[r.course.length - 1], start = r.course[0];
  if (R.nearestOnCoast(coast, end.x, end.z).d > 1) bad('a river ends on the coast', `${r.id} ${R.nearestOnCoast(coast, end.x, end.z).d}`);
  if (!R.inside(coast, start.x, start.z)) bad('a river starts on the land', r.id);
  const mid = r.course[Math.floor(r.course.length / 2)];
  if (!R.inside(coast, mid.x, mid.z)) bad('a river runs over land in the middle', r.id);
  if (!(r.width.source < r.width.mid && r.width.mid < r.width.mouth && r.width.source >= 2)) bad('a river widens to its mouth', `${r.id} ${JSON.stringify(r.width)}`);
  if (!(r.fall > 2 && r.fall <= 4.5)) bad('a river has a fall of a few units, as the hills are (lib/world/shapes.js: Blue Mountain Peak is 18)', `${r.id} ${r.fall}`);
  if (r.crosses.length < 1) bad('every river meets a highway before it reaches the coast (the coastal ring: a bridge)', r.id);
}
// the Rio Minho is the first town's river: Willow Run is its middle course
const minho = plan.rivers.find((r) => r.id === 'rio-minho');
const through = minho.course.filter((p) => p.z >= townRiver.z0 && p.z <= townRiver.z1);
if (through.length < 20 || through.some((p) => p.x < townRiver.x0 - 1 || p.x > townRiver.x1 + 1)) bad('the Rio Minho runs down the town\'s own river (Willow Run), inside its banks', `${through.length}`);
if (plan.rivers.filter((r) => r.id !== 'rio-minho').some((r) => r.course.some((p) => p.x > townRiver.x0 - 30 && p.x < townRiver.x1 + 30 && p.z > townRiver.z0 && p.z < townRiver.z1))) bad('no other river runs through the first town', '');

// ---- no river meets a road but the coastal ring (which every river has to cross to reach the sea: a bridge), and none comes close to a spur, a link or the speedway circuit
const { buildWorld } = await imp('world/buildWorld.js');
const { highwaySegments } = await imp('world/rivers.js');
const bw = buildWorld();
const roads = highwaySegments(bw).filter((h) => h.kind !== 'ring');
for (const l of bw.links ?? []) for (let i = 0; i + 1 < (l.points?.length ?? 0); i++) roads.push({ id: l.id, kind: 'link', a: l.points[i], b: l.points[i + 1] });
for (const t of bw.tracks ?? []) t.centreline.forEach((p, i) => roads.push({ id: t.id, kind: 'track', a: p, b: t.centreline[(i + 1) % t.centreline.length] }));
const rings = highwaySegments(bw).filter((h) => h.kind === 'ring');
for (const r of plan.rivers) {
  r.course.forEach((p, i) => {
    const half = R.widthAt(r, i / (r.course.length - 1)) / 2;
    if (r.id === 'rio-minho' && p.z > townRiver.z0 - 30 && p.z < townRiver.z1 + 50) return; // (the town and its edge: the river and the river drive meet there)
    for (const s of roads) {
      const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.z - s.a.z) * dz) / l2));
      const d = Math.hypot(p.x - (s.a.x + t * dx), p.z - (s.a.z + t * dz)) - half - (s.kind === 'track' ? 28 : 3); // (a road is 6 wide; a circuit has barriers and scenery about 25 beyond its centreline)
      if (d < 0) { bad('a river keeps clear of every road but the ring (it must not meet a spur, a link or the speedway)', `${r.id} ${s.id} ${d.toFixed(1)} at ${p.x.toFixed(0)},${p.z.toFixed(0)}`); return; }
    }
  });
  let rc = 0;
  for (const s of rings) for (let i = 1; i < r.course.length; i++) if (R.crossing(r.course[i - 1], r.course[i], s.a, s.b)) rc++;
  if (rc !== 1) bad('a river crosses the coastal ring once, on its way to the sea', `${r.id} ${rc}`);
}

// ---- the surface falls from the source to the sea
if (R.surfaceAt(minho, 1) !== D.SEA_LEVEL || !(R.surfaceAt(minho, 0) > R.surfaceAt(minho, 0.5) && R.surfaceAt(minho, 0.5) > R.surfaceAt(minho, 1))) bad('a river\'s surface is the sea level at its mouth and rises upstream', `${R.surfaceAt(minho, 1)}`);
if (!(R.widthAt(minho, 1) > R.widthAt(minho, 0.88) && R.widthAt(minho, 0.88) >= R.widthAt(minho, 0.8) - 1e-9)) bad('the mouth flares', '');
if (R.crossing({ x: 0, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }, { x: 10, z: 0 }) === null || R.crossing({ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }) !== null) bad('crossing finds crossing segments and no others', '');

// ---- the ports: a shipping port on both large landmasses, and a boat harbour
const roles = plan.ports.map((p) => p.role).join();
if (!/shipping port/.test(roles) || !/boat harbour/.test(roles)) bad('the mainland has a shipping port and a boat harbour', roles);
for (const p of plan.ports) if (p.movedToCoast > 60) bad('a port is on the coast', `${p.id} ${p.movedToCoast}`);
if (plan.islandPorts.length !== 1 || !/shipping port/.test(plan.islandPorts[0].role) || plan.islandPorts[0].piers < 1) bad('Harbor Isle has a shipping port: its harbour', JSON.stringify(plan.islandPorts));
if (!fs.existsSync(path.join(root, 'docs/world/gallery/river_plan.webp')) || !fs.existsSync(path.join(root, 'docs/world/river_plan.md'))) bad('the plan has its picture and its document', '');
console.log(`river plan: ${plan.rivers.length} rivers (${plan.rivers.reduce((s, r) => s + r.length, 0)} units), ${plan.rivers.reduce((s, r) => s + r.crosses.length, 0)} bridges, ${plan.ports.length + plan.islandPorts.length} ports`);
total();
