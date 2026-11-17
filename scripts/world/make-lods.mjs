// Makes the simplified ("mid") copy of each port model (docs/world/ports_models.md, "The mid tier"): a phone draws these instead of boxes, so it keeps the Kenney look at a fraction of the triangles.
//   node scripts/world/make-lods.mjs
// Each model of lib/world/ports.js PORT_MODELS is read from apps/web/public/models/kenney, welded and simplified with meshoptimizer's simplifier (through glTF Transform) to its `ratio` of the triangles
// (the colour map is kept: the look comes from it), and written to apps/web/public/world/lod/<name>.glb. The ratios are in LOD_RATIO below; the script prints the triangles before and after.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplify, weld, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { imp } from '../lib-loader.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { PORT_MODELS } = await imp('world/ports.js');
const { PORT_LOD_RATIO } = await imp('world/portLods.js');
const { MID_MADE } = await imp('world/portMid.js');
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const out = path.join(root, 'apps/web/public/world/lod');
fs.mkdirSync(out, { recursive: true });
const count = (doc) => { let t = 0; for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3; return Math.round(t); };
const report = {};
for (const [name, m] of Object.entries(PORT_MODELS)) {
  if (MID_MADE.includes(name)) continue; // (the containers and the tanks have made models: lib/world/portMid.js)
  const doc = await io.read(path.join(root, 'apps/web/public/models/kenney', `${m.file}.glb`));
  const before = count(doc);
  // the kit's models are flat shaded: every face has its own vertices and its own normals and colour-map coordinates, and those seams are borders the simplifier will not collapse. The normals are dropped (the
  // game draws the mid tier with flat shading: the shader works the face normal out), so vertices at one place weld together and the ribs and rims can go
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) prim.setAttribute('NORMAL', null);
  await doc.transform(weld({ tolerance: 0.0001 }), simplify({ simplifier: MeshoptSimplifier, ratio: PORT_LOD_RATIO[name], error: 0.08, lockBorder: false }), prune());
  const after = count(doc);
  await io.write(path.join(out, `${name}.glb`), doc);
  report[name] = { before, after, bytes: fs.statSync(path.join(out, `${name}.glb`)).size };
  console.log(name.padEnd(11), String(before).padStart(4), '->', String(after).padStart(4), 'triangles', `${(report[name].bytes / 1024).toFixed(1)} KB`);
}
fs.writeFileSync(path.join(out, 'lods.json'), JSON.stringify(report, null, 1) + '\n');
