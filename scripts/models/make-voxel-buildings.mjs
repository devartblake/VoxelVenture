// Writes a set of voxel buildings (MagicaVoxel .vox files) to public/models/vox/buildings/ and the catalogue that lets the city use them
// (lib/content/voxBuildingCatalog.js, GENERATED). They are original to this project. To use your own, export a .vox from MagicaVoxel to the
// same file name (keep the front of the building on the low-y side, i.e. facing the "front" in MagicaVoxel's view, and the floor at z = 0),
// then run this script with --catalog-only to refresh the sizes.
//   node scripts/models/make-voxel-buildings.mjs [--catalog-only]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVox, voxelMesh, writeVox } from '../../lib/content/vox.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.join(root, 'public', 'models', 'vox', 'buildings');
const catalogOnly = process.argv.includes('--catalog-only');

// palette index (1-based) -> colour
const PAL = {
  cream: 1, grey: 2, brick: 3, glass: 4, dark: 5, roof: 6, red: 7, white: 8, door: 9, gold: 10, concrete: 11, green: 12, teal: 13, yellow: 14, orange: 15,
};
const PALETTE = [[236, 226, 200], [148, 156, 168], [176, 82, 62], [92, 170, 214], [44, 52, 66], [78, 84, 96], [214, 64, 64], [244, 244, 240], [128, 86, 52], [232, 188, 60], [176, 176, 170], [74, 150, 84], [40, 112, 128], [250, 214, 70], [236, 128, 48]];

class Grid {
  constructor(w, d, h) {
    this.w = w; this.d = d; this.h = h; this.c = new Map();
  }
  set(x, y, z, color) {
    if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.d || z >= this.h) return;
    this.c.set(`${x},${y},${z}`, color);
  }
  has(x, y, z) { return this.c.has(`${x},${y},${z}`); }
  box(x0, x1, y0, y1, z0, z1, color) {
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) this.set(x, y, z, color);
  }
  // paint the voxels that are on the outside of the block, on the face `face` ('front' y low, 'back', 'left', 'right'), where `fn(u, z)` returns a colour or null
  face(face, [u0, u1], [z0, z1], fn, y0, y1, x0, x1) {
    for (let u = u0; u < u1; u++) for (let z = z0; z < z1; z++) {
      const col = fn(u, z);
      if (!col) continue;
      if (face === 'front') this.set(u, y0, z, col);
      else if (face === 'back') this.set(u, y1 - 1, z, col);
      else if (face === 'left') this.set(x0, u, z, col);
      else this.set(x1 - 1, u, z, col);
    }
  }
  voxels() {
    return [...this.c.entries()].map(([k, v]) => [...k.split(',').map(Number), v]);
  }
}

// a block with a window grid on all four sides
function block(g, x0, x1, y0, y1, z0, z1, wall, windows) {
  g.box(x0, x1, y0, y1, z0, z1, wall);
  const win = (u, z, uo, zo) => ((u - uo) % windows.px < windows.w && (z - zo) % windows.pz < windows.h ? windows.color : null);
  g.face('front', [x0 + 1, x1 - 1], [z0 + windows.z0, z1 - 1], (u, z) => win(u, z, x0 + 1, z0 + windows.z0), y0, y1, x0, x1);
  g.face('back', [x0 + 1, x1 - 1], [z0 + windows.z0, z1 - 1], (u, z) => win(u, z, x0 + 1, z0 + windows.z0), y0, y1, x0, x1);
  g.face('left', [y0 + 1, y1 - 1], [z0 + windows.z0, z1 - 1], (u, z) => win(u, z, y0 + 1, z0 + windows.z0), y0, y1, x0, x1);
  g.face('right', [y0 + 1, y1 - 1], [z0 + windows.z0, z1 - 1], (u, z) => win(u, z, y0 + 1, z0 + windows.z0), y0, y1, x0, x1);
}
const parapet = (g, x0, x1, y0, y1, z, color) => {
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) if (x === x0 || x === x1 - 1 || y === y0 || y === y1 - 1) g.set(x, y, z, color);
};
const door = (g, cx, y, w, h, color = PAL.door) => g.box(cx - Math.floor(w / 2), cx - Math.floor(w / 2) + w, y, y + 1, 0, h, color);
// the front (low y) of a shop: a glass band with a door in the middle
function storefront(g, x0, x1, y, z0, z1, doorW = 4) {
  g.box(x0 + 2, x1 - 2, y, y + 1, z0, z1, PAL.glass);
  for (let x = x0 + 2; x < x1 - 2; x += 5) g.box(x, x + 1, y, y + 1, z0, z1, PAL.dark);
  door(g, Math.floor((x0 + x1) / 2), y, doorW, z1, PAL.dark);
}
const awning = (g, x0, x1, y0, y1, z, stripes) => {
  for (let x = x0; x < x1; x++) g.box(x, x + 1, y0, y1, z, z + 1, stripes ? (x % 2 ? PAL.red : PAL.white) : PAL.red);
};

