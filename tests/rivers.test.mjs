// The Rio Minho in the baked world (lib/world/rivers.js, lib/world/bake.js, docs/world/river_plan.md): the recipe turns it on, the bake cuts it into the ground as a second coast, and the terrain, the boats and the roads read it.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const { WORLD_RECIPE, validateRecipe } = await imp('world/worldRecipe.js');
const { buildWorld } = await imp('world/buildWorld.js');
const { riverField, highwaySegments, RIVER_SD } = await imp('world/rivers.js');
const { widthAt, nearestOnCoast, inside } = await imp('world/riverPlan.js');
const { loadBakedWorld } = await imp('world/bakedWorld.js');
const { createTerrain, LIMITS } = await imp('world/terrain.js');
const { SEA_LEVEL } = await imp('world/datum.js');
const { bad, total } = problemTally();
const dir = path.join(root, 'apps/web/public/world');
const baked = await loadBakedWorld(async (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
const loaded = new Map();
for (const c of baked.manifest.chunks) loaded.set(c.key, await baked.chunk(c.cx, c.cz));
const have = new Set(baked.manifest.chunks.map((c) => c.key));
const terrain = createTerrain({ chunkAt: (cx, cz) => loaded.get(`${cx}_${cz}`), has: (cx, cz) => have.has(`${cx}_${cz}`) });

// ---- the recipe turns it on, and only it
if (JSON.stringify(WORLD_RECIPE.rivers) !== '["rio-minho"]') bad('the recipe turns on the Rio Minho (the proof) and no other river yet', JSON.stringify(WORLD_RECIPE.rivers));
if (!validateRecipe({ ...WORLD_RECIPE, rivers: ['rio-minho', 'no-such-river'] }).some((p) => /no-such-river/.test(p))) bad('a recipe that turns on a river the plan does not have is invalid', '');
const world = buildWorld();
if (world.rivers.length !== 1 || world.rivers[0].id !== 'rio-minho') bad('the built world has the Rio Minho', JSON.stringify(world.rivers.map((r) => r.id)));
const river = world.rivers[0];
const town = baked.manifest.towns[0].land;
const mr = baked.manifest.rivers?.[0];
if (!mr || mr.id !== 'rio-minho' || mr.course.length !== river.course.length || mr.crosses.length < 1) bad('the manifest carries the river (course, width, crossings)', JSON.stringify(mr && Object.keys(mr)));

// ---- the field: negative in the channel, positive beside it, nothing in the town
const field = riverField(world.rivers);
const half = (i) => widthAt(river, i / (river.course.length - 1)) / 2;
const south = river.course.findIndex((p) => p.z > town.z1 + 30), north = river.course.findIndex((p) => p.z > town.z0 - 80);
for (const i of [north, south, river.course.length - 6]) {
  const p = river.course[i];
  if (!(field.sdAt(p.x, p.z) < -half(i) * 0.8)) bad('a point on the course is in the channel (the distance is negative, about the half width)', `${i} ${field.sdAt(p.x, p.z)}`);
  if (!(field.sdAt(p.x + half(i) + 12, p.z) > 5)) bad('a point beside the river is on the bank, well out of the channel', String(i));
}
// through the first town too: the baked channel is the town river, at the width of the town trench
const inTown = river.course.filter((p) => p.z >= town.z0 && p.z <= town.z1);
const tr = baked.manifest.towns[0].rivers[0];
if (!inTown.length || inTown.some((p) => p.x < tr.x0 || p.x > tr.x1)) bad('the planned river runs down the town river, inside its banks', String(inTown.length));
const tmid = inTown[Math.floor(inTown.length / 2)];
if (!(field.sdAt(tmid.x, tmid.z) < -5) || !(field.sdAt(tr.x1 + 5, tmid.z) > 0)) bad('the river field is a channel down the middle of the town river and not beside it', `${field.sdAt(tmid.x, tmid.z)}`);
if (Math.abs((tr.x1 - tr.x0) - river.townWidth) > 0.02 || !(river.townT[0] < river.townT[1])) bad('the plan knows the width of the town river and where the course is in the town', JSON.stringify([river.townWidth, river.townT]));
// the width is the town trench width where the river meets the town, and eases to the river own width away from it
const wAt = (t) => widthAt(river, t);
if (Math.abs(wAt(river.townT[0]) - river.townWidth) > 1e-6 || Math.abs(wAt(river.townT[1]) - river.townWidth) > 1e-6 || !(Math.abs(wAt(river.townT[0] - 0.2) - river.townWidth) > 0.5)) bad('the river is the width of the town trench at the town and its own width away from it', '');

// ---- the plan rules: clear of the spur roads, over land, ending on the coast
const spurs = highwaySegments(world).filter((h) => h.kind === 'spur');
let closest = Infinity;
for (let i = 0; i < river.course.length; i++) {
  const p = river.course[i];
  if (p.z >= town.z0 - 30 && p.z <= town.z1 + 50) continue; // (the first 50 units from the town are its own: the river and the river drive meet at the town edge, and the river bends away from the road there)
  for (const s of spurs) {
    const l2 = (s.b.x - s.a.x) ** 2 + (s.b.z - s.a.z) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((p.x - s.a.x) * (s.b.x - s.a.x) + (p.z - s.a.z) * (s.b.z - s.a.z)) / l2));
    const d = Math.hypot(p.x - (s.a.x + t * (s.b.x - s.a.x)), p.z - (s.a.z + t * (s.b.z - s.a.z))) - half(i) - 3;
    closest = Math.min(closest, d);
  }
}
if (!(closest > 0)) bad('the river keeps clear of every spur road (its bank never over the road edge)', String(closest));
const coast = baked.manifest.landmasses[0].coast.points;
const end = river.course[river.course.length - 1];
if (nearestOnCoast(coast, end.x, end.z).d > 1 || !inside(coast, river.course[3].x, river.course[3].z)) bad('the river starts on the land and ends on the coast', '');

