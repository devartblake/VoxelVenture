// Which 3D model stands on which plot: every building gets one that fits, deterministic, varied, and its height stays close to the plot's.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const { generateCity, buildingSize } = await imp('city/cityGenerator.js');
const { modelFor, modelClass, hasParking, PARKING_SHARE, ALL_MODELS } = await imp('content/models.js');
const { MODEL_CATALOG } = await imp('content/modelCatalog.js');
const { bad, total } = problemTally();

// ---- the catalog matches the files
if (MODEL_CATALOG.length < 25) bad('the catalog lists the imported models', String(MODEL_CATALOG.length));
for (const m of ALL_MODELS) {
  const vox = m.format === 'vox';
  const file = path.join(root, 'apps', 'web', 'public', m.url);
  if (!fs.existsSync(file)) bad('every model file exists', m.url);
  else if (!vox && fs.readFileSync(file).readUInt32LE(0) !== 0x46546c67) bad('every model is a .glb', m.url);
  else if (vox && fs.readFileSync(file).subarray(0, 4).toString() !== 'VOX ') bad('every voxel model is a .vox', m.url);
  if (!(m.w > 0.2 && m.h > 0.2 && m.d > 0.2) || !(m.tris > 20 && m.tris < (vox ? 12000 : 8000))) bad('a model has a sane size and triangle count', m.id);
  if (!vox && !fs.existsSync(path.join(root, 'apps', 'web', 'public', 'models', 'kenney', m.kit, 'Textures', 'colormap.png'))) bad('each kit has its colour texture', m.kit);
}
if (!fs.existsSync(path.join(root, 'apps', 'web', 'public', 'models', 'CREDITS.md'))) bad('the credits file exists', '');

// ---- the choice
let built = 0;
let parked = 0;
let hqs = 0;
const usedByClass = {};
for (let seed = 1; seed <= 20; seed++) {
  const { plots } = generateCity(seed);
  for (const p of plots) {
    const m = modelFor(p);
    if (!p.owner || p.height <= 0.2) {
      if (m) bad('an empty lot has no model', `${seed} #${p.id}`);
      continue;
    }
    built++;
    if (!m) { bad('every building gets a model', `${seed} #${p.id}`); continue; }
    const { bw, bd } = buildingSize(p);
    const model = ALL_MODELS.find((x) => x.id === m.id);
    const [sx, sy, sz] = m.scale;
    if (model.w * sx > bw * 1.001 || model.d * sz > bd * 1.001) bad('the model fits inside the plot\'s footprint', `${seed} #${p.id} ${(model.w * sx).toFixed(2)}x${(model.d * sz).toFixed(2)} in ${bw.toFixed(2)}x${bd.toFixed(2)}`);
    if (!(m.height >= p.height * 0.55 && m.height <= p.height * 1.55)) bad('the model\'s height is close to the plot\'s', `${seed} #${p.id} ${m.height.toFixed(2)} vs ${p.height}`);
    if (Math.abs(model.h * sy - m.height) > 1e-9) bad('the reported height is the scaled height', `${seed} #${p.id}`);
    if ((p.buildingType === 'house') !== (m.kit === 'suburban')) bad('houses use the suburban kit and nothing else does', `${seed} #${p.id}`);
    if (m.class !== modelClass(p)) bad('the class is the plot\'s class', `${seed} #${p.id}`);
    if ((p.grand || p.luxury) && m.class !== 'wide' && m.class !== 'hq') bad('estates use the wide, low or tall models for wide plots', `${seed} #${p.id}`);
    if (p.hqModel && (m.id !== p.hqModel || Math.abs(m.height - p.height) > 1e-9)) bad('a headquarters has its own model at exactly its own height', `${seed} #${p.id}`);
    if (m.class === 'hq') hqs++;
    if (JSON.stringify(modelFor(p)) !== JSON.stringify(m)) bad('the same plot always gets the same model', `${seed} #${p.id}`);
    if (!(m.rotY === 0 || m.rotY === Math.PI) || (m.rotY === Math.PI) !== ((p.facing ?? 1) < 0)) bad('the model faces the same way as the plot\'s door', `${seed} #${p.id}`);
    // the model's floor lands on the ground and its middle on the plot's middle
    const lo = model.y0 * sy * -1 + 0;
    if (Math.abs(m.offset[1] - lo) > 1e-9) bad('the model\'s floor is at ground level', `${seed} #${p.id}`);
    // the building's front face is flush with the street side of its plot; with a car park, the building stays in the front part
    const front = (p.facing ?? 1) * (bd / 2);
    const centre = m.offset[2] + Math.cos(m.rotY) * model.cz * m.scale[2]; // (offset puts the model's centre here)
    const frontEdge = centre + (p.facing ?? 1) * ((model.d * m.scale[2]) / 2);
    if (Math.abs(frontEdge - front) > 1e-6) bad('the building front is flush with the street side of its plot', `${seed} #${p.id} ${frontEdge.toFixed(3)} vs ${front.toFixed(3)}`);
    if (m.parking !== hasParking(p)) bad('the parking flag matches the plot', `${seed} #${p.id}`);
    if (m.parking && model.d * m.scale[2] > bd * (1 - PARKING_SHARE) + 1e-6) bad('a building with a car park leaves room for it', `${seed} #${p.id}`);
    if (m.parking) parked++;
    (usedByClass[m.class] ??= new Set()).add(m.id);
  }
}
for (const [cls, set] of Object.entries(usedByClass)) if (cls !== 'house' && cls !== 'hq' && set.size < 3) bad('each kind of building uses at least three different models', `${cls}: ${[...set]}`);
if (!ALL_MODELS.filter((m) => m.format === 'vox').every((m) => Object.values(usedByClass).some((set) => set.has(m.id)))) bad('every voxel building is used by some plot', '');
if (!usedByClass.tall || !usedByClass.mid || !usedByClass.low || !usedByClass.wide) bad('tall, mid, low and wide models are all used', Object.keys(usedByClass).join());
const totalTris = [...new Set(Object.values(usedByClass).flatMap((s) => [...s]))].reduce((n, id) => n + ALL_MODELS.find((m) => m.id === id).tris, 0);

if (hqs !== 2 * 20) bad('every city has two headquarters, each with its own model', String(hqs));
if (!(parked > built * 0.1 && parked < built * 0.4)) bad('some, not most, buildings have a car park', `${parked} of ${built}`);
console.log(`${parked} with a car park; ${built} buildings in 20 cities; ${Object.entries(usedByClass).map(([c, s]) => `${c}: ${s.size} models`).join(', ')}; ${totalTris} triangles to hold them all`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
