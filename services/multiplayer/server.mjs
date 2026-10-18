// VoxelVenture LAN multiplayer + client diagnostics server.
//
//   node services/multiplayer/server.mjs         (or: npm run mp)
//
// Players connect over WebSocket (default port 3001). Everyone in the same city (same seed) sees each
// other's avatars. The server also collects what each client reports about itself: device, frame rate
// and every error (window errors, unhandled promise rejections, console.error). They are printed here,
// appended to services/multiplayer/logs/client-errors.jsonl, and served as JSON at http://<this machine>:3001/status
// (the /admin page in the app shows them live).
//
// Chat (docs/architecture/chat_messaging_plan.md): players near each other can talk (`chat.send`, answered with `chat.accepted` or `chat.rejected`).
// With the API set up (MP_API_URL), a game that is signed in hands over a one-use ticket (`auth`) and this server asks the API who it
// is: from then on the connection speaks as that account, and every line it says is checked and kept briefly by the API before it is
// passed on (blocks are applied there). Guests may chat only where MP_CHAT_GUESTS allows it (a trusted LAN). The API also sends
// "your inbox changed" notices here for one account (POST /notify-accounts), which go only to that account's connections.
//
// /status is open to anyone who can reach the port (a development tool): put the server behind the proxy in deploy/ before
// exposing it to the internet.
//
// Network addresses are never written down or shown: the log, the console, /status and /admin show a salted hash of the address
// (`net`, the same form the API keeps as ip_hash, with the same IP_SALT), enough to tell that two reports came from one network.

import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { WebSocketServer } from 'ws';
import { checkText, cleanMessage } from '../api/textcheck.mjs';
import { createReporter } from '../../lib/net/sentry.mjs';
import { PRESENCE_CLIENT, PRESENCE_PROTOCOL, check } from '@voxelventure/shared-types';

