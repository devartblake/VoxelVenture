// Piers and docking: a pier beside every moored boat, a deck you can walk on, a boat that sails itself to the nearest pier when you get out far from the shore,
// and fishing from the end of a pier.
import { imp, problemTally } from './helpers.mjs';
const { generateCity } = await imp('city/cityGenerator.js');
const pr = await imp('city/piers.js');
const dock = await imp('sim/docking.js');
const pm = await imp('city/promenade.js');
const veh = await imp('sim/vehicles.js');
const { buildCollisionMap, isBlocked, moveAvatar } = await imp('sim/collision.js');
const { avatarState } = await imp('sim/avatarState.js');
const fleet = await imp('state/fleetStore.js');
const { bad, total } = problemTally();

const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.02 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.02;
const within = (r, x, z, m = 0) => x > r.x0 + m && x < r.x1 - m && z > r.z0 + m && z < r.z1 - m;
const plotBox = (q) => {
  const c = Math.abs(Math.cos(q.yaw ?? 0));
  const sn = Math.abs(Math.sin(q.yaw ?? 0));
  return { x0: q.x - (q.w * c + q.d * sn) / 2, x1: q.x + (q.w * c + q.d * sn) / 2, z0: q.z - (q.w * sn + q.d * c) / 2, z1: q.z + (q.w * sn + q.d * c) / 2 };
};
const corridor = (r) => (r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - 1.4, z1: r.center + 1.4 } : { x0: r.center - 1.4, x1: r.center + 1.4, z0: r.from, z1: r.to });

// --- the pure rules
if (!dock.segmentHitsRect({ x: 0, z: 0 }, { x: 10, z: 10 }, { x0: 4, x1: 6, z0: 4, z1: 6 }) || dock.segmentHitsRect({ x: 0, z: 0 }, { x: 10, z: 0 }, { x0: 4, x1: 6, z0: 4, z1: 6 }) || !dock.segmentHitsRect({ x: 5, z: 5 }, { x: 20, z: 20 }, { x0: 4, x1: 6, z0: 4, z1: 6 })) bad('a segment is tested against a rectangle', '');
const sample = pr.makePier('p', 'w', { axis: 'x', dir: 1, edge: 0, at: 0, length: 6, boatSide: -1 });
if (sample.x0 !== -0.8 || sample.x1 !== 6 || sample.z0 !== -0.8 || sample.z1 !== 0.8) bad('a pier runs 0.8 onto the land and 6 into the water, 1.6 wide', JSON.stringify(sample));
if (sample.dock.z !== 1.75 || sample.dock.side !== 1 || Math.abs(sample.dock.yaw - Math.PI / 2) > 1e-9) bad('the dock is beside the deck, on the side the moored boat is not, facing along it', JSON.stringify(sample.dock));
if (sample.stand.z !== 0 || !within(sample, sample.stand.x, sample.stand.z) || !within(sample, sample.fish.x, sample.fish.z)) bad('you stand on the deck, and fish from the end of it', '');
const west = pr.makePier('q', 'w', { axis: 'x', dir: -1, edge: 20, at: 5, length: 6, boatSide: 1 });
if (!(west.x0 === 14 && west.x1 === 20.8) || Math.abs(west.dock.yaw + Math.PI / 2) > 1e-9 || west.dock.z !== 3.25) bad('a pier running west', JSON.stringify(west));

