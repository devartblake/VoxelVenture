// Turns a triangle mesh (.glb) into voxels, and the voxels into a small palette and modular tiles. Pure (no fs, no three.js), so it is tested in Node.
// The command line is scripts/models/voxelize.mjs; the plan and the limits are in docs/world/voxelize.md.
//
//   parseGlb(bytes)                      -> { json, bin }
//   collectPrimitives(glb, decodeImage)  -> [{ pos, uv, col, idx, color, tex }]   world-space triangles, with where each colour comes from
//   voxelize(prims, { resolution, solid }) -> { size: [x, y, z], cells: Map(index -> [r, g, b]), ... }
//   quantize(colors, n) / snapToPalette(colors, palette)  -> palette + a palette index for every colour
//   buildVox(grid, { colors, palette }) -> { size, voxels: [[x, y, z, colorIndex]], palette }   the shape writeVox() takes
//   splitTiles(vox, tile)                -> same-sized pieces that snap together, with the duplicates found
//   previewRaster(vox, scale)            -> { width, height, data }  front, side and top views as RGBA, for a quick look
//
// Axes: glTF is Y-up and a model looks along -Z, MagicaVoxel (and lib/content/vox.js) is Z-up with the front on the low-y side, so
// (x, y, z) in the mesh becomes voxel (x, -z, y). The model's floor ends at z = 0, as the city expects.

const COMPONENT = { 5120: [Int8Array, 'getInt8', 1], 5121: [Uint8Array, 'getUint8', 1], 5122: [Int16Array, 'getInt16', 2], 5123: [Uint16Array, 'getUint16', 2], 5125: [Uint32Array, 'getUint32', 4], 5126: [Float32Array, 'getFloat32', 4] };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const MAX_AXIS = 250; // .vox models are at most 256 voxels along an axis

// ---- reading a .glb ---------------------------------------------------------------------------------------------------------------------

export function parseGlb(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 20 || dv.getUint32(0, true) !== 0x46546c67) throw new Error('Not a .glb file (binary glTF). Export the model as .glb.');
  if (dv.getUint32(4, true) !== 2) throw new Error('Only glTF 2.0 is supported.');
  let json = null;
  let bin = new Uint8Array(0);
  for (let o = 12; o + 8 <= b.length; ) {
    const len = dv.getUint32(o, true);
    const type = dv.getUint32(o + 4, true);
    if (o + 8 + len > b.length) throw new Error('The .glb file is cut short.');
    const data = b.subarray(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(data));
    else if (type === 0x004e4942 && bin.length === 0) bin = data;
    o += 8 + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new Error('The .glb file has no JSON chunk.');
  const needs = (json.extensionsRequired ?? []).filter((e) => e === 'KHR_draco_mesh_compression' || e === 'EXT_meshopt_compression');
  if (needs.length) throw new Error(`The model is compressed (${needs.join(', ')}). Decompress it first, e.g. with gltf-transform (npx @gltf-transform/cli copy in.glb out.glb).`);
  return { json, bin };
}

function bufferViewBytes(glb, index) {
  const v = glb.json.bufferViews?.[index];
  if (!v) throw new Error(`The model points at a buffer view (${index}) that is not there.`);
  if ((v.buffer ?? 0) !== 0) throw new Error('Only the .glb file\'s own binary buffer is supported.');
  return glb.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
}

/** Reads an accessor as a flat Float32Array (normalised integers become 0..1) or, for `raw`, in its own type (indices). */
export function readAccessor(glb, index, { raw = false } = {}) {
  const a = glb.json.accessors?.[index];
  if (!a) throw new Error(`The model points at an accessor (${index}) that is not there.`);
  if (a.sparse) throw new Error('Sparse accessors are not supported.');
  const [Type, getter, size] = COMPONENT[a.componentType] ?? [];
  if (!Type) throw new Error(`Unknown component type ${a.componentType}.`);
  const width = WIDTH[a.type];
  const out = raw ? new Type(a.count * width) : new Float32Array(a.count * width);
  if (a.bufferView === undefined) return out; // all zeros, as the spec says
  const view = glb.json.bufferViews[a.bufferView];
  const bytes = bufferViewBytes(glb, a.bufferView);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const stride = view.byteStride || width * size;
  const base = a.byteOffset ?? 0;
  const norm = !raw && a.normalized ? 1 / ({ 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType] ?? 1) : 1;
  for (let i = 0; i < a.count; i++) for (let c = 0; c < width; c++) out[i * width + c] = dv[getter](base + i * stride + c * size, true) * norm;
  return out;
}

