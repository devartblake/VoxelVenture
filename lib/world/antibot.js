// Does this account move like a person? (docs/architecture/presence_positions.md, "Anti-bot".) Pure: the presence server tells it about every position message of every signed-in connection
// and about the events the tracker makes, and asks for a score now and then. It only OBSERVES and SCORES: it never bans and never blocks. The API holds an account's task rewards back
// while its score is at or over REVIEW_SCORE (it answers "under review", and the task stays collectable if the flag clears), and an admin can clear a flag.
//
// What is NOT a signal, because a person does it too: moving at the top speed (in this game holding a key is exactly the top speed), moving in straight lines (the streets are straight), and
// turning sharply (keys turn at once). So no single signal here is enough; the weights add up, and it takes about two of the strong ones to reach the threshold.
//
// Signals, with their weights (the thresholds are the constants below; docs/architecture/presence_positions.md explains how to tune them):
//   teleports            'teleport' / 'too_fast' reports from the movement validator: 3+ in ten minutes 30, 10+ 60
//   hops                 a new connection starting 40+ units from where the account was last verified, within ten minutes: 4+ in half an hour 30, 10+ 60 (reloading to land somewhere new)
//   multi_connection     two connections of one account both moving at the same moment, for about twenty seconds in all: 40
//   marathon             no gap of ten minutes in 12 hours of activity 25, in 20 hours 50
//   no_pauses            moving without a two-second stop for 25 minutes 30, for 60 minutes 50 (people stop: signals, shop windows, a conversation)
//   metronome_timing     300+ consecutive position messages whose spacing varies by under one per cent (a browser jitters; a script on a timer does not): 35
//   machine_walk         the last ten minutes: at least 98% of the time at top speed AND 99% of steps dead straight AND no pause: 25
//   repeat_route         the same sequence of 8+ places, districts and zones on 3 different days: 40
//   loop_farming         8+ trips round the same place in an hour: 30
export const REVIEW_SCORE = 60;
export const TELEPORT_WINDOW_MS = 10 * 60000;
export const HOP_DISTANCE = 40;
export const HOP_WINDOW_MS = 30 * 60000;
export const PAUSE_MS = 2000;
export const NO_PAUSE_MS = [25 * 60000, 60 * 60000];
export const MARATHON_MS = [12 * 3600000, 20 * 3600000];
export const MARATHON_GAP_MS = 10 * 60000;
export const METRONOME_N = 300;
export const METRONOME_CV = 0.01;
export const MACHINE_WINDOW_MIN = 10;
export const ROUTE_MIN_KEYS = 8;
export const ROUTE_DAYS = 3;
export const LOOP_FARM = 8;
const STRAIGHT_RAD = (0.5 * Math.PI) / 180;
const PIN = 0.97;

