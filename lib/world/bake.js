// The world bake (roadmap task 10; docs/world/world_bake.md): the world recipe, built (buildWorld), cut into chunks of the map and written as plain data. Pure: no files, no randomness, the same
// recipe always gives the same bytes, so the output is checked in and a test fails if it drifts (tests/world-bake.test.mjs; `node scripts/bake-world.mjs --check`).
//
//   bakeWorld(world, { size })  -> { manifest, chunks: { [key]: chunk } }
//     manifest   what the world is: the landmasses (coast, features, ranges), the towns (origin, land, id range), the highways, the ocean, and an index of the chunks
//     chunk      one `size` x `size` square of the map, named `<cx>_<cz>` (cx = floor(x / size)): the plots whose centre is in it (id, place, size, facing, district), the roads, highways, causeways
//                and link roads cut at its edges, how much of it is land, and the ground heights on a 5 x 5 grid (when there are hills or mountains)
//
// What a chunk does NOT hold is what a plot is: its building, owner and brand. That is still made from the town's seed by the generator, which the game and the server both run, so nothing here
// can disagree with them; the bake holds where things are. Merged geometry (the streaming runtime, roadmap task 11) will be added beside this data, not instead of it.
import { pointInPolygon } from './island';
import { elevationAt } from './shapes';

export const BAKE_FORMAT = 1;
export const CHUNK_SIZE = 128;
const r2 = (n) => Math.round(n * 100) / 100;
export const chunkKey = (cx, cz) => `${cx}_${cz}`;
export const chunkAt = (x, z, size = CHUNK_SIZE) => ({ cx: Math.floor(x / size), cz: Math.floor(z / size) });

/** The part of the segment a-b inside the box, or null (Liang-Barsky). The box's far edges belong to the next chunk, so a segment ending exactly on one is not in this chunk. */
export function clipSegment(a, b, x0, z0, x1, z1) {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const [p, q] of [[-dx, a.x - x0], [dx, x1 - a.x], [-dz, a.z - z0], [dz, z1 - a.z]]) {
    if (p === 0) { if (q < 0) return null; } else {
      const t = q / p;
      if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
  }
  if (t1 - t0 < 1e-9) return null;
  return { a: { x: r2(a.x + dx * t0), z: r2(a.z + dz * t0) }, b: { x: r2(a.x + dx * t1), z: r2(a.z + dz * t1) } };
}

/** Every chunk a segment passes through, with the piece of it in each. */
function cut(a, b, size) {
  const out = [];
  const c0 = chunkAt(Math.min(a.x, b.x), Math.min(a.z, b.z), size);
  const c1 = chunkAt(Math.max(a.x, b.x), Math.max(a.z, b.z), size);
  for (let cx = c0.cx; cx <= c1.cx; cx++) for (let cz = c0.cz; cz <= c1.cz; cz++) {
    const piece = clipSegment(a, b, cx * size, cz * size, (cx + 1) * size, (cz + 1) * size);
    if (piece) out.push({ cx, cz, ...piece });
  }
  return out;
}

