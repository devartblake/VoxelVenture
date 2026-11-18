// The train between the mainland and Harbor Isle (docs/world/train.md): a shuttle on a rail laid beside the road on the first causeway (Harbor Causeway), with a station at each end. Pure: the line,
// the timetable and the cars' places are all functions of the causeway and the clock, so every player sees the train in the same place with no server, and a Node test can check them.
//
// The line runs along the causeway's centre line, `lateral` units to one side (the deck is 8 wide: the road keeps the rest). Its stations are `margin` units in from each end, on land. The train
// stops at a station for `dwell` seconds, runs to the other end (speeding up and slowing down at `accel`, `speed` at the most), stops there, and comes back: a cycle of two dwells and two runs,
// counted from the wall clock (the ads rotate the same way). `speed` stays under the car's top speed (7) because a rider is sent as a car to the presence server's movement check.
import { deckHeight } from './chunkMesh';
import { LIFT } from './datum';
import { floorY } from './tunnelSpec';

export const TRAIN = {
  speed: 6, // units a second at cruise
  accel: 1.1,
  dwell: 16, // seconds in a station
  margin: 18, // a station's distance from its end of the causeway
  lateral: 2.5, // the rail's distance from the centre line (the road side keeps the other 5.5 of the deck)
  platform: 2.6, // the platform's extra distance beyond the rail
  scale: 1.6, // the Train Kit's models are about 1 wide: this makes the rail 1.6 and a car 2.1 wide
  tile: 4, // the length of one rail tile in the kit
  spacing: 4.6, // between car centres
  boardUntil: 3, // you can board until this many seconds before it leaves
  // the cars from the rear (toward the mainland) to the front (toward the isle): a nose at each end, so the same train runs both ways
  cars: ['train-electric-bullet-a', 'train-electric-bullet-b', 'train-electric-bullet-b', 'train-electric-bullet-a'],
};
export const TRAIN_MODEL_IDS = ['train/train-electric-bullet-a', 'train/train-electric-bullet-b', 'train/railroad-straight'];

/** The line along a causeway of the manifest ({ points: [a, b], length, bridge, clearance, span: { from } }). */
export function trainLine(c) {
  const [a, b] = c.points;
  const dx = b.x - a.x, dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  const dir = { x: dx / length, z: dz / length };
  return {
    id: c.id, name: c.name, a, b, length, dir, yaw: Math.atan2(dir.x, dir.z), normal: { x: dir.z, z: -dir.x }, // the normal points to the right of the way from a to b
    sA: TRAIN.margin, sB: length - TRAIN.margin,
    deckFrom: Math.hypot(c.span.from.x - a.x, c.span.from.z - a.z), bridgeLen: c.bridge, clearance: c.clearance,
  };
}

/** The point of the rail at `s` units along the line, `extra` beyond the rail (the platform side). */
// (a line beside the causeway keeps the train's lateral; the tunnel's line, in the middle of its tube, has its own: `line.lateral`)
export const pointAt = (line, s, extra = 0) => { const lat = (line.lateral ?? TRAIN.lateral) + extra; return { x: line.a.x + line.dir.x * s + line.normal.x * lat, z: line.a.z + line.dir.z * s + line.normal.z * lat }; };
/**
 * The height of the rail at `s`: the deck's over the water (it arches to `clearance`; the rail lies on it), and on the shore the ground's (`ground(x, z)`, the baked terrain once it is loaded; 0 until then)
 * plus LAND_LIFT, so the rail lies on top of the road's surface beside it (the highway is 0.1 above the ground).
 */
export const LAND_LIFT = LIFT.rail; // (lib/world/datum.js)
export const railY = (line, s, ground = null) => {
  // a line through a tunnel (`line.tunnel` = { s0, s1 }): the rail lies on the tube's road between the portals, on the ground outside them
  if (line.tunnel && s >= line.tunnel.s0 && s <= line.tunnel.s1) return floorY(line.tunnel, s) + LAND_LIFT; // (the same lift as on the shore, so the rail has no step at the portal)
  const t = s - line.deckFrom;
  if (t > 0 && t < line.bridgeLen) return deckHeight({ clearance: line.clearance, span: line.bridgeLen }, t) + LIFT.deckRail;
  const p = pointAt(line, s);
  return (ground ? ground(p.x, p.z) : 0) + LAND_LIFT;
};
export const railPitch = (line, s, ground = null) => Math.atan2(railY(line, s + 1, ground) - railY(line, s - 1, ground), 2);

