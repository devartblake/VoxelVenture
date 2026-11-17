// The rivers of the world (docs/world/river_plan.md): the plan (lib/world/riverPlan.js) for the rivers the recipe turns on, and the field the bake cuts them into the ground with. A river is a second COAST: the ground
// has a signed distance to the nearest shore at every corner (lib/world/bake.js, positive on land), and a river is the distance to its course less its half width, so the shore is the bank, the channel is the sea and the
// meshes (lib/world/chunkMesh.js), the terrain (lib/world/terrain.js: a boat sails where the sea is deep enough) and the sea's plane at the datum's sea level all work as they do for a coast. The river is not cut inside the
// first town's land: the town draws its own slab and its own river there (until the town's river is sunk: docs/world/river_system.md). Pure (no three.js).
import { planRivers, widthAt } from './riverPlan';

/** How a river's signed distance is stretched when it is cut into the ground (the coast's own is not): the channel is deeper (a river bed is steeper than a beach) and the banks narrower than a coast's beach. */
export const RIVER_SD = { depth: 1.6, bank: 1.6 };

/** The highways of a built world as straight pieces ({ id, kind, a, b }): each ring road's edges and each spur's legs (what the bake lays as ribbons). */
export function highwaySegments(world) {
  const out = [];
  for (const h of world.highways) {
    h.ring.forEach((p, i) => out.push({ id: h.id, kind: 'ring', a: p, b: h.ring[(i + 1) % h.ring.length] }));
    for (const sp of h.spurs) {
      const way = sp.via ? [sp.from, sp.via, sp.to] : [sp.from, sp.to];
      for (let k = 0; k + 1 < way.length; k++) out.push({ id: `${h.id}:spur-${sp.side}`, kind: 'spur', a: way[k], b: way[k + 1] });
    }
  }
  return out;
}

/** The plan for the rivers a recipe turns on (`ids`, from recipe.rivers), for a built world: [] when none. */
export function buildRivers(world, ids = []) {
  if (!ids.length) return [];
  const manifest = { landmasses: world.landmasses.filter((l) => l.features).map((l) => ({ id: l.id, features: l.features, coast: { points: l.outline.points } })) };
  const first = world.towns[0];
  const rivers = first?.city?.layout?.rivers ?? [];
  const townRiver = rivers[0] ? { x0: rivers[0].x0 + first.origin.x, x1: rivers[0].x1 + first.origin.x, z0: rivers[0].z0 + first.origin.z, z1: rivers[0].z1 + first.origin.z } : null;
  const plan = planRivers({ manifest, highways: highwaySegments(world), townRiver });
  if (plan.problems.length) throw new Error(`the river plan is not valid: ${plan.problems.join('; ')}`);
  return plan.rivers.filter((r) => ids.includes(r.id)).map((r) => ({
    id: r.id, name: r.name, coast: r.coast, kind: r.kind, length: r.length, fall: r.fall, width: r.width,
    course: r.course.map((p) => ({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 })),
    crosses: r.crosses,
  }));
}

/** The river field: sdAt(x, z) is the signed distance from the nearest river's bank (negative in the channel, positive outside, Infinity when no river is near), nothing inside `skip` (a rectangle: the first town's land). */
export function riverField(rivers, skip = null) {
  const parts = rivers.map((r) => {
    const pts = r.course, cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const total = cum[cum.length - 1] || 1;
    const half = pts.map((_, i) => widthAt({ length: r.length, kind: r.kind }, cum[i] / total) / 2);
    const reach = Math.max(...half) + 2;
    const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
    return { r, pts, half, reach, box: { x0: Math.min(...xs) - reach, x1: Math.max(...xs) + reach, z0: Math.min(...zs) - reach, z1: Math.max(...zs) + reach } };
  });
  const sdAt = (x, z, within = Infinity) => {
    if (skip && x >= skip.x0 && x <= skip.x1 && z >= skip.z0 && z <= skip.z1) return Infinity;
    let best = Infinity;
    for (const q of parts) {
      if (x < q.box.x0 - within || x > q.box.x1 + within || z < q.box.z0 - within || z > q.box.z1 + within) continue;
      for (let i = 1; i < q.pts.length; i++) {
        const a = q.pts[i - 1], b = q.pts[i];
        const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
        const d = Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz)) - (q.half[i - 1] + (q.half[i] - q.half[i - 1]) * t);
        if (d < best) best = d;
      }
    }
    return best;
  };
  return { sdAt, parts };
}
