// The world bake (roadmap task 10; docs/world/world_bake.md): the world recipe, built (buildWorld), cut into chunks of the map and written as plain data. Pure: no files, no randomness, the same
// recipe always gives the same bytes, so the output is checked in and a test fails if it drifts (tests/world-bake.test.mjs; `node scripts/bake-world.mjs --check`).
//
//   bakeWorld(world, { size })  -> { manifest, chunks: { [key]: chunk } }
//     manifest   what the world is: the landmasses (coast, features, ranges), the towns (origin, land, id range), the highways, the ocean, and an index of the chunks
//     chunk      one `size` x `size` square of the map, named `<cx>_<cz>` (cx = floor(x / size)): the plots whose centre is in it (id, place, size, facing, district), the roads, highways, causeways
//                and link roads cut at its edges, how much of it is land, and the ground grid (32 x 32 cells of land, beach or sea, with the height at each corner when the chunk is not flat)
//
// What a chunk does NOT hold is what a plot is: its building, owner and brand. That is still made from the town's seed by the generator, which the game and the server both run, so nothing here
// can disagree with them; the bake holds where things are. Merged geometry (the streaming runtime, roadmap task 11) will be added beside this data, not instead of it.
import { distToSegment, pointInPolygon } from './island';
import { elevationAt } from './shapes';
import { RIVER_SD, riverField } from './rivers';
import { RIVER_BRIDGE, spansAlong } from './riverBridge';