// ---- the admin headquarters: two landmark towers for the luxury estates (see ADMIN_HQS in lib/city/cityGenerator.js). 56 x 36 x 48 voxels, the
// proportions of a luxury estate's footprint, so they fill it; classes are empty, so only those two plots ever use them.
const SYN = { navy: 1, navy2: 2, cyan: 3, blue: 4, purple: 5, deep: 6, white: 7, grey: 8, pink: 9, glow: 10 };
const SYN_PALETTE = [[11, 18, 48], [30, 42, 90], [34, 211, 238], [59, 130, 246], [139, 92, 246], [91, 33, 182], [248, 250, 252], [148, 163, 184], [236, 72, 153], [186, 230, 253]];
const TMT = { white: 1, stone: 2, teal: 3, teal2: 4, glass: 5, navy: 6, gold: 7, glass2: 8, grey: 9 };
const TMT_PALETTE = [[241, 245, 249], [203, 213, 225], [15, 118, 110], [20, 184, 166], [103, 232, 249], [15, 23, 42], [251, 191, 36], [14, 116, 144], [148, 163, 184]];

// Synaptix Play: a dark glass tower on a wide, bright podium, with cyan fins, purple neon bands and a big play button on the roof.
function synaptixHq() {
  const g = new Grid(56, 36, 48);
  // podium: the whole footprint, three storeys, a glass atrium on the front
  g.box(0, 56, 0, 36, 0, 9, SYN.navy2);
  for (let x = 4; x < 52; x++) for (let z = 1; z < 8; z++) g.set(x, 0, z, x % 6 === 0 ? SYN.navy : SYN.cyan);
  g.box(24, 32, 0, 1, 0, 6, SYN.navy); // the doors
  g.box(0, 56, 0, 36, 9, 10, SYN.purple); // a neon band round the podium roof
  parapet(g, 0, 56, 0, 36, 10, SYN.white);
  // the tower
  g.box(10, 46, 6, 30, 10, 38, SYN.navy);
  for (let z = 12; z < 37; z += 3) {
    for (let x = 11; x < 45; x++) if (x % 5 !== 0) { g.set(x, 6, z, SYN.blue); g.set(x, 29, z, SYN.blue); g.set(x, 6, z + 1, SYN.blue); g.set(x, 29, z + 1, SYN.blue); }
    for (let y = 7; y < 29; y++) if (y % 5 !== 0) { g.set(10, y, z, SYN.blue); g.set(45, y, z, SYN.blue); g.set(10, y, z + 1, SYN.blue); g.set(45, y, z + 1, SYN.blue); }
  }
  for (const x of [10, 21, 34, 45]) for (let z = 10; z < 38; z++) { g.set(x, 6, z, SYN.cyan); g.set(x, 29, z, SYN.cyan); } // cyan fins
  for (const z of [20, 29]) { g.box(9, 47, 5, 6, z, z + 1, SYN.purple); g.box(9, 47, 30, 31, z, z + 1, SYN.purple); } // neon bands that wrap the tower
  g.box(10, 46, 6, 30, 38, 39, SYN.deep);
  parapet(g, 10, 46, 6, 30, 39, SYN.cyan);
  // the play button on the roof: a purple plate with a white triangle pointing to the right
  g.box(18, 40, 14, 22, 39, 40, SYN.deep);
  for (let dz = -4; dz <= 4; dz++) for (let x = 24; x < 24 + (5 - Math.abs(dz)) * 3; x++) g.box(x, x + 1, 15, 21, 43 + dz, 44 + dz, SYN.white);
  g.box(27, 29, 17, 19, 47, 48, SYN.glow); // a mast
  return g;
}

