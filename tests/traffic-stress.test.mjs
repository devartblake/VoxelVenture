import { imp } from './helpers.mjs';
const { generateCity } = await imp('city/cityGenerator.js');
const { createTraffic } = await imp('sim/traffic.js');
let runs = 0;
for (let seed = 1; seed <= Number(process.env.SEEDS ?? 6); seed++) {
  const city = generateCity(seed);
  const avatar = { x: 0, z: 0, ready: true };
  const sim = createTraffic(city.layout, { seed, maxCars: 90, maxWalkers: 80, avatar });
  let t = 0;
  for (let i = 0; i < 12000; i++) {
    const dt = [0.016, 0.033, 0.1, 0.25][i % 4]; // uneven frame times, like a real browser
    t += dt;
    avatar.x = Math.sin(t * 0.3) * 30; avatar.z = Math.cos(t * 0.2) * 30;
    sim.update(dt, t);
  }
  runs++;
}
console.log(`${runs} stress runs completed with no exception`);
