// Imports Kenney's Nature Kit (trees, bushes) and Car Kit (cars) into apps/web/public/models/kenney/ and writes lib/content/propCatalog.js.
//   node scripts/models/import-props.mjs <folder containing nature-kit/ and car-kit/ as unzipped from kenney.nl>
//   node scripts/models/import-props.mjs <folder> --only watercraft,pirate,coaster    add or refresh just these kits (the others in the catalog are kept)
// Kits: nature-kit, car-kit, watercraft (Watercraft Kit), pirate (Pirate Kit), coaster (Coaster Kit).
// (CC0, https://kenney.nl.) Files are only copied and their headers read.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matrix4, Quaternion, Vector3 } from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = process.argv[2];
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;
if (!source) {
  console.error('Usage: node scripts/models/import-props.mjs <folder with nature-kit and car-kit>');
  process.exit(1);
}
const KITS = {
  nature: { folder: 'nature-kit', dir: 'GLTF format', textured: false, models: { tree: ['tree_default', 'tree_oak', 'tree_simple', 'tree_fat', 'tree_pineTallA', 'tree_pineRoundA', 'tree_small'], bush: ['plant_bush', 'plant_bushLarge', 'plant_bushSmall'] } },
  watercraft: { folder: 'watercraft', dir: 'GLB format', textured: true, models: { boat: ['boat-row-small', 'boat-row-large', 'boat-fishing-small', 'boat-sail-a', 'boat-sail-b', 'boat-speed-a', 'boat-speed-b', 'boat-speed-d', 'boat-tow-a'], buoy: ['buoy', 'buoy-flag'], dock: ['ramp', 'ramp-wide'] } },
  pirate: { folder: 'pirate', dir: 'GLB format', textured: true, models: { dock: ['structure-platform-dock', 'structure-platform-dock-small', 'structure-platform', 'structure-platform-small', 'platform', 'platform-planks'], deco: ['barrel', 'crate'] } },
  coaster: {
    folder: 'coaster',
    dir: 'GLB format',
    textured: true,
    models: {
      ride: ['park-entrance', 'ride-entrance', 'ride-exit', 'station', 'station-gate', 'station-fence', 'coaster-train', 'coaster-train-front', 'coaster-train-safety', 'coaster-train-wooden', 'coaster-steel-straight', 'coaster-steel-curve', 'coaster-steel-corner-large', 'coaster-steel-straight-hill-complete', 'coaster-wood-straight', 'coaster-wood-curve', 'support-small', 'support-large'],
      stall: ['stall-food', 'stall-drinks', 'stall-information', 'stall-toilets'],
      parkprop: ['bench', 'trash', 'flowers', 'path-straight', 'path-corner', 'path-crossing', 'queue-straight', 'queue-corner', 'queue-entrance'],
      tree: ['tree', 'tree-large'],
    },
  },
  cars: { folder: 'car-kit', dir: 'GLB format', textured: true, models: { car: ['sedan', 'hatchback-sports', 'suv', 'taxi', 'van', 'sedan-sports'], truck: ['truck', 'delivery'] } },
};
const round = (n) => Math.round(n * 1000) / 1000;
function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} is not a .glb`);
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let tris = 0;
  // the size is the model's as it is drawn: each node's own transform is applied (some kits, such as the coaster track, are modelled with their origin at the top
  // of the track, so the model sits below y = 0: its `y0` says by how much)
  const visit = (index, parent) => {
    const node = json.nodes[index];
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(new Vector3(...(node.translation ?? [0, 0, 0])), new Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new Vector3(...(node.scale ?? [1, 1, 1])));
    const world = parent.clone().multiply(local);
    if (node.mesh != null) {
      for (const p of json.meshes[node.mesh].primitives) {
        const a = json.accessors[p.attributes.POSITION];
        for (const x of [a.min[0], a.max[0]]) for (const y of [a.min[1], a.max[1]]) for (const z of [a.min[2], a.max[2]]) {
          const v = new Vector3(x, y, z).applyMatrix4(world);
          for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], v.getComponent(i)); max[i] = Math.max(max[i], v.getComponent(i)); }
        }
        if (p.indices != null) tris += json.accessors[p.indices].count / 3;
      }
    }
    for (const c of node.children ?? []) visit(c, world);
  };
  for (const n of json.scenes[json.scene ?? 0].nodes) visit(n, new Matrix4());
  return { min, max, tris, bytes: b.length, images: (json.images ?? []).map((i) => i.uri) };
}
// With --only, the kits not named keep the entries they have in the catalog now.
let catalog = [];
if (only) {
  const old = fs.readFileSync(path.join(root, 'lib', 'content', 'propCatalog.js'), 'utf8');
  const start = old.indexOf('= [') + 2;
  catalog = JSON.parse(old.slice(start, old.lastIndexOf(']') + 1)).filter((m) => !only.includes(m.kit));
}
for (const [kit, spec] of Object.entries(KITS)) {
  if (only && !only.includes(kit)) continue;
  const from = path.join(source, spec.folder, 'Models', spec.dir);
  if (!fs.existsSync(from)) throw new Error(`Missing ${from}`);
  const to = path.join(root, 'apps', 'web', 'public', 'models', 'kenney', kit);
  fs.mkdirSync(spec.textured ? path.join(to, 'Textures') : to, { recursive: true });
  if (spec.textured) fs.copyFileSync(path.join(from, 'Textures', 'colormap.png'), path.join(to, 'Textures', 'colormap.png'));
  for (const [cls, names] of Object.entries(spec.models)) for (const name of names) {
    const info = readGlb(path.join(from, `${name}.glb`));
    if (info.images.some((u) => u !== 'Textures/colormap.png')) throw new Error(`${name} uses an unexpected texture`);
    fs.copyFileSync(path.join(from, `${name}.glb`), path.join(to, `${name}.glb`));
    catalog.push({ id: `${kit}/${name}`, kit, cls, url: `/models/kenney/${kit}/${name}.glb`, textured: spec.textured, w: round(info.max[0] - info.min[0]), h: round(info.max[1] - info.min[1]), d: round(info.max[2] - info.min[2]), cx: round((info.max[0] + info.min[0]) / 2), cz: round((info.max[2] + info.min[2]) / 2), y0: round(info.min[1]), tris: info.tris, kb: Math.round(info.bytes / 1024) });
  }
}
fs.writeFileSync(
  path.join(root, 'lib', 'content', 'propCatalog.js'),
  `// GENERATED by scripts/models/import-props.mjs from the .glb files in apps/web/public/models/kenney: do not edit by hand.
