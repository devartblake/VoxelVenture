// The mini-golf course (lib/world/minigolf.js, lib/world/golfPhysics.js, docs/world/minigolf.md): nine holes of the Kenney Minigolf Kit's tiles made from a seed, laid on a flat site, baked into the world; and a ball that
// rolls, bounces off the tiles' walls and drops into the cup.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const M = await imp('world/minigolf.js');
const G = await imp('world/golfPhysics.js');
const { WORLD_RECIPE, validateRecipe } = await imp('world/worldRecipe.js');
const { bad, total } = problemTally();
const C = M.COURSE;

// ---- the generator: deterministic, nine holes, each a connected path of tiles from the tee end to the cup end
const a = M.generateCourse({ seed: 7, origin: { x: 100, z: 200 } }), b = M.generateCourse({ seed: 7, origin: { x: 100, z: 200 } });
if (JSON.stringify(a) !== JSON.stringify(b)) bad('the same seed makes the same course', '');
if (a.holes.map((h) => h.kind).join() !== M.KINDS.join() || a.holes.length !== 9) bad('nine holes in the order of KINDS', a.holes.map((h) => h.kind).join());
if (JSON.stringify(M.generateCourse({ seed: 8 }).tiles) === JSON.stringify(M.generateCourse({ seed: 9 }).tiles)) bad('a different seed makes different holes', '');
for (let k = 0; k < 9; k++) {
  let s = 4321 + k; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const hole = M.makeHole(M.KINDS[k], rnd);
  const t = hole.tiles;
  if (t[0].m !== 'end' || t.at(-1).m !== 'hole-round') bad('a hole starts at an end tile and finishes at the round cup tile', `${k + 1} ${M.KINDS[k]}`);
  for (let i = 1; i < t.length; i++) if (Math.abs(t[i].ti - t[i - 1].ti) + Math.abs(t[i].tj - t[i - 1].tj) !== 1) bad('the tiles are in a connected path', `${k + 1} at ${i}`);
  if (new Set(t.map((p) => `${p.ti},${p.tj}`)).size !== t.length) bad('the path does not cross itself', `${k + 1}`);
  if (hole.w > 16 || hole.h > 8) bad('a hole fits its place in the grid (16 x 8 tiles)', `${k + 1}: ${hole.w} x ${hole.h}`);
  if (!t.every((p) => Number.isInteger(p.r) && p.r >= 0 && p.r < 4)) bad('every tile has its quarter turns', `${k + 1}`);
  const kinds = new Set(t.map((p) => p.extra).filter(Boolean));
  const want = { block: 'obstacle-block', windmill: 'structure-windmill', castle: 'castle' }[M.KINDS[k]];
  if (want ? !kinds.has(want) : kinds.size) bad('the obstacle of the hole is there (a bar, a windmill, a castle) and only on those', `${k + 1} ${M.KINDS[k]}: ${[...kinds]}`);
  if (M.KINDS[k] === 'uturn' && t.filter((p) => p.m === 'corner').length !== 2) bad('a hole that doubles back has two corners', '');
}
for (const h of a.holes) {
  if (!(h.par >= 2 && h.par <= 4)) bad('par is 2 to 4', `${h.n}: ${h.par}`);
  const w = h.bounds.x1 - h.bounds.x0, d = h.bounds.z1 - h.bounds.z0;
  if (w > C.pitch[0] - 6 || d > C.pitch[1] - 6) bad('a hole fits its place in the grid', `${h.n}: ${w} x ${d}`);
  if (Math.hypot(h.tee.x - h.cup.x, h.tee.z - h.cup.z) < 5) bad('tee and cup are apart', String(h.n));
  // the walls: positive lengths, unit normals, inside the hole's bounds (to the wall's thickness)
  for (const s of h.segments) {
    const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z), nl = Math.hypot(s.nx, s.nz);
    if (!(len > 0.05) || Math.abs(nl - 1) > 1e-3) bad('a wall has a length and a unit normal', `${h.n}: ${JSON.stringify(s)}`);
    if (Math.min(s.a.x, s.b.x) < h.bounds.x0 - 0.01 || Math.max(s.a.x, s.b.x) > h.bounds.x1 + 0.01 || Math.min(s.a.z, s.b.z) < h.bounds.z0 - 0.01 || Math.max(s.a.z, s.b.z) > h.bounds.z1 + 0.01) bad('the walls are inside the hole\'s tiles', `${h.n}`);
  }
}
for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) { const p = a.holes[i].bounds, q = a.holes[j].bounds; if (p.x0 < q.x1 + 4 && q.x0 < p.x1 + 4 && p.z0 < q.z1 + 4 && q.z0 < p.z1 + 4) bad('holes are 4 units apart', `${i + 1} ${j + 1}`); }
// the models the course places are in the kit's list, the fallback boxes are tagged 2 (or are the tee mats), the flags are at the cups
const names = new Set(M.GOLF_MODELS);
if (a.tiles.some((t) => !names.has(t.m))) bad('every tile is a model of GOLF_MODELS', [...new Set(a.tiles.map((t) => t.m).filter((m) => !names.has(m)))].join());
if (a.boxes.some((q) => q.length !== 11 && !(q.length === 10 && Math.abs(q[4] - 0.01) < 1e-9)) || a.boxes.some((q) => q[3] <= 0 || q[4] <= 0 || q[5] <= 0)) bad('the boxes have sizes and the replaced tag (or are tee mats)', '');
for (const h of a.holes) if (!a.tiles.some((t) => t.m === 'flag-red' && Math.hypot(t.x - h.cup.x, t.z - h.cup.z) < 1e-6)) bad('a flag at every cup', String(h.n));
// the kit's files are all there
for (const m of M.GOLF_MODELS) if (!fs.existsSync(path.join(root, 'apps/web/public/models/kenney/minigolf', `${m}.glb`))) bad('the kit file is in the repository', m);

