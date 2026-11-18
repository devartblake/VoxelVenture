// Harbor Isle's water (lib/world/isleWaters.js, docs/world/isle_waters.md): the North Sound lagoon with its mangrove islands and fringe, and the canal estate on the south coast. Planned from the coast and the land
// (clear of the town, the airstrip and the harbour), baked as rivers (a channel in the ground, a ribbon of water, a bridge where the ring crosses), and still: no surf at their mouths.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const { ISLE_WATERS, ISLE_WATER_IDS, lagoonFringe } = await imp('world/isleWaters.js');
const { widthAt, inside } = await imp('world/riverPlan.js');
const { riverField } = await imp('world/rivers.js');
const { bad, total } = problemTally();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
const isle = manifest.landmasses.find((l) => l.id === 'harbor-isle');
const waters = manifest.rivers.filter((r) => r.coast === 'isle' && r.id !== 'mill-creek'); // (Mill Creek is the town's: tests/harbor-town.test.mjs)
const harbor = manifest.towns.find((t) => t.id === 'harbor').land;

if (waters.map((r) => r.id).sort().join() !== ISLE_WATER_IDS.filter((i) => i !== 'mill-creek').sort().join()) bad('the manifest has the lagoon and five canals', waters.map((r) => r.id).join());
const lagoon = waters.find((r) => r.kind === 'lagoon'), canals = waters.filter((r) => r.kind === 'canal');
if (!lagoon || canals.length !== ISLE_WATERS.canals.count) bad('one lagoon and the canals', `${!!lagoon} ${canals.length}`);

// each starts inland and ends on the coast; all of it clear of the town, the airstrip and the harbour's piers
const strip = isle.features.airstrip;
for (const r of waters) {
  const a = r.course[0], b = r.course.at(-1);
  if (!inside(isle.coast.points, a.x, a.z)) bad('the inland end is on the island', r.id);
  const m = ISLE_WATERS.clear - 6;
  for (const p of r.course) {
    if (p.x > harbor.x0 - m && p.x < harbor.x1 + m && p.z > harbor.z0 - m && p.z < harbor.z1 + m) { bad('clear of the town land', r.id); break; }
    if (Math.abs(p.x - strip.at.x) < strip.length / 2 + 20 && Math.abs(p.z - strip.at.z) < 36) { bad('clear of the airstrip', r.id); break; }
    for (const pier of isle.features.harbour.piers) if (Math.hypot(p.x - pier.x, p.z - pier.z) < 60) bad('clear of the harbour', r.id);
  }
  if (!(b && r.length > 80)) bad('a real length', r.id);
}
// the canals: the same width all along, side by side and not touching
for (const c of canals) if (c.width.source !== 9 || c.width.mouth !== 9) bad('a canal is 9 wide all along (no flare)', c.id);
for (let i = 1; i < canals.length; i++) if (Math.abs(canals[i].course.at(-1).x - canals[i - 1].course.at(-1).x) < 50) bad('canals are far enough apart for a block between them', canals[i].id);
// the lagoon: a channel with a pool, the islands in the pool, a fringe of mangroves
if (!(lagoon.width.source > lagoon.width.mid + 6)) bad('the lagoon widens to a pool at its inland end', JSON.stringify(lagoon.width));
if (lagoon.islands.length < 10 || lagoon.islands.some((i) => !i.tree)) bad('the pool has mangrove islands, each with trees', String(lagoon.islands.length));
const field = riverField(manifest.rivers);
if (!(field.sdAt(lagoon.islands[0].x, lagoon.islands[0].z) > 0)) bad('an island in the lagoon is land', '');
const fringe = lagoonFringe(lagoon, widthAt);
if (fringe.length < 20) bad('mangroves along the lagoon banks', String(fringe.length));
if (JSON.stringify(fringe) !== JSON.stringify(lagoonFringe(lagoon, widthAt))) bad('the fringe is the same every time', '');
// every fringe tree stands on land, off the water
for (const t of fringe) if (!(field.sdAt(t.x, t.z) > -0.5)) { bad('a fringe tree is not in the water', `${t.x} ${t.z}`); break; }
// and all of those trees are in the baked chunks
let trees = 0;
for (const c of manifest.chunks) {
  if (!c.props) continue;
  const chunk = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/chunks', `${c.key}.json`), 'utf8'));
  for (const p of chunk.props ?? []) if (p.m === 'treeSmall' && fringe.some((f) => f.x === p.x && f.z === p.z)) trees++;
}
if (trees !== fringe.length) bad('every fringe tree is baked', `${trees} of ${fringe.length}`);
// the ring road crosses each on a bridge, and no road other than the ring crosses any of them
const pieces = [];
for (const c of manifest.chunks) {
  const chunk = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/chunks', `${c.key}.json`), 'utf8'));
  for (const h of chunk.highways ?? []) if (h.kind === 'river-bridge' && ISLE_WATER_IDS.some((i) => i !== 'mill-creek' && h.id === `${i}-bridge`)) pieces.push(h);
}
for (const r of waters) if (!pieces.some((h) => h.id === `${r.id}-bridge`)) bad('the ring crosses on a bridge', r.id);
if (pieces.some((h) => h.on !== 'harbor-ring')) bad('only the ring crosses the island waters', [...new Set(pieces.map((h) => h.on))].join());
console.log(`isle waters: the lagoon (${lagoon.length} units, ${lagoon.islands.length} mangrove islands, ${fringe.length} fringe trees) and ${canals.length} canals, ${pieces.length} bridge pieces`);
total();
