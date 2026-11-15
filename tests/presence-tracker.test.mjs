// The movement validator and the event detector (lib/world/movement.js, lib/world/presenceTracker.js, docs/architecture/presence_positions.md). Synthetic walks over the game's real city:
// plausible movement is accepted, an impossible jump is not, and the derived events (where an account was, the roads it walked, the places it went round, how far it went) come out right.
import { imp } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const SEED = 20260101;
const { generateTown } = await imp('city/townExtension.js');
const { buildPlaceGeometry } = await imp('world/placeGeometry.js');
const { SPEED_CAP, LAG_FACTOR, newMovement, step, modeOf } = await imp('world/movement.js');
const { createTracker, SETTLE_MS, HEARTBEAT_MS } = await imp('world/presenceTracker.js');
const { phaseAt } = await imp('game/taskRules.js');
const city = generateTown(SEED);
const geo = buildPlaceGeometry(city);

// ---- the validator
const T0 = Date.UTC(2026, 10, 15, 12, 0, 0);
const world = { inBounds: geo.inBounds };
{
  const m = newMovement();
  let t = T0, x = geo.land.x0 + 5, ok = true;
  step(m, { x, z: 0 }, t, world);
  for (let i = 0; i < 600; i++) { t += 100; x += SPEED_CAP.walk * 0.1; ok = ok && step(m, { x, z: 0 }, t, world).ok; }
  check('walking at the top speed (running) for a minute, ten reports a second, is accepted throughout', ok && m.counts.too_fast === 0 && m.counts.teleport === 0, JSON.stringify(m.counts));
  const jump = step(m, { x, z: 80 }, t + 100, world);
  check('an 80-unit jump in a tenth of a second is a teleport, and is not accepted', !jump.ok && jump.kind === 'teleport');
  check('and the verified position stays where it was (the checks do not move with a cheater)', m.verified.x === x);
  const fast = step(m, { x, z: 40 }, t + 200, world);
  check('a smaller jump that is still too far for the time is "too fast"', !fast.ok && (fast.kind === 'too_fast' || fast.kind === 'teleport'));
  const waited = (40 / (SPEED_CAP.walk * LAG_FACTOR)) + 1;
  const later = step(m, { x, z: 40 }, t + 200 + waited * 1000, world);
  check('the same place is accepted once enough real time has passed to have got there (plausible, not proven honest)', later.ok);
}
{
  const m = newMovement();
  step(m, { x: 0, z: 0 }, T0, world);
  const car = step(m, { x: 6.5 * 1, z: 0, veh: { kind: 'car' } }, T0 + 1000, world);
  check('a car does 7 units a second: 6.5 in a second is accepted', car.ok && modeOf({ kind: 'car' }) === 'car');
  const m2 = newMovement();
  step(m2, { x: 0, z: 0 }, T0, world);
  const walkFast = step(m2, { x: 6.5 * 3, z: 0 }, T0 + 1000, world);
  check('but 19.5 units in a second on foot is not (a car\'s speed without a car)', !walkFast.ok);
  const m3 = newMovement();
  step(m3, { x: 0, z: 0, veh: { kind: 'boat' } }, T0, world);
  check('a boat does 3.6: 20 units in a second is too fast for one', !step(m3, { x: 20, z: 0, veh: { kind: 'boat' } }, T0 + 1000, world).ok);
  const m4 = newMovement();
  step(m4, { x: 0, z: 0 }, T0, world);
  check('getting into a car: the faster of the two modes is allowed for that step', step(m4, { x: 8, z: 0, veh: { kind: 'car' } }, T0 + 1000, world).ok);
  check('outside the world is refused whatever the speed', !step(newMovement(), { x: geo.land.x0 - 500, z: 0 }, T0, world).ok && newMovement().counts.out_of_bounds === 0);
  check('a position that is not a number is refused', !step(newMovement(), { x: NaN, z: 0 }, T0, world).ok && !step(newMovement(), { x: 1, z: Infinity }, T0, world).ok);
  check('after more than an hour of silence the verified position is not compared (a new start)', (() => { const m5 = newMovement(); step(m5, { x: 0, z: 0 }, T0, world); return step(m5, { x: 200, z: 100 }, T0 + 3700 * 1000, world).kind === 'start'; })());
}

