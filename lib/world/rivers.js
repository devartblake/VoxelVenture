// The rivers of the world (docs/world/river_plan.md): the plan (lib/world/riverPlan.js) for the rivers the recipe turns on, and the field the bake cuts them into the ground with. A river is a second COAST: the ground
// has a signed distance to the nearest shore at every corner (lib/world/bake.js, positive on land), and a river is the distance to its course less its half width, so the shore is the bank, the channel is the sea and the
// meshes (lib/world/chunkMesh.js), the terrain (lib/world/terrain.js: a boat sails where the sea is deep enough) and the sea's plane at the datum's sea level all work as they do for a coast. Through the first town the town's
// own slab is cut for it (lib/world/townWater.js): its trench and the baked channel are the same river. Pure (no three.js).
import { crossing, planRivers, widthAt } from './riverPlan';
import { planIsleWaters } from './isleWaters';

/** How a river's signed distance is stretched when it is cut into the ground (the coast's own is not): the channel is deeper (a river bed is steeper than a beach) and the banks narrower than a coast's beach. */
export const RIVER_SD = { depth: 1.6, bank: 1.6 };

/** How many islands a kind of river has in its lower reaches: the Black River's morasses are marsh and mangrove (many), a gravel delta has a few bars, the rest none. */
export const ISLANDS = { delta: { marsh: 11, bars: 4 }, range: [0.45, 0.84], radius: [2.2, 4.8], lagoon: { count: 14, range: [0.04, 0.4], radius: [2.4, 5.4] } }; // (the lagoon's: the mangrove islands in its pool, Harbor Isle)

const hashOf = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const mulberry = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/**
 * The islands of a delta: round patches of land in the channel of a river's lower reaches (the Black River's mangrove islands in its morass, the gravel bars of the Hope and the Yallahs), seeded by the river's
 * id so the same world has the same islands. [{ x, z, r, tree }]: `tree` says whether mangroves grow on it (the marsh's islands do; a gravel bar does not).
 */
export function deltaIslands(river) {
  if (river.kind !== 'delta' && river.kind !== 'lagoon') return [];
  const lagoon = river.kind === 'lagoon', marsh = lagoon || river.id === 'black-river';
  const count = lagoon ? ISLANDS.lagoon.count : marsh ? ISLANDS.delta.marsh : ISLANDS.delta.bars, range = lagoon ? ISLANDS.lagoon.range : ISLANDS.range, rad = lagoon ? ISLANDS.lagoon.radius : ISLANDS.radius;
  const rnd = mulberry(hashOf(river.id) + 7), pts = river.course, out = [];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const total = cum[cum.length - 1];
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const t = range[0] + rnd() * (range[1] - range[0]);
    const s = t * total;
    let i = 1;
    while (i < pts.length - 1 && cum[i] < s) i++;
    const a = pts[i - 1], b = pts[i], u = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const half = widthAt({ length: river.length, kind: river.kind, townT: river.townT, townWidth: river.townWidth }, t) / 2;
    const lateral = (rnd() - 0.5) * 2 * half * 0.5, r = rad[0] + rnd() * (rad[1] - rad[0]);
    const x = a.x + dx * u + (-dz / l) * lateral, z = a.z + dz * u + (dx / l) * lateral;
    if (r > half * 0.5) continue; // an island leaves room for the water on both sides
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 3)) continue;
    out.push({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, r: Math.round(r * 100) / 100, tree: marsh });
  }
  return out;
}

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

/** The river plan (lib/world/riverPlan.js) for a built world: the landmasses, the highways, the first town's river. Made once for a world. */
const plans = new WeakMap();
export function planOf(world) {
  if (plans.has(world)) return plans.get(world);
  const manifest = { landmasses: world.landmasses.filter((l) => l.features).map((l) => ({ id: l.id, features: l.features, coast: { points: l.outline.points } })) };
  const first = world.towns[0];
  const rivers = first?.city?.layout?.rivers ?? [];
  const townRiver = rivers[0] ? { x0: rivers[0].x0 + first.origin.x, x1: rivers[0].x1 + first.origin.x, z0: rivers[0].z0 + first.origin.z, z1: rivers[0].z1 + first.origin.z } : null;
  const plan = planRivers({ manifest, highways: highwaySegments(world), townRiver });
  // Harbor Isle's water (the lagoon and the canal estate), clear of the island's town, and the highways each crosses (each is a bridge)
  const isle = planIsleWaters({ manifest, avoid: world.towns.filter((t) => t.landmass === 'harbor-isle' && t.land).map((t) => t.land), widthAt });
  const highways = highwaySegments(world);
  for (const w of isle.waters) for (const h of highways) for (let i = 1; i < w.course.length; i++) { const c = crossing(w.course[i - 1], w.course[i], h.a, h.b); if (c) { w.crosses.push({ highway: h.id, kind: h.kind, x: +c.x.toFixed(1), z: +c.z.toFixed(1) }); break; } }
  plan.isleWaters = isle.waters;
  plan.problems.push(...isle.problems);
  if (plan.problems.length) throw new Error(`the river plan is not valid: ${plan.problems.join('; ')}`);
  plans.set(world, plan);
  return plan;
}

/** The plan for the rivers a recipe turns on (`ids`, from recipe.rivers), for a built world: [] when none. */
export function buildRivers(world, ids = []) {
  if (!ids.length) return [];
  const plan = planOf(world);
  return [...plan.rivers, ...(plan.isleWaters ?? [])].filter((r) => ids.includes(r.id)).map((r) => ({
    id: r.id, name: r.name, coast: r.coast, kind: r.kind, length: r.length, fall: r.fall, width: r.width, ...(r.townT ? { townT: r.townT, townWidth: r.townWidth } : {}),
    course: r.course.map((p) => ({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 })),
    crosses: r.crosses,
  })).map((r) => ({ ...r, islands: deltaIslands(r) }));
}

/** The river field: sdAt(x, z) is the signed distance from the nearest river's bank (negative in the channel, positive outside, Infinity when no river is near), nothing inside `skip` (a rectangle: the first town's land). */
export function riverField(rivers, skip = null) {
  const parts = rivers.map((r) => {
    const islands = r.islands ?? [];
    const pts = r.course, cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const total = cum[cum.length - 1] || 1;
    const half = pts.map((_, i) => widthAt({ length: r.length, kind: r.kind, townT: r.townT, townWidth: r.townWidth }, cum[i] / total) / 2);
    const reach = Math.max(...half) + 2 + 6;
    const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
    return { r, pts, half, reach, islands, box: { x0: Math.min(...xs) - reach, x1: Math.max(...xs) + reach, z0: Math.min(...zs) - reach, z1: Math.max(...zs) + reach } };
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
      // the islands of a delta: inside one the distance is positive (it is land), and round it the bank slopes up out of the channel
      for (const o of q.islands) { const di = Math.hypot(x - o.x, z - o.z) - o.r; if (di < 6) best = Math.max(best, Math.min(-di, best + (q.r.kind === 'lagoon' ? 30 : 8))); } // (the lagoon's pool is wide and deep: its islands rise from further down)
    }
    return best;
  };
  /** The id of the river nearest (x, z). */
  const idAt = (x, z) => {
    let best = Infinity, id = null;
    for (const q of parts) for (let i = 1; i < q.pts.length; i++) {
      const a = q.pts[i - 1], b = q.pts[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
      const d = Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz)) - (q.half[i - 1] + (q.half[i] - q.half[i - 1]) * t);
      if (d < best) { best = d; id = q.r.id; }
    }
    return id;
  };
  return { sdAt, idAt, parts };
}
