// The town's water against the sea (docs/world/river_system.md, docs/world/datum.md): the town's river is now sunk into a trench through the town's slab and sits at the SEA's level, so it joins the baked river
// (lib/world/rivers.js) and the sea without a step, and a boat floats on the same water from the town to the ocean. The town's lakes stay raised ponds a hair over the ground (the datum's TOWN_WATER): they are
// not connected to anything. This is the pure part: which water a point is on and its level, and how the slab (and anything laid on it) is cut round the river. No three.js, no React.
import { BOAT_FLOAT, RIVER_BED, RIVER_WATER, TOWN_GROUND_TOP, TOWN_WATER } from './datum';

export const BANK = 1.2; // the sandy bank beyond the water on each side of the river (River.jsx)
export const TRENCH = { top: TOWN_GROUND_TOP, bed: RIVER_BED, water: RIVER_WATER };

/** The river rectangles of a layout, as they are drawn: the river's own, kept to the land. [{ id, x0, x1, z0, z1 }] */
export function riverRects(layout) {
  const land = layout.land;
  return (layout.rivers ?? []).map((r) => ({ id: r.id, x0: Math.max(r.x0, land?.x0 ?? r.x0), x1: Math.min(r.x1, land?.x1 ?? r.x1), z0: Math.max(r.z0, land?.z0 ?? r.z0), z1: Math.min(r.z1, land?.z1 ?? r.z1) }));
}

/** Is (x, z) over the river's water (inside one of the rectangles, `margin` in from its edge)? */
export const inRiver = (rects, x, z, margin = 0) => rects.some((r) => x > r.x0 + margin && x < r.x1 - margin && z > r.z0 + margin && z < r.z1 - margin);

/** The level of the water a thing at (x, z) floats on: the river's (the sea's) over the river, the pond's (a lake's) elsewhere. `rects` are riverRects(layout). */
export const waterYAt = (rects, x, z) => (inRiver(rects, x, z) ? RIVER_WATER : TOWN_WATER);
/** Where a boat's origin sits at (x, z): over the river it floats on the sea's level like a boat at sea (BOAT_FLOAT over it), on a lake it sits on the pond's level as it always did. */
export const boatYAt = (rects, x, z) => (inRiver(rects, x, z) ? RIVER_WATER + BOAT_FLOAT : TOWN_WATER);

/** A rectangle with the rectangles `cuts` taken out of it: the pieces left, [{ x0, x1, z0, z1 }] (none when it is all cut away). */
export function subtractRects(rect, cuts) {
  let pieces = [{ x0: rect.x0, x1: rect.x1, z0: rect.z0, z1: rect.z1 }];
  for (const c of cuts) {
    const next = [];
    for (const p of pieces) {
      if (c.x1 <= p.x0 || c.x0 >= p.x1 || c.z1 <= p.z0 || c.z0 >= p.z1) { next.push(p); continue; } // not touching
      if (c.x0 > p.x0) next.push({ x0: p.x0, x1: c.x0, z0: p.z0, z1: p.z1 }); // the strip west of the cut
      if (c.x1 < p.x1) next.push({ x0: c.x1, x1: p.x1, z0: p.z0, z1: p.z1 }); // east
      const mx0 = Math.max(p.x0, c.x0), mx1 = Math.min(p.x1, c.x1);
      if (c.z0 > p.z0) next.push({ x0: mx0, x1: mx1, z0: p.z0, z1: c.z0 }); // north, between them
      if (c.z1 < p.z1) next.push({ x0: mx0, x1: mx1, z0: c.z1, z1: p.z1 }); // south
    }
    pieces = next;
  }
  return pieces;
}

/** The land slab, the built-up part and the lawns, cut round the river's trench: each a list of rectangles. `lawns` are layout.lawns. */
export function cutLand(layout) {
  const cuts = riverRects(layout);
  const land = layout.land;
  return {
    slab: land ? subtractRects(land, cuts) : [],
    urban: layout.urban ? subtractRects(layout.urban, cuts) : [],
    lawns: (layout.lawns ?? []).flatMap((r) => subtractRects(r, cuts)),
    cuts,
  };
}