// one run between the stations: its length, and how long it takes (a trapezoid of speed: up at accel, cruise, down)
export function leg(line) {
  const D = line.sB - line.sA, v = TRAIN.speed, a = TRAIN.accel;
  const ramp = (v * v) / a; // the distance to speed up and to slow down
  return D >= ramp ? { D, time: D / v + v / a, peak: v } : { D, time: (2 * Math.sqrt(D * a)) / a, peak: Math.sqrt(D * a) };
}
// distance run `u` seconds into a run, and the speed then
function along(line, u) {
  const { D, time, peak } = leg(line);
  const a = TRAIN.accel, ta = peak / a;
  if (u <= 0) return { d: 0, v: 0 };
  if (u >= time) return { d: D, v: 0 };
  if (u < ta) return { d: 0.5 * a * u * u, v: a * u };
  if (u > time - ta) { const r = time - u; return { d: D - 0.5 * a * r * r, v: a * r }; }
  return { d: 0.5 * a * ta * ta + peak * (u - ta), v: peak };
}
/** How long a whole cycle is, in seconds. */
export const cycleSeconds = (line) => 2 * (TRAIN.dwell + leg(line).time);

/**
 * Where the train is at a time (ms): { s (the middle of the train along the line), dir (+1 toward the isle, -1 toward the mainland), speed, at ('A' the mainland station, 'B' the isle's, or null),
 * toGo (seconds until it leaves, in a station) }.
 */
export function trainState(line, nowMs) {
  const run = leg(line).time, cycle = 2 * (TRAIN.dwell + run);
  const t = ((((nowMs / 1000) + (line.phase ?? 0)) % cycle) + cycle) % cycle; // (`line.phase`: seconds into the cycle at the clock's zero, so two lines are not in step)
  if (t < TRAIN.dwell) return { s: line.sA, dir: 1, speed: 0, at: 'A', toGo: TRAIN.dwell - t };
  if (t < TRAIN.dwell + run) { const r = along(line, t - TRAIN.dwell); return { s: line.sA + r.d, dir: 1, speed: r.v, at: null, toGo: 0 }; }
  if (t < 2 * TRAIN.dwell + run) return { s: line.sB, dir: -1, speed: 0, at: 'B', toGo: 2 * TRAIN.dwell + run - t };
  const r = along(line, t - 2 * TRAIN.dwell - run);
  return { s: line.sB - r.d, dir: -1, speed: r.v, at: null, toGo: 0 };
}

/** The cars at a state: [{ model, s, x, y, z, yaw, pitch }], from the rear to the front. The nose cars face outward whichever way the train runs. */
export function cars(line, state, ground = null) {
  const n = TRAIN.cars.length;
  return TRAIN.cars.map((model, k) => {
    const s = state.s + (k - (n - 1) / 2) * TRAIN.spacing;
    const p = pointAt(line, s);
    const turn = k === 0 ? Math.PI : 0; // the rear nose faces the mainland
    return { model, k, s, x: p.x, y: railY(line, s, ground), z: p.z, yaw: line.yaw + turn, pitch: railPitch(line, s, ground) };
  });
}

/** Where a rider stands: in the second car (a middle one), a little above the floor. */
export function seat(line, state, ground = null) {
  const s = state.s - TRAIN.spacing * 0.5;
  const p = pointAt(line, s);
  return { x: p.x, z: p.z, y: railY(line, s, ground) + 0.45, yaw: line.yaw + (state.dir < 0 ? Math.PI : 0), s };
}

/** A station: where to stand on the platform, and the middle of the platform. `which` is 'A' or 'B'. */
export function station(line, which) {
  const s = which === 'A' ? line.sA : line.sB;
  const stand = pointAt(line, s, TRAIN.platform);
  const names = line.stationNames ?? ['Mainland Station', 'Harbor Isle Station'];
  return { which, s, x: stand.x, z: stand.z, yaw: line.yaw, name: which === 'A' ? names[0] : names[1] };
}

/** Whole seconds until the train is next standing in station `which` and open to board (0 if it is). */
export function secondsToTrain(line, nowMs, which) {
  for (let t = 0; t <= cycleSeconds(line) + 1; t++) if (canBoard(trainState(line, nowMs + t * 1000), which)) return t;
  return 0;
}

/** Can a person board at this station now? Only while the train stands there, and not in the last seconds before it leaves. */
export const canBoard = (state, which) => state.at === which && state.toGo > TRAIN.boardUntil;
/** Can a rider get off now? Only in a station. */
export const canLeave = (state) => state.at !== null;

/** The rail's tiles from the mainland station's end to the isle's: [{ s (the middle), x, y, z, yaw, pitch, length }], a little past each station. */
export function railTiles(line, from = line.sA - 12, to = line.sB + 12, ground = null) {
  const len = TRAIN.tile * TRAIN.scale;
  const out = [];
  const n = Math.ceil((to - from) / len);
  for (let i = 0; i < n; i++) {
    const s = from + len / 2 + i * len;
    const p = pointAt(line, s);
    out.push({ s, x: p.x, y: railY(line, s, ground), z: p.z, yaw: line.yaw, pitch: railPitch(line, s, ground), length: len });
  }
  return out;
}