// ---- the ball (lib/world/golfPhysics.js)
{
  const hole = a.holes[0]; // a straight lane
  const run = (angle, power, h = hole) => { const ball = G.newBall(h.tee); G.putt(ball, angle, power); for (let t = 0; t < 40 && ball.moving; t += 1 / 60) G.stepBall(ball, h, 1 / 60); return ball; };
  const stopped = run(0, 0.2);
  if (stopped.moving || stopped.vx !== 0 || !(stopped.x > hole.tee.x + 0.5) || stopped.strokes !== 1) bad('a soft putt rolls and stops (friction), counting a stroke', JSON.stringify(stopped));
  if (JSON.stringify(run(0, 0.2)) !== JSON.stringify(stopped)) bad('the same putt gives the same roll', '');
  const dir = Math.atan2(hole.cup.z - hole.tee.z, hole.cup.x - hole.tee.x);
  let sunk = null;
  for (let p = 0.2; p <= 1; p += 0.01) { if (run(dir, p).sunk) { sunk = p; break; } }
  if (sunk === null) bad('a straight putt along the lane at some power sinks', '');
  for (const [speed, drops] of [[10, false], [3, true]]) { const ball = G.newBall({ x: hole.cup.x - 0.3, z: hole.cup.z }); ball.vx = speed; ball.moving = true; G.stepBall(ball, hole, 0.08); if (ball.sunk !== drops) bad('the cup takes a slow ball and not a fast one', `${speed}: ${ball.sunk}`); }
  const hard = run(dir, 1);
  if (hard.strokes !== 1 || hard.moving) bad('a full-power putt comes to rest (after bouncing off the end, it may drop in)', JSON.stringify(hard));
  // the windmill's arch is passable (a putt along the lane finds the cup through it) and its body is not (a putt at the wall beside the arch bounces back)
  const wm = a.holes[3], wdir = Math.atan2(wm.cup.z - wm.tee.z, wm.cup.x - wm.tee.x);
  let through = false;
  for (let p = 0.2; p <= 1 && !through; p += 0.01) through = run(wdir, p, wm).sunk;
  if (!through) bad('a putt along the lane goes through the windmill\'s arch to the cup', '');
  const off = run(wdir + 0.12, 0.7, wm);
  if (off.x > (wm.tee.x + wm.cup.x) / 2 + 1 && !off.sunk) bad('the windmill\'s body stops a ball that is not lined up with the arch', JSON.stringify([off.x, off.z]));
  // a hundred random putts on every hole: the ball is always inside its hole's walls
  let seed = 99; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let outside = 0;
  for (const h of a.holes) for (let k = 0; k < 30; k++) {
    const ball = G.newBall(h.tee); G.putt(ball, rnd() * Math.PI * 2, 0.3 + rnd() * 0.7);
    for (let t = 0; t < 30 && ball.moving; t += 1 / 60) { G.stepBall(ball, h, 1 / 60); if (ball.x < h.bounds.x0 - 0.1 || ball.x > h.bounds.x1 + 0.1 || ball.z < h.bounds.z0 - 0.1 || ball.z > h.bounds.z1 + 0.1) outside++; }
  }
  if (outside) bad('a ball never leaves its hole\'s walls (2,430 random putts)', String(outside));
  if (G.holeScore({ sunk: true, strokes: 3 }, hole) !== 3 || G.holeScore({ sunk: false, strokes: 8 }, hole) !== Math.max(8, hole.par + 4)) bad('a score is the strokes; a hole not finished counts par + 4 at least', '');
}

