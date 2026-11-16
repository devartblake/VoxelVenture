// Where the first town meets the baked world (lib/world/townJoin.js, docs/world/datum.md, "The town border"): the heights agree at the join, and no ground round the town is left undrawn.
// The town draws its own land (a flat slab) and its own streets; the baked chunks that overlap it are joined to it. Before the join, every chunk that overlapped the town's land was left out whole, which left a frame of
// ground (50 to 100 units wide) that neither the town nor a chunk drew, and cut the roads from the ring to the town's gates short.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const J = await imp('world/townJoin.js');
const D = await imp('world/datum.js');
const { generateCity } = await imp('city/cityGenerator.js');
const { bad, total } = problemTally();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
const land = manifest.towns[0].land;
const city = generateCity(20260101);
const SIZE = J.CHUNK;
const chunkOf = (c) => JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/chunks', `${c.key}.json`), 'utf8'));
const approx = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---- the town's land is the same in the manifest and in the game's layout
const gl = city.layout?.land ?? city.land;
if (!['x0', 'x1', 'z0', 'z1'].every((k) => approx(gl[k], land[k], 1e-6))) bad('the manifest\'s town land is the game\'s land', JSON.stringify([gl, land]));

// ---- the chunks round the town
const overlapping = manifest.chunks.filter((c) => J.overlapsTown(c, land));
const inside = overlapping.filter((c) => J.insideTown(c, land));
const partial = overlapping.filter((c) => !J.insideTown(c, land));
if (overlapping.length !== 16 || inside.length < 1 || partial.length < 8) bad('sixteen chunks overlap the town: a few wholly inside it, and the rest only overlapping', `${overlapping.length} ${inside.length} ${partial.length}`);
if (inside.some((c) => !J.overlapsTown(c, land)) || partial.some((c) => J.insideTown(c, land))) bad('wholly inside is a kind of overlapping, and partial is not inside', '');

// ---- heights: the baked ground in the chunks that overlap the town, and for 60 units beyond them, is the town's ground (the first hills rise about 80 units further out)
const bx0 = Math.min(...overlapping.map((c) => c.cx)) * SIZE, bx1 = (Math.max(...overlapping.map((c) => c.cx)) + 1) * SIZE, bz0 = Math.min(...overlapping.map((c) => c.cz)) * SIZE, bz1 = (Math.max(...overlapping.map((c) => c.cz)) + 1) * SIZE;
let worst = 0, cells = 0, hills = 0;
for (const c of manifest.chunks) {
  const x0 = c.cx * SIZE, z0 = c.cz * SIZE;
  if (x0 + SIZE < bx0 - 130 || x0 > bx1 + 130 || z0 + SIZE < bz0 - 130 || z0 > bz1 + 130) continue;
  const g = chunkOf(c).ground;
  if (!g) { bad('every chunk round the town has ground', c.key); continue; }
  if (J.overlapsTown(c, land) && g.mask && [...g.mask].some((m) => !m)) bad('the ground in the town\'s chunks is all land (no water in the join)', c.key);
  if (!g.h) { cells++; continue; } // (no heights: flat at the datum)
  const n = g.n, cell = SIZE / n, W = n + 3;
  for (let jj = 0; jj <= n; jj++) for (let ii = 0; ii <= n; ii++) {
    const d = Math.max(bx0 - (x0 + ii * cell), x0 + ii * cell - bx1, bz0 - (z0 + jj * cell), z0 + jj * cell - bz1); // how far outside the block of chunks
    const h = g.h[(jj + 1) * W + (ii + 1)] / 100; // centimetres
    if (d < 60) { worst = Math.max(worst, Math.abs(h - D.TOWN_GROUND)); cells++; } else if (h > 1) hills++;
  }
}
if (worst > 0.01) bad('the baked ground in and for 60 units round the town\'s chunks is at the town ground: no step at the join', `${worst}`);
if (!(hills > 0)) bad('the hills do begin further out (the check is looking at the real ground)', String(hills));
// the town's slab is over the lowered ground, and under the roads
if (!(D.TOWN_GROUND_TOP + 1e-9 > J.joinedY() + D.TOWN_GROUND + 0.02) || !(D.TOWN_GROUND_TOP < D.LIFT.road)) bad('the town slab lies over the joined ground and under the roads', '');
if (!(J.JOIN.underlay > D.TOWN_GROUND_TOP)) bad('the joined ground is lowered more than the slab stands over the ground (so it cannot show through)', '');

