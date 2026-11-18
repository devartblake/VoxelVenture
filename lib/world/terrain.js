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
import { TUNNEL, floorSlope, floorY, inCorridor, nextLayer, surfaceBlock, tunnelFrame } from './tunnelSpec';
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

export function createTerrain({ chunkAt, has = () => true, skipped = () => false, bounds = null, size = CHUNK_SIZE, tunnels = [] }) {
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
      if (h.kind !== 'causeway-bridge' && h.kind !== 'river-bridge' && h.kind !== 'jetty') continue;
      const dx = h.b.x - h.a.x, dz = h.b.z - h.a.z, len2 = dx * dx + dz * dz;
      const t = len2 ? Math.max(0, Math.min(1, ((x - h.a.x) * dx + (z - h.a.z) * dz) / len2)) : 0;
      if (Math.hypot(x - h.a.x - t * dx, z - h.a.z - t * dz) <= h.width / 2) return { y: deckHeight(h, h.along[0] + (h.along[1] - h.along[0]) * t), id: h.id, kind: h.kind };
    }
    return null;
  }

  /** The tunnel whose tube the point is in (between its portals, whatever the layer), or null. */
  const tubeAt = (x, z) => tunnels.find((t) => { const f = tunnelFrame(t, x, z); return f.s >= t.s0 && f.s <= t.s1 && Math.abs(f.lat) <= TUNNEL.width / 2 + TUNNEL.wall; }) ?? null;

  /**
   * What is at (x, z) for a mover on `layer`: 'surface' (the ground, the bridges and the sea: the default) or 'tunnel' (the road inside a tunnel's tube, stage 2 of docs/world/tunnel.md). On the tunnel layer
   * the road side of the tube is `surface: 'tunnel'` at the road's height, the rest of the tube is `'wall'` (a body cannot be there), and beyond the portals it is the surface again.
   */
  function sample(x, z, layer = 'surface') {
    if (layer === 'tunnel') {
      const t = tubeAt(x, z);
      if (t) {
        const s = tunnelFrame(t, x, z).s;
        const y = floorY(t, s);
        return inCorridor(t, x, z) ? { known: true, surface: 'tunnel', y, slope: Math.abs(floorSlope(t, s)), sd: 99, deck: null, tunnel: { id: t.id, s } } : { known: true, surface: 'wall', y, slope: 9, sd: 99, deck: null, tunnel: { id: t.id, s } };
      }
    }
    return sampleSurface(x, z);
  }

  function sampleSurface(x, z) {
    const { cx, cz } = chunkOf(x, z);
    if (skipped(cx, cz)) return { known: false, surface: 'town', y: 0, slope: 0, sd: 99 };
    if (!has(cx, cz)) return { known: true, surface: 'sea', y: SEA_FLOOR, slope: 0, sd: -99, deck: null }; // open sea: no chunk, nothing there
    const chunk = chunkAt(cx, cz);
    if (!chunk) return { known: false, surface: 'loading', y: 0, slope: 0, sd: 0 };
    const sd = signed(chunk, x, z);
    const land = sd >= 0;
    const y = land ? groundHeight(chunk, x, z) : Math.max(SEA_FLOOR, shoreHeight(sd));
    const deck = deckAt(chunk, x, z);
    const block = land && !deck ? tunnels.reduce((b, t) => b ?? surfaceBlock(t, x, z), null) : null; // the tube's walls and the cut ground at a portal (stage 2)
    if (block) return { known: true, surface: block, y, slope: 9, sd, deck: null };
    const e = 1.5;
    const slope = land && chunk.ground?.h ? Math.hypot((groundHeight(chunk, x + e, z) - groundHeight(chunk, x - e, z)) / (2 * e), (groundHeight(chunk, x, z + e) - groundHeight(chunk, x, z - e)) / (2 * e)) : 0;
    return { known: true, surface: deck ? 'bridge' : land ? (sd < BEACH ? 'beach' : 'land') : 'sea', y: deck ? deck.y : y, slope, sd, deck };
  }

  function canStand(x, z, mode = 'walk', layer = 'surface') {
    const s = sample(x, z, layer);
    if (!s.known) return false;
    if (s.surface === 'wall' || s.surface === 'pit' || s.surface === 'rail') return false; // (the tube's wall, the cut ground beyond a mouth, the rail's side of it)
    if (s.surface === 'tunnel') return mode !== 'boat' && s.slope <= LIMITS[mode].slope;
    if (mode === 'boat') return s.sd <= -LIMITS.boat.depth && s.deck?.kind !== 'jetty'; // out in the sea, under a bridge too (the deck is overhead); a quay or a pier is in the way (the boat berths alongside it)
    if (s.surface === 'sea') return false;
    return s.slope <= LIMITS[mode].slope;
  }

  // the footprint: the point and four points round it at the radius, so a body does not hang over the sea or a cliff
  const standsWith = (x, z, mode, layer = 'surface') => { const r = LIMITS[mode].radius; return canStand(x, z, mode, layer) && [[r, 0], [-r, 0], [0, r], [0, -r]].every(([a, b]) => canStand(x + a, z + b, mode, layer)); };
  /** The layer after a step: through a tunnel's mouth into its tube, or out of it (stage 2). */
  const layerAfter = (layer, x, z, nx, nz) => { for (const t of tunnels) { const l = nextLayer(t, layer, x, z, nx, nz); if (l !== layer) return l; } return layer; };

  /** One step: x first, then z, each kept only if the body can stand there. `blocked` says which axes were refused. */
  function move(x, z, dx, dz, mode = 'walk', layer = 'surface') {
    let nx = x, nz = z, l = layer;
    const blocked = { x: false, z: false };
    // (each axis: the layer it would be on after the step decides what it can stand on: a step through a mouth is judged on the tunnel layer)
    if (dx) { const nl = layerAfter(l, nx, nz, x + dx, nz); if (standsWith(x + dx, nz, mode, nl)) { nx = x + dx; l = nl; } else blocked.x = true; }
    if (dz) { const nl = layerAfter(l, nx, nz, nx, z + dz); if (standsWith(nx, z + dz, mode, nl)) { nz = z + dz; l = nl; } else blocked.z = true; }
    return { x: nx, z: nz, blocked, layer: l };
  }

  /**
   * For a game that has its own rules inside part of the map (the first town): the step from (x, z) to (nx, nz), one axis at a time, where a step into the caller's own part (`surface`
   * 'town') is allowed as it is (the game's rules decide there), a step into ground that is not loaded yet is refused, and any other step must be somewhere the body can stand.
   */
  function constrain(x, z, nx, nz, mode = 'walk', layer = 'surface') {
    const ok = (a, b, l) => { const t = sample(a, b, l); return t.surface === 'town' || (t.known && standsWith(a, b, mode, l)); };
    let rx = x, rz = z, l = layer;
    if (nx !== x) { const nl = layerAfter(l, rx, rz, nx, z); if (ok(nx, z, nl)) { rx = nx; l = nl; } }
    if (nz !== z) { const nl = layerAfter(l, rx, rz, rx, nz); if (ok(rx, nz, nl)) { rz = nz; l = nl; } }
    return { x: rx, z: rz, layer: l };
  }

  return {
    sample, canStand, move, standsWith, constrain, layerAfter, bounds, tunnels,
    groundY: (x, z, layer = 'surface') => sample(x, z, layer).y,
    /** True where the terrain decides (a baked chunk or open sea): false in the part the caller handles itself, or not loaded yet. */
    decides: (x, z) => sample(x, z).known,
  };
}
