// Writes the sample voxel landmark(s) into public/models/vox/. Replace a file with your own MagicaVoxel export of the same name to change a landmark.
//   node scripts/models/make-sample-vox.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeVox } from '../../lib/content/vox.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// palette index 1 = stone, 2 = pale stone, 3 = gold
const palette = [[120, 113, 108], [214, 211, 209], [250, 204, 21]];

// The park monument: a stepped base, a tapering obelisk and a golden tip (about 1.4 units tall at 0.05 per voxel)
const voxels = [];
for (let z = 0; z < 28; z++) {
  const half = z < 2 ? 8 : z < 4 ? 6 : Math.max(1, 3 - Math.floor((z - 4) / 8));
  const c = z < 4 ? 1 : 2;
  const mid = 8;
  for (let x = mid - half; x < mid + half; x++) for (let y = mid - half; y < mid + half; y++) voxels.push([x, y, z, c]);
}
for (let z = 28; z < 32; z++) {
  const half = z < 30 ? 1 : 0.5;
  if (half < 1) voxels.push([8, 8, z, 3]);
  else for (let x = 7; x < 9; x++) for (let y = 7; y < 9; y++) voxels.push([x, y, z, 3]);
}
const out = (name, size, vox, pal) => {
  fs.mkdirSync(path.join(root, 'public', 'models', 'vox'), { recursive: true });
  fs.writeFileSync(path.join(root, 'public', 'models', 'vox', name), writeVox({ size, voxels: vox, palette: pal }));
  console.log(`${name}: ${vox.length} voxels`);
};
out('monument.vox', [16, 16, 32], voxels, palette);

// Buildings are stretched to the plot they stand on (see VoxLandmark's `fit`), so only the proportions matter.
// palette: 1 wall, 2 glass, 3 trim, 4 skylight, 5 dark roof
const bPalette = [[229, 231, 235], [56, 189, 248], [99, 102, 241], [186, 230, 253], [71, 85, 105]];
const box = (list, x0, x1, y0, y1, z0, z1, c) => {
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) list.push([x, y, z, c]);
};
// the mall: a wide body with a glass band at street level, window slits above, a trim band and a raised skylight (symmetric front and back)
{
  const W = 48, D = 20, H = 14;
  const v = [];
  box(v, 0, W, 0, D, 0, H, 1);
  const set = new Map(v.map((a) => [a[0] + a[1] * 64 + a[2] * 4096, a]));
  const paint = (x, y, z, c) => { const a = set.get(x + y * 64 + z * 4096); if (a) a[3] = c; };
  for (let x = 1; x < W - 1; x++) for (const y of [0, D - 1]) {
    for (let z = 1; z < 5; z++) paint(x, y, z, 2);
    if (x % 4 !== 0) for (let z = 8; z < 11; z++) paint(x, y, z, 2);
  }
  for (let x = 0; x < W; x++) for (let y = 0; y < D; y++) for (let z = H - 1; z < H; z++) paint(x, y, z, 3);
  const all = [...set.values()];
  box(all, 0, W, 0, D, H, H + 1, 3);
  box(all, W / 2 - 10, W / 2 + 10, 5, D - 5, H + 1, H + 4, 4);
  out('mall.vox', [W, D, H + 4], all, bPalette);
}
