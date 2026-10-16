// Writes the farm animals and wildlife (MagicaVoxel .vox files, original to this project) to public/models/vox/animals/ and the catalogue that tells the game
// how big each is (lib/content/animalCatalog.js, GENERATED). Every animal faces +x (to the right in MagicaVoxel's front view), its feet at z = 0.
// Replace a file with your own .vox of the same name to change an animal, then run this script with --catalog-only to refresh the sizes.
//   node scripts/models/make-voxel-animals.mjs [--catalog-only]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVox, writeVox } from '../../lib/content/vox.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.join(root, 'public', 'models', 'vox', 'animals');
const catalogOnly = process.argv.includes('--catalog-only');

// palette roles (1-based): body, patch, head, legs, belly, dark, pink, horn
const C = { body: 1, patch: 2, head: 3, legs: 4, belly: 5, dark: 6, pink: 7, horn: 8 };
const hash = (x, y, z) => (Math.imul(x * 73856093 ^ y * 19349663 ^ z * 83492791, 2246822519) >>> 0) / 4294967296;

class Grid {
  constructor() {
    this.c = new Map();
  }
  set(x, y, z, color) {
    if (z < 0) return;
    this.c.set(`${x},${y},${z}`, color);
  }
  box(x0, x1, y0, y1, z0, z1, color) {
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) this.set(x, y, z, color);
  }
  // the voxels shifted so the model starts at 0 on every axis, with its size
  done() {
    const list = [...this.c.entries()].map(([k, v]) => [...k.split(',').map(Number), v]);
    const min = [0, 1, 2].map((i) => Math.min(...list.map((v) => v[i])));
    const shifted = list.map(([x, y, z, c]) => [x - min[0], y - min[1], z - min[2], c]);
    const size = [0, 1, 2].map((i) => Math.max(...shifted.map((v) => v[i])) + 1);
    return { size, voxels: shifted };
  }
}

// A four-legged animal: a body on legs with a head at the front (+x). All sizes are in voxels.
function quadruped(o) {
  const g = new Grid();
  const { L, W, legH, bodyH, legW = 2 } = o;
  const y0 = 0;
  // legs under the corners of the body
  const legX = [[0, legW], [L - legW, L]];
  const legY = [[y0, y0 + legW], [y0 + W - legW, y0 + W]];
  for (const [a, b] of legX) for (const [c, d] of legY) g.box(a, b, c, d, 0, legH, C.legs);
  for (const [a, b] of legX) for (const [c, d] of legY) g.box(a, b, c, d, 0, 1, C.dark); // hooves
  // body, with patches or a pale belly
  for (let x = 0; x < L; x++) for (let y = y0; y < y0 + W; y++) for (let z = legH; z < legH + bodyH; z++) {
    let c = C.body;
    if (o.patches && hash(x >> 2, y >> 1, z >> 1) < o.patches) c = C.patch;
    if (o.belly && z === legH) c = C.belly;
    g.set(x, y, z, c);
  }
  // neck and head
  const hz = legH + bodyH + (o.headUp ?? 0) - o.headH + 1;
  const hw = o.headW ?? Math.max(2, W - 3);
  const hy = y0 + Math.floor((W - hw) / 2);
  if (o.neck) for (let i = 0; i < o.neck; i++) g.box(L - 1 + i, L + i, hy, hy + hw, legH + bodyH - 1 + i, legH + bodyH + 1 + i, C.body); // a rising neck (horse, deer)
  const hx = L - 1 + (o.neck ?? 0);
  const hbase = o.neck ? legH + bodyH - 1 + o.neck : hz;
  g.box(hx, hx + o.headL, hy, hy + hw, hbase, hbase + o.headH, C.head);
  if (o.snout) g.box(hx + o.headL, hx + o.headL + 1, hy + 1, hy + hw - 1, hbase, hbase + Math.max(1, o.headH - 1), C.pink);
  // an eye on each side
  g.set(hx + o.headL - 2, hy - 1 < 0 ? hy : hy, hbase + o.headH - 1, C.dark);
  g.set(hx + o.headL - 2, hy + hw - 1, hbase + o.headH - 1, C.dark);
  // ears
  if (o.ears) for (const yy of [hy, hy + hw - 1]) g.box(hx, hx + 1, yy, yy + 1, hbase + o.headH, hbase + o.headH + o.ears, o.earColor ?? C.head);
  // horns or antlers
  if (o.horns) for (const yy of [hy, hy + hw - 1]) {
    g.box(hx + 1, hx + 2, yy, yy + 1, hbase + o.headH, hbase + o.headH + o.horns, C.horn);
    if (o.antlers) g.box(hx + 1, hx + 3, yy, yy + 1, hbase + o.headH + o.horns - 1, hbase + o.headH + o.horns, C.horn);
  }
  // tail
  if (o.tail) g.box(-o.tail, 0, y0 + Math.floor(W / 2) - 1, y0 + Math.floor(W / 2) + 1, legH + bodyH - o.tailH, legH + bodyH - o.tailH + o.tailH, o.tailColor ?? C.body);
  if (o.tailTip) g.box(-o.tail, -o.tail + 1, y0 + Math.floor(W / 2) - 1, y0 + Math.floor(W / 2) + 1, legH + bodyH - o.tailH, legH + bodyH, C.belly);
  // an udder, a mane
  if (o.udder) g.box(Math.floor(L / 2), Math.floor(L / 2) + 2, y0 + Math.floor(W / 2) - 1, y0 + Math.floor(W / 2) + 1, legH - 1, legH, C.pink);
  if (o.mane) for (let i = 0; i < o.neck + 2; i++) g.box(L - 2 + i, L - 1 + i, y0 + Math.floor(W / 2) - 1, y0 + Math.floor(W / 2) + 1, legH + bodyH + i, legH + bodyH + i + 1, C.dark);
  return g;
}

