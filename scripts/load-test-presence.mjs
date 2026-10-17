// A load test for the presence server: many pretend players walk about a city and the script reports what the server and the clients went through.
//
//   node scripts/load-test-presence.mjs [--clients 500] [--seconds 30] [--rooms 1] [--crowd 0.6] [--url ws://host:3001]
//
//   --clients  how many pretend players (default 500)
//   --seconds  how long to run once everyone is in (default 30)
//   --rooms    how many cities they are spread over (default 1)
//   --crowd    the share of players who gather in a few busy places (default 0.6; the rest wander the whole city)
//   --url      test a server that is already running (otherwise one is started here on a free port)
//
// The pretend players move at walking speed (3 units a second) in a 330 x 360 city and send their position ten times a second while moving, a
// chat line now and then. At the end: how many stayed connected, what each received (messages and bytes a second), who each could see, and the
// server's own figures (/status load: time per tick against the 100 ms budget, processor use, memory).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const CLIENTS = Number(args.clients ?? 500);
const SECONDS = Number(args.seconds ?? 30);
const ROOMS = Number(args.rooms ?? 1);
const CROWD = Number(args.crowd ?? 0.6);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 330;
const H = 360;
const HOT = [[-60, -40], [80, 30], [10, 120], [-100, 90]]; // the busy places

let child = null;
let url = args.url;
let logDir = null;
if (!url) {
  const port = await new Promise((res) => {
    const s = net.createServer();
    s.listen(0, () => {
      const { port: p } = s.address();
      s.close(() => res(p));
    });
  });
  logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-load-'));
  child = spawn(process.execPath, ['services/multiplayer/server.mjs'], { cwd: root, env: { ...process.env, MP_PORT: String(port), MP_LOG_DIR: logDir, MP_MAX_CLIENTS: String(CLIENTS + 50), MP_MAX_PER_IP: String(CLIENTS + 50) }, stdio: 'ignore' });
  url = `ws://127.0.0.1:${port}`;
  await sleep(1500);
}
const httpUrl = url.replace(/^ws/, 'http');

const rnd = (a, b) => a + Math.random() * (b - a);
const bots = [];
let connectFailures = 0;
let closedEarly = 0;
const t0 = Date.now();

function makeBot(i) {
  const hot = Math.random() < CROWD ? HOT[i % HOT.length] : null;
  const bot = {
    i,
    room: String(2026 + (i % ROOMS)),
    x: hot ? hot[0] + rnd(-25, 25) : rnd(-W / 2, W / 2),
    z: hot ? hot[1] + rnd(-25, 25) : rnd(-H / 2, H / 2),
    heading: rnd(0, Math.PI * 2),
    msgs: 0,
    bytes: 0,
    seen: new Set(),
    maxSeen: 0,
    enters: 0,
    exits: 0,
    open: false,
    hot,
  };
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    bot.ws = ws;
    ws.on('open', () => {
      bot.open = true;
      ws.send(JSON.stringify({ type: 'hello', v: 2, name: `Bot${i}`, room: bot.room, x: bot.x, z: bot.z, appearance: { shirt: 'shirt-red' }, device: { ua: 'load-test', screen: '800x600@1', touch: false, url: '/' } }));
      resolve(bot);
    });
    ws.on('message', (raw) => {
      const text = raw.toString();
      bot.msgs++;
      bot.bytes += text.length;
      if (text.charCodeAt(9) === 115) {
        // "snapshot": count who is in view
        const m = JSON.parse(text);
        for (const p of m.enter ?? []) {
          bot.seen.add(p.id);
          bot.enters++;
        }
        for (const id of m.exit ?? []) {
          bot.seen.delete(id);
          bot.exits++;
        }
        if (bot.seen.size > bot.maxSeen) bot.maxSeen = bot.seen.size;
      }
    });
    ws.on('error', () => {
      if (!bot.open) {
        connectFailures++;
        resolve(null);
      }
    });
    ws.on('close', () => {
      if (bot.open && !bot.done) closedEarly++;
    });
  });
}

// connect in waves, so the test does not open a thousand sockets in the same millisecond
for (let i = 0; i < CLIENTS; i += 50) {
  const wave = await Promise.all(Array.from({ length: Math.min(50, CLIENTS - i) }, (_, k) => makeBot(i + k)));
  for (const b of wave) if (b) bots.push(b);
  await sleep(100);
}
const connectedIn = Date.now() - t0;
console.log(`${bots.length} of ${CLIENTS} connected in ${(connectedIn / 1000).toFixed(1)} s${connectFailures ? ` (${connectFailures} failed)` : ''}`);