// Settings (all optional environment variables):
//   MP_PORT          port to listen on                      (default 3001)
//   MP_HOST          address to listen on                   (default 0.0.0.0: every network interface)
//   MP_MAX_CLIENTS   most connections at once               (default 1500)
//   MP_MAX_PER_IP    most connections from one address      (default 20)
//   IP_SALT          salt for the scrambled network address  (the API's IP_SALT; default 'voxelventure')
//   TRUST_PROXY      1: the player's address is X-Forwarded-For's first entry (behind Caddy)
//   MP_VIEW_RADIUS   how far away a player is still sent    (default 120 units)
//   MP_MAX_VISIBLE   most other players one client is told about at a time (default 40: the nearest ones)
//   MP_LOG_MAX_BYTES size at which the error log rotates    (default 2000000)
//   MP_LOG_DIR       folder for the error log               (default services/multiplayer/logs)
//   MP_NOTIFY_SECRET shared secret for POST /notify (the API tells every player something changed); without it /notify is off
//   MP_CHAT_RADIUS   how far a chat message carries         (default 60 units)
//   MP_API_URL       the API (e.g. http://127.0.0.1:3002): signed-in chat, blocks and reports; it is reached with MP_NOTIFY_SECRET
//   MP_CHAT_GUESTS   1: players who are not signed in may chat too (default 1 without MP_API_URL, a LAN; 0 with it)
//   MP_CHAT          0: nobody can send chat (it stays readable)
//   MP_ORIGINS       the web pages allowed to connect, comma separated (e.g. https://voxelventure.app); default: any
const PORT = Number(process.env.MP_PORT || 3001);
const HOST = process.env.MP_HOST || '0.0.0.0';
const MAX_CLIENTS = Number(process.env.MP_MAX_CLIENTS || 1500);
const MAX_PER_IP = Number(process.env.MP_MAX_PER_IP || 20);
// Behind the proxy (deploy/Caddyfile) every connection comes from 127.0.0.1: with TRUST_PROXY=1 the player's address is the one the
// proxy puts in X-Forwarded-For (as in the API), so the per-network cap and `net` tell players apart.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const IP_SALT = process.env.IP_SALT || 'voxelventure'; // the API's default too, so the two hashes of one address agree
// The scrambled form of a network address (docs/monetization/policy_review.md, gap 1): the address itself is not kept.
const netOf = (ip) => (ip ? crypto.createHash('sha256').update(`${IP_SALT}|${ip}`).digest('hex').slice(0, 16) : null);
const LOG_MAX_BYTES = Number(process.env.MP_LOG_MAX_BYTES || 2_000_000);
// Protocol 2 (interest management): a client is only told about the players near it (`enter` when one comes into range, `exit` when one leaves it,
// and only the changed positions after that), the nearest MAX_VISIBLE of them, so what a client costs does not grow with the size of the crowd.
const PROTOCOL = PRESENCE_PROTOCOL; // 2. Bump it (in packages/shared-types, with the contracts and their CHANGELOG) when the messages change in a way old clients cannot follow
const TICK_MS = 100; // positions go out ten times a second
const MAX_MESSAGE = 16 * 1024;
const CHAT_RADIUS = Number(process.env.MP_CHAT_RADIUS || 60);
const API_URL = (process.env.MP_API_URL || '').replace(/\/+$/, '');
const SECRET = process.env.MP_NOTIFY_SECRET || '';
const ACCOUNTS = Boolean(API_URL && SECRET); // signed-in chat needs both
const CHAT_ON = process.env.MP_CHAT !== '0';
const GUESTS_CHAT = process.env.MP_CHAT_GUESTS ? process.env.MP_CHAT_GUESTS === '1' : !API_URL;
const ORIGINS = (process.env.MP_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
const CHAT_MAX = 140;
const RECHECK_MS = Number(process.env.MP_RECHECK_MS || 30000); // how often signed-in connections are checked (signed out, banned): at most a minute late
const VIEW_RADIUS = Number(process.env.MP_VIEW_RADIUS || 120); // players farther than this are not sent
const EXIT_RADIUS = VIEW_RADIUS * 1.15; // a player already in view stays in view a little beyond the radius, so someone on the edge does not flicker
const MAX_VISIBLE = Number(process.env.MP_MAX_VISIBLE || 40);
// How often a player's movement is sent, by how far away they are (in ticks of TICK_MS): close ones every tick (10 a second), middling ones 5 a second,
// far ones 2.5 a second. The client smooths between updates, so a far walker still looks fluid, for a quarter of the bytes.
const NEAR_RADIUS = 40;
const MID_RADIUS = 80;
const OVERVIEW_MS = 2000; // how often the whole-city dots (for the world map) and the player count go out
const OVERVIEW_DOTS = 250;
const MAX_BUFFERED = 64 * 1024; // bytes waiting to go to one client before its snapshots are skipped
const MAX_RATE = 60; // messages per second per client before the extras are dropped
const MAX_CLIENT_ERRORS = 50;
const MAX_RECENT_ERRORS = 300;

const here = path.dirname(fileURLToPath(import.meta.url));
const logDir = process.env.MP_LOG_DIR || path.join(here, 'logs'); // MP_LOG_DIR moves the error log (the tests use a temporary folder)
fs.mkdirSync(logDir, { recursive: true });
const errorLog = path.join(logDir, 'client-errors.jsonl');

// Append one JSON line to the error log, keeping it from growing without limit: past LOG_MAX_BYTES the
// current file becomes client-errors.jsonl.1 (replacing the previous one) and a fresh file starts.
let logSize = fs.existsSync(errorLog) ? fs.statSync(errorLog).size : 0;
function appendErrorLog(entry) {
  const line = JSON.stringify(entry) + String.fromCharCode(10);
  try {
    if (logSize + line.length > LOG_MAX_BYTES) {
      fs.renameSync(errorLog, errorLog + '.1');
      logSize = 0;
    }
    fs.appendFileSync(errorLog, line);
    logSize += line.length;
  } catch (error) {
    console.error('could not write the error log:', error.message);
  }
}

// Sentry (deploy/MONITORING.md), when SENTRY_DSN is set: this server's own crashes, and the players' app errors it already collects.
// Only the app's own errors go (not ones from browser extensions, a lost graphics card, a missing image or a console line), and only
// the kind, message, stack and page: never the player's name or network.
const sentryOptions = { dsn: process.env.SENTRY_DSN, environment: process.env.SENTRY_ENVIRONMENT, release: process.env.SENTRY_RELEASE };
const serverReporter = createReporter({ ...sentryOptions, service: 'presence' });
const clientReporter = createReporter({ ...sentryOptions, service: 'web-client', platform: 'javascript' });
const REPORTED_CLIENT_KINDS = new Set(['error', 'unhandledrejection']);

const clients = new Map(); // id -> client
const recentErrors = [];
const startedAt = Date.now();
let nextId = 1;
let tickNumber = 0;

const c = { reset: '\x1b[0m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' };
const stamp = () => new Date().toLocaleTimeString();
const log = (color, tag, text) => console.log(`${c.dim}${stamp()}${c.reset} ${color}${tag}${c.reset} ${text}`);

// --- input hygiene: everything from a client is untrusted ----------------------------------------------
const str = (v, max) => (typeof v === 'string' ? v.replace(/\p{Cc}/gu, ' ').slice(0, max) : '');
const num = (v, fallback = 0, lim = 1e5) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : fallback);
const cleanAppearance = (a) => ({ shirt: str(a?.shirt, 40), pants: str(a?.pants, 40), hat: str(a?.hat, 40) });
const cleanName = (n) => str(n, 20).trim() || 'Player';

