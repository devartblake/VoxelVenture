// Harbor Isle's water (docs/world/isle_waters.md): the island has no rivers (Grand Cayman has no permanent surface water), so its water is the kind Grand Cayman really has: the **North Sound lagoon** (a long,
// shallow channel from the sound's head into the island, widening to a pool with mangrove islands in it, a fringe of mangroves along its banks) and the **canals** of a canal estate cut from the south coast (straight
// dead-end fingers, each crossed by the coast road on a bridge). Each is made the shape of a river (a course from its source, the inland end, to its mouth on the coast, a kind, a length, a width) so the field, the
// ground, the water, the bridges and the boats treat it as they treat the mainland's rivers (lib/world/rivers.js). The positions are found from the coast and what is on the land (the town, the airstrip, the harbour),
// not typed in, so they follow the island if its coast moves. Pure (no three.js).
import { inside, lengthOf, nearestOnCoast, smoothCurve } from './riverPlan';

export const ISLE_WATERS = {
  lagoon: { id: 'harbor-lagoon', name: 'The North Sound Lagoon', kind: 'lagoon', head: { x: 2470, z: 20 }, reach: 150, bend: 24, poolAt: 0.15 }, // (reach: the east spur road runs across at z = 219, the pool ends well short of it)
  canals: { count: 5, from: { x: 1870, z: 690 }, spacing: 70, length: 105, kind: 'canal', width: 9, names: ['Cutlass Canal', 'Anchor Canal', 'Pelican Canal', 'Mariner Canal', 'Heron Canal'] },
  clear: 46, // the water keeps this far from the town's land, the airstrip and the harbour's piers
  fringe: { every: 9, offset: 2.6, to: 0.72 }, // mangroves along the lagoon's banks: spacing, how far past the water's edge, how much of the lagoon (from the pool towards the sound)
};

export const ISLE_WATER_IDS = [ISLE_WATERS.lagoon.id, ...ISLE_WATERS.canals.names.map((n) => n.toLowerCase().replace(/ /g, '-'))];

const rectNear = (r, x, z, m) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;

/**
 * The island's waters for a manifest-shaped world: { landmasses: [{ id, features, coast: { points } }], avoid: [{ x0, x1, z0, z1 }] (the town's land) }. Returns { waters: [river-shaped objects], problems }.
 * A water: { id, name, coast: 'isle', kind, length, fall: 0, width: { source, mid, mouth }, course: [{ x, z }] (source to mouth), crosses: [] }.
 */
export function planIsleWaters({ manifest, avoid = [], widthAt }) {
  const isle = manifest.landmasses.find((l) => l.id === 'harbor-isle');
  if (!isle) return { waters: [], problems: [] };
  const coast = isle.coast.points, problems = [];
  const keepOut = [...avoid];
  const strip = isle.features?.airstrip;
  if (strip) keepOut.push({ x0: strip.at.x - strip.length / 2 - 20, x1: strip.at.x + strip.length / 2 + 20, z0: strip.at.z - 30, z1: strip.at.z + 30 });
  const free = (x, z) => inside(coast, x, z) && !keepOut.some((r) => rectNear(r, x, z, ISLE_WATERS.clear)) && !(isle.features?.harbour?.piers ?? []).some((p) => Math.hypot(x - p.x, z - p.z) < ISLE_WATERS.clear + 30);
  const waters = [];

  // the lagoon: from the sound's head, inland and a little to the side, to a pool
  const L = ISLE_WATERS.lagoon, head = nearestOnCoast(coast, L.head.x, L.head.z);
  const inward = { x: -0.14, z: 1 }, il = Math.hypot(inward.x, inward.z), ux = inward.x / il, uz = inward.z / il;
  const at = (s, side = 0) => ({ x: head.x + ux * s + -uz * side, z: head.z + uz * s + ux * side });
  const pts = [at(L.reach, -L.bend * 0.4), at(L.reach * 0.62, L.bend), at(L.reach * 0.3, -L.bend * 0.5), at(0, 0)];
  const course = smoothCurve(pts, 8);
  const lagoon = made(L.id, L.name, 'lagoon', course, widthAt);
  if (course.some((p, i) => i < course.length - 3 && !free(p.x, p.z))) problems.push(`${L.name}: its course is not on free land`);
  waters.push(lagoon);

  // the canals: fingers inland from the south coast, side by side
  const C = ISLE_WATERS.canals;
  for (let k = 0; k < C.count; k++) {
    const mouth = nearestOnCoast(coast, C.from.x + k * C.spacing, C.from.z);
    const name = C.names[k], id = name.toLowerCase().replace(/ /g, '-');
    const inner = { x: mouth.x + (k - 2) * 2.5, z: mouth.z - C.length }; // (a little fanned, so they are not a comb)
    const cp = smoothCurve([inner, { x: (inner.x + mouth.x) / 2, z: (inner.z + mouth.z) / 2 }, { x: mouth.x, z: mouth.z }], 8);
    if (cp.some((p, i) => i < cp.length - 4 && !free(p.x, p.z))) problems.push(`${name}: its course is not on free land`);
    waters.push(made(id, name, 'canal', cp, widthAt));
  }
  return { waters, problems };
}

function made(id, name, kind, course, widthAt) {
  const w = { id, name, coast: 'isle', kind, length: Math.round(lengthOf(course)), fall: 0, course, crosses: [] };
  w.width = { source: +widthAt(w, 0).toFixed(1), mid: +widthAt(w, 0.5).toFixed(1), mouth: +widthAt(w, 1).toFixed(1) };
  return w;
}

/**
 * The mangroves along the lagoon's banks: trees every `fringe.every` units on both sides, `fringe.offset` past the water's edge, from the pool (t = 0) to `fringe.to` of the way to the sound (the road and the
 * bridges are near the mouth). `widthAt` is riverPlan's. [{ x, z, s }] (s: the tree's scale, from the position, so the same world has the same trees).
 */
export function lagoonFringe(river, widthAt) {
  if (river.kind !== 'lagoon') return [];
  const pts = river.course, cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const total = cum[cum.length - 1], F = ISLE_WATERS.fringe, out = [];
  for (let s = 6, j = 1; s <= total * F.to; s += F.every) {
    while (j < pts.length - 1 && cum[j] < s) j++;
    const a = pts[j - 1], b = pts[j], u = (s - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1), dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const half = widthAt({ length: river.length, kind: river.kind }, s / total) / 2;
    for (const side of [-1, 1]) {
      const jitter = ((Math.sin(s * 12.9898 + side * 78.233) * 43758.5453) % 1 + 1) % 1;
      const off = side * (half + F.offset + jitter * 2.2);
      out.push({ x: Math.round((a.x + dx * u + (-dz / l) * off) * 100) / 100, z: Math.round((a.z + dz * u + (dx / l) * off) * 100) / 100, s: Math.round((2 + jitter * 1.4) * 100) / 100 });
    }
  }
  return out;
}
