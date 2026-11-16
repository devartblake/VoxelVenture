// The dashboard gauges' numbers (lib/sim/gauges.js).
import { imp } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const { DISPLAY_SCALE, gaugeMax, gearOf, needleAngle, revsOf, speedKmh, ticks } = await imp('sim/gauges.js');
const { VEHICLES, stepVehicle } = await imp('sim/vehicles.js');
const race = VEHICLES.racecar, car = VEHICLES.car;

check('a race car\'s top speed reads about 210 km/h and a city car\'s 98 (speed times 14)', speedKmh(race.maxSpeed) === 210 && speedKmh(car.maxSpeed) === 98 && DISPLAY_SCALE === 14);
check('reversing shows its speed, not a negative number', speedKmh(-3) === 42);
check('the dial tops out at the next 40 above the top speed: 240 for a race car, 120 for a city car', gaugeMax(race) === 240 && gaugeMax(car) === 120);
check('the needle sweeps from -135 degrees at rest to +135 at the top of the dial, and is held there (no wrap)', needleAngle(0, 240) === -135 && needleAngle(240, 240) === 135 && needleAngle(120, 240) === 0 && needleAngle(500, 240) === 135 && needleAngle(-5, 240) === -135);
check('the gears: R reversing, N standing, 1 to 6 up to the top speed, never past 6', gearOf(-2, race) === 'R' && gearOf(0, race) === 'N' && gearOf(0.05, race) === 'N' && gearOf(1, race) === 1 && gearOf(race.maxSpeed, race) === 6 && gearOf(99, race) === 6);
let last = 0, rising = true;
for (let s = 0.2; s <= race.maxSpeed; s += 0.1) { const g = gearOf(s, race); if (g < last) rising = false; last = g; }
check('the gear only goes up as the speed goes up, through all six', rising && last === 6);
const revs = []; for (let s = 0.2; s <= race.maxSpeed; s += 0.05) revs.push(revsOf(s, race));
check('the revs stay between 0.2 and 1, climb inside a gear and drop at each shift (five drops for six gears)', revs.every((r) => r >= 0.2 && r <= 1.0001) && revs.filter((r, i) => i && r < revs[i - 1] - 0.15).length === 5);
check('the dial has ticks every 20 km/h for a race car and every 10 for a city car, from 0 to the top', ticks(240).length === 13 && ticks(240)[1].value === 20 && ticks(120).length === 13 && ticks(120)[1].value === 10 && ticks(240).at(-1).value === 240);

// ---- the race car drives
const free = () => true;
const a = { kind: 'car', spec: 'racecar', x: 0, z: 0, yaw: 0, speed: 0 };
let t = 0;
for (; a.speed < race.maxSpeed - 0.01 && t < 40; t += 0.05) stepVehicle(a, { throttle: 1, steer: 0 }, 0.05, free);
check('a race car reaches its top speed of 15 and no more, in about 2 to 3 seconds (a city car takes longer and tops at 7)', a.speed <= race.maxSpeed + 1e-9 && t > 1.2 && t < 3.5, `${t.toFixed(2)} s`);
const b = { kind: 'car', x: 0, z: 0, yaw: 0, speed: 0 };
for (let i = 0; i < 200; i++) stepVehicle(b, { throttle: 1, steer: 0 }, 0.05, free);
check('a city car given the same road is slower: 7 against 15', Math.abs(b.speed - car.maxSpeed) < 0.01 && a.speed > b.speed * 2);
const brake = { ...a };
let stop = 0;
for (; brake.speed > 0 && stop < 10; stop += 0.05) stepVehicle(brake, { throttle: -1, steer: 0 }, 0.05, free);
check('it stops from top speed in under 1.5 seconds (its brakes are stronger than a city car\'s)', stop < 1.5 && brake.speed > -1.5, `${stop.toFixed(2)} s`);
const slow = { kind: 'car', spec: 'racecar', x: 0, z: 0, yaw: 0, speed: 4 }, fast = { kind: 'car', spec: 'racecar', x: 0, z: 0, yaw: 0, speed: 15 };
for (let i = 0; i < 10; i++) { stepVehicle(slow, { throttle: 0.27, steer: 1 }, 0.05, free); stepVehicle(fast, { throttle: 1, steer: 1 }, 0.05, free); }
check('it turns less sharply the faster it goes: the same steering turns it less at 15 than at 4', Math.abs(fast.yaw) < Math.abs(slow.yaw) && Math.abs(fast.yaw) > 0.1, `${slow.yaw.toFixed(2)} at 4, ${fast.yaw.toFixed(2)} at 15`);
check('a vehicle with no spec is the city car: nothing changed for the cars already in the game', (() => { const c = { kind: 'car', x: 0, z: 0, yaw: 0, speed: 0 }; for (let i = 0; i < 100; i++) stepVehicle(c, { throttle: 1, steer: 0 }, 0.05, free); return Math.abs(c.speed - 7) < 0.01; })());

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