// column-major 4x4 matrices
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const multiply = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (qy * qy + qz * qz)) * sx, 2 * (qx * qy + qz * qw) * sx, 2 * (qx * qz - qy * qw) * sx, 0,
    2 * (qx * qy - qz * qw) * sy, (1 - 2 * (qx * qx + qz * qz)) * sy, 2 * (qy * qz + qx * qw) * sy, 0,
    2 * (qx * qz + qy * qw) * sz, 2 * (qy * qz - qx * qw) * sz, (1 - 2 * (qx * qx + qy * qy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

const srgb = (l) => Math.round(255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055)); // linear 0..1 -> sRGB 0..255

/**
 * The mesh's triangles in world space, with where each one's colour comes from: a texture (decoded by `decodeImage(bytes, mime)`, which
 * returns { width, height, data: RGBA }; `readUri(uri)` gives the bytes of an image that is a separate file), vertex colours, or the material's base colour. Without a decoder, a texture falls back to its
 * material's base colour and is counted in `report.untextured`.
 */
export async function collectPrimitives(glb, decodeImage = null, readUri = null) {
  const { json } = glb;
  const report = { triangles: 0, primitives: 0, skipped: 0, textured: 0, untextured: 0, vertexColored: 0 };
  const textures = new Map();
  const textureOf = async (info) => {
    if (!info) return null;
    if (textures.has(info.index)) return textures.get(info.index);
    let tex = null;
    const image = json.images?.[json.textures?.[info.index]?.source];
    if (image && decodeImage) {
      try {
        let bytes = null;
        if (image.bufferView !== undefined) bytes = bufferViewBytes(glb, image.bufferView);
        else if (typeof image.uri === 'string' && image.uri.startsWith('data:')) bytes = Uint8Array.from(Buffer.from(image.uri.split(',')[1], 'base64'));
        else if (typeof image.uri === 'string' && readUri) bytes = await readUri(image.uri); // a file beside the model (Kenney's Textures/colormap.png)
        if (bytes) tex = await decodeImage(bytes, image.mimeType);
      } catch {
        tex = null;
      }
    }
    textures.set(info.index, tex);
    return tex;
  };

  const prims = [];
  const visit = async (nodeIndex, parent) => {
    const node = json.nodes[nodeIndex];
    const world = multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      for (const p of json.meshes[node.mesh].primitives) {
        if ((p.mode ?? 4) !== 4 || p.attributes?.POSITION === undefined) { report.skipped++; continue; }
        const local = readAccessor(glb, p.attributes.POSITION);
        const pos = new Float32Array(local.length);
        for (let i = 0; i < local.length; i += 3) {
          const x = local[i], y = local[i + 1], z = local[i + 2];
          pos[i] = world[0] * x + world[4] * y + world[8] * z + world[12];
          pos[i + 1] = world[1] * x + world[5] * y + world[9] * z + world[13];
          pos[i + 2] = world[2] * x + world[6] * y + world[10] * z + world[14];
        }
        const idx = p.indices !== undefined ? readAccessor(glb, p.indices, { raw: true }) : Uint32Array.from({ length: local.length / 3 }, (_, i) => i);
        const mat = json.materials?.[p.material]?.pbrMetallicRoughness ?? {};
        const f = mat.baseColorFactor ?? [1, 1, 1, 1];
        const info = mat.baseColorTexture;
        const tex = await textureOf(info);
        const uvSet = info?.texCoord ?? 0;
        const uv = tex && p.attributes[`TEXCOORD_${uvSet}`] !== undefined ? readAccessor(glb, p.attributes[`TEXCOORD_${uvSet}`]) : null;
        const col = p.attributes.COLOR_0 !== undefined ? readAccessor(glb, p.attributes.COLOR_0) : null;
        const colWidth = col ? col.length / (local.length / 3) : 0;
        if (info && !(tex && uv)) report.untextured++;
        else if (tex) report.textured++;
        if (col) report.vertexColored++;
        prims.push({ pos, idx, uv, col, colWidth, color: [srgb(f[0]), srgb(f[1]), srgb(f[2])], tex });
        report.primitives++;
        report.triangles += Math.floor(idx.length / 3);
      }
    }
    for (const c of node.children ?? []) await visit(c, world);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  for (const n of scene?.nodes ?? json.nodes.map((_, i) => i).filter((i) => !json.nodes.some((o) => o.children?.includes(i)))) await visit(n, identity());
  return { prims, report };
}

// ---- voxelising -------------------------------------------------------------------------------------------------------------------------

function sampleTexture(tex, u, v) {
  const x = Math.min(tex.width - 1, Math.floor((((u % 1) + 1) % 1) * tex.width));
  const y = Math.min(tex.height - 1, Math.floor((((v % 1) + 1) % 1) * tex.height));
  const o = (y * tex.width + x) * 4;
  return [tex.data[o], tex.data[o + 1], tex.data[o + 2]];
}

/**
 * Marks every voxel a triangle touches, and gives it the average colour of the samples in it. `resolution` is the number of voxels along the
 * model's longest side. `solid` fills the inside too (the colour of the nearest surface voxel), which makes it watertight for cutting.
 */
export function voxelize(prims, { resolution = 48, solid = false } = {}) {
  const res = Math.max(1, Math.min(MAX_AXIS, Math.round(resolution)));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p.pos[i + k]); max[k] = Math.max(max[k], p.pos[i + k]); }
  if (!prims.length || !Number.isFinite(min[0])) throw new Error('The model has no triangles to voxelise.');
  const extent = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const longest = Math.max(...extent);
  if (!(longest > 0)) throw new Error('The model has no size.');
  const vs = longest / res; // one voxel, in the model's own units
  // glTF (x, y, z) -> voxel (x, -z, y): to voxel space, the floor at 0
  const toVoxel = (x, y, z) => [(x - min[0]) / vs, (max[2] - z) / vs, (y - min[1]) / vs];
  const size = [Math.max(1, Math.ceil(extent[0] / vs - 1e-9)), Math.max(1, Math.ceil(extent[2] / vs - 1e-9)), Math.max(1, Math.ceil(extent[1] / vs - 1e-9))];
  const cellOf = (x, y, z) => [Math.min(size[0] - 1, Math.max(0, Math.floor(x))), Math.min(size[1] - 1, Math.max(0, Math.floor(y))), Math.min(size[2] - 1, Math.max(0, Math.floor(z)))];
  const at = (x, y, z) => x + size[0] * (y + size[1] * z);

  const sums = new Map(); // cell index -> [r, g, b, n]
  const vertex = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of prims) {
    for (let t = 0; t + 2 < p.idx.length; t += 3) {
      const ids = [p.idx[t], p.idx[t + 1], p.idx[t + 2]];
      for (let k = 0; k < 3; k++) vertex[k] = toVoxel(p.pos[ids[k] * 3], p.pos[ids[k] * 3 + 1], p.pos[ids[k] * 3 + 2]);
      const [a, b, c] = vertex;
      const longestEdge = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]), Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]));
      const n = Math.max(1, Math.ceil(longestEdge / 0.5)); // a sample at least every half voxel, so no voxel the triangle crosses is missed
      for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n - i; j++) {
          const u = i / n, v = j / n, w = 1 - u - v;
          const [cx, cy, cz] = cellOf(w * a[0] + u * b[0] + v * c[0], w * a[1] + u * b[1] + v * c[1], w * a[2] + u * b[2] + v * c[2]);
          let rgb;
          if (p.tex && p.uv) rgb = sampleTexture(p.tex, w * p.uv[ids[0] * 2] + u * p.uv[ids[1] * 2] + v * p.uv[ids[2] * 2], w * p.uv[ids[0] * 2 + 1] + u * p.uv[ids[1] * 2 + 1] + v * p.uv[ids[2] * 2 + 1]);
          else if (p.col) {
            const q = p.colWidth;
            const ch = (k) => w * p.col[ids[0] * q + k] + u * p.col[ids[1] * q + k] + v * p.col[ids[2] * q + k];
            rgb = [srgb(ch(0)), srgb(ch(1)), srgb(ch(2))];
          } else rgb = p.color;
          if (p.tex && p.uv && p.color) rgb = [Math.round((rgb[0] * p.color[0]) / 255), Math.round((rgb[1] * p.color[1]) / 255), Math.round((rgb[2] * p.color[2]) / 255)];
          const key = at(cx, cy, cz);
          const s = sums.get(key);
          if (s) { s[0] += rgb[0]; s[1] += rgb[1]; s[2] += rgb[2]; s[3]++; } else sums.set(key, [rgb[0], rgb[1], rgb[2], 1]);
        }
      }
    }
  }
  const cells = new Map();
  for (const [k, s] of sums) cells.set(k, [Math.round(s[0] / s[3]), Math.round(s[1] / s[3]), Math.round(s[2] / s[3])]);
  const surface = cells.size;
  if (solid) fillInside(cells, size, at);
  return { size, cells, at, surface, unit: vs, longest };
}

