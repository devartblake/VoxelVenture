// Reads the baked world (bake.js, scripts/bake-world.mjs; docs/world/world_bake.md): the manifest and the chunk files, from a place the caller gives. The game's streaming runtime (roadmap task 11)
// will mount the chunks this returns; for now the server and the tests use it. `load(name)` is async and returns the parsed JSON of a file under the world folder, e.g. 'manifest.json'
// or 'chunks/3_-2.json' (in the browser a fetch, in Node a file read).
import { CHUNK_SIZE, chunkAt, chunkKey } from './bake';

export async function loadBakedWorld(load) {
  const manifest = await load('manifest.json');
  if (manifest.format !== 1) throw new Error(`the baked world is format ${manifest.format}, this code reads 1`);
  const size = manifest.chunk?.size ?? CHUNK_SIZE;
  const known = new Map(manifest.chunks.map((c) => [c.key, c]));
  const cache = new Map();
  /** One chunk, or null when that square of the map is open sea (nothing was baked for it). */
  const chunk = async (cx, cz) => {
    const key = chunkKey(cx, cz);
    if (!known.has(key)) return null;
    if (!cache.has(key)) cache.set(key, load(`chunks/${key}.json`));
    return cache.get(key);
  };
  return {
    manifest,
    size,
    chunk,
    chunkAt: (x, z) => chunkAt(x, z, size),
    /** The chunks within `radius` units of a point, as the streaming runtime asks for them. */
    near: async (x, z, radius) => {
      const a = chunkAt(x - radius, z - radius, size), b = chunkAt(x + radius, z + radius, size);
      const found = [];
      for (let cx = a.cx; cx <= b.cx; cx++) for (let cz = a.cz; cz <= b.cz; cz++) { const c = await chunk(cx, cz); if (c) found.push(c); }
      return found;
    },
    /** Where a plot is, by its global id (the manifest says which town, and so which chunks, it can be in: the town's land). */
    plot: async (id) => {
      const town = manifest.towns.find((t) => id >= t.plots.firstId && id <= t.plots.lastId && Math.floor(id / 1_000_000) === t.index);
      if (!town) return null;
      const a = chunkAt(town.land.x0, town.land.z0, size), b = chunkAt(town.land.x1, town.land.z1, size);
      for (let cx = a.cx; cx <= b.cx; cx++) for (let cz = a.cz; cz <= b.cz; cz++) { const c = await chunk(cx, cz); const p = c?.plots.find((q) => q.id === id); if (p) return p; }
      return null;
    },
  };
}
