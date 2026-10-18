// The size of a building's inside, by type, variant and tier. On its own (no Pascal catalogue), so the API can check that a saved interior
// stays in its room (lib/content/interiorDesign.js); lib/content/interiorScenes.js builds the generated rooms with it.
export const STOREY_HEIGHT = 2.5; // Pascal's default wall height, used as the floor-to-floor height

// Room size (metres) per building type / variant: offices are the largest, shops the smallest.
const ROOM_SIZES = {
  office: [12, 8],
  restaurant: [10, 7],
  shop: [8, 6],
  house: [8, 6],
  'shop/market': [10, 7],
  'shop/arcade': [9, 6],
};

// Prime buildings are bigger inside too: 4 wider and 2 deeper. A luxury estate is 8 wider and 4 deeper; a grand estate 12 and 6.
export function interiorRoomSize(type, variant, prime = false, luxury = false, grand = false) {
  const size = ROOM_SIZES[`${type}/${variant}`] ?? ROOM_SIZES[type] ?? ROOM_SIZES.office;
  return { width: size[0] + (grand ? 12 : luxury ? 8 : prime ? 4 : 0), depth: size[1] + (grand ? 6 : luxury ? 4 : prime ? 2 : 0) };
}
