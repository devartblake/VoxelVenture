// The world recipe (docs/world/world_recipe.md): a small, plain-data description of the map. Which landmasses there are, which towns stand on them (each is `generateTown(seed)`),
// where a landmass sits in relation to another, which features its coast has, and how plot ids are numbered across towns. A first slice of roadmap tasks 9, 10 and 14: the
// recipe, global plot ids, and the coast. Nothing here is loaded by the game yet: the game still loads the first town alone (the streaming runtime, roadmap task 11, is what
// will let a player cross to the island). `buildWorld` (buildWorld.js) turns a recipe into the map; tests/world-recipe.test.mjs checks both.
//
// Global plot ids (roadmap task 10): a plot's id is `town index * TOWN_ID_STRIDE + the id the town's generator gave it`. The first town is index 0, so its ids are what they
// always were (the live database holds claims on them); the second town's start at 1,000,000. A town's own ids stay below the stride (the generator's design and editor lots,
// 100000 and 300000 up, are far below it), so no two towns' ids can meet.

export const TOWN_ID_STRIDE = 1_000_000;
export const toGlobalId = (townIndex, localId) => townIndex * TOWN_ID_STRIDE + localId;
export const fromGlobalId = (id) => ({ town: Math.floor(id / TOWN_ID_STRIDE), local: id % TOWN_ID_STRIDE });

export const RECIPE_VERSION = 1;
export const COAST_SHAPES = ['jamaica', 'grand-cayman', 'little-cayman', 'cayman-brac']; // the templates in shapes.js

export const WORLD_RECIPE = {
  version: RECIPE_VERSION,
  name: 'VoxelVenture: the mainland and Harbor Isle',
  landmasses: [
    // the mainland: the first town and its land. Its coast is drawn round the land for the map; the game's own land is still the rectangle it has always been
    // (2026-11-15) a variation of Jamaica (shapes.js): long, with the south coast's great bay and the harbour inlet, the Blue Mountains in the east. The first town stands on the central
    // plains (`anchor`, a place on the template): its land is scaled into the island with `margin` of beach all round. `length` is the island's reach east to west, in game units; `stretch`
    // widens it north to south (Jamaica is thin: the town's land needs room); `variation` and `rotate` make it Jamaica's kind of shape, not Jamaica.
    { id: 'mainland', name: 'The Mainland', towns: ['voxel'], coast: { shape: 'jamaica', seed: 1101, margin: 70, length: 2000, stretch: 1.35, rotate: 4, variation: 0.06, anchor: { lon: -77.28, lat: 18.02 } }, features: ['beaches', 'headlands', 'ranges'] },
    // the island: a second town, out to sea to the east. `place.gap` is the open water between the two coasts, in world units (a boat does 3.6 a second: about 100 seconds)
    // Harbor Isle (2026-11-15): a variation of Grand Cayman (shapes.js). The harbour is on the west coast, facing the mainland (George Town's); the North Sound is the great bay in the north; Harbor
    // Town stands on the fat western end (`anchor`), and the island runs on east as a long thin arm. The airstrip is generated beside the town, as before.
    { id: 'harbor-isle', name: 'Harbor Isle', towns: ['harbor'], coast: { shape: 'grand-cayman', seed: 2202, margin: 80, length: 1900, stretch: 0.7, rotate: -3, variation: 0.05, anchor: { lon: -81.4068, lat: 19.3354 } }, place: { from: 'mainland', bearing: 8, gap: 380 }, features: ['harbour', 'beaches', 'headlands', 'ranges', 'airstrip'] },
    // The Lesser Caymans, near Harbor Isle (the real ones are a hundred and thirty kilometres from Grand Cayman: these are 260 and 300 units of water away, about 70 and 85 seconds by boat): two thin
    // islands with no town yet, both placed out from Harbor Isle (north-east of it), about 275 units apart. Their lengths keep the real proportions to Harbor Isle's (16 and 19 km to 35).
    // The Brac has its Bluff.
    { id: 'little-isle', name: 'Little Isle', towns: [], coast: { shape: 'little-cayman', seed: 3303, length: 900, variation: 0.05 }, place: { from: 'harbor-isle', bearing: -35, gap: 260 }, features: ['beaches', 'headlands'] },
    { id: 'the-brac', name: 'The Brac', towns: [], coast: { shape: 'cayman-brac', seed: 4404, length: 1050, variation: 0.04 }, place: { from: 'harbor-isle', bearing: -85, gap: 300 }, features: ['beaches', 'headlands', 'ranges'] },
  ],
  towns: [
    // `live`: the game loads and serves this town. The island's is false until the streaming runtime can show it and the server opens its lots
    { id: 'voxel', index: 0, name: 'Voxel Town', seed: 20260101, landmass: 'mainland', live: true },
    { id: 'harbor', index: 1, name: 'Harbor Town', seed: 8675309, landmass: 'harbor-isle', live: false },
  ],
  ocean: { margin: 500 }, // open sea beyond the outermost coast, on every side
  // roads round a landmass (roadmap task 12, first slice): a coastal ring `inset` units inland of the coast, with a spur from each side of the town's county road. Roads between landmasses
  // (a causeway) are not here yet.
  highways: [
    { id: 'mainland-ring', name: 'Mainland Coast Road', landmass: 'mainland', inset: 30 },
    { id: 'harbor-ring', name: 'Harbor Coast Road', landmass: 'harbor-isle', inset: 30 },
  ],
  // roads across the sea (roadmap task 12): a causeway between two rings, a bridge over the water with `clearance` units under it for boats
  causeways: [
    { id: 'harbor-causeway', name: 'Harbor Causeway', from: 'mainland-ring', to: 'harbor-ring', clearance: 9 },
    // a second crossing between the same two rings, at least `apart` units from the first at both ends, so the two are separate routes
    { id: 'north-causeway', name: 'North Causeway', from: 'mainland-ring', to: 'harbor-ring', clearance: 9, apart: 400 },
  ],
};

