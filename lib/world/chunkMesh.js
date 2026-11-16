// Merged chunk geometry (roadmap task 11, slice 2; docs/world/streaming_runtime.md): turns a baked chunk (bake.js) into THREE meshes, however much is in it: the ground, the town roads and the
// highways (rings, spurs, links, causeways and the bridges). Each is one set of typed arrays (positions, indices and, for the ground, colours), so mounting a chunk is three draw calls and a
// few thousand triangles, not a thousand objects. Pure: no three.js here (the React layer makes a BufferGeometry from each set), so the geometry is tested in Node and is the same everywhere.
//
//   chunkMeshes(chunk) -> { ground, roads, highways }, each { positions: Float32Array (x y z), indices: Uint16Array|Uint32Array, colors?: Uint8Array (r g b), triangles }
//
// The ground is a grid of the chunk's land and beach cells (4 units) with the baked heights at the corners (so mountains rise and neighbouring chunks meet exactly); sea cells are left out. Roads
// are flat ribbons laid on the ground a hair above it, wider for an arterial; a bridge deck rises from the shore to `clearance` over the water and comes down at the other end. The widths and colours
// are the map's (the town's own roads keep their drawing in the game until the game mounts these).
import { BEACH, GROUND_CELLS, SKIRT } from './bake';

export const ROAD_WIDTH = { arterial: 3.2, local: 2.2, default: 2.2 };
export const LIFT = { road: 0.06, highway: 0.1 }; // how far above the ground a road lies, against z-fighting
export const BRIDGE_RAMP = 60; // units over which a deck rises from the shore to its full height, and comes back down
export const COLORS = { grass: [38, 78, 44], lush: [62, 104, 54], seabed: [58, 92, 104], beach: [226, 208, 150], rock: [118, 110, 98], peak: [206, 204, 196] };

const smooth = (t) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

/** A chunk's ground height at (x, z), by bilinear blending of its corner heights (0 where the chunk is flat or has no ground). */
export function groundHeight(chunk, x, z) {
  const g = chunk.ground;
  if (!g?.h) return 0;
  const n = g.n, cell = chunk.size / n, W = n + 3;
  const fx = Math.max(0, Math.min(n - 1e-9, (x - chunk.bounds.x0) / cell)), fz = Math.max(0, Math.min(n - 1e-9, (z - chunk.bounds.z0) / cell));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const h = (a, b) => g.h[(b + 1) * W + (a + 1)] / 100; // the grid has a ring beyond the chunk: index from -1
  return h(i, j) * (1 - u) * (1 - v) + h(i + 1, j) * u * (1 - v) + h(i, j + 1) * (1 - u) * v + h(i + 1, j + 1) * u * v;
}

/** The ground's colour at a vertex: grass that gets lusher then bare with height, rock on steep ground, pale on the peaks, sand on the beach, and a little noise so it is not flat. */
function groundColour(y, slope, beach, noise) {
  if (beach) return COLORS.beach.map((c) => c + noise);
  const mix = (a, b, t) => a.map((c, k) => c + (b[k] - c) * Math.max(0, Math.min(1, t)));
  let c = mix(COLORS.grass, COLORS.lush, y / 5);
  c = mix(c, COLORS.rock, (y - 6) / 5);
  c = mix(c, COLORS.peak, (y - 13) / 4);
  c = mix(c, COLORS.rock, (slope - 0.35) / 0.5); // steep ground is rock whatever its height
  return c.map((v) => v + noise);
}
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** A colour for ground with a coast near: beach sand within BEACH of the shore fading into land colour, and under the sea the sand going to a dark seabed over the shallows. */
function shoreColour(y, slope, sd, noise) {
  const mix = (a, b, t) => a.map((c, k) => c + (b[k] - c) * Math.max(0, Math.min(1, t)));
  if (sd < 0) return mix(COLORS.beach, COLORS.seabed, -sd / SKIRT).map((v) => v + noise);
  const land = groundColour(y, slope, false, 0);
  return mix(COLORS.beach, land, (sd - (BEACH - 6)) / 6).map((v) => v + noise); // all sand to 10 units in, then fading to land colour by 16
}