// fills what the surface closes in: flood the outside from a padded border, then give every inside cell the colour of the nearest surface cell
function fillInside(cells, size, at) {
  const [sx, sy, sz] = size;
  const px = sx + 2, py = sy + 2;
  const pad = (x, y, z) => x + 1 + px * (y + 1 + py * (z + 1));
  const outside = new Uint8Array(px * py * (sz + 2));
  const stack = [pad(-1, -1, -1)];
  outside[stack[0]] = 1;
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  while (stack.length) {
    const cur = stack.pop();
    const x = (cur % px) - 1, y = (Math.floor(cur / px) % py) - 1, z = Math.floor(cur / (px * py)) - 1;
    for (const [dx, dy, dz] of dirs) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (nx < -1 || ny < -1 || nz < -1 || nx > sx || ny > sy || nz > sz) continue;
      const p = pad(nx, ny, nz);
      if (outside[p]) continue;
      if (nx >= 0 && ny >= 0 && nz >= 0 && nx < sx && ny < sy && nz < sz && cells.has(at(nx, ny, nz))) continue;
      outside[p] = 1;
      stack.push(p);
    }
  }
  let frontier = [...cells.keys()];
  while (frontier.length) {
    const next = [];
    for (const key of frontier) {
      const x = key % sx, y = Math.floor(key / sx) % sy, z = Math.floor(key / (sx * sy));
      for (const [dx, dy, dz] of dirs) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz) continue;
        const k = at(nx, ny, nz);
        if (cells.has(k) || outside[pad(nx, ny, nz)]) continue;
        cells.set(k, cells.get(key));
        next.push(k);
      }
    }
    frontier = next;
  }
}

