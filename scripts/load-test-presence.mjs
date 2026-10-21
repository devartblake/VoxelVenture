// The presence load test: a city full of pretend players living realistic sessions, with acceptance budgets (docs/architecture/presence_scale.md).
//
//   npm run load:presence -- --full        the certified target: 500 players, 150 of them signed in, 90 s (a few minutes in all)
//   npm run load:presence -- --quick       60 players, 20 signed in, 20 s (tests/presence-load.test.mjs runs this in CI)
//   node scripts/load-test-presence.mjs --mp wss://play.staging.example --api https://api.staging.example --allow-writes [--admin-token …]
//
// With no --mp it starts its own API (an in-memory database) and presence server on free ports, both with TRUST_PROXY=1, and gives every
// pretend player its own network address (X-Forwarded-For), so the per-network limits apply as they would to real players.
//
// What the players do:
//   - visitors (guests) and signed-in players: each signed-in one signs up through the API (a third sign in again afterwards), gets a
//     one-use messaging ticket and hands it over on the socket (`auth`), as the game does;
//   - they stand (a heartbeat every 2 s), walk about a busy place, or drive between the busy places, so players come into and leave each
//     other's view all the time; the signed-in ones talk nearby (a line every 15-40 s);
//   - churn: a share drop their connection (no close handshake, or a clean close) and come back with the game's backoff (1 s, then x1.7),
//     signing in again with a fresh ticket; some had just said a line whose answer they never got, and retry it on the new connection;
//   - slow clients: some stop reading for a while but keep sending (the server must skip them until they drain, not drop them, and not
//     slow anyone else down); some freeze completely (no reading, no sending: the server drops them after 20 s of silence);
//   - abuse, a small share: malformed messages, a movement flood, a chat flood, a spent ticket, a made-up ticket, an expired ticket (when
//     the run is long enough), a sign-in without a ticket, a stale protocol, an oversized message. Each must get its documented answer.
// What it checks: nobody is disconnected unexpectedly; nobody sees the same player twice (a second `enter`, two connections of one account,
// or a connection that has gone); nobody hears a chat line twice, also across a reconnect; every message fits the protocol's contract; and
// the budgets below, against the server's own figures (/status `load`, or GET /admin/presence on the API with --admin-token).
// It exits 1 when a budget is breached, 2 when the run could not be set up.
//
// Options: --clients N  --signed-in N  --seconds N  --rooms N  --crowd 0.6  --json report.json  --verbose
//   --mp URL / --api URL   a running stack (the old --url still works for --mp). A remote run creates accounts, so it needs --allow-writes;
//                          production hosts are refused unless --i-know-this-is-production.
//   --admin-token T        (or LOAD_ADMIN_TOKEN) read the server's figures through the API's GET /admin/presence (staging hides /status)
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { presenceAgent, gameHello, misfits } from '../tests/agents/presence-agent.mjs';

// ---- settings ------------------------------------------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const FLAGS = new Set(['full', 'quick', 'allow-writes', 'i-know-this-is-production', 'verbose']);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2);
  if (FLAGS.has(k)) args[k] = true;
  else args[k] = argv[++i];
}
const PRESETS = {
  quick: { clients: 60, signedIn: 20, seconds: 20 },
  full: { clients: 500, signedIn: 150, seconds: 90 },
};
const mode = args.quick ? 'quick' : 'full';
const preset = PRESETS[mode];
const CLIENTS = Number(args.clients ?? preset.clients);
const SIGNED = Math.min(CLIENTS, Number(args['signed-in'] ?? (args.clients ? Math.round(CLIENTS * 0.3) : preset.signedIn)));
const SECONDS = Number(args.seconds ?? preset.seconds);
const ROOMS = Number(args.rooms ?? 1);
const CROWD = Number(args.crowd ?? 0.6);
const VERBOSE = Boolean(args.verbose);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RUN = crypto.randomBytes(3).toString('hex');
const PASSWORD = `lt-${crypto.randomBytes(12).toString('hex')}`; // the pretend players' password: in memory only, never printed
const W = 330;
const H = 360;
const HOT = [[-60, -40], [80, 30], [10, 120], [-100, 90]]; // the busy places (more than a view radius apart, so travellers leave and enter views)

// The acceptance budgets. The server's own figures (tick, processor, event loop, memory) are for the full run on one machine with the bots
// beside it; a quick run is held to the same correctness and latency budgets.
const BUDGETS = {
  tickP95Ms: 50, // the 95th percentile of the tick, in a typical 10 s window (the median of the windows read during the run)
  tickP95WorstMs: 100, // and in the worst window: never past the 100 ms tick itself
  cpuPct: 85, // of one core
  loopDelayP99Ms: 100,
  rssMB: 512,
  authSuccess: 0.99, // honest sign-ins that succeed
  chatAccepted: 0.99, // honest lines accepted
  chatP95Ms: 500, // a nearby line, from said to heard
  reconnectP95Ms: 3000, // from losing the connection to welcomed (and signed in again)
  snapshotP50PerSec: 8, // what a player in a busy place is sent, the median (10 a second when every tick keeps up); also while slow clients are backed up
  clientKBp95: 28, // what one client is sent a second, the busiest 5% (19-22 KB/s measured at 500 players once online overviews were gathered; 26-29 before)
  unexpectedDisconnects: 0,
  duplicates: 0, // players seen twice, ghosts, lines heard twice
  misfits: 0, // messages that do not fit their contract
};

// ---- where it runs ---------------------------------------------------------------------------------------------------------------------
const say = (...a) => console.log(...a);
const fail = (msg, code = 2) => {
  console.error(`load test: ${msg}`);
  process.exit(code);
};
let MP = args.mp ?? args.url ?? null;
let API = args.api ?? null;
const remote = Boolean(MP || API);
const isLocalHost = (h) => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(h);
const isProductionHost = (h) => /(^|\.)voxelventure\.app$/i.test(h) && !/(^|\.)staging\./i.test(h);
if (remote) {
  for (const u of [MP, API].filter(Boolean)) {
    let host;
    try {
      host = new URL(u).hostname;
    } catch {
      fail(`not a URL: ${u}`);
    }
    if (isProductionHost(host) && !args['i-know-this-is-production']) fail(`${host} is production. The load test creates accounts and floods the server: run it against staging. (--i-know-this-is-production overrides this.)`);
    if (!isLocalHost(host) && !args['allow-writes']) fail(`a run against ${host} creates accounts there and loads the server: add --allow-writes to allow it`);
  }
  if (SIGNED > 0 && !API) fail('signed-in players need the API (--api), or run with --signed-in 0');
}
const ADMIN_TOKEN = args['admin-token'] ?? process.env.LOAD_ADMIN_TOKEN ?? null;