/** What is wrong with a recipe: [] when nothing is. */
export function validateRecipe(recipe) {
  const problems = [];
  const ids = (list) => list.map((x) => x.id);
  if (recipe.version !== RECIPE_VERSION) problems.push(`the recipe is version ${recipe.version}, this code reads ${RECIPE_VERSION}`);
  for (const [what, list] of [['landmass', recipe.landmasses], ['town', recipe.towns]]) {
    if (new Set(ids(list)).size !== list.length) problems.push(`two ${what}s share an id`);
  }
  if (new Set(recipe.towns.map((t) => t.index)).size !== recipe.towns.length) problems.push('two towns share an index (it numbers their plots)');
  if (!recipe.towns.some((t) => t.index === 0 && t.seed === 20260101)) problems.push('town 0 must be the first town, seed 20260101: the live database holds claims on its plots');
  for (const t of recipe.towns) {
    if (!Number.isInteger(t.index) || t.index < 0) problems.push(`town ${t.id} has no valid index`);
    if (!recipe.landmasses.some((l) => l.id === t.landmass && l.towns.includes(t.id))) problems.push(`town ${t.id} is not on the landmass it names`);
    if (!Number.isFinite(t.seed)) problems.push(`town ${t.id} has no seed`);
  }
  for (const l of recipe.landmasses) {
    for (const id of l.towns) if (!recipe.towns.some((t) => t.id === id)) problems.push(`landmass ${l.id} names a town (${id}) that is not in the recipe`);
    if (l.place && !recipe.landmasses.some((o) => o.id === l.place.from)) problems.push(`landmass ${l.id} is placed from one that is not in the recipe`);
    if (l.place && !(l.place.gap > 0)) problems.push(`landmass ${l.id} needs a positive gap of open water`);
    if (l.coast.shape !== undefined) {
      if (!COAST_SHAPES.includes(l.coast.shape)) problems.push(`landmass ${l.id} asks for a coast shape (${l.coast.shape}) that does not exist`);
      if (!(l.coast.length > 0)) problems.push(`landmass ${l.id} has a template coast, which needs a length`);
      if (l.towns.length && (!Number.isFinite(l.coast.anchor?.lon) || !Number.isFinite(l.coast.anchor?.lat))) problems.push(`landmass ${l.id} has a town on a template coast, which needs an anchor { lon, lat } to put the town on`);
    }
    if (!l.towns.length && l.coast.shape === undefined) problems.push(`landmass ${l.id} has no town, so it needs a template coast (there is no land to fit a ring round)`);
    if (l.features.includes('ranges') && l.coast.shape === undefined) problems.push(`landmass ${l.id} asks for mountain ranges, which only a template coast has`);
  }
  for (const h of recipe.highways ?? []) {
    const l = recipe.landmasses.find((x) => x.id === h.landmass);
    if (!l) problems.push(`highway ${h.id} is on a landmass (${h.landmass}) that is not in the recipe`);
    else if (!l.towns.length) problems.push(`highway ${h.id} is on a landmass with no town to join it to`);
    if (h.inset !== undefined && !(h.inset >= 10)) problems.push(`highway ${h.id} needs an inset of at least 10`);
  }
  if (new Set((recipe.highways ?? []).map((h) => h.id)).size !== (recipe.highways ?? []).length) problems.push('two highways share an id');
  for (const c of recipe.causeways ?? []) {
    const ids = (recipe.highways ?? []).map((h) => h.id);
    if (!ids.includes(c.from) || !ids.includes(c.to) || c.from === c.to) problems.push(`causeway ${c.id} must join two different highways of the recipe`);
  }
  const first = recipe.landmasses.filter((l) => !l.place);
  if (first.length !== 1) problems.push('exactly one landmass is the origin (has no `place`)');
  return problems;
}
