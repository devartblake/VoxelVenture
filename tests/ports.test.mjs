// The ports and harbours (lib/world/ports.js, lib/world/bake.js, docs/world/river_plan.md): a shipping port on each large landmass, a boat harbour and a cruise port, standing on the coast clear of the rivers and the
// ring road, with decks a car can drive on and boxes in the chunks.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const P = await imp('world/ports.js');
const { WORLD_RECIPE, validateRecipe } = await imp('world/worldRecipe.js');
const { buildWorld } = await imp('world/buildWorld.js');
const { riverField, highwaySegments } = await imp('world/rivers.js');
const { nearestOnCoast, inside } = await imp('world/riverPlan.js');
const { chunkMeshes } = await imp('world/chunkMesh.js');
const { loadBakedWorld } = await imp('world/bakedWorld.js');
const { createTerrain } = await imp('world/terrain.js');
const { bad, total } = problemTally();

// ---- the recipe
const ids = ['kingston-harbour', 'port-royal', 'montego-bay', 'george-town'];
if (JSON.stringify(WORLD_RECIPE.ports) !== JSON.stringify(ids)) bad('the recipe turns on the four ports', JSON.stringify(WORLD_RECIPE.ports));
if (!validateRecipe({ ...WORLD_RECIPE, ports: ['kingston-harbour', 'no-such-port'] }).some((p) => /no-such-port/.test(p))) bad('a recipe that turns on a port the plan does not have is invalid', '');
const world = buildWorld();
if (world.ports.length !== 4) bad('the built world has the four ports', String(world.ports.length));
const roles = Object.fromEntries(world.ports.map((p) => [p.id, p.role]));
if (roles['kingston-harbour'] !== 'shipping' || roles['port-royal'] !== 'boats' || roles['montego-bay'] !== 'cruise' || roles['george-town'] !== 'shipping-cruise') bad('each port has its role: shipping, boats, cruise, shipping and cruise', JSON.stringify(roles));
const lm = (id) => world.landmasses.find((l) => l.id === id).outline.points;
const shipping = world.ports.filter((p) => /shipping/.test(p.role));
if (new Set(shipping.map((p) => p.landmass)).size !== 2) bad('there is a shipping port on both large landmasses (the mainland and Harbor Isle)', JSON.stringify(shipping.map((p) => `${p.id} ${p.landmass}`)));

// ---- where they stand: on the coast, facing the sea, apart from one another
for (const p of world.ports) {
  const coast = lm(p.landmass);
  if (nearestOnCoast(coast, p.at.x, p.at.z).d > 1) bad('a port stands on the coast', p.id);
  const out = { x: p.at.x + p.n.x * 6, z: p.at.z + p.n.z * 6 }, inland = { x: p.at.x - p.n.x * 6, z: p.at.z - p.n.z * 6 };
  if (inside(coast, out.x, out.z) || !inside(coast, inland.x, inland.z)) bad('a port faces the sea: the sea is out along its normal and the land behind it', p.id);
  if (!(Math.abs(Math.hypot(p.n.x, p.n.z) - 1) < 0.01 && Math.abs(p.n.x * p.t.x + p.n.z * p.t.z) < 0.2)) bad('its normal and tangent are unit vectors at right angles', p.id);
}
for (let i = 0; i < world.ports.length; i++) for (let j = i + 1; j < world.ports.length; j++) {
  const a = world.ports[i], b = world.ports[j];
  if (a.landmass === b.landmass && Math.hypot(a.at.x - b.at.x, a.at.z - b.at.z) < 50) bad('two ports on a coast are at least 50 units apart', `${a.id} ${b.id}`);
}

// ---- what stands there: boxes, clear of the rivers and of the roads
const field = riverField(world.rivers);
const roads = highwaySegments(world);
for (const p of world.ports) {
  if (p.boxes.length < 10 || p.decks.length < 1) bad('a port has its structures and a deck', `${p.id} ${p.boxes.length} ${p.decks.length}`);
  for (const b of p.boxes) {
    if (!b.every(Number.isFinite) || (b.length !== 10 && b.length !== 11) || b.slice(3, 6).some((h) => !(h > 0))) { bad('every box is [centre, half sizes, yaw, colour, replaced] and finite', p.id); break; }
    if (Math.hypot(b[0] - p.at.x, b[2] - p.at.z) > 90) { bad('a port stands within 90 units of its point', p.id); break; }
    if (field.sdAt(b[0], b[2]) < 1) { bad('no box stands in a river channel', `${p.id} at ${b[0]},${b[2]}`); break; }
  }
  let nearest = Infinity;
  for (const b of p.boxes) nearest = Math.min(nearest, P.roadClearance(b, roads));
  if (!(nearest > -0.25)) bad('a port keeps off the ring road and the spurs (its boxes clear of a road edge)', `${p.id} ${nearest.toFixed(1)}`);
}
const k = world.ports.find((p) => p.id === 'kingston-harbour');
const container = (b) => b[3] === P.PORT.container.len / 2 && b[4] === P.PORT.container.high / 2;
if (k.boxes.filter(container).length < 60 || k.boxes.filter((b) => b[7] === P.PORT.colors.crane[0] && b[8] === P.PORT.colors.crane[1]).length < 10) bad('the shipping port has a container yard (60 or more containers) and gantry cranes', String(k.boxes.filter(container).length));
const royal = world.ports.find((p) => p.id === 'port-royal');
if (royal.decks.length < 4 || royal.boxes.filter(container).length) bad('the boat harbour has docks and no container yard', '');

