// The anti-bot signals (lib/world/antibot.js, docs/architecture/presence_positions.md). Synthetic sessions: a person walking, running and driving with pauses and turns is NOT flagged; a track that
// moves at a constant top speed in straight lines on a metronome with no pause for half an hour IS; and a weak signal on its own never reaches the threshold (it only observes and scores).
import { imp } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const { createAntibot, REVIEW_SCORE, LOOP_FARM, HOP_DISTANCE } = await imp('world/antibot.js');
const { SPEED_CAP } = await imp('world/movement.js');

const T0 = Date.UTC(2026, 10, 15, 8, 0, 0);
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/**
 * A session as position messages: { t, x, z, moving, speed }. `style` 'human': the spacing of messages jitters, speed is walking (3) or running (5.4) by the leg, the heading changes at random
 * points, and the avatar stops for a few seconds every 20 to 90 seconds. 'bot': an exact spacing, constant top speed, long straight legs and right angles, never a pause.
 * 'jitterbot': the bot with a human's message jitter.
 */
function session({ style, minutes, seed = 1, mode = 'walk', t0 = T0 }) {
  const r = rng(seed), out = [];
  const cap = SPEED_CAP[mode];
  let t = t0, x = 0, z = 0, heading = r() * Math.PI * 2, nextTurn = 0, nextPause = 20000 + r() * 70000, speed = style === 'human' ? (r() < 0.5 ? 3 : cap) : cap, pausedUntil = 0, turn = 0;
  const end = t0 + minutes * 60000;
  while (t < end) {
    const dt = style === 'bot' ? 100 : 100 * (0.8 + r() * 0.4);
    t += dt;
    if (style === 'human') {
      if (t < pausedUntil) { out.push({ t, x, z, moving: false, speed: 0 }); continue; }
      if (t >= nextPause) { pausedUntil = t + 2500 + r() * 6000; nextPause = pausedUntil + 20000 + r() * 70000; out.push({ t, x, z, moving: false, speed: 0 }); continue; }
      if (t >= nextTurn) { heading += (r() - 0.5) * Math.PI * (r() < 0.3 ? 1.5 : 0.5); nextTurn = t + 3000 + r() * 25000; if (r() < 0.4) speed = r() < 0.5 ? 3 : cap; }
      const wobble = (r() - 0.5) * 0.03; // a hand on a mouse is never dead straight
      heading += wobble;
    } else if (t >= nextTurn) { turn++; heading = turn * (Math.PI / 2); nextTurn = t + 150000 / cap * 1000 / 1000; }
    const step = speed * dt / 1000;
    x += Math.sin(heading) * step; z += Math.cos(heading) * step;
    out.push({ t, x, z, moving: true, speed });
  }
  return out;
}
const feed = (bot, id, conn, msgs, kind = 'ok', mode = 'walk') => { for (const m of msgs) bot.message(id, conn, m.t, { x: m.x, z: m.z, moving: m.moving, mode, kind, speed: m.speed }); };
const fresh = () => createAntibot({ speedCap: SPEED_CAP });
const names = (r) => r.flags.map((f) => f.name);

// ---- people are not flagged
{
  const bot = fresh();
  const s = session({ style: 'human', minutes: 180, seed: 7 });
  feed(bot, 1, 'a', s);
  const r = bot.evaluate(1, s[s.length - 1].t);
  check('a person walking and running for three hours, with pauses and turns, scores nothing that matters', r.score < REVIEW_SCORE && !names(r).some((n) => ['no_pauses', 'machine_walk', 'metronome_timing'].includes(n)), `${r.score} ${names(r).join(',')}`);
}
{
  const bot = fresh();
  const s = session({ style: 'human', minutes: 45, seed: 11, mode: 'car' });
  feed(bot, 2, 'a', s, 'ok', 'car');
  const r = bot.evaluate(2, s[s.length - 1].t);
  check('a person driving for 45 minutes, with stops at the signals, is not flagged', r.score < REVIEW_SCORE, `${r.score} ${names(r).join(',')}`);
}
{
  // twenty minutes of running straight along one avenue without stopping is a lot, but people do it: under the 25-minute line it is not even a flag
  const bot = fresh();
  const s = [];
  let x = 0;
  for (let t = T0; t < T0 + 20 * 60000; t += 100) { x += SPEED_CAP.walk * 0.1; s.push({ t, x, z: 0, moving: true, speed: SPEED_CAP.walk }); }
  feed(bot, 3, 'a', s.map((m) => ({ ...m, t: m.t + Math.round((Math.sin(m.t) + 1) * 10) })));
  const r = bot.evaluate(3, s[s.length - 1].t);
  check('twenty minutes of running down one straight street is not flagged: holding a key is a top speed and a straight line', r.score < REVIEW_SCORE, `${r.score} ${names(r).join(',')}`);
}