const children = [];
const logs = [];
let stopping = false;
let tmp = null;
const free = () => new Promise((res, rej) => { const s = net.createServer(); s.on('error', rej); s.listen(0, () => { const { port } = s.address(); s.close(() => res(port)); }); });
async function waitUp(url, seconds = 60) {
  for (let i = 0; i < seconds * 4; i++) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* starting */
    }
    await sleep(250);
  }
  return false;
}
async function stopStack() {
  for (const c of children) c.kill();
  await sleep(500); // the servers let go of their files
  if (tmp) {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* the system cleans its temporary folder */
    }
  }
}
process.on('exit', () => {
  for (const c of children) c.kill();
});
if (!remote) {
  const [apiPort, mpPort] = [await free(), await free()];
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-load-'));
  const secrets = { MP_NOTIFY_SECRET: crypto.randomBytes(12).toString('hex'), INTERNAL_SECRET: crypto.randomBytes(12).toString('hex'), ADMIN_TOKEN: crypto.randomBytes(16).toString('hex') };
  const env = { ...process.env, ...secrets, TRUST_PROXY: '1', NODE_ENV: 'development', SENTRY_DSN: '' };
  const start = (name, cmd, extra) => {
    const out = [];
    const c = spawn(process.execPath, cmd, { cwd: root, env: { ...env, ...extra }, stdio: ['ignore', 'ignore', 'pipe'] });
    c.stderr.on('data', (d) => (out.push(String(d)), out.length > 50 && out.shift()));
    c.on('exit', (code) => code && !stopping && logs.push(`${name} exited with ${code}: ${out.join('').slice(-1500)}`));
    children.push(c);
  };
  start('api', ['--experimental-sqlite', '--no-warnings', path.join(root, 'services', 'api', 'server.mjs')], { API_PORT: String(apiPort), API_DB: ':memory:', MP_NOTIFY_URL: `http://127.0.0.1:${mpPort}/notify` });
  if (!(await waitUp(`http://127.0.0.1:${apiPort}/health`))) fail(`the API did not start on :${apiPort} ${logs.join(' ')}`);
  start('presence', [path.join(root, 'services', 'multiplayer', 'server.mjs')], { MP_PORT: String(mpPort), MP_LOG_DIR: tmp, MP_API_URL: `http://127.0.0.1:${apiPort}` });
  if (!(await waitUp(`http://127.0.0.1:${mpPort}/health`))) fail(`the presence server did not start on :${mpPort} ${logs.join(' ')}`);
  MP = `ws://127.0.0.1:${mpPort}`;
  API = `http://127.0.0.1:${apiPort}`;
}
const MP_HTTP = MP.replace(/^ws/, 'http');
const health = await fetch(`${MP_HTTP}/health`).then((r) => r.json()).catch(() => null);
if (!health) fail(`the presence server at ${MP_HTTP}/health does not answer`);

// The server's own figures: /status (local), or the API's admin route (staging hides /status behind Caddy).
async function readLoad() {
  try {
    if (!remote) return (await (await fetch(`${MP_HTTP}/status`, { signal: AbortSignal.timeout(3000) })).json()).load;
    if (ADMIN_TOKEN && API) {
      const r = await fetch(`${API}/admin/presence`, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }, signal: AbortSignal.timeout(5000) });
      if (r.ok) return (await r.json()).load ?? null;
    }
    const r = await fetch(`${MP_HTTP}/status`, { signal: AbortSignal.timeout(3000) });
    return r.ok ? ((await r.json()).load ?? null) : null;
  } catch {
    return null; // a busy server may be slow to answer
  }
}

// ---- the API, as a pretend player from its own network ---------------------------------------------------------------------------
async function api(method, route, { token, body, ip } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(API + route, { method, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 load-test', 'X-Forwarded-For': ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    } catch (err) {
      return { status: 0, data: { error: err.message } };
    }
    const data = await res.json().catch(() => null);
    // a remote stack sees every pretend player as one network: its per-network limit is waited out (counted, not hidden)
    if (res.status === 429 && remote && attempt < 12) {
      counts.apiRateLimited++;
      await sleep(10000);
      continue;
    }
    return { status: res.status, data };
  }
}
const ticketFor = async (b) => (await api('POST', '/messaging/ticket', { token: b.token, ip: b.ip })).data?.ticket ?? null;

// ---- the pretend players ---------------------------------------------------------------------------------------------------------------
const rnd = (a, b) => a + Math.random() * (b - a);
const counts = { apiRateLimited: 0, connectFailures: 0, refused: 0, unexpected: [], authAttempts: 0, authOk: 0, authFailures: [], dupEnters: 0, dupAccounts: 0, dupChat: 0, dupNotes: [] };
const lines = new Map(); // clientMessageId -> { b, sentAt, kind, answer, answeredAt, messageId }
const heardAt = []; // [messageId, at, hearer]
const reconnects = []; // { ms, ok, kind, signed }
const authMs = [];
let measuring = false;
let windowStart = 0;
const bots = [];
const byType = {}; // what the clients were sent during the window, by message type: { n, bytes }
const ipOf = (i) => `10.${77 + Math.floor(i / 65000)}.${Math.floor(i / 250) % 250}.${(i % 250) + 1}`;
const KEEP = (m) => m.type !== 'snapshot' && m.type !== 'online' && m.type !== 'chat' && m.type !== 'profile';
const note = (s) => VERBOSE && say(`   ${s}`);

function makeBot(i, role) {
  const hot = Math.random() < CROWD ? HOT[i % HOT.length] : null;
  const r = Math.random();
  const motion = role === 'slow' ? 'walk' : r < 0.25 ? 'stand' : r < 0.8 ? 'walk' : 'drive';
  return {
    i,
    role, // normal | churn | slow | frozen
    signed: false,
    name: `Bot${i}`,
    ip: ipOf(i + 1),
    room: String(2026 + (i % ROOMS)),
    x: hot ? hot[0] + rnd(-25, 25) : rnd(-W / 2, W / 2),
    z: hot ? hot[1] + rnd(-25, 25) : rnd(-H / 2, H / 2),
    heading: rnd(0, Math.PI * 2),
    hot,
    motion,
    dest: HOT[(i + 1) % HOT.length],
    conn: null,
    busy: false, // reconnecting: no movement, no chat
    lastState: 0,
    stats: { snapshots: 0, bytes: 0, msgs: 0, enters: 0, exits: 0, fullWindow: true },
    heard: new Map(), // messageId -> times heard (across all its connections)
    chatSeq: 0,
  };
}

