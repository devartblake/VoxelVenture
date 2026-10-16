// Kenney trees and cars: the catalog matches the files, and every tree and car gets a deterministic, sensibly sized model.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const { generateCity } = await imp('city/cityGenerator.js');
const { PROP_CATALOG } = await imp('content/propCatalog.js');
const { treeModelFor, bushModelFor, carModelFor, CAR_LENGTH, TRUCK_LENGTH } = await imp('content/props.js');
const { bad, total } = problemTally();

for (const m of PROP_CATALOG) {
  const file = path.join(root, 'public', m.url);
  if (!fs.existsSync(file) || fs.readFileSync(file).readUInt32LE(0) !== 0x46546c67) bad('every prop file exists and is a .glb', m.url);
  if (m.textured && !fs.existsSync(path.join(root, 'public', 'models', 'kenney', m.kit, 'Textures', 'colormap.png'))) bad('a textured kit has its colormap', m.kit);
  if (!(m.h > 0.1 && m.tris > 10 && m.tris < 4000)) bad('a prop has a sane size and triangle count', m.id);
}
for (const cls of ['tree', 'bush', 'car', 'truck']) if (PROP_CATALOG.filter((m) => m.cls === cls).length < 2) bad('at least two models of each kind', cls);

let trees = 0;
const used = new Set();
for (let seed = 1; seed <= 10; seed++) {
  const city = generateCity(seed);
  const L = city.layout;
  const all = [...(L.woods ?? []), ...(L.landscape?.trees ?? []), ...(L.parks ?? [L.park]).filter(Boolean).flatMap((p) => p.trees ?? [])];
  for (const t of all) {
    trees++;
    const m = treeModelFor(t);
    if (!m) { bad('every tree gets a model', JSON.stringify(t)); continue; }
    used.add(m.id);
    const want = (t.trunk ?? 0.3) + (t.size ?? 0.4);
    if (!(m.height > want * 0.4 && m.height < want * 1.6 + 0.2)) bad('a tree model is about as tall as its box tree', `${m.height} vs ${want}`);
    if (JSON.stringify(treeModelFor(t)) !== JSON.stringify(m)) bad('the same tree always gets the same model', JSON.stringify(t));
  }
}
if (trees < 50 || used.size < 3) bad('trees use several different models', [...used].join());
for (let i = 0; i < 300; i++) {
  const m = carModelFor({ id: i });
  const e = PROP_CATALOG.find((x) => x.id === m.id);
  const len = e.d * m.scale;
  if (Math.abs(len - (e.cls === 'truck' ? TRUCK_LENGTH : CAR_LENGTH)) > 1e-6) bad('a car is the length of the box car', `${i} ${len}`);
  if (Math.abs(m.offset[1] + e.y0 * m.scale) > 1e-9) bad('a car stands on its wheels', String(i));
  if (JSON.stringify(carModelFor({ id: i })) !== JSON.stringify(m)) bad('the same car always gets the same model', String(i));
}
const kinds = new Set(Array.from({ length: 300 }, (_, i) => PROP_CATALOG.find((x) => x.id === carModelFor({ id: i }).id).cls));
if (!kinds.has('truck') || !kinds.has('car')) bad('both cars and trucks appear', [...kinds].join());
for (const t of Array.from({ length: 200 }, (_, i) => ({ x: i * 1.7, z: i * 0.9, trunk: 0.5, size: 0.5 }))) {
  const id = treeModelFor(t, undefined, { park: true }).id;
  if (/palm|pine/i.test(id)) bad('park trees are leafy, no palms or pines', id);
}
if (PROP_CATALOG.some((m) => /palm/i.test(m.id))) bad('no palm trees are imported', '');
if (!bushModelFor({ x: 1, z: 2, w: 0.4 })) bad('bushes get a model', '');
console.log(`${trees} trees in 10 cities use ${used.size} models`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
