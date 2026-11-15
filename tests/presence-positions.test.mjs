// Presence-verified positions, end to end (services/multiplayer/positions.mjs, services/api/presence.mjs; docs/architecture/presence_positions.md): a REAL presence server and a REAL API, accounts
// signed in over a real WebSocket. A player who walks to Voxel Park is seen there by the presence server, the "reach the park" task becomes collectable and pays once; a client that teleports
// is not credited; a client that does impossible things over and over is flagged and its rewards are held; in the default (soft) mode what other players see is unchanged, and with
// PRESENCE_ENFORCE=1 a teleport does not move the avatar for them.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createApi } from '../services/api/server.mjs';
import { imp, root, sleep } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const SEED = 20260101;
const SECRET = 'mp-secret';
const SITE = 'https://site.test';
const free = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const { generateTown } = await imp('city/townExtension.js');
const { buildPlaceGeometry } = await imp('world/placeGeometry.js');
const geo = buildPlaceGeometry(generateTown(SEED));
const park = geo.placeOf('park', 'park');
const pc = { x: (park.rect.x0 + park.rect.x1) / 2, z: (park.rect.z0 + park.rect.z1) / 2 };

// the API in this process, with a small catalogue (one task per slot) so what is offered is certain
const T = (id, cadence, tier, goal) => ({ id, cadence, category: 'TST', family: 'test', title: `Test ${id}`, text: id, tier, gold: { daily: { easy: 5, medium: 10, hard: 20 }, weekly: { easy: 30, medium: 60, hard: 120 } }[cadence][tier], goal, signal: 'needs-position', requires: [], seedBound: false });
const catalogue = { version: 1, seed: SEED, tasks: [T('D-TST-reachpk1', 'daily', 'easy', { type: 'reach', place: 'park', id: 'park' }), T('D-TST-distance', 'daily', 'medium', { type: 'distance', mode: 'walk', metres: 100000 }), T('D-TST-stars001', 'daily', 'hard', { type: 'stars', count: 3 })] };
const apiPort = await free();
const presencePort = await free();
const enforcePort = await free();
const api = createApi({ dbFile: ':memory:', seed: SEED, taskCatalogue: catalogue, deliverEveryMs: 0, origin: SITE, rate: { perMinute: 100000, authPerMinute: 100000 }, env: { ADMIN_TOKEN: 'admin-machine-token', IP_SALT: 'salt', TRUST_PROXY: '1', MP_NOTIFY_SECRET: SECRET } });
await new Promise((r) => api.server.listen(apiPort, r));
const db = api.db;
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-pos-'));
const startPresence = (port, extra = {}) => spawn(process.execPath, [path.join(root, 'services', 'multiplayer', 'server.mjs')], {
  cwd: root,
  env: { ...process.env, MP_PORT: String(port), MP_LOG_DIR: logDir, MP_API_URL: `http://localhost:${apiPort}`, MP_NOTIFY_SECRET: SECRET, MP_RECHECK_MS: '600000', PRESENCE_REWARD_SEED: String(SEED), PRESENCE_FLUSH_MS: '1000', PRESENCE_SUMMARY_MS: '2000', IP_SALT: 'salt', ...extra },
  stdio: 'ignore',
});
const presence = startPresence(presencePort);
const enforcing = startPresence(enforcePort, { PRESENCE_ENFORCE: '1' });
process.on('exit', () => { presence.kill(); enforcing.kill(); });
await sleep(2500);

const base = `http://localhost:${apiPort}`;
const call = async (method, p, { body, token } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', Origin: SITE, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data };
};
const signup = async (username) => (await call('POST', '/auth/signup', { body: { username, password: 'longenough1' } })).data;
const status = async (port) => (await fetch(`http://localhost:${port}/status`)).json();