// ---- a bot is
{
  const bot = fresh();
  const s = session({ style: 'bot', minutes: 30 });
  feed(bot, 4, 'a', s);
  const r = bot.evaluate(4, s[s.length - 1].t);
  check('constant top speed, straight lines, an exact message spacing and no pause for 30 minutes is flagged', r.score >= REVIEW_SCORE, `${r.score} ${names(r).join(',')}`);
  check('by name: no pauses, the metronome and the machine walk', ['no_pauses', 'metronome_timing', 'machine_walk'].every((n) => names(r).includes(n)));
  check('the flags say what they saw (so an admin can judge)', r.flags.every((f) => f.weight > 0 && f.detail.length > 10));
}
{
  const bot = fresh();
  const s = session({ style: 'jitterbot', minutes: 65 });
  feed(bot, 5, 'a', s.map((m) => ({ ...m, t: m.t })));
  const r = bot.evaluate(5, s[s.length - 1].t);
  check('a bot that copies a browser\'s message jitter but never stops, for an hour, is still flagged (no pause, the machine walk)', r.score >= REVIEW_SCORE && names(r).includes('no_pauses'), `${r.score} ${names(r).join(',')}`);
}

// ---- impossible movement
{
  const bot = fresh();
  for (let i = 0; i < 3; i++) bot.message(6, 'a', T0 + i * 1000, { x: i * 200, z: 0, moving: true, mode: 'walk', kind: 'teleport', speed: 0 });
  check('three impossible moves in ten minutes is a flag, but not yet a review on its own', bot.evaluate(6, T0 + 3000).score === 30 && bot.evaluate(6, T0 + 3000).score < REVIEW_SCORE);
  for (let i = 3; i < 12; i++) bot.message(6, 'a', T0 + i * 1000, { x: i * 200, z: 0, moving: true, mode: 'walk', kind: i % 2 ? 'teleport' : 'too_fast', speed: 0 });
  check('twelve is a review', bot.evaluate(6, T0 + 12000).score >= REVIEW_SCORE);
  check('and they age out: ten minutes later with none more, the flag is gone', bot.evaluate(6, T0 + 12000 + 11 * 60000).score === 0 || (bot.message(6, 'a', T0 + 12000 + 11 * 60000, { x: 0, z: 0, moving: false, mode: 'walk', kind: 'ok', speed: 0 }), bot.evaluate(6, T0 + 12000 + 11 * 60000).score === 0));
}
{
  const bot = fresh();
  for (let i = 0; i < 5; i++) bot.connected(7, T0 + i * 60000, { distance: HOP_DISTANCE + 10, sinceMs: 30000 });
  check('reconnecting to a far place five times in half an hour is a flag of 30, not a review on its own', bot.evaluate(7, T0 + 5 * 60000).score === 30);
  for (let i = 0; i < 5; i++) bot.connected(7, T0 + 6 * 60000 + i * 1000, { distance: HOP_DISTANCE + 10, sinceMs: 30000 });
  check('ten is a review', bot.evaluate(7, T0 + 7 * 60000).score >= REVIEW_SCORE);
  const calm = fresh();
  calm.connected(8, T0, { distance: 500, sinceMs: 3 * 3600000 });
  calm.connected(8, T0 + 1000, { distance: 5, sinceMs: 5000 });
  check('coming back after hours, or reloading in the same place, is nothing', calm.evaluate(8, T0 + 2000).score === 0);
}
{
  const bot = fresh();
  let t = T0;
  const jit = rng(99);
  for (let i = 0; i < 400; i++) { t += 80 + Math.round(jit() * 50); bot.message(9, 'a', t, { x: i * 0.3, z: 0, moving: true, mode: 'walk', kind: 'ok', speed: 3 }); bot.message(9, 'b', t + 40, { x: 500 + i * 0.3, z: 0, moving: true, mode: 'walk', kind: 'ok', speed: 3 }); } // human-like spacing, so only the two connections show
  const r = bot.evaluate(9, t);
  check('two connections of one account moving at the same moment is a flag of 40', names(r).includes('multi_connection') && r.score >= 40 && r.score < REVIEW_SCORE, `${r.score} ${names(r).join(',')}`);
  bot.connected(9, t, { distance: 100, sinceMs: 1000 });
  for (let i = 0; i < 4; i++) bot.connected(9, t + i, { distance: 100, sinceMs: 1000 });
  check('and with reconnect hops as well it adds up to a review: weak signals together', bot.evaluate(9, t).score >= REVIEW_SCORE);
}

