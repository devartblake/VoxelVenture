// Merged chunk geometry (roadmap task 11, slice 2; docs/world/streaming_runtime.md): turns a baked chunk (bake.js) into THREE meshes, however much is in it: the ground, the town roads and the
// highways (rings, spurs, links, causeways and the bridges). Each is one set of typed arrays (positions, indices and, for the ground, colours), so mounting a chunk is three draw calls and a
// few thousand triangles, not a thousand objects. Pure: no three.js here (the React layer makes a BufferGeometry from each set), so the geometry is tested in Node and is the same everywhere.
//
//   chunkMeshes(chunk) -> { ground, roads, highways }, each { positions: Float32Array (x y z), indices: Uint16Array|Uint32Array, colors?: Uint8Array (r g b), triangles }
//
// The ground is a grid of the chunk's land and beach cells (4 units) with the baked heights at the corners (so mountains rise and neighbouring chunks meet exactly); sea cells are left out. Roads
// are flat ribbons laid on the ground a hair above it, wider for an arterial; a bridge deck rises from the shore to `clearance` over the water and comes down at the other end. The widths and colours
// are the map's (the town's own roads keep their drawing in the game until the game mounts these).
import { GROUND_CELLS } from './bake';

export const ROAD_WIDTH = { arterial: 3.2, local: 2.2, default: 2.2 };
export const LIFT = { road: 0.06, highway: 0.1 }; // how far above the ground a road lies, against z-fighting
export const BRIDGE_RAMP = 60; // units over which a deck rises from the shore to its full height, and comes back down
export const COLORS = { grass: [38, 78, 44], lush: [62, 104, 54], beach: [226, 208, 150], rock: [118, 110, 98], peak: [206, 204, 196] };

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

function ground(chunk) {
  const g = chunk.ground;
  if (!g) return empty();
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

function highways(chunk) {
  const positions = [];
  const indices = [];
  for (const h of chunk.highways) {
    if (h.kind !== 'causeway-bridge') { ribbonOn(positions, indices, chunk, h.a, h.b, h.width, LIFT.highway); continue; }
    // the deck: its height at a distance s along the bridge rises from the shore and comes back down, in 8-unit steps so the ramp is smooth
    const height = (s) => h.clearance * Math.min(smooth(s / BRIDGE_RAMP), smooth((h.span - s) / BRIDGE_RAMP));
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

export function chunkMeshes(chunk) {
  return { ground: ground(chunk), roads: roads(chunk), highways: highways(chunk) };
}

/** The triangles in a chunk's three meshes, and its draw calls (a mesh with no triangles is not drawn). */
export function meshCost(meshes) {
  const all = Object.values(meshes);
  return { triangles: all.reduce((s, m) => s + m.triangles, 0), drawCalls: all.filter((m) => m.triangles > 0).length };
}

export { GROUND_CELLS };