// ---- the baked ground: the chunks along it carry the signed distance with the channel in it
const sdChunks = baked.manifest.chunks.filter((c) => loaded.get(c.key)?.ground?.sd);
if (sdChunks.length < 40) bad('the chunks carry the signed distance', String(sdChunks.length));
const wholly = (c) => c.cx * 128 >= town.x0 && (c.cx + 1) * 128 <= town.x1 && c.cz * 128 >= town.z0 && (c.cz + 1) * 128 <= town.z1;
const along = baked.manifest.chunks.filter((c) => river.course.some((p) => p.x >= c.cx * 128 && p.x < (c.cx + 1) * 128 && p.z >= c.cz * 128 && p.z < (c.cz + 1) * 128) && !wholly(c));
for (const c of along) {
  const g = loaded.get(c.key).ground;
  if (!g?.sd || !g.sd.some((v) => v < 0)) bad('a chunk the river runs through has the channel in its signed distance', c.key);
}

// ---- the terrain: a boat sails in the river, a person and a car do not
const pi = river.course.findIndex((q) => q.z > town.z1 + 100);
const p = river.course[pi];
const here = terrain.sample(p.x, p.z), off = half(pi) + 25, bank = terrain.sample(p.x + off, p.z);
if (!(here.sd < -LIMITS.boat.depth) || here.surface !== 'sea') bad('the middle of the river is water a boat can sail (deeper than the boat needs)', JSON.stringify([here.sd, here.surface]));
if (!terrain.canStand(p.x, p.z, 'boat') || terrain.canStand(p.x, p.z, 'walk') || terrain.canStand(p.x, p.z, 'car')) bad('a boat can be in the river, a person and a car cannot', '');
if (!(bank.sd > 0) || !terrain.canStand(p.x + off, p.z, 'walk') || terrain.canStand(p.x + off, p.z, 'boat')) bad('beside the river there is land for a person and none for a boat', JSON.stringify(bank.sd));
let wet = 0, count = 0;
for (let i = river.course.findIndex((q) => q.z > town.z1 + 20); i < river.course.length - 1; i++) { count++; const q = river.course[i]; if (terrain.sample(q.x, q.z).sd < 0) wet++; }
if (wet < count - 1) bad('the whole south reach, from the town to the sea, is water', `${wet}/${count}`);
if (!(here.y < SEA_LEVEL) || !(bank.y > SEA_LEVEL)) bad('the bed is under the sea level and the bank over it', `${here.y} ${bank.y}`);
if (!(RIVER_SD.depth >= 1 && RIVER_SD.bank >= 1)) bad('the river distance is stretched, not squeezed', '');
console.log(`rivers: the Rio Minho: ${river.length} units, ${along.length} chunks along it, ${sdChunks.length} chunks with a signed distance, a boat can sail it (sd ${here.sd.toFixed(1)})`);
total();
