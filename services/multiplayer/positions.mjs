// Presence-verified positions (docs/architecture/presence_positions.md): what the presence server does with the positions it is sent, beyond relaying them.
//
//   1. VALIDATES every position a connection reports (lib/world/movement.js): speed by mode, bounds, teleports. Soft by default: what is relayed to other players does not change, the
//      violations are only recorded and withheld from rewards. PRESENCE_ENFORCE=1 also clamps what is relayed to the last verified position.
//   2. For SIGNED-IN accounts in the reward city: samples the verified position twice a second into DERIVED events (lib/world/presenceTracker.js: where, which road, round which place, how
//      far), batches them and posts them to the API (POST /internal/presence/events), which keeps them a few days and checks task goals against them. Raw tracks are never kept or sent.
//   3. Watches how each signed-in account moves (lib/world/antibot.js) and tells the API the accounts whose score is over zero, every half minute (POST /internal/presence/summary). The API holds
//      task rewards back from an account at or over the review score. Nothing here bans or blocks anyone.
//
// Settings (environment variables; all optional):
//   PRESENCE_TRACK        0 switches all of this off (default: on when accounts are set up, off otherwise: there is nobody to credit)
//   PRESENCE_ENFORCE      1 clamps the relayed position of a connection that moved impossibly to its last verified one (default 0: only record)
//   PRESENCE_REWARD_SEED  the city seed that counts (default API_SEED, or 20260101): only players in that city feed rewards
//   PRESENCE_FLUSH_MS, PRESENCE_SUMMARY_MS   how often the events (default 5000) and the flags (default 30000) go to the API; only the tests change them
import { imp } from '../../scripts/lib-loader.mjs';

const { generateTown } = await imp('city/townExtension.js');
const { buildPlaceGeometry } = await imp('world/placeGeometry.js');
const { newMovement, step, modeOf } = await imp('world/movement.js');
const { createTracker } = await imp('world/presenceTracker.js');
const { createAntibot, REVIEW_SCORE } = await imp('world/antibot.js');
const { SPEED_CAP } = await imp('world/movement.js');
const { phaseAt } = await imp('game/taskRules.js');

export const SAMPLE_MS = 500;
export const FLUSH_MS = Math.max(500, Number(process.env.PRESENCE_FLUSH_MS || 5000)); // how often events go to the API (PRESENCE_FLUSH_MS: the tests shorten it)
export const SUMMARY_MS = Math.max(1000, Number(process.env.PRESENCE_SUMMARY_MS || 30000)); // and the flags (PRESENCE_SUMMARY_MS)
export const ALIVE_MS = 30000; // a connection that has said nothing for this long is not credited
const MAX_BUFFER = 5000;
const MAX_BATCH = 500;

/**
 * @param {{ callApi: (route: string, body: object) => Promise<{status: number, data: object}>, clients: () => Iterable<object>, enabled: boolean, enforce?: boolean, rewardRoom: string, log?: (text: string) => void, now?: () => number }} o
 */
