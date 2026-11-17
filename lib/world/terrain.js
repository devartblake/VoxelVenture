// The ground under things (roadmap tasks 11 and 17; docs/world/streaming_runtime.md, "Collision and the ground"): from the baked chunks that are mounted, how high the ground is at a point, what it is
// (land, beach, sea, a bridge deck), how steep, and whether an avatar, a car or a boat can be there. Pure: it reads chunks through a function the caller gives, so it runs in Node (tests) and in the
// game (the streaming layer gives it the mounted chunks). Nothing here is rendered.
//
//   const terrain = createTerrain({ chunkAt, has, skipped, bounds });
//   terrain.sample(x, z)           -> { known, surface: 'land' | 'beach' | 'sea' | 'bridge' | 'town', y, slope, sd, deck }
//   terrain.canStand(x, z, mode)   mode 'walk' | 'car' | 'boat'
//   terrain.move(x, z, dx, dz, mode) -> { x, z, blocked }       one axis at a time, so it slides along a coast or a steep slope
//   terrain.constrain(x, z, nx, nz, mode) the same for a game with its own rules inside part of the map (the caller's part is left alone)
//   terrain.groundY(x, z)          the height to put an avatar or a car at (the deck on a bridge)
//
// `chunkAt(cx, cz)` gives a chunk that is loaded, or undefined; `has(cx, cz)` says whether a chunk exists at all (open sea has none: it is sea, known); `skipped(cx, cz)` says the caller draws and
// collides that chunk itself (the game does, for the first town's land: `surface` is 'town' there and `known` is false, so the game's own rules apply). A chunk that exists but is not loaded yet is
// `known: false` and nothing may move into it (a moment's wait while it streams in, not a fall into the void).
import { BEACH, CHUNK_SIZE } from './bake';
import { deckHeight, groundHeight, shoreHeight } from './chunkMesh';

import { SEA_FLOOR, SEA_LEVEL } from './datum';
export { SEA_LEVEL }; // (the datum's: lib/world/datum.js)
export const LIMITS = {
  walk: { slope: 1.0, radius: 0.3 }, // up to 45 degrees
  car: { slope: 0.45, radius: 0.5 }, // about 24 degrees
  boat: { depth: 2.5, radius: 0.5 }, // a boat needs the sea at least this far out from the shore
};

let active = null;
/** The terrain the game is using now, or null (set by the streaming layer; read by the avatar and the vehicles). */
export const activeTerrain = () => active;
export const setActiveTerrain = (t) => { active = t; };

