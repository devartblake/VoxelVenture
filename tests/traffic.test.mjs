import { imp } from './helpers.mjs';

const { generateCity } = await imp('city/cityGenerator.js');
const { createTraffic } = await imp('sim/traffic.js');
const { buildCollisionMap, isBlocked } = await imp('sim/collision.js');

const SEEDS = (process.env.SEEDS || '1,2,3,4').split(',').map(Number);
const SECONDS = Number(process.env.SECONDS || 240);
const DT = 0.05;
let totalProblems = 0;

for (const seed of SEEDS) {
  const city = generateCity(seed);
  const map = buildCollisionMap(city);
  const sim = createTraffic(city.layout, { seed, maxCars: Number(process.env.CARS || 34), maxWalkers: Number(process.env.WALKERS || 44) });
  const seen = new Set(sim.cars.map((c) => c.id));
  let carCar = 0, carWalker = 0, carInBuilding = 0, walkerInBuilding = 0, maxIdle = 0, crossings = 0;
  const wasCrossing = new Map();
  const examples = [];

  for (let t = 0; t < SECONDS; t += DT) {
    sim.update(DT, t);
    for (const c of sim.cars) seen.add(c.id);

    if (Math.round(t / DT) % 5 === 0) {
      const cs = sim.cars;
      for (let i = 0; i < cs.length; i++) {
        const a = cs[i];
        const solids = map.rects.filter((r) => r.kind !== 'island');
        const onIsland = map.rects.some((r) => r.kind === 'island' && Math.hypot(a.x - (r.x0 + r.x1) / 2, a.z - (r.z0 + r.z1) / 2) < 0.62);
        if (isBlocked(a.x, a.z, solids, 0) || onIsland) {
          carInBuilding++;
          if (examples.length < 30 && !examples.some((e) => e.startsWith('bldg'))) examples.push(`bldg t=${t.toFixed(0)} mode=${a.mode} road=${a.road.id} dir=${a.dir} u=${a.u.toFixed(2)} at ${a.x.toFixed(2)},${a.z.toFixed(2)} rect=${JSON.stringify(map.rects.find((r) => a.x > r.x0 && a.x < r.x1 && a.z > r.z0 && a.z < r.z1))}`);
        }
        maxIdle = Math.max(maxIdle, a.idle);
        for (let j = i + 1; j < cs.length; j++) {
          const b = cs[j];
          const d = Math.hypot(a.x - b.x, a.z - b.z);
          if (d < 0.42) {
            carCar++;
            if (examples.filter((e) => e.startsWith('cc')).length < 4) examples.push(`cc t=${t.toFixed(0)} d=${d.toFixed(2)} A[${a.mode} ${a.road.id} dir${a.dir} u=${a.u.toFixed(2)} v=${a.v.toFixed(2)} ${a.box ? 'box:' + a.box.ix.id + ' ' + a.box.path.entryArm + '>' + a.box.path.exitArm + ' s=' + a.box.s.toFixed(2) : ''}] B[${b.mode} ${b.road.id} dir${b.dir} u=${b.u.toFixed(2)} v=${b.v.toFixed(2)} ${b.box ? 'box:' + b.box.ix.id + ' ' + b.box.path.entryArm + '>' + b.box.path.exitArm + ' s=' + b.box.s.toFixed(2) : ''}]`);
          }
        }
        for (const w of sim.walkers) {
          const d = Math.hypot(a.x - w.x, a.z - w.z);
          if (d < 0.3 && a.v > 0.3) {
            carWalker++;
            if (examples.filter((e) => e.startsWith('cw')).length < 4) examples.push(`cw t=${t.toFixed(0)} d=${d.toFixed(2)} car[${a.mode} ${a.road.id} dir${a.dir} v=${a.v.toFixed(2)} ${a.box ? 'box:' + a.box.ix.id + ' ' + a.box.path.entryArm + '>' + a.box.path.exitArm : ''}] walker[edge ${w.edge.kind} ${w.edge.cw ? w.edge.cw.type + ':' + (w.edge.cw.arm || '') : ''} crossing=${w.crossing} waiting=${w.waiting}] at ${a.x.toFixed(1)},${a.z.toFixed(1)}`);
          }
        }
      }
      for (const w of sim.walkers) {
        if (isBlocked(w.x, w.z, map.rects, 0)) walkerInBuilding++;
        const was = wasCrossing.get(w.id) || false;
        if (w.crossing && !was) crossings++;
        wasCrossing.set(w.id, w.crossing);
      }
    }
  }
  const problems = carCar + carWalker + carInBuilding + walkerInBuilding + sim.stats.despawnedStuck;
  totalProblems += problems;
  console.log(
    `seed ${seed}: cars seen ${seen.size}, on road now ${sim.cars.length}, crossings ${crossings}, ` +
      `car-car ${carCar}, car-walker ${carWalker}, car-in-building ${carInBuilding}, walker-in-building ${walkerInBuilding}, ` +
      `stuck-despawned ${sim.stats.despawnedStuck}, longest idle ${maxIdle.toFixed(0)}s`
  );
  for (const e of examples) console.log('    ', e);
  for (const l of sim.stats.stuckLog) console.log('     stuck:', JSON.stringify(l));
}
console.log(totalProblems === 0 ? 'TRAFFIC CLEAN' : `${totalProblems} problem event(s)`);
if (totalProblems) process.exitCode = 1;
