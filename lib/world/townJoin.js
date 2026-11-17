// Where the first town meets the baked world (docs/world/datum.md, "The town border"): the town draws its own land (a flat slab, apps/web/components/city/Land.jsx) and its own streets, plots and collision, so the
// baked chunks that overlap the town's land are not drawn as they are. They used to be left out whole, but a chunk is 128 units square and the town's land is not a whole number of chunks: round the town there was a
// frame of ground that neither the town nor a baked chunk drew (97 units wide on the west, 69 on the east and north, 51 on the south), where the sea showed and the roads from the ring to the town's gates stopped short.
//
// Now a chunk wholly inside the town's land is left out (the town covers it); a chunk that only overlaps it is drawn with its ground, lowered a hair so the town's slab wins where they lie together, and with its
// highways cut to the part OUTSIDE the land (the baked streets, plots and props are the town's own and are dropped). `terrain.js` still treats every overlapping chunk as the town's (its own collision rules).
// Pure.
import { TOWN_GROUND_TOP } from './datum';

export const JOIN = { underlay: 0.08 }; // how far a joined chunk's ground is lowered, so the town's slab (TOWN_GROUND_TOP over the datum ground) is over it
export const CHUNK = 128;

/** Does the chunk `c` ({ cx, cz }) overlap the town's land? */
export const overlapsTown = (c, land, size = CHUNK) => { const x0 = c.cx * size, z0 = c.cz * size; return x0 < land.x1 && x0 + size > land.x0 && z0 < land.z1 && z0 + size > land.z0; };
/** Is the chunk wholly inside the town's land (the town covers all of it)? */
export const insideTown = (c, land, size = CHUNK) => { const x0 = c.cx * size, z0 = c.cz * size; return x0 >= land.x0 && x0 + size <= land.x1 && z0 >= land.z0 && z0 + size <= land.z1; };

/** The parts of the segment a-b that lie outside the rectangle `r`: [{ a, b }] (none, one or two). */
export function outsideParts(a, b, r) {
  const dx = b.x - a.x, dz = b.z - a.z;
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[a.x, dx, r.x0, r.x1], [a.z, dz, r.z0, r.z1]]) {
    if (Math.abs(d) < 1e-12) { if (p < lo || p > hi) return [{ a, b }]; continue; } // parallel and outside: all of it is outside
    let u0 = (lo - p) / d, u1 = (hi - p) / d;
    if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0);
    t1 = Math.min(t1, u1);
  }
  if (t0 >= t1) return [{ a, b }]; // never inside
  const at = (t) => ({ x: a.x + dx * t, z: a.z + dz * t });
  const out = [];
  if (t0 > 1e-9) out.push({ a, b: at(t0) });
  if (t1 < 1 - 1e-9) out.push({ a: at(t1), b });
  return out;
}

/** The chunk as it is drawn where it overlaps the town: its ground, and its highways cut to the part outside the land (the town's own streets, plots and props are dropped). */
export function clipChunkToTown(chunk, land) {
  const highways = [];
  for (const h of chunk.highways ?? []) {
    if (h.kind === 'causeway-bridge') { highways.push(h); continue; }
    for (const part of outsideParts(h.a, h.b, land)) highways.push({ ...h, a: part.a, b: part.b });
  }
  return { ...chunk, plots: [], roads: [], props: [], highways };
}

/** The height a joined chunk is drawn at: lowered by the underlay (the town's slab is TOWN_GROUND_TOP over the datum ground). */
export const joinedY = () => -JOIN.underlay;
export { TOWN_GROUND_TOP };