export function createPositions({ callApi, clients, enabled, enforce = false, rewardRoom, log = () => {}, now = Date.now }) {
  const state = { ready: false, eventsSent: 0, eventsDropped: 0, batches: 0, summaries: 0, violations: { too_fast: 0, teleport: 0, out_of_bounds: 0, bad: 0 }, lastFlushAt: 0, lastError: null };
  let geometry = null, tracker = null;
  const antibot = createAntibot({ speedCap: SPEED_CAP });
  const lastVerified = new Map(); // accountId -> { x, z, at } across connections (for a "hop": a new connection far from where the account last was)
  const buffer = [];
  let flagged = 0;

  // the geometry is built after start-up (the city takes a few hundred milliseconds), the rest works without it meanwhile
  function init() {
    if (!enabled || geometry) return;
    setImmediate(() => {
      try {
        geometry = buildPlaceGeometry(generateTown(Number(rewardRoom)));
        tracker = createTracker({ geometry, phaseAt });
        state.ready = true;
        log(`positions: tracking accounts in city ${rewardRoom} (${geometry.places.length} places, ${geometry.roads.size} roads)${enforce ? ', clamping what is relayed' : ', soft mode: recording only'}`);
      } catch (error) {
        state.lastError = String(error?.message ?? error);
        log(`positions: could not build the city ${rewardRoom}: ${state.lastError}`);
      }
    });
  }

  const posOf = (p) => (p.pos ??= { mv: newMovement(), conn: `c${p.id}`, lastState: 0, violations: 0 });
  const tracked = (p) => enabled && state.ready && p.hello && p.account && p.room === rewardRoom;

  /** A `state` message was just applied to `p` (p.x, p.z, p.veh, p.moving). Validates it; in enforce mode puts the verified position back. */
  function onState(p, t = now()) {
    if (!enabled || !state.ready) return;
    const pos = posOf(p);
    const r = step(pos.mv, { x: p.x, z: p.z, veh: p.veh }, t, { inBounds: (x, z) => geometry.inBounds(x, z) });
    pos.lastState = t;
    if (!r.ok) { pos.violations++; state.violations[r.kind] = (state.violations[r.kind] ?? 0) + 1; if (enforce && r.verified) { p.x = r.verified.x; p.z = r.verified.z; } }
    if (tracked(p)) antibot.message(p.account.id, pos.conn, t, { x: p.x, z: p.z, moving: Boolean(p.moving), mode: r.verified?.mode ?? modeOf(p.veh), kind: r.kind, speed: r.speed });
  }

  /** A connection said hello (it starts, or moves to another city): its checks start again. A start far from where its account last was, soon after, is a "hop". */
  function onHello(p, t = now()) {
    if (!enabled) return;
    const pos = posOf(p);
    pos.mv = newMovement();
    pos.lastState = t;
    if (tracked(p)) {
      const last = lastVerified.get(p.account.id);
      antibot.connected(p.account.id, t, { distance: last ? Math.hypot(p.x - last.x, p.z - last.z) : 0, sinceMs: last ? t - last.at : Infinity });
      tracker?.begin(p.account.id, t);
    }
  }
  /** The connection signed in (or out) after saying hello. */
  function onBind(p, t = now()) { if (tracked(p)) { posOf(p); tracker?.begin(p.account.id, t); } }
  function onClose(p, t = now()) {
    const id = p.account?.id;
    if (!id) return;
    const v = p.pos?.mv?.verified;
    if (v) lastVerified.set(id, { x: v.x, z: v.z, at: t });
    antibot.disconnected(id, p.pos?.conn);
    const others = [...clients()].some((o) => o !== p && o.account?.id === id && o.hello);
    if (!others) tracker?.forget(id);
  }

  // twice a second: the verified position of each signed-in account in the reward city becomes derived events
  function sampleAll(t = now()) {
    if (!enabled || !state.ready) return;
    const primary = new Map(); // one connection feeds an account's events: the one that spoke last (a second is a flag, not a second stream)
    for (const p of clients()) {
      if (!tracked(p) || !p.pos?.mv.verified || p.ws?.readyState !== 1 || t - p.lastSeen > ALIVE_MS) continue;
      const cur = primary.get(p.account.id);
      if (!cur || p.pos.lastState > cur.pos.lastState) primary.set(p.account.id, p);
    }
    for (const [id, p] of primary) {
      const v = p.pos.mv.verified;
      for (const ev of tracker.sample(id, { x: v.x, z: v.z, mode: v.mode }, t)) {
        antibot.event(id, ev);
        buffer.push({ accountId: id, ...ev });
      }
      lastVerified.set(id, { x: v.x, z: v.z, at: t });
    }
    if (buffer.length > MAX_BUFFER) { const drop = buffer.length - MAX_BUFFER; buffer.splice(0, drop); state.eventsDropped += drop; }
  }

  // to the API: the events in batches, and the flags every half minute
  async function flush() {
    while (buffer.length) {
      const batch = buffer.slice(0, MAX_BATCH);
      const { status } = await callApi('/internal/presence/events', { events: batch });
      if (status !== 200) { state.lastError = `the API answered ${status} to the events`; return; }
      buffer.splice(0, batch.length);
      state.eventsSent += batch.length;
      state.batches++;
      state.lastFlushAt = now();
    }
  }
  async function summarize(t = now()) {
    const { flagged: list, cleared } = antibot.summarize(t);
    flagged = list.length;
    if (!list.length && !cleared.length) return;
    const { status } = await callApi('/internal/presence/summary', { flagged: list, cleared, reviewScore: REVIEW_SCORE });
    if (status === 200) state.summaries++;
    else state.lastError = `the API answered ${status} to the flags`;
  }

  const timers = [];
  function start() {
    if (!enabled) return;
    init();
    for (const [fn, ms] of [[() => sampleAll(), SAMPLE_MS], [() => flush().catch(() => {}), FLUSH_MS], [() => summarize().catch(() => {}), SUMMARY_MS]]) timers.push(setInterval(fn, ms).unref());
  }
  const stop = () => { for (const t of timers) clearInterval(t); timers.length = 0; };

  const status = () => ({ enabled, enforce, rewardRoom, ready: state.ready, tracking: tracker?.size() ?? 0, pending: buffer.length, flagged, ...state, violations: { ...state.violations } });
  return { start, stop, init, onState, onHello, onBind, onClose, sampleAll, flush, summarize, status, antibot, tracker: () => tracker, geometry: () => geometry };
}
