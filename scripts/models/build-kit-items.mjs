// Makes interior-catalogue items out of Kenney kit models (docs/product/kit_items.md): copies the chosen GLBs, each kit's colour map and a 256 px WebP thumbnail (from the kit's own previews) into
// apps/web/public/, measures each model and writes lib/content/kitItems.js, the list the catalogue (lib/content/catalogCuration.js) adds to Pascal's furniture.
//   node scripts/models/build-kit-items.mjs --food <Food Kit folder> --industrial <City Kit (Industrial) folder> [--dry]
// A kit folder is the unzipped download (it holds Models/GLB format, Previews and License.txt). Only the models listed here are copied: never a whole kit. Re-run it to change a size or the list.
//
// `real` is the longest side of the thing in metres in real life: Kenney's food is not drawn to one scale (a burger and a ketchup bottle are both about a unit), so each item is scaled to its real size.
// An item's placement data follows the catalogue's own rule (the car: tests/asset-admission.test.mjs): dimensions = the model's box x scale; offset = (-centre x, -lowest y, -centre z) x scale.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const dry = args.includes('--dry');

// kit: folder under apps/web/public/models/kenney/; group: lib/content/furnitureGroups.js; the lists are [file, real size in m, name (optional), category (optional)]
const KITS = {
  food: {
    folder: 'food', name: 'Food Kit', dir: arg('food'),
    groups: {
      food: [
        ['burger', 0.13], ['burger-cheese-double', 0.14, 'Double cheeseburger'], ['hot-dog', 0.2], ['fries', 0.13, 'Fries'], ['pizza', 0.32], ['pizza-box', 0.36], ['taco', 0.16], ['sub', 0.28, 'Sub sandwich'],
        ['sandwich', 0.14], ['sushi-salmon', 0.07, 'Salmon sushi'], ['maki-salmon', 0.05, 'Salmon maki'], ['dim-sum', 0.09], ['corn-dog', 0.2], ['donut-sprinkles', 0.1, 'Donut with sprinkles'], ['cupcake', 0.07],
        ['cake', 0.26], ['ice-cream-cup', 0.1, 'Ice cream cup'], ['sundae', 0.16], ['waffle', 0.16], ['pancakes', 0.22], ['pie', 0.24], ['salad', 0.24], ['croissant', 0.15], ['popsicle', 0.17],
        ['soda-can', 0.12, 'Soda can'], ['soda', 0.25, 'Soda'], ['cocktail', 0.17], ['frappe', 0.2], ['cup-coffee', 0.1, 'Coffee cup'], ['mug', 0.1], ['glass-wine', 0.18, 'Wine glass'], ['wine-red', 0.32, 'Red wine'],
        ['plate-dinner', 0.27, 'Dinner plate'], ['bowl-soup', 0.18, 'Soup bowl'], ['pan', 0.45, 'Frying pan'], ['pot-stew', 0.35, 'Stew pot'], ['knife-block', 0.25], ['shaker-salt', 0.09, 'Salt shaker'],
        ['shaker-pepper', 0.09, 'Pepper shaker'], ['bottle-ketchup', 0.22, 'Ketchup bottle'],
      ],
      produce: [
        ['banana', 0.2], ['orange', 0.08], ['watermelon', 0.25], ['pineapple', 0.32], ['tomato', 0.08], ['carrot', 0.18], ['pumpkin', 0.3], ['coconut', 0.15], ['lemon', 0.07], ['grapes', 0.15], ['onion', 0.08],
        ['broccoli', 0.15], ['corn', 0.2, 'Corn on the cob'], ['paprika', 0.1, 'Bell pepper'], ['fish', 0.35, 'Fresh fish'], ['loaf-baguette', 0.55, 'Baguette'], ['loaf-round', 0.25, 'Round loaf'], ['bread', 0.25],
      ],
      storage: [['barrel', 0.9], ['carton', 0.35, 'Carton'], ['bag', 0.45, 'Bag']],
    },
  },
  industrial: {
    folder: 'industrial', name: 'City Kit (Industrial)', dir: arg('industrial'),
    groups: {
      storage: [['shipping-container-a', 6.1, 'Shipping container (A)'], ['shipping-container-b', 6.1, 'Shipping container (B)'], ['shipping-container-c', 6.1, 'Shipping container (C)'], ['detail-tank', 2.4, 'Storage tank'], ['detail-tank-large', 3.6, 'Large storage tank'], ['solar-panel-landscape-group', 4.2, 'Solar panels']],
    },
  },
};

