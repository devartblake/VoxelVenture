// The train on the first causeway (lib/world/train.js, docs/world/train.md): the line, the timetable, the cars and the rules for boarding.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const T = await imp('world/train.js');
const { SPEED_CAP } = await imp('world/movement.js');
const { HIGHWAY } = await imp('world/highways.js');
const { PROP_CATALOG } = await imp('content/propCatalog.js');
const { bad, total } = problemTally();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
const causeway = manifest.causeways[0];
const line = T.trainLine(causeway);

// ---- the line
if (line.id !== 'harbor-causeway' || Math.abs(line.length - causeway.length) > 0.1) bad('the line is the first causeway (Harbor Causeway)', line.id);
if (!(line.sA > 0 && line.sB < line.length && line.sB - line.sA > 300)) bad('the stations are on land, well apart', `${line.sA} ${line.sB}`);
if (!(line.deckFrom > line.sA && line.deckFrom + line.bridgeLen < line.sB + 1)) bad('both stations stand on land, before and after the bridge', `${line.sA} ${line.deckFrom} ${line.bridgeLen} ${line.sB}`);
const deckHalf = (HIGHWAY.width + 2) / 2;
if (T.TRAIN.lateral + (T.TRAIN.scale * 1.4) / 2 > deckHalf) bad('the train stays on the deck (the deck is 8 wide)', String(deckHalf));
if (T.TRAIN.lateral - (T.TRAIN.scale * 1.4) / 2 < 0.3) bad('the train does not stand on the road centre line', '');
const mid = T.pointAt(line, line.length / 2);
const cx = (line.a.x + line.b.x) / 2, cz = (line.a.z + line.b.z) / 2;
if (Math.abs(Math.hypot(mid.x - cx, mid.z - cz) - T.TRAIN.lateral) > 1e-6) bad('the rail runs parallel to the causeway, 2.5 to its side', '');
if (Math.abs(T.railY(line, 0) - T.LAND_LIFT) > 1e-6 || Math.abs(T.railY(line, 0, () => 0.5) - (0.5 + T.LAND_LIFT)) > 1e-6 || T.railY(line, line.deckFrom + line.bridgeLen / 2) < causeway.clearance - 0.5 || T.railY(line, line.length) > 0.2) bad('the rail is at ground level on the shore and arches to the clearance over the water', `${T.railY(line, line.deckFrom + line.bridgeLen / 2)}`);

// ---- the timetable
const run = T.leg(line).time;
const cycle = T.cycleSeconds(line);
if (!(run > 40 && run < 120) || Math.abs(cycle - 2 * (T.TRAIN.dwell + run)) > 1e-9) bad('a run is a minute or so', String(run));
if (T.TRAIN.speed >= SPEED_CAP.car) bad('the train is slower than a car (a rider is sent to the presence check as a car)', '');
const at = (sec) => T.trainState(line, sec * 1000);
if (at(0).at !== 'A' || at(0).s !== line.sA || at(T.TRAIN.dwell + 0.01).at !== null) bad('it starts in the mainland station and leaves after the dwell', JSON.stringify(at(0)));
if (at(T.TRAIN.dwell + run + 1).at !== 'B' || Math.abs(at(T.TRAIN.dwell + run + 1).s - line.sB) > 1e-6) bad('it stops in the isle station', JSON.stringify(at(T.TRAIN.dwell + run + 1)));
if (at(cycle - 0.01).at !== null || at(cycle + 0.5).at !== 'A') bad('it comes back to the mainland station and the cycle repeats', '');
let prev = at(0), worst = 0, maxSpeed = 0, outside = 0, ups = 0, downs = 0;
for (let t = 0.1; t < cycle * 2 + 5; t += 0.1) {
  const s = at(t);
  worst = Math.max(worst, Math.abs(s.s - prev.s) / 0.1);
  maxSpeed = Math.max(maxSpeed, s.speed);
  if (s.s < line.sA - 1e-6 || s.s > line.sB + 1e-6) outside++;
  if (s.dir === 1 && prev.dir === -1) ups++;
  if (s.dir === -1 && prev.dir === 1) downs++;
  prev = s;
}
if (worst > T.TRAIN.speed * 1.02) bad('it never jumps: no step is faster than the cruise speed', String(worst));
if (Math.abs(maxSpeed - T.TRAIN.speed) > 0.2) bad('it reaches the cruise speed', String(maxSpeed));
if (outside) bad('it stays between the stations', String(outside));
if (ups < 2 || downs < 2) bad('it goes back and forth', `${ups} ${downs}`);
// speed up and slow down: at the start of a run it is slow, in the middle at full speed
if (!(at(T.TRAIN.dwell + 2).speed < T.TRAIN.speed * 0.5 && Math.abs(at(T.TRAIN.dwell + run / 2).speed - T.TRAIN.speed) < 0.01 && at(T.TRAIN.dwell + run - 2).speed < T.TRAIN.speed * 0.5)) bad('it speeds up and slows down', '');
// everyone sees the same: a function of the clock only
if (JSON.stringify(T.trainState(line, 123456789)) !== JSON.stringify(T.trainState(line, 123456789))) bad('the state is a function of the time', '');
if (T.trainState(line, -5000).s < line.sA || T.trainState(line, 1e12).s < line.sA) bad('any time, even a negative one, gives a place on the line', '');
// a short line still works (a run too short to reach the cruise speed)
const short = T.trainLine({ ...causeway, points: [causeway.points[0], { x: causeway.points[0].x + 60, z: causeway.points[0].z }], length: 60, bridge: 10, span: { from: { x: causeway.points[0].x + 25, z: causeway.points[0].z } } });
if (!(T.leg(short).peak < T.TRAIN.speed) || !Number.isFinite(T.trainState(short, 31000).s)) bad('a short line is a triangle of speed', '');

