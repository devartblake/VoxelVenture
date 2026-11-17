// The world's datum (docs/world/datum.md): the heights everything in the world is measured from, in one place. Heights are in world units on the y axis; the old town and the baked world each had their own idea of
// where the ground and the water are (the town's ground is flat at 0 and its rivers are drawn at 0.026; the baked sea is a plane at -0.3 over a seabed that slopes to -1.5), and bridges, props, roads and the tunnel each
// carried their own copy of the numbers they stand on. This file names them. On its own (no imports), so every part of the game, the tools and the tests can read it.
//
// Nothing here changes a height: the values are what the game already used (a test, tests/datum.test.mjs, keeps the sources from growing a number of their own). The known disagreements are listed in
// DATUM_ISSUES and the dev overlay (/world/stream?datum=1) draws every layer, so the mismatches can be seen and settled one by one.

/** The baked world's sea plane (apps/web/components/world/StreamedWorld.jsx draws it over the whole ocean; lib/world/terrain.js treats everything under it as sea). */
export const SEA_LEVEL = -0.3;
/** The seabed of the shallows: the ground slopes down to this beyond a coast, and nothing is deeper (a pier or a bridge foundation stands on it; open ocean has no ground at all). */
export const SEA_FLOOR = -1.5;
/** The floor of the open ocean, far from any coast (lib/world/seabed.js): drawn so the sea has a bottom to see through it; the game's ground and collision do not read it. */
export const OCEAN_FLOOR = -14;
/** The old town's ground: a flat plane. (The town and its interiors assume it.) */
export const TOWN_GROUND = 0;
/** The top of the old town's land slab (apps/web/components/city/Land.jsx): a hair over the town ground, under every road, lawn and shore. */
export const TOWN_GROUND_TOP = 0.004;
/**
 * The old town's POND water (its lakes, and the boats on them): a surface a hair above the town's ground, like a pond on a plain; it is connected to nothing. The town's RIVER is not a pond: it is sunk into a trench
 * through the town's slab and sits at the sea's level (RIVER_WATER), so it joins the baked river and the sea without a step (docs/world/river_system.md, lib/world/townWater.js). Use `waterLevel`.
 */
export const TOWN_WATER = 0.026;
/** The town's river: the sea's level (the trench the river runs in is cut through the slab down to RIVER_BED). */
export const RIVER_WATER = SEA_LEVEL;
/** The bed of the town's river: the seabed of the shallows, so the baked river's bed (which slopes down to it) continues into the town without a step. */
export const RIVER_BED = SEA_FLOOR;
/** The height of a kind of water: 'sea' and 'river' (the sea's level, which the town's river and the baked rivers share), or 'pond' (a town's lakes). */
export const waterLevel = (kind) => (kind === 'pond' || kind === 'inland' ? TOWN_WATER : SEA_LEVEL);
/** How far a boat floats above the baked sea's plane. */
export const BOAT_FLOAT = 0.04;
/** The shore where a tunnel's portals are cut (the baked ground there is 0 to 0.5: the spike's assumption, lib/world/tunnel.js). */
export const SHORE_GROUND = 0.2;
/** What a bridge piece's `clearance` (its flat deck height) is measured from: `deckHeight` rises from the ground at the shore up to it, so the number is an absolute height. What a recipe asks for ("9 over the water") goes through `deckOverSea`. */
export const DECK_BASE = TOWN_GROUND;
/** The absolute height of a deck `over` units above the water: what a recipe's causeway `clearance` becomes (2026-11-17: it used to be taken as the absolute height, so a "9" deck stood 9.3 over the sea). */
export const deckOverSea = (over) => SEA_LEVEL + over;

/** How far above the surface under it each kind of thing is laid, against z-fighting. */
export const LIFT = {
  road: 0.06, // a street over the ground
  highway: 0.1, // a coastal ring, a spur or a link over the ground
  prop: 0.03, // a model of the racing circuit (a tile has a base at 0) over the ground
  rail: 0.16, // the train's rail over the shore, so it lies on the road beside it (the highway is 0.1)
  deckRail: 0.04, // the train's rail over a bridge deck's road surface
  plot: 0.1, // the base of what an owner builds on a plot (a building's pieces, a yard's ground) over the ground
  yard: 0.14, // a yard's models, over its ground slab
  // the racing circuit's painted layers over the ground, in layers so they do not fight: gravel, asphalt, lines and kerbs, the start line and the grid's black and white
  paint: { gravel: 0.03, asphalt: 0.05, mark: 0.08, top: 0.1 },
  plotPad: 0.175, // an unclaimed plot's pad (the middle of it), over the ground: people and cars stand on it
  deckKerb: 0.12, // the walk on a bridge deck's edge, over the road (the street lamps stand on it)
  pool: 0.12, // a street lamp's pool of light over the road it lights (on a deck, over the deck)
  floodPool: 0.16, // a stadium mast's pool of light over the ground
};

