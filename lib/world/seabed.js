// A seabed for the open ocean (docs/world/water.md, option 2): the sea was a plane over nothing, so there was no floor to see through it. This draws one: from the coast the seabed stays on the shelf of the shallows
// (the baked ground's own -1.5, out to SEABED.shelf units) and then falls away to the ocean floor (OCEAN_FLOOR) by SEABED.reach units out. The sea's shader reads the same profile to work out how much water is
// over each point, so the sea is clear in the shallows, where you see the bottom, and thickens with the depth and the angle you look at it (a water column). It is only drawn: the game's ground and collision
// (lib/world/terrain.js) still say the sea is the shallows' floor, so a boat or a pier does not read it. Pure (no three.js).
import { OCEAN_FLOOR, SEA_FLOOR, SEA_LEVEL } from './datum';
import { shoreSigned } from './seaDepth';

export const SEABED = {
  shelf: 140, // the seabed stays at the shallows' floor out to this far from a coast (the baked chunks reach about this far: no step where they end)
  reach: 500, // and has fallen to the ocean floor by this far
  absorb: 0.20, // how fast the water takes the light with its thickness (the sea's opacity, in the shader)
  tint: 0.16, // how fast the water goes from turquoise to deep blue with its depth
};

const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The seabed's height at a distance `d` from the coast (0 or more). */
export const seabedY = (d) => SEA_FLOOR - 0.05 + (OCEAN_FLOOR - (SEA_FLOOR - 0.05)) * smooth(SEABED.shelf, SEABED.reach, d);
/** The depth of the water over the seabed there. */
export const waterDepth = (d) => SEA_LEVEL - seabedY(d);
/** How much light the water takes looking straight at the seabed through `depth` of it, and at the angle with `cosView` (the cosine to the vertical): 0 clear to 1 opaque (Beer-Lambert). */
export const absorbed = (depth, cosView = 1) => 1 - Math.exp(-(depth / Math.max(cosView, 0.12)) * SEABED.absorb);

/** The seabed's colour at a distance from the coast: sand on the shelf, going grey-blue and dark in the deep. [r, g, b] 0 to 255. */
export function seabedColor(d) {
  const a = smooth(30, 260, d), b = smooth(200, 500, d);
  const sand = [214, 196, 150], mud = [96, 110, 120], deep = [26, 40, 62];
  const mix = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
  const c = mix(mix(sand, mud, a), deep, b);
  return c.map(Math.round);
}

/**
 * The seabed mesh from the raster of the signed distance to the coast (lib/world/seaDepth.js shoreField): one vertex at the middle of each cell, at the seabed's height there, with its colour; two triangles for each
 * square of four. Under the land (negative distance) the floor is the shelf's, flat: the land covers it. { positions, colors (bytes), indices, triangles }.
 */
export function seabedMesh(field) {
  const { w, h, x0, z0, cell } = field;
  const positions = new Float32Array(w * h * 3);
  const colors = new Uint8Array(w * h * 3);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell;
    const d = Math.max(0, shoreSigned(field, x, z));
    const k = j * w + i;
    positions.set([x, seabedY(d), z], k * 3);
    colors.set(seabedColor(d), k * 3);
  }
  const indices = new Uint32Array((w - 1) * (h - 1) * 6);
  let n = 0;
  for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
    const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
    indices.set([a, c, b, b, c, d], n);
    n += 6;
  }
  return { positions, colors, indices, triangles: indices.length / 3 };
}