// Theoretical Minds Technology: a research institute: a white colonnaded podium under a glass dome, a slender teal tower behind it, and golden orbits round its top.
function theoreticalMindsHq() {
  const g = new Grid(56, 36, 48);
  g.box(0, 56, 0, 36, 0, 2, TMT.stone); // a plinth
  g.box(0, 56, 0, 36, 2, 9, TMT.white);
  for (let x = 0; x < 56; x += 8) g.box(x, x + 2, 0, 1, 2, 9, TMT.teal); // the colonnade
  for (let x = 2; x < 56; x += 8) for (let z = 3; z < 8; z++) for (let w = 0; w < 6; w++) g.set(x + w, 0, z, TMT.glass);
  g.box(24, 32, 0, 1, 2, 6, TMT.navy);
  g.box(0, 56, 0, 36, 9, 10, TMT.teal);
  // the dome: a glass half-sphere over the front of the podium, with teal ribs
  const cx = 24;
  const cy = 14;
  for (let x = 0; x < 56; x++) for (let y = 0; y < 36; y++) for (let z = 10; z < 28; z++) {
    const d = Math.hypot(x - cx, y - cy, z - 10);
    if (d <= 14 && d > 12.4) g.set(x, y, z, (x - cx) % 7 === 0 || (y - cy) % 7 === 0 || z === 10 ? TMT.teal2 : TMT.glass);
  }
  // the tower behind it
  g.box(36, 52, 18, 34, 10, 40, TMT.teal);
  for (let z = 12; z < 39; z += 3) {
    for (let x = 37; x < 51; x++) if (x % 4) { g.set(x, 18, z, TMT.glass2); g.set(x, 33, z, TMT.glass2); g.set(x, 18, z + 1, TMT.glass2); g.set(x, 33, z + 1, TMT.glass2); }
    for (let y = 19; y < 33; y++) if (y % 4) { g.set(36, y, z, TMT.glass2); g.set(51, y, z, TMT.glass2); g.set(36, y, z + 1, TMT.glass2); g.set(51, y, z + 1, TMT.glass2); }
  }
  g.box(35, 53, 17, 35, 40, 41, TMT.white);
  g.box(42, 46, 24, 28, 41, 47, TMT.teal2); // the spire
  g.box(43, 45, 25, 27, 47, 48, TMT.gold);
  // golden orbits round the top: one flat, one tilted
  for (let a = 0; a < 360; a += 3) {
    const r = (a * Math.PI) / 180;
    g.set(Math.round(44 + 12 * Math.cos(r)), Math.round(26 + 8 * Math.sin(r)), 36, TMT.gold);
    g.set(Math.round(44 + 9 * Math.cos(r)), 26, Math.round(43 + 4 * Math.sin(r)), TMT.gold);
  }
  return g;
}