// The vehicle a player is in ({ kind: 'car' | 'boat', boatKind, color }), or null: only these few values are kept, whatever the client sends.
const cleanVeh = (v) =>
  v && (v.kind === 'car' || v.kind === 'boat')
    ? { kind: v.kind, boatKind: ['sailboat', 'rowboat-large', 'fishing'].includes(v.boatKind) ? v.boatKind : 'rowboat', color: /^#[0-9a-f]{6}$/i.test(String(v.color)) ? String(v.color) : '#3b82f6' }
    : null;
// The cars a player has left parked (at most three): { x, z, yaw, color } each, kept only if they are plain numbers and a plain colour.
const cleanParked = (list) =>
  (Array.isArray(list) ? list : [])
    .slice(0, 3)
    .map((c) => ({ x: num(c?.x), z: num(c?.z), yaw: num(c?.yaw, 0, 10), color: /^#[0-9a-f]{6}$/i.test(String(c?.color)) ? String(c.color) : '#3b82f6' }));
// `account` is set only for a connection the API vouched for (a ticket), never from what a client says; `verified` says so.
const publicPlayer = (p) => ({ id: p.id, name: p.name, appearance: p.appearance, x: p.x, z: p.z, yaw: p.yaw, moving: p.moving, emote: p.emote, veh: p.veh ?? null, parked: p.parked ?? [], account: p.account?.id ?? null, verified: Boolean(p.account) });
// What moves: the part of a player that goes out in every update, as a short array (a fifth of the bytes of an object):
//   [id, x, z, yaw, moving (0 or 1), emote (a name, or 0), vehicle ([kind, boatKind, colour], or 0)]
// `ver` changes whenever it does, so a client is only sent what it has not seen.
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
function touch(p) {
  const entry = [p.id, round1(p.x), round1(p.z), round2(p.yaw), p.moving ? 1 : 0, p.emote || 0, p.veh ? [p.veh.kind, p.veh.boatKind, p.veh.color] : 0];
  const json = JSON.stringify(entry);
  if (json !== p.json) {
    p.json = json;
    p.ver = (p.ver ?? 0) + 1;
  }
}

// Counters for /status: how much work the server is doing.
const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();
let lastCpu = process.cpuUsage();
let lastCpuAt = performance.now();
const metrics = { cpuPct: 0, ticks: 0, tickMsTotal: 0, tickMsMax: 0, tickMsRecent: [], bytesOut: 0, messagesOut: 0, windowStart: Date.now(), bytesPerSec: 0, messagesPerSec: 0 };

function summary(p) {
  return {
    id: p.id,
    name: p.name,
    net: p.net,
    room: p.room,
    connectedAt: p.connectedAt,
    lastSeen: p.lastSeen,
    x: p.x,
    z: p.z,
    device: p.device,
    fps: p.fps,
    render: p.render,
    errorCount: p.errorCount,
    errors: p.errors,
  };
}

function sendRaw(p, text) {
  if (p.ws.readyState !== 1) return;
  p.ws.send(text);
  metrics.bytesOut += text.length;
  metrics.messagesOut++;
}
function send(p, message) {
  sendRaw(p, JSON.stringify(message));
}

function inRoom(room) {
  return [...clients.values()].filter((p) => p.hello && p.room === room);
}

// --- accounts and chat ---------------------------------------------------------------------------------------------------
// One call to the API's internal messaging routes. Resolves { status, data }; status 0 when the API cannot be reached.
async function callApi(route, body) {
  try {
    const res = await fetch(API_URL + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': SECRET }, body: JSON.stringify(body), signal: AbortSignal.timeout(4000) });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  } catch {
    return { status: 0, data: {} };
  }
}

// The players who can see `p` hear about its new name (and whether it is a verified account).
function announceProfile(p) {
  for (const o of inRoom(p.room)) if (o !== p && o.known.has(p.id)) send(o, { type: 'profile', player: publicPlayer(p) });
}
function bindAccount(p, account) {
  p.account = account;
  p.name = account.username; // a signed-in player's name is their account's: it cannot be set to look like someone else
  send(p, { type: 'auth.ok', account: { id: account.id, username: account.username } });
  if (p.hello) announceProfile(p);
  log(c.cyan, '~ auth ', `#${p.id} is ${account.username}`);
}
function unbindAccount(p, reason) {
  if (!p.account) return;
  p.account = null;
  p.name = p.guestName ?? `Player ${p.id}`;
  send(p, { type: 'auth.revoked', reason });
  if (p.hello) announceProfile(p);
}

// The answer to a chat.send. An accepted line is remembered a while, so the same clientMessageId sent again gets the same answer and
// is not said twice; a refusal is not, so Retry with the same id can succeed once the reason has passed (the wait, the connection).
function answerChat(p, clientMessageId, out) {
  if (!clientMessageId) return; // an old client's `chat`: no answer expected
  if (out.type === 'chat.accepted') p.chatAnswers.set(clientMessageId, out);
  else p.chatAnswers.delete(clientMessageId);
  if (p.chatAnswers.size > 50) p.chatAnswers.delete(p.chatAnswers.keys().next().value);
  if (out.type === 'chat.accepted' && p.account) rememberForAccount(p.account.id, p.room, clientMessageId, out);
  send(p, out);
}
// A signed-in player's accepted lines, by account, for a few minutes: a phone that lost its connection just after a line went out never got
// the answer, so the game retries the line on its new connection, and it must get the same answer, not be said again (found by the
// reconnect-and-recovery journey, tests/journeys/). Guests have no identity that survives a reconnect, so theirs stay per connection.
const ACCOUNT_ANSWER_MS = 5 * 60 * 1000;
const accountAnswers = new Map(); // account id -> Map(clientMessageId -> { out, room, at })
function rememberForAccount(accountId, room, clientMessageId, out) {
  const mine = accountAnswers.get(accountId) ?? accountAnswers.set(accountId, new Map()).get(accountId);
  mine.set(clientMessageId, { out, room, at: Date.now() });
  if (mine.size > 50) mine.delete(mine.keys().next().value);
}
function answeredForAccount(p, clientMessageId) {
  const hit = p.account && accountAnswers.get(p.account.id)?.get(clientMessageId);
  return hit && hit.room === p.room && Date.now() - hit.at < ACCOUNT_ANSWER_MS ? hit.out : null;
}
setInterval(() => {
  const old = Date.now() - ACCOUNT_ANSWER_MS;
  for (const [id, mine] of accountAnswers) {
    for (const [cid, a] of mine) if (a.at < old) mine.delete(cid);
    if (!mine.size) accountAnswers.delete(id);
  }
}, 60 * 1000).unref();
const rejected = (clientMessageId, code, message, retryAfterMs) => ({ type: 'chat.rejected', clientMessageId, code, message, ...(retryAfterMs ? { retryAfterMs: Math.ceil(retryAfterMs) } : {}) });
let guestLines = 0;

// Says `said` to the players in range (not to those the API says are blocked either way), then tells the speaker it went out.
function deliverChat(p, hearers, said, messageId, at, blocked = new Set()) {
  const line = { type: 'chat', id: p.id, messageId, name: p.name, account: p.account?.id ?? null, verified: Boolean(p.account), text: said, x: p.x, z: p.z, at };
  for (const o of hearers) if (clients.get(o.id) === o && o.room === p.room && !(o.account && blocked.has(o.account.id))) send(o, line);
}

function handleChat(p, m, now) {
  const v2 = m.type === 'chat.send';
  const cid = v2 ? str(m.clientMessageId, 64) : '';
  if (v2 && !/^[\w-]{8,64}$/.test(cid)) return send(p, rejected(cid, 'bad_request', 'Each message needs its own id.'));
  const earlier = v2 && !p.chatAnswers.has(cid) && answeredForAccount(p, cid);
  if (earlier) {
    // a line this account said on a connection that has since gone: the same answer, not said again
    p.chatAnswers.set(cid, earlier);
    return send(p, earlier);
  }
  if (v2 && p.chatAnswers.has(cid)) {
    const before = p.chatAnswers.get(cid);
    if (before) send(p, before); // the same send again: the same answer (nothing is said twice)
    return;
  }
  if (!CHAT_ON) return answerChat(p, cid, rejected(cid, 'unavailable', 'Chat is switched off for now.'));
  const said = cleanMessage(m.text, CHAT_MAX);
  if (!said) return answerChat(p, cid, rejected(cid, 'empty', 'Write something first.'));
  if (!p.account && !GUESTS_CHAT) return answerChat(p, cid, rejected(cid, 'unauthenticated', 'Sign in to chat.'));
  if (now - (p.lastChat ?? 0) < 1000) return answerChat(p, cid, rejected(cid, 'rate_limited', 'One message a second, please.', 1000 - (now - p.lastChat)));
  p.lastChat = now;
  const hearers = inRoom(p.room).filter((o) => Math.hypot(o.x - p.x, o.z - p.z) <= CHAT_RADIUS);
  if (!p.account) {
    // a guest on a trusted LAN: the word filter here, and nothing is kept
    const verdict = checkText(said, { links: 0 });
    if (!verdict.ok) return answerChat(p, cid, rejected(cid, 'content_rejected', verdict.reason));
    const messageId = `g${++guestLines}`;
    deliverChat(p, hearers, said, messageId, now);
    return answerChat(p, cid, { type: 'chat.accepted', clientMessageId: cid, messageId, at: now });
  }
  // signed in: the API checks it, applies blocks and keeps it as evidence; if it cannot be reached, the line is refused, not let through
  if (cid) p.chatAnswers.set(cid, null); // in flight: a repeat now is ignored
  const binding = p.account.binding;
  callApi('/internal/messaging/nearby', { binding, room: p.room, text: said, recipients: hearers.filter((o) => o.account).map((o) => o.account.id) }).then(({ status, data }) => {
    if (clients.get(p.id) !== p) return;
    if (status === 200) {
      deliverChat(p, hearers, data.text, data.messageId, data.at, new Set(data.blocked ?? []));
      return answerChat(p, cid, { type: 'chat.accepted', clientMessageId: cid, messageId: data.messageId, at: data.at });
    }
    if (status === 401 && p.account?.binding === binding) unbindAccount(p, 'expired');
    const code = status === 401 ? 'unauthenticated' : status === 422 ? 'content_rejected' : status === 429 ? 'rate_limited' : status === 400 ? 'empty' : 'unavailable';
    answerChat(p, cid, rejected(cid, code, data.error || 'Chat is not available right now. Try again in a moment.', data.retryAfterMs));
  });
}

function handleAuth(p, m) {
  p.authSeq = (p.authSeq ?? 0) + 1; // a newer auth (or sign-out) wins over one still being checked
  if (m.type === 'auth.clear') return unbindAccount(p, 'signed_out');
  // a sign-in is held to its contract: a ticket of the right shape, or the API is not asked at all
  if (!check(PRESENCE_CLIENT.auth, m).ok) return send(p, { type: 'auth.failed', code: 'bad_request', message: 'A sign-in needs its ticket.' });
  if (!ACCOUNTS) return send(p, { type: 'auth.failed', code: 'unavailable', message: 'Accounts are not set up on this server.' });
  if (Date.now() - (p.lastAuth ?? 0) < 1000) return send(p, { type: 'auth.failed', code: 'rate_limited', message: 'Wait a moment and try again.' });
  p.lastAuth = Date.now();
  const seq = p.authSeq;
  callApi('/internal/messaging/redeem', { ticket: str(m.ticket, 100) }).then(({ status, data }) => {
    if (clients.get(p.id) !== p || seq !== p.authSeq) return;
    if (status === 200 && data.accountId) bindAccount(p, { id: Number(data.accountId), username: str(data.username, 20), binding: str(data.binding, 100) });
    else send(p, { type: 'auth.failed', code: status === 0 ? 'unavailable' : 'unauthenticated', message: status === 0 ? 'The account server cannot be reached.' : 'Sign in again.' });
  });
}

// Every half minute: are the signed-in connections still signed in (not signed out elsewhere, expired or banned)? Sending is checked
// by the API on every line anyway; this also ends the binding, so the name and the verified mark go too.
setInterval(async () => {
  if (!ACCOUNTS) return;
  const bound = [...clients.values()].filter((p) => p.account);
  if (!bound.length) return;
  const { status, data } = await callApi('/internal/messaging/bindings', { bindings: [...new Set(bound.map((p) => p.account.binding))] });
  if (status !== 200) return; // the API is down: keep everyone as they are (sending is refused meanwhile anyway)
  const valid = new Set(data.valid ?? []);
  for (const p of bound) if (p.account && !valid.has(p.account.binding)) unbindAccount(p, 'expired');
}, RECHECK_MS).unref();

// --- HTTP: /status for the admin page ------------------------------------------------------------------
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, now: Date.now(), protocol: PROTOCOL, players: [...clients.values()].filter((p) => p.hello).length }));
    return;
  }
  // The API server pushes "something changed" here (a claim, a take-over, an ad bought) and every connected game refreshes at once.
  if (req.url === '/notify' && req.method === 'POST') {
    const secret = process.env.MP_NOTIFY_SECRET;
    if (!secret || req.headers['x-notify-secret'] !== secret) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end('{"error":"not allowed"}');
      return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size < 8192) chunks.push(c);
    });
    req.on('end', () => {
      let m = {};
      try {
        m = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        /* an empty notice still means "refresh" */
      }
      const note = { type: 'world', kind: str(m.kind, 12) || 'world', ids: Array.isArray(m.ids) ? m.ids.slice(0, 50).map((x) => String(x).slice(0, 40)) : [] };
      let sent = 0;
      for (const p of clients.values()) if (p.hello) (send(p, note), sent++);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, sent }));
    });
    return;
  }
  // The API's "your inbox changed" notices: each goes only to the connections signed in as that account, and carries no message text.
  if (req.url === '/notify-accounts' && req.method === 'POST') {
    if (!SECRET || req.headers['x-notify-secret'] !== SECRET) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end('{"error":"not allowed"}');
      return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size < 262144) chunks.push(chunk);
    });
    req.on('end', () => {
      let events = [];
      try {
        events = JSON.parse(Buffer.concat(chunks).toString('utf8')).events;
      } catch {
        /* nothing to deliver */
      }
      const byAccount = new Map();
      for (const p of clients.values()) if (p.account) (byAccount.get(p.account.id) ?? byAccount.set(p.account.id, []).get(p.account.id)).push(p);
      let delivered = 0;
      for (const e of (Array.isArray(events) ? events : []).slice(0, 500)) {
        if (e?.event?.type !== 'inbox.changed') continue;
        const note = { type: 'inbox.changed', eventId: str(String(e.event.eventId ?? ''), 20), conversationId: str(String(e.event.conversationId ?? ''), 40) };
        for (const p of byAccount.get(Number(e.account)) ?? []) (send(p, note), delivered++);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, delivered }));
    });
    return;
  }
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ uptime: Math.round((Date.now() - startedAt) / 1000), now: Date.now(), players: [...clients.values()].filter((p) => p.hello).map(summary), recentErrors, load: loadSummary() }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('VoxelVenture multiplayer server. See /status.\n');
});