/**
 * What a person or a car stands on in the old town (lib/city/surfaceHeight.js, lib/city/curves.js), as heights over the town ground. The streets' meshes and the walking surfaces read the same numbers, so a
 * walker's feet are on what is drawn. `land` is the town slab's top (TOWN_GROUND_TOP).
 */
export const SURFACE = {
  land: TOWN_GROUND_TOP, // bare land
  urban: 0.007, // the built-up ground of a district
  lawn: 0.01, // a lawn
  road: 0.03, // a street's asphalt (a roundabout's ring, a junction's middle)
  kerb: 0.08, // a pavement and a kerb
  roundaboutCentre: 0.06, // the island of a roundabout
  apron: 0.03, // an airport's apron (the drawn one: Airports.jsx; walkers used to stand at 0.012, under it)
  taxiway: 0.045, // its taxiways
  runway: 0.06, // its runway (it used to be 0.016 for walkers)
  marking: 0.075, // the paint on them
  pier: 0.06, // a pier's deck
  plaza: 0.018, // a pier's plaza
  promenade: 0.02, // a promenade
  park: 0.06, // a park's lawn
  parkPath: 0.065, // a park's paths (the drawn height: Park.jsx)
  mall: 0.16, // a mall's floor
  mallHall: 0.18, // a mall's central hall
  field: 0.007, // a field of farmland (Farmland.jsx)
  patch: 0.008, // a patch of ground colour (GroundPatches.jsx)
  hills: 0.006, // the base of the hills (Hills.jsx)
  animal: 0.012, // where an animal walks on land
};

/** How far over the water a deck at the absolute height `height` is (the inverse of `deckOverSea`). */
export const overSea = (height) => height - SEA_LEVEL;

/**
 * The disagreements the datum has not settled (the dev overlay and the test list them). Each is { id, what, gap }: when one is fixed, remove it here: the test counts them.
 */
export const DATUM_ISSUES = []; // (none left: the town's river and the slab, the animals and the decks are settled)

/**
 * Every named layer, for the overlay and the guards: [{ id, label, y, color, note }]: an absolute height (`y`), or a lift over the ground (`lift`, then `y` is the lift over 0 for drawing). `deck` is a bridge's flat deck
 * height (its clearance), `tunnelFloor` the tunnel's road (lib/world/tunnel.js).
 */
export function layers({ deck = deckOverSea(9), tunnelFloor = -5.5, tunnelRoof = -1.0 } = {}) {
  return [
    { id: 'sea', label: 'Sea plane (baked world)', y: SEA_LEVEL, color: '#2563eb', note: 'the water every landmass stands in' },
    { id: 'oceanFloor', label: 'Ocean floor (drawn only)', y: OCEAN_FLOOR, color: '#334155', note: 'the seabed falls to it between 140 and 500 units from a coast; nothing collides with it' },
    { id: 'seaFloor', label: 'Seabed of the shallows / pier feet', y: SEA_FLOOR, color: '#64748b', note: 'the ground slopes down to it beyond a coast; foundations stand on it' },
    { id: 'townGround', label: 'Town ground', y: TOWN_GROUND, color: '#16a34a', note: 'the old town is flat at 0' },
    { id: 'townTop', label: 'Town land slab (top)', y: TOWN_GROUND_TOP, color: '#4ade80', note: 'the old town’s land is drawn a hair over its ground' },
    { id: 'townWater', label: 'Town pond water', y: TOWN_WATER, color: '#06b6d4', note: 'the old town’s lakes (and their boats and ducks): ponds over the ground' },
    { id: 'riverWater', label: 'Town river (the sea level)', y: RIVER_WATER, color: '#2563eb', note: 'the town’s river runs in a trench through the slab at the sea’s level, joined to the baked river' },
    { id: 'riverBed', label: 'Town river bed', y: RIVER_BED, color: '#475569', note: 'the trench’s bed: the seabed of the shallows' },
    { id: 'shore', label: 'Shore at a tunnel portal', y: SHORE_GROUND, color: '#a16207', note: 'where the tunnel’s ramps start (0 to 0.5 in the baked ground)' },
    { id: 'rail', label: 'Rail over the shore', y: TOWN_GROUND + LIFT.rail, color: '#7c3aed', note: 'ground + 0.16' },
    { id: 'deck', label: 'Bridge deck, flat span', y: deck, color: '#f97316', note: 'the causeways: 9 over 0, so 9.3 over the water' },
    { id: 'tunnelRoof', label: 'Tunnel roof (inside)', y: tunnelRoof, color: '#e11d48', note: 'under the sea plane, with its thickness' },
    { id: 'tunnelFloor', label: 'Tunnel road', y: tunnelFloor, color: '#be123c', note: 'the road in the tube' },
  ];
}
