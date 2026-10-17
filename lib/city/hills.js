// The hills: a range of low, rounded hills in the north-east, outside the city, with a road running in between them.
// Pure (no three.js), so the generator, the mesh (apps/web/components/city/Hills.jsx), the collision map and the tests all use the same height.
//
// layout.hills = { id, name, rect, flat: [rect], seed, amp }
//   rect  the whole hilly area (hills fall to the ground at its edge)
//   flat  rectangles that stay level: the roads through the hills with a verge, and the meadow the loop road rings
//   amp   the highest a hill gets, in world units (a tall building is ~1.5; a hill never gets past this)
export const HILL_MAX = 2.2;
export const HILL_VERGE = 5.5; // flat ground each side of a road's centre line, before the slope begins
export const HILL_SLOPE = 7; // how far the ground then takes to rise to its full height
export const HILL_EDGE = 10; // the fall to the ground at the edge of the hilly area
export const HILL_BLOCKED = 0.45; // the avatar cannot walk where the ground is higher than this

const smooth = (t) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};
// distance from a point to a rectangle (0 inside it)
const distOutside = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

// Rolling shapes: a few sine waves of different lengths, shifted by the seed, mapped to 0..1 and then pushed so there are rounded hills
// with low saddles between them rather than a constant ripple.
function shape(seed, x, z) {
  const p = (k) => ((Math.imul(seed + k * 7919, 2654435761) >>> 0) % 6283) / 1000; // phases in 0..2π
  const v =
    Math.sin(x / 9.5 + p(1)) * Math.cos(z / 11 + p(2)) * 0.5 +
    Math.sin((x + z) / 6.8 + p(3)) * 0.3 +
    Math.cos((x - z) / 14 + p(4)) * 0.35;
  return smooth((v + 0.55) / 1.45); // roughly 0..1
}

export function hillHeight(hills, x, z) {
  if (!hills) return 0;
  const { rect, flat, seed, amp } = hills;
  if (x <= rect.x0 || x >= rect.x1 || z <= rect.z0 || z >= rect.z1) return 0;
  const edge = Math.min(x - rect.x0, rect.x1 - x, z - rect.z0, rect.z1 - z);
  let h = amp * shape(seed, x, z) * smooth(edge / HILL_EDGE);
  if (h <= 0) return 0;
  for (const f of flat) {
    const d = distOutside(f, x, z);
    h *= smooth((d - HILL_VERGE) / HILL_SLOPE);
    if (h <= 0) return 0;
  }
  return h;
}

// For the collision map: is this ground too steep and high to walk on?
export const hillBlocked = (hills, x, z) => hillHeight(hills, x, z) > HILL_BLOCKED;