const wss = new WebSocketServer({ server, maxPayload: MAX_MESSAGE });

wss.on('connection', (ws, req) => {
  const forwarded = TRUST_PROXY ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
  const net = netOf((forwarded || req.socket.remoteAddress || '').replace(/^::ffff:/, ''));
  // a browser says which page opened the connection: with MP_ORIGINS set, only those pages may (programs that send no Origin are let in)
  if (ORIGINS.length && req.headers.origin && !ORIGINS.includes(req.headers.origin)) {
    log(c.yellow, 'refuse', `${net} (page ${req.headers.origin} is not in MP_ORIGINS)`);
    ws.close(1008, 'origin not allowed');
    return;
  }
  // refuse connections beyond the limits, so one misbehaving device cannot crowd out the rest
  if (clients.size >= MAX_CLIENTS || [...clients.values()].filter((c2) => c2.net === net).length >= MAX_PER_IP) {
    log(c.yellow, 'refuse', `${net} (too many connections)`);
    ws.close(1013, 'too many connections');
    return;
  }
  const id = nextId++;
  const p = {
    id,
    ws,
    net,
    hello: false,
    name: `Player ${id}`,
    room: null,
    appearance: {},
    x: 0,
    z: 0,
    yaw: 0,
    moving: false,
    emote: null,
    device: {},
    fps: null,
    render: null,
    errors: [],
    errorCount: 0,
    connectedAt: Date.now(),
    lastSeen: Date.now(),
    known: new Map(), // id -> [the version of that player this client was last sent, the tick it was sent on] (the players it can see)
    lastOnline: -1,
    lastOverview: '',
    window: { start: Date.now(), count: 0 },
    account: null, // { id, username, binding } once the API has vouched for a ticket
    guestName: null, // the name the player chose (shown again if they sign out)
    chatAnswers: new Map(), // clientMessageId -> the answer sent (null while the API is checking it)
  };
  clients.set(id, p);
  ws.on('pong', () => (p.lastSeen = Date.now()));

  ws.on('message', (raw) => {
    const now = Date.now();
    if (now - p.window.start > 1000) p.window = { start: now, count: 0 };
    if (++p.window.count > MAX_RATE) return; // flooding: drop the extras
    p.lastSeen = now;
    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!m || typeof m.type !== 'string') return;

    if (m.type === 'hello') {
      // another protocol: say which one this server speaks, and close (a game that sends no `v` is taken to speak this one)
      if (m.v != null && Math.trunc(Number(m.v)) !== PROTOCOL) {
        send(p, { type: 'protocol.unsupported', protocol: PROTOCOL, supported: [PROTOCOL], message: `This server speaks presence protocol ${PROTOCOL}; reload the page to get the current game.` });
        ws.close(4002, 'protocol not supported');
        return;
      }
      // a hello is held to its contract (packages/shared-types, ADR 0004): one that does not fit is answered and goes no further
      const fit = check(PRESENCE_CLIENT.hello, m);
      if (!fit.ok) return send(p, { type: 'invalid', of: 'hello', errors: fit.errors.slice(0, 5) });
      const first = !p.hello;
      const room = str(m.room, 40) || 'default';
      if (p.hello && p.room !== room) p.known = new Map(); // moved to another city: the players there are all new to us (and the old city's players see us go on their next tick)
      if (p.hello && p.room !== room) p.chatAnswers.clear(); // a new city: nothing said in the old one is answered again
      p.hello = true;
      p.guestName = cleanName(m.name);
      p.name = p.account ? p.account.username : p.guestName;
      p.room = room;
      p.appearance = cleanAppearance(m.appearance);
      p.x = num(m.x);
      p.z = num(m.z);
      p.device = { ua: str(m.device?.ua, 200), screen: str(m.device?.screen, 30), touch: Boolean(m.device?.touch), url: str(m.device?.url, 200) };
      touch(p);
      dirtyRooms.add(p.room);
      // who is near comes with the first ticks. `features` says what this server can do (an older client ignores it)
      send(p, { type: 'welcome', protocol: PROTOCOL, id, online: roomSize(p.room), view: VIEW_RADIUS, features: { chat: CHAT_ON ? 2 : 0, accounts: ACCOUNTS, guestChat: GUESTS_CHAT, chatMax: CHAT_MAX, chatRadius: CHAT_RADIUS }, ...(p.account ? { account: { id: p.account.id, username: p.account.username } } : {}) });
      if (first) log(c.green, '+ join ', `${p.name} (#${id}) from ${net}, city ${p.room}, ${p.device.touch ? 'touch' : 'desktop'} ${p.device.screen}`);
      return;
    }
    if (m.type === 'auth' || m.type === 'auth.clear') return handleAuth(p, m); // may come before hello
    if (!p.hello) return;

    if (m.type === 'state') {
      p.x = num(m.x);
      p.z = num(m.z);
      p.yaw = num(m.yaw, 0, 10);
      p.moving = Boolean(m.moving);
      p.emote = m.emote ? str(m.emote, 12) : null;
      p.veh = cleanVeh(m.veh);
      touch(p);
    } else if (m.type === 'parked') {
      // the cars this player left standing: the players who can see them are told (the others get them when they come near)
      p.parked = cleanParked(m.cars);
      for (const o of inRoom(p.room)) if (o !== p && o.known.has(id)) send(o, { type: 'parked', id, cars: p.parked });
    } else if (m.type === 'chat' || m.type === 'chat.send') {
      // spatial chat: heard by the players near this one, once a second at most (`chat` is the old form, with no answer)
      handleChat(p, m, now);
    } else if (m.type === 'profile') {
      const oldName = p.name;
      p.guestName = cleanName(m.name);
      if (!p.account) p.name = p.guestName;
      p.appearance = cleanAppearance(m.appearance);
      announceProfile(p);
      if (oldName !== p.name) log(c.cyan, '~ name ', `${oldName} is now ${p.name}`);
    } else if (m.type === 'perf') {
      p.fps = Math.round(num(m.fps, 0, 1000) * 10) / 10;
      p.render = { calls: Math.round(num(m.calls, 0, 1e7)), triangles: Math.round(num(m.triangles, 0, 1e9)), geometries: Math.round(num(m.geometries, 0, 1e7)), textures: Math.round(num(m.textures, 0, 1e7)) };
    } else if (m.type === 'error') {
      const entry = {
        time: now,
        clientId: id,
        name: p.name,
        net,
        kind: str(m.kind, 30),
        message: str(m.message, 600),
        source: str(m.source, 200),
        stack: str(m.stack, 2000),
        url: str(m.url, 200),
        count: Math.max(1, Math.min(num(m.count, 1), 1e6)),
      };
      p.errorCount += entry.count;
      p.errors.push(entry);
      if (p.errors.length > MAX_CLIENT_ERRORS) p.errors.shift();
      recentErrors.push(entry);
      if (recentErrors.length > MAX_RECENT_ERRORS) recentErrors.shift();
      appendErrorLog(entry);
      if (REPORTED_CLIENT_KINDS.has(entry.kind)) clientReporter.capture({ name: entry.kind, message: entry.message, stack: entry.stack }, { tags: { kind: entry.kind, page: entry.url }, extra: { source: entry.source, count: entry.count } });
      log(c.red, '! error', `${p.name} (#${id}, ${net}) [${entry.kind}] ${entry.message}${entry.count > 1 ? ` (x${entry.count})` : ''}`);
    }
  });

  ws.on('close', () => {
    clients.delete(id);
    if (p.hello) {
      dirtyRooms.add(p.room);
      log(c.yellow, '- leave', `${p.name} (#${id})`); // the players who could see us are told on the next tick (exit)
    }
  });
  ws.on('error', () => {});
});