/**
 * Ground with a coast in it: the signed distance to the coast at every corner (`sd`, decimetres) is cut by marching squares at -SKIRT, so the edge of the mesh follows the true coast at a quarter of a
 * cell's accuracy, not a staircase of cells. Land corners keep their baked heights; under the sea the ground slopes down to -1.5 at the cut (the shallows), where a water plane at -0.3 meets it.
 */
function shoreGround(chunk) {
  const g = chunk.ground;
  const n = g.n, cell = chunk.size / n;
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  const SD = (i, j) => g.sd[j * (n + 1) + i] / 10;
  const H = (i, j) => (g.h ? g.h[(Math.max(-1, Math.min(n + 1, j)) + 1) * (n + 3) + (Math.max(-1, Math.min(n + 1, i)) + 1)] / 100 : 0);
  const heightAt = (i, j, sd) => (sd >= 0 ? H(i, j) : Math.max(-1.5, sd * 0.25));
  const slopeAt = (i, j) => (g.h ? Math.hypot((H(i + 1, j) - H(i - 1, j)) / (2 * cell), (H(i, j + 1) - H(i, j - 1)) / (2 * cell)) : 0);
  const push = (x, y, z, sd, nx, ny, nz, slope) => {
    const noise = (hash(x * 12.9898 + z * 78.233) - 0.5) * 8;
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    colors.push(...shoreColour(y, slope, sd, noise));
    return positions.length / 3 - 1;
  };
  const corner = new Map();
  const cornerVertex = (i, j) => {
    const key = j * (n + 1) + i;
    if (corner.has(key)) return corner.get(key);
    const sd = SD(i, j), y = heightAt(i, j, sd);
    let nx = 0, ny = 1, nz = 0;
    if (sd >= 0 && g.h) { const sx = (H(i + 1, j) - H(i - 1, j)) / (2 * cell), sz = (H(i, j + 1) - H(i, j - 1)) / (2 * cell), l = Math.hypot(sx, 1, sz); nx = -sx / l; ny = 1 / l; nz = -sz / l; }
    const id = push(chunk.bounds.x0 + i * cell, y, chunk.bounds.z0 + j * cell, sd, nx, ny, nz, sd >= 0 ? slopeAt(i, j) : 0);
    corner.set(key, id);
    return id;
  };
  const f = (sd) => sd + SKIRT; // >= 0 is kept
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      // the cell's corners in the order a (i, j), c (i, j+1), d (i+1, j+1), b (i+1, j): counter-clockwise seen from above
      const cs = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]].map(([a, b]) => ({ i: a, j: b, sd: SD(a, b) }));
      if (cs.every((c) => f(c.sd) < 0)) continue;
      if (cs.every((c) => f(c.sd) >= 0)) {
        const [a, c, d, b] = cs.map((v) => cornerVertex(v.i, v.j));
        indices.push(a, c, d, a, d, b);
        continue;
      }
      // clip the cell to the kept side of the cut (Sutherland-Hodgman on a convex quad)
      const poly = [];
      for (let k = 0; k < 4; k++) {
        const p = cs[k], q = cs[(k + 1) % 4];
        if (f(p.sd) >= 0) poly.push({ id: cornerVertex(p.i, p.j) });
        if ((f(p.sd) >= 0) !== (f(q.sd) >= 0)) {
          const t = f(p.sd) / (f(p.sd) - f(q.sd));
          const x = chunk.bounds.x0 + (p.i + (q.i - p.i) * t) * cell, z = chunk.bounds.z0 + (p.j + (q.j - p.j) * t) * cell;
          const sd = p.sd + (q.sd - p.sd) * t;
          poly.push({ id: push(x, heightAt(p.i, p.j, p.sd) + (heightAt(q.i, q.j, q.sd) - heightAt(p.i, p.j, p.sd)) * t, z, sd, 0, 1, 0, 0) });
        }
      }
      for (let k = 1; k + 1 < poly.length; k++) indices.push(poly[0].id, poly[k].id, poly[k + 1].id);
    }
  }
  const out = pack(positions, indices, colors.map((v) => Math.max(0, Math.min(255, Math.round(v)))));
  out.normals = Float32Array.from(normals);
  return out;
}