export const BAKE_FORMAT = 1;
export const CHUNK_SIZE = 128;
export const GROUND_CELLS = 32; // cells along a chunk's side: 4 units each
export const BEACH = 16; // a land cell this near the coast is beach
export const RIVER_BANK = 5; // a land cell this near a river's edge is sandy bank (the coast's beach is BEACH)
export const SD_CLAMP = 40; // the signed distance to the coast is kept to this many units either side
export const SKIRT = 6; // the ground runs on under the sea for this many units beyond the coast, sloping down: the shallows
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
  // a road that meets a river channel is split: the road, a `river-bridge` piece (a deck that rises over the channel: lib/world/riverBridge.js), the road (none in the first town land: the town has its own bridges)
  const riversField = world.rivers?.length ? riverField(world.rivers) : null;
  const town0 = world.towns[0]?.land;
  // (wet: the ground is under the water, which is where the channel's signed distance is under -1.1: a road that only grazes a bank is not on a bridge)
  const wetAt = (x, z) => (town0 && x >= town0.x0 && x <= town0.x1 && z >= town0.z0 && z <= town0.z1 ? Infinity : riversField.sdAt(x, z, 4) + 1.1);
  // a road as a path (a ring, a spur with its bend): the bridges are found along the whole path, so a corner in the channel does not split one
  const roadOverPath = (id, kind, cls, width, pts) => {
    const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.z - pts[i].z)), cum = [0];
    lens.forEach((l, i) => cum.push(cum[i] + l));
    const total = cum[cum.length - 1];
    const pointAt = (s) => { let i = 0; while (i < lens.length - 1 && s > cum[i + 1]) i++; const t = lens[i] ? Math.max(0, Math.min(1, (s - cum[i]) / lens[i])) : 0; return { x: r2(pts[i].x + (pts[i + 1].x - pts[i].x) * t), z: r2(pts[i].z + (pts[i + 1].z - pts[i].z) * t) }; };
    const spans = riversField ? spansAlong(total, (s) => { const p = pointAt(s); return wetAt(p.x, p.z) < 0; }) : [];
    for (let i = 0; i < lens.length; i++) {
      const e0 = cum[i], e1 = cum[i + 1];
      let s = e0;
      const hit = spans.filter((sp) => sp.s1 > e0 && sp.s0 < e1);
      for (const sp of hit) {
        const from = Math.max(e0, sp.s0), to = Math.min(e1, sp.s1);
        if (from > s + 0.01) road(id, kind, cls, width, s === e0 ? pts[i] : pointAt(s), pointAt(from));
        const A = from === e0 ? pts[i] : pointAt(from), B = to === e1 ? pts[i + 1] : pointAt(to), span = r2(sp.s1 - sp.s0), mid = pointAt((sp.c0 + sp.c1) / 2);
        for (const k of cut(A, B, size)) {
          const along = (p) => r2(from - sp.s0 + Math.hypot(p.x - A.x, p.z - A.z));
          at(k.cx, k.cz).highways.push({ id: `${riversField.idAt(mid.x, mid.z)}-bridge`, kind: 'river-bridge', on: id, class: cls, width, a: k.a, b: k.b, clearance: RIVER_BRIDGE.clearance, ramp: Math.min(RIVER_BRIDGE.ramp, span / 2), along: [along(k.a), along(k.b)], span, channel: [r2(sp.c0 - sp.s0), r2(sp.c1 - sp.s0)] });
        }
        s = to;
      }
      if (e1 > s + 0.01) road(id, kind, cls, width, s === e0 ? pts[i] : pointAt(s), pts[i + 1]);
    }
  };
  for (const h of world.highways) {
    roadOverPath(h.id, 'ring', h.class, h.width, [...h.ring, h.ring[0]]);
    for (const s of h.spurs) { // a spur is one straight road, or two legs with a bend (`via`) round a mountain
      const way = s.via ? [s.from, s.via, s.to] : [s.from, s.to];
      roadOverPath(`${h.id}:spur-${s.side}`, 'spur', h.class, h.width, way);
    }
  }
  for (const c of world.causeways) {
    road(c.id, 'causeway', c.class, c.width, c.points[0], c.bridge.from);
    // the bridge: each piece says how far along the bridge it starts and ends, so the deck can rise from the shore and come down again
    for (const k of cut(c.bridge.from, c.bridge.to, size)) {
      const along = (p) => r2(Math.hypot(p.x - c.bridge.from.x, p.z - c.bridge.from.z));
      at(k.cx, k.cz).highways.push({ id: c.id, kind: 'causeway-bridge', class: c.class, width: c.width, a: k.a, b: k.b, clearance: c.bridge.clearance, along: [along(k.a), along(k.b)], span: c.bridge.length });
    }
    road(c.id, 'causeway', c.class, c.width, c.bridge.to, c.points[1]);
  }
  for (const l of world.links ?? []) road(l.id, 'link', l.class, l.width, l.from, l.to);
  // the mangroves on a marsh's islands (the Black River's morass): small trees from the Racing Kit's set, a few to an island, placed by the island's own numbers so the same world has the same trees
  for (const r of world.rivers ?? []) {
    for (const il of r.islands ?? []) {
      if (!il.tree) continue;
      const count = Math.max(2, Math.round((il.r * il.r) / 3));
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2 + il.x, d = il.r * 0.55 * Math.sqrt(((k * 0.618 + il.z * 0.01) % 1 + 1) % 1);
        const x = r2(il.x + Math.cos(a) * d), z = r2(il.z + Math.sin(a) * d);
        const { cx, cz } = chunkAt(x, z, size);
        (at(cx, cz).props ??= []).push({ m: 'treeSmall', x, z, yaw: r2((a * 3) % (Math.PI * 2)), s: r2(2.2 + ((k * 0.37) % 1) * 1.2) });
      }
    }
  }
  // racing tracks: the circuit's centreline as a closed road (what a lap is timed along; not drawn), its painted surface (quads: asphalt, lines, kerbs, gravel, start line and grid) and every model placed
  // (barriers, grandstands, pits, gantry, trees...) in the chunk each stands in
  for (const t of world.tracks ?? []) {
    t.centreline.forEach((p, i) => road(t.id, 'track', 'track', t.width, p, t.centreline[(i + 1) % t.centreline.length]));
    for (const q of t.surface) { const { cx, cz } = chunkAt((q[1] + q[5]) / 2, (q[2] + q[6]) / 2, size); (at(cx, cz).surface ??= []).push(q); }
    for (const p of t.props) { const { cx, cz } = chunkAt(p.x, p.z, size); (at(cx, cz).props ??= []).push({ m: p.model, x: p.x, z: p.z, yaw: p.yaw, s: p.s }); }
  }

  // the ground: every chunk with any land (or any shore) in it gets a GROUND grid, GROUND_CELLS x GROUND_CELLS cells (4 units): which cells are land (1), beach (2, within BEACH of the coast) or sea (0);
  // the height at the corners and one ring beyond, in centimetres (left out when the chunk is flat); and, where the coast is near, the SIGNED DISTANCE to it at every corner in decimetres (positive
  // on land, negative at sea, clamped to +-SD_CLAMP), from which the mesh cuts a smooth shore and shades the beach. Neighbouring chunks share their edge corners, so the ground has no seam.
  const b = world.ocean;
  const cell = size / GROUND_CELLS;
  const coastDistance = (m, x, z) => { let best = Infinity; const pts = m.outline.points; for (let i = 0; i < pts.length; i++) best = Math.min(best, distToSegment({ x, z }, pts[i], pts[(i + 1) % pts.length])); return best; };
  const reach = world.landmasses.map((m) => ({ m, x0: m.bounds.x0 - SD_CLAMP - size, x1: m.bounds.x1 + SD_CLAMP + size, z0: m.bounds.z0 - SD_CLAMP - size, z1: m.bounds.z1 + SD_CLAMP + size }));
  // the rivers (rivers.js): a second coast. The signed distance is the smaller of the coast's and the river's (negative in the channel), so the shore, the channel and the banks come out of the same maths, through the first town's land too (the town's slab is cut for it)
  const rivers = world.rivers?.length ? riverField(world.rivers) : null; // (through the first town too: the town cuts its own trench for it, townWater.js)
  const riverRaw = (x, z) => (rivers ? rivers.sdAt(x, z, 4) : Infinity); // the true distance from the river's bank (negative in the channel)
  const riverSd = (x, z) => { const d = riverRaw(x, z); return Math.max(-SD_CLAMP, Math.min(SD_CLAMP, d < 0 ? d * RIVER_SD.depth : d * RIVER_SD.bank)); }; // stretched (rivers.js): a deeper bed, narrower banks
  const signed = (x, z) => {
    const m = landmassAt(x, z);
    if (m) return Math.min(SD_CLAMP, coastDistance(m, x, z), riverSd(x, z));
    let best = SD_CLAMP;
    for (const r of reach) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) best = Math.min(best, coastDistance(r.m, x, z));
    return -best;
  };
  for (let cx = Math.floor(b.x0 / size); cx <= Math.floor(b.x1 / size); cx++) {
    for (let cz = Math.floor(b.z0 / size); cz <= Math.floor(b.z1 / size); cz++) {
      const x0 = cx * size, z0 = cz * size;
      if (!reach.some((r) => x0 + size >= r.x0 && x0 <= r.x1 && z0 + size >= r.z0 && z0 <= r.z1)) continue; // open sea, far from every coast
      let mask = '';
      let land = 0;
      for (let j = 0; j < GROUND_CELLS; j++) for (let i = 0; i < GROUND_CELLS; i++) {
        const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell;
        const m = landmassAt(x, z);
        const rs = m ? riverRaw(x, z) : Infinity;
        const v = !m || rs < 0 ? '0' : coastDistance(m, x, z) < BEACH || rs < RIVER_BANK ? '2' : '1';
        if (v !== '0') land++;
        mask += v;
      }
      // the signed distance at the corners, when the coast is near enough to matter
      const sd = [];
      let lo = Infinity;
      let hi = -Infinity;
      for (let j = 0; j <= GROUND_CELLS; j++) for (let i = 0; i <= GROUND_CELLS; i++) { const d = signed(x0 + i * cell, z0 + j * cell); sd.push(Math.round(d * 10)); lo = Math.min(lo, d); hi = Math.max(hi, d); }
      const key = chunkKey(cx, cz);
      const shore = hi >= -SKIRT && lo < BEACH + 8; // some of the ground (land or the shallows beyond the coast) is here, with a coast near
      if (!land && !chunks[key] && !shore) continue;
      const ch = at(cx, cz);
      ch.land = r2(land / (GROUND_CELLS * GROUND_CELLS));
      if (land || shore) {
        const h = [];
        // (GROUND_CELLS + 3)^2 heights: the corners and one ring beyond them (i, j from -1 to GROUND_CELLS + 1), so a normal at the edge of a chunk is worked out from the same numbers as in the next chunk
        for (let j = -1; j <= GROUND_CELLS + 1; j++) for (let i = -1; i <= GROUND_CELLS + 1; i++) h.push(Math.round(heightAt(x0 + i * cell, z0 + j * cell) * 100));
        ch.ground = { n: GROUND_CELLS, mask, ...(shore ? { sd } : {}), ...(h.some((v) => v > 0) ? { h } : {}) };
      }
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
    if (ch.surface) ch.surface.sort((u, v) => u[1] - v[1] || u[2] - v[2] || u[0] - v[0]);
    if (ch.props) ch.props.sort((u, v) => (u.m < v.m ? -1 : u.m > v.m ? 1 : u.x - v.x || u.z - v.z));
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
    towns: world.towns.map((t) => ({ id: t.id, index: t.index, name: t.name, seed: t.seed, landmass: t.landmass, live: t.live, vacant: Boolean(t.vacant), built: t.plots.filter((p) => p.buildingType).length, origin: t.origin, land: t.land, rivers: (t.city.layout.rivers ?? []).map((r) => ({ id: r.id, name: r.name, axis: r.axis, x0: r2(r.x0 + t.origin.x), x1: r2(r.x1 + t.origin.x), z0: r2(r.z0 + t.origin.z), z1: r2(r.z1 + t.origin.z) })), plots: { count: t.plots.length, firstId: Math.min(...t.plots.map((p) => p.id)), lastId: Math.max(...t.plots.map((p) => p.id)) } })),
    highways: world.highways.map((h) => ({ id: h.id, name: h.name, landmass: h.landmass, length: h.length, spurs: h.spurs.length, maxGround: h.maxGround })),
    causeways: world.causeways.map((c) => ({ id: c.id, name: c.name, length: c.length, bridge: c.bridge.length, clearance: c.bridge.clearance, points: c.points, span: { from: c.bridge.from, to: c.bridge.to } })),
    tracks: (world.tracks ?? []).map((t) => ({ id: t.id, name: t.name, landmass: t.landmass, shape: t.shape, osmWay: t.osmWay, length: t.length, width: t.width, scale: t.scale, start: t.start, checkpoints: t.checkpoints, bounds: t.bounds, quads: t.surface.length, props: t.props.length })),
    links: (world.links ?? []).map((l) => ({ id: l.id, name: l.name, kind: l.kind, length: l.length })),
    rivers: (world.rivers ?? []).map((r) => ({ id: r.id, name: r.name, coast: r.coast, kind: r.kind, length: r.length, fall: r.fall, width: r.width, ...(r.townT ? { townT: r.townT, townWidth: r.townWidth } : {}), course: r.course, crosses: r.crosses, ...(r.islands?.length ? { islands: r.islands } : {}) })),
    chunks: keys.map((k) => { const ch = ordered[k]; return { key: k, cx: ch.cx, cz: ch.cz, land: ch.land, plots: ch.plots.length, roads: ch.roads.length, highways: ch.highways.length, ...(ch.props ? { props: ch.props.length } : {}), ...(ch.surface ? { surface: ch.surface.length } : {}), ...(ch.ground?.h ? { heights: true } : {}) }; }),
    totals: { plots: world.plots.length, townRoads: world.roads.length },
  };
  return { manifest, chunks: ordered };
}
