// The chunk manager (roadmap task 11, first slice; docs/world/streaming_runtime.md): decides which baked chunks (bake.js, bakedWorld.js) are mounted around the player, loads them nearest
// first, and lets go of the ones left behind. Pure logic with no rendering: it calls `onMount(chunk)` and `onUnmount(key, chunk)` and the game's components do the drawing. So the whole
// streaming policy is tested in Node (tests/world-streaming.test.mjs), and the React side only has to mount and dispose.
//
//   const m = createChunkManager(baked, { profile: 'desktop', onMount, onUnmount });
//   m.focus(x, z, vx, vz)      the player is here (and moving this way): what is wanted changes; nothing is loaded yet
//   await m.step()             load up to `perStep` wanted chunks, nearest first (call once a frame: a chunk never hitches the frame); unmounts happen here too, first
//   m.mounted()                the keys now mounted;  m.pending()  the wanted keys not yet mounted;  m.stats()
//
// A chunk is wanted inside `ring` chunks of the one the player is in (a square: 2 gives 5 x 5 chunks, 640 units across), plus `ahead` more chunks in the direction of travel (so the next one is
// there before you arrive). It is let go of only beyond `keep` (ring + 1), so walking along a chunk edge does not mount and unmount the same chunk every frame. Open sea has no chunk and costs nothing.
export const PROFILES = {
  desktop: { ring: 2, keep: 3, ahead: 1, perStep: 1, maxMounted: 36 },
  phone: { ring: 1, keep: 2, ahead: 1, perStep: 1, maxMounted: 16 },
  overview: { ring: 6, keep: 7, ahead: 0, perStep: 4, maxMounted: 200 }, // a high camera sees farther, with the nearest only (the far chunks are pictures, not geometry)
};

export function createChunkManager(baked, { profile = 'desktop', ring, keep, ahead, perStep, maxMounted, onMount = () => {}, onUnmount = () => {} } = {}) {
  const p = { ...(PROFILES[profile] ?? PROFILES.desktop) };
  if (ring !== undefined) p.ring = ring;
  p.keep = keep ?? Math.max(p.keep, p.ring + 1);
  if (ahead !== undefined) p.ahead = ahead;
  if (perStep !== undefined) p.perStep = perStep;
  if (maxMounted !== undefined) p.maxMounted = maxMounted;
  const have = new Set(baked.manifest.chunks.map((c) => c.key)); // the chunks that exist (open sea has none)
  const mountedChunks = new Map(); // key -> chunk
  const loading = new Set();
  let at = { cx: 0, cz: 0 };
  let want = []; // keys, nearest first
  let stats = { mounts: 0, unmounts: 0, steps: 0, loads: 0 };

  const key = (cx, cz) => `${cx}_${cz}`;
  function focus(x, z, vx = 0, vz = 0) {
    at = baked.chunkAt(x, z);
    const wanted = new Map();
    const add = (cx, cz, extra = 0) => { const k = key(cx, cz); if (have.has(k) && !wanted.has(k)) wanted.set(k, Math.hypot(cx - at.cx, cz - at.cz) - extra); };
    for (let dx = -p.ring; dx <= p.ring; dx++) for (let dz = -p.ring; dz <= p.ring; dz++) add(at.cx + dx, at.cz + dz);
    // ahead: the chunks just beyond the ring in the direction of travel (one of the eight compass directions), and the two beside each, so the next column is mounted before you reach it
    const speed = Math.hypot(vx, vz);
    if (p.ahead > 0 && speed > 0.5) {
      const dx = Math.abs(vx / speed) > 0.38 ? Math.sign(vx) : 0, dz = Math.abs(vz / speed) > 0.38 ? Math.sign(vz) : 0;
      for (let k = 1; k <= p.ahead; k++) {
        const cx = at.cx + dx * (p.ring + k), cz = at.cz + dz * (p.ring + k);
        for (const [sx, sz] of [[0, 0], [-dz, dx], [dz, -dx]]) add(cx + sx, cz + sz, -0.5);
      }
    }
    want = [...wanted.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map((e) => e[0]).slice(0, p.maxMounted);
  }

  async function step() {
    stats.steps++;
    // let go first: anything beyond `keep` chunks away (a square distance), and anything over the cap, farthest first
    const far = (k) => { const c = mountedChunks.get(k); return Math.max(Math.abs(c.cx - at.cx), Math.abs(c.cz - at.cz)); };
    for (const k of [...mountedChunks.keys()]) if (far(k) > p.keep) unmount(k);
    const wantSet = new Set(want);
    while (mountedChunks.size > p.maxMounted) { const k = [...mountedChunks.keys()].filter((x) => !wantSet.has(x)).sort((a, b) => far(b) - far(a))[0] ?? [...mountedChunks.keys()].sort((a, b) => far(b) - far(a))[0]; unmount(k); }
    // then bring in the nearest wanted ones, a few at a time
    let n = 0;
    for (const k of want) {
      if (n >= p.perStep) break;
      if (mountedChunks.has(k) || loading.has(k)) continue;
      const [cx, cz] = k.split('_').map(Number);
      loading.add(k);
      let chunk;
      try { chunk = await baked.chunk(cx, cz); } finally { loading.delete(k); }
      stats.loads++;
      // the player may have moved on while it loaded: only mount it if it is still wanted
      if (chunk && want.includes(k) && !mountedChunks.has(k)) { mountedChunks.set(k, chunk); stats.mounts++; onMount(chunk); n++; }
    }
    return n;
  }
  function unmount(k) { const c = mountedChunks.get(k); mountedChunks.delete(k); stats.unmounts++; onUnmount(k, c); }

  return {
    focus,
    step,
    /** Load everything wanted now (a teleport, or a loading screen), however many steps it takes. */
    async settle() { let guard = 0; while (this.pending().length && guard++ < 500) { if (!(await step()) && !this.pending().length) break; if (guard > 400) break; } return this.mounted(); },
    mounted: () => [...mountedChunks.keys()].sort(),
    pending: () => want.filter((k) => !mountedChunks.has(k)),
    wanted: () => [...want],
    chunk: (k) => mountedChunks.get(k) ?? null,
    stats: () => ({ ...stats, mounted: mountedChunks.size, profile: { ...p } }),
  };
}