// Who each player sees, ten times a second (protocol 2). Four things keep this cheap however many people are connected:
//  - the players of a city are put in a grid of VIEW_RADIUS cells, so finding who is near costs a few cells, not the whole city;
//  - a client is told about at most MAX_VISIBLE of them, the nearest, so a crowd cannot make one client's messages grow;
//  - after the first sight of a player (`enter`), only what changed is sent, and nothing at all when nobody moved;
//  - a client whose connection is backed up (a phone on a bad link) is skipped until it catches up, so one slow client cannot make the
//    server's memory grow or delay everyone else.
const cellOf = (v) => Math.floor(v / VIEW_RADIUS);
const cellKey = (cx, cz) => (cx + 2048) * 4096 + (cz + 2048); // a number, not a string: this runs for every player every tick
const roomSize = (room) => [...clients.values()].filter((q) => q.hello && q.room === room).length;
const REFRESH_EVERY = 3; // who is near a player is worked out every third tick (a walker covers about a metre in that time); movement goes out every tick
const VIEW2 = VIEW_RADIUS * VIEW_RADIUS;
const EXIT2 = EXIT_RADIUS * EXIT_RADIUS;

// The players near `p`, the nearest MAX_VISIBLE of them: looked up in the grid cells round it.
function findNear(p, grid) {
  const out = [];
  const dist = [];
  const cx = cellOf(p.x);
  const cz = cellOf(p.z);
  for (let gx = cx - 1; gx <= cx + 1; gx++) {
    for (let gz = cz - 1; gz <= cz + 1; gz++) {
      const cell = grid.get(cellKey(gx, gz));
      if (!cell) continue;
      for (let i = 0; i < cell.length; i++) {
        const o = cell[i];
        if (o === p) continue;
        const dx = o.x - p.x;
        const dz = o.z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 <= (p.known.has(o.id) ? EXIT2 : VIEW2)) {
          out.push(o);
          dist.push(d2);
        }
      }
    }
  }
  if (out.length <= MAX_VISIBLE) return out;
  return out
    .map((_, i) => i)
    .sort((u, v) => dist[u] - dist[v])
    .slice(0, MAX_VISIBLE)
    .map((i) => out[i]);
}

