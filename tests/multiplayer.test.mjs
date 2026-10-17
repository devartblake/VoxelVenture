import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { root, sleep } from './helpers.mjs';

const PORT = 3991 + Math.floor(Math.random() * 500);
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-mp-log-')); // the test must not write into the real error log
const server = spawn('node', ['server/multiplayer.mjs'], { cwd: root, env: { ...process.env, MP_PORT: String(PORT), MP_LOG_DIR: logDir, MP_LOG_MAX_BYTES: '1500', MP_MAX_PER_IP: '12', MP_MAX_VISIBLE: '5' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverOut = '';
server.stdout.on('data', (d) => (serverOut += d));
server.stderr.on('data', (d) => (serverOut += d));
await sleep(1200);

let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) fails++;
  console.log(ok ? 'ok  ' : 'FAIL', name, extra);
};

const connect = (name, room, x) =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    const c = { ws, inbox: [], id: null };
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      c.inbox.push(m);
      if (m.type === 'welcome') c.id = m.id;
    });
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'hello', name, room, x, z: 0, appearance: { shirt: 'shirt-red', pants: 'pants-navy', hat: 'hat-cap' }, device: { ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/126', screen: '390x844@3', touch: true, url: '/' } }));
      setTimeout(() => resolve(c), 150);
    });
  });
const last = (c, type) => [...c.inbox].reverse().find((m) => m.type === type);
// protocol 2: who a client has been told about (enter), and the newest figures it has for one player (an enter or a changed entry)
const entered = (c) => c.inbox.filter((m) => m.type === 'snapshot').flatMap((m) => m.enter ?? []);
const exited = (c) => c.inbox.filter((m) => m.type === 'snapshot').flatMap((m) => m.exit ?? []);
// a changed player is a short array: [id, x, z, yaw, moving, emote or 0, vehicle ([kind, boatKind, colour]) or 0]
const decode = (a) => ({ id: a[0], x: a[1], z: a[2], yaw: a[3], moving: Boolean(a[4]), emote: a[5] || null, veh: a[6] ? { kind: a[6][0], boatKind: a[6][1], color: a[6][2] } : null });
const latest = (c, id) => {
  for (const m of [...c.inbox].reverse()) {
    if (m.type !== 'snapshot') continue;
    const hit = (m.players ?? []).find((q) => q[0] === id);
    if (hit) return decode(hit);
    const full = (m.enter ?? []).find((q) => q.id === id);
    if (full) return full;
  }
  return undefined;
};
const snapshots = (c) => c.inbox.filter((m) => m.type === 'snapshot');

const a = await connect('Alice', '2026', 1);
const b = await connect('Bob', '2026', 5);
const other = await connect('Carol', '999', 9); // a different city

check('welcome gives each client an id', a.id && b.id && a.id !== b.id);
await sleep(350);
check('Bob is told about Alice coming into view', entered(b).some((p) => p.name === 'Alice' && p.appearance.hat === 'hat-cap'));
check('Alice is told Bob came into view', entered(a).some((p) => p.name === 'Bob'));
check('welcome says how many are in the city, and carries no player list', last(b, 'welcome').online === 2 && last(b, 'welcome').players === undefined);
check('a different city sees nobody', last(other, 'welcome').online === 1 && entered(other).length === 0);