// a game connection: says hello at (x, z), signs in with a ticket, and sends positions
const connect = (port, name, x, z, who = null) => new Promise((resolve) => {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const c = { ws, inbox: [], x, z, send: (m) => ws.send(JSON.stringify(m)) };
  c.wait = async (pred, ms = 4000) => { for (let t = 0; t < ms; t += 50) { const hit = c.inbox.find(pred); if (hit) return hit; await sleep(50); } return null; };
  ws.on('message', (raw) => c.inbox.push(JSON.parse(raw.toString())));
  c.state = (px, pz, moving = true) => { c.x = px; c.z = pz; c.send({ type: 'state', x: px, z: pz, yaw: 0, moving }); };
  ws.on('open', async () => {
    c.send({ type: 'hello', v: 2, name, room: String(SEED), x, z, appearance: {}, device: { ua: 'test', screen: '1x1', touch: false, url: '' } });
    if (who) {
      const { ticket } = (await call('POST', '/messaging/ticket', { token: who.token })).data;
      c.send({ type: 'auth', ticket });
      await c.wait((m) => m.type === 'auth.ok');
    }
    setTimeout(() => resolve(c), 150);
  });
});
// walks from where the connection is to (tx, tz) at `speed` units a second, a position every 100 ms
async function walkTo(c, tx, tz, speed = 4) {
  const len = Math.hypot(tx - c.x, tz - c.z);
  const steps = Math.max(1, Math.round(len / (speed * 0.1)));
  const sx = (tx - c.x) / steps, sz = (tz - c.z) / steps;
  for (let i = 0; i < steps; i++) { c.state(c.x + sx, c.z + sz); await sleep(100); }
}
const waitFor = async (fn, ms = 20000) => { for (let t = 0; t < ms; t += 250) { if (await fn()) return true; await sleep(250); } return false; };
const goldOf = (id) => db.prepare('SELECT game_gold FROM accounts WHERE id = ?').get(id).game_gold;
const eventsOf = (id, ref) => db.prepare('SELECT COUNT(*) AS n FROM presence_events WHERE account_id = ? AND ref = ?').get(id, ref).n;

const ana = await signup('Ana');
const ben = await signup('Ben');
const cy = await signup('Cyrus');
const observer = await connect(presencePort, 'Watcher', 0, 0);
const s0 = await status(presencePort);
check('the presence server is tracking accounts in the reward city (and says so in /status)', s0.positions?.enabled === true && s0.positions.rewardRoom === String(SEED) && s0.positions.enforce === false, JSON.stringify({ ready: s0.positions?.ready }));
await waitFor(async () => (await status(presencePort)).positions.ready, 8000);
check('the city\'s geometry is built (after start-up, not blocking it)', (await status(presencePort)).positions.ready === true);

// ---- Ana walks to the park, and the task becomes collectable
const A = await connect(presencePort, 'Ana', pc.x - 70, pc.z, ana);
await walkTo(A, pc.x, pc.z, 4); // 70 units at 4 a second: 17 seconds, longer than the ten of settling
for (let i = 0; i < 25; i++) { A.state(pc.x, pc.z, false); await sleep(200); } // and stands there a few seconds
check('Ana\'s walk to the park was accepted as plausible (nothing refused)', (await status(presencePort)).positions.violations.teleport === 0 && (await status(presencePort)).positions.violations.too_fast === 0 && (await status(presencePort)).positions.violations.out_of_bounds === 0);
const arrived = await waitFor(() => eventsOf(ana.account.id, 'place:park:park') > 0, 15000);
check('the presence server saw her in Voxel Park, and told the API (an event on the API\'s side)', arrived);
check('and in the park\'s sound zone and a district (derived events, not a track)', eventsOf(ana.account.id, 'zone:park') > 0 && db.prepare("SELECT COUNT(*) AS n FROM presence_events WHERE account_id = ? AND ref LIKE 'district:%'").get(ana.account.id).n > 0);
check('no raw positions are kept: every row is a derived event (kind in, pass, loop, distance)', db.prepare("SELECT COUNT(*) AS n FROM presence_events WHERE kind NOT IN ('in', 'pass', 'loop', 'distance')").get().n === 0 && !db.prepare("SELECT sql FROM sqlite_master WHERE name = 'presence_events'").get().sql.match(/\b(x|z|lat|lng|position)\b/i));
const g0 = goldOf(ana.account.id);
const paid = await call('POST', '/tasks/D-TST-reachpk1/claim', { token: ana.token });
check('the "reach the park" task is collectable and pays the tier\'s Gold', paid.status === 200 && paid.data.paid === 5 && goldOf(ana.account.id) === g0 + 5, JSON.stringify(paid.data).slice(0, 100));
check('and only once', (await call('POST', '/tasks/D-TST-reachpk1/claim', { token: ana.token })).status === 409);

// ---- Ben teleports: nothing is credited
const B = await connect(presencePort, 'Ben', geo.land.x0 + 20, 0, ben);
for (let i = 0; i < 20; i++) { B.state(geo.land.x0 + 20 + i * 0.2, 0); await sleep(100); }
await sleep(10000 - 2000 + 500); // the ten seconds of settling
for (let i = 0; i < 5; i++) { B.state(pc.x, pc.z); await sleep(100); } // and jumps 180 units to the park in an instant (a few messages: three is a flag, twelve a review)
await sleep(3000);
const s1 = await status(presencePort);
check('the jump was too far for the time to the presence server (counted), and Ben was not credited for the park', s1.positions.violations.teleport + s1.positions.violations.too_fast > 0 && eventsOf(ben.account.id, 'place:park:park') === 0);
check('so his task is not done (409), and nothing is paid', (await call('POST', '/tasks/D-TST-reachpk1/claim', { token: ben.token })).data.code === 'not_done' && goldOf(ben.account.id) === 0);

