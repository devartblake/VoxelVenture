// The voxeliser (lib/content/voxelize.js, scripts/models/voxelize.mjs, docs/world/voxelize.md): a mesh becomes voxels with the model's own colours, a small
// palette, the game's .vox format, and modular tiles with the duplicates found. The models here are built in memory, so no file is needed.
import { parseVox, voxelMesh, writeVox } from '../lib/content/vox.js';
import { buildVox, cleanColors, collectPrimitives, parseGlb, previewRaster, quantize, snapToPalette, splitTiles, voxelize } from '../lib/content/voxelize.js';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

// a .glb made of boxes: [{ min, max, color: [r, g, b] (linear 0..1) }], one primitive each, in one mesh on one node (optionally moved)
function glbBytes(json, bin) {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = new Uint8Array(jsonBytes.length + ((4 - (jsonBytes.length % 4)) % 4)).fill(0x20);
  jsonPad.set(jsonBytes);
  const total = 12 + 8 + jsonPad.length + (bin ? 8 + bin.length : 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonPad.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(jsonPad, 20);
  if (bin) { const o = 20 + jsonPad.length; dv.setUint32(o, bin.length, true); dv.setUint32(o + 4, 0x004e4942, true); out.set(bin, o + 8); }
  return out;
}
function boxGlb(boxes, { translate = null, vertexColors = false } = {}) {
  const positions = [], indices = [], colors = [];
  boxes.forEach((b, bi) => {
    const base = positions.length / 3;
    for (let i = 0; i < 8; i++) positions.push(i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]); // corner i: bits are x, y, z
    const quad = (a, c, d, e) => indices.push(base + a, base + c, base + d, base + a, base + d, base + e);
    quad(0, 1, 3, 2); quad(4, 6, 7, 5); quad(0, 4, 5, 1); quad(2, 3, 7, 6); quad(0, 2, 6, 4); quad(1, 5, 7, 3); // the six faces, 12 triangles
    for (let i = 0; i < 8; i++) colors.push(...b.color, 1);
    void bi;
  });
  const pos = new Float32Array(positions), idx = new Uint16Array(indices), col = new Float32Array(colors);
  const chunks = [pos, idx, col].map((a) => new Uint8Array(a.buffer));
  const offsets = []; let at = 0;
  for (const c of chunks) { offsets.push(at); at += c.length + ((4 - (c.length % 4)) % 4); }
  const bin = new Uint8Array(at);
  chunks.forEach((c, i) => bin.set(c, offsets[i]));
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, ...(translate ? { translation: translate } : {}) }],
    meshes: [{ primitives: boxes.map((b, bi) => ({ attributes: { POSITION: 0, ...(vertexColors ? { COLOR_0: 2 } : {}) }, indices: 3 + bi, material: bi })) }],
    materials: boxes.map((b) => ({ pbrMetallicRoughness: { baseColorFactor: [...b.color, 1] } })),
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: idx.length, type: 'SCALAR' },
      { bufferView: 2, componentType: 5126, count: col.length / 4, type: 'VEC4' },
      ...boxes.map((b, bi) => ({ bufferView: 1, byteOffset: bi * 36 * 2, componentType: 5123, count: 36, type: 'SCALAR' })), // each box's own 36 indices
    ],
    bufferViews: [{ buffer: 0, byteOffset: offsets[0], byteLength: pos.byteLength }, { buffer: 0, byteOffset: offsets[1], byteLength: idx.byteLength }, { buffer: 0, byteOffset: offsets[2], byteLength: col.byteLength }],
    buffers: [{ byteLength: bin.length }],
  };
  return glbBytes(json, bin);
}
const srgb = (l) => Math.round(255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055));
const near = (a, b, d = 2) => a.every((v, i) => Math.abs(v - b[i]) <= d);

