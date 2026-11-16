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
/** The old town's ground: a flat plane. (The town and its interiors assume it.) */
export const TOWN_GROUND = 0;
/** The top of the old town's land slab (apps/web/components/city/Land.jsx): a hair over the town ground, under every road, lawn and shore. */
export const TOWN_GROUND_TOP = 0.004;
/** The old town's water (its river and the boats in it): a plane a hair above its ground. */
export const TOWN_WATER = 0.026;
/** How far a boat floats above the baked sea's plane. */
export const BOAT_FLOAT = 0.04;
/** The shore where a tunnel's portals are cut (the baked ground there is 0 to 0.5: the spike's assumption, lib/world/tunnel.js). */
export const SHORE_GROUND = 0.2;
/** What a bridge deck's height is measured from: `deckHeight` rises from here (the town's ground), not from the sea. A deck `clearance` high is `clearance - SEA_LEVEL` above the water. */
export const DECK_BASE = TOWN_GROUND;

/** How far above the surface under it each kind of thing is laid, against z-fighting. */
export const LIFT = {
  road: 0.06, // a street over the ground
  highway: 0.1, // a coastal ring, a spur or a link over the ground
  prop: 0.03, // a model of the racing circuit (a tile has a base at 0) over the ground
  rail: 0.16, // the train's rail over the shore, so it lies on the road beside it (the highway is 0.1)
};

/** The height of a deck `clearance` units up, over the water. */
export const overSea = (height) => height - SEA_LEVEL;

/**
 * The disagreements the datum has not settled (the dev overlay and the test list them). Each is { id, what, gap }: when one is fixed, remove it here: the test counts them.
 */
export const DATUM_ISSUES = [
  { id: 'town-water-vs-sea', what: 'the old town draws its water at 0.026 and the baked world its sea at -0.3: boats and rivers on the two disagree by 0.326', gap: TOWN_WATER - SEA_LEVEL },
  { id: 'deck-from-ground', what: 'a bridge deck is measured from 0 (the town ground), so its clearance over the water is 0.3 more than its number', gap: -SEA_LEVEL },
  { id: 'town-top', what: 'the town land slab’s top is at 0.004, not at the town ground (0): the baked ground joined to it is lowered by 0.08 so the town’s slab wins', gap: TOWN_GROUND_TOP },
  { id: 'animal-water', what: 'the animals swim at 0.035, not at the town water (0.026)', gap: 0.035 - TOWN_WATER },
];

/**
 * Every named layer, for the overlay and the guards: [{ id, label, y, color, note }]: an absolute height (`y`), or a lift over the ground (`lift`, then `y` is the lift over 0 for drawing). `deck` is a bridge's flat deck
 * height (its clearance), `tunnelFloor` the tunnel's road (lib/world/tunnel.js).
 */
export function layers({ deck = 9, tunnelFloor = -5.5, tunnelRoof = -1.0 } = {}) {
  return [
    { id: 'sea', label: 'Sea plane (baked world)', y: SEA_LEVEL, color: '#2563eb', note: 'the water every landmass stands in' },
    { id: 'seaFloor', label: 'Seabed of the shallows / pier feet', y: SEA_FLOOR, color: '#64748b', note: 'the ground slopes down to it beyond a coast; foundations stand on it' },
    { id: 'townGround', label: 'Town ground', y: TOWN_GROUND, color: '#16a34a', note: 'the old town is flat at 0' },
    { id: 'townTop', label: 'Town land slab (top)', y: TOWN_GROUND_TOP, color: '#4ade80', note: 'the old town’s land is drawn a hair over its ground' },
    { id: 'townWater', label: 'Town water', y: TOWN_WATER, color: '#06b6d4', note: 'the old town’s river and boats' },
    { id: 'shore', label: 'Shore at a tunnel portal', y: SHORE_GROUND, color: '#a16207', note: 'where the tunnel’s ramps start (0 to 0.5 in the baked ground)' },
    { id: 'rail', label: 'Rail over the shore', y: TOWN_GROUND + LIFT.rail, color: '#7c3aed', note: 'ground + 0.16' },
    { id: 'deck', label: 'Bridge deck, flat span', y: deck, color: '#f97316', note: 'the causeways: 9 over 0, so 9.3 over the water' },
    { id: 'tunnelRoof', label: 'Tunnel roof (inside)', y: tunnelRoof, color: '#e11d48', note: 'under the sea plane, with its thickness' },
    { id: 'tunnelFloor', label: 'Tunnel road', y: tunnelFloor, color: '#be123c', note: 'the road in the tube' },
  ];
}