// ---- the Kenney models (docs/world/ports_models.md): replace the front containers and the tanks, decorate the moorings; a phone draws the boxes alone
const TRIS = { 'ctr-a': 402, 'ctr-b': 402, 'ctr-c': 402, tank: 566, 'boat-row': 168, 'boat-row-l': 174, 'boat-fish': 237, 'boat-sail': 386, 'boat-speed': 156, 'boat-tug': 576, buoy: 118, ramp: 128, barrel: 148, crate: 76, palm: 186 };
const onSea = (id, x, z) => !inside(lm(world.ports.find((q) => q.id === id).landmass), x, z);
for (const p of world.ports) {
  if (!p.props?.length) { bad('every port has models', p.id); continue; }
  let tris = 0;
  for (const m of p.props) {
    if (!P.PORT_MODELS[m.m] || !Number.isFinite(m.x + m.y + m.z + m.yaw + m.s) || m.d !== 1 || !(m.s > 0.3 && m.s < 6)) { bad('a model is one of the kit models with a place, a height, a turn, a size and the detail flag', `${p.id} ${JSON.stringify(m)}`); break; }
    tris += TRIS[m.m];
    if (/^boat|^buoy/.test(m.m) && !onSea(p.id, m.x, m.z)) bad('a boat or a buoy is on the water, not on the land', `${p.id} ${m.m} at ${m.x},${m.z}`);
    if (/^boat|^buoy/.test(m.m) && field.sdAt(m.x, m.z) < 1) bad('and not in a river channel (a river is not a mooring)', `${p.id} ${m.m}`);
  }
  if (tris > 20000) bad('the models of a port are under 20,000 triangles (a desktop; a phone draws none of them)', `${p.id} ${tris}`);
  const replaced = p.boxes.filter((b) => b[10] === 1).length, models = p.props.filter((m) => /^ctr|^tank$/.test(m.m)).length;
  if (replaced !== models) bad('every box the models replace is tagged, and every replacing model has its box (what a phone draws)', `${p.id} ${replaced} ${models}`);
}
if (!world.ports.find((p) => p.id === 'kingston-harbour').props.some((m) => m.m === 'boat-tug') || world.ports.find((p) => p.id === 'port-royal').props.filter((m) => /^boat/.test(m.m)).length < 6) bad('the shipping port has tugs and the boat harbour has its boats', '');
const kk = world.ports.find((p) => p.id === 'kingston-harbour');
if (kk.props.filter((m) => /^ctr/.test(m.m)).length < 12 || kk.props.filter((m) => m.m === 'tank').length < 1) bad('Kingston has a front row of Kenney containers and a tank farm', String(kk.props.filter((m) => /^ctr/.test(m.m)).length));

// ---- baked: the decks are jetty pieces, the boxes are structures, the manifest lists the ports
const dir = path.join(root, 'apps/web/public/world');
const baked = await loadBakedWorld(async (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
const loaded = new Map();
for (const c of baked.manifest.chunks) loaded.set(c.key, await baked.chunk(c.cx, c.cz));
if (baked.manifest.ports?.length !== 4 || baked.manifest.ports.some((p) => !p.boxes || !p.decks || !p.props)) bad('the manifest lists the four ports', JSON.stringify(baked.manifest.ports?.map((p) => p.id)));
let jetties = 0, structures = 0;
for (const c of loaded.values()) { jetties += c.highways.filter((h) => h.kind === 'jetty').length; structures += c.structures?.length ?? 0; }
const wantBoxes = world.ports.reduce((s, p) => s + p.boxes.length, 0);
if (structures !== wantBoxes) bad('every box is in exactly one chunk', `${structures} ${wantBoxes}`);
if (jetties < world.ports.reduce((s, p) => s + p.decks.length, 0)) bad('every deck is baked (a deck across a chunk edge is more than one piece)', String(jetties));
let meshed = 0;
for (const c of loaded.values()) if (c.structures?.length) { const m = chunkMeshes(c).bridges; meshed++; if (m.triangles < c.structures.length * 12 || !m.normals || !m.colors) bad('a chunk with structures has their boxes as a mesh (12 triangles a box) with normals and colours', `${c.cx}_${c.cz}`); }
if (!meshed) bad('some chunk has structures', '');

// ---- the terrain: a car drives on a quay deck, a boat sails the water beside it
const have = new Set(baked.manifest.chunks.map((c) => c.key));
const terrain = createTerrain({ chunkAt: (cx, cz) => loaded.get(`${cx}_${cz}`), has: (cx, cz) => have.has(`${cx}_${cz}`) });
const quayPoint = { x: k.at.x - k.n.x * 4 + k.t.x * 5, z: k.at.z - k.n.z * 4 + k.t.z * 5 };
const q = terrain.sample(quayPoint.x, quayPoint.z);
if (q.surface !== 'bridge' || !(q.y > 0.3 && q.y < 0.7) || !terrain.canStand(quayPoint.x, quayPoint.z, 'car') || !terrain.canStand(quayPoint.x, quayPoint.z, 'walk')) bad('the quay is a deck a car and a person can be on, half a unit over the ground', JSON.stringify([q.surface, q.y]));
const sea = { x: k.at.x + k.n.x * 40, z: k.at.z + k.n.z * 40 };
if (!terrain.canStand(sea.x, sea.z, 'boat')) bad('a boat can sail the water beside the quay', JSON.stringify(sea));
console.log(`ports: ${world.ports.map((p) => `${p.id} (${p.boxes.length} boxes, ${p.decks.length} decks)`).join(', ')}; ${structures} boxes in ${meshed} chunks, ${jetties} deck pieces`);
total();
