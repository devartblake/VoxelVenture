// MagicaVoxel (.vox) files: a parser and a mesh builder. Pure (no three.js), so it is tested in Node.
//
//   parseVox(bytes)        -> { size: [x, y, z], voxels: [[x, y, z, colorIndex]], palette: [[r, g, b]] }  (first model only)
//   voxelMesh(vox, unit)   -> { positions, normals, colors, indices }  flat arrays, one quad per visible voxel face
//
// MagicaVoxel is Z-up; the game is Y-up, so (x, y, z) in the file becomes (x, z, -y) in the mesh. The mesh sits with its floor at y = 0
// and is centred on x / z. Faces between two voxels are not made, so a solid block costs six quads, not one per voxel.
const DEFAULT_PALETTE_ENTRY = [200, 200, 200];

export function parseVox(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (b.length < 20 || tag(0) !== 'VOX ') throw new Error('Not a MagicaVoxel file');
  let size = null;
  let voxels = null;
  let palette = null;
  let o = 8; // after the "VOX " tag and version
  while (o + 12 <= b.length) {
    const id = tag(o);
    const content = dv.getUint32(o + 4, true);
    const children = dv.getUint32(o + 8, true);
    const at = o + 12;
    if (at + content > b.length) throw new Error('The .vox file is cut short');
    if (id === 'SIZE' && !size) size = [dv.getInt32(at, true), dv.getInt32(at + 4, true), dv.getInt32(at + 8, true)];
    else if (id === 'XYZI' && !voxels) {
      const n = dv.getUint32(at, true);
      if (4 + n * 4 > content) throw new Error('The .vox voxel list is cut short');
      voxels = [];
      for (let i = 0; i < n; i++) voxels.push([b[at + 4 + i * 4], b[at + 5 + i * 4], b[at + 6 + i * 4], b[at + 7 + i * 4]]);
    } else if (id === 'RGBA') {
      palette = [];
      for (let i = 0; i < 256; i++) palette.push([b[at + i * 4], b[at + i * 4 + 1], b[at + i * 4 + 2]]);
    }
    o = at + content + (id === 'MAIN' ? 0 : children); // MAIN's chunks follow inside it: step into it, skip the rest
  }
  if (!size || !voxels) throw new Error('The .vox file has no model');
  // an index i in a voxel is palette[i - 1]; a file without a palette uses a plain grey
  const pal = palette ? palette.slice(0, 255) : null;
  return { size, voxels, palette: pal ?? Array.from({ length: 255 }, () => DEFAULT_PALETTE_ENTRY) };
}

const FACES = [
  // direction, then the four corners (counter-clockwise seen from outside), in the file's x / y / z
  { d: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.85 },
  { d: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.85 },
  { d: [0, 1, 0], c: [[1, 1, 0], [0, 1, 0], [0, 1, 1], [1, 1, 1]], shade: 0.7 },
  { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.7 },
  { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 1 },
  { d: [0, 0, -1], c: [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]], shade: 0.55 },
];

// `unit` is the size of one voxel in game units. Visible faces of the same colour that lie in one plane are merged into larger rectangles
// (greedy meshing), so a flat wall is one quad, not one per voxel.
export function voxelMesh(vox, unit = 0.05) {
  const [sx, sy] = vox.size;
  const dims = vox.size;
  const key = (x, y, z) => x + y * 512 + z * 262144;
  const solid = new Map(vox.voxels.map(([x, y, z, c]) => [key(x, y, z), c]));
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  FACES.forEach((f) => {
    const a = f.d.findIndex((v) => v !== 0); // the axis the face looks along
    const [u, v] = [0, 1, 2].filter((i) => i !== a); // the two axes it spreads over
    // the visible faces of this direction, by slice (the voxel's position along `a`): slice -> grid of colour indices
    const slices = new Map();
    for (const [x, y, z, ci] of vox.voxels) {
      if (solid.has(key(x + f.d[0], y + f.d[1], z + f.d[2]))) continue;
      const p = [x, y, z];
      if (!slices.has(p[a])) slices.set(p[a], new Int16Array(dims[u] * dims[v]));
      slices.get(p[a])[p[u] + p[v] * dims[u]] = ci;
    }
    for (const [slice, grid] of slices) {
      for (let j = 0; j < dims[v]; j++) {
        for (let i = 0; i < dims[u]; i++) {
          const ci = grid[i + j * dims[u]];
          if (!ci) continue;
          let w = 1;
          while (i + w < dims[u] && grid[i + w + j * dims[u]] === ci) w++;
          let h = 1;
          grow: for (; j + h < dims[v]; h++) for (let k = 0; k < w; k++) if (grid[i + k + (j + h) * dims[u]] !== ci) break grow;
          for (let jj = 0; jj < h; jj++) for (let ii = 0; ii < w; ii++) grid[i + ii + (j + jj) * dims[u]] = 0;
          const rgb = vox.palette[Math.max(0, ci - 1)] ?? DEFAULT_PALETTE_ENTRY;
          const base = positions.length / 3;
          for (const c of f.c) {
            const o = [0, 0, 0];
            o[a] = slice + c[a];
            o[u] = i + c[u] * w;
            o[v] = j + c[v] * h;
            // file (x, y, z) -> game (x, z, -y), centred on the model's footprint, floor at 0
            positions.push((o[0] - sx / 2) * unit, o[2] * unit, -(o[1] - sy / 2) * unit);
            colors.push((rgb[0] / 255) * f.shade, (rgb[1] / 255) * f.shade, (rgb[2] / 255) * f.shade);
            normals.push(f.d[0], f.d[2], -f.d[1]);
          }
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  });
  return { positions, normals, colors, indices };
}

// Writes a .vox file (used by the sample generator and the tests).
export function writeVox({ size, voxels, palette }) {
  const chunk = (id, content, children = []) => {
    const kids = children.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(12 + content.length + kids);
    const dv = new DataView(out.buffer);
    for (let i = 0; i < 4; i++) out[i] = id.charCodeAt(i);
    dv.setUint32(4, content.length, true);
    dv.setUint32(8, kids, true);
    out.set(content, 12);
    let at = 12 + content.length;
    for (const c of children) { out.set(c, at); at += c.length; }
    return out;
  };
  const sizeData = new Uint8Array(12);
  size.forEach((v, i) => new DataView(sizeData.buffer).setInt32(i * 4, v, true));
  const xyzi = new Uint8Array(4 + voxels.length * 4);
  new DataView(xyzi.buffer).setUint32(0, voxels.length, true);
  voxels.forEach((v, i) => xyzi.set(v, 4 + i * 4));
  const rgba = new Uint8Array(1024);
  (palette ?? []).slice(0, 255).forEach(([r, g, bl], i) => rgba.set([r, g, bl, 255], i * 4));
  const main = chunk('MAIN', new Uint8Array(0), [chunk('SIZE', sizeData), chunk('XYZI', xyzi), chunk('RGBA', rgba)]);
  const out = new Uint8Array(8 + main.length);
  out.set([0x56, 0x4f, 0x58, 0x20, 150, 0, 0, 0]); // "VOX ", version 150
  out.set(main, 8);
  return out;
}
