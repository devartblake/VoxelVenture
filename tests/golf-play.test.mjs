// Playing the mini-golf course (lib/state/golfStore.js, lib/world/golfScore.js, docs/world/minigolf.md): starting a hole at a tee, aiming, charging, putting, the ball rolling and stopping or dropping, the card, picking up,
// a round to the end and the best kept on the device.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const { useGolf, AIM_SPEED, CHARGE_TIME, TEE_RANGE } = await imp('state/golfStore.js');
const S = await imp('world/golfScore.js');
const { GOLF } = await imp('world/golfPhysics.js');
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
    useGolf.setState({ phase: 'done', ball: { ...g().ball, strokes: hole(n).par, sunk: true }, card: Object.assign([...g().card], { [n - 1]: hole(n).par }), note: { strokes: hole(n).par, par: hole(n).par, sunk: true } });
    if (!g().next(st)) bad('next after a hole', String(n));
  }
  if (g().phase !== 'card' || g().round.strokes !== course.par || g().round.diff !== 0 || !g().round.isBest || S.bestRound(st, course.id)?.strokes !== course.par) bad('the card at the end: the total against par and the best kept', JSON.stringify(g().round));
  if (g().next(st)) bad('nothing after the card', '');
}
g().quit();
if (g().active || g().ball !== null || g().card.length) bad('putting the club away clears the game', '');
console.log(`golf play: scoring, a ball putted to the cup in some strokes, picking up, a nine-hole round to the card`);
if (total()) process.exitCode = 1;
