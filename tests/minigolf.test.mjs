// The mini-golf course (lib/world/minigolf.js, lib/world/golfPhysics.js, docs/world/minigolf.md): nine holes made from a seed, laid on a flat site, baked into the world; and a ball that rolls, bounces off the walls
// and drops into the cup.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const M = await imp('world/minigolf.js');
const G = await imp('world/golfPhysics.js');
const { WORLD_RECIPE, validateRecipe } = await imp('world/worldRecipe.js');
const { PALETTE } = await imp('world/track.js');
const { bad, total } = problemTally();
const C = M.COURSE;

// ---- the generator: deterministic, nine holes, each a connected lane with its tee and cup on the felt
const a = M.generateCourse({ seed: 7, origin: { x: 100, z: 200 } }), b = M.generateCourse({ seed: 7, origin: { x: 100, z: 200 } });
if (JSON.stringify(a) !== JSON.stringify(b)) bad('the same seed makes the same course', '');
if (JSON.stringify(M.generateCourse({ seed: 8 }).holes.map((h) => h.kind)) !== JSON.stringify(M.KINDS) || a.holes.length !== 9) bad('nine holes in the order of KINDS (the seed varies the sizes and the turns)', a.holes.map((h) => h.kind).join());
if (JSON.stringify(M.generateCourse({ seed: 8 }).boxes) === JSON.stringify(M.generateCourse({ seed: 9 }).boxes)) bad('a different seed makes different holes', '');
for (const h of a.holes) {
  if (!(h.par >= 2 && h.par <= 4)) bad('par is 2 to 4', `${h.n}: ${h.par}`);
  if (!(h.segments.length >= 4)) bad('a hole is walled', String(h.n));
  const w = h.bounds.x1 - h.bounds.x0, d = h.bounds.z1 - h.bounds.z0;
  if (w > C.pitch[0] - 4 || d > C.pitch[1] - 4) bad('a hole fits its place in the grid', `${h.n}: ${w} x ${d}`);
  if (Math.hypot(h.tee.x - h.cup.x, h.tee.z - h.cup.z) < (h.kind === 'uturn' ? 4 : 8)) bad('tee and cup are well apart (a hole that doubles back: 4)', String(h.n));
}
// holes do not touch: every pair of hole bounds is at least 4 units apart
for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) { const p = a.holes[i].bounds, q = a.holes[j].bounds; if (p.x0 < q.x1 + 4 && q.x0 < p.x1 + 4 && p.z0 < q.z1 + 4 && q.z0 < p.z1 + 4) bad('holes are 4 units apart', `${i + 1} ${j + 1}`); }
// the lane is connected from the tee to the cup (a flood fill of the hole's cells), and every felt edge has a wall
for (let k = 0; k < 9; k++) {
  const hole = M.makeHole(M.KINDS[k], (() => { let s = 1234 + k; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })());
  const seen = new Set(), stack = [`${hole.tee.i},${hole.tee.j}`];
  if (!hole.cells.has(stack[0]) || !hole.cells.has(`${hole.cup.i},${hole.cup.j}`)) bad('tee and cup are on the felt', `${k + 1} ${M.KINDS[k]}`);
  while (stack.length) { const c = stack.pop(); if (seen.has(c) || !hole.cells.has(c)) continue; seen.add(c); const [i, j] = c.split(',').map(Number); stack.push(`${i + 1},${j}`, `${i - 1},${j}`, `${i},${j + 1}`, `${i},${j - 1}`); }
  if (!seen.has(`${hole.cup.i},${hole.cup.j}`) || seen.size !== hole.cells.size) bad('the lane is one piece from tee to cup', `${k + 1} ${M.KINDS[k]}: ${seen.size} of ${hole.cells.size}`);
  const runs = M.boundaryRuns(hole.cells);
  const len = runs.reduce((s, r) => s + (r.to - r.from), 0);
  let edges = 0;
  for (const c of hole.cells) { const [i, j] = c.split(',').map(Number); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!hole.cells.has(`${i + di},${j + dj}`)) edges++; }
  if (len !== edges) bad('every edge of the felt has a wall (the runs cover all of them)', `${len} of ${edges}`);
}
// the painted quads use the palette and face up; the boxes are walls and flags
if (a.surface.some((q) => !PALETTE[q[0]] || q.length !== 9)) bad('the quads name a palette entry', '');
const up = (q) => { const ax = q[5] - q[1], az = q[6] - q[2], bx = q[3] - q[1], bz = q[4] - q[2]; return az * bx - ax * bz; }; // chunkMesh turns the quad (0, 2, 1): up when this is positive
if (a.surface.some((q) => !(up(q) > 0))) bad('the quads face up (chunkMesh\'s winding)', '');
if (a.boxes.some((q) => q.length < 10 || q[4] <= 0 || q[3] <= 0 || q[5] <= 0)) bad('the boxes have sizes', '');

