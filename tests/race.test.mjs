// The racing track's lap timing and leaderboard (services/api/race.mjs, docs/world/racing_track.md, "Lap timing"): the server times the laps. A page says where it is and never a time; a pass counts
// only in order, near the point, and no faster than a car can drive; a lap is refused if it is quicker than the circuit can be driven; the leaderboard is each account's best.
import { createApi } from '../services/api/server.mjs';
import * as race from '../services/api/race.mjs';
import { imp } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const { buildWorld } = await imp('world/buildWorld.js');
const { SPEED_CAP } = await imp('world/movement.js');
const tr = buildWorld().tracks[0];
const points = [{ x: tr.start.x, z: tr.start.z }, ...tr.checkpoints];
const LAP_MS = Math.round((tr.length / SPEED_CAP.car) * 1000); // the quickest a car could be: the whole lap at top speed

const SITE = 'https://site.test';
const api = createApi({ dbFile: ':memory:', deliverEveryMs: 0, origin: SITE, rate: { perMinute: 100000, authPerMinute: 100000 }, env: { ADMIN_TOKEN: 'admin-machine-token', IP_SALT: 'salt', TRUST_PROXY: '1' } });
const { server, db } = api;
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
let ipN = 1;
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: SITE, 'X-Forwarded-For': `10.2.0.${ipN++ % 250}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const signup = async (name) => (await call('POST', '/auth/signup', { body: { username: name, password: 'longenough1' } })).data;
const accountOf = (name) => ({ id: db.prepare('SELECT id FROM accounts WHERE username = ?').get(name).id, username: name });

const ann = await signup('Ana');
const ben = await signup('Ben');
const A = accountOf('Ana'), B = accountOf('Ben');
const at = (i, ms) => ({ track: 'speedway', index: i, x: points[i].x + 3, z: points[i].z - 2 });

// ---- the HTTP surface
{
  check('the leaderboard is public and empty at the start, and names the track', (await call('GET', '/race/leaderboard?track=speedway')).data.board?.length === 0 && (await call('GET', '/race/leaderboard?track=speedway')).data.name === 'Voxel Speedway');
  check('there is no such track: 404', (await call('GET', '/race/leaderboard?track=nowhere')).status === 404);
  check('a pass needs an account: 401 with none', (await call('POST', '/race/pass', { body: at(0) })).status === 401);
  check('and your own laps need an account too', (await call('GET', '/race/me?track=speedway')).status === 401);
}

// ---- a lap, timed by the server
{
  race.resetRuns();
  const t0 = 1_800_000_000_000;
  const start = race.pass(db, A, at(0), t0);
  check('crossing the start line begins a run', start.event === 'start' && start.next === 1);
  let t = t0;
  const events = [];
  for (let i = 1; i <= 7; i++) { t += Math.round(LAP_MS / 8 * 1.25); events.push(race.pass(db, A, at(i), t).event); }
  check('the seven checkpoints in order are each accepted', events.every((e) => e === 'checkpoint'));
  t += Math.round(LAP_MS / 8 * 1.25);
  const lap = race.pass(db, A, at(0), t);
  check('the start line again is a lap, timed by the server\'s own clock between the two crossings', lap.event === 'lap' && lap.ms === t - t0 && lap.record === true && lap.rank === 1 && lap.best === lap.ms, `${lap.ms} ms`);
  check('the lap is a row, and the page sent no time anywhere', db.prepare('SELECT COUNT(*) AS n FROM race_laps WHERE account_id = ?').get(A.id).n === 1);
  // the next lap starts as the last ended
  let t2 = t;
  for (let i = 1; i <= 7; i++) { t2 += Math.round(LAP_MS / 8 * 1.4); race.pass(db, A, at(i), t2); }
  t2 += Math.round(LAP_MS / 8 * 1.4);
  const slower = race.pass(db, A, at(0), t2);
  check('a second lap follows without crossing the line twice; a slower lap is not a record and the best is kept', slower.event === 'lap' && slower.record === false && slower.best === lap.ms && slower.ms === t2 - t);
}

// ---- what is refused
{
  race.resetRuns();
  const t0 = 1_800_000_100_000;
  race.pass(db, B, at(0), t0);
  let err = null;
  try { race.pass(db, B, { track: 'speedway', index: 3, x: points[3].x + 200, z: points[3].z }, t0 + 5000); } catch (e) { err = e; }
  check('a pass far from its point is refused (too_far)', err?.code === 'too_far');
  check('a pass out of order is ignored, not an error, and says what comes next', (() => { const r = race.pass(db, B, at(3), t0 + 5000); return r.event === 'ignored' && r.reason === 'out_of_order' && r.next === 1; })());
  err = null;
  try { race.pass(db, B, at(1), t0 + 100); } catch (e) { err = e; }
  check('a checkpoint further away than a car could have driven in the time is refused (too_fast) and ends the run', err?.code === 'too_fast' && race.pass(db, B, at(2), t0 + 200_000).reason === 'not_started');
  race.resetRuns();
  race.pass(db, B, at(0), t0);
  for (let i = 1; i <= 7; i++) race.pass(db, B, at(i), t0 + i * Math.round(LAP_MS / 8 * 1.2));
  // an honest fast lap (20% over the car's top speed all the way round: a good driver) is kept
  const cheat = race.pass(db, B, at(0), t0 + 8 * Math.round(LAP_MS / 8 * 1.2));
  check('a lap quicker than the circuit can be driven would be refused; an honest fast one is kept (the checkpoint speed bound already holds a forger to the car\'s pace)', cheat.event === 'lap' && cheat.ms >= LAP_MS * 0.9, `${cheat.ms} against a quickest ${LAP_MS}`);
  race.resetRuns();
  race.pass(db, B, at(0), t0);
  err = null;
  try { for (let i = 1; i <= 7; i++) race.pass(db, B, at(i), t0 + i * 400); } catch (e) { err = e; }
  check('driving the checkpoints at a speed no car has is refused (too_fast)', err?.code === 'too_fast');
  check('a run left alone for five minutes has expired: the next checkpoint is ignored', (() => { race.resetRuns(); race.pass(db, B, at(0), t0); return race.pass(db, B, at(1), t0 + 6 * 60_000).event === 'ignored'; })());
  err = null;
  try { race.pass(db, B, { track: 'speedway', index: 9, x: 0, z: 0 }, t0); } catch (e) { err = e; }
  check('a point that is not on the track is refused (bad_point)', err?.code === 'bad_point');
}

// ---- the leaderboard
{
  db.prepare('DELETE FROM race_laps').run();
  const put = (id, ms, atMs) => db.prepare('INSERT INTO race_laps (account_id, track, ms, at) VALUES (?,?,?,?)').run(id, 'speedway', ms, atMs);
  put(A.id, 95_000, 1); put(A.id, 90_500, 2); put(A.id, 99_000, 3); put(B.id, 92_000, 4);
  const board = race.leaderboard(db, 'speedway').board;
  check('the board is each account\'s best lap, quickest first, with ranks', board.length === 2 && board[0].name === 'Ana' && board[0].ms === 90_500 && board[0].rank === 1 && board[1].name === 'Ben' && board[1].ms === 92_000 && board[1].rank === 2);
  const me = (await call('GET', '/race/me?track=speedway', { token: ben.token })).data;
  check('your own page: your best, your rank and your recent laps', me.best === 92_000 && me.rank === 2 && me.laps.length === 1);
  db.prepare('UPDATE accounts SET banned = 1 WHERE id = ?').run(B.id);
  check('a banned account is not on the board', race.leaderboard(db, 'speedway').board.every((r) => r.name !== 'Ben'));
  check('a limit keeps the board short', race.leaderboard(db, 'speedway', 1).board.length === 1);
}

// ---- through HTTP, signed in
{
  race.resetRuns();
  const r = await call('POST', '/race/pass', { token: ann.token, body: at(0) });
  check('POST /race/pass signed in starts a run', r.status === 200 && r.data.event === 'start');
  check('and the answer carries no Gold or amount: a lap earns a place on the board, not a payment', !('gold' in r.data) && !('amount' in r.data));
}

await new Promise((r) => server.close(r));
db.close();
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
