// The train through the tunnel (lib/world/tunnel.js tunnelTrainLine, lib/world/train.js, docs/world/tunnel.md): a second line, on the rail side of the tube, with a station outside each portal. Riding it: the rail
// goes down the ramp, runs level under the sea and comes up; the rider is at the rail's height and inside the tube; the presence server accepts every position of the ride; the camera is pulled in there.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const T = await imp('world/train.js');
const { tunnelTrainLine, TUNNEL_LINE } = await imp('world/tunnel.js');
const { TUNNEL, floorY } = await imp('world/tunnelSpec.js');
const { SEA_LEVEL } = await imp('world/datum.js');
const { useFleet, fleetRefs, trainLineOf } = await imp('state/fleetStore.js');
const { avatarState } = await imp('sim/avatarState.js');
const { modeOf, newMovement, step, SPEED_CAP } = await imp('world/movement.js');
const { bad, total } = problemTally();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
const mt = manifest.tunnels[0];
const line = tunnelTrainLine(mt), first = T.trainLine(manifest.causeways[0]);

// ---- the line
if (line.id === first.id || line.lateral !== TUNNEL.lateral + TUNNEL.railOffset || !line.tunnel || line.tunnel.s0 !== mt.s0) bad('a second line, in the middle of the tube', JSON.stringify([line.id, line.lateral]));
if (!(line.sA === mt.s0 - TUNNEL_LINE.station && line.sB === mt.s1 + TUNNEL_LINE.station)) bad('a station outside each portal', JSON.stringify([line.sA, line.sB]));
if (T.station(line, 'A').name === T.station(first, 'A').name || T.station(line, 'B').name === T.station(first, 'B').name) bad('the stations have the tunnel line\'s own names', '');
// the rail: on the ground at the stations, on the tube's road between the portals, never above the road or under it
const ground = () => TUNNEL.ground; // the shore at the portals
const yAt = (s) => T.railY(line, s, ground);
if (Math.abs(yAt(line.sA) - (TUNNEL.ground + T.LAND_LIFT)) > 1e-9 || Math.abs(yAt(line.sB) - (TUNNEL.ground + T.LAND_LIFT)) > 1e-9) bad('the stations are on the ground', `${yAt(line.sA)} ${yAt(line.sB)}`);
for (let s = mt.s0; s <= mt.s1; s += 3) if (Math.abs(yAt(s) - (floorY(mt, s) + T.LAND_LIFT)) > 1e-9) { bad('between the portals the rail lies on the tube\'s road', String(s)); break; }
if (Math.abs(yAt(mt.line.length / 2) - (TUNNEL.floor + T.LAND_LIFT)) > 1e-9) bad('level at the full depth under the sea', '');
// the rail is under the sea level between the shores and inside the tube's walls the whole way
for (let s = mt.s0; s <= mt.s1; s += 2) {
  const p = T.pointAt(line, s), c = { x: mt.line.a.x + mt.line.dir.x * s + mt.line.normal.x * (TUNNEL.lateral + TUNNEL.railOffset), z: mt.line.a.z + mt.line.dir.z * s + mt.line.normal.z * (TUNNEL.lateral + TUNNEL.railOffset) };
  if (Math.hypot(p.x - c.x, p.z - c.z) > 1e-3) { bad('the rail runs along the tube\'s centre', String(s)); break; }
}
if (!(yAt(line.deckFrom === Infinity ? mt.line.length / 2 : 0) < SEA_LEVEL)) bad('the rail under the sea is under the water', '');
const steepest = Math.max(...Array.from({ length: 400 }, (_, i) => Math.abs(T.railPitch(line, mt.s0 + i * 1.5, ground))));
if (steepest > 0.0802 + 1e-3) bad('no steeper than the ramp\'s 0.08 grade', String(steepest));

// ---- the timetable runs as for any line, at a speed the presence server accepts
const run = T.leg(line).time;
if (!(run > 100 && run < 160)) bad('a ride of about two minutes', String(run));
if (T.trainState(line, 0).at !== 'A' || T.trainState(line, (T.TRAIN.dwell + run / 2) * 1000).at !== null) bad('it stands in station A, then runs', '');
const m = newMovement(), now0 = 5_000_000;
let refused = 0;
for (let sec = T.TRAIN.dwell; sec < T.TRAIN.dwell + run; sec += 1) { const p = T.seat(line, T.trainState(line, sec * 1000)); if (!step(m, { x: p.x, z: p.z, veh: { kind: 'train' } }, now0 + sec * 1000).ok) refused++; }
if (refused || modeOf({ kind: 'train' }) !== 'car' || T.TRAIN.speed >= SPEED_CAP.car) bad('every position of the tunnel ride is accepted as plausible', `${refused} refused`);

// ---- boarding and riding it (lib/state/fleetStore.js)
const realNow = Date.now;
const setClock = (sec) => { Date.now = () => sec * 1000; };
try {
  fleetRefs.trainLines = [first, line];
  fleetRefs.trainLine = first;
  if (trainLineOf(line.id) !== line || trainLineOf(null) !== first) bad('a line is found by its id, the first when none is given', '');
  avatarState.vehicle = null;
  setClock(1);
  if (!useFleet.getState().boardTrain('A', line.id)) bad('you board the tunnel train at its station', '');
  const v = avatarState.vehicle;
  if (!v || v.lineId !== line.id || !(v.y < TUNNEL.ground + 1) || Math.abs(v.y - (yAt(line.sA - T.TRAIN.spacing * 0.5) + 0.45)) > 0.3) bad('the rider is on the tunnel line, at its rail\'s height', JSON.stringify(v));
  setClock(T.TRAIN.dwell + run / 2);
  if (useFleet.getState().leaveTrain()) bad('you cannot get off between the stations', '');
  // in the middle of the ride the rider is inside the tube, below the sea
  const mid = T.seat(line, T.trainState(line, (T.TRAIN.dwell + run / 2) * 1000));
  if (!(mid.y < SEA_LEVEL - 4) || Math.abs(mid.y - (TUNNEL.floor + T.LAND_LIFT + 0.45)) > 0.05) bad('mid-ride the rider is at the bottom of the tube', String(mid.y));
  setClock(T.TRAIN.dwell + run + 2);
  if (!useFleet.getState().exit() || avatarState.vehicle) bad('you get off at the isle tunnel station', '');
  const stand = T.station(line, 'B');
  if (Math.hypot(avatarState.x - stand.x, avatarState.z - stand.z) > 1e-6) bad('you step out onto its platform', '');
} finally {
  Date.now = realNow;
  fleetRefs.trainLine = null;
  fleetRefs.trainLines = [];
  avatarState.vehicle = null;
  useFleet.setState({ hud: null });
}
console.log(`tunnel train: a ${run.toFixed(0)}-second ride, ${(mt.length / 1).toFixed(0)} units portal to portal, stations ${(line.sB - line.sA).toFixed(0)} apart`);
total();