function ground(chunk) {
  const g = chunk.ground;
  if (!g) return empty();
  if (g.sd) return shoreGround(chunk); // a coast in it: cut smooth
  const n = g.n, cell = chunk.size / n;
  const positions = [];
  const colors = [];
  const indices = [];
  if (!g.h) {
    // flat ground: a run of cells of one kind along a row is one quad (a flat chunk is a few dozen triangles, not two thousand)
    const quad = (i0, i1, j, kind) => {
      const base = positions.length / 3;
      const x0 = chunk.bounds.x0 + i0 * cell, x1 = chunk.bounds.x0 + i1 * cell, z0 = chunk.bounds.z0 + j * cell, z1 = z0 + cell;
      positions.push(x0, 0, z0, x1, 0, z0, x0, 0, z1, x1, 0, z1);
      const c = groundColour(0, 0, kind === '2', 0);
      for (let k = 0; k < 4; k++) colors.push(...c);
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    };
    for (let j = 0; j < n; j++) {
      let i = 0;
      while (i < n) {
        const kind = g.mask[j * n + i];
        let e = i;
        while (e < n && g.mask[j * n + e] === kind) e++;
        if (kind !== '0') quad(i, e, j, kind);
        i = e;
      }
    }
    return pack(positions, indices, colors.map((v) => Math.max(0, Math.min(255, Math.round(v)))));
  }
  // ground with relief: every land cell, sharing its corner vertices, coloured by height and slope
  const index = new Map();
  const corner = [];
  const beach = [];
  const H = (i, j) => g.h[(Math.max(-1, Math.min(n + 1, j)) + 1) * (n + 3) + (Math.max(-1, Math.min(n + 1, i)) + 1)] / 100; // with the ring beyond the chunk
  const vertex = (i, j) => {
    const key = j * (n + 1) + i;
    if (!index.has(key)) {
      index.set(key, positions.length / 3);
      corner.push([i, j]);
      positions.push(chunk.bounds.x0 + i * cell, H(i, j), chunk.bounds.z0 + j * cell);
    }
    return index.get(key);
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const kind = g.mask[j * n + i];
      if (kind === '0') continue;
      const a = vertex(i, j), b = vertex(i + 1, j), c = vertex(i, j + 1), d = vertex(i + 1, j + 1);
      if (kind === '2') for (const v of [a, b, c, d]) beach[v] = true;
      indices.push(a, c, b, b, c, d); // counter-clockwise seen from above (+y), so the ground faces up
    }
  }
  const normals = [];
  for (let v = 0; v < corner.length; v++) {
    const [i, j] = corner[v];
    // the normal from the slope each way (central differences over the ring of heights beyond the chunk): the same on both sides of a chunk edge
    const sx = (H(i + 1, j) - H(i - 1, j)) / (2 * cell), sz = (H(i, j + 1) - H(i, j - 1)) / (2 * cell), nl = Math.hypot(sx, 1, sz);
    normals.push(-sx / nl, 1 / nl, -sz / nl);
    const slope = Math.hypot((H(i + 1, j) - H(i - 1, j)) / (2 * cell), (H(i, j + 1) - H(i, j - 1)) / (2 * cell));
    const noise = (hash(positions[v * 3] * 12.9898 + positions[v * 3 + 2] * 78.233) - 0.5) * 10; // by place on the map, so a vertex two chunks share has one colour
    colors.push(...groundColour(positions[v * 3 + 1], slope, beach[v], noise));
  }
  const out = pack(positions, indices, colors.map((v) => Math.max(0, Math.min(255, Math.round(v)))));
  out.normals = Float32Array.from(normals);
  return out;
}