// --- piers in cities
const SEEDS = Number(process.env.SEEDS ?? 20);
let piersSeen = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const city = generateCity(seed);
  const { layout, plots, billboards } = city;
  const water = veh.waterRects(layout);
  const boats = layout.boats;
  if (layout.piers.length !== boats.length || boats.length < 2) bad('a pier beside every moored boat', `${seed}: ${layout.piers.length} piers, ${boats.length} boats`);
  const ids = new Set(layout.piers.map((p) => p.id));
  if (ids.size !== layout.piers.length) bad('pier ids are unique', seed);
  for (const p of layout.piers) {
    piersSeen++;
    const w = water.find((q) => q.id === p.waterId);
    if (!w) { bad('a pier is on a lake or the river', `${seed} ${p.id}`); continue; }
    // the tip, the dock and the fishing spot are on the water; the land end is on the bank
    if (!within(w, p.tip.x, p.tip.z, 0.3) || !within(w, p.dock.x, p.dock.z, 0.5) || !within(w, p.fish.x, p.fish.z)) bad('the tip, the dock and the fishing spot are in the water', `${seed} ${p.id}`);
    if (within(w, p.start.x, p.start.z)) bad('the land end of a pier is on the bank', `${seed} ${p.id}`);
    // the dock is clear of the deck (a boat there does not touch it) and the pier lies along the side it says
    if (dock.hitsPier(p.dock.x, p.dock.z, 0.4, [p])) bad('a boat at the dock does not touch the deck', `${seed} ${p.id}`);
    if (!(p.dock.side === 1 || p.dock.side === -1)) bad('the dock has a side', `${seed} ${p.id}`);
    // clear of roads and lots on land
    const deck = pr.deckRect(p);
    if (layout.roads.some((r) => overlap(corridor(r), deck))) bad('a pier is clear of the roads', `${seed} ${p.id}`);
    if (plots.some((q) => overlap(plotBox(q), deck))) bad('a pier is clear of lots', `${seed} ${p.id}`);
    if (billboards.some((b) => b.kind !== 'banner' && within(pr.deckRect(p, 1), b.x, b.z))) bad('a pier is clear of billboards', `${seed} ${p.id}`);
    // the paved landing: it reaches the water's edge, is clear of roads, lots and billboards, and is walkable
    const pz = p.plaza;
    if (!pz) bad('a pier has a landing', `${seed} ${p.id}`);
    else {
      const touchesBank = p.axis === 'x' ? Math.abs((p.dir > 0 ? pz.x1 : pz.x0) - p.edge) < 0.02 || Math.abs((p.dir > 0 ? pz.x0 : pz.x1) - p.edge) < 0.02 : Math.abs((p.dir > 0 ? pz.z1 : pz.z0) - p.edge) < 0.02 || Math.abs((p.dir > 0 ? pz.z0 : pz.z1) - p.edge) < 0.02;
      if (!touchesBank) bad('the landing starts at the edge of the water', `${seed} ${p.id}`);
      if (layout.roads.some((r) => r.id !== 'river-drive' && overlap(corridor(r), pz))) bad('a landing is clear of the roads', `${seed} ${p.id}`);
      if (plots.some((q) => overlap(plotBox(q), pz))) bad('a landing is clear of lots', `${seed} ${p.id}`);
    }
    // the moored boat is not on the deck
    const boat = boats.find((b) => b.water === p.waterId && Math.hypot(b.x - p.x0, b.z - p.z0) < 14);
    if (boat && dock.hitsPier(boat.x, boat.z, 0.4, [p])) bad('a moored boat is not on the pier', `${seed} ${p.id}`);
  }
  // the deck is walkable, the water beside it is not, and you can walk from the shore to the end
  const map = buildCollisionMap(city);
  const free = (x, z) => !isBlocked(x, z, map.rects);
  for (const p of layout.piers) {
    if (!free(p.stand.x, p.stand.z) || !free(p.fish.x, p.fish.z) || !free(p.start.x, p.start.z)) bad('the deck is walkable', `${seed} ${p.id}`);
    const side = p.axis === 'x' ? { x: p.stand.x, z: p.stand.z + 1.6 * p.dock.side } : { x: p.stand.x + 1.6 * p.dock.side, z: p.stand.z };
    if (free(side.x, side.z)) bad('the water beside the deck is not walkable', `${seed} ${p.id}`);
    let pos = { x: p.start.x, z: p.start.z };
    for (let i = 0; i < 120; i++) pos = moveAvatar(pos.x, pos.z, (p.tip.x - pos.x) * 0.1, (p.tip.z - pos.z) * 0.1, map);
    if (Math.hypot(pos.x - p.tip.x, pos.z - p.tip.z) > 0.8) bad('you can walk out along the pier to its end', `${seed} ${p.id}: ${pos.x.toFixed(1)},${pos.z.toFixed(1)}`);
  }
}
// --- the riverwalk, and the estates along the river
let withRiverEstates = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const city = generateCity(seed);
  const { layout, plots, billboards } = city;
  const river = layout.rivers[0];
  const drive = layout.roads.find((r) => r.id === 'river-drive');
  const walks = layout.promenades;
  if (!walks.length) bad('every city has a riverwalk', seed);
  const map = buildCollisionMap(city);
  const side = pm.riverSide(river, drive);
  // lots only on the city side of the drive: none between the drive and the river
  const across = (p) => (drive.axis === 'z' ? p.x - drive.center : p.z - drive.center);
  const riverSideLots = plots.filter((p) => p.districtId === 'riverside' && Math.sign(across(p)) === side);
  if (riverSideLots.length) bad('no lots between the river drive and the water', `${seed}: ${riverSideLots.length}`);
  for (const w of walks) {
    const r = w.rect;
    const len = Math.max(r.x1 - r.x0, r.z1 - r.z0);
    const wid = Math.min(r.x1 - r.x0, r.z1 - r.z0);
    if (len < pm.WALK.minLength || wid < 2 || wid > 4) bad('a riverwalk stretch is long enough and 2 to 4 wide', `${seed} ${w.id}: ${len} x ${wid}`);
    // between the drive and the river
    if (drive.axis === 'z' ? !(r.x0 >= Math.min(river.x1, drive.center) - 1e-6 && r.x1 <= Math.max(river.x0, drive.center) + 1e-6) && !(r.x0 >= river.x1 - 1e-6 && r.x1 <= drive.center + 1e-6) && !(r.x0 >= drive.center - 1e-6 && r.x1 <= river.x0 + 1e-6) : !(r.z0 >= river.z1 - 1e-6 && r.z1 <= drive.center + 1e-6) && !(r.z0 >= drive.center - 1e-6 && r.z1 <= river.z0 + 1e-6)) bad('the riverwalk is between the drive and the river', `${seed} ${w.id}`);
    if (layout.roads.some((q) => overlap(corridor(q), r))) bad('the riverwalk is clear of every road, the bridges and the drive', `${seed} ${w.id}`);
    if (plots.some((q) => overlap(plotBox(q), r))) bad('the riverwalk is clear of lots', `${seed} ${w.id}`);
    if (billboards.some((b) => b.kind !== 'banner' && within(r, b.x, b.z))) bad('the riverwalk is clear of billboards', `${seed} ${w.id}`);
    if (overlap(river, r)) bad('the riverwalk is on land, not in the water', `${seed} ${w.id}`);
    for (const b of w.benches) {
      if (!within(r, b.x, b.z)) bad('a bench is on the paving', `${seed} ${w.id}`);
      // it faces the river
      const face = drive.axis === 'z' ? [Math.sin(b.yaw), 0] : [0, Math.cos(b.yaw)];
      if (Math.sign(face[0] + face[1]) !== side) bad('a bench faces the water', `${seed} ${w.id}`);
      if (!isBlocked(b.x, b.z, map.rects, 0.05)) bad('a bench is solid', `${seed} ${w.id}`);
    }
    for (const l of w.lamps) if (!within(r, l.x, l.z)) bad('a lamp stands on the paving', `${seed} ${w.id}`);
    // you can walk along it: the middle line is free, end to end
    const mid = drive.axis === 'z' ? { x: (r.x0 + r.x1) / 2 } : { z: (r.z0 + r.z1) / 2 };
    const a = drive.axis === 'z' ? r.z0 + 0.5 : r.x0 + 0.5;
    const b2 = drive.axis === 'z' ? r.z1 - 0.5 : r.x1 - 0.5;
    let blocked = 0;
    for (let u = a; u <= b2; u += 0.5) if (isBlocked(drive.axis === 'z' ? mid.x : u, drive.axis === 'z' ? u : mid.z, map.rects, 0.25)) blocked++;
    if (blocked > 0 && !w.benches.length) bad('you can walk along the riverwalk', `${seed} ${w.id}: ${blocked}`);
  }
  // two to four paved stretches' worth of walk: in total a good length of the river
  const total = walks.reduce((n, w) => n + Math.max(w.rect.x1 - w.rect.x0, w.rect.z1 - w.rect.z0), 0);
  if (total < 60) bad('the riverwalk is a good length', `${seed}: ${total}`);
  // luxury and grand estates beside the river
  const nearDrive = (p) => Math.abs(across(p)) < 12 && (drive.axis === 'z' ? p.z : p.x) > drive.from && (drive.axis === 'z' ? p.z : p.x) < drive.to;
  const estates = plots.filter((p) => (p.luxury || p.grand) && nearDrive(p) && Math.sign(across(p)) !== side && p.districtId === 'riverside');
  if (estates.length) withRiverEstates++;
}
if (withRiverEstates < SEEDS * 0.7) bad('most cities have luxury or grand estates beside the river', `${withRiverEstates} of ${SEEDS}`);
if (piersSeen < SEEDS * 2) bad('every city has piers', String(piersSeen));