// ---- colours ----------------------------------------------------------------------------------------------------------------------------

/** Median cut: `n` colours that stand for all of `colors` (an array of [r, g, b]), weighted by how often each occurs. */
export function quantize(colors, n) {
  const count = new Map();
  for (const [r, g, b] of colors) { const k = (r << 16) | (g << 8) | b; count.set(k, (count.get(k) ?? 0) + 1); }
  const items = [...count].map(([k, w]) => ({ c: [k >> 16, (k >> 8) & 255, k & 255], w }));
  const spread = (box) => {
    const lo = [255, 255, 255], hi = [0, 0, 0];
    for (const { c } of box) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], c[i]); hi[i] = Math.max(hi[i], c[i]); }
    const range = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const axis = range.indexOf(Math.max(...range));
    return { axis, range: range[axis] };
  };
  const boxes = [items];
  while (boxes.length < Math.max(1, n)) {
    let best = -1, bestScore = 0;
    boxes.forEach((box, i) => { if (box.length < 2) return; const { range } = spread(box); const score = range * Math.sqrt(box.reduce((s, x) => s + x.w, 0)); if (score > bestScore) { best = i; bestScore = score; } });
    if (best < 0) break;
    const box = boxes[best];
    const { axis } = spread(box);
    box.sort((a, b) => a.c[axis] - b.c[axis]);
    const half = box.reduce((s, x) => s + x.w, 0) / 2;
    let acc = 0, cut = 1;
    for (let i = 0; i < box.length - 1; i++) { acc += box[i].w; cut = i + 1; if (acc >= half) break; }
    boxes.splice(best, 1, box.slice(0, cut), box.slice(cut));
  }
  const palette = boxes.map((box) => {
    const w = box.reduce((s, x) => s + x.w, 0);
    return [0, 1, 2].map((i) => Math.round(box.reduce((s, x) => s + x.c[i] * x.w, 0) / w));
  });
  return palette.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
}

const distance = (a, b) => { const rm = (a[0] + b[0]) / 2; const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]; return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db; }; // "redmean": closer to how the eye weighs colours than plain RGB
/** The palette index (0-based) nearest to each colour. */
export function snapToPalette(colors, palette) {
  const memo = new Map();
  return colors.map((c) => {
    const k = (c[0] << 16) | (c[1] << 8) | c[2];
    if (memo.has(k)) return memo.get(k);
    let best = 0, bestD = Infinity;
    palette.forEach((p, i) => { const d = distance(c, p); if (d < bestD) { bestD = d; best = i; } });
    memo.set(k, best);
    return best;
  });
}

/**
 * The voxels as lib/content/vox.js writes them. With `palette` (an existing one, e.g. from a city .vox) every colour snaps to it; otherwise
 * a palette of `colors` entries is made. Colours nothing uses are dropped. Indices are 1-based, as in MagicaVoxel.
 */