function tick() {
  const t0 = performance.now();
  tickNumber++;
  const rooms = new Map();
  for (const p of clients.values()) if (p.hello) (rooms.get(p.room) ?? rooms.set(p.room, []).get(p.room)).push(p);
  for (const players of rooms.values()) {
    // the grid of this city
    const grid = new Map();
    for (const o of players) {
      const key = cellKey(cellOf(o.x), cellOf(o.z));
      const cell = grid.get(key);
      if (cell) cell.push(o);
      else grid.set(key, [o]);
    }
    for (const p of players) {
      if (p.ws.readyState !== 1 || p.ws.bufferedAmount > MAX_BUFFERED) continue;
      if (!p.near || (tickNumber + p.id) % REFRESH_EVERY === 0 || p.nearRoom !== p.room) {
        p.near = findNear(p, grid);
        p.nearRoom = p.room;
      }
      const enter = [];
      const changed = [];
      const seen = new Set();
      for (const o of p.near) {
        if (clients.get(o.id) !== o || o.room !== p.room) continue; // left since the list was made
        seen.add(o.id);
        const known = p.known.get(o.id);
        if (known === undefined) {
          enter.push(publicPlayer(o));
          p.known.set(o.id, [o.ver, tickNumber]);
        } else if (known[0] !== o.ver) {
          const dx = o.x - p.x;
          const dz = o.z - p.z;
          const d2 = dx * dx + dz * dz;
          const every = d2 < NEAR_RADIUS * NEAR_RADIUS ? 1 : d2 < MID_RADIUS * MID_RADIUS ? 2 : 4; // far players are sent less often
          if (tickNumber - known[1] >= every) {
            changed.push(o.json);
            known[0] = o.ver;
            known[1] = tickNumber;
          }
        }
      }
      let exit = null;
      for (const id of p.known.keys()) {
        if (!seen.has(id)) {
          (exit ??= []).push(id);
          p.known.delete(id);
        }
      }
      if (!enter.length && !changed.length && !exit) continue;
      sendRaw(p, `{"type":"snapshot","players":[${changed.join(',')}]${enter.length ? `,"enter":${JSON.stringify(enter)}` : ''}${exit ? `,"exit":${JSON.stringify(exit)}` : ''}}`);
    }
  }
  const ms = performance.now() - t0;
  metrics.ticks++;
  metrics.tickMsTotal += ms;
  metrics.tickMsMax = Math.max(metrics.tickMsMax, ms);
  metrics.tickMsRecent.push(ms);
  if (metrics.tickMsRecent.length > 100) metrics.tickMsRecent.shift();
}
setInterval(tick, TICK_MS);

