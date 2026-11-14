// Turns a .glb model (an AI generator's output, a Kenney model, anything) into a voxel model: a MagicaVoxel .vox file in the game's own format,
// with a small palette, and optionally into same-sized modular tiles. Nothing is written into the game: the result goes where you say, and the
// asset checks and the licence entry (CREDITS.md) still apply before it is used (docs/world/voxelize.md).
//
//   node scripts/models/voxelize.mjs <model.glb> [options]
//
//   --out <dir>          where the files go (default: ./voxelized)
//   --name <name>        the file name without the extension (default: the model's)
//   --res <n>            voxels along the longest side (default 48; at most 250)
//   --colors <n>         palette size (default 16; at most 255)
//   --palette-from <f>   snap every colour to the palette of this .vox file instead (e.g. apps/web/public/models/vox/mall.vox, so it matches the city)
//   --solid              fill the inside too (watertight; the nearest surface colour)
//   --tile <n>           also cut it into <n>-voxel tiles that fit together, written once each, with tiles.json
//   --no-preview         do not write the quick-look picture
//
// Textures need `sharp` (it comes with Next.js); without it a textured model falls back to its material colours and the report says so.
import fs from 'node:fs';
import path from 'node:path';
import { parseVox, writeVox } from '../../lib/content/vox.js';
import { buildVox, collectPrimitives, parseGlb, previewRaster, splitTiles, voxelize } from '../../lib/content/voxelize.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback = null) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback; };
const VALUE_OPTIONS = ['--out', '--name', '--res', '--colors', '--palette-from', '--tile'];
const input = args.find((a, i) => !a.startsWith('--') && !VALUE_OPTIONS.includes(args[i - 1]));
if (!input) {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(2);
}

const number = (name, fallback, lo, hi) => {
  const raw = value(name);
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < lo || n > hi) { console.error(`--${name} must be a number from ${lo} to ${hi}`); process.exit(2); }
  return Math.round(n);
};
const resolution = number('res', 48, 1, 250);
const colors = number('colors', 16, 1, 255);
const tile = number('tile', 0, 1, 250);
const outDir = path.resolve(value('out', 'voxelized'));
const name = (value('name') ?? path.basename(input).replace(/\.[^.]+$/, '')).replace(/[^A-Za-z0-9._-]+/g, '-');

let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* textures fall back to the material colours */ }
const decodeImage = sharp
  ? async (bytes) => { const { data, info } = await sharp(Buffer.from(bytes)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: info.width, height: info.height, data }; }
  : null;

const glb = parseGlb(fs.readFileSync(input));
const { prims, report } = await collectPrimitives(glb, decodeImage, async (uri) => fs.readFileSync(path.resolve(path.dirname(input), decodeURIComponent(uri))));
const grid = voxelize(prims, { resolution, solid: flag('solid') });

let palette = null;
if (value('palette-from')) {
  palette = parseVox(fs.readFileSync(value('palette-from'))).palette;
  if (!palette?.length) { console.error('That .vox file has no palette.'); process.exit(2); }
}
const vox = buildVox(grid, { colors, palette });

fs.mkdirSync(outDir, { recursive: true });
const written = [];
const write = (file, bytes) => { fs.writeFileSync(path.join(outDir, file), bytes); written.push(file); };
write(`${name}.vox`, writeVox(vox));

let tiles = null;
if (tile) {
  tiles = splitTiles(vox, tile);
  const tileNames = tiles.tiles.map((t) => `${name}-tile-${String(t.id).padStart(3, '0')}.vox`);
  tiles.tiles.forEach((t, i) => write(tileNames[i], writeVox({ size: [tile, tile, tile], voxels: t.voxels, palette: vox.palette })));
  write('tiles.json', JSON.stringify({ model: `${name}.vox`, tile, grid: tiles.grid, palette: vox.palette, tiles: tiles.tiles.map((t, i) => ({ id: t.id, file: tileNames[i], voxels: t.voxels.length, uses: t.uses })), placements: tiles.placements }, null, 1));
}
if (sharp && !flag('no-preview')) {
  const r = previewRaster(vox, Math.max(2, Math.min(12, Math.round(480 / Math.max(...vox.size)))));
  write(`${name}-preview.png`, await sharp(Buffer.from(r.data), { raw: { width: r.width, height: r.height, channels: 4 } }).png().toBuffer());
}

console.log(`${input}`);
console.log(`  mesh:     ${report.triangles} triangles in ${report.primitives} parts${report.skipped ? `, ${report.skipped} skipped (not triangle lists)` : ''}`);
console.log(`  colours:  ${report.textured ? `${report.textured} textured part(s)` : report.vertexColored ? 'vertex colours' : 'material colours'}${report.untextured ? `; ${report.untextured} textured part(s) fell back to the material colour${sharp ? ' (the image could not be read)' : ' (sharp is not installed)'}` : ''}`);
console.log(`  voxels:   ${vox.voxels.length} in ${vox.size.join(' x ')} (${grid.surface} on the surface${flag('solid') ? `, ${vox.voxels.length - grid.surface} filled inside` : ''}), one voxel = ${grid.unit.toPrecision(3)} model units`);
console.log(`  palette:  ${vox.palette.length} colours${palette ? ` (snapped to ${path.basename(value('palette-from'))})` : ''}`);
if (tiles) console.log(`  tiles:    ${tiles.placements.length} pieces of ${tile}^3 on a ${tiles.grid.join(' x ')} grid, ${tiles.tiles.length} unique (${Math.round(100 * (1 - tiles.tiles.length / Math.max(1, tiles.placements.length)))}% reused)`);
console.log(`  wrote:    ${written.length} file(s) to ${outDir}`);