// --- docking: a boat anywhere on the water finds its way to the nearest pier on that water and comes to rest alongside it
const city = generateCity(20260101);
const { layout } = city;
const water = veh.waterRects(layout);
const canMove = (x, z, r) => veh.inWater(x, z, water, r * 0.6) && !dock.hitsPier(x, z, r * 0.8, layout.piers);
let docked = 0;
let tried = 0;
for (const w of water) {
  const piersHere = layout.piers.filter((p) => p.waterId === w.id);
  if (!piersHere.length) { bad('every lake and the river has a pier', w.id); continue; }
  // a handful of starting places spread over the water (the river is long: a few along its length)
  const spots = [];
  for (let i = 0; i < 9; i++) spots.push({ x: w.x0 + 0.5 + ((w.x1 - w.x0 - 1) * ((i * 37) % 100)) / 100, z: w.z0 + 0.5 + ((w.z1 - w.z0 - 1) * ((i * 61) % 100)) / 100 });
  for (const s of spots) {
    if (!canMove(s.x, s.z, 0.5) || piersHere.some((p) => dock.hitsPier(s.x, s.z, 0.5, [p]))) continue;
    tried++;
    for (const yaw of [0, 2.2, 4.4]) {
      const v = { kind: 'boat', x: s.x, z: s.z, yaw, speed: 0 };
      const pier = dock.nearestPier(v, layout.piers, water);
      if (!pier || pier.waterId !== w.id) { bad('the nearest pier is on the same water', `${w.id} ${pier?.id}`); continue; }
      const best = Math.min(...piersHere.map((p) => Math.hypot(p.dock.x - v.x, p.dock.z - v.z)));
      if (Math.abs(Math.hypot(pier.dock.x - v.x, pier.dock.z - v.z) - best) > 1e-9) bad('the pier chosen is the nearest', w.id);
      const st = dock.startDocking(v, pier);
      let t = 0;
      let done = false;
      let failed = false;
      let touched = false;
      for (; t < 150 && !done && !failed; t += 0.05) {
        const ap = dock.autopilot(v, st, 0.05);
        veh.stepVehicle(v, { throttle: ap.throttle, steer: ap.steer }, 0.05, canMove);
        if (dock.hitsPier(v.x, v.z, 0.2, layout.piers)) touched = true;
        done = ap.done;
        failed = ap.failed;
      }
      if (!done) bad('the boat reaches the dock and stops', `${w.id} from ${s.x.toFixed(1)},${s.z.toFixed(1)} yaw ${yaw}: ${failed ? 'stuck' : 'too slow'} ${t.toFixed(0)}s, at ${v.x.toFixed(1)},${v.z.toFixed(1)}, dock ${pier.dock.x},${pier.dock.z}`);
      else {
        docked++;
        if (Math.hypot(v.x - pier.dock.x, v.z - pier.dock.z) > 1.2) bad('it lies at the dock', `${w.id} ${Math.hypot(v.x - pier.dock.x, v.z - pier.dock.z).toFixed(2)}`);
        if (Math.abs(v.speed) > 0.3) bad('it has stopped', String(v.speed));
        const along = Math.abs(Math.cos(v.yaw - pier.dock.yaw));
        if (along < 0.9) bad('it lies along the pier', `${along.toFixed(2)}`);
        if (t > 120) bad('docking takes under two minutes', t.toFixed(0));
      }
      if (touched) bad('the boat never sails through the deck', `${w.id} from ${s.x.toFixed(1)},${s.z.toFixed(1)}`);
    }
  }
}
if (tried < 10 || docked < tried * 3 * 0.95) bad('docking works from nearly everywhere on the water', `${docked} of ${tried * 3}`);