const DESIGNS = {
  'synaptix-hq': { classes: [], palette: SYN_PALETTE, hq: true, build: synaptixHq },
  'theoretical-minds-hq': { classes: [], palette: TMT_PALETTE, hq: true, build: theoreticalMindsHq },
  'tower-a': { classes: ['tall'], build() {
    const g = new Grid(16, 16, 50);
    g.box(0, 16, 0, 16, 0, 6, PAL.grey);
    g.box(2, 14, 0, 1, 1, 5, PAL.glass);
    door(g, 8, 0, 3, 4, PAL.dark);
    block(g, 0, 16, 0, 16, 6, 40, PAL.dark, { px: 2, pz: 2, w: 1, h: 1, z0: 0, color: PAL.glass });
    // glass fills: windows on a dark frame, so paint the whole shaft glass in bands
    for (let z = 7; z < 40; z += 3) for (let x = 1; x < 15; x++) { g.set(x, 0, z, PAL.glass); g.set(x, 15, z, PAL.glass); g.set(x, 0, z + 1, PAL.glass); g.set(x, 15, z + 1, PAL.glass); }
    g.box(2, 14, 2, 14, 40, 46, PAL.grey);
    parapet(g, 2, 14, 2, 14, 46, PAL.dark);
    g.box(7, 9, 7, 9, 46, 50, PAL.dark);
    return g;
  } },
  'tower-b': { classes: ['tall'], build() {
    const g = new Grid(14, 14, 42);
    block(g, 0, 14, 0, 14, 0, 30, PAL.cream, { px: 3, pz: 3, w: 2, h: 2, z0: 3, color: PAL.glass });
    door(g, 7, 0, 3, 4, PAL.door);
    block(g, 2, 12, 2, 12, 30, 38, PAL.cream, { px: 3, pz: 3, w: 2, h: 2, z0: 1, color: PAL.glass });
    g.box(1, 13, 1, 13, 38, 39, PAL.gold);
    g.box(5, 9, 5, 9, 39, 42, PAL.grey);
    return g;
  } },
  'office-a': { classes: ['mid'], build() {
    const g = new Grid(22, 14, 24);
    block(g, 0, 22, 0, 14, 0, 22, PAL.grey, { px: 3, pz: 3, w: 2, h: 2, z0: 6, color: PAL.glass });
    storefront(g, 0, 22, 0, 1, 5, 4);
    g.box(0, 22, 0, 14, 22, 23, PAL.dark);
    parapet(g, 0, 22, 0, 14, 23, PAL.dark);
    g.box(3, 7, 3, 7, 23, 24, PAL.concrete);
    g.box(13, 18, 6, 10, 23, 24, PAL.concrete);
    return g;
  } },
  apartments: { classes: ['mid', 'tall'], build() {
    const g = new Grid(18, 12, 28);
    block(g, 0, 18, 0, 12, 0, 26, PAL.brick, { px: 3, pz: 4, w: 2, h: 2, z0: 3, color: PAL.glass });
    door(g, 9, 0, 3, 4, PAL.dark);
    for (let z = 7; z < 26; z += 4) g.box(1, 17, 0, 1, z, z + 1, PAL.cream); // balcony ledges on the front
    g.box(0, 18, 0, 12, 26, 27, PAL.dark);
    parapet(g, 0, 18, 0, 12, 27, PAL.dark);
    return g;
  } },
  'shop-a': { classes: ['low'], build() {
    const g = new Grid(24, 16, 13); // front 2 voxels are the awning
    block(g, 0, 24, 2, 16, 0, 11, PAL.cream, { px: 4, pz: 4, w: 2, h: 2, z0: 7, color: PAL.glass });
    storefront(g, 0, 24, 2, 1, 6, 4);
    awning(g, 1, 23, 0, 3, 7, true);
    g.box(0, 24, 2, 16, 11, 12, PAL.roof);
    parapet(g, 0, 24, 2, 16, 12, PAL.dark);
    g.box(8, 16, 2, 3, 8, 11, PAL.yellow); // sign band above the awning
    return g;
  } },
  cafe: { classes: ['low', 'mid'], build() {
    const g = new Grid(20, 16, 14);
    block(g, 0, 20, 2, 16, 0, 11, PAL.orange, { px: 4, pz: 4, w: 2, h: 2, z0: 7, color: PAL.glass });
    storefront(g, 0, 20, 2, 1, 6, 4);
    awning(g, 0, 20, 0, 3, 7, true);
    g.box(0, 20, 2, 16, 11, 13, PAL.roof);
    g.box(7, 13, 3, 4, 10, 13, PAL.white); // a roof sign
    g.box(15, 17, 6, 8, 13, 14, PAL.grey);
    return g;
  },},
  warehouse: { classes: ['low', 'wide'], build() {
    const g = new Grid(30, 18, 11);
    g.box(0, 30, 0, 18, 0, 9, PAL.concrete);
    for (const cx of [6, 15, 24]) g.box(cx - 3, cx + 3, 0, 1, 0, 6, PAL.dark);
    g.face('front', [1, 29], [7, 8], () => PAL.glass, 0, 18, 0, 30);
    g.box(0, 30, 0, 18, 9, 10, PAL.roof);
    g.box(2, 28, 6, 12, 10, 11, PAL.grey);
    return g;
  } },
  hall: { classes: ['wide', 'low'], build() {
    const g = new Grid(38, 16, 15);
    block(g, 0, 38, 0, 16, 0, 13, PAL.cream, { px: 5, pz: 4, w: 3, h: 2, z0: 5, color: PAL.glass });
    g.box(13, 25, 0, 1, 0, 11, PAL.glass);
    g.box(18, 20, 0, 1, 0, 5, PAL.dark);
    g.box(0, 38, 0, 16, 13, 14, PAL.green);
    parapet(g, 0, 38, 0, 16, 14, PAL.dark);
    return g;
  } },
  market: { classes: ['wide', 'low'], build() {
    const g = new Grid(34, 18, 13);
    block(g, 0, 34, 2, 18, 0, 10, PAL.brick, { px: 4, pz: 4, w: 2, h: 2, z0: 6, color: PAL.glass });
    g.box(2, 32, 2, 3, 0, 5, PAL.glass);
    for (let x = 2; x < 32; x += 6) g.box(x, x + 1, 2, 3, 0, 5, PAL.dark);
    awning(g, 1, 33, 0, 3, 6, true);
    g.box(0, 34, 2, 18, 10, 11, PAL.roof);
    parapet(g, 0, 34, 2, 18, 11, PAL.dark);
    for (const x of [4, 12, 20, 28]) g.box(x, x + 3, 0, 2, 0, 2, PAL.gold); // crates by the door
    return g;
  } },
};

