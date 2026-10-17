// Cars and walkers on curved streets (the crescent of a curved reserved site, see designCurvedSite in lib/city/cityGenerator.js). Pure (no three.js).
//
// The main traffic (lib/sim/traffic.js) knows straight roads and their junctions. A curved street is a separate little world beside it: cars come in at
// one end and drive its length in the right-hand lane (in both directions, like any street), keep their distance from the car ahead, stop for the player
// and for a car left parked in the lane, and leave at the other end (the crescent's two mouths are curb cuts in the front road, and the cars do not
// pass into its junction-and-signal machinery); walkers stroll the pavements and turn round at the ends. They are drawn by apps/web/components/city/Traffic.jsx
// from `curveCars` and `curveWalkers`, the same shapes as the main sim's `cars` and `walkers`.
import { ROAD_HALF, SIDEWALK, offsetPoint, pointAt, sampleCurve } from '../city/curves';

const LANE = ROAD_HALF / 2; // a car's distance from the middle of the street
const PAVEMENT = ROAD_HALF + SIDEWALK / 2; // a walker's distance from the middle
const CRUISE = 3.4;
const ACCEL = 2.6;
const COMFORT = 3.2; // braking we are happy to ask of a car
const HARD = 9;
const CAR_LENGTH = 0.9;
const MIN_GAP = 0.7;
const SPAWN_CLEAR = 6; // nothing within this of the entry for a new car
const SHOW_DISTANCE = 30; // no car appears this close to the player
const COLOURS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#14b8a6', '#e5e7eb', '#f97316', '#64748b', '#ec4899'];
const SHIRTS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#14b8a6', '#f8fafc', '#fb7185'];
const PANTS = ['#1e293b', '#334155', '#1e3a8a', '#44403c', '#475569'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createCurveTraffic(layout, { seed = 1, avatar = null, obstacles = [] } = {}) {
  const rand = mulberry32(seed * 104729 + 7);
  const streets = (layout.curvedRoads ?? []).map((spec) => {
    const curve = sampleCurve(spec);
    return { id: spec.id, curve, length: curve.length, spawnTimer: [1 + rand() * 4, 3 + rand() * 4], cars: 0 };
  });
  const cars = [];
  const walkers = [];
  let nextId = 1;

  // where a lane's point is: s along the street, dir +1 (with the curve's direction) or -1, and the right-hand lane of that direction
  const place = (street, s, dir, lateral) => {
    const p = pointAt(street.curve, s);
    const [x, z] = offsetPoint(p, dir * lateral);
    return { x, z, yaw: dir > 0 ? p.h : p.h + Math.PI };
  };

  // people: a few on each pavement, walking to one end and back
  for (const street of streets) {
    const n = Math.max(1, Math.min(4, Math.round(street.length / 22)));
    for (let k = 0; k < n; k++) {
      const w = {
        id: `cw-${nextId++}`,
        street,
        s: 2 + rand() * Math.max(1, street.length - 4),
        dir: rand() < 0.5 ? 1 : -1,
        side: k % 2 === 0 ? 1 : -1, // which pavement
        speed: 0.7 + rand() * 0.5,
        shirt: SHIRTS[Math.floor(rand() * SHIRTS.length)],
        pants: PANTS[Math.floor(rand() * PANTS.length)],
        phase: rand() * 6,
        moving: true,
        edge: { kind: 'walk' }, // the renderer lifts a walker onto the pavement unless it is crossing
        x: 0,
        z: 0,
        yaw: 0,
      };
      walkers.push(w);
    }
  }
  const poseWalker = (w) => {
    const p = pointAt(w.street.curve, w.s);
    const [x, z] = offsetPoint(p, w.side * PAVEMENT);
    w.x = x;
    w.z = z;
    w.yaw = w.dir > 0 ? p.h : p.h + Math.PI;
  };
  walkers.forEach(poseWalker);

  function room(car) {
    // how far (along the lane) the car can still go: the car ahead, the player in the lane, a car left parked in it
    let limit = Infinity;
    for (const o of cars) {
      if (o === car || o.street !== car.street || o.dir !== car.dir) continue;
      const gap = (o.s - car.s) * car.dir - CAR_LENGTH - MIN_GAP;
      if (gap > -CAR_LENGTH && gap < limit) limit = gap;
    }
    const ahead = (x, z, half) => {
      const f = [Math.sin(car.yaw), Math.cos(car.yaw)];
      const dx = x - car.x;
      const dz = z - car.z;
      const along = dx * f[0] + dz * f[1];
      const lateral = Math.abs(dx * f[1] - dz * f[0]);
      return along > 0 && along < 7 && lateral < half ? along : null;
    };
    if (avatar?.ready) {
      const a = ahead(avatar.x, avatar.z, 0.55);
      if (a !== null && a - 0.9 < limit) limit = a - 0.9;
    }
    for (const o of obstacles) {
      const a = ahead(o.x, o.z, 1.0);
      if (a !== null) {
        car.sawObstacle = true;
        if (a - 1.6 < limit) limit = a - 1.6;
      }
    }
    return limit;
  }

  function step(dt) {
    // walkers
    for (const w of walkers) {
      w.s += w.dir * w.speed * dt;
      if (w.s > w.street.length - 0.8) (w.s = w.street.length - 0.8, (w.dir = -1));
      else if (w.s < 0.8) (w.s = 0.8, (w.dir = 1));
      w.phase += dt * w.speed * 7;
      poseWalker(w);
    }
    // cars
    for (const car of cars) {
      car.sawObstacle = false;
      const free = room(car);
      let target = CRUISE;
      if (free < Infinity) target = Math.min(target, Math.sqrt(Math.max(0, 2 * COMFORT * Math.max(0, free))));
      if (car.v > target) car.v = Math.max(target, car.v - HARD * dt);
      else car.v = Math.min(target, car.v + ACCEL * dt);
      const advance = Math.min(car.v * dt, free < Infinity ? Math.max(0, free) : Infinity);
      car.s += car.dir * advance;
      car.blocked = car.sawObstacle && car.v < 0.05 ? car.blocked + dt : 0; // waiting behind a parked car: towed after a while
      const pose = place(car.street, Math.min(car.street.length, Math.max(0, car.s)), car.dir, LANE);
      car.x = pose.x;
      car.z = pose.z;
      car.yaw = pose.yaw;
    }
    // cars leave at the far end (or are towed)
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i];
      if ((c.dir > 0 && c.s >= c.street.length - 0.05) || (c.dir < 0 && c.s <= 0.05) || c.blocked > 9) {
        c.street.cars--;
        cars.splice(i, 1);
      }
    }
    // cars arrive at the near end, one direction at a time, never in front of the player
    for (const street of streets) {
      const wanted = Math.max(1, Math.min(4, Math.round(street.length / 14)));
      for (const k of [0, 1]) {
        street.spawnTimer[k] -= dt;
        if (street.spawnTimer[k] > 0 || street.cars >= wanted) continue;
        street.spawnTimer[k] = 3 + rand() * 6;
        const dir = k === 0 ? 1 : -1;
        const s = dir > 0 ? 0.3 : street.length - 0.3;
        const pose = place(street, s, dir, LANE);
        if (avatar?.ready && Math.hypot(avatar.x - pose.x, avatar.z - pose.z) < SHOW_DISTANCE) continue;
        if (cars.some((o) => o.street === street && o.dir === dir && Math.abs(o.s - s) < SPAWN_CLEAR)) continue;
        street.cars++;
        cars.push({ id: `cc-${nextId++}`, street, dir, s, v: 1.5, color: COLOURS[Math.floor(rand() * COLOURS.length)], blocked: 0, sawObstacle: false, ...pose });
      }
    }
  }

  return { cars, walkers, streets, update: step };
}
