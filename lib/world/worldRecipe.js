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

export const WORLD_RECIPE = {
  version: RECIPE_VERSION,
  name: 'VoxelVenture: the mainland and Harbor Isle',
  landmasses: [
    // the mainland: the first town and its land. Its coast is drawn round the land for the map; the game's own land is still the rectangle it has always been
    { id: 'mainland', name: 'The Mainland', towns: ['voxel'], coast: { seed: 1101, margin: 70 }, features: ['beaches', 'headlands'] },
    // the island: a second town, out to sea to the east. `place.gap` is the open water between the two coasts, in world units (a boat does 3.6 a second: about 100 seconds)
    { id: 'harbor-isle', name: 'Harbor Isle', towns: ['harbor'], coast: { seed: 2202, margin: 80 }, place: { from: 'mainland', bearing: 8, gap: 380 }, features: ['harbour', 'beaches', 'headlands', 'hills', 'airstrip'] },
  ],
  towns: [
    // `live`: the game loads and serves this town. The island's is false until the streaming runtime can show it and the server opens its lots
    { id: 'voxel', index: 0, name: 'Voxel Town', seed: 20260101, landmass: 'mainland', live: true },
    { id: 'harbor', index: 1, name: 'Harbor Town', seed: 8675309, landmass: 'harbor-isle', live: false },
  ],
  ocean: { margin: 500 }, // open sea beyond the outermost coast, on every side
  highways: [], // roads between towns on one landmass or across a causeway: roadmap task 12
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
  }
  const first = recipe.landmasses.filter((l) => !l.place);
  if (first.length !== 1) problems.push('exactly one landmass is the origin (has no `place`)');
  return problems;
}
