// Cars and walkers on a curved street (a crescent): they stay in their lanes and on their pavements, keep apart, stop for the player and for a parked car.
import { imp, problemTally } from './helpers.mjs';
process.env.NODE_ENV = 'development';
const { generateCity } = await imp('city/cityGenerator.js');
const { createTraffic } = await imp('sim/traffic.js');
const { sampleCurve } = await imp('city/curves.js');
const { bad, total } = problemTally();

const distToCurve = (curve, x, z) => {
  let best = Infinity;
  for (const p of curve.points) best = Math.min(best, Math.hypot(p.x - x, p.z - z));
  return best;
};

let streets = 0, carsSeen = 0, walkersSeen = 0, maxCarsAtOnce = 0;
for (let seed = 1; seed <= 8; seed++) {
  const plain = generateCity(seed);
  const sites = plain.layout.reserved.filter((a) => !a.market);
  const city = generateCity(seed, { designs: Object.fromEntries(sites.map((a) => [a.id, { style: 'curve', seed: 1 }])) });
  const { layout } = city;
  const specs = layout.curvedRoads;
  if (!specs.length) { bad('the city has curved streets', seed); continue; }
  const avatar = { ready: true, x: 1e4, z: 1e4 }; // far away: cars may appear
  const sim = createTraffic(layout, { seed, maxCars: 20, maxWalkers: 10, avatar });
  const curves = specs.map(sampleCurve);
  streets += specs.length;
  if (sim.curveWalkers.length < specs.length) bad('every curved street has walkers', `${seed}: ${sim.curveWalkers.length}`);

  const seen = new Set();
  for (let t = 0; t < 180; t += 0.05) {
    sim.update(0.05, t);
    maxCarsAtOnce = Math.max(maxCarsAtOnce, sim.curveCars.length);
    for (const c of sim.curveCars) {
      seen.add(c.id);
      if (![c.x, c.z, c.yaw, c.v, c.s].every(Number.isFinite)) bad('a curve car has a real position', c.id);
      if (c.v > 3.45) bad('a curve car keeps to its speed', c.v.toFixed(2));
      const k = specs.findIndex((s) => s.id === c.street.id);
      const d = distToCurve(curves[k], c.x, c.z);
      if (d < 0.25 || d > 0.55) bad('a curve car drives in its lane, not in the middle or on the pavement', `${c.id} ${d.toFixed(2)}`);
    }
    if (Math.round(t / 0.05) % 10 === 0) {
      for (let i = 0; i < sim.curveCars.length; i++) {
        for (let j = i + 1; j < sim.curveCars.length; j++) {
          const a = sim.curveCars[i], b = sim.curveCars[j];
          if (a.street === b.street && Math.hypot(a.x - b.x, a.z - b.z) < 0.7) bad('curve cars do not run into one another', `${a.id} ${b.id} ${Math.hypot(a.x - b.x, a.z - b.z).toFixed(2)}`);
        }
      }
    }
    for (const w of sim.curveWalkers) {
      const k = specs.findIndex((s) => s.id === w.street.id);
      const d = distToCurve(curves[k], w.x, w.z);
      if (d < 0.85 || d > 1.4) bad('a curve walker keeps to the pavement', `${w.id} ${d.toFixed(2)}`);
    }
  }
  carsSeen += seen.size;
  walkersSeen += sim.curveWalkers.length;
  if (seen.size < specs.length * 2) bad('cars use the curved streets', `${seed}: ${seen.size} cars in 3 minutes`);
}

// stopping for the player in the lane
{
  const plain = generateCity(2);
  const sites = plain.layout.reserved.filter((a) => !a.market);
  const city = generateCity(2, { designs: Object.fromEntries(sites.map((a) => [a.id, { style: 'curve', seed: 1 }])) });
  const avatar = { ready: true, x: 1e4, z: 1e4 };
  const sim = createTraffic(city.layout, { seed: 2, maxCars: 5, maxWalkers: 0, avatar });
  let t = 0;
  for (; t < 90 && !sim.curveCars.some((c) => c.v > 2); t += 0.05) sim.update(0.05, t);
  const car = sim.curveCars.find((c) => c.v > 2);
  if (!car) bad('a curve car to test with', '');
  else {
    // stand in its lane a few units ahead
    avatar.x = car.x + Math.sin(car.yaw) * 5;
    avatar.z = car.z + Math.cos(car.yaw) * 5;
    let closest = Infinity;
    for (let k = 0; k < 15; k += 0.05, t += 0.05) {
      sim.update(0.05, t);
      closest = Math.min(closest, Math.hypot(car.x - avatar.x, car.z - avatar.z));
    }
    if (closest < 0.8) bad('a curve car stops for the player standing in its lane', closest.toFixed(2));
    if (car.v > 0.2 && sim.curveCars.includes(car)) bad('...and stays stopped while they stand there', car.v.toFixed(2));
    // a parked car in the lane: traffic queues behind it and is towed after a while
    avatar.x = 1e4;
    // (a car whose spot 6 units ahead is not at a junction: cross traffic may legitimately pass through one)
    const atJunction = (x, z) => city.layout.intersections.some((i) => Math.hypot(i.x - x, i.z - z) < 12);
    const live = sim.curveCars.find((c) => c.v > 1.5 && !atJunction(c.x + Math.sin(c.yaw) * 6, c.z + Math.cos(c.yaw) * 6));
    if (live) {
      sim.obstacles.push({ x: live.x + Math.sin(live.yaw) * 6, z: live.z + Math.cos(live.yaw) * 6 });
      const o = sim.obstacles[0];
      let nearest = Infinity;
      let who = '';
      const id = live.id;
      for (let k = 0; k < 40; k += 0.05, t += 0.05) {
        sim.update(0.05, t);
        for (const c of sim.curveCars) { if (Math.sin(c.yaw) * Math.sin(live.yaw) + Math.cos(c.yaw) * Math.cos(live.yaw) < 0.3) continue; /* only traffic in the same direction: cars in the opposite lane pass beside it */ const d = Math.hypot(c.x - o.x, c.z - o.z); if (d < nearest) { nearest = d; who = `${c.id === id ? 'same car' : 'other car ' + c.id} v=${c.v.toFixed(2)} k=${k.toFixed(1)}`; } }
      }
      if (nearest < 1.1) bad('curve cars never drive through a parked car', `${nearest.toFixed(2)} ${who}`);
      if (sim.curveCars.some((c) => c.id === id)) bad('a curve car stuck behind a parked car is towed', id);
    }
  }
}

if (carsSeen < 10) bad('cars appeared', String(carsSeen));
console.log(`${streets} curved streets: ${carsSeen} cars and ${walkersSeen} walkers simulated; most cars at once ${maxCarsAtOnce}`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