export function createTerrain({ chunkAt, has = () => true, skipped = () => false, bounds = null, size = CHUNK_SIZE }) {
  const chunkOf = (x, z) => ({ cx: Math.floor(x / size), cz: Math.floor(z / size) });

  /** The signed distance to the coast at (x, z) from a chunk's corner values (bilinear), in units: positive on land. Falls back to the cell mask when there is none. */
  function signed(chunk, x, z) {
    const g = chunk.ground;
    if (!g) return -99; // a chunk with no ground is sea
    const n = g.n, cell = size / n;
    if (g.sd) {
      const fx = Math.max(0, Math.min(n - 1e-9, (x - chunk.bounds.x0) / cell)), fz = Math.max(0, Math.min(n - 1e-9, (z - chunk.bounds.z0) / cell));
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const at = (a, b) => g.sd[b * (n + 1) + a] / 10;
      return at(i, j) * (1 - u) * (1 - v) + at(i + 1, j) * u * (1 - v) + at(i, j + 1) * (1 - u) * v + at(i + 1, j + 1) * u * v;
    }
    const i = Math.min(n - 1, Math.floor((x - chunk.bounds.x0) / cell)), j = Math.min(n - 1, Math.floor((z - chunk.bounds.z0) / cell));
    const kind = g.mask[j * n + i];
    return kind === '0' ? -99 : kind === '2' ? BEACH / 2 : 99;
  }

  /** The bridge deck at (x, z), if a bridge piece of this chunk passes under that point: { y, id } or null. */
  function deckAt(chunk, x, z) {
    for (const h of chunk.highways) {
      if (h.kind !== 'causeway-bridge' && h.kind !== 'river-bridge') continue;
      const dx = h.b.x - h.a.x, dz = h.b.z - h.a.z, len2 = dx * dx + dz * dz;
      const t = len2 ? Math.max(0, Math.min(1, ((x - h.a.x) * dx + (z - h.a.z) * dz) / len2)) : 0;
      if (Math.hypot(x - h.a.x - t * dx, z - h.a.z - t * dz) <= h.width / 2) return { y: deckHeight(h, h.along[0] + (h.along[1] - h.along[0]) * t), id: h.id };
    }
    return null;
  }

  function sample(x, z) {
    const { cx, cz } = chunkOf(x, z);
    if (skipped(cx, cz)) return { known: false, surface: 'town', y: 0, slope: 0, sd: 99 };
    if (!has(cx, cz)) return { known: true, surface: 'sea', y: SEA_FLOOR, slope: 0, sd: -99, deck: null }; // open sea: no chunk, nothing there
    const chunk = chunkAt(cx, cz);
    if (!chunk) return { known: false, surface: 'loading', y: 0, slope: 0, sd: 0 };
    const sd = signed(chunk, x, z);
    const land = sd >= 0;
    const y = land ? groundHeight(chunk, x, z) : Math.max(SEA_FLOOR, shoreHeight(sd));
    const deck = deckAt(chunk, x, z);
    const e = 1.5;
    const slope = land && chunk.ground?.h ? Math.hypot((groundHeight(chunk, x + e, z) - groundHeight(chunk, x - e, z)) / (2 * e), (groundHeight(chunk, x, z + e) - groundHeight(chunk, x, z - e)) / (2 * e)) : 0;
    return { known: true, surface: deck ? 'bridge' : land ? (sd < BEACH ? 'beach' : 'land') : 'sea', y: deck ? deck.y : y, slope, sd, deck };
  }

  function canStand(x, z, mode = 'walk') {
    const s = sample(x, z);
    if (!s.known) return false;
    if (mode === 'boat') return s.sd <= -LIMITS.boat.depth; // out in the sea, under a bridge too (the deck is overhead)
    if (s.surface === 'sea') return false;
    return s.slope <= LIMITS[mode].slope;
  }

  // the footprint: the point and four points round it at the radius, so a body does not hang over the sea or a cliff
  const standsWith = (x, z, mode) => { const r = LIMITS[mode].radius; return canStand(x, z, mode) && [[r, 0], [-r, 0], [0, r], [0, -r]].every(([a, b]) => canStand(x + a, z + b, mode)); };

  /** One step: x first, then z, each kept only if the body can stand there. `blocked` says which axes were refused. */
  function move(x, z, dx, dz, mode = 'walk') {
    let nx = x, nz = z;
    const blocked = { x: false, z: false };
    if (dx && standsWith(x + dx, z, mode)) nx = x + dx; else if (dx) blocked.x = true;
    if (dz && standsWith(nx, z + dz, mode)) nz = z + dz; else if (dz) blocked.z = true;
    return { x: nx, z: nz, blocked };
  }

  /**
   * For a game that has its own rules inside part of the map (the first town): the step from (x, z) to (nx, nz), one axis at a time, where a step into the caller's own part (`surface`
   * 'town') is allowed as it is (the game's rules decide there), a step into ground that is not loaded yet is refused, and any other step must be somewhere the body can stand.
   */
  function constrain(x, z, nx, nz, mode = 'walk') {
    const ok = (a, b) => { const t = sample(a, b); return t.surface === 'town' || (t.known && standsWith(a, b, mode)); };
    let rx = x, rz = z;
    if (nx !== x && ok(nx, z)) rx = nx;
    if (nz !== z && ok(rx, nz)) rz = nz;
    return { x: rx, z: rz };
  }

  return {
    sample, canStand, move, standsWith, constrain, bounds,
    groundY: (x, z) => sample(x, z).y,
    /** True where the terrain decides (a baked chunk or open sea): false in the part the caller handles itself, or not loaded yet. */
    decides: (x, z) => sample(x, z).known,
  };
}