// ---- in the baked world
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
const mc = manifest.courses?.[0];
if (!mc || mc.id !== 'harbor-minigolf' || mc.holes.length !== 9 || mc.par !== mc.holes.reduce((s, h) => s + h.par, 0)) bad('the manifest has the course, nine holes', JSON.stringify(mc && mc.id));
else {
  const isle = manifest.landmasses.find((l) => l.id === mc.landmass), town = manifest.towns.find((t) => t.landmass === isle.id).land;
  const b = mc.bounds;
  if (b.x1 > town.x0 - 40 && b.x0 < town.x1 + 40 && b.z1 > town.z0 - 40 && b.z0 < town.z1 + 40) bad('the course is clear of the town', '');
  let props = 0, boxes = 0;
  for (const c of manifest.chunks) { if (c.cx * 128 > b.x1 || (c.cx + 1) * 128 < b.x0 || c.cz * 128 > b.z1 || (c.cz + 1) * 128 < b.z0) continue; const j = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/chunks', `${c.key}.json`), 'utf8')); props += (j.props ?? []).filter((p) => /^golf-/.test(p.m) && p.x >= b.x0 && p.x <= b.x1 && p.z >= b.z0 && p.z <= b.z1).length; boxes += (j.structures ?? []).filter((q) => q[0] >= b.x0 && q[0] <= b.x1 && q[2] >= b.z0 && q[2] <= b.z1).length; if (j.ground?.h?.some((v) => v !== 0)) bad('the course is on flat ground', c.key); }
  const want = M.generateCourse({ seed: mc.seed, origin: { x: b.x0, z: b.z0 } });
  if (props !== want.tiles.length || boxes < want.boxes.length) bad('every tile and box of the course is baked', `${props}/${want.tiles.length} ${boxes}/${want.boxes.length}`);
  const h1 = mc.holes[0], seg = h1.segments[0];
  if (seg.length !== 6 || !(h1.par >= 2)) bad('a hole carries its walls as [ax, az, bx, bz, nx, nz]', JSON.stringify(seg));
  const hole = { cup: h1.cup, segments: h1.segments.map(([ax, az, bx, bz, nx, nz]) => ({ a: { x: ax, z: az }, b: { x: bx, z: bz }, nx, nz })) };
  const ball = G.newBall(h1.tee); G.putt(ball, 0, 0.3); for (let t = 0; t < 20 && ball.moving; t += 1 / 60) G.stepBall(ball, hole, 1 / 60);
  if (!(ball.x > h1.tee.x)) bad('a hole from the manifest can be played', '');
}
if (!validateRecipe({ ...WORLD_RECIPE, courses: [{ id: 'x', name: 'X', landmass: 'nowhere', site: { x: 0, z: 0 }, seed: 1 }] }).some((p) => /nowhere/.test(p))) bad('a course on a landmass the recipe does not have is invalid', '');
console.log(`minigolf: 9 holes of kit tiles, par ${a.par}, ${a.tiles.length} models, ${a.boxes.length} fallback boxes; baked at (${mc?.bounds.x0}, ${mc?.bounds.z0})`);
if (total()) process.exitCode = 1;
