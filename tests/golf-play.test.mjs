// Playing the mini-golf course (lib/state/golfStore.js, lib/world/golfScore.js, docs/world/minigolf.md): starting a hole at a tee, aiming, charging, putting, the ball rolling and stopping or dropping, the card, picking up,
// a round to the end and the best kept on the device.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const { useGolf, AIM_SPEED, CHARGE_TIME, TEE_RANGE, MIN_DRAG_POWER } = await imp('state/golfStore.js');
const S = await imp('world/golfScore.js');
const { GOLF, aimFromDrag, previewPath, putt, stepBall } = await imp('world/golfPhysics.js');
const { avatarState } = await imp('sim/avatarState.js');
const { bad, total } = problemTally();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
const course = manifest.courses[0];
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

// ---- scoring words and totals
const names = [[1, 3, 'Hole in one!'], [2, 4, 'Eagle'], [3, 4, 'Birdie'], [4, 4, 'Par'], [5, 4, 'Bogey'], [6, 4, 'Double bogey'], [7, 4, 'Triple bogey'], [9, 4, '5 over par'], [2, 5, 'Albatross']];
for (const [strokes, par, want] of names) if (S.scoreName(strokes, par) !== want) bad('a score has its name', `${strokes} on par ${par}: ${S.scoreName(strokes, par)}`);
if (S.toPar(0) !== 'E' || S.toPar(3) !== '+3' || S.toPar(-2) !== '-2') bad('against par as text', '');
const t = S.cardTotals([2, 3, 5], course.holes);
if (t.strokes !== 10 || t.par !== course.holes.slice(0, 3).reduce((n, h) => n + h.par, 0) || t.played !== 3) bad('a card adds up against the holes played', JSON.stringify(t));
{ const st = mem(); const a = S.recordRound(st, 'c', { strokes: 30, par: 28 }, 1), b = S.recordRound(st, 'c', { strokes: 34, par: 28 }, 2), c = S.recordRound(st, 'c', { strokes: 27, par: 28 }, 3);
  if (!a.isBest || b.isBest || !c.isBest || S.bestRound(st, 'c').strokes !== 27 || S.bestRound(st, 'other') !== null) bad('the best round is kept for the course and only if it beats the last', JSON.stringify([a, b, c])); }

// ---- the store
const g = () => useGolf.getState();
g().quit(); g().setCourse(course);
const hole = (n) => course.holes[n - 1];
if (g().teeNear(hole(1).tee.x, hole(1).tee.z)?.n !== 1 || g().teeNear(hole(1).tee.x + TEE_RANGE + 1, hole(1).tee.z) !== null) bad('a tee is found within its range and not beyond', '');
avatarState.vehicle = { kind: 'car' };
if (g().start(1) || g().active) bad('no golf from a car', '');
avatarState.vehicle = null;
if (!g().start(1) || !g().active || g().phase !== 'aim' || g().hole !== 1 || g().ball.x !== hole(1).tee.x || g().ball.strokes !== 0) bad('start a hole at its tee', JSON.stringify(g().ball));
if (g().start(99)) bad('no such hole', '');
// the player stands behind the ball, facing along the aim
const behind = Math.hypot(avatarState.x - (g().ball.x - Math.cos(g().aim) * 1.0), avatarState.z - (g().ball.z - Math.sin(g().aim) * 1.0));
if (behind > 1e-6 || Math.abs(avatarState.yaw - (Math.PI / 2 - g().aim)) > 1e-6) bad('the player stands a step behind the ball, facing the aim', String(behind));
// aim: turns, at a speed
const a0 = g().aim; g().turn(1, 0.5);
if (Math.abs(g().aim - (a0 + AIM_SPEED * 0.5)) > 1e-9) bad('the aim turns at a speed', '');
g().setAim(0);
// power: charges while held, up to full; a putt only after charging
if (g().release()) bad('no putt without charging', '');
g().charge(true); g().tick(CHARGE_TIME / 2);
if (Math.abs(g().power - 0.5) > 1e-6) bad('the power charges over a second', String(g().power));
g().tick(5);
if (g().power !== 1) bad('the power stops at full', String(g().power));
if (!g().release() || g().phase !== 'roll' || g().ball.strokes !== 1) bad('letting go putts: a stroke, the ball rolls', JSON.stringify(g().phase));
if (g().release() || g().charge(true) !== undefined && g().charging) bad('no second putt while it rolls', '');
// roll to rest (a straight hole at full power rebounds off the end wall and may drop in)
for (let i = 0; i < 4000 && g().phase === 'roll'; i++) g().tick(1 / 60);
if (!(g().phase === 'aim' || g().phase === 'done')) bad('the ball comes to rest', g().phase);

