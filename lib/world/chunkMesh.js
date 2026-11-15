// Merged chunk geometry (roadmap task 11, slice 2; docs/world/streaming_runtime.md): turns a baked chunk (bake.js) into THREE meshes, however much is in it: the ground, the town roads and the
// highways (rings, spurs, links, causeways and the bridges). Each is one set of typed arrays (positions, indices and, for the ground, colours), so mounting a chunk is three draw calls and a
// few thousand triangles, not a thousand objects. Pure: no three.js here (the React layer makes a BufferGeometry from each set), so the geometry is tested in Node and is the same everywhere.
//
//   chunkMeshes(chunk) -> { ground, roads, highways }, each { positions: Float32Array (x y z), indices: Uint16Array|Uint32Array, colors?: Uint8Array (r g b), triangles }
//
// The ground is a grid of the chunk's land and beach cells (8 units) with the baked heights at the corners (so mountains rise and neighbouring chunks meet exactly); sea cells are left out. Roads
// are flat ribbons laid on the ground a hair above it, wider for an arterial; a bridge deck rises from the shore to `clearance` over the water and comes down at the other end. The widths and colours
// are the map's (the town's own roads keep their drawing in the game until the game mounts these).
import { GROUND_CELLS } from './bake';

export const ROAD_WIDTH = { arterial: 3.2, local: 2.2, default: 2.2 };
export const LIFT = { road: 0.06, highway: 0.1 }; // how far above the ground a road lies, against z-fighting
export const BRIDGE_RAMP = 60; // units over which a deck rises from the shore to its full height, and comes back down
export const COLORS = { grass: [34, 70, 40], beach: [232, 217, 168], rock: [112, 120, 104], peak: [214, 214, 206] };
const ROCK_FROM = 3; // ground above this many units is rock, and above 10 the peaks

const smooth = (t) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

/** A chunk's ground height at (x, z), by bilinear blending of its corner heights (0 where the chunk is flat or has no ground). */
export function groundHeight(chunk, x, z) {
  const g = chunk.ground;
  if (!g?.h) return 0;
  const n = g.n, cell = chunk.size / n;
  const fx = Math.max(0, Math.min(n - 1e-9, (x - chunk.bounds.x0) / cell)), fz = Math.max(0, Math.min(n - 1e-9, (z - chunk.bounds.z0) / cell));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const h = (a, b) => g.h[b * (n + 1) + a] / 100;
  return h(i, j) * (1 - u) * (1 - v) + h(i + 1, j) * u * (1 - v) + h(i, j + 1) * (1 - u) * v + h(i + 1, j + 1) * u * v;
}

function ground(chunk) {
  const g = chunk.ground;
  if (!g) return empty();
  const n = g.n, cell = chunk.size / n;
  const index = new Map();
  const positions = [];
  const beach = []; // per vertex: does a beach cell touch it
  const indices = [];
  const vertex = (i, j) => {
    const key = j * (n + 1) + i;
    if (!index.has(key)) {
      index.set(key, positions.length / 3);
      positions.push(chunk.bounds.x0 + i * cell, g.h ? g.h[key] / 100 : 0, chunk.bounds.z0 + j * cell);
    }
    return index.get(key);
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const kind = g.mask[j * n + i];
      if (kind === '0') continue;
      const a = vertex(i, j), b = vertex(i + 1, j), c = vertex(i, j + 1), d = vertex(i + 1, j + 1);
      if (kind === '2') for (const v of [a, b, c, d]) beach[v] = true;
      // counter-clockwise seen from above (+y), so the ground faces up
      indices.push(a, c, b, b, c, d);
    }
  }
  // a vertex is sand if a beach cell touches it, else rock or peak by its height, else grass
  const colors = [];
  for (let v = 0; v < positions.length / 3; v++) {
    const y = positions[v * 3 + 1];
    colors.push(...(beach[v] ? COLORS.beach : y > 10 ? COLORS.peak : y > ROCK_FROM ? COLORS.rock : COLORS.grass));
  }
  return pack(positions, indices, colors);
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

function roads(chunk) {
  const positions = [];
  const indices = [];
  for (const r of chunk.roads) {
    const w = ROAD_WIDTH[r.class] ?? ROAD_WIDTH.default;
    ribbon(positions, indices, r.a, r.b, w, groundHeight(chunk, r.a.x, r.a.z) + LIFT.road, groundHeight(chunk, r.b.x, r.b.z) + LIFT.road);
  }
  return pack(positions, indices);
}

function highways(chunk) {
  const positions = [];
  const indices = [];
  for (const h of chunk.highways) {
    if (h.kind !== 'causeway-bridge') {
      ribbon(positions, indices, h.a, h.b, h.width, groundHeight(chunk, h.a.x, h.a.z) + LIFT.highway, groundHeight(chunk, h.b.x, h.b.z) + LIFT.highway);
      continue;
    }
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