// ---- the cars
const st = at(T.TRAIN.dwell + run / 2);
const consist = T.cars(line, st);
if (consist.length !== 4 || consist[0].model !== 'train-electric-bullet-a' || consist[3].model !== 'train-electric-bullet-a' || consist[1].model !== 'train-electric-bullet-b') bad('a nose at each end and two middle cars', consist.map((c) => c.model).join());
if (Math.abs(Math.abs(consist[0].yaw - consist[3].yaw) - Math.PI) > 1e-9) bad('the two noses face opposite ways', '');
if (consist.some((c, i) => i && Math.abs(c.s - consist[i - 1].s - T.TRAIN.spacing) > 1e-9)) bad('the cars stand 4.6 apart along the line', '');
if (Math.abs((consist[0].s + consist[3].s) / 2 - st.s) > 1e-9) bad('the train is centred on its place', '');
if (consist.some((c) => !Number.isFinite(c.x + c.y + c.z + c.pitch))) bad('every car has a place', '');
const steep = Math.max(...Array.from({ length: 400 }, (_, i) => Math.abs(T.railPitch(line, (i * line.length) / 400))));
if (steep > 0.3) bad('the bridge ramps are not too steep for a train (pitch under 0.3 radians)', String(steep));
// a rider stands in the train and turns with it
const rider = T.seat(line, st);
if (rider.s < consist[0].s || rider.s > consist[3].s || rider.y < T.railY(line, rider.s)) bad('a rider stands inside the train, above the floor', '');
const back = T.seat(line, { ...st, dir: -1 });
if (Math.abs(Math.abs(back.yaw - rider.yaw) - Math.PI) > 1e-9) bad('a rider faces the way the train goes', '');

// ---- the stations
const A = T.station(line, 'A'), B = T.station(line, 'B');
if (A.name !== 'Mainland Station' || B.name !== 'Harbor Isle Station' || Math.hypot(A.x - B.x, A.z - B.z) < 300) bad('two stations, one at each end', '');
const railA = T.pointAt(line, line.sA);
if (Math.abs(Math.hypot(A.x - railA.x, A.z - railA.z) - T.TRAIN.platform) > 1e-6) bad('the platform is beside the rail', '');
const ds = (p) => Math.abs((p.x - cx) * line.normal.x + (p.z - cz) * line.normal.z);
if (ds(A) < deckHalf - 0.2) bad('the platform is on the far side of the rail from the road', '');
if (!T.canBoard(at(1), 'A') || T.canBoard(at(1), 'B') || T.canBoard(at(T.TRAIN.dwell - 1), 'A') || T.canBoard(st, 'A')) bad('you board only where the train stands, and not in its last seconds', '');
if (!T.canLeave(at(1)) || T.canLeave(st)) bad('a rider can get off only in a station', '');

// ---- the rail
const tiles = T.railTiles(line);
if (tiles.length < 40 || tiles.some((t) => !Number.isFinite(t.x + t.y + t.z))) bad('about fifty rail tiles', String(tiles.length));
if (tiles.some((t, i) => i && Math.abs(Math.hypot(t.x - tiles[i - 1].x, t.z - tiles[i - 1].z) - tiles[0].length) > 1e-6)) bad('the tiles meet end to end', '');
if (tiles[0].s - tiles[0].length / 2 > line.sA - 11.9 || tiles.at(-1).s + tiles[0].length / 2 < line.sB + 11.9) bad('the rail runs a little past each station', '');
// the models: the kit's three, in the prop catalogue and shipped
for (const id of T.TRAIN_MODEL_IDS) {
  const e = PROP_CATALOG.find((m) => m.id === id);
  if (!e || !fs.existsSync(path.join(root, 'apps/web/public', e.url))) bad('every model of the train is in the catalogue and shipped', id);
}
console.log(`train: a ${run.toFixed(0)} s run, a ${cycle.toFixed(0)} s cycle, ${tiles.length} rail tiles, bridge ramps at most ${steep.toFixed(2)} rad`);
total();