// one connection of a pretend player: everything it is told goes through here (per connection: who it can see)
function onMessage(b, conn, m, n) {
  if (conn.dead) return;
  conn.bytes += n;
  if (measuring) {
    b.stats.msgs++;
    b.stats.bytes += n;
    const t = byType[m.type] ?? (byType[m.type] = { n: 0, bytes: 0 });
    t.n++;
    t.bytes += n;
    if (m.type === 'snapshot') b.stats.snapshots++;
  }
  if (m.type === 'snapshot') {
    conn.lastSnapshotAt = Date.now();
    for (const id of m.exit ?? []) {
      const e = conn.visible.get(id);
      if (e) {
        accountOut(conn, e.account);
        conn.visible.delete(id);
      }
      if (measuring) b.stats.exits++;
    }
    for (const p of m.enter ?? []) {
      if (conn.visible.has(p.id)) {
        counts.dupEnters++;
        counts.dupNotes.push(`${b.name} was told #${p.id} came into view while it was already in view`);
      } else {
        conn.visible.set(p.id, { account: p.account ?? null, x: p.x, z: p.z });
        accountIn(b, conn, p.account ?? null, p.id);
      }
      if (measuring) b.stats.enters++;
    }
    for (const row of m.players ?? []) {
      const e = conn.visible.get(row[0]);
      if (e) {
        e.x = row[1];
        e.z = row[2];
      }
    }
  } else if (m.type === 'profile') {
    const e = conn.visible.get(m.player.id);
    if (e && e.account !== (m.player.account ?? null)) {
      accountOut(conn, e.account);
      e.account = m.player.account ?? null;
      accountIn(b, conn, e.account, m.player.id);
    }
  } else if (m.type === 'welcome') conn.myId = m.id;
  else if (m.type === 'chat') {
    const k = (b.heard.get(m.messageId) ?? 0) + 1;
    b.heard.set(m.messageId, k);
    if (k > 1) {
      counts.dupChat++;
      counts.dupNotes.push(`${b.name} heard line ${m.messageId} ${k} times`);
    }
    if (m.id !== conn.myId && b.role !== 'slow' && b.role !== 'frozen') heardAt.push([m.messageId, Date.now()]); // (a client that is not reading hears late by design)
  } else if (m.type === 'chat.accepted' || m.type === 'chat.rejected') {
    const line = lines.get(m.clientMessageId);
    if (line && !line.answer) {
      line.answer = m.type === 'chat.accepted' ? 'accepted' : m.code;
      line.answeredAt = Date.now();
      line.messageId = m.messageId ?? null;
    } else if (line && line.answer === 'accepted' && m.type === 'chat.accepted' && m.messageId !== line.messageId) {
      counts.dupChat++;
      counts.dupNotes.push(`line ${m.clientMessageId} was accepted twice, as ${line.messageId} and ${m.messageId}`);
    }
  }
}
function accountIn(b, conn, account, id) {
  if (account == null) return;
  const k = (conn.accounts.get(account) ?? 0) + 1;
  conn.accounts.set(account, k);
  if (k > 1) {
    counts.dupAccounts++;
    counts.dupNotes.push(`${b.name} sees account ${account} twice (now as #${id})`);
  }
}
function accountOut(conn, account) {
  if (account == null) return;
  const k = (conn.accounts.get(account) ?? 1) - 1;
  if (k <= 0) conn.accounts.delete(account);
  else conn.accounts.set(account, k);
}

const closedIds = new Set(); // server ids of our connections that have ended
async function connect(b) {
  const conn = { visible: new Map(), accounts: new Map(), myId: null, bytes: 0, expectClose: false, closedCode: null, closedAt: null, dead: false, lastSnapshotAt: 0 };
  let agent;
  try {
    agent = await presenceAgent(null, b.name, gameHello(b.name, b.room, b.x, b.z), {
      url: MP,
      headers: { 'X-Forwarded-For': b.ip },
      keep: KEEP,
      checkEvery: 25,
      settleMs: 0,
      onMessage: (m, n) => onMessage(b, conn, m, n),
      onClose: (code) => {
        conn.closedCode = code;
        conn.closedAt = Date.now();
        if (conn.myId != null) closedIds.add(conn.myId);
        if (code === 1013) counts.refused++;
        if (!conn.expectClose && !stopping) {
          counts.unexpected.push(`${b.name} (${b.role}) lost its connection: ${code}`);
          if (b.role !== 'frozen' && b.conn === conn) reconnect(b, 'unexpected');
        }
      },
    });
  } catch {
    counts.connectFailures++;
    return null;
  }
  conn.agent = agent;
  const welcome = await agent.waitFor('welcome', 8000);
  if (!welcome) {
    conn.expectClose = true;
    agent.close();
    counts.connectFailures++;
    return null;
  }
  conn.myId = welcome.id;
  b.conn = conn;
  return conn;
}
async function signIn(b, conn) {
  const t0 = Date.now();
  const ticket = await ticketFor(b);
  counts.authAttempts++;
  const r = ticket ? await conn.agent.auth(ticket) : null;
  if (r?.type === 'auth.ok') {
    counts.authOk++;
    authMs.push(Date.now() - t0);
    b.lastTicket = ticket; // spent now: an abuser tries it later
    return true;
  }
  counts.authFailures.push(`${b.name}: ${ticket ? (r ? `${r.type} ${r.code}` : 'no answer') : 'no ticket'}`);
  return false;
}

// losing the connection and coming back, the way the game does it (lib/net/multiplayer.js: 1 s, then x1.7 up to 10 s)
async function reconnect(b, kind, at = Date.now()) {
  if (b.busy) return;
  b.busy = true;
  let delay = 1000;
  for (let attempt = 0; attempt < 6 && !stopping; attempt++) {
    await sleep(delay);
    const conn = await connect(b);
    if (conn) {
      const ok = b.signed ? await signIn(b, conn) : true;
      reconnects.push({ ms: Date.now() - at, ok, kind, signed: b.signed });
      b.busy = false;
      if (b.lostLine) {
        const line = b.lostLine;
        b.lostLine = null;
        lines.get(line).retriedAt = Date.now();
        b.lastSaid = Date.now();
        conn.agent.send({ type: 'chat.send', clientMessageId: line, channel: 'nearby', text: lines.get(line).text });
      }
      return;
    }
    delay = Math.min(delay * 1.7, 10000);
  }
  reconnects.push({ ms: Date.now() - at, ok: false, kind, signed: b.signed });
  b.busy = false;
}

async function churn(b, how) {
  const conn = b.conn;
  if (!conn || b.busy || conn.agent.ws.readyState !== 1) return;
  // a signed-in player sometimes says a line just before the connection goes: the answer is lost, and the game retries it afterwards
  if (b.signed && Math.random() < 0.5) {
    const cid = sayLine(b, 'lost');
    if (cid) b.lostLine = cid;
  }
  conn.expectClose = true;
  const at = Date.now();
  if (how === 'drop') conn.agent.drop();
  else conn.agent.close();
  for (let i = 0; i < 100 && conn.closedCode == null; i++) await sleep(20);
  conn.dead = true;
  b.stats.fullWindow = false;
  await reconnect(b, how, at);
}

const PHRASES = ['hello there', 'anyone around', 'nice shop here', 'meet at the fountain', 'see you later', 'where is the market', 'great view from up here', 'just looking around', 'this street is busy', 'love the music'];
function sayLine(b, kind = 'normal') {
  const conn = b.conn;
  if (!conn || conn.agent.ws.readyState !== 1) return null;
  if (b.frozen || Date.now() - (b.lastSaid ?? 0) < 1500) return null; // a person does not type two lines within a second (the server allows one a second)
  b.lastSaid = Date.now();
  const cid = `lt-${RUN}-${b.i}-${++b.chatSeq}`;
  const text = PHRASES[(b.i + b.chatSeq) % PHRASES.length];
  lines.set(cid, { b, text, sentAt: Date.now(), kind, answer: null, answeredAt: null, messageId: null, measured: measuring });
  conn.agent.send({ type: 'chat.send', clientMessageId: cid, channel: 'nearby', text });
  return cid;
}