// ---- a walker through the tracker
// `walk(points, speed)` is a list of timed positions along a polyline at a speed, one every `dt` ms; runTrack feeds them through the validator and the tracker at 2 Hz
function walk(points, speed, t0 = T0, dt = 100) {
  const out = [];
  let t = t0, x = points[0].x, z = points[0].z;
  out.push({ t, x, z });
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(points[i].x - x, points[i].z - z);
    const n = Math.max(1, Math.round(len / (speed * dt / 1000)));
    const sx = (points[i].x - x) / n, sz = (points[i].z - z) / n, ex = points[i].x, ez = points[i].z;
    for (let k = 0; k < n; k++) { t += dt; x += sx; z += sz; out.push({ t, x, z }); }
    x = ex; z = ez;
  }
  return out;
}
const still = (at, seconds, t0) => { const out = []; for (let t = t0; t <= t0 + seconds * 1000; t += 100) out.push({ t, x: at.x, z: at.z }); return out; };
function runTrack(track, { mode = 'walk', account = 1, startAt = track[0].t } = {}) {
  const tracker = createTracker({ geometry: geo, phaseAt });
  const m = newMovement();
  const events = [];
  tracker.begin(account, startAt);
  let nextSample = track[0].t;
  for (const s of track) {
    const r = step(m, { x: s.x, z: s.z, veh: mode === 'walk' ? null : { kind: mode } }, s.t, world);
    if (s.t >= nextSample && m.verified) { events.push(...tracker.sample(account, { x: m.verified.x, z: m.verified.z, mode: m.verified.mode }, s.t)); nextSample = s.t + 500; }
    void r;
  }
  return { events, m };
}
const lastT = (track) => track[track.length - 1].t;

const park = geo.placeOf('park', 'park');
const pc = { x: (park.rect.x0 + park.rect.x1) / 2, z: (park.rect.z0 + park.rect.z1) / 2 };
{
  const approach = walk([{ x: pc.x - 40, z: pc.z }, { x: pc.x, z: pc.z }], 3);
  const track = [...approach, ...still(pc, 130, lastT(approach))];
  const { events, m } = runTrack(track);
  const ins = events.filter((e) => e.kind === 'in');
  check('walking into Voxel Park makes an arrival in the park', ins.some((e) => e.ref === 'place:park:park' && e.dwell === 0));
  check('and in the park\'s sound zone', ins.some((e) => e.ref === 'zone:park'));
  check('and in a district (the nearest plot\'s)', ins.some((e) => e.ref.startsWith('district:')));
  check('standing in the zone for a minute reports a dwell of 60 seconds, and again at 300 if it stays', ins.some((e) => e.ref === 'zone:park' && e.dwell >= 60));
  check('being somewhere is reported once a minute while it lasts, not ten times a second', ins.filter((e) => e.ref === 'place:park:park').length <= 5);
  check('every event carries the city\'s clock phase', events.every((e) => ['dawn', 'day', 'dusk', 'night'].includes(e.phase)));
  check('nothing is credited in the first ten seconds of a new start', events.every((e) => e.at - track[0].t >= SETTLE_MS));
  check('nothing was refused on the way: it was a walk', m.counts.too_fast + m.counts.teleport + m.counts.out_of_bounds === 0);
  check('the heartbeat is a minute', HEARTBEAT_MS === 60000);
}

// ---- going round a place
{
  const r = park.rect, g = 4;
  const ring = [{ x: r.x0 - g, z: r.z0 - g }, { x: r.x1 + g, z: r.z0 - g }, { x: r.x1 + g, z: r.z1 + g }, { x: r.x0 - g, z: r.z1 + g }, { x: r.x0 - g, z: r.z0 - g }];
  const track = [...walk([{ x: ring[0].x, z: ring[0].z - 25 }, ring[0]], 3), ...walk(ring, 3, T0 + 30000)];
  const { events } = runTrack(track);
  check('walking right round a park, a few steps outside it, is a loop', events.some((e) => e.kind === 'loop' && e.ref === 'place:park:park'));
  const half = walk([{ x: ring[0].x, z: ring[0].z - 25 }, ring[0], ring[1], ring[2]], 3);
  check('walking half way round is not', !runTrack(half).events.some((e) => e.kind === 'loop'));
}
{
  const bridge = geo.placeOf('bridge', 'bridge-avenue-1-creator');
  const [a, b] = bridge.anchors;
  const dir = { x: Math.sign(b.x - a.x), z: Math.sign(b.z - a.z) };
  const out = walk([{ x: a.x - dir.x * 40, z: a.z - dir.z * 40 }, a, b, a], 3);
  check('crossing a bridge and coming back is a loop on it', runTrack(out).events.some((e) => e.kind === 'loop' && e.ref === 'place:bridge:bridge-avenue-1-creator'));
  check('crossing it one way is not', !runTrack(walk([{ x: a.x - dir.x * 40, z: a.z - dir.z * 40 }, a, b], 3)).events.some((e) => e.kind === 'loop'));
  const pier = geo.placeOf('pier', 'pier-1');
  const [s0, tip] = pier.anchors;
  check('out along a pier and back is a loop on it', runTrack(walk([{ x: s0.x - Math.sign(tip.x - s0.x) * 30, z: s0.z - Math.sign(tip.z - s0.z) * 30 }, s0, tip, s0], 2)).events.some((e) => e.kind === 'loop' && e.ref === 'place:pier:pier-1'));
}

