import { create } from 'zustand';
import { avatarState } from '../sim/avatarState';
import { useCityStore } from '../state/store';
import { useFleet } from '../state/fleetStore';
import { perfStats } from '../dev/perfStats';
import { apiOn } from '../data/api';
import { messagingTicket, newClientId } from '../data/messaging';
import { useAccount } from '../state/accountStore';
import { usePanel } from '../state/panelStore';
import { clearNearby, failPendingNearby, inboxChanged, nearbyAnswer, nearbyFailed, nearbyHeard, nearbyPending, resetPrivate, setPresence, useChat } from '../state/chatStore';

// Client side of the LAN multiplayer + diagnostics server (server/multiplayer.mjs).
//
//   - Presence: sends where the avatar is (ten times a second while it changes) and keeps `remotePlayers`
//     up to date with the players near you (the server only tells you about those: protocol 2). The 3D side (components/city/RemotePlayers.jsx) reads
//     the map every frame; React only hears about joins, leaves and profile changes (`useNet.players`).
//   - Diagnostics: reports this client's device, frame rate and every error (window errors, unhandled
//     promise rejections, console.error), so the server sees what each connected device is hitting.
//   - Chat: nearby lines (`sendNearby`, each with its own id and an accepted / rejected answer) and, when signed in, a one-use
//     ticket from the API that makes this connection speak as the account. What is heard goes to lib/state/chatStore.js.
//
// The server address is NEXT_PUBLIC_MP_URL, or port 3001 on the machine that served the page, so a phone
// that opened http://<pc-ip>:3000 talks to ws://<pc-ip>:3001 without any setup.

export const remotePlayers = new Map(); // the players NEAR you: id -> { id, name, appearance, x, z, yaw, moving, emote, veh, tx, tz, tyaw, fresh }
export const remoteDots = { list: [] }; // everyone else in the city, coarsely, for the world map: [[id, x, z]] (the server sends it every couple of seconds)

// Callbacks the live-data layer fills in: the server says the world changed (a claim, an ad bought): refresh now.
// The cars other players left parked, flattened: [{ owner, x, z, yaw, color }].
export const remoteParkedCars = () => [...remotePlayers.values()].flatMap((p) => (p.parked ?? []).map((c, i) => ({ owner: p.id, i, ...c })));

export const netHooks = { onWorld: null };

export const useNet = create(() => ({
  status: 'offline', // 'offline' | 'connecting' | 'online'
  myId: null,
  name: '',
  room: '',
  players: [], // the players near you: [{ id, name, appearance, account, verified }] for the UI and for mounting avatars
  online: 0, // how many are in this city altogether (the server counts them)
  parkedV: 0, // changes whenever someone's parked cars change (the 3D side redraws them)
  url: '',
}));

const NAME_KEY = 'voxelventure-name';
const MAX_QUEUED_ERRORS = 30;

const net = { fpsToken: 0, ws: null, timer: null, retry: 1000, stopped: true, queue: [], sentRoom: null, sentProfile: '', lastState: '', lastSentAt: 0 };

// With a crowd, cities can be spread over several presence servers: NEXT_PUBLIC_MP_URLS lists them (comma separated) and a city always goes to the
// same one (a hash of its name), so everyone in a city meets on one server.
export const pickServer = (urls, roomName) => {
  let h = 0;
  for (const ch of String(roomName)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return urls[h % urls.length];
};
function serverUrl() {
  const many = (process.env.NEXT_PUBLIC_MP_URLS || '').split(',').map((u) => u.trim()).filter(Boolean);
  if (many.length) return pickServer(many, room());
  if (process.env.NEXT_PUBLIC_MP_URL) return process.env.NEXT_PUBLIC_MP_URL;
  const secure = window.location.protocol === 'https:';
  const port = new URLSearchParams(window.location.search).get('mp') || '3001'; // ?mp=3995 picks another server port
  return `${secure ? 'wss' : 'ws'}://${window.location.hostname}:${/^\d{2,5}$/.test(port) ? port : '3001'}`;
}

export function getPlayerName() {
  try {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) return saved;
    const made = `Player-${Math.floor(Math.random() * 9000 + 1000)}`;
    localStorage.setItem(NAME_KEY, made);
    return made;
  } catch {
    return 'Player';
  }
}

export function setPlayerName(name) {
  const clean = name.replace(/[^\w .-]/g, '').trim().slice(0, 20) || 'Player';
  try {
    localStorage.setItem(NAME_KEY, clean);
  } catch {
    /* storage unavailable: the name lasts for this visit only */
  }
  useNet.setState({ name: clean });
  sendProfile();
}

const send = (message) => {
  if (net.ws && net.ws.readyState === 1) {
    net.ws.send(JSON.stringify(message));
    return true;
  }
  return false;
};

