import { PROP_CATALOG } from './propCatalog';

// Which Kenney tree or car model stands where, and how it is scaled. Pure (no three.js), so it is tested in Node.
const hash = (a, b = 0) => (Math.imul(Math.floor(a * 1000) * 2654435761 + Math.floor(b * 1000) * 40503 + 1013904223, 2246822519) >>> 0) / 4294967296;
const ofClass = (cls, catalog) => catalog.filter((m) => m.cls === cls);

export const CAR_LENGTH = 0.8; // the box car this replaces was 0.8 long
export const TRUCK_LENGTH = 1.05;

// A tree { x, z, size, trunk } is as tall as its box version (trunk + crown). Returns { id, scale, rotY, offset: [x, y, z], height }.
// Park trees are the leafy ones you would find in a park (oak, plain, round); the woods also take the pines.
const PARK_TREE = /tree_(default|oak|simple|fat|small)$/;
export function treeModelFor(tree, catalog = PROP_CATALOG, { park = false } = {}) {
  const pool = ofClass('tree', catalog).filter((m) => !park || PARK_TREE.test(m.id));
  if (!pool.length) return null;
  const m = pool[Math.floor(hash(tree.x, tree.z) * pool.length)];
  const height = Math.max(0.3, (tree.trunk ?? 0.3) + (tree.size ?? 0.4));
  const s = Math.min(1.6, Math.max(0.25, height / m.h));
  return { id: m.id, scale: s, rotY: hash(tree.z, tree.x) * Math.PI * 2, offset: [-m.cx * s, -m.y0 * s, -m.cz * s], height: m.h * s };
}

export function bushModelFor(bush, catalog = PROP_CATALOG) {
  const pool = ofClass('bush', catalog);
  if (!pool.length) return null;
  const m = pool[Math.floor(hash(bush.x, bush.z) * pool.length)];
  const s = Math.max(0.3, (bush.w ?? 0.4) / m.w);
  return { id: m.id, scale: s, rotY: hash(bush.z, bush.x) * Math.PI * 2, offset: [-m.cx * s, -m.y0 * s, -m.cz * s], height: m.h * s };
}

// A car { id } on the road: the same car always gets the same model. Trucks are one car in eight.
export function carModelFor(car, catalog = PROP_CATALOG) {
  const truck = hash(car.id ?? 0, 7) < 0.125;
  const pool = ofClass(truck ? 'truck' : 'car', catalog);
  if (!pool.length) return null;
  const m = pool[Math.floor(hash(car.id ?? 0, 3) * pool.length)];
  const s = (truck ? TRUCK_LENGTH : CAR_LENGTH) / m.d;
  // the model's floor (the bottom of its wheels) on the road, its middle on the car's position
  return { id: m.id, scale: s, offset: [-m.cx * s, -m.y0 * s, -m.cz * s], height: m.h * s };
}