function duck() {
  const g = new Grid();
  g.box(0, 7, 0, 4, 1, 4, C.body); // body
  g.box(0, 3, 0, 4, 1, 3, C.belly);
  g.box(6, 9, 1, 3, 3, 6, C.head); // a green head
  g.box(9, 10, 1, 3, 3, 4, C.pink); // the bill
  g.set(8, 1, 5, C.dark);
  g.set(8, 2, 5, C.dark);
  g.box(-1, 0, 1, 3, 3, 4, C.patch); // the tail
  g.box(2, 5, 0, 4, 4, 5, C.patch); // a wing on top
  return g;
}

function bird() {
  const g = new Grid();
  g.box(0, 4, 2, 4, 0, 2, C.body); // body
  g.box(4, 6, 2, 4, 1, 3, C.head);
  g.set(6, 3, 1, C.pink); // the beak
  g.box(1, 3, 0, 6, 1, 2, C.patch); // the wings, spread (the game flaps them by squashing the width)
  g.box(-2, 0, 2, 4, 0, 1, C.dark);
  return g;
}

const mk = (palette, build, size, extra = {}) => ({ palette, build, ...extra });
const DESIGNS = {
  cow: mk([[245, 245, 240], [34, 34, 38], [245, 245, 240], [225, 225, 220], [255, 255, 255], [30, 30, 34], [244, 164, 164], [236, 232, 200]], () => quadruped({ L: 14, W: 7, legH: 5, bodyH: 6, headL: 4, headH: 4, headW: 5, headUp: 1, patches: 0.4, snout: true, ears: 1, earColor: 2, horns: 2, tail: 2, tailH: 5, tailColor: 2, udder: true }), null, { kind: 'cow', length: 0.95 }),
  sheep: mk([[238, 234, 224], [238, 234, 224], [60, 52, 48], [60, 52, 48], [238, 234, 224], [30, 28, 28], [200, 150, 140], [200, 190, 160]], () => quadruped({ L: 10, W: 7, legH: 4, bodyH: 6, headL: 3, headH: 3, headW: 3, headUp: 0, ears: 1, earColor: 3, tail: 1, tailH: 2 }), null, { kind: 'sheep', length: 0.62 }),
  horse: mk([[140, 90, 55], [120, 74, 44], [140, 90, 55], [120, 74, 44], [160, 110, 70], [40, 28, 24], [244, 164, 164], [230, 230, 220]], () => quadruped({ L: 14, W: 5, legH: 9, bodyH: 6, headL: 5, headH: 3, headW: 3, neck: 4, ears: 1, tail: 3, tailH: 5, tailColor: 6, mane: true }), null, { kind: 'horse', length: 1.1 }),
  pig: mk([[244, 168, 176], [226, 140, 150], [244, 168, 176], [226, 140, 150], [250, 200, 205], [60, 40, 44], [236, 120, 140], [244, 168, 176]], () => quadruped({ L: 10, W: 6, legH: 3, bodyH: 5, headL: 3, headH: 4, headW: 4, headUp: 0, snout: true, ears: 1, tail: 1, tailH: 1 }), null, { kind: 'pig', length: 0.6 }),
  goat: mk([[232, 228, 214], [200, 196, 182], [232, 228, 214], [120, 112, 100], [250, 248, 240], [40, 36, 34], [214, 170, 160], [90, 80, 64]], () => quadruped({ L: 9, W: 4, legH: 6, bodyH: 4, headL: 3, headH: 3, headW: 3, headUp: 1, ears: 1, horns: 3, tail: 1, tailH: 2 }), null, { kind: 'goat', length: 0.5 }),
  deer: mk([[160, 108, 66], [200, 160, 110], [160, 108, 66], [120, 80, 50], [236, 220, 190], [40, 30, 26], [90, 60, 50], [214, 196, 160]], () => quadruped({ L: 11, W: 4, legH: 9, bodyH: 5, headL: 4, headH: 3, headW: 3, neck: 3, ears: 2, earColor: 1, horns: 4, antlers: true, tail: 2, tailH: 2, tailTip: false, belly: true }), null, { kind: 'deer', length: 0.85 }),
  fox: mk([[222, 118, 40], [200, 100, 30], [222, 118, 40], [60, 40, 32], [250, 244, 232], [30, 24, 22], [60, 40, 32], [250, 244, 232]], () => quadruped({ L: 8, W: 4, legH: 4, bodyH: 4, headL: 4, headH: 3, headW: 3, headUp: 0, snout: true, ears: 2, tail: 6, tailH: 4, tailTip: true, belly: true }), null, { kind: 'fox', length: 0.55 }),
  rabbit: mk([[190, 170, 150], [150, 130, 110], [190, 170, 150], [150, 130, 110], [250, 246, 240], [40, 34, 32], [230, 160, 160], [190, 170, 150]], () => quadruped({ L: 5, W: 3, legH: 2, bodyH: 3, headL: 2, headH: 2, headW: 2, headUp: 0, ears: 4, tail: 1, tailH: 1, tailColor: 5 }), null, { kind: 'rabbit', length: 0.26 }),
  duck: mk([[200, 170, 120], [130, 100, 70], [40, 130, 80], [250, 190, 60], [250, 246, 236], [30, 28, 26], [250, 190, 60], [200, 170, 120]], duck, null, { kind: 'duck', length: 0.3 }),
  bird: mk([[60, 60, 70], [90, 90, 104], [60, 60, 70], [60, 60, 70], [60, 60, 70], [30, 30, 36], [250, 190, 60], [60, 60, 70]], bird, null, { kind: 'bird', length: 0.26 }),
};

