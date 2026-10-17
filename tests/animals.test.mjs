// The countryside animals: farm herds in meadow fields, wildlife in the woods, goats on the hills, ducks on the water, birds in the sky.
// They are placed in the right kind of place, stay where they belong while they move, and the models exist.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const { generateCity } = await imp('city/cityGenerator.js');
const { createAnimals, animalCounts, KINDS } = await imp('sim/animals.js');
const { hillHeight, HILL_MAX } = await imp('city/hills.js');
const { ANIMAL_CATALOG } = await imp('content/animalCatalog.js');
const { parseVox } = await imp('content/vox.js');
const { bad, total } = problemTally();

// the models
for (const kind of Object.keys(KINDS)) {
  const m = ANIMAL_CATALOG.find((a) => a.id === kind);
  if (!m) { bad('every kind of animal has a model', kind); continue; }
  const file = path.join(root, 'apps', 'web', 'public', m.url);
  if (!fs.existsSync(file)) { bad('the animal model file exists', kind); continue; }
  const v = parseVox(new Uint8Array(fs.readFileSync(file)));
  if (v.voxels.length < 30 || v.voxels.length > 3000) bad('an animal is a sane size', `${kind}: ${v.voxels.length} voxels`);
  if (!(m.length > 0.2 && m.length < 1.3 && m.height > 0.08 && m.height < 1.2)) bad('an animal is a sane size in the game (about a car long at most)', `${kind}: ${m.length} x ${m.height}`);
}

const inside = (r, x, z, m = 1e-6) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;
let all = 0;
const kindsSeen = new Set();
let goats = 0;
const SEEDS = 20;
for (let seed = 1; seed <= SEEDS; seed++) {
  const { layout } = generateCity(seed);
  const sim = createAnimals(layout);
  const { animals } = sim;
  all += animals.length;
  const counts = animalCounts(animals);
  Object.keys(counts).forEach((k) => kindsSeen.add(k));
  if (animals.length < 40 || animals.length > 320) bad('a countryside has a good number of animals', `${seed}: ${animals.length}`);
  if (!(counts.cow || counts.sheep || counts.horse || counts.pig)) bad('there are farm animals', String(seed));
  if (!(counts.deer || counts.rabbit || counts.fox)) bad('there is wildlife', String(seed));
  goats += counts.goat ?? 0;
  const startPos = animals.map((a) => [a.x, a.z]);
  animals.forEach((a, i) => {
    if (a.mode === 'air') return;
    if (!inside(a.home, a.x, a.z)) bad('an animal starts in its home area', `${seed} ${a.kind} #${a.id}`);
    if (layout.urban && inside(layout.urban, a.x, a.z) && a.mode === 'land') bad('no animal is in the city', `${seed} ${a.kind}`);
    if (a.place === 'farm' && !layout.fields.some((f) => f.crop === 'meadow' && inside(f, a.x, a.z))) bad('farm animals are in a meadow', `${seed} ${a.kind}`);
    if (a.place === 'hills' && !(hillHeight(layout.hills, a.x, a.z) > 0.3)) bad('goats start on a slope', `${seed} ${hillHeight(layout.hills, a.x, a.z).toFixed(2)}`);
    for (const l of layout.lakes) if (a.mode !== 'water' && inside({ x0: l.x - l.rx, x1: l.x + l.rx, z0: l.z - l.rz, z1: l.z + l.rz }, a.x, a.z)) bad('land animals are not in a lake', `${seed} ${a.kind}`);
    for (const r of layout.roads) {
      const rr = r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - 1.4, z1: r.center + 1.4 } : { x0: r.center - 1.4, x1: r.center + 1.4, z0: r.from, z1: r.to };
      if (a.place === 'farm' && inside(rr, a.x, a.z)) bad('farm animals are not on a road', `${seed} ${a.kind}`);
    }
    void startPos[i];
  });
  // move them for four minutes: they stay in their home, goats on the ground of the hills, ducks on the water, birds in the sky
  let maxMove = 0;
  for (let step = 0; step < 2400; step++) {
    const before = animals.map((a) => [a.x, a.z]);
    sim.update(0.1, step * 0.1);
    animals.forEach((a, i) => { if (a.mode !== 'air') maxMove = Math.max(maxMove, Math.hypot(a.x - before[i][0], a.z - before[i][1]) / (a.speed || 1)); });
  }
  let moved = 0;
  animals.forEach((a, i) => {
    if (a.mode === 'air') {
      if (a.y < 1.5 || a.y > 8) bad('birds fly at a sensible height', `${seed} ${a.y}`);
      return;
    }
    if (!inside(a.home, a.x, a.z, 1e-6)) bad('an animal stays in its home area while it moves', `${seed} ${a.kind} #${a.id} at ${a.x.toFixed(1)},${a.z.toFixed(1)}`);
    if (a.place === 'hills' && !(a.y >= 0 && a.y <= HILL_MAX + 0.05)) bad('goats follow the ground', `${seed} y=${a.y}`);
    if (a.mode === 'water' && Math.abs(a.y - 0.035) > 1e-6) bad('ducks sit on the water', `${seed} y=${a.y}`);
    if (Math.hypot(a.x - startPos[i][0], a.z - startPos[i][1]) > 0.3) moved++;
    if (!Number.isFinite(a.x) || !Number.isFinite(a.yaw)) bad('positions stay real numbers', `${seed}`);
  });
  if (moved < animals.filter((a) => a.mode !== 'air').length * 0.6) bad('most animals wander about', `${seed}: ${moved}`);
  if (maxMove > 0.1 * 1.001) bad('nothing moves faster than its walking speed', `${seed}: ${maxMove}`);
  // the same city has the same herds
  const again = createAnimals(layout).animals;
  if (again.length !== animals.length || again.some((a, i) => a.kind !== animals[i].kind)) bad('the same city always has the same animals', String(seed));
}
for (const k of ['cow', 'sheep', 'horse', 'pig', 'deer', 'fox', 'rabbit', 'duck', 'bird', 'goat']) if (!kindsSeen.has(k)) bad('every kind appears somewhere', k);
console.log(`${(all / SEEDS).toFixed(0)} animals per city on average; ${goats} goats on the hills over ${SEEDS} cities`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