// everyone walks: a bot keeps its heading for a few seconds, then turns; a quarter stand still
let sentStates = 0;
const walker = setInterval(() => {
  for (const b of bots) {
    if (b.ws.readyState !== 1) continue;
    if (b.i % 4 === 0) continue; // standing
    if (Math.random() < 0.02) b.heading += rnd(-1.5, 1.5);
    b.x += Math.sin(b.heading) * 0.3;
    b.z += Math.cos(b.heading) * 0.3;
    if (Math.abs(b.x) > W / 2) b.heading = -b.heading;
    if (Math.abs(b.z) > H / 2) b.heading = Math.PI - b.heading;
    b.ws.send(JSON.stringify({ type: 'state', x: b.x, z: b.z, yaw: b.heading, moving: true }));
    sentStates++;
    if (Math.random() < 0.0004) b.ws.send(JSON.stringify({ type: 'chat', text: 'hello there' }));
  }
}, 100);

await sleep(3000); // let the first sightings settle before measuring
for (const b of bots) {
  b.msgs = 0;
  b.bytes = 0;
}
sentStates = 0;
const loads = [];
const t1 = Date.now();
for (let s = 0; s < SECONDS; s += 5) {
  await sleep(5000);
  try {
    loads.push((await (await fetch(`${httpUrl}/status`)).json()).load);
  } catch {
    /* a busy server may be slow to answer */
  }
}
const secs = (Date.now() - t1) / 1000;
clearInterval(walker);

const per = (f) => bots.map(f).sort((a, b) => a - b);
const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
const msgsPerSec = per((b) => b.msgs / secs);
const bytesPerSec = per((b) => b.bytes / secs);
const seen = per((b) => b.seen.size);
const load = loads.reduce((acc, l) => ({ cpuPct: Math.max(acc.cpuPct, l.cpuPct), tickMsAvg: Math.max(acc.tickMsAvg, l.tickMsAvg), tickMsP95: Math.max(acc.tickMsP95, l.tickMsP95), tickMsMax: Math.max(acc.tickMsMax, l.tickMsMax), loopDelayP99Ms: Math.max(acc.loopDelayP99Ms, l.loopDelayP99Ms), rssMB: Math.max(acc.rssMB, l.rssMB), bytesPerSec: Math.max(acc.bytesPerSec, l.bytesPerSec), messagesPerSec: Math.max(acc.messagesPerSec, l.messagesPerSec), clients: l.clients }), { cpuPct: 0, tickMsAvg: 0, tickMsP95: 0, tickMsMax: 0, loopDelayP99Ms: 0, rssMB: 0, bytesPerSec: 0, messagesPerSec: 0, clients: 0 });

console.log('');
console.log(`pretend players         ${bots.length} in ${ROOMS} ${ROOMS === 1 ? 'city' : 'cities'}, ${Math.round(CROWD * 100)}% in busy places, ${secs.toFixed(0)} s measured`);
console.log(`connections lost        ${closedEarly}`);
console.log(`states sent to server   ${Math.round(sentStates / secs)} a second`);
console.log(`players in view         median ${q(seen, 0.5)}, busiest ${seen[seen.length - 1]} (the server's limit is MP_MAX_VISIBLE, default 40)`);
console.log(`each client receives    median ${q(msgsPerSec, 0.5).toFixed(1)} messages and ${(q(bytesPerSec, 0.5) / 1024).toFixed(1)} KB a second; the busiest 5%: ${q(msgsPerSec, 0.95).toFixed(1)} and ${(q(bytesPerSec, 0.95) / 1024).toFixed(1)} KB`);
console.log(`all clients together    about ${((bytesPerSec.reduce((a, b) => a + b, 0) * 8) / 1e6).toFixed(1)} Mbit/s out of the server = ${((bytesPerSec.reduce((a, b) => a + b, 0) * 86400 * 30) / 1e12).toFixed(2)} TB a month if it stayed this busy`);
console.log(`server tick             average ${load.tickMsAvg} ms, 95th ${load.tickMsP95} ms, worst ${load.tickMsMax} ms (budget 100 ms)`);
console.log(`server processor        up to ${load.cpuPct}% of one core, event-loop delay (99th) ${load.loopDelayP99Ms} ms, memory ${load.rssMB} MB`);
const verdict = closedEarly === 0 && load.tickMsP95 < 50 && load.cpuPct < 85 && load.loopDelayP99Ms < 100;
console.log(`verdict                 ${verdict ? 'comfortable at this size' : 'at or past what one server handles at this size'}`);

for (const b of bots) {
  b.done = true;
  b.ws.close();
}
await sleep(500);
if (child) {
  child.kill();
  if (logDir) fs.rmSync(logDir, { recursive: true, force: true });
}
process.exit(0);
