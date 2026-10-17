// Writes the sample player avatar to apps/web/public/models/avatar/player.glb, in the layout the game expects from a Blockbench export:
//   node scripts/models/make-sample-avatar.mjs
//
// To use your own: model the character in Blockbench (a "Generic Model" / glTF project), group the cubes into groups named exactly
//   leg_l, leg_r, arm_l, arm_r   (the group's origin is the joint: hip or shoulder, so the limb swings from there)
//   torso, head                  (anywhere)
// and give the materials these names: shirt (torso and arms), pants (legs), skin (head), so the Wardrobe colours still apply.
// File > Export > Export as glTF, save over apps/web/public/models/avatar/player.glb. The character should be about 0.8 units tall (feet at y = 0, facing +z).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// [name, pivot position, cube size, cube centre relative to the pivot, material]
const PARTS = [
  ['leg_l', [-0.065, 0.3, 0], [0.11, 0.3, 0.11], [0, -0.15, 0], 'pants'],
  ['leg_r', [0.065, 0.3, 0], [0.11, 0.3, 0.11], [0, -0.15, 0], 'pants'],
  ['torso', [0, 0.45, 0], [0.27, 0.3, 0.15], [0, 0, 0], 'shirt'],
  ['arm_l', [-0.185, 0.58, 0], [0.08, 0.28, 0.08], [0, -0.13, 0], 'shirt'],
  ['arm_r', [0.185, 0.58, 0], [0.08, 0.28, 0.08], [0, -0.13, 0], 'shirt'],
  ['head', [0, 0.7, 0], [0.2, 0.2, 0.2], [0, 0, 0], 'skin'],
  ['face', [0, 0.72, 0.101], [0.12, 0.03, 0.005], [0, 0, 0], 'face'],
];
const MATERIALS = { pants: [0.12, 0.16, 0.28, 1], shirt: [0.23, 0.51, 0.96, 1], skin: [0.95, 0.79, 0.63, 1], face: [0.12, 0.16, 0.22, 1] };

// a cube as 24 vertices (4 per face, so the normals are flat) and 36 indices
function cube([sx, sy, sz], [cx, cy, cz]) {
  const faces = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  ];
  const half = [sx / 2, sy / 2, sz / 2];
  const pos = [];
  const nor = [];
  const idx = [];
  faces.forEach((f, k) => {
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(...[0, 1, 2].map((i) => [cx, cy, cz][i] + f.n[i] * half[i] + f.u[i] * a * half[i] + f.v[i] * b * half[i]));
      nor.push(...f.n);
    }
    idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
  });
  return { pos, nor, idx };
}

const chunks = [];
const bufferViews = [];
const accessors = [];
const meshes = [];
const nodes = [];
const pad = (b, to) => Buffer.concat([b, Buffer.alloc((to - (b.length % to)) % to)]);
let offset = 0;
const addView = (buf, target) => {
  const padded = pad(buf, 4);
  chunks.push(padded);
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
  offset += padded.length;
  return bufferViews.length - 1;
};
const matNames = Object.keys(MATERIALS);
PARTS.forEach(([name, pivot, size, centre, material], i) => {
  const c = cube(size, centre);
  const posBuf = Buffer.from(new Float32Array(c.pos).buffer);
  const norBuf = Buffer.from(new Float32Array(c.nor).buffer);
  const idxBuf = Buffer.from(new Uint16Array(c.idx).buffer);
  const min = [0, 1, 2].map((k) => Math.min(...c.pos.filter((_, j) => j % 3 === k)));
  const max = [0, 1, 2].map((k) => Math.max(...c.pos.filter((_, j) => j % 3 === k)));
  accessors.push({ bufferView: addView(posBuf, 34962), componentType: 5126, count: 24, type: 'VEC3', min, max });
  accessors.push({ bufferView: addView(norBuf, 34962), componentType: 5126, count: 24, type: 'VEC3' });
  accessors.push({ bufferView: addView(idxBuf, 34963), componentType: 5123, count: 36, type: 'SCALAR' });
  meshes.push({ name, primitives: [{ attributes: { POSITION: accessors.length - 3, NORMAL: accessors.length - 2 }, indices: accessors.length - 1, material: matNames.indexOf(material) }] });
  nodes.push({ name, mesh: i, translation: pivot });
});
// the face cube sits on the head, in the same place as the procedural avatar's; node order: root first
const json = {
  asset: { version: '2.0', generator: 'VoxelVenture make-sample-avatar' },
  scene: 0,
  scenes: [{ nodes: [PARTS.length] }],
  nodes: [...nodes, { name: 'avatar', children: PARTS.map((_, i) => i) }],
  meshes,
  materials: matNames.map((name) => ({ name, pbrMetallicRoughness: { baseColorFactor: MATERIALS[name], metallicFactor: 0, roughnessFactor: 0.8 } })),
  accessors,
  bufferViews,
  buffers: [{ byteLength: offset }],
};
const bin = Buffer.concat(chunks);
const jsonBuf = pad(Buffer.from(JSON.stringify(json)), 4);
jsonBuf.fill(0x20, Buffer.byteLength(JSON.stringify(json)));
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
const ch = (len, type) => {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(len, 0);
  b.writeUInt32LE(type, 4);
  return b;
};
fs.mkdirSync(path.join(root, 'apps', 'web', 'public', 'models', 'avatar'), { recursive: true });
fs.writeFileSync(path.join(root, 'apps', 'web', 'public', 'models', 'avatar', 'player.glb'), Buffer.concat([header, ch(jsonBuf.length, 0x4e4f534a), jsonBuf, ch(bin.length, 0x004e4942), bin]));
console.log(`player.glb: ${PARTS.length} parts, ${12 + 16 + jsonBuf.length + bin.length} bytes`);