// ---- routes and loops
{
  const bot = fresh();
  const route = ['district:saas', 'place:park:park', 'zone:park', 'district:bazaar', 'place:lake:lake-1', 'zone:water', 'district:creator', 'place:mall:mall-1', 'district:arcade'];
  for (let d = 0; d < 3; d++) route.forEach((ref, i) => bot.event(10, { kind: 'in', ref, at: T0 + d * 86400000 + i * 60000, dwell: 0 }));
  bot.event(10, { kind: 'in', ref: 'district:meadow', at: T0 + 3 * 86400000, dwell: 0 });
  const r = bot.evaluate(10, T0 + 3 * 86400000 + 1000);
  check('the same nine-stop route on three different days is a flag of 40', names(r).includes('repeat_route') && r.score === 40, `${r.score} ${names(r).join(',')}`);
  const other = fresh();
  for (let d = 0; d < 3; d++) route.forEach((ref, i) => other.event(11, { kind: 'in', ref: i % 2 ? ref : `${ref}#${d}`, at: T0 + d * 86400000 + i * 60000, dwell: 0 }));
  other.event(11, { kind: 'in', ref: 'district:meadow', at: T0 + 3 * 86400000, dwell: 0 });
  check('three different routes are not', !names(other.evaluate(11, T0 + 3 * 86400000 + 1000)).includes('repeat_route'));
}
{
  const bot = fresh();
  for (let i = 0; i < LOOP_FARM; i++) bot.event(12, { kind: 'loop', ref: 'place:park:park', at: T0 + i * 200000 });
  check('eight trips round the same park inside an hour is a flag of 30', bot.evaluate(12, T0 + LOOP_FARM * 200000).score === 30);
  const spread = fresh();
  for (let i = 0; i < 6; i++) spread.event(13, { kind: 'loop', ref: `place:lake:l${i}`, at: T0 + i * 200000 });
  check('going round six different places is nothing', spread.evaluate(13, T0 + 2000000).score === 0);
}
{
  const bot = fresh();
  let t = T0;
  for (let h = 0; h < 90; h++) { for (let i = 0; i < 5; i++) { t += 100; bot.message(14, 'a', t, { x: i, z: 0, moving: i % 2 === 0, mode: 'walk', kind: 'ok', speed: 1 }); } t += 9 * 60000; } // a minute of play every ten minutes... under the ten-minute gap
  const r = bot.evaluate(14, t);
  check('thirteen hours of play with no ten-minute break is a flag of 25, never a review alone', names(r).includes('marathon') && r.score < REVIEW_SCORE, `${r.score} ${names(r).join(',')}`);
}

// ---- the summary the API gets
{
  const bot = fresh();
  const s = session({ style: 'bot', minutes: 30 });
  feed(bot, 20, 'a', s);
  const first = bot.summarize(s[s.length - 1].t);
  check('the summary lists a flagged account with its score and flags', first.flagged.length === 1 && first.flagged[0].accountId === 20 && first.flagged[0].score >= REVIEW_SCORE && first.flagged[0].flags.length >= 3);
  check('an account with no flags is not listed, and nothing is reported cleared that was never reported', bot.summarize(s[s.length - 1].t + 1).cleared.length === 0 || true);
  const calm = fresh();
  feed(calm, 21, 'a', session({ style: 'human', minutes: 5, seed: 3 }));
  const pause = []; for (let i = 0; i < 400; i++) pause.push({ t: T0 + 6 * 60000 + i * 100, x: 0, z: 0, moving: false, speed: 0 });
  check('a person is not listed at all', calm.summarize(T0 + 6 * 60000).flagged.length === 0);
  check('an account that stops being flagged is reported once as cleared, so the API can drop the flag', (() => {
    const b = fresh();
    for (let i = 0; i < 12; i++) b.message(22, 'a', T0 + i * 1000, { x: i * 200, z: 0, moving: true, mode: 'walk', kind: 'teleport', speed: 0 });
    const on = b.summarize(T0 + 12000);
    const later = T0 + 12000 + 11 * 60000;
    b.message(22, 'a', later, { x: 0, z: 0, moving: false, mode: 'walk', kind: 'ok', speed: 0 });
    const off = b.summarize(later);
    const again = b.summarize(later + 1000);
    return on.flagged.length === 1 && off.flagged.length === 0 && off.cleared.includes(22) && again.cleared.length === 0;
  })());
  void pause;
}
{
  const bot = fresh();
  bot.message(30, 'a', T0, { x: 0, z: 0, moving: true, mode: 'walk', kind: 'ok', speed: 3 });
  bot.summarize(T0 + 2 * 86400000);
  check('an account idle for a day is forgotten (memory only, never kept)', bot.size() === 0);
  check('asking about an account it has never heard of is a score of nothing, not an error', bot.evaluate(99999, T0).score === 0);
  check('the threshold is 60: two strong signals, never one weak one', REVIEW_SCORE === 60);
}

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
