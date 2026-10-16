// The Kenney models (CC0) the boats, piers and amusement park use: every model the code refers to is in the catalog and on disk, with its texture, at a sensible
// size, and credited. (The fallback box versions are drawn until a model has loaded, so a missing model would not crash, but it would never show.)
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const { PROP_CATALOG } = await imp('content/propCatalog.js');
const bm = await imp('content/boatModels.js');
const { bad, total } = problemTally();

const byId = new Map(PROP_CATALOG.map((m) => [m.id, m]));
const pub = (url) => path.join(root, 'public', url);

// the catalog itself
for (const m of PROP_CATALOG) {
  if (!fs.existsSync(pub(m.url))) bad('a catalogued model is on disk', m.id);
  if (!(m.w > 0 && m.h > 0 && m.d > 0 && m.tris > 0 && m.tris < 3000)) bad('a model has a size and a small triangle count', `${m.id}: ${m.w} x ${m.h} x ${m.d}, ${m.tris}`);
  if (m.textured && !fs.existsSync(path.join(path.dirname(pub(m.url)), 'Textures', 'colormap.png'))) bad('a textured model has its colormap', m.id);
}
const kits = new Set(PROP_CATALOG.map((m) => m.kit));
for (const k of ['nature', 'cars', 'watercraft', 'pirate', 'coaster']) if (!kits.has(k)) bad('the catalog has the kit', k);

// the files the code names
const named = new Set();
for (const f of ['components/city/AmusementPark.jsx', 'components/city/Piers.jsx', 'components/city/Vehicles.jsx', 'lib/content/boatModels.js']) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of src.matchAll(/['"`]((?:watercraft|pirate|coaster)\/[a-z0-9-]+)['"`]/g)) named.add(m[1]);
}
if (named.size < 12) bad('the code uses the Kenney models', String(named.size));
for (const id of named) if (!byId.has(id)) bad('every model the code names is in the catalog', id);
// a model the code places on the ground sits on y = 0 (its lowest point is the origin): a model with its origin elsewhere (the coaster track pieces: origin at the top
// of the track, y0 = -1) would sink into the floor unless the caller lifted it, and none of those is used
for (const id of named) if (byId.has(id) && Math.abs(byId.get(id).y0) > 0.02) bad('a placed model rests on the floor (its y0 is 0)', `${id}: y0 ${byId.get(id).y0}`);
const sunk = PROP_CATALOG.filter((m) => m.y0 < -0.02).map((m) => m.id);
if (!sunk.includes('coaster/coaster-steel-straight') || !sunk.includes('watercraft/buoy')) bad('the catalog records models that sit below the floor (y0 below 0)', sunk.join());

// boats: every kind has a model, a scale that makes it 2 to 3.5 long, a seat inside the hull, and a rod that reaches the bow
for (const kind of [...bm.BOAT_KINDS, 'sailboat']) {
  const m = bm.BOAT_MODELS[kind];
  const e = m && byId.get(m.id);
  if (!e) { bad('every boat kind has a catalogued model', kind); continue; }
  const length = Math.max(e.d, e.w * 0.0) * m.scale;
  if (!(length > 2 && length < 3.5)) bad('a boat is 2 to 3.5 long', `${kind}: ${length.toFixed(2)}`);
  if (Math.abs(m.seat[2]) > length / 2 || Math.abs(m.seat[0]) > (e.w * m.scale) / 2) bad('the seat is inside the hull', kind);
  if (!(m.bow > 0.8 && m.bow < length)) bad('the rod reaches about the bow', `${kind}: ${m.bow}`);
  if (!(m.sink >= 0 && m.sink < 0.4)) bad('the hull sits a little in the water', kind);
}
const seat = bm.seatWorld({ x: 10, z: 20, yaw: Math.PI / 2, boatKind: 'fishing' });
if (Math.abs(seat.x - (10 + bm.BOAT_MODELS.fishing.seat[2])) > 1e-9 || Math.abs(seat.z - 20) > 1e-9) bad('the seat turns with the boat', JSON.stringify(seat));
if (bm.boatModel('nonsense') !== bm.BOAT_MODELS.rowboat) bad('an unknown boat kind is a rowboat', '');

// the entrance fits the gate (7 wide), the stalls and the pier slab are the size the layout assumes
const ent = byId.get('coaster/park-entrance');
if (ent && !(ent.w * 2.5 > 7 && ent.w * 2.5 < 9)) bad('the park entrance at its scale covers the 7 wide opening', String(ent.w * 2.5));
const slab = byId.get('pirate/platform');
if (slab && !(Math.abs(slab.w - 2.5) < 0.05 && Math.abs(slab.d - 2.51) < 0.05 && Math.abs(slab.h - 0.23) < 0.02)) bad('the pier slab is the size the pier assumes (2.5 x 0.23 x 2.51)', JSON.stringify(slab));

// credits
const credits = fs.readFileSync(path.join(root, 'public/models/CREDITS.md'), 'utf8');
for (const k of ['Watercraft Kit', 'Pirate Kit', 'Coaster Kit', 'CC0']) if (!credits.includes(k)) bad('the credits name the kit', k);

console.log(`${PROP_CATALOG.length} models; ${named.size} used by the boats, piers and park`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