// ---- reading
const red = [1, 0, 0], blue = [0, 0, 1];
const glb = parseGlb(boxGlb([{ min: [0, 0, 0], max: [2, 1, 1], color: red }]));
const { prims, report } = await collectPrimitives(glb);
check('a .glb is read: its triangles and parts are counted', report.triangles === 12 && report.primitives === 1, JSON.stringify(report));
check('anything that is not a .glb is refused with a hint', (() => { try { parseGlb(new Uint8Array(40)); return false; } catch (e) { return /\.glb/.test(e.message); } })());
check('a compressed model is refused and says how to decompress it', (() => { try { parseGlb(glbBytes({ asset: { version: '2.0' }, extensionsRequired: ['KHR_draco_mesh_compression'] }, null)); return false; } catch (e) { return /gltf-transform/.test(e.message); } })());

// ---- voxelising: the size, the axes, the colour
const grid = voxelize(prims, { resolution: 8 });
check('the longest side gets the resolution; the others keep the proportions', grid.size[0] === 8 && grid.size[1] === 4 && grid.size[2] === 4, grid.size.join('x'));
check('only the surface is filled: the shell of the box, 8 x 4 x 4 less the 6 x 2 x 2 inside', grid.cells.size === 8 * 4 * 4 - 6 * 2 * 2, String(grid.cells.size));
check('the colour is the material colour, in sRGB', [...grid.cells.values()].every((c) => near(c, [255, 0, 0])), JSON.stringify([...grid.cells.values()][0]));
const solid = voxelize(prims, { resolution: 8, solid: true });
check('solid fills the inside as well (the full block), in the same colour', solid.cells.size === 8 * 4 * 4 && [...solid.cells.values()].every((c) => near(c, [255, 0, 0])), String(solid.cells.size));

// the axes: glTF (x, y, z) -> voxel (x, -z, y), floor at 0: a box on top (higher y) is higher z; a box nearer the viewer (higher z) is lower y
const tower = parseGlb(boxGlb([{ min: [0, 0, 0], max: [4, 1, 4], color: red }, { min: [1, 1, 1], max: [3, 5, 3], color: blue }]));
const t = voxelize((await collectPrimitives(tower)).prims, { resolution: 10, solid: true });
const [sx, sy] = t.size;
const colorAt = (x, y, z) => t.cells.get(x + sx * (y + sy * z));
check('up in the model is up (z) in the voxels, with the floor at z = 0', t.size[2] === 10 && near(colorAt(0, 0, 0) ?? [0, 0, 0], [255, 0, 0]) && near(colorAt(4, 4, 8) ?? [0, 0, 0], [0, 0, 255]), t.size.join('x'));
check('the model sits on z = 0 and touches the first voxel on every axis', [...t.cells.keys()].some((k) => Math.floor(k / (sx * sy)) === 0) && [...t.cells.keys()].some((k) => k % sx === 0) && [...t.cells.keys()].some((k) => Math.floor(k / sx) % sy === 0));

// a transform on the node is applied
const moved = voxelize((await collectPrimitives(parseGlb(boxGlb([{ min: [0, 0, 0], max: [1, 1, 1], color: red }, { min: [0, 0, 0], max: [1, 1, 1], color: blue }], { translate: [5, 0, 0] })))).prims, { resolution: 6 });
check('a node\'s translation is applied (the model is measured where it is placed)', moved.size[0] >= 5, moved.size.join('x'));

// vertex colours
const vc = voxelize((await collectPrimitives(parseGlb(boxGlb([{ min: [0, 0, 0], max: [1, 1, 1], color: [0, 1, 0] }], { vertexColors: true })))).prims, { resolution: 4 });
check('vertex colours are used when there is no texture', [...vc.cells.values()].every((c) => near(c, [0, srgb(1), 0])));

