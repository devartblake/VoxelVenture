// Lap timing and the leaderboard of the racing track (docs/world/racing_track.md, "Lap timing"). The rule is the game's rule for value: the server decides. A page never sends a time: it says
// "I am at the start line" or "I am at checkpoint 3" with where it is, and the SERVER's clock times the lap between the passes. A pass counts only when
//   - the avatar says it is within RADIUS of that point of the circuit,
//   - it is the next point in order (the start line, then checkpoints 1 to 7, then the start line again),
//   - and it is not further from the last point than a car could have driven in the time between the two passes (lib/world/movement.js SPEED_CAP.car, with the same lag allowance).
// A lap shorter than the circuit could be driven at the car's top speed is refused. Positions are the page's own report, as for the daily stars, so this stops casual forgery and bounds a forger
// (nobody gets a time below what a car can do); the presence tracker (docs/architecture/presence_positions.md) is the next check. Times are rows in race_laps; a run in progress is kept in memory
// (a restart loses it, and the player simply starts again).
import { imp } from '../../scripts/lib-loader.mjs';
import { ApiError, requireAccount } from './core.mjs';

const { buildWorld } = await imp('world/buildWorld.js');
const { LAG_FACTOR, SLACK, SPEED_CAP } = await imp('world/movement.js');

export const RACE = { radius: 16, runExpiresMs: 5 * 60_000, minLapShare: 0.9, keepLaps: 10 }; // minLapShare: a lap may not be quicker than 90% of the circuit at the car's top speed
const fail = (status, message, code) => { throw new ApiError(status, message, code); };
const now = () => Date.now();
const runs = new Map(); // account id -> { track, next, startedAt, lastAt, lastX, lastZ }

// The tracks the server knows, with the points a lap goes through (index 0 the start line, 1 to 7 the checkpoints).
const tracks = new Map();
function trackOf(id) {
  if (!tracks.size) for (const t of buildWorld().tracks) tracks.set(t.id, { id: t.id, name: t.name, length: t.length, points: [{ x: t.start.x, z: t.start.z }, ...t.checkpoints.map((c) => ({ x: c.x, z: c.z }))] });
  return tracks.get(String(id)) ?? fail(404, 'There is no such track.', 'no_track');
}

/** Best lap of every account on a track, quickest first: { track, name, length, board: [{ rank, name, ms, at }] }. */
export function leaderboard(db, trackId, limit = 10) {
  const track = trackOf(trackId);
  const rows = db.prepare(`SELECT a.username AS name, MIN(l.ms) AS ms, (SELECT l2.at FROM race_laps l2 WHERE l2.account_id = l.account_id AND l2.track = l.track ORDER BY l2.ms, l2.at LIMIT 1) AS at
    FROM race_laps l JOIN accounts a ON a.id = l.account_id WHERE l.track = ? AND a.banned = 0 GROUP BY l.account_id ORDER BY ms, at LIMIT ?`).all(track.id, Math.max(1, Math.min(50, Number(limit) || 10)));
  return { track: track.id, name: track.name, length: track.length, board: rows.map((r, i) => ({ rank: i + 1, name: r.name, ms: Number(r.ms), at: Number(r.at) })) };
}

const rankOf = (db, trackId, best) => 1 + Number(db.prepare('SELECT COUNT(*) AS n FROM (SELECT MIN(ms) AS m FROM race_laps WHERE track = ? GROUP BY account_id) WHERE m < ?').get(trackId, best).n);

/** The signed-in player's own laps on a track: their best, their rank, and their last few laps. */
export function mine(db, account, trackId) {
  requireAccount(account);
  const track = trackOf(trackId);
  const laps = db.prepare('SELECT ms, at FROM race_laps WHERE account_id = ? AND track = ? ORDER BY at DESC LIMIT ?').all(account.id, track.id, RACE.keepLaps).map((r) => ({ ms: Number(r.ms), at: Number(r.at) }));
  const best = db.prepare('SELECT MIN(ms) AS ms FROM race_laps WHERE account_id = ? AND track = ?').get(account.id, track.id).ms;
  return { track: track.id, best: best == null ? null : Number(best), rank: best == null ? null : rankOf(db, track.id, Number(best)), laps, running: runs.has(account.id) && runs.get(account.id).track === track.id };
}

/**
 * A pass: the avatar is at point `index` of the circuit (0 the start line, 1 to 7 the checkpoints) at (x, z). Returns what happened: { event: 'start' | 'checkpoint' | 'lap' | 'ignored', ... }.
 * A lap carries `ms` (the server's own timing), `best` (the account's best after it), `rank` and `record` (true when it is a new personal best).
 */
export function pass(db, account, input, at = now()) {
  requireAccount(account);
  const track = trackOf(input?.track);
  const index = Number(input?.index);
  const x = Number(input?.x), z = Number(input?.z);
  if (!Number.isInteger(index) || index < 0 || index >= track.points.length) fail(400, 'That is not a point of this track.', 'bad_point');
  if (!Number.isFinite(x) || !Number.isFinite(z)) fail(400, 'Say where you are.', 'no_position');
  const p = track.points[index];
  if (Math.hypot(x - p.x, z - p.z) > RACE.radius) fail(409, 'You are not close enough to that point.', 'too_far');
  const run = runs.get(account.id);
  const stale = !run || run.track !== track.id || at - run.lastAt > RACE.runExpiresMs;
  if (index === 0 && (stale || run.next !== track.points.length)) {
    runs.set(account.id, { track: track.id, next: 1, startedAt: at, lastAt: at, lastX: x, lastZ: z });
    return { event: 'start', index, next: 1 };
  }
  if (stale) return { event: 'ignored', reason: 'not_started', index };
  const expected = run.next % track.points.length; // after the last checkpoint comes the start line (index 0)
  if (index !== expected) return { event: 'ignored', reason: 'out_of_order', index, next: expected };
  // not further than a car could drive in the time since the last pass
  const seconds = Math.max(0.5, (at - run.lastAt) / 1000);
  const reach = SPEED_CAP.car * LAG_FACTOR * seconds + SLACK + RACE.radius * 2;
  if (Math.hypot(x - run.lastX, z - run.lastZ) > reach) { runs.delete(account.id); fail(409, 'That is further than you could have driven.', 'too_fast'); }
  if (index !== 0) { Object.assign(run, { next: run.next + 1, lastAt: at, lastX: x, lastZ: z }); return { event: 'checkpoint', index, next: run.next, ms: at - run.startedAt }; }
  // the start line again: a lap
  const ms = at - run.startedAt;
  if (ms < (track.length / SPEED_CAP.car) * 1000 * RACE.minLapShare) { runs.delete(account.id); fail(409, 'That lap is quicker than a car can drive it.', 'too_fast'); }
  const before = db.prepare('SELECT MIN(ms) AS ms FROM race_laps WHERE account_id = ? AND track = ?').get(account.id, track.id).ms;
  db.prepare('INSERT INTO race_laps (account_id, track, ms, at) VALUES (?,?,?,?)').run(account.id, track.id, Math.round(ms), at);
  runs.set(account.id, { track: track.id, next: 1, startedAt: at, lastAt: at, lastX: x, lastZ: z }); // the next lap starts as this one ends
  const best = Math.min(Math.round(ms), before == null ? Infinity : Number(before));
  return { event: 'lap', index, ms: Math.round(ms), best, rank: rankOf(db, track.id, best), record: before == null || Math.round(ms) < Number(before) };
}

/** For the tests: forgets the runs in progress. */
export const resetRuns = () => runs.clear();