// How many are in each city (the "online" count) and where everyone is, coarsely, for the world map (the same short list goes to all of them: the map
// draws the ones it is not already showing as full players). Sent at once when someone joins or leaves, and every couple of seconds otherwise.
const dirtyRooms = new Set();
function sendOverview(players) {
  const n = players.length;
  const step = Math.max(1, Math.ceil(n / OVERVIEW_DOTS));
  const dots = [];
  for (let i = 0; i < n; i += step) dots.push([players[i].id, Math.round(players[i].x / 2) * 2, Math.round(players[i].z / 2) * 2]);
  const body = JSON.stringify({ type: 'online', n, dots: n > 1 ? dots : [] });
  for (const p of players) {
    if (p.ws.readyState !== 1 || p.ws.bufferedAmount > MAX_BUFFERED) continue;
    if (p.lastOverview === body) continue; // nobody moved: nothing new to say
    p.lastOverview = body;
    sendRaw(p, body);
  }
}
const playersByRoom = () => {
  const rooms = new Map();
  for (const p of clients.values()) if (p.hello) (rooms.get(p.room) ?? rooms.set(p.room, []).get(p.room)).push(p);
  return rooms;
};
setInterval(() => {
  dirtyRooms.clear();
  for (const players of playersByRoom().values()) sendOverview(players);
}, OVERVIEW_MS);
setInterval(() => {
  if (!dirtyRooms.size) return;
  const rooms = playersByRoom();
  for (const room of dirtyRooms) if (rooms.has(room)) sendOverview(rooms.get(room));
  dirtyRooms.clear();
}, TICK_MS);