const title = (s) => { const t = s.replace(/-/g, ' '); return t[0].toUpperCase() + t.slice(1); };
const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const CATEGORY = { food: 'kitchen', produce: 'kitchen', storage: 'outdoor' };

function bounds(file) {
  const buf = fs.readFileSync(file);
  const json = JSON.parse(buf.slice(20, 20 + buf.readUInt32LE(12)).toString());
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  let tris = 0;
  for (const mesh of json.meshes) for (const p of mesh.primitives) {
    const a = json.accessors[p.attributes.POSITION];
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], a.min[i]); mx[i] = Math.max(mx[i], a.max[i]); }
    tris += json.accessors[p.indices].count / 3;
  }
  return { mn, mx, size: mx.map((v, i) => v - mn[i]), tris };
}

const items = [];
const used = new Set();
for (const [kitId, kit] of Object.entries(KITS)) {
  if (!kit.dir) { console.error(`pass --${kitId} <folder>`); process.exit(1); }
  const models = path.join(kit.dir, 'Models', 'GLB format');
  const outModels = path.join(root, 'apps/web/public/models/kenney', kit.folder);
  const outThumbs = path.join(root, 'apps/web/public/props/thumbnails');
  if (!dry) { fs.mkdirSync(path.join(outModels, 'Textures'), { recursive: true }); fs.mkdirSync(outThumbs, { recursive: true }); fs.copyFileSync(path.join(models, 'Textures', 'colormap.png'), path.join(outModels, 'Textures', 'colormap.png')); }
  for (const [group, list] of Object.entries(kit.groups)) {
    for (const [file, real, label] of list) {
      const src = path.join(models, `${file}.glb`);
      if (!fs.existsSync(src)) throw new Error(`${kitId}: no model ${file}`);
      const id = kitId === 'industrial' ? file : file;
      if (used.has(id)) throw new Error(`duplicate id ${id}`);
      used.add(id);
      const b = bounds(src);
      const scale = round(real / Math.max(...b.size), 4);
      const dims = b.size.map((v) => round(v * scale));
      const offset = [-(b.mn[0] + b.mx[0]) / 2 * scale, -b.mn[1] * scale, -(b.mn[2] + b.mx[2]) / 2 * scale].map((v) => round(v, 4));
      items.push({ id, name: label ?? title(file), kit: kitId, group, category: CATEGORY[group], file: `${kit.folder}/${file}.glb`, dimensions: dims, offset, scale, tris: b.tris });
      if (!dry) {
        fs.copyFileSync(src, path.join(outModels, `${file}.glb`));
        const preview = path.join(kit.dir, 'Previews', `${file}.png`);
        if (!fs.existsSync(preview)) throw new Error(`${kitId}: no preview for ${file}`);
        await sharp(preview).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 82 }).toFile(path.join(outThumbs, `${id}.webp`));
      }
    }
  }
}

const rows = items.map((i) => `  { id: '${i.id}', name: '${i.name.replace(/'/g, "\\'")}', kit: '${i.kit}', group: '${i.group}', category: '${i.category}', file: '${i.file}', dimensions: [${i.dimensions.join(', ')}], offset: [${i.offset.join(', ')}], scale: ${i.scale} },`);
const out = `// Interior catalogue items made from Kenney kit models (CC0): Food Kit and City Kit (Industrial). Written by scripts/models/build-kit-items.mjs; do not edit by hand (docs/product/kit_items.md).
// Each is a model the site serves (apps/web/public/models/kenney/<kit>/) with a thumbnail in apps/web/public/props/thumbnails/; lib/content/catalogCuration.js adds them to Pascal's furniture.
// dimensions and offset are in metres, after the scale (the catalogue's rule: dimensions = the model's box x scale; offset puts the lowest point on the floor and the middle at the origin).
// group: the furniture group they appear under (lib/content/furnitureGroups.js).
export const KIT_ITEMS = [
${rows.join('\n')}
];
`;
console.log(`${items.length} items (${items.filter((i) => i.kit === 'food').length} food kit, ${items.filter((i) => i.kit === 'industrial').length} industrial); most triangles ${Math.max(...items.map((i) => i.tris))}`);
for (const i of items) if (Math.max(...i.dimensions) > 1 && i.kit === 'food' && i.group !== 'storage') console.log('large:', i.id, i.dimensions.join('x'));
if (!dry) fs.writeFileSync(path.join(root, 'lib/content/kitItems.js'), out);
