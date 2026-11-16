// Riding the train (lib/state/fleetStore.js boardTrain / leaveTrain, lib/world/train.js, docs/world/train.md): board only where it stands, get off only in a station, and a rider is checked as a car.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const T = await imp('world/train.js');
const { useFleet, fleetRefs } = await imp('state/fleetStore.js');
const { avatarState } = await imp('sim/avatarState.js');
const { modeOf, newMovement, step, SPEED_CAP } = await imp('world/movement.js');
const { bad, total } = problemTally();

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
const line = T.trainLine(manifest.causeways[0]);
fleetRefs.trainLine = line;
const run = T.leg(line).time;
const realNow = Date.now;
const setClock = (sec) => { Date.now = () => sec * 1000; };
const reset = () => { avatarState.vehicle = null; useFleet.setState({ hud: null }); };

try {
  // not at all without a line, nor away from a standing train
  fleetRefs.trainLine = null;
  setClock(1);
  if (useFleet.getState().boardTrain('A')) bad('no line, no boarding', '');
  fleetRefs.trainLine = line;
  setClock(T.TRAIN.dwell + 20); // running
  if (useFleet.getState().boardTrain('A')) bad('you cannot board a train that is running', '');
  setClock(T.TRAIN.dwell - 1); // the last second before it leaves
  if (useFleet.getState().boardTrain('A')) bad('you cannot board in the last seconds', '');
  setClock(1);
  if (useFleet.getState().boardTrain('B')) bad('you cannot board at the station the train is not in', '');
  reset();

  // board at A
  setClock(1);
  if (!useFleet.getState().boardTrain('A')) bad('you board at the mainland station while the train stands there', '');
  const v = avatarState.vehicle;
  if (!v || v.kind !== 'train' || avatarState.x !== v.x || !Number.isFinite(v.y)) bad('a rider is a vehicle of kind train, standing in the train', JSON.stringify(v));
  if (useFleet.getState().boardTrain('A')) bad('a rider cannot board again', '');
  // the doors are shut on the way
  setClock(T.TRAIN.dwell + run / 2);
  if (useFleet.getState().leaveTrain() || useFleet.getState().exit() || !avatarState.vehicle) bad('you cannot get off between the stations', '');
  // the rider is checked as a car by the presence server, and keeps up with it
  if (modeOf({ kind: 'train' }) !== 'car' || T.TRAIN.speed >= SPEED_CAP.car) bad('a rider is moved at a car speed', '');
  const m = newMovement();
  const now0 = 5_000_000;
  let moved = 0, refused = 0, last = null;
  for (let sec = T.TRAIN.dwell; sec < T.TRAIN.dwell + run; sec += 1) {
    const st = T.trainState(line, sec * 1000);
    const p = T.seat(line, st);
    const r = step(m, { x: p.x, z: p.z, veh: { kind: 'train' } }, now0 + sec * 1000);
    if (r.ok) moved++; else refused++;
    last = p;
  }
  if (refused || moved < run) bad('every position the train rider reports for a whole run is accepted as plausible', `${moved} ok, ${refused} refused`);
  void last;
  // get off in the isle's station
  setClock(T.TRAIN.dwell + run + 2);
  if (!useFleet.getState().exit() || avatarState.vehicle) bad('you get off in the isle station', '');
  const stand = T.station(line, 'B');
  if (Math.hypot(avatarState.x - stand.x, avatarState.z - stand.z) > 1e-6) bad('you step out onto the platform', `${avatarState.x} ${avatarState.z}`);
  if (useFleet.getState().hud !== null) bad('the rider panel goes away', '');
  // and ride back
  setClock(T.TRAIN.dwell + run + 2);
  if (!useFleet.getState().boardTrain('B')) bad('you can board at the isle station too', '');
  reset();
  // a clock far in the future still gives a train in a known place
  setClock(1e9);
  const st = T.trainState(line, Date.now());
  if (!(st.s >= line.sA && st.s <= line.sB)) bad('the train is on its line at any time', String(st.s));
} finally {
  Date.now = realNow;
  fleetRefs.trainLine = null;
  reset();
}
total();