// Once a second: the per-second figures for /status.
setInterval(() => {
  const now = Date.now();
  const secs = (now - metrics.windowStart) / 1000;
  metrics.bytesPerSec = Math.round(metrics.bytesOut / secs);
  metrics.messagesPerSec = Math.round(metrics.messagesOut / secs);
  metrics.bytesOut = 0;
  metrics.messagesOut = 0;
  metrics.windowStart = now;
  // how much of one processor the server is using (Node runs this on one thread: near 100 means it is at its limit)
  const cpu = process.cpuUsage();
  const at = performance.now();
  metrics.cpuPct = Math.round((((cpu.user - lastCpu.user) + (cpu.system - lastCpu.system)) / 1000 / (at - lastCpuAt)) * 1000) / 10;
  lastCpu = cpu;
  lastCpuAt = at;
}, 1000).unref();

function loadSummary() {
  const recent = metrics.tickMsRecent;
  const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const sorted = [...recent].sort((a, b) => a - b);
  return {
    clients: [...clients.values()].filter((p) => p.hello).length,
    tickMsAvg: Math.round(avg * 100) / 100,
    tickMsP95: Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 100) / 100,
    tickMsMax: Math.round(metrics.tickMsMax * 100) / 100,
    tickBudgetMs: TICK_MS,
    bytesPerSec: metrics.bytesPerSec,
    messagesPerSec: metrics.messagesPerSec,
    cpuPct: metrics.cpuPct,
    loopDelayP99Ms: Math.round((loopDelay.percentile(99) / 1e6) * 10) / 10,
    rssMB: Math.round(process.memoryUsage().rss / 1048576),
  };
}

// drop connections that went silent (a phone that left the Wi-Fi)
setInterval(() => {
  const now = Date.now();
  for (const p of clients.values()) {
    if (now - p.lastSeen > 20000) p.ws.terminate();
    else if (p.ws.readyState === 1) p.ws.ping();
  }
}, 5000);

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${PORT} is already in use (is the multiplayer server already running?)` : error.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  log(c.cyan, 'server', `VoxelVenture multiplayer on ${HOST}:${PORT} (protocol ${PROTOCOL}, up to ${MAX_CLIENTS} clients)`);
  log(c.cyan, 'server', `status:  http://localhost:${PORT}/status   health: /health   error log: services/multiplayer/logs/client-errors.jsonl`);
});

// Ctrl+C / kill: tell everyone goodbye, then stop.
function shutdown(signal) {
  log(c.yellow, 'server', `${signal}: shutting down`);
  for (const p of clients.values()) p.ws.close(1001, 'server stopping');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
// a bug in one message handler must not take everyone's game down
process.on('uncaughtException', (error) => {
  log(c.red, 'bug   ', error.stack ?? String(error));
  serverReporter.capture(error, { tags: { kind: 'uncaughtException' } });
});