export function bakeWorld(world, { size = CHUNK_SIZE } = {}) {
  const chunks = {};
  const at = (cx, cz) => (chunks[chunkKey(cx, cz)] ??= { cx, cz, size, bounds: { x0: cx * size, z0: cz * size, x1: (cx + 1) * size, z1: (cz + 1) * size }, land: 0, plots: [], roads: [], highways: [] });

  // the ground: which landmass a point is on, and its height there
  const landmassAt = (x, z) => world.landmasses.find((m) => x >= m.bounds.x0 && x <= m.bounds.x1 && z >= m.bounds.z0 && z <= m.bounds.z1 && pointInPolygon(x, z, m.outline.points));
  const heightAt = (x, z) => { const m = landmassAt(x, z); return m && m.features.ranges ? elevationAt(m.features.ranges, x, z, m.spec.coast.seed) : 0; };

  for (const t of world.towns) {
    for (const p of t.plots) {
      const { cx, cz } = chunkAt(p.x, p.z, size);
      // `built`: the generator puts a business of the city's own on this lot (a vacant town has none, but an admin building)
      at(cx, cz).plots.push({ id: p.id, x: p.x, z: p.z, w: p.w, d: p.d, facing: p.facing, district: p.districtId, town: t.id, built: Boolean(p.buildingType) });
    }
    for (const r of t.roads) {
      const a = r.axis === 'x' ? { x: r.from, z: r.center } : { x: r.center, z: r.from };
      const b = r.axis === 'x' ? { x: r.to, z: r.center } : { x: r.center, z: r.to };
      for (const c of cut(a, b, size)) at(c.cx, c.cz).roads.push({ id: r.id, town: t.id, class: r.class, kind: r.kind, a: c.a, b: c.b });
    }
  }
  // highways: the rings (a closed line), their spurs, the causeways (with the bridge marked) and the link roads
  const road = (id, kind, cls, width, a, b, extra = {}) => { for (const c of cut(a, b, size)) at(c.cx, c.cz).highways.push({ id, kind, class: cls, width, a: c.a, b: c.b, ...extra }); };
  for (const h of world.highways) {
    h.ring.forEach((p, i) => road(h.id, 'ring', h.class, h.width, p, h.ring[(i + 1) % h.ring.length]));
    h.spurs.forEach((s, i) => road(`${h.id}:spur-${s.side}`, 'spur', h.class, h.width, s.from, s.to));
  }
  for (const c of world.causeways) {
    road(c.id, 'causeway', c.class, c.width, c.points[0], c.bridge.from);
    road(c.id, 'causeway-bridge', c.class, c.width, c.bridge.from, c.bridge.to, { clearance: c.bridge.clearance });
    road(c.id, 'causeway', c.class, c.width, c.bridge.to, c.points[1]);
  }
  for (const l of world.links ?? []) road(l.id, 'link', l.class, l.width, l.from, l.to);

  // the ground: every chunk with any land in it (a 5 x 5 sample), its land share and its heights
  const b = world.ocean;
  for (let cx = Math.floor(b.x0 / size); cx <= Math.floor(b.x1 / size); cx++) {
    for (let cz = Math.floor(b.z0 / size); cz <= Math.floor(b.z1 / size); cz++) {
      let land = 0;
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (landmassAt(cx * size + (size * (i + 0.5)) / 5, cz * size + (size * (j + 0.5)) / 5)) land++;
      const key = chunkKey(cx, cz);
      if (!land && !chunks[key]) continue;
      const ch = at(cx, cz);
      ch.land = r2(land / 25);
      const v = [];
      for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) v.push(r2(heightAt(cx * size + (size * i) / 4, cz * size + (size * j) / 4)));
      if (v.some((h) => h > 0)) ch.heights = { n: 5, v };
    }
  }

  // a fixed order, so the same world is the same bytes
  const keys = Object.keys(chunks).sort((u, v) => { const a = chunks[u], c = chunks[v]; return a.cx - c.cx || a.cz - c.cz; });
  const ordered = {};
  for (const k of keys) {
    const ch = chunks[k];
    ch.plots.sort((u, v) => u.id - v.id);
    ch.roads.sort((u, v) => (u.id < v.id ? -1 : u.id > v.id ? 1 : u.a.x - v.a.x || u.a.z - v.a.z));
    ch.highways.sort((u, v) => (u.id < v.id ? -1 : u.id > v.id ? 1 : u.a.x - v.a.x || u.a.z - v.a.z));
    ordered[k] = ch;
  }

  const manifest = {
    format: BAKE_FORMAT,
    world: { name: world.recipe.name, recipeVersion: world.recipe.version },
    chunk: { size, count: keys.length, files: 'chunks/<cx>_<cz>.json' },
    ocean: world.ocean,
    landmasses: world.landmasses.map((m) => ({
      id: m.id, name: m.name, towns: m.towns, centre: m.centre, bounds: m.bounds, area: m.area, coast: { template: m.outline.template ?? null, points: m.outline.points },
      features: {
        harbour: m.features.harbour ? { at: m.features.harbour.at, out: m.features.harbour.out, quay: m.features.harbour.quay, piers: m.features.harbour.piers } : null,
        headlands: m.features.headlands ?? [],
        airstrip: m.features.airstrip ? { name: m.features.airstrip.name, at: m.features.airstrip.at, length: m.features.airstrip.length, width: m.features.airstrip.width, heading: m.features.airstrip.heading, side: m.features.airstrip.side } : null,
        ranges: (m.features.ranges ?? []).map((rg) => ({ name: rg.name, width: rg.width, height: rg.height, points: rg.points })),
      },
    })),
    towns: world.towns.map((t) => ({ id: t.id, index: t.index, name: t.name, seed: t.seed, landmass: t.landmass, live: t.live, vacant: Boolean(t.vacant), built: t.plots.filter((p) => p.buildingType).length, origin: t.origin, land: t.land, plots: { count: t.plots.length, firstId: Math.min(...t.plots.map((p) => p.id)), lastId: Math.max(...t.plots.map((p) => p.id)) } })),
    highways: world.highways.map((h) => ({ id: h.id, name: h.name, landmass: h.landmass, length: h.length, spurs: h.spurs.length, maxGround: h.maxGround })),
    causeways: world.causeways.map((c) => ({ id: c.id, name: c.name, length: c.length, bridge: c.bridge.length, clearance: c.bridge.clearance })),
    links: (world.links ?? []).map((l) => ({ id: l.id, name: l.name, kind: l.kind, length: l.length })),
    chunks: keys.map((k) => { const ch = ordered[k]; return { key: k, cx: ch.cx, cz: ch.cz, land: ch.land, plots: ch.plots.length, roads: ch.roads.length, highways: ch.highways.length, ...(ch.heights ? { heights: true } : {}) }; }),
    totals: { plots: world.plots.length, townRoads: world.roads.length },
  };
  return { manifest, chunks: ordered };
}
