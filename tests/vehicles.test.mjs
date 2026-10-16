// Driving, sailing and fishing: the rules (lib/sim/vehicles.js), the boats in the city, and what a catch does to the store.
import { imp, problemTally } from './helpers.mjs';
const { generateCity } = await imp('city/cityGenerator.js');
const { buildCollisionMap, isBlocked } = await imp('sim/collision.js');
const v = await imp('sim/vehicles.js');
const { useCityStore } = await imp('state/store.js');
const { bad, total } = problemTally();

// a small seeded random, so the test is repeatable
const rng = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---- boats in the city
let boats = 0;
for (let seed = 1; seed <= 40; seed++) {
  const { layout } = generateCity(seed);
  const water = v.waterRects(layout);
  if (!layout.boats.length) bad('every city has boats', seed);
  const ids = new Set(layout.boats.map((b) => b.id));
  if (ids.size !== layout.boats.length) bad('boat ids are unique', seed);
  for (const b of layout.boats) {
    boats++;
    if (!v.inWater(b.x, b.z, water, 0.9)) bad('boats float on water, off the bank', `${seed} ${b.id}`);
    if (!['rowboat', 'rowboat-large', 'fishing'].includes(b.kind)) bad('boats are rowboats, large rowboats or fishing boats', b.kind);
    if (layout.bridges.some((br) => (br.axis === 'x' ? Math.abs(b.z - br.center) < 5 && b.x > br.u0 - 4 && b.x < br.u1 + 4 : Math.abs(b.x - br.center) < 5 && b.z > br.u0 - 4 && b.z < br.u1 + 4))) bad('boats are moored clear of the bridges', `${seed} ${b.id}`);
  }
  if (!layout.lakes.every((l) => layout.boats.some((b) => b.water === l.id))) bad('every lake has a boat', seed);
  if (layout.boats.filter((b) => b.water === 'river-1').length < 1) bad('the river has a boat', seed);
}

// ---- driving
{
  const city = generateCity(3);
  const map = buildCollisionMap(city);
  const canMove = (x, z, r) => !isBlocked(x, z, map.rects, r) && x > map.bounds.x0 && x < map.bounds.x1 && z > map.bounds.z0 && z < map.bounds.z1;
  // flat out for a while: it speeds up to its top speed, never past it
  const car = { kind: 'car', x: 0, z: 0, yaw: 0, speed: 0 };
  const free = () => true;
  for (let i = 0; i < 100; i++) v.stepVehicle(car, { throttle: 1, steer: 0 }, 0.05, free);
  if (!(car.speed > 6.5 && car.speed <= v.VEHICLES.car.maxSpeed + 1e-9)) bad('a car reaches its top speed and no more', car.speed);
  if (!(car.z > 20 && Math.abs(car.x) < 1e-9)) bad('a car drives the way it points', `${car.x},${car.z}`);
  for (let i = 0; i < 40; i++) v.stepVehicle(car, { throttle: -1, steer: 0 }, 0.05, free);
  if (car.speed > 0.01) bad('braking stops a car and does not reverse it past the reverse limit', car.speed);
  const still = { kind: 'car', x: 0, z: 0, yaw: 0, speed: 0 };
  for (let i = 0; i < 40; i++) v.stepVehicle(still, { throttle: 0, steer: 1 }, 0.05, free);
  if (Math.abs(still.yaw) > 1e-9) bad('a car cannot turn on the spot', still.yaw);
  const turning = { kind: 'car', x: 0, z: 0, yaw: Math.PI, speed: 5 };
  for (let i = 0; i < 20; i++) v.stepVehicle(turning, { throttle: 0.7, steer: 1 }, 0.05, free);
  if (!(turning.yaw < Math.PI - 0.2)) bad('steering right turns the car clockwise (north towards east)', turning.yaw);
  // a rampage over the whole city: never inside a building, the lake or the river
  const random = rng(7);
  const rampage = { kind: 'car', x: 0, z: 0, yaw: 0, speed: 0 };
  const start = city.layout.roads.find((r) => r.kind === 'avenue' && r.class === 'arterial');
  rampage.x = (start.from + start.to) / 2;
  rampage.z = start.center;
  let inside = 0;
  let steer = 0;
  for (let i = 0; i < 20000; i++) {
    if (i % 25 === 0) steer = random() * 2 - 1;
    v.stepVehicle(rampage, { throttle: 0.4 + random() * 0.6, steer }, 0.05, canMove);
    if (isBlocked(rampage.x, rampage.z, map.rects, 0.49)) inside++;
  }
  if (inside) bad('a car is never inside anything solid', `${inside} steps`);

  // boats stay on the water
  const water = v.waterRects(city.layout);
  const boat = { kind: 'boat', x: city.layout.boats[0].x, z: city.layout.boats[0].z, yaw: 0, speed: 0 };
  let dry = 0;
  for (let i = 0; i < 20000; i++) {
    if (i % 25 === 0) steer = random() * 2 - 1;
    v.stepVehicle(boat, { throttle: 0.5 + random() * 0.5, steer }, 0.05, (x, z, r) => v.inWater(x, z, water, r * 0.6));
    if (!v.inWater(boat.x, boat.z, water, 0)) dry++;
  }
  if (dry) bad('a boat never leaves the water', `${dry} steps`);
  if (!(Math.hypot(boat.x - city.layout.boats[0].x, boat.z - city.layout.boats[0].z) > 0.5)) bad('a boat can sail', 'it did not move');
}