// cls: tree | bush | car | truck | boat | buoy | dock | deco | ride | stall | parkprop. textured: the model uses its kit's colormap.png; the nature kit's carry plain material colours.
export const PROP_CATALOG = ${JSON.stringify(catalog, null, 1)};
`
);
const credits = path.join(root, 'apps', 'web', 'public', 'models', 'CREDITS.md');
let c = fs.readFileSync(credits, 'utf8');
if (!c.includes('Watercraft Kit')) {
  c = c.replace('\nVoxel landmarks', '\nThe boats and buoys in `kenney/watercraft/` are from the **Kenney Watercraft Kit**, the docks and platforms in `kenney/pirate/` from the **Kenney Pirate Kit**, and the amusement-park pieces in `kenney/coaster/` (entrance, stalls, coaster train, supports, paths, benches) from the **Kenney Coaster Kit**, all CC0.\n\nVoxel landmarks');
  fs.writeFileSync(credits, c);
}
if (!c.includes('Nature Kit')) {
  c = c.replace('\nVoxel landmarks', '\nThe trees and bushes in `kenney/nature/` are from the **Kenney Nature Kit**, and the cars in `kenney/cars/` from the **Kenney Car Kit**, also CC0.\n\nVoxel landmarks');
  fs.writeFileSync(credits, c);
}
console.log(`${catalog.length} models, ${catalog.reduce((n, m) => n + m.kb, 0)} KB, ${catalog.reduce((n, m) => n + m.tris, 0)} triangles`);