const room = () => String(useCityStore.getState().layout.seed);
const profile = () => ({ name: useNet.getState().name || getPlayerName(), appearance: useCityStore.getState().appearance });
const device = () => ({
  ua: navigator.userAgent,
  screen: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}`,
  touch: window.matchMedia('(pointer: coarse)').matches,
  url: window.location.pathname,
});

function sendHello() {
  const p = profile();
  if (net.sentRoom !== null && net.sentRoom !== room()) clearNearby(); // another city: the old one's chat does not come along
  send({ type: 'hello', v: 2, ...p, room: room(), x: avatarState.x, z: avatarState.z, device: device() });
  net.sentRoom = room();
  net.parkedSig = null; // (re)send our parked cars after every hello
  net.sentProfile = JSON.stringify(p);
  remotePlayers.clear();
  remoteDots.list = [];
  useNet.setState({ players: [], room: room(), parkedV: useNet.getState().parkedV + 1 });
}

function sendProfile() {
  const p = profile();
  const key = JSON.stringify(p);
  if (key === net.sentProfile) return;
  net.sentProfile = key;
  send({ type: 'profile', ...p });
}

// --- diagnostics -------------------------------------------------------------------------------------
let lastError = { key: '', time: 0, suppressed: 0 };

// Errors thrown by code the browser or an extension injected into the page (a crypto wallet, a translator, an
// ad blocker), not by the app. They are still reported, but labelled so they are not mistaken for app bugs.
const INJECTED = /window\.ethereum|window\.solana|chrome-extension:|moz-extension:|safari-web-extension:|safari-extension:/;

export function reportError(entry) {
  const full = { type: 'error', url: window.location.pathname, ...entry };
  if (INJECTED.test(`${full.message} ${full.stack ?? ''} ${full.source ?? ''}`)) full.kind = 'injected';
  else if (/context lost|webgl context|gpu context/i.test(String(full.message))) full.kind = 'gpu'; // the graphics card took the 3D view away: not an app bug (see components/city/GpuGuard.jsx)
  // the same error firing every frame is one report with a count, not thousands of messages
  const key = `${full.kind}|${full.message}`;
  const now = Date.now();
  if (key === lastError.key && now - lastError.time < 1500) {
    lastError.suppressed++;
    return;
  }
  full.count = 1 + (key === lastError.key ? lastError.suppressed : 0);
  lastError = { key, time: now, suppressed: 0 };
  if (!send(full)) {
    net.queue.push(full);
    if (net.queue.length > MAX_QUEUED_ERRORS) net.queue.shift();
  }
}

let reporting = false;
function installErrorReporting() {
  if (reporting) return;
  reporting = true;
  window.addEventListener(
    'error',
    (e) => {
      if (e.target && e.target !== window && (e.target.src || e.target.href)) {
        // a resource (script, image, stylesheet) failed to load
        reportError({ kind: 'resource', message: `failed to load <${String(e.target.tagName).toLowerCase()}> ${e.target.src || e.target.href}` });
        return;
      }
      let stack = e.error?.stack;
      if (!e.error && /^Script error\.?$/.test(e.message || '')) {
        // The browser hides errors thrown by scripts from another origin. Say which other origins this page loaded things from.
        const others = [...new Set(performance.getEntriesByType('resource').map((r) => r.name).filter((n) => { try { return new URL(n).origin !== window.location.origin; } catch { return false; } }).map((n) => new URL(n).origin))];
        stack = `The browser hid the details (an error in a script from another origin).
Other origins this page loaded from: ${others.join(', ') || 'none seen'}`;
      }
      reportError({ kind: 'error', message: e.message || String(e.error), source: `${e.filename || ''}:${e.lineno || 0}:${e.colno || 0}`, stack });
    },
    true
  );
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    reportError({ kind: 'unhandledrejection', message: r?.message ?? String(r), stack: r?.stack });
  });
  const original = console.error;
  let inside = false;
  console.error = (...args) => {
    original.apply(console, args);
    if (inside) return;
    inside = true;
    try {
      const text = args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ''}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      reportError({ kind: 'console.error', message: text.slice(0, 600), stack: args.find((a) => a instanceof Error)?.stack });
    } catch {
      /* never let reporting cause an error */
    } finally {
      inside = false;
    }
  };
}

function startFpsReports() {
  const token = ++net.fpsToken; // only the newest loop keeps running (React may start us twice in development)
  let frames = 0;
  let first = true; // the first reading comes quickly, the rest every five seconds
  let since = performance.now();
  const tick = (now) => {
    frames++;
    if (now - since >= (first ? 1500 : 5000)) {
      first = false;
      send({ type: 'perf', fps: (frames * 1000) / (now - since), ...perfStats });
      frames = 0;
      since = now;
    }
    if (!net.stopped && token === net.fpsToken) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// --- connection ---------------------------------------------------------------------------------------
function connect() {
  if (net.stopped) return;
  const url = serverUrl();
  useNet.setState({ status: 'connecting', url });
  let ws;
  try {
    ws = new WebSocket(url);
  } catch {
    scheduleRetry();
    return;
  }
  net.ws = ws;
  ws.onopen = () => {
    net.retry = 1000;
    useNet.setState({ status: 'online' });
    sendHello();
    for (const e of net.queue.splice(0)) send(e);
  };
  ws.onmessage = (event) => {
    let m;
    try {
      m = JSON.parse(event.data);
    } catch {
      return;
    }
    handle(m);
  };
  ws.onclose = () => {
    net.ws = null;
    remotePlayers.clear();
    useNet.setState({ status: 'offline', players: [], myId: null });
    failPendingNearby('Not sent: the connection dropped.');
    setPresence({ presenceAccount: null });
    scheduleRetry();
  };
  ws.onerror = () => {};
}

function scheduleRetry() {
  if (net.stopped) return;
  clearTimeout(net.timer);
  net.timer = setTimeout(connect, net.retry);
  net.retry = Math.min(net.retry * 1.7, 10000);
}

const listOf = () => [...remotePlayers.values()].map((p) => ({ id: p.id, name: p.name, appearance: p.appearance, account: p.account ?? null, verified: Boolean(p.verified) }));

// --- signing the connection in -----------------------------------------------------------------------------------------------------
// When the player is signed in to the API, the presence server is handed a one-use ticket so this connection speaks as the account
// (its name and the verified mark come from the account). Signing out clears it. A ticket is never put in an address.
async function authenticate() {
  if (!net.ws || net.ws.readyState !== 1) return;
  const account = useAccount.getState().account;
  const bound = useChat.getState().presenceAccount;
  if (!apiOn() || !useChat.getState().features?.accounts) return;
  if (!account) {
    if (bound) send({ type: 'auth.clear' });
    return;
  }
  if (bound?.id === account.id) return;
  try {
    const { ticket } = await messagingTicket();
    send({ type: 'auth', ticket });
  } catch {
    /* signed out meanwhile, or the API is down: the next connection or sign-in tries again */
  }
}
let lastAccountId = null;
function watchAccount() {
  return useAccount.subscribe((s) => {
    const id = s.account?.id ?? null;
    if (id === lastAccountId) return;
    if (lastAccountId !== null) resetPrivate(); // signed out, or in as someone else: nothing private stays on screen
    lastAccountId = id;
    authenticate();
  });
}

const seeingNearby = () => usePanel.getState().view === 'chat' && useChat.getState().tab === 'nearby' && document.visibilityState === 'visible';

function addPlayer(p) {
  remotePlayers.set(p.id, { ...p, tx: p.x, tz: p.z, tyaw: p.yaw, fresh: true });
}

const bump = () => useNet.getState().parkedV + 1;

function handle(m) {
  if (m.type === 'welcome') {
    remotePlayers.clear();
    remoteDots.list = [];
    useNet.setState({ myId: m.id, players: [], online: Number(m.online) || 1, parkedV: bump() });
    setPresence({ features: m.features ?? null, presenceAccount: m.account ?? null });
    authenticate();
  } else if (m.type === 'snapshot') {
    // who came into view, who left it, and what changed (protocol 2: only the players near you are ever sent)
    let listChanged = false;
    for (const p of m.enter ?? []) {
      addPlayer(p);
      listChanged = true;
    }
    for (const id of m.exit ?? []) {
      if (remotePlayers.delete(id)) listChanged = true;
    }
    for (const sn of m.players ?? []) {
      // a changed player is a short array: [id, x, z, yaw, moving, emote or 0, vehicle or 0]
      const p = remotePlayers.get(sn[0]);
      if (!p) continue;
      p.tx = sn[1];
      p.tz = sn[2];
      p.tyaw = sn[3];
      p.moving = Boolean(sn[4]);
      p.emote = sn[5] || null;
      p.veh = sn[6] ? { kind: sn[6][0], boatKind: sn[6][1], color: sn[6][2] } : null;
    }
    if (listChanged) useNet.setState({ players: listOf(), parkedV: bump() });
  } else if (m.type === 'online') {
    remoteDots.list = Array.isArray(m.dots) ? m.dots : [];
    if (useNet.getState().online !== m.n) useNet.setState({ online: Number(m.n) || 1 });
  } else if (m.type === 'parked') {
    const p = remotePlayers.get(m.id);
    if (p) {
      p.parked = Array.isArray(m.cars) ? m.cars : [];
      useNet.setState({ parkedV: bump() });
    }
  } else if (m.type === 'profile') {
    const p = remotePlayers.get(m.player.id);
    if (p) {
      p.name = m.player.name;
      p.appearance = m.player.appearance;
      p.account = m.player.account ?? null;
      p.verified = Boolean(m.player.verified);
      useNet.setState({ players: listOf() });
    }
  } else if (m.type === 'world') {
    netHooks.onWorld?.(m);
  } else if (m.type === 'chat') {
    if (useChat.getState().hidden[m.id]) return; // a player hidden for this visit
    nearbyHeard(m, useNet.getState().myId, seeingNearby());
  } else if (m.type === 'chat.accepted' || m.type === 'chat.rejected') {
    nearbyAnswer(m);
  } else if (m.type === 'inbox.changed') {
    inboxChanged(String(m.conversationId ?? ''));
  } else if (m.type === 'auth.ok') {
    setPresence({ presenceAccount: m.account });
  } else if (m.type === 'auth.revoked') {
    setPresence({ presenceAccount: null });
    // the sign-in ended elsewhere (signed out, expired, suspended): check it, and sign this game in again if it is still good
    if (m.reason === 'expired' && useAccount.getState().account) useAccount.getState().hydrate().then(authenticate);
  } else if (m.type === 'auth.failed') {
    if (m.code === 'rate_limited') setTimeout(authenticate, 1500);
  }
}

// Called on a timer: send our position when it changed (and now and then regardless, as a heartbeat).
function pump() {
  if (!net.ws || net.ws.readyState !== 1) return;
  if (room() !== net.sentRoom) sendHello(); // the city changed (loaded a save, or regenerated)
  else sendProfile();
  // the cars we left parked (sent when they change, and again when the connection or the city changes)
  const parkedSig = JSON.stringify(useFleet.getState().parked.slice(0, 3).map((c) => [Math.round(c.x * 10), Math.round(c.z * 10), c.color]));
  if (parkedSig !== net.parkedSig || net.sentRoomForParked !== net.sentRoom) {
    net.parkedSig = parkedSig;
    net.sentRoomForParked = net.sentRoom;
    send({ type: 'parked', cars: useFleet.getState().parked.slice(0, 3).map((c) => ({ x: c.x, z: c.z, yaw: c.yaw, color: c.color })) });
  }
  if (!avatarState.ready) return;
  const state = `${avatarState.x.toFixed(2)},${avatarState.z.toFixed(2)},${avatarState.yaw.toFixed(2)},${avatarState.moving ? 1 : 0},${avatarState.emote?.name ?? ''},${avatarState.vehicle ? `${avatarState.vehicle.kind}${avatarState.vehicle.boatKind ?? ''}${avatarState.vehicle.color}` : ''}`;
  const now = Date.now();
  if (state === net.lastState && now - net.lastSentAt < 2000) return;
  net.lastState = state;
  net.lastSentAt = now;
  send({ type: 'state', x: avatarState.x, z: avatarState.z, yaw: avatarState.yaw, moving: avatarState.moving, emote: avatarState.emote?.name ?? null, veh: avatarState.vehicle ? { kind: avatarState.vehicle.kind, boatKind: avatarState.vehicle.boatKind, color: avatarState.vehicle.color } : null });
}

export function startNet() {
  if (!net.stopped) return () => {};
  net.stopped = false;
  useNet.setState({ name: getPlayerName() });
  installErrorReporting();
  startFpsReports();
  connect();
  const interval = setInterval(pump, 100);
  lastAccountId = useAccount.getState().account?.id ?? null;
  const unwatch = watchAccount();
  return () => {
    net.stopped = true;
    unwatch();
    clearInterval(interval);
    clearTimeout(net.timer);
    net.ws?.close();
    net.ws = null;
    remotePlayers.clear();
  };
}

// Say something to the players nearby. It shows at once as "Sending"; the server answers accepted (it went out) or rejected (with
// why: too fast, not allowed, sign in). Returns false when there was nothing to say. `clientMessageId` is reused by Retry, so a line
// that did go out is not said twice. Nothing is queued: a line that could not be sent is marked failed, never sent later on its own.
export function sendNearby(text, clientMessageId = newClientId()) {
  const max = useChat.getState().features?.chatMax ?? 140;
  const t = [...String(text ?? '').replace(/\s+/g, ' ').trim()].slice(0, max).join('');
  if (!t) return false;
  nearbyPending(clientMessageId, t);
  if (!net.ws || net.ws.readyState !== 1) {
    nearbyFailed(clientMessageId, 'Not sent: you are offline.');
    return true;
  }
  if (useChat.getState().features?.chat === 2) send({ type: 'chat.send', clientMessageId, channel: 'nearby', text: t });
  else send({ type: 'chat', text: t }); // an older server: no answer comes, the line comes back like anyone else's
  return true;
}
export function retryNearby(clientMessageId) {
  const line = useChat.getState().nearby.find((l) => l.clientMessageId === clientMessageId);
  if (line) sendNearby(line.text, clientMessageId);
}