// ---- setting up --------------------------------------------------------------------------------------------------------------------------
const tSetup = Date.now();
say(`presence load test (${mode}${args.clients || args['signed-in'] || args.seconds ? ', adjusted' : ''}): ${CLIENTS} players, ${SIGNED} signed in, ${SECONDS} s, ${remote ? `against ${MP}` : 'on a stack started here'}`);
const nSlow = Math.max(2, Math.round(CLIENTS * 0.03));
const nFrozen = Math.max(1, Math.round(CLIENTS * 0.01));
const nChurn = Math.max(4, Math.round(CLIENTS * 0.15));
for (let i = 0; i < CLIENTS; i++) {
  // roles: the first few are slow or frozen, then churners; signed-in players are spread over all of them
  const role = i < nSlow ? 'slow' : i < nSlow + nFrozen ? 'frozen' : i < nSlow + nFrozen + nChurn ? 'churn' : 'normal';
  const b = makeBot(i, role);
  if (role === 'slow') b.hot = HOT[0];
  if (role === 'slow') [b.x, b.z] = [HOT[0][0] + rnd(-10, 10), HOT[0][1] + rnd(-10, 10)];
  bots.push(b);
}
// who signs in: spread evenly, so churners, slow clients and normal players all include signed-in ones
const step = SIGNED ? CLIENTS / SIGNED : 0;
for (let k = 0; k < SIGNED; k++) bots[Math.min(CLIENTS - 1, Math.floor(k * step))].signed = true;