a.ws.send(JSON.stringify({ type: 'state', x: 12.5, z: -3, yaw: 1.5, moving: true, emote: 'wave' }));
await sleep(350);
const seenA = latest(b, a.id);
check('Bob sees Alice move', seenA && seenA.x === 12.5 && seenA.z === -3 && seenA.moving && seenA.emote === 'wave', JSON.stringify(seenA));
a.ws.send(JSON.stringify({ type: 'state', x: 13, z: -3, yaw: 1.5, moving: true, emote: null, veh: { kind: 'car', color: '#ff0000', boatKind: 'x' } }));
await sleep(350);
const inCar = latest(b, a.id);
check('Bob sees that Alice is in a red car', inCar?.veh?.kind === 'car' && inCar.veh.color === '#ff0000', JSON.stringify(inCar?.veh));
a.ws.send(JSON.stringify({ type: 'state', x: 14, z: -3, yaw: 1.5, moving: true, emote: null, veh: { kind: 'rocket', color: '<script>' } }));
await sleep(350);
check('an unknown vehicle is ignored', latest(b, a.id)?.veh == null);
a.ws.send(JSON.stringify({ type: 'state', x: 14, z: -3, yaw: 1.5, moving: true, emote: null, veh: { kind: 'boat', boatKind: 'sailboat', color: 'javascript:1' } }));
await sleep(350);
const inBoat = latest(b, a.id)?.veh;
check('a boat is kept, a bad colour is replaced', inBoat?.kind === 'boat' && inBoat.boatKind === 'sailboat' && /^#[0-9a-f]{6}$/i.test(inBoat.color), JSON.stringify(inBoat));
a.ws.send(JSON.stringify({ type: 'parked', cars: [{ x: 20, z: 5, yaw: 1, color: '#00ff00' }, { x: 'bad', z: 1, color: 'x' }, { x: 1, z: 1 }, { x: 2, z: 2 }, { x: 3, z: 3 }] }));
await sleep(300);
const parkedMsg = last(b, 'parked');
check('Bob is told which cars Alice left parked (at most three, cleaned)', parkedMsg?.id === a.id && parkedMsg.cars.length === 3 && parkedMsg.cars[0].color === '#00ff00' && parkedMsg.cars.every((c) => Number.isFinite(c.x) && /^#[0-9a-f]{6}$/i.test(c.color)), JSON.stringify(parkedMsg));
const lateJoiner = await connect('Erin', '2026', 5);
await sleep(300);
check('someone who comes into view later is told about the parked cars too', entered(lateJoiner).find((p) => p.id === a.id)?.parked?.length === 3);
lateJoiner.ws.close();
check('Carol (other city) gets no snapshots about them', !other.inbox.some((m) => m.type === 'snapshot'));

// crowds: a far-away player is not sent, and an unchanged scene sends nothing at all
const far = await connect('Dave', '2026', 900);
await sleep(300);
const before = snapshots(b).length;
await sleep(2200);
const received = snapshots(b).slice(before);
check('a player beyond the view radius is never sent to Bob', !entered(b).some((p) => p.id === far.id) && !snapshots(b).some((m) => (m.players ?? []).some((p) => p[0] === far.id)));
check('nothing is sent to Bob while nobody moves', received.length === 0, `${received.length} snapshots in 2.2 s`);
check('the city count reaches everyone, and includes the far player', last(b, 'online')?.n === 3, JSON.stringify(last(b, 'online')));
check('the world-map dots list the far player (who is not in Bob\'s view)', (last(b, 'online')?.dots ?? []).some((d) => d[0] === far.id && d[1] >= 899), JSON.stringify(last(b, 'online')?.dots));
// moving across the radius: in view, then out of it (with the extra margin), then in again
far.ws.send(JSON.stringify({ type: 'state', x: 100, z: 0, yaw: 0, moving: false }));
await sleep(350);
check('a player who walks into range enters Bob\'s view', entered(b).some((p) => p.id === far.id));
far.ws.send(JSON.stringify({ type: 'state', x: 600, z: 0, yaw: 0, moving: false }));
await sleep(350);
check('...and leaves it when they walk away', exited(b).includes(far.id));
far.ws.close();
await sleep(300);

// a crowd: each client is told about the nearest few only (the limit is 5 here)
const crowd = [];
for (let i = 0; i < 9; i++) crowd.push(await connect(`Crowd${i}`, 'crowd', 10 + i * 2));
await sleep(500);
const watcher = crowd[0];
const sees = new Set(entered(watcher).map((p) => p.id));
check('a client is told about at most MAX_VISIBLE players', sees.size === 5, `${sees.size} players in view of 8 others`);
const nearest = crowd.slice(1, 6).map((q) => q.id);
check('...the nearest ones', nearest.every((id) => sees.has(id)), [...sees].join());
const countMsg = last(watcher, 'online');
check('the city count still says everyone, not just who is in view', countMsg?.n === 9, JSON.stringify(countMsg));
for (const q of crowd) q.ws.close();
await sleep(300);

// hostile input
a.ws.send(JSON.stringify({ type: 'state', x: 'abc', z: Infinity, yaw: {}, moving: 1, emote: 'x'.repeat(500) }));
a.ws.send('not json');
a.ws.send(JSON.stringify({ type: 'profile', name: 'x'.repeat(200) + '\u0000\u0007', appearance: { hat: 7 } }));
await sleep(300);
const snap2 = latest(b, a.id);
check('bad numbers are replaced, emote is truncated', snap2.x === 0 && snap2.emote.length <= 12, JSON.stringify(snap2));
const prof = last(b, 'profile');
check('names are sanitised and truncated', prof && prof.player.name.length <= 20 && !/\p{Cc}/u.test(prof.player.name));

// diagnostics
b.ws.send(JSON.stringify({ type: 'perf', fps: 58.26 }));
b.ws.send(JSON.stringify({ type: 'error', kind: 'error', message: 'TypeError: boom', source: 'a.js:1:2', stack: 'TypeError: boom\n at x', url: '/' }));
b.ws.send(JSON.stringify({ type: 'error', kind: 'console.error', message: 'Warning: key', count: 5 }));
await sleep(300);
const status = await (await fetch(`http://localhost:${PORT}/status`)).json();
const bobStatus = status.players.find((p) => p.name === 'Bob');
check('status lists all three clients with their devices', status.players.length === 3 && bobStatus.device.touch === true && bobStatus.device.screen === '390x844@3' && bobStatus.net, JSON.stringify(bobStatus.device));
// network addresses are kept only scrambled, the same way as the API (docs/monetization/policy_review.md, gap 1)
const localNet = crypto.createHash('sha256').update(`${process.env.IP_SALT || 'voxelventure'}|127.0.0.1`).digest('hex').slice(0, 16);
check('status shows the scrambled network, never the address', bobStatus.net === localNet && !('ip' in bobStatus) && !/127\.0\.0\.1|::1\b/.test(JSON.stringify(status)), bobStatus.net);
check('frame rate is recorded', bobStatus.fps === 58.3, String(bobStatus.fps));
check('errors are recorded per client with counts', bobStatus.errorCount === 6 && bobStatus.errors.length === 2, String(bobStatus.errorCount));
check('recent errors name the client', status.recentErrors.some((e) => e.name === 'Bob' && e.message === 'TypeError: boom' && e.stack.includes('at x')));

// leaving
a.ws.close();
await sleep(300);
check('Bob is told when Alice leaves (exit)', exited(b).includes(a.id));
const status2 = await (await fetch(`http://localhost:${PORT}/status`)).json();
check('status drops the client who left', status2.players.length === 2);

// moving to another city
b.ws.send(JSON.stringify({ type: 'hello', name: 'Bob', room: '999', x: 0, z: 0, appearance: {}, device: {} }));
await sleep(300);
check('Carol sees Bob arrive in her city', entered(other).some((p) => p.name === 'Bob'));
check('/status reports how hard the server is working', status2.load && status2.load.clients === 2 && status2.load.tickMsAvg >= 0 && status2.load.tickBudgetMs === 100 && status2.load.rssMB > 10, JSON.stringify(status2.load));


// the error log is on disk and rotates instead of growing for ever
for (let i = 0; i < 12; i++) b.ws.send(JSON.stringify({ type: 'error', kind: 'error', message: `filler error number ${i} ` + 'x'.repeat(200), url: '/' }));
await sleep(500);
const logFiles = fs.readdirSync(logDir).sort();
check('the error log rotates past its size limit', logFiles.includes('client-errors.jsonl') && logFiles.includes('client-errors.jsonl.1'), logFiles.join(', '));
check('the live log stays under the limit', fs.statSync(path.join(logDir, 'client-errors.jsonl')).size <= 1500);
const logText = logFiles.map((f) => fs.readFileSync(path.join(logDir, f), 'utf8')).join('');
check('the error log has the scrambled network, not the address', logText.includes(`"net":"${localNet}"`) && !/127\.0\.0\.1|::1\b|"ip"/.test(logText));
check('nor does the console', serverOut.includes(localNet) && !/127\.0\.0\.1|::ffff/.test(serverOut));

// health and protocol
const health = await (await fetch(`http://localhost:${PORT}/health`)).json();
check('/health reports ok with the protocol version', health.ok === true && health.protocol === 2, JSON.stringify(health));
check('welcome carries the protocol version', last(other, 'welcome').protocol === 2);

// one address cannot hold unlimited connections (the limit is 12 here; Bob and Carol are still open, so 10 more fit)
const extras = [];
for (let i = 0; i < 12; i++) extras.push(await connect(`Extra${i}`, 'limits', 0));
await sleep(300);
const stillOpen = extras.filter((e) => e.ws.readyState === 1).length;
check('connections per address are limited', stillOpen === 10, `${stillOpen} of 12 extra connections stayed open (10 expected)`);
for (const e of extras) e.ws.close();

console.log('\n--- server terminal output ---\n' + serverOut.replace(new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g'), ''));
server.kill();
fs.rmSync(logDir, { recursive: true, force: true });
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
