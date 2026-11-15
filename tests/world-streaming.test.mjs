// The chunk manager (lib/world/chunkManager.js, docs/world/streaming_runtime.md) on the real baked world: which chunks are mounted around a player, how they are loaded and let go of.
import fs from 'node:fs';
import path from 'node:path';
import { imp, root } from '../scripts/lib-loader.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const { loadBakedWorld } = await imp('world/bakedWorld.js');
const { createChunkManager, PROFILES } = await imp('world/chunkManager.js');
const dir = path.join(root, 'apps/web/public/world');
let reads = 0;
const baked = await loadBakedWorld(async (name) => { reads++; return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); });
const make = (opts = {}) => {
  const log = { mount: [], unmount: [] };
  const m = createChunkManager(baked, { ...opts, onMount: (c) => log.mount.push(`${c.cx}_${c.cz}`), onUnmount: (k) => log.unmount.push(k) });
  return { m, log };
};
const town = baked.manifest.towns[0];
const home = { x: (town.land.x0 + town.land.x1) / 2, z: (town.land.z0 + town.land.z1) / 2 };
const island = baked.manifest.towns[1];
const isle = { x: (island.land.x0 + island.land.x1) / 2, z: (island.land.z0 + island.land.z1) / 2 };
const homeChunk = baked.chunkAt(home.x, home.z);
const cheb = (k, c) => { const [a, b] = k.split('_').map(Number); return Math.max(Math.abs(a - c.cx), Math.abs(b - c.cz)); };

// ---- the ring
{
  const { m, log } = make();
  m.focus(home.x, home.z);
  check('nothing is loaded by a focus: it only says what is wanted', m.mounted().length === 0 && m.wanted().length === 25 && reads === 1, `${m.wanted().length} wanted`);
  const first = await m.step();
  check('a step mounts one chunk (perStep is 1), the nearest: the one the player stands in', first === 1 && log.mount[0] === `${homeChunk.cx}_${homeChunk.cz}`);
  await m.settle();
  check('settled, the whole 5 x 5 ring is mounted (25 chunks, 640 units across)', m.mounted().length === 25 && m.pending().length === 0);
  const order = log.mount.map((k) => { const [a, b] = k.split('_').map(Number); return Math.hypot(a - homeChunk.cx, b - homeChunk.cz); });
  check('they came in nearest first', order.every((d, i) => i === 0 || d >= order[i - 1] - 1e-9));
  check('every mounted chunk is a real baked chunk, and the town\'s plots are in them', m.mounted().every((k) => m.chunk(k).plots && m.chunk(k).roads) && m.mounted().some((k) => m.chunk(k).plots.length > 20));
}

// ---- walking: the set follows the player, and is bounded
{
  const { m, log } = make();
  let peak = 0;
  m.focus(home.x, home.z);
  await m.settle();
  // walk 1,200 units east along the town's road at 12 units a frame, stepping once a frame
  for (let x = home.x; x < home.x + 1200; x += 12) { m.focus(x, home.z, 1, 0); await m.step(); peak = Math.max(peak, m.mounted().length); }
  check('walking east for 1,200 units, the mounted set never passes the cap (the ring plus what is ahead)', peak <= PROFILES.desktop.maxMounted && peak >= 15, `peak ${peak}`);
  check('chunks left behind were let go of', log.unmount.length > 5, `${log.unmount.length} unmounted`);
  const end = baked.chunkAt(home.x + 1200, home.z);
  await m.settle();
  check('and in the end only chunks near where the player is are mounted, none of the first ring still is', m.mounted().every((k) => cheb(k, end) <= PROFILES.desktop.keep) && !m.mounted().includes(`${homeChunk.cx}_${homeChunk.cz}`));
}

// ---- hysteresis: walking along a chunk edge does not thrash
{
  const { m, log } = make();
  const edge = Math.ceil(home.x / baked.size) * baked.size;
  m.focus(edge - 1, home.z);
  await m.settle();
  const before = log.mount.length;
  for (let i = 0; i < 40; i++) { m.focus(edge + (i % 2 ? 2 : -2), home.z); await m.step(); }
  check('stepping back and forth over a chunk edge 40 times unmounts nothing and mounts only the new column once', log.unmount.length === 0 && log.mount.length - before <= 5, `${log.mount.length - before} mounted, ${log.unmount.length} unmounted`);
}

// ---- a teleport
{
  const { m, log } = make();
  m.focus(home.x, home.z);
  await m.settle();
  const a = log.mount.length;
  m.focus(isle.x, isle.z);
  await m.settle();
  const ic = baked.chunkAt(isle.x, isle.z);
  check('teleporting to Harbor Isle: the mainland chunks are let go of and the island\'s are mounted', log.unmount.length === 25 && m.mounted().length > 0 && m.mounted().every((k) => cheb(k, ic) <= 2) && log.mount.length > a);
  check('and the island\'s town is in what is mounted', m.mounted().some((k) => m.chunk(k).plots.some((p) => p.id >= 1_000_000)));
}

// ---- the sea costs nothing
{
  const { m } = make();
  m.focus(-800, 2000); // far south of everything
  await m.settle();
  check('out at sea nothing is wanted and nothing is mounted', m.wanted().length === 0 && m.mounted().length === 0);
  const strait = make();
  strait.m.focus(1600, 700); // the water between the landmasses, off the mainland\'s east end
  check('over the water only the real chunks near the coast are wanted, not the sea', strait.m.wanted().length < 25, `${strait.m.wanted().length} wanted`);
}

// ---- profiles and the look-ahead
{
  const { m } = make({ profile: 'phone' });
  m.focus(home.x, home.z);
  await m.settle();
  check('a phone mounts a 3 x 3 ring (9 chunks), a desktop 5 x 5', m.mounted().length === 9 && PROFILES.phone.ring === 1);
  const a = make(); a.m.focus(home.x, home.z, 4, 0);
  const b = make(); b.m.focus(home.x, home.z, 0, 0);
  check('moving east, the chunks just beyond the ring on that side are wanted too, so the next one is there before you arrive', a.m.wanted().length > b.m.wanted().length && a.m.wanted().some((k) => !b.m.wanted().includes(k) && Number(k.split('_')[0]) > homeChunk.cx + 2), `${a.m.wanted().length} against ${b.m.wanted().length}`);
  const c = make({ maxMounted: 10 }); c.m.focus(home.x, home.z); await c.m.settle();
  check('the cap holds: with a cap of 10 only the 10 nearest are mounted', c.m.mounted().length === 10);
  const d = make({ profile: 'overview' }); d.m.focus(home.x, home.z); const n = await d.m.step();
  check('an overview camera mounts several per step (perStep 4) and sees farther', n === 4 && d.m.wanted().length > 25);
}

// ---- a chunk that is loading when the player leaves is not mounted late
{
  let release;
  let first = true; // only the first chunk is slow
  const slow = { ...baked, chunk: (cx, cz) => (first ? ((first = false), new Promise((res) => { release = () => res(baked.chunk(cx, cz)); })) : baked.chunk(cx, cz)) };
  const log = [];
  const m = createChunkManager(slow, { onMount: (c) => log.push(`${c.cx}_${c.cz}`) });
  m.focus(home.x, home.z);
  const pending = m.step();
  m.focus(isle.x, isle.z); // the player is already far away
  release();
  await pending;
  check('a chunk that finished loading after the player left is not mounted (the one that finished is not among those mounted)', !log.includes(`${homeChunk.cx}_${homeChunk.cz}`) && m.mounted().every((k) => cheb(k, baked.chunkAt(isle.x, isle.z)) <= 2));
}

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