// ---- fishing
{
  const rand = rng(11);
  const line = v.newLine();
  if (v.pullLine(line, rand).event !== 'cast' || line.phase !== 'waiting') bad('the first press casts', line.phase);
  if (v.pullLine(line, rand).event !== 'reeled-empty' || line.phase !== 'idle') bad('reeling in before a bite gets nothing', line.phase);
  // a bite arrives within the wait, and gets away if you are slow
  v.pullLine(line, rand);
  let t = 0, bite = null;
  while (!bite && t < 30) { bite = v.tickLine(line, 0.1); t += 0.1; }
  if (bite !== 'bite' || t < v.FISHING.waitMin - 0.11 || t > v.FISHING.waitMax + 0.2) bad('a bite comes after 3-9 seconds', `${t.toFixed(1)}s ${bite}`);
  let gone = null;
  for (let i = 0; i < 30 && !gone; i++) gone = v.tickLine(line, 0.1);
  if (gone !== 'escaped' || line.phase !== 'idle') bad('a fish that is not reeled in gets away', String(gone));
  // reeling in on the bite catches the fish
  v.pullLine(line, rand);
  while (v.tickLine(line, 0.1) !== 'bite');
  const got = v.pullLine(line, rand);
  if (got.event !== 'caught' || !v.FISH_BY_ID[got.fish.id]) bad('reeling in on a bite catches a fish', JSON.stringify(got));
  // the catch table: everything is possible, the rare ones are rare, and the average pay is modest
  const counts = {};
  const random = rng(5);
  let gold = 0;
  for (let i = 0; i < 20000; i++) {
    const f = v.pickFish(random);
    counts[f.id] = (counts[f.id] ?? 0) + 1;
    gold += f.gold;
  }
  if (v.FISH.some((f) => !counts[f.id])) bad('every fish can be caught', JSON.stringify(counts));
  if (!(counts.koi < counts.minnow / 8)) bad('golden koi are rare', JSON.stringify(counts));
  if (!(gold / 20000 > 3 && gold / 20000 < 10)) bad('an average catch pays 3-10 Gold', String(gold / 20000));
}

// ---- what a catch does to the store: it pays, and the day's fishing is capped
{
  const s = useCityStore.getState();
  s.setDay('2026-10-12');
  const before = useCityStore.getState().gold;
  const koi = v.FISH_BY_ID.koi;
  const paid = useCityStore.getState().catchFish(koi);
  if (paid !== 40 || useCityStore.getState().gold !== before + 40) bad('a catch pays its Gold', `${paid}`);
  let total = paid;
  for (let i = 0; i < 6; i++) total += useCityStore.getState().catchFish(koi);
  if (total !== v.FISH_DAILY_CAP) bad(`fishing pays at most ${v.FISH_DAILY_CAP} Gold a day`, String(total));
  if (useCityStore.getState().fishing.caught.koi !== 7) bad('every catch is counted, even over the limit', String(useCityStore.getState().fishing.caught.koi));
  if (useCityStore.getState().catchFish(v.FISH_BY_ID.boot) !== 0) bad('an old boot pays nothing', '');
  useCityStore.getState().setDay('2026-10-13');
  if (useCityStore.getState().catchFish(koi) !== 40) bad('the limit resets the next day', '');
}

// ---- a car left parked in a lane: traffic stops behind it and is towed after a while, nothing drives through it
{
  const { createTraffic } = await imp('sim/traffic.js');
  const city = generateCity(2);
  const sim = createTraffic(city.layout, { seed: 2, maxCars: 40, maxWalkers: 10 });
  let t = 0;
  for (; t < 40; t += 0.05) sim.update(0.05, t);
  // (a car whose spot 7 units ahead is not at a junction: cross traffic may legitimately pass through a junction)
  const atJunction = (x, z) => city.layout.intersections.some((i) => Math.hypot(i.x - x, i.z - z) < 7);
  const car = sim.cars.find((c) => c.mode === 'lane' && c.v > 1.5 && !atJunction(c.x + Math.sin(c.yaw) * 7, c.z + Math.cos(c.yaw) * 7));
  if (!car) bad('a moving car to test with', '');
  else {
    sim.obstacles.push({ x: car.x + Math.sin(car.yaw) * 7, z: car.z + Math.cos(car.yaw) * 7 });
    const o = sim.obstacles[0];
    let closest = Infinity;
    const id = car.id;
    let stopped = false;
    for (let k = 0; k < 40; k += 0.05, t += 0.05) {
      sim.update(0.05, t);
      for (const c of sim.cars) closest = Math.min(closest, Math.hypot(c.x - o.x, c.z - o.z));
      const me = sim.cars.find((c) => c.id === id);
      if (me && me.v < 0.05) stopped = true;
    }
    if (closest < 1.3) bad('traffic never drives through a parked car', closest.toFixed(2));
    if (!stopped) bad('the car behind a parked car stops', '');
    if (sim.cars.some((c) => c.id === id)) bad('a car stuck behind a parked car is towed', '');
  }
}

// walkers go round a parked car
{
  const { createTraffic } = await imp('sim/traffic.js');
  const city = generateCity(3);
  const sim = createTraffic(city.layout, { seed: 3, maxCars: 6, maxWalkers: 60 });
  let t = 0;
  for (; t < 20; t += 0.05) sim.update(0.05, t);
  const w = sim.walkers.find((q) => !q.waiting);
  sim.obstacles.push({ x: w.x + 0.5, z: w.z });
  const o = sim.obstacles[0];
  let closest = Infinity;
  for (let k = 0; k < 40; k += 0.05, t += 0.05) {
    sim.update(0.05, t);
    for (const q of sim.walkers) closest = Math.min(closest, Math.hypot(q.x - o.x, q.z - o.z));
  }
  if (closest < 1.1) bad('walkers go round a parked car', closest.toFixed(2));
}

console.log(`${boats} boats over 40 cities`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