fs.mkdirSync(dir, { recursive: true });
const catalog = [];
for (const [name, d] of Object.entries(DESIGNS)) {
  const file = path.join(dir, `${name}.vox`);
  if (!catalogOnly) {
    const { size, voxels } = d.build().done();
    // the x axis is the way the animal faces; MagicaVoxel's y is its width, z its height
    fs.writeFileSync(file, writeVox({ size, voxels, palette: d.palette }));
  }
  const vox = parseVox(new Uint8Array(fs.readFileSync(file)));
  const unit = d.length / vox.size[0]; // world units per voxel, so the animal is `length` long
  const r = (n) => Math.round(n * 1000) / 1000;
  catalog.push({ id: name, url: `/models/vox/animals/${name}.vox`, unit: r(unit * 10000) / 10000, length: d.length, width: r(vox.size[1] * unit), height: r(vox.size[2] * unit), voxels: vox.voxels.length });
}
fs.writeFileSync(
  path.join(root, 'lib', 'content', 'animalCatalog.js'),
  `// GENERATED by scripts/models/make-voxel-animals.mjs from the .vox files in public/models/vox/animals: do not edit by hand.
// \`unit\` is the size of one voxel in game units; length, width and height are in game units (a cow is about as long as a car).
export const ANIMAL_CATALOG = ${JSON.stringify(catalog, null, 1)};
`
);
console.log(`${catalog.length} animals: ${catalog.map((c) => `${c.id} ${c.length}x${c.width}x${c.height}`).join(', ')}`);