// ---- a whole hole: putt toward the cup until it drops (a straight hole: aim along the lane at a power that suits the distance), counting strokes
{
  g().quit(); g().start(1);
  let guard = 0;
  while (g().phase !== 'done' && guard++ < 12) {
    const b = g().ball, h = hole(1), d = Math.hypot(h.cup.x - b.x, h.cup.z - b.z);
    g().setAim(Math.atan2(h.cup.z - b.z, h.cup.x - b.x));
    g().charge(true); g().tick(Math.min(1, Math.sqrt(2 * GOLF.friction * d) / GOLF.maxSpeed + 0.04) * CHARGE_TIME); g().release();
    for (let i = 0; i < 4000 && g().phase === 'roll'; i++) g().tick(1 / 60);
  }
  if (g().phase !== 'done' || !g().note.sunk || g().note.strokes < 1 || g().card[0] !== g().note.strokes) bad('a hole is played to the cup and its strokes go on the card', JSON.stringify([g().phase, g().note, g().card]));
  // the next hole keeps the card; a hole not finished after the stroke limit is picked up at par + 4 at least
  if (!g().next(mem()) || g().hole !== 2 || g().card[0] === undefined || g().phase !== 'aim') bad('on to hole 2 with the card kept', JSON.stringify([g().hole, g().card]));
}
// picking up: strokes at the limit with the ball not in
{
  g().quit(); g().start(5);
  for (let k = 0; k < GOLF.maxStrokes + 2 && g().phase !== 'done'; k++) {
    // putt away from the cup, softly, so it never drops
    g().setAim(Math.atan2(hole(5).tee.z - hole(5).cup.z, hole(5).tee.x - hole(5).cup.x) + 3); g().charge(true); g().tick(0.12 * CHARGE_TIME); g().release();
    for (let i = 0; i < 4000 && g().phase === 'roll'; i++) g().tick(1 / 60);
  }
  if (g().phase !== 'done' || g().note.sunk || g().card[4] < hole(5).par + 4) bad('a hole not finished after 8 strokes is picked up and counts at least par + 4', JSON.stringify([g().phase, g().note, g().card]));
}
// a round: all nine holes to the card, the best kept on the device
{
  const st = mem();
  g().quit(); g().start(1);
  for (let n = 1; n <= 9; n++) {
    if (g().hole !== n) bad('the round goes hole by hole', `${g().hole} ${n}`);
    { const cards = g().cards.map((c) => [...c]); cards[0][n - 1] = hole(n).par; useGolf.setState({ phase: 'done', ball: { ...g().ball, strokes: hole(n).par, sunk: true }, cards, card: cards[0], note: { strokes: hole(n).par, par: hole(n).par, sunk: true } }); }
    if (!g().next(st)) bad('next after a hole', String(n));
  }
  if (g().phase !== 'card' || g().round.strokes !== course.par || g().round.diff !== 0 || !g().round.isBest || S.bestRound(st, course.id)?.strokes !== course.par) bad('the card at the end: the total against par and the best kept', JSON.stringify(g().round));
  if (g().next(st)) bad('nothing after the card', '');
}