// --- getting out of a boat: on the shore at once, otherwise it sails to a pier and you step onto the deck
{
  const map = buildCollisionMap(city);
  fleet.fleetRefs.collision = map;
  fleet.fleetRefs.water = water;
  fleet.fleetRefs.piers = layout.piers;
  const boat = layout.boats.find((b) => b.water.startsWith('lake'));
  const lake = water.find((w) => w.id === boat.water);
  const store = fleet.useFleet.getState();
  // from the middle of the lake
  store.enterBoat(boat);
  const v = avatarState.vehicle;
  if (!v || v.kind !== 'boat') bad('you can get into a boat', '');
  v.x = (lake.x0 + lake.x1) / 2 + 0.5;
  v.z = (lake.z0 + lake.z1) / 2;
  v.yaw = 1;
  avatarState.x = v.x;
  avatarState.z = v.z;
  const first = fleet.useFleet.getState().exit();
  if (first !== 'docking') bad('out on the water, leaving sends the boat to a pier', String(first));
  if (!avatarState.vehicle || !fleet.fleetRefs.dock) bad('you are still in the boat while it sails', '');
  if (fleet.useFleet.getState().exit() !== 'docking') bad('asking again while it sails changes nothing', '');
  let t = 0;
  for (; t < 120 && avatarState.vehicle; t += 0.05) {
    const ap = dock.autopilot(v, fleet.fleetRefs.dock, 0.05);
    veh.stepVehicle(v, { throttle: ap.throttle, steer: ap.steer }, 0.05, canMove);
    avatarState.x = v.x;
    avatarState.z = v.z;
    if (ap.done) fleet.useFleet.getState().finishDock();
  }
  if (avatarState.vehicle) bad('the boat docks and you get out', `${t.toFixed(0)}s`);
  else {
    const p = layout.piers.find((q) => q.waterId === lake.id);
    const onDeck = within(pr.deckRect(p, 0.2), avatarState.x, avatarState.z);
    if (!onDeck) bad('you step out onto the pier', `${avatarState.x.toFixed(1)},${avatarState.z.toFixed(1)}`);
    if (isBlocked(avatarState.x, avatarState.z, map.rects)) bad('you are not stuck in anything', '');
    const left = fleet.useFleet.getState().moved[boat.id];
    if (!left || Math.hypot(left.x - p.dock.x, left.z - p.dock.z) > 1.2) bad('the boat is left tied up at the dock', JSON.stringify(left));
    if (fleet.fleetRefs.dock) bad('the docking is over', '');
    if (fleet.useFleet.getState().hud !== null) bad('the boat panel goes away', '');
  }
  // taking the wheel stops it
  fleet.useFleet.getState().enterBoat(boat);
  const v2 = avatarState.vehicle;
  v2.x = (lake.x0 + lake.x1) / 2 + 0.5;
  v2.z = (lake.z0 + lake.z1) / 2;
  fleet.useFleet.getState().exit();
  if (!fleet.fleetRefs.dock) bad('it sets off again', '');
  fleet.useFleet.getState().cancelDock();
  if (fleet.fleetRefs.dock) bad('taking the wheel cancels the docking', '');
  fleet.useFleet.getState().reset();
  // next to the shore: you get out at once (no pier needed)
  fleet.fleetRefs.collision = map;
  fleet.fleetRefs.water = water;
  fleet.fleetRefs.piers = layout.piers;
  fleet.useFleet.getState().enterBoat(boat);
  const v3 = avatarState.vehicle;
  v3.x = lake.x0 + 1.0;
  v3.z = (lake.z0 + lake.z1) / 2 + 2;
  v3.yaw = 0;
  const out = fleet.useFleet.getState().exit();
  if (out !== true || avatarState.vehicle) bad('beside the shore you step out at once', String(out));
  fleet.useFleet.getState().reset();
  // no pier on that water: it says so (false) and you stay in
  fleet.fleetRefs.collision = map;
  fleet.fleetRefs.water = water;
  fleet.fleetRefs.piers = [];
  fleet.useFleet.getState().enterBoat(boat);
  const v4 = avatarState.vehicle;
  v4.x = (lake.x0 + lake.x1) / 2 + 0.5;
  v4.z = (lake.z0 + lake.z1) / 2;
  if (fleet.useFleet.getState().exit() !== false || !avatarState.vehicle) bad('with no pier and no shore in reach you stay in, told why', '');
  fleet.useFleet.getState().reset();
}

