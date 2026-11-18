// Harbor Town's own street shapes (docs/world/harbor_town.md): the city generator makes every town on the same plan (a grid of avenues and streets round a core, a county ring, a river drive), so Harbor Town's streets
// looked like the mainland's. Harbor Town is not live and has no lots drawn, so its baked streets can differ: a diagonal boulevard through a roundabout at the core, and a crescent either side of the grid. They are
// ADDED to the generator's streets (the town's plots and ids are untouched: `world.roads` is the generator's, `town.streets` is these); the bake splits any of them that meets a river into a bridge like the rest. Pure.
const ring = (cx, cz, r, n) => Array.from({ length: n + 1 }, (_, i) => ({ x: cx + Math.cos((i / n) * Math.PI * 2) * r, z: cz + Math.sin((i / n) * Math.PI * 2) * r }));

/** An arc from `p` to `q` bulging to `side` (+1 the left of p to q, -1 the right) by `sag` units, as n + 1 points. */
export function arcBetween(p, q, sag, side, n = 14) {
  const dx = q.x - p.x, dz = q.z - p.z, c = Math.hypot(dx, dz), R = (c * c / 4 + sag * sag) / (2 * sag);
  const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, nx = (-dz / c) * side, nz = (dx / c) * side; // the bulge side
  const ox = mx - nx * (R - sag), oz = mz - nz * (R - sag); // the circle's centre
  const a0 = Math.atan2(p.z - oz, p.x - ox), a1 = Math.atan2(q.z - oz, q.x - ox);
  let d = a1 - a0; // the way round that passes the bulge
  const mid = Math.atan2(mz + nz * sag - oz, mx + nx * sag - ox);
  const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
  if (Math.sign(wrap(mid - a0)) !== Math.sign(wrap(a1 - a0))) d = wrap(a1 - a0) > 0 ? wrap(a1 - a0) - Math.PI * 2 : wrap(a1 - a0) + Math.PI * 2; else d = wrap(a1 - a0);
  return Array.from({ length: n + 1 }, (_, i) => ({ x: ox + Math.cos(a0 + (d * i) / n) * R, z: oz + Math.sin(a0 + (d * i) / n) * R }));
}

export const HARBOR_STREETS = {
  boulevard: { name: 'Harbor Boulevard', class: 'arterial' }, // the county ring's north-east corner to its south-west one, through the core
  roundabout: { name: 'Harbor Circle', class: 'arterial', r: 12 },
  crescents: [
    { name: 'East Crescent', class: 'local', from: 0.2, to: 0.8, sag: 38, side: 1 }, // along the county ring's east side, bulging east
    { name: 'West Crescent', class: 'local', from: 0.2, to: 0.8, sag: 30, side: -1 },
  ],
};

/** The streets for a town's baked layout: `town` = { id, land, roads } (the generator's roads, to find the county ring). [{ id, name, kind, class, a, b }] (straight pieces, in order along each street). */
export function harborStreets(town) {
  const county = (id) => town.roads.find((r) => r.id === `${town.id}:county-${id}`);
  const n = county('north'), s = county('south'), w = county('west'), e = county('east');
  if (!n || !s || !w || !e) return [];
  const ne = { x: e.center, z: n.center }, sw = { x: w.center, z: s.center }, mid = { x: (ne.x + sw.x) / 2, z: (ne.z + sw.z) / 2 };
  const H = HARBOR_STREETS, out = [];
  const push = (id, name, kind, cls, pts) => pts.slice(1).forEach((q, i) => out.push({ id, name, kind, class: cls, a: { x: +pts[i].x.toFixed(2), z: +pts[i].z.toFixed(2) }, b: { x: +q.x.toFixed(2), z: +q.z.toFixed(2) } }));
  // the boulevard: two straight runs, the ring's corner to the roundabout and the roundabout to the other corner (the roundabout's edge is where it meets the circle)
  const dir = { x: sw.x - ne.x, z: sw.z - ne.z }, len = Math.hypot(dir.x, dir.z), u = { x: dir.x / len, z: dir.z / len }, r = H.roundabout.r;
  push(`${town.id}:boulevard`, H.boulevard.name, 'boulevard', H.boulevard.class, [ne, { x: mid.x - u.x * r, z: mid.z - u.z * r }]);
  push(`${town.id}:boulevard`, H.boulevard.name, 'boulevard', H.boulevard.class, [{ x: mid.x + u.x * r, z: mid.z + u.z * r }, sw]);
  push(`${town.id}:circle`, H.roundabout.name, 'roundabout', H.roundabout.class, ring(mid.x, mid.z, r, 28));
  // the crescents: an arc each side from a point a fifth of the way along the county ring's side to four fifths
  for (const c of H.crescents) {
    const east = c.side > 0, side = east ? e : w, z0 = side.from + (side.to - side.from) * c.from, z1 = side.from + (side.to - side.from) * c.to;
    push(`${town.id}:crescent-${east ? 'east' : 'west'}`, c.name, 'crescent', c.class, arcBetween({ x: side.center, z: z0 }, { x: side.center, z: z1 }, c.sag, east ? -1 : 1));
  }
  return out;
}