// ---- aiming by dragging, with the indicators' numbers (lib/world/golfPhysics.js aimFromDrag, previewPath)
{
  // the camera looks north (azimuth 0: forward is -z, right is +x): pulling the mouse straight down aims north, pulling left aims east, a short pull is a short power, a long one full
  const south = aimFromDrag({ dx: 0, dz: 100 }, 0), east = aimFromDrag({ dx: -100, dz: 0 }, 0), full = aimFromDrag({ dx: 0, dz: 400 }, 0);
  if (Math.abs(south.angle - -Math.PI / 2) > 1e-9 || Math.abs(east.angle) > 1e-9 || Math.abs(south.power - 100 / 170) > 1e-9 || full.power !== 1) bad('a pull aims the other way and its length is the power (north-looking camera)', JSON.stringify([south, east, full]));
  // turned to face east (azimuth -pi/2: forward is +x): pulling down aims east
  const turned = aimFromDrag({ dx: 0, dz: 100 }, -Math.PI / 2);
  if (Math.abs(Math.cos(turned.angle) - 1) > 1e-9) bad('the drag follows the camera\'s heading', JSON.stringify(turned));
  g().quit(); g().start(1); g().setAim(0);
  g().drag(1.0, 0.5);
  if (g().aim !== 1.0 || g().power !== 0.5 || !g().dragging || g().charging) bad('a drag sets the aim and the power and is not a putt yet', JSON.stringify([g().aim, g().power]));
  if (!g().dragEnd() || g().phase !== 'roll' || g().ball.strokes !== 1) bad('letting go of a drag putts', g().phase);
  for (let i = 0; i < 4000 && g().phase === 'roll'; i++) g().tick(1 / 60);
  // a tap (a short pull) is no putt
  g().quit(); g().start(1); g().drag(0.3, MIN_DRAG_POWER / 2);
  if (g().dragEnd() || g().phase !== 'aim' || g().ball.strokes !== 0 || g().dragging) bad('a tap or a very short pull putts nothing', '');
  // the preview: the path the real roll takes, from the ball, ending where it stops (or drops)
  g().quit(); g().start(1);
  const h1 = hole(1), phys = { cup: h1.cup, segments: h1.segments.map(([ax, az, bx, bz, nx, nz]) => ({ a: { x: ax, z: az }, b: { x: bx, z: bz }, nx, nz })) };
  const before = JSON.stringify(g().ball), pts = previewPath(g().ball, phys, 0, 0.5, 5, 0.05);
  if (JSON.stringify(g().ball) !== before) bad('the preview does not move the ball', '');
  const ball = { x: h1.tee.x, z: h1.tee.z, vx: 0, vz: 0, sunk: false, strokes: 0, moving: false }; putt(ball, 0, 0.5); for (let t = 0; t < 5 && ball.moving; t += 0.05) stepBall(ball, phys, 0.05);
  if (pts.length < 5 || Math.hypot(pts.at(-1).x - ball.x, pts.at(-1).z - ball.z) > 1e-6 || pts[0].x !== h1.tee.x) bad('the preview ends where the real putt ends', `${pts.at(-1).x} ${ball.x}`);
}

// ---- two players on one device: take turns on each hole, a card each, a winner
{
  g().quit();
  if (!g().start(1, { players: 2, names: ['Ann', 'Bob'] }) || g().players !== 2 || g().player !== 0 || g().names[1] !== 'Bob') bad('a two-player round starts with the first player', '');
  const finish = (strokes) => { const h = hole(g().hole), cards = g().cards.map((c) => [...c]); cards[g().player][g().hole - 1] = strokes; useGolf.setState({ phase: 'done', ball: { ...g().ball, strokes, sunk: true }, cards, card: cards[g().player], note: { strokes, par: h.par, sunk: true } }); };
  for (let n = 1; n <= 9; n++) {
    if (g().hole !== n || g().player !== 0) bad('the first player plays each hole first', `${g().hole} ${g().player}`);
    finish(hole(n).par); // Ann: par
    if (!g().next(mem()) || g().player !== 1 || g().hole !== n || g().phase !== 'aim' || g().ball.strokes !== 0 || g().card !== g().cards[1]) bad('then the second player plays the same hole from the tee', `${g().player} ${g().hole}`);
    finish(hole(n).par + (n === 5 ? 1 : 0)); // Bob: par, one over on hole 5
    if (!g().next(mem())) bad('after the second player: the next hole or the card', String(n));
  }
  const r = g().round;
  if (g().phase !== 'card' || r.winner !== 0 || r.totals[0].strokes !== course.par || r.totals[1].strokes !== course.par + 1 || r.isBest) bad('two players: the card has both totals, the lower wins, no best is kept for two', JSON.stringify(r));
  // a tie
  g().quit(); g().start(1, { players: 2 });
  for (let n = 1; n <= 9; n++) { const cards = g().cards.map((c) => [...c]); for (const p of [0, 1]) { cards[g().player][g().hole - 1] = 3; useGolf.setState({ phase: 'done', cards, card: cards[g().player], ball: { ...g().ball, strokes: 3, sunk: true }, note: { strokes: 3, par: 3, sunk: true } }); g().next(mem()); void p; } }
  if (g().round?.winner !== -1) bad('equal totals are a tie', JSON.stringify(g().round?.winner));
  g().quit();
}
g().quit();
if (g().active || g().ball !== null || g().card.length) bad('putting the club away clears the game', '');
console.log(`golf play: scoring, a ball putted to the cup in some strokes, picking up, a nine-hole round to the card`);
if (total()) process.exitCode = 1;
