// MagicaVoxel files: the parser reads what the writer wrote, bad files are refused, and the mesh only has visible faces.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const { parseVox, voxelMesh, writeVox } = await imp('content/vox.js');
const { bad, total } = problemTally();

const cube = { size: [2, 2, 2], voxels: [[0, 0, 0, 1], [1, 0, 0, 1], [0, 1, 0, 2], [1, 1, 0, 2], [0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 2], [1, 1, 1, 2]], palette: [[255, 0, 0], [0, 0, 255]] };
const back = parseVox(writeVox(cube));
if (JSON.stringify(back.size) !== '[2,2,2]' || back.voxels.length !== 8) bad('the parser reads back what the writer wrote', JSON.stringify(back.size));
if (JSON.stringify(back.palette[0]) !== '[255,0,0]' || JSON.stringify(back.palette[1]) !== '[0,0,255]') bad('the palette is read (index 1 = first entry)', JSON.stringify(back.palette.slice(0, 2)));

const m = voxelMesh(back, 1);
// the surface of a 2x2x2 block is 24 unit squares, however they are merged; inner faces are culled
const area = (mm) => { let a = 0; for (let t = 0; t < mm.indices.length; t += 6) { const P = (k) => [0, 1, 2].map((i) => mm.positions[mm.indices[t + k] * 3 + i]); const [p0, p1, p3] = [P(0), P(1), P(2)]; const e1 = p1.map((v, i) => v - p0[i]); const e2 = p3.map((v, i) => v - p1[i]); a += Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]); } return a; };
if (Math.abs(area(m) - 24) > 1e-6) bad('a 2x2x2 block has 24 unit squares of surface', String(area(m)));
if (m.indices.length / 6 > 12) bad('same-colour faces are merged', String(m.indices.length / 6));
const flat = voxelMesh(parseVox(writeVox({ size: [8, 8, 1], voxels: Array.from({ length: 64 }, (_, i) => [i % 8, Math.floor(i / 8), 0, 1]), palette: [[9, 9, 9]] })), 1);
if (flat.indices.length / 6 !== 6) bad('a flat slab is six quads', String(flat.indices.length / 6));
const ys = m.positions.filter((_, i) => i % 3 === 1);
if (Math.min(...ys) !== 0 || Math.max(...ys) !== 2) bad('the floor is at y = 0 and z (up in MagicaVoxel) becomes y', `${Math.min(...ys)}..${Math.max(...ys)}`);
// every face's winding agrees with its stated normal
for (let t = 0; t < m.indices.length; t += 3) {
  const [a, b, c] = [0, 1, 2].map((k) => m.indices[t + k] * 3);
  const P = (i) => [m.positions[i], m.positions[i + 1], m.positions[i + 2]];
  const [pa, pb, pc] = [P(a), P(b), P(c)];
  const u = pb.map((v, i) => v - pa[i]);
  const v = pc.map((x, i) => x - pb[i]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const s = [m.normals[a], m.normals[a + 1], m.normals[a + 2]];
  if (n[0] * s[0] + n[1] * s[1] + n[2] * s[2] <= 0) { bad('triangles face outward', `triangle ${t / 3}`); break; }
}
const lone = voxelMesh(parseVox(writeVox({ size: [1, 1, 1], voxels: [[0, 0, 0, 1]], palette: [[1, 2, 3]] })), 0.5);
if (lone.indices.length !== 36) bad('one voxel is six faces', String(lone.indices.length / 6));

for (const [name, data] of [['not a vox file', new Uint8Array(40)], ['cut short', writeVox(cube).slice(0, 30)], ['empty', new Uint8Array(0)]]) {
  let threw = false;
  try { parseVox(data); } catch { threw = true; }
  if (!threw) bad('a bad file is refused', name);
}

// the shipped landmark
const file = path.join(root, 'apps', 'web', 'public', 'models', 'vox', 'monument.vox');
if (!fs.existsSync(file)) bad('the sample monument exists', file);
else {
  const v = parseVox(new Uint8Array(fs.readFileSync(file)));
  const mm = voxelMesh(v, 0.05);
  const top = Math.max(...mm.positions.filter((_, i) => i % 3 === 1));
  if (v.voxels.length < 500 || mm.indices.length > 20000) bad('the monument is a sane size', `${v.voxels.length} voxels, ${mm.indices.length / 6} faces`);
  if (!(top > 1.2 && top < 1.8)) bad('the monument is about as tall as the procedural one', String(top));
}
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