const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const hash = (text) => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** @param {{ speedCap: { walk: number, car: number, boat: number } }} deps */
export function createAntibot({ speedCap }) {
  const accounts = new Map();
  const cleared = new Set(); // accounts whose last summary said "no flags", so the next one does not repeat it
  const stateOf = (id, t) => {
    let a = accounts.get(id);
    if (!a) {
      a = { conns: new Map(), runStart: null, lastMove: null, activeSince: t, lastActive: t, violations: [], hops: [], routeKeys: [], routeDay: null, routeSigs: new Map(), loops: new Map(), overlap: 0, lastSeen: t,
        minutes: new Map(), last: null, bearing: null, intervals: [], metronomeRun: 0 };
      accounts.set(id, a);
    }
    return a;
  };
  const bucket = (a, t) => {
    const m = Math.floor(t / 60000);
    let b = a.minutes.get(m);
    if (!b) { b = { steps: 0, straight: 0, pinned: 0, moving: 0 }; a.minutes.set(m, b); for (const k of a.minutes.keys()) if (k < m - 15) a.minutes.delete(k); }
    return b;
  };

  /** A position message of connection `conn` of account `id`. m: { x, z, moving, mode, kind ('ok'|'start'|'too_fast'|'teleport'|'out_of_bounds'|'bad'), speed } */
  function message(id, conn, t, m) {
    const a = stateOf(id, t);
    if (t - a.lastActive > MARATHON_GAP_MS) a.activeSince = t; // a real break: the marathon starts again
    a.lastActive = t;
    a.lastSeen = t;
    if (m.kind === 'teleport' || m.kind === 'too_fast') a.violations.push(t);
    while (a.violations.length && t - a.violations[0] > TELEPORT_WINDOW_MS) a.violations.shift();

    const c = a.conns.get(conn) ?? { lastMsg: null, lastMove: null };
    a.conns.set(conn, c);
    const interval = c.lastMsg == null ? null : t - c.lastMsg;
    // another connection of this account moved a moment ago: both are being played at once
    if (m.moving) for (const [other, oc] of a.conns) if (other !== conn && oc.lastMove != null && t - oc.lastMove < 1500) a.overlap++;
    c.lastMsg = t;
    if (m.moving) c.lastMove = t;

    // a pause: the avatar stopped (it says so, or it sent nothing for two seconds: the game sends a position only while it changes)
    if (!m.moving || (interval != null && interval >= PAUSE_MS)) { a.runStart = null; a.bearing = null; a.last = null; }
    if (m.moving && m.kind !== 'bad') {
      if (a.runStart == null) a.runStart = t;
      a.lastMove = t;
      const prev = a.last;
      const b = bucket(a, t);
      if (prev && interval != null && interval < PAUSE_MS) {
        const dx = m.x - prev.x, dz = m.z - prev.z, step = Math.hypot(dx, dz);
        if (step >= 0.15) {
          const bearing = Math.atan2(dx, dz);
          b.steps++;
          b.moving += interval;
          if (a.bearing != null && Math.abs(wrap(bearing - a.bearing)) < STRAIGHT_RAD) b.straight++;
          a.bearing = bearing;
          if (m.speed >= PIN * (speedCap[m.mode] ?? speedCap.walk)) b.pinned += interval;
        }
        // the spacing of the messages: a metronome is a script
        if (interval > 0 && interval < 1000) {
          a.intervals.push(interval);
          if (a.intervals.length > METRONOME_N) a.intervals.shift();
        }
      }
      a.last = { x: m.x, z: m.z };
    }
  }

  /** A connection of the account started at (x, z); `from` is where the account was last verified (or null). A start far from there soon after is a "hop". */
  function connected(id, t, { distance = 0, sinceMs = Infinity } = {}) {
    const a = stateOf(id, t);
    if (distance >= HOP_DISTANCE && sinceMs < 10 * 60000) a.hops.push(t);
    while (a.hops.length && t - a.hops[0] > HOP_WINDOW_MS) a.hops.shift();
  }
  const disconnected = (id, conn) => { accounts.get(id)?.conns.delete(conn); };

  /** An event the tracker made: its ref is a place of a route, and a loop is counted. */
  function event(id, ev) {
    const a = stateOf(id, ev.at);
    if (ev.kind === 'loop') {
      const list = a.loops.get(ev.ref) ?? [];
      list.push(ev.at);
      while (list.length && ev.at - list[0] > 3600000) list.shift();
      a.loops.set(ev.ref, list);
    }
    if (ev.kind === 'in' && ev.dwell === 0) { // an arrival: the route is the sequence of arrivals in a day
      const day = dayOf(ev.at);
      if (a.routeDay && a.routeDay !== day) finishRoute(a);
      a.routeDay = day;
      if (a.routeKeys[a.routeKeys.length - 1] !== ev.ref) a.routeKeys.push(ev.ref);
      if (a.routeKeys.length > 400) a.routeKeys.shift();
    }
  }
  function finishRoute(a) {
    if (a.routeKeys.length >= ROUTE_MIN_KEYS) {
      const sig = hash(a.routeKeys.join('>'));
      const days = a.routeSigs.get(sig) ?? new Set();
      days.add(a.routeDay);
      a.routeSigs.set(sig, days);
    }
    a.routeKeys = [];
  }

  /** The score now: { score, flags: [{ name, weight, detail }] } */
  function evaluate(id, now) {
    const a = accounts.get(id);
    if (!a) return { score: 0, flags: [] };
    const flags = [];
    const flag = (name, weight, detail) => flags.push({ name, weight, detail });

    const v = a.violations.length;
    if (v >= 10) flag('teleports', 60, `${v} impossible moves in ten minutes`);
    else if (v >= 3) flag('teleports', 30, `${v} impossible moves in ten minutes`);

    const h = a.hops.length;
    if (h >= 10) flag('hops', 60, `${h} reconnects to a far place in half an hour`);
    else if (h >= 4) flag('hops', 30, `${h} reconnects to a far place in half an hour`);

    if (a.overlap >= 200) flag('multi_connection', 40, 'two connections of this account were moving at once');

    const active = a.lastActive - a.activeSince;
    if (now - a.lastActive < MARATHON_GAP_MS) {
      if (active >= MARATHON_MS[1]) flag('marathon', 50, `${Math.round(active / 3600000)} hours without a ten-minute break`);
      else if (active >= MARATHON_MS[0]) flag('marathon', 25, `${Math.round(active / 3600000)} hours without a ten-minute break`);
    }

    const run = a.runStart != null && now - (a.lastMove ?? 0) < PAUSE_MS * 2 ? now - a.runStart : 0;
    if (run >= NO_PAUSE_MS[1]) flag('no_pauses', 50, `${Math.round(run / 60000)} minutes of movement without a stop`);
    else if (run >= NO_PAUSE_MS[0]) flag('no_pauses', 30, `${Math.round(run / 60000)} minutes of movement without a stop`);

    if (a.intervals.length >= METRONOME_N) {
      const mean = a.intervals.reduce((s, x) => s + x, 0) / a.intervals.length;
      const sd = Math.sqrt(a.intervals.reduce((s, x) => s + (x - mean) ** 2, 0) / a.intervals.length);
      if (mean > 0 && sd / mean < METRONOME_CV) flag('metronome_timing', 35, `position messages every ${mean.toFixed(1)} ms, varying by ${((sd / mean) * 100).toFixed(2)}%`);
    }

    // the last ten minutes: constant top speed, dead straight, and no pause
    const nowMin = Math.floor(now / 60000);
    let steps = 0, straight = 0, pinned = 0, moving = 0;
    for (let m = nowMin - MACHINE_WINDOW_MIN; m <= nowMin; m++) { const b = a.minutes.get(m); if (b) { steps += b.steps; straight += b.straight; pinned += b.pinned; moving += b.moving; } }
    if (run >= MACHINE_WINDOW_MIN * 60000 && steps >= 1000 && moving > 0 && pinned / moving >= 0.98 && straight / steps >= 0.99) flag('machine_walk', 25, `${MACHINE_WINDOW_MIN} minutes at top speed in straight lines without a pause`);

    for (const [ref, list] of a.loops) if (list.length >= LOOP_FARM) flag('loop_farming', 30, `${list.length} trips round ${ref} in an hour`);

    if (a.routeDay && a.routeDay !== dayOf(now)) finishRoute(a);
    for (const days of a.routeSigs.values()) if (days.size >= ROUTE_DAYS) { flag('repeat_route', 40, `the same route on ${days.size} different days`); break; }

    return { score: Math.min(100, flags.reduce((s, f) => s + f.weight, 0)), flags };
  }

  /** What to tell the API: the accounts with any flag now, and the ones that had flags and have none now (so the API can clear them). Also forgets accounts idle for a day. */
  function summarize(now) {
    const flagged = [], clearedNow = [];
    for (const [id, a] of accounts) {
      if (now - a.lastSeen > 86400000) { accounts.delete(id); continue; }
      const r = evaluate(id, now);
      if (r.flags.length) { flagged.push({ accountId: id, score: r.score, flags: r.flags }); cleared.delete(id); }
      else if (!cleared.has(id) && a.reported) { clearedNow.push(id); cleared.add(id); }
      a.reported = r.flags.length > 0;
    }
    return { flagged, cleared: clearedNow };
  }

  return { message, connected, disconnected, event, evaluate, summarize, size: () => accounts.size };
}
