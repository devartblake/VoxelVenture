// The page's lap timer (lib/world/lapTimer.js): which point of the circuit the avatar has just passed.
import { imp } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const { createLapTimer, formatLap, PASS_RADIUS } = await imp('world/lapTimer.js');
const { buildWorld } = await imp('world/buildWorld.js');
const tr = buildWorld().tracks[0];
const points = [{ x: tr.start.x, z: tr.start.z }, ...tr.checkpoints.map((c) => ({ x: c.x, z: c.z }))];
const at = (i) => [points[i].x + 2, points[i].z + 1];

const t = createLapTimer({ points });
let now = 1000;
check('away from every point nothing happens', t.update(0, 0, now).length === 0);
check('the start line starts a run', (() => { const e = t.update(...at(0), now); return e.length === 1 && e[0].type === 'start'; })());
check('standing on the line is one event, not one every tick', t.update(...at(0), now + 100).length === 0);
const seen = [];
for (let i = 1; i <= 7; i++) { now += 12000; t.update(1e5, 1e5, now - 1); seen.push(...t.update(...at(i), now)); }
check('the seven checkpoints come in order, each with the time since the start', seen.length === 7 && seen.every((e, i) => e.type === 'checkpoint' && e.index === i + 1) && seen[6].ms === 84000);
now += 12000; t.update(1e5, 1e5, now - 1);
const lap = t.update(...at(0), now);
check('the start line again is a lap: its time, the lap number, and the next lap begins', lap.length === 1 && lap[0].type === 'lap' && lap[0].ms === 96000 && lap[0].lap === 1 && t.state().next === 1);
check('a checkpoint out of order does nothing', (() => { t.update(1e5, 1e5, now + 10); return t.update(...at(4), now + 20).length === 0; })());
check('back at the line without finishing restarts the run (no lap is counted)', (() => { const u = createLapTimer({ points }); u.update(...at(0), 0); u.update(...at(1), 5000); u.update(1e5, 1e5, 5100); const e = u.update(...at(0), 9000); return e.length === 1 && e[0].type === 'start' && u.state().laps === 0; })());
check('a lap time reads minutes, seconds and thousandths; nothing reads dashes', formatLap(96432) === '1:36.432' && formatLap(5) === '0:00.005' && formatLap(null) === '--:--.---');
check('the page counts a pass within 12 units, the server allows 16, so a pass the page sees the server accepts', PASS_RADIUS === 12 && PASS_RADIUS < 16);
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
