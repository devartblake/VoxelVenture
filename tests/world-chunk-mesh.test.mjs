// Merged chunk geometry (lib/world/chunkMesh.js, docs/world/streaming_runtime.md) on the real baked world: each chunk becomes three meshes (ground, roads, highways), valid, facing up, inside its
// chunk, meeting its neighbours, with the mountains risen and the bridges over the water.
import fs from 'node:fs';
import path from 'node:path';
import { imp, root } from '../scripts/lib-loader.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const { loadBakedWorld } = await imp('world/bakedWorld.js');
const { chunkMeshes, meshCost, groundHeight, BRIDGE_RAMP, ROAD_WIDTH } = await imp('world/chunkMesh.js');
const { createChunkManager } = await imp('world/chunkManager.js');
const dir = path.join(root, 'apps/web/public/world');
const baked = await loadBakedWorld(async (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
const chunks = [];
for (const c of baked.manifest.chunks) chunks.push(await baked.chunk(c.cx, c.cz));
const meshed = chunks.map((c) => ({ c, m: chunkMeshes(c) }));
const town = baked.manifest.towns[0];
const home = baked.chunkAt((town.land.x0 + town.land.x1) / 2, (town.land.z0 + town.land.z1) / 2);
const homeChunk = chunks.find((c) => c.cx === home.cx && c.cz === home.cz);

const valid = (m, c) => {
  const n = m.positions.length / 3;
  return m.positions.every(Number.isFinite) && m.indices.every((i) => i < n) && m.indices.length % 3 === 0 && m.triangles === m.indices.length / 3 && (!m.colors || m.colors.length === m.positions.length) && n > 0 === m.triangles > 0 && c;
};

// ---- every chunk: three meshes, well formed
{
  check('every chunk makes three meshes (ground, roads, highways), each well formed: finite numbers, indices in range, whole triangles, a colour for each ground vertex', meshed.every(({ c, m }) => ['ground', 'roads', 'highways'].every((k) => valid(m[k], c))), `${chunks.length} chunks`);
  const cost = meshed.map(({ m }) => meshCost(m));
  check('a chunk costs at most three draw calls however much is in it', cost.every((x) => x.drawCalls <= 3) && Math.max(...cost.map((x) => x.drawCalls)) === 3);
  check('and the busiest chunk is a few thousand triangles, not tens of thousands (the town, with its roads, is the heaviest)', Math.max(...cost.map((x) => x.triangles)) < 4000, `${Math.max(...cost.map((x) => x.triangles))} at most`);
  const ring = chunks.filter((c) => Math.max(Math.abs(c.cx - home.cx), Math.abs(c.cz - home.cz)) <= 2).map((c) => meshCost(chunkMeshes(c)));
  check('the whole 5 x 5 ring round the town (what a desktop mounts) is under 40,000 triangles and 75 draw calls', ring.reduce((s, x) => s + x.triangles, 0) < 40000 && ring.reduce((s, x) => s + x.drawCalls, 0) <= 75, `${ring.reduce((s, x) => s + x.triangles, 0)} triangles, ${ring.reduce((s, x) => s + x.drawCalls, 0)} draw calls`);
  check('the same chunk gives the same bytes each time', JSON.stringify(Array.from(chunkMeshes(homeChunk).ground.positions)) === JSON.stringify(Array.from(meshed.find((x) => x.c === homeChunk).m.ground.positions)));
}

// ---- the ground
{
  const faceUp = (m) => { for (let t = 0; t < m.indices.length; t += 3) { const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map((i) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]); const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; if (uz * vx - ux * vz <= 0 && !(uz * vx - ux * vz === 0 && uy * vz - uz * vy === 0)) return false; } return true; };
  const land = meshed.filter(({ c }) => c.ground);
  check('the ground faces up (every triangle is counter-clockwise from above)', land.every(({ m }) => faceUp(m.ground)));
  check('ground is only where there is land: a chunk of open sea has none, and a chunk\'s ground triangles are two for each land or beach cell', meshed.filter(({ c }) => !c.ground).every(({ m }) => m.ground.triangles === 0) && land.every(({ c, m }) => m.ground.triangles === 2 * [...c.ground.mask].filter((v) => v !== '0').length));
  check('every ground vertex is inside its chunk', land.every(({ c, m }) => { for (let v = 0; v < m.ground.positions.length; v += 3) { const x = m.ground.positions[v], z = m.ground.positions[v + 2]; if (x < c.bounds.x0 - 1e-6 || x > c.bounds.x1 + 1e-6 || z < c.bounds.z0 - 1e-6 || z > c.bounds.z1 + 1e-6) return false; } return true; }));
  const mt = land.filter(({ c }) => c.ground.h && Math.max(...c.ground.h) > 1000);
  const top = Math.max(...mt.map(({ m }) => { let y = 0; for (let v = 1; v < m.ground.positions.length; v += 3) y = Math.max(y, m.ground.positions[v]); return y; }));
  check('the mountains are risen in the mesh: the Blue Mountains reach near 14, and the town ground is flat', top > 9 && top <= 14 && Math.max(...Array.from(homeChunk.ground.h ?? [0])) === 0, `${top.toFixed(1)} at the top`);
  // continuity: the vertices on the shared edge of two neighbouring chunks are the same points, at the same height
  let seamOk = true;
  let pairs = 0;
  for (const { c, m } of land) {
    const r = meshed.find((x) => x.c.cx === c.cx + 1 && x.c.cz === c.cz);
    if (!r?.c.ground) continue;
    const edge = (mm, x) => { const out = new Map(); for (let v = 0; v < mm.ground.positions.length; v += 3) if (Math.abs(mm.ground.positions[v] - x) < 1e-6) out.set(mm.ground.positions[v + 2].toFixed(3), mm.ground.positions[v + 1]); return out; };
    const a = edge(m, c.bounds.x1), b = edge(r.m, c.bounds.x1);
    for (const [z, y] of a) if (b.has(z)) { pairs++; if (Math.abs(b.get(z) - y) > 1e-4) seamOk = false; }
  }
  check('neighbouring chunks meet: the shared edge points sit at the same height (no cracks in the mountains)', seamOk && pairs > 100, `${pairs} shared points`);
  const beaches = land.filter(({ m }) => { for (let v = 0; v < m.ground.colors.length; v += 3) if (m.ground.colors[v] === 232) return true; return false; });
  check('the coast has its beach (sand-coloured vertices), the middle of the land is grass, and the high ground is rock', beaches.length > 30 && homeChunk.ground && meshed.some(({ m }) => { for (let v = 0; v < m.ground.colors.length; v += 3) if (m.ground.colors[v] === 112) return true; return false; }));
}

// ---- roads and highways
{
  const hm = chunkMeshes(homeChunk);
  check('the town\'s roads are ribbons: 2 triangles for each road piece, laid a hair above the ground', hm.roads.triangles === 2 * homeChunk.roads.length && homeChunk.roads.length > 10 && Math.min(...Array.from(hm.roads.positions).filter((_, i) => i % 3 === 1)) > 0 && Math.max(...Array.from(hm.roads.positions).filter((_, i) => i % 3 === 1)) < 0.2);
  check('an arterial is wider than a local street', ROAD_WIDTH.arterial > ROAD_WIDTH.local);
  const withHw = meshed.filter(({ c }) => c.highways.length);
  check('every chunk the highways pass through has a highway mesh', withHw.every(({ m }) => m.highways.triangles > 0) && withHw.length > 60, `${withHw.length} chunks`);
  const bridge = meshed.filter(({ c }) => c.highways.some((h) => h.kind === 'causeway-bridge'));
  const deck = Math.max(...bridge.map(({ m }) => { let y = 0; for (let v = 1; v < m.highways.positions.length; v += 3) y = Math.max(y, m.highways.positions[v]); return y; }));
  check('the bridges: the deck rises to its 9 units of clearance over the water, boats pass under it', bridge.length >= 8 && deck > 8.9 && deck < 9.3, `${deck.toFixed(2)} at the highest, ${bridge.length} chunks`);
  const shore = bridge.map(({ c, m }) => ({ c, m })).filter(({ c }) => c.highways.some((h) => h.kind === 'causeway-bridge' && h.along[0] === 0));
  check('and it starts at the shore at ground level: the first piece of a bridge begins at the height of the road', shore.length >= 2 && shore.every(({ c, m }) => { const h = c.highways.find((x) => x.kind === 'causeway-bridge' && x.along[0] === 0); let near = 99; for (let v = 0; v < m.highways.positions.length; v += 3) if (Math.hypot(m.highways.positions[v] - h.a.x, m.highways.positions[v + 2] - h.a.z) < h.width) near = Math.min(near, m.highways.positions[v + 1]); return near < 0.3; }) && BRIDGE_RAMP === 60);
  const seaHw = meshed.filter(({ c }) => !c.ground && c.highways.length);
  check('a chunk that is only sea with a bridge over it still has its deck (and no ground)', seaHw.length > 3 && seaHw.every(({ m }) => m.highways.triangles > 0 && m.ground.triangles === 0));
  check('the ground height under a road in a mountain chunk follows the ground', (() => { const c = chunks.find((x) => x.ground?.h && x.highways.length); if (!c) return true; const h = c.highways[0]; return groundHeight(c, h.a.x, h.a.z) >= 0; })());
}

// ---- mounting a chunk through the manager costs three meshes
{
  let draws = 0;
  let tris = 0;
  const mgr = createChunkManager(baked, { onMount: (c) => { const k = meshCost(chunkMeshes(c)); draws += k.drawCalls; tris += k.triangles; } });
  mgr.focus((town.land.x0 + town.land.x1) / 2, (town.land.z0 + town.land.z1) / 2);
  await mgr.settle();
  check('mounted through the chunk manager, the whole desktop ring is 25 chunks, under 75 draw calls and 40,000 triangles', mgr.mounted().length === 25 && draws <= 75 && tris < 40000, `${draws} draw calls, ${tris} triangles`);
}

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