fs.mkdirSync(dir, { recursive: true });
const catalog = [];
for (const [name, design] of Object.entries(DESIGNS)) {
  const file = path.join(dir, `${name}.vox`);
  if (!catalogOnly) {
    const g = design.build();
    fs.writeFileSync(file, writeVox({ size: [g.w, g.d, g.h], voxels: g.voxels(), palette: design.palette ?? PALETTE }));
  }
  const vox = parseVox(new Uint8Array(fs.readFileSync(file)));
  const unit = 1 / vox.size[0]; // a model is about 1 unit wide, like the Kenney ones
  const m = voxelMesh(vox, unit);
  const r3 = (n) => Math.round(n * 1000) / 1000;
  catalog.push({
    id: `voxel/${name}`,
    kit: 'voxel',
    format: 'vox',
    url: `/models/vox/buildings/${name}.vox`,
    unit,
    classes: design.classes,
    w: r3(vox.size[0] * unit),
    h: r3(vox.size[2] * unit),
    d: r3(vox.size[1] * unit),
    cx: 0,
    cz: 0,
    y0: 0,
    tris: m.indices.length / 3,
    kb: Math.round(fs.statSync(file).size / 1024),
  });
}
fs.writeFileSync(
  path.join(root, 'lib', 'content', 'voxBuildingCatalog.js'),
  `// GENERATED by scripts/models/make-voxel-buildings.mjs from the .vox files in public/models/vox/buildings: do not edit by hand.
// Same shape as modelCatalog.js, plus: format 'vox' and \`unit\` (the size of one voxel, so a building is about 1 unit wide).
export const VOX_BUILDING_CATALOG = ${JSON.stringify(catalog, null, 1)};
`
);
console.log(`${catalog.length} voxel buildings, ${catalog.reduce((n, m) => n + m.tris, 0)} triangles`);