// ---- coverage: every land cell near the town is drawn by the town or by a chunk
// before: the chunks that overlap the town were all left out. After: only those wholly inside are.
const covered = (x, z, leaveOut) => (x >= land.x0 && x <= land.x1 && z >= land.z0 && z <= land.z1) || !leaveOut({ cx: Math.floor(x / SIZE), cz: Math.floor(z / SIZE) });
const uncovered = (leaveOut) => { let n = 0; for (let x = -255.5; x < 256; x += 1) for (let z = -255.5; z < 256; z += 1) if (!covered(x, z, leaveOut)) n++; return n; };
const before = uncovered((c) => J.overlapsTown(c, land));
const after = uncovered((c) => J.insideTown(c, land));
if (before < 20000) bad('the old arrangement left a frame undrawn round the town (the reason for the join): over 20,000 square units', String(before));
if (after !== 0) bad('with the join nothing near the town is left undrawn', String(after));
// the frame, in units, as the strips of the block of overlapping chunks outside the land
const strips = [land.x0 - bx0, bx1 - land.x1, land.z0 - bz0, bz1 - land.z1];
if (strips.some((w) => w < 40 || w > 110)) bad('the frame was 50 to 100 units wide on every side', JSON.stringify(strips.map((w) => +w.toFixed(1))));

// ---- the roads from the ring to the town's gates
const parts = (a, b) => J.outsideParts(a, b, land);
const len = (s) => Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
const inRect = (p) => p.x > land.x0 + 1e-6 && p.x < land.x1 - 1e-6 && p.z > land.z0 + 1e-6 && p.z < land.z1 - 1e-6;
// segments: wholly outside (kept whole), crossing (cut at the edge), wholly inside (dropped)
const out = parts({ x: 300, z: 0 }, { x: 400, z: 0 }), cross = parts({ x: -128, z: 5 }, { x: -256, z: 5 }), within = parts({ x: -90, z: 5 }, { x: -128, z: 5 }), through = parts({ x: -300, z: 5 }, { x: 300, z: 5 });
if (out.length !== 1 || out[0].a.x !== 300 || out[0].b.x !== 400) bad('a segment outside the land is kept whole', JSON.stringify(out));
if (cross.length !== 1 || !approx(cross[0].a.x, land.x0, 1e-6) || cross[0].b.x !== -256 || !approx(len(cross[0]), 256 + land.x0 * 1, 97.3)) bad('a segment that leaves the land is cut at its edge', JSON.stringify(cross));
if (within.length !== 0) bad('a segment inside the land is dropped (the town\'s own streets are there)', JSON.stringify(within));
if (through.length !== 2 || !approx(through[0].b.x, land.x0) || !approx(through[1].a.x, land.x1)) bad('a segment through the land keeps its two ends', JSON.stringify(through));
// the real chunks: after clipping, no highway piece is inside the land, and each cut ends on the land's edge or where it did
let kept = 0, cut = 0, insideAfter = 0;
for (const c of partial) {
  const j = chunkOf(c);
  const clipped = J.clipChunkToTown(j, land);
  if (clipped.roads.length || clipped.plots.length || clipped.props.length) bad('the town\'s own streets, plots and props are dropped from a joined chunk', c.key);
  if (clipped.ground !== j.ground) bad('a joined chunk keeps its ground', c.key);
  for (const h of clipped.highways) { kept++; if (inRect({ x: (h.a.x + h.b.x) / 2, z: (h.a.z + h.b.z) / 2 })) insideAfter++; }
  cut += clipped.highways.filter((h) => !j.highways.some((o) => o.a.x === h.a.x && o.a.z === h.a.z && o.b.x === h.b.x && o.b.z === h.b.z)).length;
}
if (insideAfter) bad('no highway of a joined chunk lies inside the town land', String(insideAfter));
if (!(kept >= 6 && cut >= 2)) bad('the spurs that reach the town are kept and cut at its edge', `${kept} kept, ${cut} cut`);
// a bridge is never cut
const bridge = { kind: 'causeway-bridge', a: { x: 0, z: 0 }, b: { x: 10, z: 0 }, id: 'b' };
if (J.clipChunkToTown({ highways: [bridge], plots: [1], roads: [1], props: [1] }, land).highways[0] !== bridge) bad('a bridge piece is never cut', '');
console.log(`town join: ${overlapping.length} chunks overlap the town (${inside.length} inside), baked ground within ${worst.toFixed(3)} of the town ground over ${cells} cells; ${before} square units undrawn before the join, ${after} after; ${kept} highway pieces kept, ${cut} cut`);
total();