// ---- roads
{
  const road = geo.roads.get('Pixel Ln');
  const s = road.segments[0];
  const along = (f0, f1) => { const at = (f) => (s.axis === 'z' ? { x: s.center, z: s.from + (s.to - s.from) * f } : { x: s.from + (s.to - s.from) * f, z: s.center }); return [at(f0), at(f1)]; };
  const lead = { x: along(0, 0)[0].x - (s.axis === 'x' ? 40 : 0), z: along(0, 0)[0].z - (s.axis === 'z' ? 40 : 0) };
  const full = runTrack(walk([lead, ...along(0, 1)], 3));
  check('walking the length of Pixel Ln is a pass of the road, on foot', full.events.some((e) => e.kind === 'pass' && e.ref === 'road:Pixel Ln' && e.mode === 'walk'));
  const half = runTrack(walk([lead, ...along(0, 0.5)], 3));
  check('walking half of it is not', !half.events.some((e) => e.kind === 'pass'));
  const lead2 = { x: along(0, 0)[0].x - (s.axis === 'x' ? 80 : 0), z: along(0, 0)[0].z - (s.axis === 'z' ? 80 : 0) };
  const drive = runTrack(walk([lead2, ...along(0, 1)], 6, T0), { mode: 'car' });
  check('driving the length of it is a pass by car (and not on foot)', drive.events.some((e) => e.kind === 'pass' && e.ref === 'road:Pixel Ln' && e.mode === 'car') && !drive.events.some((e) => e.kind === 'pass' && e.mode === 'walk'));
}

// ---- distance
{
  const a = { x: geo.land.x0 + 60, z: 0 }, b = { x: a.x + 300, z: 0 };
  const track = [...walk([a, b], 3), ...still(b, 40, T0 + 105000)];
  const { events } = runTrack(track);
  const metres = events.filter((e) => e.kind === 'distance' && e.ref === 'walk' && !e.district).reduce((n, e) => n + e.metres, 0);
  const expected = 300 - SETTLE_MS / 1000 * 3;
  check('300 metres walked is counted as about that (the first ten seconds are not credited)', Math.abs(metres - expected) < 20, `${metres} of ${expected}`);
  const inDistricts = events.filter((e) => e.kind === 'distance' && e.district).reduce((n, e) => n + e.metres, 0);
  check('and the part of it inside a district is counted apart, never more than the whole', inDistricts <= metres + 5);
  const car = runTrack(walk([a, { x: a.x + 300, z: 0 }], 6), { mode: 'car' }).events.filter((e) => e.kind === 'distance');
  check('driving is counted as driving, not walking', car.length > 0 && car.every((e) => e.ref === 'car'));
}

// ---- the edges (for "from one end of the city to the other")
{
  const west = runTrack([...walk([{ x: geo.land.x0 + 60, z: 0 }, { x: geo.land.x0 + 3, z: 0 }], 3), ...still({ x: geo.land.x0 + 3, z: 0 }, 5, T0 + 22000)]).events;
  check('standing at the west edge of the land is there', west.some((e) => e.ref === 'edge:west'));
}

// ---- one account's state does not leak into another's
{
  const tracker = createTracker({ geometry: geo, phaseAt });
  tracker.begin(1, T0); tracker.begin(2, T0);
  for (let t = T0; t < T0 + 30000; t += 500) tracker.sample(1, { x: pc.x, z: pc.z, mode: 'walk' }, t);
  const other = tracker.sample(2, { x: 5000, z: 5000, mode: 'walk' }, T0 + 30000);
  check('accounts are tracked apart, and forgetting one frees it', other.length === 0 || other.every((e) => !e.ref.startsWith('place:park')));
  tracker.forget(1);
  check('forgetting an account frees its memory', tracker.size() === 1);
}

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