export function buildVox(grid, { colors = 16, palette = null } = {}) {
  const keys = [...grid.cells.keys()];
  const rgb = keys.map((k) => grid.cells.get(k));
  const target = palette ?? quantize(rgb, Math.min(255, Math.max(1, colors)));
  const pick = snapToPalette(rgb, target);
  const used = [...new Set(pick)].sort((a, b) => a - b);
  const remap = new Map(used.map((p, i) => [p, i + 1]));
  const [sx, sy] = grid.size;
  const voxels = keys.map((key, i) => [key % sx, Math.floor(key / sx) % sy, Math.floor(key / (sx * sy)), remap.get(pick[i])]);
  voxels.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  return { size: grid.size.slice(), voxels, palette: used.map((p) => target[p]) };
}

// ---- modular tiles ----------------------------------------------------------------------------------------------------------------------

/**
 * Cuts the model on a grid of `tile` voxels. Every piece is the same size (tile x tile x tile), so any piece fits any slot; pieces that are
 * exactly alike (same voxels, same colours) are stored once and the placements say where each goes. A kit is the unique pieces.
 */
export function splitTiles(vox, tile) {
  const t = Math.max(1, Math.round(tile));
  const cuts = new Map();
  for (const [x, y, z, c] of vox.voxels) {
    const key = `${Math.floor(x / t)},${Math.floor(y / t)},${Math.floor(z / t)}`;
    if (!cuts.has(key)) cuts.set(key, []);
    cuts.get(key).push([x % t, y % t, z % t, c]);
  }
  const unique = new Map(); // fingerprint -> tile
  const tiles = [];
  const placements = [];
  for (const [key, list] of [...cuts].sort()) {
    const fingerprint = list.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]).map((v) => v.join(',')).join(';');
    let entry = unique.get(fingerprint);
    if (!entry) { entry = { id: tiles.length, voxels: list, uses: 0 }; unique.set(fingerprint, entry); tiles.push(entry); }
    entry.uses++;
    const [gx, gy, gz] = key.split(',').map(Number);
    placements.push({ at: [gx, gy, gz], tile: entry.id });
  }
  return { tile: t, tiles, placements, grid: [Math.ceil(vox.size[0] / t), Math.ceil(vox.size[1] / t), Math.ceil(vox.size[2] / t)] };
}

// ---- a quick look -----------------------------------------------------------------------------------------------------------------------

/** Front (from the low-y side), side (from the high-x side) and top views side by side, one square of `scale` pixels per voxel. */
export function previewRaster(vox, scale = 6) {
  const [sx, sy, sz] = vox.size;
  const grid = new Map();
  for (const [x, y, z, c] of vox.voxels) grid.set(x + sx * (y + sy * z), c);
  const at = (x, y, z) => grid.get(x + sx * (y + sy * z));
  const gap = 2;
  const views = [
    { w: sx, h: sz, shade: 1, pick: (u, v) => { for (let y = 0; y < sy; y++) { const c = at(u, y, sz - 1 - v); if (c) return c; } return 0; } }, // front
    { w: sy, h: sz, shade: 0.8, pick: (u, v) => { for (let x = sx - 1; x >= 0; x--) { const c = at(x, u, sz - 1 - v); if (c) return c; } return 0; } }, // side
    { w: sx, h: sy, shade: 1.12, pick: (u, v) => { for (let z = sz - 1; z >= 0; z--) { const c = at(u, v, z); if (c) return c; } return 0; } }, // top
  ];
  const width = views.reduce((s, v) => s + v.w * scale, gap * (views.length + 1));
  const height = Math.max(...views.map((v) => v.h * scale)) + gap * 2;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([34, 38, 48, 255], i * 4);
  let ox = gap;
  for (const view of views) {
    for (let v = 0; v < view.h; v++) for (let u = 0; u < view.w; u++) {
      const ci = view.pick(u, v);
      if (!ci) continue;
      const rgb = vox.palette[ci - 1].map((x) => Math.max(0, Math.min(255, Math.round(x * view.shade))));
      for (let py = 0; py < scale; py++) for (let px = 0; px < scale; px++) {
        const edge = px === scale - 1 || py === scale - 1 ? 0.86 : 1; // a thin edge, so single voxels can be told apart
        data.set([Math.round(rgb[0] * edge), Math.round(rgb[1] * edge), Math.round(rgb[2] * edge), 255], ((gap + v * scale + py) * width + ox + u * scale + px) * 4);
      }
    }
    ox += view.w * scale + gap;
  }
  return { width, height, data };
}