// ---- the ball (lib/world/golfPhysics.js)
{
  const hole = a.holes[0]; // a straight lane along +x
  const run = (angle, power) => { const ball = G.newBall(hole.tee); G.putt(ball, angle, power); for (let t = 0; t < 40 && ball.moving; t += 1 / 60) G.stepBall(ball, hole, 1 / 60); return ball; };
  const stopped = run(0, 0.2);
  if (stopped.moving || stopped.vx !== 0 || !(stopped.x > hole.tee.x + 0.5) || stopped.strokes !== 1) bad('a soft putt rolls and stops (friction), counting a stroke', JSON.stringify(stopped));
  const again = run(0, 0.2);
  if (again.x !== stopped.x || again.z !== stopped.z) bad('the same putt gives the same roll', '');
  // the speed that just reaches the cup: v^2 / (2 friction) ~ the distance (the drag adds a little): find a power that sinks it
  const dist = hole.cup.x - hole.tee.x;
  let sunk = null;
  for (let p = 0.2; p <= 1; p += 0.01) { const r = run(0, p); if (r.sunk) { sunk = p; break; } }
  if (sunk === null) bad('a straight putt along the lane at some power sinks', `distance ${dist.toFixed(1)}`);
  // the cup takes a slow ball and not a fast one: at 10 units a second a ball passes over it, at 3 it drops
  for (const [speed, drops] of [[10, false], [3, true]]) { const ball = G.newBall({ x: hole.cup.x - 0.3, z: hole.cup.z }); ball.vx = speed; ball.moving = true; G.stepBall(ball, hole, 0.08); if (ball.sunk !== drops) bad('the cup takes a slow ball and not a fast one', `${speed}: ${ball.sunk}`); }
  const hard = run(0, 1);
  if (hard.strokes !== 1 || !(hard.moving === false)) bad('a full-power putt comes to rest (after bouncing off the end wall, it may drop in)', JSON.stringify(hard));
  // the wall: a putt at the side wall bounces back into the lane; the ball never leaves the felt
  const side = run(Math.PI / 2, 0.6);
  if (!(Math.abs(side.z - hole.tee.z) < C.lane * C.cell / 2)) bad('a putt at the side wall stays inside the lane', String(side.z - hole.tee.z));
  // a hundred random putts on every hole: the ball is always on the felt (inside the hole's bounds, within the lane's cells)
  let seed = 99; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let outside = 0;
  for (const h of a.holes) for (let k = 0; k < 25; k++) {
    const ball = G.newBall(h.tee); G.putt(ball, rnd() * Math.PI * 2, 0.3 + rnd() * 0.7);
    for (let t = 0; t < 30 && ball.moving; t += 1 / 60) { G.stepBall(ball, h, 1 / 60); if (ball.x < h.bounds.x0 - 0.1 || ball.x > h.bounds.x1 + 0.1 || ball.z < h.bounds.z0 - 0.1 || ball.z > h.bounds.z1 + 0.1) outside++; }
  }
  if (outside) bad('a ball never leaves its hole\'s walls (2,250 random putts)', String(outside));
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
  let felt = 0, walls = 0;
  for (const c of manifest.chunks) { if (c.cx * 128 > b.x1 || (c.cx + 1) * 128 < b.x0 || c.cz * 128 > b.z1 || (c.cz + 1) * 128 < b.z0) continue; const j = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/chunks', `${c.key}.json`), 'utf8')); felt += (j.surface ?? []).filter((q) => (q[1] + q[5]) / 2 >= b.x0 && (q[1] + q[5]) / 2 <= b.x1 && (q[2] + q[6]) / 2 >= b.z0 && (q[2] + q[6]) / 2 <= b.z1).length; walls += (j.structures ?? []).length; if (j.ground?.h?.some((v) => v !== 0)) bad('the course is on flat ground', c.key); }
  const want = M.generateCourse({ seed: mc.seed, origin: { x: b.x0, z: b.z0 } });
  if (felt !== want.surface.length || walls < want.boxes.length) bad('every quad and box of the course is baked', `${felt}/${want.surface.length} ${walls}/${want.boxes.length}`);
  const h1 = mc.holes[0], seg = h1.segments[0];
  if (seg.length !== 6 || !(h1.par >= 2)) bad('a hole carries its walls as [ax, az, bx, bz, nx, nz]', JSON.stringify(seg));
  // a hole from the manifest plays: putt to the cup
  const hole = { cup: h1.cup, segments: h1.segments.map(([ax, az, bx, bz, nx, nz]) => ({ a: { x: ax, z: az }, b: { x: bx, z: bz }, nx, nz })) };
  const ball = G.newBall(h1.tee); G.putt(ball, 0, 0.3); for (let t = 0; t < 20 && ball.moving; t += 1 / 60) G.stepBall(ball, hole, 1 / 60);
  if (!(ball.x > h1.tee.x)) bad('a hole from the manifest can be played', '');
}
if (!validateRecipe({ ...WORLD_RECIPE, courses: [{ id: 'x', name: 'X', landmass: 'nowhere', site: { x: 0, z: 0 }, seed: 1 }] }).some((p) => /nowhere/.test(p))) bad('a course on a landmass the recipe does not have is invalid', '');
console.log(`minigolf: 9 holes, par ${a.par}, ${a.surface.length} quads, ${a.boxes.length} boxes; baked at (${mc?.bounds.x0}, ${mc?.bounds.z0})`);
if (total()) process.exitCode = 1;
