// The rivers' own water and the deltas' islands (lib/world/riverWater.js, lib/world/rivers.js, docs/world/river_plan.md): a ribbon of water along every river at the sea level, shallow at the banks and deeper in the middle,
// fading past the mouth; and the islands of the delta rivers, which are land in the channel.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const W = await imp('world/riverWater.js');
const { deltaIslands, riverField, ISLANDS } = await imp('world/rivers.js');
const { SEA_LEVEL } = await imp('world/datum.js');
const { widthAt } = await imp('world/riverPlan.js');
const { bad, total } = problemTally();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---- the course sampled
const course = [{ x: 0, z: 0 }, { x: 0, z: 10 }, { x: 0, z: 30 }];
const pts = W.sampleCourse(course, 5);
if (pts.length !== 7 || !near(pts[0].s, 0) || !near(pts.at(-1).s, 30) || !near(pts.at(-1).t, 1) || !pts.every((p) => near(p.dx, 0) && near(p.dz, 1))) bad('a course is sampled every 5 units, from 0 to its length, with its direction', JSON.stringify(pts.length));

// ---- every river of the world has its water
let vertices = 0;
for (const r of manifest.rivers) {
  const m = W.riverWaterMesh(r);
  vertices += m.vertices;
  const rows = m.vertices / W.RIVER_WATER.rows;
  if (!Number.isInteger(rows) || rows < 8) bad('a river ribbon has its rows across', `${r.id} ${m.vertices}`);
  if (m.colors.length !== m.vertices * 4 || m.indices.some((i) => i >= m.vertices)) bad('colours with alpha for each vertex, indices in range', r.id);
  for (let i = 1; i < m.positions.length; i += 3) if (!near(m.positions[i], SEA_LEVEL + W.RIVER_WATER.lift)) { bad('the water lies at the sea level, a hair over the sea plane', `${r.id} ${m.positions[i]}`); break; }
  let down = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => m.indices[t + k] * 3), p = m.positions;
    const n = (p[b + 2] - p[a + 2]) * (p[c] - p[a]) - (p[b] - p[a]) * (p[c + 2] - p[a + 2]);
    if (n < -1e-6) down++;
  }
  if (down > m.indices.length / 3 * 0.02) bad('the triangles of the water face up (a few on the inside of a sharp bend may fold over)', `${r.id} ${down}`);
  // across a row the water is lighter and clearer at the banks than in the middle
  const row = Math.floor(rows / 2) * W.RIVER_WATER.rows, mid = row + 2, edge = row;
  if (!(m.colors[mid * 4 + 3] > m.colors[edge * 4 + 3])) bad('the water is deeper (more opaque) in the middle than at the banks', r.id);
  // the last row fades out past the mouth
  const lastRow = (rows - 1) * W.RIVER_WATER.rows + 2;
  if (!(m.colors[lastRow * 4 + 3] < 0.05)) bad('the water fades out past the mouth', `${r.id} ${m.colors[lastRow * 4 + 3]}`);
  // its width follows the river
  const a = m.positions, w = Math.hypot(a[(row + 4) * 3] - a[row * 3], a[(row + 4) * 3 + 2] - a[row * 3 + 2]);
  if (!(w > 3 && w < 40)) bad('the ribbon is a river wide', `${r.id} ${w}`);
}
if (manifest.rivers.length !== 14 || vertices < 4000) bad('all fourteen rivers have water', `${manifest.rivers.length} ${vertices}`);
const tint = (kind) => W.RIVER_WATER.palettes[kind].middle;
if (!(tint('delta')[1] < tint('delta')[2] + 20 && tint('delta')[0] < tint('mouth')[0] + 40) || !Object.keys(W.RIVER_WATER.palettes).includes('gorge')) bad('each kind of river has a palette', '');

// ---- the islands of the deltas
const delta = manifest.rivers.filter((r) => r.kind === 'delta');
if (delta.map((r) => r.id).sort().join() !== 'black-river,hope-river,yallahs-river') bad('three rivers are deltas', delta.map((r) => r.id).join());
for (const r of delta) {
  if (!r.islands?.length) { bad('a delta has islands', r.id); continue; }
  const again = deltaIslands(r);
  if (JSON.stringify(again) !== JSON.stringify(r.islands)) bad('the islands are made again the same (the world is the same bytes)', r.id);
  for (const il of r.islands) {
    if (!(il.r >= ISLANDS.radius[0] - 0.01 && il.r <= ISLANDS.radius[1] + 0.01)) bad('an island is a few units across', `${r.id} ${il.r}`);
    if (il.tree !== (r.id === 'black-river')) bad('mangroves grow on the marsh islands (the Black River) and not on gravel bars', r.id);
  }
  for (let i = 0; i < r.islands.length; i++) for (let j = i + 1; j < r.islands.length; j++) if (Math.hypot(r.islands[i].x - r.islands[j].x, r.islands[i].z - r.islands[j].z) < r.islands[i].r + r.islands[j].r) bad('islands do not overlap', r.id);
}
const black = manifest.rivers.find((r) => r.id === 'black-river');
if (black.islands.length < 8) bad('the Black River morass has many islands', String(black.islands.length));
// an island is land in the channel; round it the bank slopes up out of the water
const field = riverField(manifest.rivers);
const il = black.islands[0];
if (!(field.sdAt(il.x, il.z) > 0)) bad('the middle of an island is land (the distance is positive)', String(field.sdAt(il.x, il.z)));
// the course away from the islands is still a channel
const cm = black.course[Math.floor(black.course.length * 0.3)];
if (!(field.sdAt(cm.x, cm.z) < -2)) bad('the channel above the islands is open water', String(field.sdAt(cm.x, cm.z)));
// the trees on the islands are in the baked chunks
let trees = 0;
for (const c of manifest.chunks) {
  if (!c.props) continue;
  const chunk = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/chunks', `${c.key}.json`), 'utf8'));
  for (const p of chunk.props ?? []) if (p.m === 'treeSmall' && black.islands.some((i) => Math.hypot(p.x - i.x, p.z - i.z) <= i.r)) trees++;
}
if (trees < black.islands.length * 2) bad('each marsh island has its mangroves', String(trees));
void widthAt;
console.log(`river water: ${manifest.rivers.length} rivers, ${vertices} vertices; ${delta.reduce((s, r) => s + r.islands.length, 0)} delta islands (${black.islands.length} in the Black River morass), ${trees} mangroves`);
total();