// --- fishing from a pier on foot: the same line
{
  fleet.fleetRefs.piers = layout.piers;
  const p = layout.piers[0];
  avatarState.vehicle = null;
  avatarState.x = p.fish.x;
  avatarState.z = p.fish.z;
  const rnd = () => 0.3;
  const cast = fleet.useFleet.getState().pierFish(p, rnd);
  if (cast?.event !== 'cast' || fleet.fleetRefs.line.phase !== 'waiting' || fleet.fleetRefs.pierFishing?.pier !== p) bad('you can cast from the end of a pier', JSON.stringify(cast));
  let bite = null;
  for (let i = 0; i < 400 && !bite; i++) bite = veh.tickLine(fleet.fleetRefs.line, 0.05);
  if (bite !== 'bite') bad('a fish bites', String(bite));
  const caught = fleet.useFleet.getState().pierFish(p, rnd);
  if (caught?.event !== 'caught' || !caught.fish) bad('reeling in on a bite catches the fish', JSON.stringify(caught));
  const again = fleet.useFleet.getState().pierFish(p, rnd);
  fleet.useFleet.getState().stopPierFishing();
  if (fleet.fleetRefs.pierFishing || fleet.fleetRefs.line.phase !== 'idle') bad('walking away reels the line in', '');
  if (again?.event !== 'cast') bad('then you can cast again', JSON.stringify(again));
  avatarState.vehicle = { kind: 'boat' };
  if (fleet.useFleet.getState().pierFish(p, rnd) !== null) bad('you cannot fish from a pier while in a boat', '');
  avatarState.vehicle = null;
}
if (veh.FISHING.biteWindow < 2) bad('a bite lasts long enough to react to', String(veh.FISHING.biteWindow));

console.log(`${withRiverEstates} of ${SEEDS} cities have river estates; ${piersSeen} piers in ${SEEDS} cities; ${docked} of ${tried * 3} docking runs`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
