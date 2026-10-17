// The voxel landmarks (mall, monument) and the Blockbench-style avatar are valid, sane files with the names the game looks for.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const { parseVox, voxelMesh } = await imp('content/vox.js');
const { bad, total } = problemTally();
const pub = (...p) => path.join(root, 'apps', 'web', 'public', 'models', ...p);

for (const [name, minVox, maxFaces] of [['monument', 500, 6000], ['mall', 5000, 30000]]) {
  const file = pub('vox', `${name}.vox`);
  if (!fs.existsSync(file)) { bad('the landmark file exists', name); continue; }
  const v = parseVox(new Uint8Array(fs.readFileSync(file)));
  const m = voxelMesh(v, 1);
  const faces = m.indices.length / 6;
  if (v.voxels.length < minVox || faces > maxFaces) bad('a landmark is a sane size', `${name}: ${v.voxels.length} voxels, ${faces} faces`);
  const ys = m.positions.filter((_, i) => i % 3 === 1);
  if (Math.min(...ys) !== 0) bad('a landmark stands on y = 0', name);
  if (v.voxels.some(([x, y, z]) => x >= v.size[0] || y >= v.size[1] || z >= v.size[2])) bad('voxels are inside the model size', name);
}

// the avatar: a valid .glb whose limbs and materials have the names Avatar.jsx and the Wardrobe use
const f = pub('avatar', 'player.glb');
if (!fs.existsSync(f)) bad('the avatar file exists', f);
else {
  const b = fs.readFileSync(f);
  if (b.readUInt32LE(0) !== 0x46546c67 || b.readUInt32LE(8) !== b.length) bad('the avatar is a well-formed .glb', '');
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
  const names = json.nodes.map((n) => n.name);
  for (const n of ['leg_l', 'leg_r', 'arm_l', 'arm_r', 'torso', 'head']) if (!names.includes(n)) bad('the avatar has the named part', n);
  const mats = (json.materials ?? []).map((m) => m.name);
  for (const n of ['shirt', 'pants', 'skin']) if (!mats.includes(n)) bad('the avatar has the named material', n);
  const hip = json.nodes.find((n) => n.name === 'leg_l').translation;
  if (!(hip[1] > 0.2 && hip[1] < 0.4)) bad('a leg pivots at the hip', JSON.stringify(hip));
}
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