const empty = () => ({ positions: new Float32Array(0), indices: new Uint16Array(0), triangles: 0 });
function pack(positions, indices, colors) {
  const big = positions.length / 3 > 65535;
  const out = { positions: Float32Array.from(positions), indices: big ? Uint32Array.from(indices) : Uint16Array.from(indices), triangles: indices.length / 3 };
  if (colors) out.colors = Uint8Array.from(colors);
  return out;
}

/** A flat ribbon along a-b, `w` wide, at heights ya and yb: two triangles, wound to face up. */
function ribbon(positions, indices, a, b, w, ya, yb) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  if (len < 1e-6) return;
  const nx = (-dz / len) * (w / 2), nz = (dx / len) * (w / 2);
  const base = positions.length / 3;
  positions.push(a.x + nx, ya, a.z + nz, a.x - nx, ya, a.z - nz, b.x + nx, yb, b.z + nz, b.x - nx, yb, b.z - nz);
  // counter-clockwise seen from above (+y): the triangles are wound so the ribbon faces up
  indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
}

/** A ribbon along a-b that follows the ground: cut into pieces of at most STEP units, each laid at the ground height `lift` above where it is (so a road over a mountain is on it, not under it). */
const STEP = 6;
function ribbonOn(positions, indices, chunk, a, b, w, lift) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(len / STEP));
  for (let k = 0; k < steps; k++) {
    const p0 = { x: a.x + ((b.x - a.x) * k) / steps, z: a.z + ((b.z - a.z) * k) / steps };
    const p1 = { x: a.x + ((b.x - a.x) * (k + 1)) / steps, z: a.z + ((b.z - a.z) * (k + 1)) / steps };
    ribbon(positions, indices, p0, p1, w, groundHeight(chunk, p0.x, p0.z) + lift, groundHeight(chunk, p1.x, p1.z) + lift);
  }
}

function roads(chunk) {
  const positions = [];
  const indices = [];
  for (const r of chunk.roads) ribbonOn(positions, indices, chunk, r.a, r.b, ROAD_WIDTH[r.class] ?? ROAD_WIDTH.default, LIFT.road);
  return pack(positions, indices);
}

// ---- the bridge as Kenney City Kit (Roads) models (docs/world/streaming_runtime.md, "The causeway bridge")
// `road-bridge.glb` is a 1 x 0.52 x 1 deck: the road runs along its Z (0.8 wide, rails to 1.0), its road surface is at y 0.51 and its underside at 0. `bridge-pillar-wide.glb` is a column 0.14 across
// and 0.5 tall, standing on y 0. A bridge is a row of deck tiles along the span, each tilted to the slope of the deck there, with a pair of pillars under it every PILLAR_EVERY units wherever the deck is
// high enough to need them (down to the shallows, FLOOR). The placements are plain data; the React layer turns them into instanced meshes (chunkObject.js).
export const BRIDGE = { tile: 8, depth: 5, surface: 0.51, pillarEvery: 32, pillarMinY: 3.5, pillarFoot: 9, pillarModelHeight: 0.5, floor: -1.5 };