// ---- Cyrus walks to the park, then does impossible things over and over: flagged, rewards held
const C = await connect(presencePort, 'Cyrus', pc.x - 60, pc.z, cy);
await walkTo(C, pc.x, pc.z, 4);
for (let i = 0; i < 20; i++) { C.state(pc.x, pc.z, false); await sleep(200); }
await waitFor(() => eventsOf(cy.account.id, 'place:park:park') > 0, 15000);
for (let i = 0; i < 16; i++) { C.state(i % 2 ? pc.x + 150 : pc.x - 150, pc.z + (i % 2 ? 100 : -100)); await sleep(100); } // sixteen impossible jumps in under two seconds
const flagged = await waitFor(() => Boolean(db.prepare('SELECT 1 FROM presence_flags WHERE account_id = ?').get(cy.account.id)), 15000);
check('sixteen impossible moves in two seconds is flagged: the presence server told the API', flagged);
const flag = db.prepare('SELECT score, flags FROM presence_flags WHERE account_id = ?').get(cy.account.id);
check('the flag names what it saw (teleports) and is at or over the review score', flag && flag.score >= 60 && JSON.parse(flag.flags).some((f) => f.name === 'teleports'), JSON.stringify(flag));
const held = await call('POST', '/tasks/D-TST-reachpk1/claim', { token: cy.token });
check('Cyrus had reached the park, but the reward is held: "under review", nothing paid', held.status === 409 && held.data.code === 'under_review' && goldOf(cy.account.id) === 0, JSON.stringify(held.data));
const adminView = await call('GET', '/admin/presence/flags', { token: 'admin-machine-token' });
check('the admin sees Cy\'s flag with its signals, and Ana (a person) is not flagged', adminView.data.flags.some((f) => f.accountId === cy.account.id && f.held) && !adminView.data.flags.some((f) => f.accountId === ana.account.id));
const cleared = await call('POST', `/admin/presence/flags/${cy.account.id}/clear`, { token: 'admin-machine-token' });
const afterClear = await call('POST', '/tasks/D-TST-reachpk1/claim', { token: cy.token });
check('the admin clears it, and the task, which stayed his, is collected', cleared.status === 200 && afterClear.status === 200 && afterClear.data.paid === 5 && goldOf(cy.account.id) === 5, JSON.stringify(afterClear.data).slice(0, 100));

// ---- guests are never credited, and a connection in another city does not feed rewards
const guest = await connect(presencePort, 'Guest', pc.x - 60, pc.z);
await walkTo(guest, pc.x, pc.z, 4);
await sleep(2500);
check('a guest has no account: nothing is recorded for anyone', db.prepare("SELECT COUNT(*) AS n FROM presence_events WHERE account_id NOT IN (?, ?, ?)").get(ana.account.id, ben.account.id, cy.account.id).n === 0);

// ---- enforce mode: a teleport does not move the avatar for the others
const wEnf = await connect(enforcePort, 'Watcher2', pc.x, pc.z);
const E = await connect(enforcePort, 'Eve', geo.land.x0 + 20, 0, await signup('Eve'));
for (let i = 0; i < 15; i++) { E.state(geo.land.x0 + 20 + i * 0.2, 0); await sleep(100); }
const eveStart = { x: E.x, z: E.z };
E.state(geo.land.x0 + 150, 120);
await sleep(600);
const eStatus = await status(enforcePort);
const eve = eStatus.players.find((p) => p.name === 'Eve');
check('with PRESENCE_ENFORCE=1 the relayed position of a teleporting client goes back to the last verified one', eStatus.positions.enforce === true && eve && Math.hypot(eve.x - eveStart.x, eve.z - eveStart.z) < 5, JSON.stringify({ x: eve?.x, z: eve?.z }));
const sStatus = await status(presencePort);
const ben2 = sStatus.players.find((p) => p.name === 'Ben');
check('and in the default mode it does not: Ben is listed where he said he was', ben2 && Math.hypot(ben2.x - pc.x, ben2.z - pc.z) < 5, JSON.stringify({ x: ben2?.x, z: ben2?.z }));
void wEnf;

for (const c of [observer, A, B, C, guest, E, wEnf]) c.ws.close();
presence.kill();
enforcing.kill();
api.server.close();
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