// ---- colours
const many = []; for (let i = 0; i < 400; i++) many.push([(i * 7) % 256, (i * 13) % 256, (i * 29) % 256]);
const pal = quantize(many, 12);
check('median cut gives at most the palette size asked for', pal.length > 1 && pal.length <= 12, String(pal.length));
check('two colours stay two colours (none is invented)', JSON.stringify(quantize([[255, 0, 0], [0, 0, 255], [255, 0, 0]], 8)) === JSON.stringify([[0, 0, 255], [255, 0, 0]]));
check('snapping picks the nearest palette colour', JSON.stringify(snapToPalette([[250, 10, 10], [10, 10, 240]], [[255, 0, 0], [0, 0, 255], [0, 255, 0]])) === '[0,1]');

const vox = buildVox(t, { colors: 2 });
check('buildVox gives the shape writeVox takes: 1-based indices into a used-only palette', vox.palette.length === 2 && vox.voxels.every((v) => v[3] >= 1 && v[3] <= vox.palette.length), JSON.stringify(vox.palette));
const snapped = buildVox(t, { palette: [[250, 0, 0], [0, 0, 250], [0, 250, 0], [255, 255, 255]] });
check('with a given palette, only its colours are used', snapped.palette.length === 2 && snapped.palette.every((c) => c.includes(250)));

// the game's own loader reads the file back, and it builds a mesh
const bytes = writeVox(vox);
const back = parseVox(bytes);
check('the .vox file round-trips through the game\'s loader', back.voxels.length === vox.voxels.length && back.size.join() === vox.size.join());
const mesh = voxelMesh(back);
check('and the game builds a mesh from it', mesh.indices.length > 0 && mesh.indices.length % 3 === 0, `${mesh.indices.length / 3} triangles`);

// ---- speckle
const speck = { size: [5, 5, 5], palette: [[200, 0, 0], [0, 0, 200]], voxels: [] };
for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) for (let z = 0; z < 5; z++) speck.voxels.push([x, y, z, x === 2 && y === 2 && z === 2 ? 2 : 1]);
const cleaned = cleanColors(speck, 1);
check('a lone odd voxel among the others takes their colour, and the unused colour leaves the palette', cleaned.voxels.every((v) => v[3] === 1) && cleaned.palette.length === 1 && cleaned.voxels.length === 125);
const halves = { size: [6, 2, 2], palette: [[200, 0, 0], [0, 0, 200]], voxels: [] };
for (let x = 0; x < 6; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) halves.voxels.push([x, y, z, x < 3 ? 1 : 2]);
const kept = cleanColors(halves, 1);
check('two solid patches stay two patches (a boundary is not blurred away)', kept.palette.length === 2 && kept.voxels.find((v) => v[0] === 0)[3] === 1 && kept.voxels.find((v) => v[0] === 5)[3] === 2);

// ---- tiles
const flat = { size: [8, 8, 2], palette: [[200, 0, 0]], voxels: [] };
for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) for (let z = 0; z < 2; z++) flat.voxels.push([x, y, z, 1]);
const tiles = splitTiles(flat, 4);
check('a flat slab cut in 4s makes four pieces, all alike, stored once', tiles.placements.length === 4 && tiles.tiles.length === 1 && tiles.tiles[0].uses === 4, `${tiles.placements.length} placed, ${tiles.tiles.length} unique`);
flat.voxels.push([0, 0, 2, 1]);
const odd = splitTiles({ ...flat, size: [8, 8, 3] }, 4);
check('one different voxel makes its own piece', odd.tiles.length === 2 && odd.tiles.map((x) => x.uses).sort().join() === '1,3');
check('every piece fits a tile x tile x tile slot', tiles.tiles.every((tl) => tl.voxels.every(([x, y, z]) => x < 4 && y < 4 && z < 4)));

// ---- the quick look
const pic = previewRaster(vox, 3);
check('the preview is a picture with the model in it', pic.width > 0 && pic.height > 0 && pic.data.length === pic.width * pic.height * 4 && pic.data.some((v, i) => i % 4 === 0 && v > 200));

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