// accounts: sign up (a few at a time: each costs the API a password hash), a third sign in again as a returning player would
async function pool(items, n, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}
const signedBots = bots.filter((b) => b.signed);
let accountFailures = 0;
await pool(signedBots, 6, async (b) => {
  b.username = `lt${RUN}${b.i}`.slice(0, 20);
  const up = await api('POST', '/auth/signup', { body: { username: b.username, password: PASSWORD }, ip: b.ip });
  if (up.status !== 200) return void (accountFailures++, b.signed = false, note(`sign-up failed for ${b.username}: ${up.status}`));
  b.token = up.data.token;
  b.accountId = up.data.account.id;
  if (b.i % 3 === 0) {
    const back = await api('POST', '/auth/login', { body: { username: b.username, password: PASSWORD }, ip: b.ip });
    if (back.status === 200) b.token = back.data.token;
    else (accountFailures++, note(`sign-in failed for ${b.username}: ${back.status}`));
  }
});
// the abusers: their own networks and (for the chat flood and the expired ticket) an account
const abuser = { i: 100000, ip: ipOf(100000), name: 'Abuser', room: '2026', username: `lt${RUN}abuse`.slice(0, 20) };
let expiredTicket = null;
if (API) {
  const up = await api('POST', '/auth/signup', { body: { username: abuser.username, password: PASSWORD }, ip: abuser.ip });
  if (up.status === 200) {
    abuser.token = up.data.token;
    const t = await api('POST', '/messaging/ticket', { token: abuser.token, ip: abuser.ip });
    if (t.data?.ticket) expiredTicket = { ticket: t.data.ticket, at: Date.now() }; // used once it is more than a minute old
  } else accountFailures++;
}
const tAccounts = Date.now();
say(`  accounts: ${signedBots.length - accountFailures} ready in ${((tAccounts - tSetup) / 1000).toFixed(1)} s${accountFailures ? ` (${accountFailures} failed)` : ''}${counts.apiRateLimited ? ` (waited out the API's per-network limit ${counts.apiRateLimited} times)` : ''}`);

// connect in waves (a real crowd does not arrive in one millisecond); the signed-in ones sign in on their new connection
for (let i = 0; i < CLIENTS; i += 50) {
  await Promise.all(bots.slice(i, i + 50).map(async (b) => {
    const conn = await connect(b);
    if (conn && b.signed) await signIn(b, conn);
  }));
  await sleep(100);
}
const connected = bots.filter((b) => b.conn).length;
say(`  connected: ${connected} of ${CLIENTS} in ${((Date.now() - tAccounts) / 1000).toFixed(1)} s, ${counts.authOk} of ${counts.authAttempts} signed in`);
if (connected < CLIENTS * 0.9) {
  stopping = true;
  await stopStack();
  fail(`only ${connected} of ${CLIENTS} could connect${counts.refused ? ` (${counts.refused} refused: the server's MP_MAX_CLIENTS / MP_MAX_PER_IP; a remote run comes from one network)` : ''}`);
}

// ---- moving -----------------------------------------------------------------------------------------------------------------------------
let sentStates = 0;
const walker = setInterval(() => {
  const now = Date.now();
  for (const b of bots) {
    const conn = b.conn;
    if (!conn || b.busy || b.frozen || conn.agent.ws.readyState !== 1) continue;
    if (b.motion === 'stand') {
      if (now - b.lastState < 2000) continue; // the game's heartbeat
      b.lastState = now;
      conn.agent.send({ type: 'state', x: b.x, z: b.z, yaw: b.heading, moving: false, emote: null, veh: null });
      sentStates++;
      continue;
    }
    if (b.motion === 'drive') {
      // between the busy places at car speed (12 units a second): into and out of everyone's view
      const dx = b.dest[0] - b.x;
      const dz = b.dest[1] - b.z;
      const d = Math.hypot(dx, dz);
      if (d < 3) b.dest = HOT[(HOT.indexOf(b.dest) + 1 + (b.i % 2)) % HOT.length];
      else {
        b.heading = Math.atan2(dx, dz);
        b.x += (dx / d) * 1.2;
        b.z += (dz / d) * 1.2;
      }
      conn.agent.send({ type: 'state', x: b.x, z: b.z, yaw: b.heading, moving: true, emote: null, veh: { kind: 'car', color: '#3b82f6' } });
    } else {
      // walking (3 units a second) about the player's busy place, or the whole city
      if (Math.random() < 0.02) b.heading += rnd(-1.5, 1.5);
      if (b.hot && Math.hypot(b.x - b.hot[0], b.z - b.hot[1]) > 30) b.heading = Math.atan2(b.hot[0] - b.x, b.hot[1] - b.z);
      b.x += Math.sin(b.heading) * 0.3;
      b.z += Math.cos(b.heading) * 0.3;
      if (Math.abs(b.x) > W / 2) b.heading = -b.heading;
      if (Math.abs(b.z) > H / 2) b.heading = Math.PI - b.heading;
      conn.agent.send({ type: 'state', x: b.x, z: b.z, yaw: b.heading, moving: true, emote: null, veh: null });
    }
    sentStates++;
  }
}, 100);

// talking: each signed-in player says a line every 15-40 s
const talkers = [];
for (const b of bots.filter((x) => x.signed)) {
  const next = () => {
    const t = setTimeout(() => {
      if (!stopping && !b.busy && !b.frozen && measuring && Date.now() - windowStart < (SECONDS - 3) * 1000) sayLine(b);
      if (!stopping) next();
    }, rnd(15000, 40000) * (mode === 'quick' ? 0.4 : 1));
    talkers.push(t);
  };
  // the first line soon after the window opens
  talkers.push(setTimeout(() => (measuring && !b.busy ? sayLine(b) : null, next()), 3000 + rnd(0, 8000)));
}

// ---- the abuse mix ----------------------------------------------------------------------------------------------------------------------
const abuse = []; // { name, ok, detail, skipped }
const abuseAgent = async (label, hello, n) => presenceAgent(null, label, hello, { url: MP, headers: { 'X-Forwarded-For': ipOf(200000 + n) }, settleMs: 50 });
const record = (name, ok, detail) => abuse.push({ name, ok: Boolean(ok), detail });
async function abuseMix() {
  const room = '2026';
  const [hx, hz] = HOT[1];
  const tasks = [
    // a malformed message and a hello that does not fit its contract: answered `invalid`, and the connection may then say hello properly
    async () => {
      const a = await abuseAgent('malformed', null, 1);
      a.send('this is not JSON');
      a.send({ type: 'hello', room: 7 });
      const inv = await a.waitFor('invalid', 4000);
      a.send(gameHello('Malformed', room, hx, hz));
      const w = await a.waitFor('welcome', 4000);
      record('malformed message: answered invalid, then a proper hello works', inv?.of === 'hello' && w && a.closed == null, inv ? `invalid ${inv.of}` : 'no answer');
      a.close();
    },
    // a movement flood: the extras beyond 60 a second are dropped, the connection stays, and what others see is where it was before the excess
    async () => {
      const a = await abuseAgent('flood', gameHello('Flood', room, hx, hz), 2);
      const w = await a.waitFor('welcome', 4000);
      await sleep(1100); // a fresh rate window
      for (let i = 0; i < 300; i++) a.send({ type: 'state', x: hx + i * 0.2, z: hz, yaw: 0, moving: true, emote: null, veh: null });
      await sleep(1500);
      const seen = bots.map((b) => b.conn?.visible.get(w?.id)).filter(Boolean).map((e) => e.x);
      const furthest = seen.length ? Math.max(...seen) - hx : null;
      record('movement flood: extras dropped, connection kept', w && a.closed == null && (furthest == null || furthest < 0.2 * 130), `${seen.length} watcher(s); furthest seen ${furthest == null ? '-' : furthest.toFixed(1)} of ${(300 * 0.2).toFixed(0)} units sent`);
      a.close();
    },
    // a chat flood (signed in): one line a second; the second is refused with how long to wait
    async () => {
      if (!abuser.token) return abuse.push({ name: 'chat flood', skipped: 'no API' });
      const a = await abuseAgent('chatflood', gameHello('ChatFlood', room, hx, hz), 3);
      const ticket = (await api('POST', '/messaging/ticket', { token: abuser.token, ip: abuser.ip })).data?.ticket;
      const ok = ticket ? await a.auth(ticket) : null;
      a.send({ type: 'chat.send', clientMessageId: `lt-${RUN}-flood-1`, channel: 'nearby', text: 'flood one' });
      a.send({ type: 'chat.send', clientMessageId: `lt-${RUN}-flood-2`, channel: 'nearby', text: 'flood two' });
      const second = await a.waitFor((m) => m.type === 'chat.rejected' && m.clientMessageId === `lt-${RUN}-flood-2`, 5000);
      record('chat flood: the second line within a second is rate_limited with retryAfterMs', ok?.type === 'auth.ok' && second?.code === 'rate_limited' && second.retryAfterMs > 0, second ? `${second.code} ${second.retryAfterMs} ms` : `auth ${ok?.type}`);
      a.close();
    },
    // a ticket already spent by a real player: refused
    async () => {
      const spent = bots.find((b) => b.lastTicket)?.lastTicket;
      if (!spent) return abuse.push({ name: 'reused ticket', skipped: 'nobody signed in' });
      const a = await abuseAgent('reuse', gameHello('Reuse', room, hx, hz), 4);
      const r = await a.auth(spent);
      record('reused ticket: auth.failed unauthenticated', r?.type === 'auth.failed' && r.code === 'unauthenticated', `${r?.type} ${r?.code ?? ''}`);
      a.close();
    },
    // a made-up ticket, and a sign-in with no ticket at all
    async () => {
      const a = await abuseAgent('madeup', gameHello('MadeUp', room, hx, hz), 5);
      const r = await a.auth('f'.repeat(48));
      record('made-up ticket: auth.failed unauthenticated', r?.type === 'auth.failed' && r.code === 'unauthenticated', `${r?.type} ${r?.code ?? ''}`);
      await sleep(1100);
      const at = a.mark();
      a.send({ type: 'auth' });
      const r2 = await a.waitFor((m) => m.type === 'auth.failed', 4000, at);
      record('sign-in without a ticket: auth.failed bad_request', r2?.code === 'bad_request', `${r2?.type} ${r2?.code ?? ''}`);
      a.close();
    },
    // a stale protocol: told which one the server speaks, closed with 4002, never welcomed
    async () => {
      const a = await abuseAgent('stale', { ...gameHello('Stale', room, hx, hz), v: 1 }, 6);
      const u = await a.waitFor('protocol.unsupported', 4000);
      for (let i = 0; i < 40 && a.closed == null; i++) await sleep(50);
      record('stale protocol: protocol.unsupported, closed 4002, no welcome', u?.protocol === 2 && a.closed === 4002 && !a.all('welcome').length, `closed ${a.closed}`);
    },
    // an oversized message (over the 16 KB limit): the connection is closed with 1009
    async () => {
      const a = await abuseAgent('oversized', gameHello('Big', room, hx, hz), 7);
      await a.waitFor('welcome', 4000);
      a.send({ type: 'profile', name: 'x'.repeat(20000), appearance: {} });
      for (let i = 0; i < 60 && a.closed == null; i++) await sleep(50);
      record('oversized message: closed 1009', a.closed === 1009, `closed ${a.closed}`);
    },
  ];
  await Promise.all(tasks.map((t) => t().catch((err) => record(`abuse task error`, false, err.message))));
}
async function expiredTicketCheck() {
  if (!expiredTicket) return abuse.push({ name: 'expired ticket', skipped: 'no API' });
  const wait = expiredTicket.at + 62000 - Date.now();
  if (wait > (SECONDS - 4) * 1000 - (Date.now() - windowStart)) return abuse.push({ name: 'expired ticket', skipped: `tickets last a minute; this run is ${SECONDS} s (the full run checks it)` });
  await sleep(Math.max(0, wait));
  const a = await abuseAgent('expired', gameHello('Expired', '2026', HOT[2][0], HOT[2][1]), 8);
  const r = await a.auth(expiredTicket.ticket);
  record('expired ticket: auth.failed unauthenticated', r?.type === 'auth.failed' && r.code === 'unauthenticated', `${r?.type} ${r?.code ?? ''}`);
  a.close();
}

// ---- slow and frozen clients -----------------------------------------------------------------------------------------------------------
const sorted = (arr) => [...arr].sort((a, b) => a - b);
const q = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : null);
const slowResults = [];
async function slowReader(b, pauseMs) {
  const conn = b.conn;
  if (!conn) return;
  const before = conn.bytes;
  const ratePerSec = b.stats.bytes / Math.max(1, (Date.now() - windowStart) / 1000);
  const statusBefore = await readLoad();
  conn.agent.pause(); // stops reading; keeps sending its movement (the walker goes on)
  let sawBackedUp = 0;
  const watch = setInterval(async () => {
    const l = await readLoad();
    if (l?.backedUp) sawBackedUp = Math.max(sawBackedUp, l.backedUp);
  }, 1000);
  await sleep(pauseMs);
  clearInterval(watch);
  const statusAfter = await readLoad();
  const resumedAt = Date.now();
  conn.agent.resume();
  await sleep(600);
  const backlog = conn.bytes - before;
  let fresh = false;
  for (let i = 0; i < 30 && !fresh; i++) {
    fresh = conn.lastSnapshotAt > resumedAt + 600;
    if (!fresh) await sleep(100);
  }
  slowResults.push({ name: b.name, kind: 'slow reader', pauseMs, connected: conn.closedCode == null && b.conn === conn, fresh, backlogKB: Math.round(backlog / 1024), unthrottledKB: Math.round((ratePerSec * (pauseMs + 600)) / 1000 / 1024), backedUp: sawBackedUp, skipped: statusBefore && statusAfter ? statusAfter.skipped - statusBefore.skipped : null });
}
async function frozenClient(b) {
  const conn = b.conn;
  if (!conn) return;
  conn.expectClose = true; // the server is expected to drop it
  b.frozen = true;
  b.stats.fullWindow = false;
  const at = Date.now();
  const before = (await readLoad())?.droppedSilent ?? null;
  conn.agent.pause(); // neither reads (so no pongs) nor sends
  let droppedAt = null; // when the server's count of silent connections dropped went up (when it can be read)
  while (Date.now() - at < 27000) {
    await sleep(1000);
    const l = before == null || droppedAt ? null : await readLoad();
    if (l && l.droppedSilent > before) droppedAt = Date.now();
  }
  conn.agent.resume(); // the close is only seen once it reads again
  for (let i = 0; i < 40 && conn.closedCode == null; i++) await sleep(100);
  slowResults.push({ name: b.name, kind: 'frozen', dropped: conn.closedCode != null, afterMs: droppedAt ? droppedAt - at : null, code: conn.closedCode });
}

// ---- the run -----------------------------------------------------------------------------------------------------------------------------
const loads = [];
const frozenDone = Promise.all(bots.filter((b) => b.role === 'frozen').map((b) => frozenClient(b))); // starts now: the server takes 20-25 s
await sleep(3000); // let the first sightings settle before measuring
for (const b of bots) b.stats = { snapshots: 0, bytes: 0, msgs: 0, enters: 0, exits: 0, fullWindow: b.stats.fullWindow };
sentStates = 0;
measuring = true;
windowStart = Date.now();
const poller = setInterval(async () => {
  const l = await readLoad();
  if (l) loads.push(l);
}, 2000);
const background = [];
// churn: each churner drops (half without a close handshake, half closing cleanly) at a random moment, twice in a longer run
for (const b of bots.filter((x) => x.role === 'churn')) {
  const times = SECONDS >= 60 ? 2 : 1;
  for (let k = 0; k < times; k++) {
    const at = rnd(2000, (SECONDS - 7) * 1000);
    background.push(sleep(at).then(() => churn(b, (b.i + k) % 2 ? 'drop' : 'close')));
  }
}
const slowPause = mode === 'quick' ? 6000 : 15000;
// while the slow readers are backed up, the others must be sent their snapshots as before
const duringSlow = { perSec: null };
background.push(
  sleep(SECONDS * 300).then(async () => {
    const others = bots.filter((b) => b.role === 'normal' && b.hot && b.conn);
    const before = others.map((b) => b.stats.snapshots);
    const t = Date.now();
    await Promise.all(bots.filter((b) => b.role === 'slow').map((b) => slowReader(b, slowPause)));
    const rates = sorted(others.map((b, k) => (b.stats.snapshots - before[k]) / ((Date.now() - t) / 1000)));
    duringSlow.perSec = q(rates, 0.5);
  }),
);
background.push(sleep(SECONDS * 450).then(abuseMix));
background.push(expiredTicketCheck());
await sleep(SECONDS * 1000);
const secs = (Date.now() - windowStart) / 1000;
measuring = false;
await Promise.all(background);
await frozenDone;
await sleep(2000); // the last answers and exits arrive
clearInterval(poller);
const last = await readLoad();
if (last) loads.push(last);

// ghosts: a connection that has ended must have left everyone's view by now
let ghosts = 0;
for (const b of bots) {
  const conn = b.conn;
  if (!conn || conn.closedCode != null || b.frozen) continue;
  for (const id of conn.visible.keys()) if (closedIds.has(id)) (ghosts++, counts.dupNotes.push(`${b.name} still sees #${id}, whose connection has ended`));
}
clearInterval(walker);
for (const t of talkers) clearTimeout(t);
stopping = true;

// ---- the figures --------------------------------------------------------------------------------------------------------------------------
const steady = bots.filter((b) => b.conn && b.stats.fullWindow && b.role !== 'slow');
const busy = steady.filter((b) => b.hot);
const snapRate = sorted(busy.map((b) => b.stats.snapshots / secs));
const msgsPerSec = sorted(steady.map((b) => b.stats.msgs / secs));
const kbPerSec = sorted(steady.map((b) => b.stats.bytes / 1024 / secs));
const inView = sorted(steady.map((b) => b.conn.visible.size));
const enters = steady.reduce((n, b) => n + b.stats.enters, 0);
const exits = steady.reduce((n, b) => n + b.stats.exits, 0);
const honest = [...lines.values()].filter((l) => l.measured || l.kind === 'lost');
const accepted = honest.filter((l) => l.answer === 'accepted');
const rejectedBy = honest.filter((l) => l.answer && l.answer !== 'accepted').reduce((acc, l) => ((acc[l.answer] = (acc[l.answer] ?? 0) + 1), acc), {});
const unanswered = honest.filter((l) => !l.answer).length;
// a line said just as the connection went is left out of the latency: it may be heard then, or only after the retry on the next connection
const sentAtByMid = new Map([...lines.values()].filter((l) => l.messageId).map((l) => [l.messageId, l.kind === 'lost' ? null : l.sentAt]));
const chatLatency = sorted(heardAt.filter(([mid]) => sentAtByMid.get(mid) != null).map(([mid, at]) => at - sentAtByMid.get(mid)));
const reconnectMs = sorted(reconnects.filter((r) => r.ok).map((r) => r.ms));
const lostRetried = honest.filter((l) => l.kind === 'lost');
const load = loads.reduce(
  (acc, l) => ({ cpuPct: Math.max(acc.cpuPct, l.cpuPct ?? 0), tickMsAvg: Math.max(acc.tickMsAvg, l.tickMsAvg ?? 0), tickMsP95: Math.max(acc.tickMsP95, l.tickMsP95 ?? 0), tickMsMax: Math.max(acc.tickMsMax, l.tickMsMax ?? 0), loopDelayP99Ms: Math.max(acc.loopDelayP99Ms, l.loopDelayP99Ms ?? 0), rssMB: Math.max(acc.rssMB, l.rssMB ?? 0), bytesPerSec: Math.max(acc.bytesPerSec, l.bytesPerSec ?? 0), messagesPerSec: Math.max(acc.messagesPerSec, l.messagesPerSec ?? 0), clients: Math.max(acc.clients, l.clients ?? 0), backedUp: Math.max(acc.backedUp, l.backedUp ?? 0), skipped: l.skipped ?? acc.skipped, droppedSilent: l.droppedSilent ?? acc.droppedSilent, refused: l.refused ?? acc.refused }),
  { cpuPct: 0, tickMsAvg: 0, tickMsP95: 0, tickMsMax: 0, loopDelayP99Ms: 0, rssMB: 0, bytesPerSec: 0, messagesPerSec: 0, clients: 0, backedUp: 0, skipped: 0, droppedSilent: 0, refused: 0 },
);
const haveLoad = loads.length > 0;
const tickP95Typical = q(sorted(loads.map((l) => l.tickMsP95 ?? 0)), 0.5);
const authRate = counts.authAttempts ? counts.authOk / counts.authAttempts : 1;
const chatRate = honest.length ? accepted.length / honest.length : 1;
const duplicates = counts.dupEnters + counts.dupAccounts + counts.dupChat + ghosts;
const slowOk = slowResults.filter((r) => r.kind === 'slow reader').every((r) => r.connected && r.fresh);
const frozenOk = slowResults.filter((r) => r.kind === 'frozen').every((r) => r.dropped && (r.afterMs == null || r.afterMs <= 27000));
const abuseRan = abuse.filter((a) => !a.skipped);

// ---- the verdict ------------------------------------------------------------------------------------------------------------------------
const gates = [];
const gate = (name, value, budget, ok, measured = true) => gates.push({ name, value, budget, ok: measured ? Boolean(ok) : null });
const fmt = (v, unit = '') => (v == null ? '-' : `${typeof v === 'number' ? Math.round(v * 100) / 100 : v}${unit}`);
gate('unexpected disconnects', counts.unexpected.length, `= ${BUDGETS.unexpectedDisconnects}`, counts.unexpected.length <= BUDGETS.unexpectedDisconnects);
gate('players or lines seen twice, ghosts', duplicates, `= ${BUDGETS.duplicates}`, duplicates <= BUDGETS.duplicates);
gate('messages outside their contract', misfits.length, `= ${BUDGETS.misfits}`, misfits.length <= BUDGETS.misfits);
gate('sign-ins that succeed', `${(authRate * 100).toFixed(1)}%`, `>= ${BUDGETS.authSuccess * 100}%`, authRate >= BUDGETS.authSuccess);
gate('chat lines accepted', `${(chatRate * 100).toFixed(1)}%`, `>= ${BUDGETS.chatAccepted * 100}%`, chatRate >= BUDGETS.chatAccepted, honest.length > 0);
gate('chat said to heard, p95', fmt(q(chatLatency, 0.95), ' ms'), `< ${BUDGETS.chatP95Ms} ms`, q(chatLatency, 0.95) < BUDGETS.chatP95Ms, chatLatency.length > 0);
gate('reconnect, p95', fmt(q(reconnectMs, 0.95), ' ms'), `< ${BUDGETS.reconnectP95Ms} ms`, q(reconnectMs, 0.95) < BUDGETS.reconnectP95Ms && reconnects.every((r) => r.ok), reconnects.length > 0);
gate('snapshots to a player in a busy place, median', fmt(q(snapRate, 0.5), '/s'), `>= ${BUDGETS.snapshotP50PerSec}/s`, q(snapRate, 0.5) >= BUDGETS.snapshotP50PerSec, snapRate.length > 0);
gate('slow readers kept and caught up', slowOk ? 'yes' : 'no', 'yes', slowOk, slowResults.some((r) => r.kind === 'slow reader'));
gate('snapshots to the others meanwhile, median', fmt(duringSlow.perSec, '/s'), `>= ${BUDGETS.snapshotP50PerSec}/s`, duringSlow.perSec >= BUDGETS.snapshotP50PerSec, duringSlow.perSec != null);
gate('each client receives, busiest 5%', fmt(q(kbPerSec, 0.95), ' KB/s'), `< ${BUDGETS.clientKBp95} KB/s`, q(kbPerSec, 0.95) < BUDGETS.clientKBp95, kbPerSec.length > 0);
gate('frozen clients dropped (20-25 s of silence)', frozenOk ? 'yes' : 'no', 'yes', frozenOk, slowResults.some((r) => r.kind === 'frozen'));
gate('abuse answered as documented', `${abuseRan.filter((a) => a.ok).length} of ${abuseRan.length}`, 'all', abuseRan.every((a) => a.ok), abuseRan.length > 0);
gate('server tick, p95 (typical window)', fmt(tickP95Typical, ' ms'), `< ${BUDGETS.tickP95Ms} ms`, tickP95Typical < BUDGETS.tickP95Ms, haveLoad);
gate('server tick, p95 (worst window)', fmt(load.tickMsP95, ' ms'), `< ${BUDGETS.tickP95WorstMs} ms`, load.tickMsP95 < BUDGETS.tickP95WorstMs, haveLoad);
gate('server processor', fmt(load.cpuPct, '%'), `< ${BUDGETS.cpuPct}%`, load.cpuPct < BUDGETS.cpuPct, haveLoad);
gate('event-loop delay, p99', fmt(load.loopDelayP99Ms, ' ms'), `< ${BUDGETS.loopDelayP99Ms} ms`, load.loopDelayP99Ms < BUDGETS.loopDelayP99Ms, haveLoad);
gate('server memory', fmt(load.rssMB, ' MB'), `< ${BUDGETS.rssMB} MB`, load.rssMB < BUDGETS.rssMB, haveLoad);
const passed = gates.every((g) => g.ok !== false);

say('');
say(`players                 ${connected} connected (${SIGNED} signed in), ${ROOMS} ${ROOMS === 1 ? 'city' : 'cities'}, ${Math.round(CROWD * 100)}% in busy places, ${secs.toFixed(0)} s measured`);
say(`roles                   ${nChurn} churn, ${nSlow} slow readers, ${nFrozen} frozen, ${abuse.length} abuse checks`);
say(`sign-ins                ${counts.authOk} of ${counts.authAttempts} (ticket and auth: p50 ${fmt(q(sorted(authMs), 0.5), ' ms')}, p95 ${fmt(q(sorted(authMs), 0.95), ' ms')})${counts.apiRateLimited ? `; waited out the API's per-network limit ${counts.apiRateLimited} times` : ''}`);
say(`states sent             ${Math.round(sentStates / secs)} a second`);
say(`in view                 median ${fmt(q(inView, 0.5))}, busiest ${fmt(inView.at(-1))}; ${enters} came into view and ${exits} left it during the run`);
say(`each client receives    median ${fmt(q(msgsPerSec, 0.5))} messages and ${fmt(q(kbPerSec, 0.5))} KB a second; the busiest 5%: ${fmt(q(msgsPerSec, 0.95))} and ${fmt(q(kbPerSec, 0.95))} KB`);
const totalBytes = Object.values(byType).reduce((a, t) => a + t.bytes, 0) || 1;
say(`what clients were sent  ${Object.entries(byType).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 5).map(([k, t]) => `${k} ${Math.round((t.bytes / totalBytes) * 100)}% (${fmt(t.n / secs)}/s, ${fmt(t.bytes / 1024 / secs)} KB/s)`).join(', ')}`);
say(`snapshots, busy places  median ${fmt(q(snapRate, 0.5))}/s, lowest 5% ${fmt(q(snapRate, 0.05))}/s`);
say(`chat                    ${honest.length} lines, ${accepted.length} accepted${Object.keys(rejectedBy).length ? `, refused: ${JSON.stringify(rejectedBy)}` : ''}${unanswered ? `, ${unanswered} unanswered` : ''}; heard ${chatLatency.length} times, p50 ${fmt(q(chatLatency, 0.5), ' ms')}, p95 ${fmt(q(chatLatency, 0.95), ' ms')}; ${lostRetried.length} retried after a lost answer`);
say(`reconnects              ${reconnects.length} (${reconnects.filter((r) => r.kind === 'drop').length} dropped, ${reconnects.filter((r) => r.kind === 'close').length} closed cleanly, ${reconnects.filter((r) => r.kind === 'unexpected').length} after an unexpected loss), ${reconnects.filter((r) => !r.ok).length} failed; p50 ${fmt(q(reconnectMs, 0.5), ' ms')}, p95 ${fmt(q(reconnectMs, 0.95), ' ms')}`);
const readers = slowResults.filter((r) => r.kind === 'slow reader');
if (readers.length) {
  const range = (f) => `${Math.min(...readers.map(f))}-${Math.max(...readers.map(f))}`;
  const skipped = Math.max(...readers.map((r) => r.skipped ?? 0));
  say(`slow readers            ${readers.length} paused ${readers[0].pauseMs / 1000} s: ${readers.filter((r) => r.connected).length} kept, ${readers.filter((r) => r.fresh).length} caught up; backlog ${range((r) => r.backlogKB)} KB against ${range((r) => r.unthrottledKB)} KB unthrottled; the server ${skipped ? `skipped ${skipped} of their snapshots (up to ${Math.max(...readers.map((r) => r.backedUp))} backed up at once)` : haveLoad ? 'skipped none (the system buffers held the backlog)' : 'figures not available'}; the others got a median ${fmt(duringSlow.perSec, '/s')} snapshots meanwhile`);
  for (const r of readers.filter((x) => !x.connected || !x.fresh)) say(`slow reader             ${r.name}: ${r.connected ? 'kept' : 'DISCONNECTED'}, ${r.fresh ? 'caught up' : 'NOT caught up'}`);
}
for (const r of slowResults.filter((x) => x.kind === 'frozen')) say(`frozen                  ${r.name}: ${r.dropped ? `dropped by the server${r.afterMs ? ` after about ${(r.afterMs / 1000).toFixed(0)} s of silence` : ''} (seen as ${r.code} once it read again)` : 'NOT dropped'}`);
for (const a of abuse) say(`abuse                   ${a.skipped ? 'skip' : a.ok ? 'ok  ' : 'FAIL'} ${a.name}${a.skipped ? ` (${a.skipped})` : ` (${a.detail})`}`);
say(`server tick             ${haveLoad ? `average up to ${load.tickMsAvg} ms, 95th ${tickP95Typical} ms typically and ${load.tickMsP95} ms in the worst window, worst tick ${load.tickMsMax} ms (budget 100 ms)` : 'not available (staging hides /status: pass --admin-token)'}`);
if (haveLoad) {
  say(`server processor        up to ${load.cpuPct}% of one core, event-loop delay (99th) ${load.loopDelayP99Ms} ms, memory ${load.rssMB} MB`);
  say(`server sends            up to ${load.messagesPerSec} messages and ${(load.bytesPerSec / 1024).toFixed(0)} KB a second (${((load.bytesPerSec * 8) / 1e6).toFixed(1)} Mbit/s); ${load.droppedSilent} dropped for silence, ${load.refused} refused`);
}
if (counts.unexpected.length) say(`unexpected              ${counts.unexpected.slice(0, 5).join('; ')}`);
if (counts.authFailures.length) say(`sign-in failures        ${counts.authFailures.slice(0, 5).join('; ')}`);
if (counts.dupNotes.length) say(`duplicates              ${counts.dupNotes.slice(0, 5).join('; ')}`);
if (misfits.length) say(`contract misfits        ${misfits.slice(0, 3).map((m) => `${m.type}: ${m.errors.join('; ')}`).join(' | ')}`);
if (logs.length) say(`server logs             ${logs.join(' | ')}`);
say('');
say('budget                                              measured       budget');
for (const g of gates) say(`${g.ok === null ? 'n/a ' : g.ok ? 'ok  ' : 'FAIL'} ${g.name.padEnd(46)} ${String(g.value).padEnd(14)} ${g.budget}`);
say(`\nverdict: ${passed ? 'within budget' : 'OVER BUDGET'} (machine: ${os.cpus()[0]?.model?.trim()}, ${os.cpus().length} threads, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.platform()} ${os.release()}, Node ${process.version}; bots and ${remote ? 'a remote server' : 'servers on this one machine'})`);

if (args.json) {
  const report = {
    mode, clients: CLIENTS, signedIn: SIGNED, seconds: secs, remote, passed, gates, budgets: BUDGETS,
    composition: { connected, churn: nChurn, slow: nSlow, frozen: nFrozen, enters, exits, chatLines: honest.length, chatHeard: chatLatency.length, lostRetried: lostRetried.length, reconnects: reconnects.length, reconnectKinds: { drop: reconnects.filter((r) => r.kind === 'drop').length, close: reconnects.filter((r) => r.kind === 'close').length }, abuse },
    auth: { attempts: counts.authAttempts, ok: counts.authOk, p50: q(sorted(authMs), 0.5), p95: q(sorted(authMs), 0.95) },
    chat: { accepted: accepted.length, rejected: rejectedBy, unanswered, p50: q(chatLatency, 0.5), p95: q(chatLatency, 0.95) },
    reconnect: { p50: q(reconnectMs, 0.5), p95: q(reconnectMs, 0.95), failed: reconnects.filter((r) => !r.ok).length },
    snapshots: { p50: q(snapRate, 0.5), p5: q(snapRate, 0.05) },
    byType, slow: slowResults, duplicates: { enters: counts.dupEnters, accounts: counts.dupAccounts, chat: counts.dupChat, ghosts },
    unexpected: counts.unexpected, misfits: misfits.length, load: haveLoad ? { ...load, tickMsP95Typical: tickP95Typical } : null,
    machine: { cpu: os.cpus()[0]?.model?.trim(), threads: os.cpus().length, memGB: Math.round(os.totalmem() / 2 ** 30), os: `${os.platform()} ${os.release()}`, node: process.version },
  };
  fs.writeFileSync(args.json, JSON.stringify(report, null, 1));
}

for (const b of bots) {
  if (b.conn) {
    b.conn.expectClose = true;
    b.conn.agent.close();
  }
}
await sleep(400);
await stopStack();
process.exit(passed ? 0 : 1);