/** The deck tiles and pillars of the bridge pieces in a chunk: { tiles: [{ x, y, z, yaw, pitch, length, width }], pillars: [{ x, z, y0, y1, foot }] }. `y` of a tile is its ROAD SURFACE. */
export function bridgePlacements(chunk) {
  const tiles = [];
  const pillars = [];
  for (const h of chunk.highways) {
    if (h.kind !== 'causeway-bridge') continue;
    const dx = h.b.x - h.a.x, dz = h.b.z - h.a.z, len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const ux = dx / len, uz = dz / len, yaw = Math.atan2(ux, uz);
    const at = (s) => { const t = (s - h.along[0]) / (h.along[1] - h.along[0]); return { x: h.a.x + dx * t, z: h.a.z + dz * t }; };
    // tiles at s = k * tile .. (k + 1) * tile over the whole bridge; a tile belongs to the piece its centre is in, so no tile is made twice
    for (let k = Math.floor(h.along[0] / BRIDGE.tile); k * BRIDGE.tile < h.along[1]; k++) {
      const s0 = k * BRIDGE.tile, s1 = Math.min(h.span, s0 + BRIDGE.tile);
      const c = (s0 + s1) / 2;
      if (c < h.along[0] || c >= h.along[1] || s1 - s0 < 1e-6) continue;
      const p = at(c);
      const lenTile = s1 - s0;
      const pitch = Math.atan2(deckHeight(h, Math.min(h.span, c + lenTile / 2)) - deckHeight(h, Math.max(0, c - lenTile / 2)), lenTile);
      tiles.push({ x: p.x, y: deckHeight(h, c), z: p.z, yaw, pitch, length: lenTile, width: h.width });
    }
    // pillars: a pair across the deck under every PILLAR_EVERY units where the road surface is high enough
    for (let k = Math.ceil(h.along[0] / BRIDGE.pillarEvery); k * BRIDGE.pillarEvery < h.along[1]; k++) {
      const s = k * BRIDGE.pillarEvery;
      if (s < h.along[0] || s >= h.along[1]) continue;
      const y = deckHeight(h, s);
      if (y < BRIDGE.pillarMinY) continue;
      const p = at(s);
      for (const side of [-1, 1]) pillars.push({ x: p.x + uz * side * h.width * 0.38, z: p.z - ux * side * h.width * 0.38, y0: BRIDGE.floor, y1: y - BRIDGE.surface * BRIDGE.depth + 0.15, foot: BRIDGE.pillarFoot });
    }
  }
  return { tiles, pillars };
}

/** The height of a bridge deck at a distance `s` along the bridge (h is the baked bridge piece: its clearance and the bridge's span): up from the shore over BRIDGE_RAMP units, and down at the far end. */
export const deckHeight = (h, s) => h.clearance * Math.min(smooth(s / BRIDGE_RAMP), smooth((h.span - s) / BRIDGE_RAMP));

function highways(chunk, bridges = 'ribbon') {
  const positions = [];
  const indices = [];
  for (const h of chunk.highways) {
    if (h.kind !== 'causeway-bridge') { ribbonOn(positions, indices, chunk, h.a, h.b, h.width, LIFT.highway); continue; }
    if (bridges === 'models') continue; // the deck is drawn from models (bridgePlacements), not as a ribbon
    // the deck: its height at a distance s along the bridge rises from the shore and comes back down, in 8-unit steps so the ramp is smooth
    const height = (s) => deckHeight(h, s);
    const len = Math.hypot(h.b.x - h.a.x, h.b.z - h.a.z);
    const steps = Math.max(1, Math.ceil(len / 8));
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps, t1 = (k + 1) / steps;
      const p0 = { x: h.a.x + (h.b.x - h.a.x) * t0, z: h.a.z + (h.b.z - h.a.z) * t0 };
      const p1 = { x: h.a.x + (h.b.x - h.a.x) * t1, z: h.a.z + (h.b.z - h.a.z) * t1 };
      ribbon(positions, indices, p0, p1, h.width, height(h.along[0] + (h.along[1] - h.along[0]) * t0) + LIFT.highway, height(h.along[0] + (h.along[1] - h.along[0]) * t1) + LIFT.highway);
    }
  }
  return pack(positions, indices);
}

/** `bridges`: 'ribbon' (the default: the deck is a flat ribbon in the highways mesh) or 'models' (the deck is left out: the caller draws bridgePlacements with the Kenney models). */
export function chunkMeshes(chunk, { bridges = 'ribbon' } = {}) {
  return { ground: ground(chunk), roads: roads(chunk), highways: highways(chunk, bridges) };
}

/** The triangles in a chunk's three meshes, and its draw calls (a mesh with no triangles is not drawn). */
export function meshCost(meshes) {
  const all = Object.values(meshes);
  return { triangles: all.reduce((s, m) => s + m.triangles, 0), drawCalls: all.filter((m) => m.triangles > 0).length };
}

export { GROUND_CELLS };
