// The mini-golf course's saved leaderboard (docs/world/minigolf.md, "The saved leaderboard"). The rule is the game's rule for value: the server decides. A page sends the PUTTS of a
// finished one-player round (for each hole, each putt's angle in thousandths of a radian and its power in thousandths), never a score; the server plays them again on its own copy of
// the course with the same physics (lib/world/golfPhysics.js, deterministic) and keeps the strokes that come out. A round that does not replay (a putt after the ball dropped, a hole
// not finished, a ball that never stops) is refused, so nobody can write a 9 on the board, only putt one.
import { imp } from '../../scripts/lib-loader.mjs';
import { ApiError, requireAccount } from './core.mjs';

const { buildWorld } = await imp('world/buildWorld.js');
const { GOLF, newBall, putt, stepBall, holeScore } = await imp('world/golfPhysics.js');

export const ROUNDS = { keep: 10, minGapMs: 20_000, maxRollSeconds: 40 }; // minGapMs: a round cannot follow the last one kept any sooner than this
const fail = (status, message, code) => { throw new ApiError(status, message, code); };

const courses = new Map();
function courseOf(id) {
  if (!courses.size) for (const c of buildWorld().courses ?? []) courses.set(c.id, c);
  return courses.get(String(id)) ?? fail(404, 'There is no such course.', 'no_course');
}
const toPhysics = (h) => ({ cup: h.cup, segments: h.segments }); // (the world's own holes: the segments are { a, b, nx, nz }, the same numbers the baked manifest gives the page)

/** Plays a round again: `putts` is one array of [angle, power] (thousandths, whole numbers) for each hole. Returns the card (strokes for each hole) or throws 422. */
export function replay(course, putts) {
  const bad = (why) => fail(422, `That round does not replay (${why}).`, 'not_a_round');
  if (!Array.isArray(putts) || putts.length !== course.holes.length) bad('the wrong number of holes');
  const card = [];
  course.holes.forEach((h, i) => {
    const list = putts[i], phys = toPhysics(h), ball = newBall(h.tee);
    if (!Array.isArray(list) || !list.length || list.length > GOLF.maxStrokes) bad(`hole ${h.n}: the wrong number of putts`);
    for (const p of list) {
      if (!Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || !Number.isInteger(p[1]) || Math.abs(p[0]) > 7000 || p[1] < 50 || p[1] > 1000) bad(`hole ${h.n}: a putt out of range`);
      if (ball.sunk) bad(`hole ${h.n}: a putt after the ball dropped`);
      putt(ball, p[0] / 1000, p[1] / 1000);
      for (let t = 0; ball.moving && t < ROUNDS.maxRollSeconds * 10; t++) stepBall(ball, phys, 0.1);
      if (ball.moving) bad(`hole ${h.n}: a ball that never stops`);
    }
    if (!ball.sunk && ball.strokes < GOLF.maxStrokes) bad(`hole ${h.n}: not finished`);
    card.push(holeScore(ball, h));
  });
  return card;
}

const rankOf = (db, courseId, best) => 1 + Number(db.prepare('SELECT COUNT(*) AS n FROM (SELECT MIN(r.strokes) AS m FROM golf_rounds r JOIN accounts a ON a.id = r.account_id WHERE r.course = ? AND a.banned = 0 GROUP BY r.account_id) WHERE m < ?').get(courseId, best).n);

/** Keeps a finished round: { card, strokes, par, diff, best, rank, record }. */
export function submit(db, account, input, at = Date.now()) {
  requireAccount(account);
  const course = courseOf(input?.course);
  const card = replay(course, input?.putts);
  const strokes = card.reduce((a, b) => a + b, 0), par = course.holes.reduce((a, h) => a + h.par, 0);
  const last = db.prepare('SELECT MAX(at) AS at FROM golf_rounds WHERE account_id = ?').get(account.id).at;
  if (last != null && at - Number(last) < ROUNDS.minGapMs) fail(429, 'That round came too soon after the last one.', 'too_fast');
  const prev = db.prepare('SELECT MIN(strokes) AS s FROM golf_rounds WHERE account_id = ? AND course = ?').get(account.id, course.id).s;
  db.prepare('INSERT INTO golf_rounds (account_id, course, strokes, par, card, at) VALUES (?, ?, ?, ?, ?, ?)').run(account.id, course.id, strokes, par, JSON.stringify(card), at);
  const best = Math.min(strokes, prev == null ? strokes : Number(prev));
  return { card, strokes, par, diff: strokes - par, best, rank: rankOf(db, course.id, best), record: prev == null || strokes < Number(prev) };
}

/** The best round of every account on a course, fewest strokes first (the earlier round wins a tie): { course, par, board: [{ rank, name, strokes, diff, at }] }. */
export function leaderboard(db, courseId, limit = 10) {
  const course = courseOf(courseId), par = course.holes.reduce((a, h) => a + h.par, 0);
  const n = Math.max(1, Math.min(50, Number(limit) || 10));
  const rows = db.prepare(`SELECT a.username AS name, MIN(r.strokes) AS strokes, MIN(r.at) AS at FROM golf_rounds r JOIN accounts a ON a.id = r.account_id
    WHERE r.course = ? AND a.banned = 0 GROUP BY r.account_id ORDER BY strokes, at LIMIT ?`).all(course.id, n);
  return { course: course.id, par, board: rows.map((r, i) => ({ rank: i + 1, name: r.name, strokes: Number(r.strokes), diff: Number(r.strokes) - par, at: Number(r.at) })) };
}

/** The signed-in player's own rounds on a course: their best, their rank, and their last few rounds. */
export function mine(db, account, courseId) {
  requireAccount(account);
  const course = courseOf(courseId);
  const rounds = db.prepare('SELECT strokes, par, at FROM golf_rounds WHERE account_id = ? AND course = ? ORDER BY at DESC LIMIT ?').all(account.id, course.id, ROUNDS.keep).map((r) => ({ strokes: Number(r.strokes), par: Number(r.par), at: Number(r.at) }));
  const best = db.prepare('SELECT MIN(strokes) AS s FROM golf_rounds WHERE account_id = ? AND course = ?').get(account.id, course.id).s;
  return { course: course.id, best: best == null ? null : Number(best), rank: best == null ? null : rankOf(db, course.id, Number(best)), rounds };
}
