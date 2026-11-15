// What presence-verified positions cost (docs/architecture/presence_positions.md, "Cost"): the hot paths timed on their own, then projected to a busy server. Run it after changing
// lib/world/ or services/multiplayer/positions.mjs:   node scripts/bench-presence-positions.mjs
//
//   onState   per position message: the movement validator and the anti-bot observation        (ten a second per moving, signed-in player)
//   sample    per account, twice a second: re-locate and turn the position into derived events (moving: a new place every time; standing still: the cached one)
import { imp } from './lib-loader.mjs';

const { generateTown } = await imp('city/townExtension.js');
const { buildPlaceGeometry } = await imp('world/placeGeometry.js');
const { newMovement, step, SPEED_CAP } = await imp('world/movement.js');
const { createTracker } = await imp('world/presenceTracker.js');
const { createAntibot } = await imp('world/antibot.js');
const { phaseAt } = await imp('game/taskRules.js');

const geometry = buildPlaceGeometry(generateTown(20260101));
const land = geometry.land;
const rand = ((s) => () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(7);
const T0 = Date.UTC(2026, 10, 15, 12);
const timeIt = (label, n, fn) => { const t = process.hrtime.bigint(); for (let i = 0; i < n; i++) fn(i); const ns = Number(process.hrtime.bigint() - t) / n; console.log(`${label.padEnd(46)} ${ns.toFixed(0).padStart(7)} ns each`); return ns; };

// a population of walkers
const N = 500;
const players = Array.from({ length: N }, (_, i) => ({ id: i + 1, x: land.x0 + rand() * (land.x1 - land.x0), z: land.z0 + rand() * (land.z1 - land.z0), heading: rand() * 6.28, mv: newMovement() }));
const antibot = createAntibot({ speedCap: SPEED_CAP });
const tracker = createTracker({ geometry, phaseAt });
for (const p of players) tracker.begin(p.id, T0 - 20000);
const world = { inBounds: geometry.inBounds };
let t = T0;
const move = (p) => { p.heading += (rand() - 0.5) * 0.2; p.x = Math.max(land.x0, Math.min(land.x1, p.x + Math.sin(p.heading) * 0.4)); p.z = Math.max(land.z0, Math.min(land.z1, p.z + Math.cos(p.heading) * 0.4)); };

const onState = timeIt('onState: validator + anti-bot, one message', 200000, (i) => {
  const p = players[i % N];
  if (i % N === 0) t += 100;
  move(p);
  const r = step(p.mv, { x: p.x, z: p.z }, t, world);
  antibot.message(p.id, 'c', t, { x: p.x, z: p.z, moving: true, mode: 'walk', kind: r.kind, speed: r.speed });
});
const movingSample = timeIt('sample: a moving account (re-located every time)', 100000, (i) => {
  const p = players[i % N];
  if (i % N === 0) t += 500;
  move(p); move(p); move(p);
  tracker.sample(p.id, { x: p.x, z: p.z, mode: 'walk' }, t);
});
const still = players.slice(0, 50);
const stillSample = timeIt('sample: an account standing still (cached place)', 200000, (i) => { const p = still[i % 50]; if (i % 50 === 0) t += 500; tracker.sample(p.id, { x: p.x, z: p.z, mode: 'walk' }, t); });
timeIt('locate (the place geometry on its own)', 100000, (i) => geometry.locate(land.x0 + ((i * 37) % 340), land.z0 + ((i * 91) % 390)));

console.log('\nProjected CPU on one core, signed-in players in the reward city, all moving (a pessimistic mix):');
for (const n of [100, 500, 1500]) {
  const perSecond = n * (10 * onState + 2 * movingSample) / 1e9;
  console.log(`  ${String(n).padStart(5)} players: ${(perSecond * 100).toFixed(2)}% of a core   (messages ${n * 10}/s, samples ${n * 2}/s)`);
}
const standing = 1500 * (2 * stillSample) / 1e9;
console.log(`  1500 players standing still: ${(standing * 100).toFixed(2)}% of a core`);
console.log(`\nThe load test's budget is 85% of a core (scripts/load-test-presence.mjs); the relay itself is most of that.`);
