// The world bake (lib/world/bake.js, scripts/bake-world.mjs, docs/world/world_bake.md): the recipe's world cut into chunks of plain data. Every plot is in exactly one chunk, every road's length
// survives the cutting, the bake is the same bytes each time and the files on disk are a fresh bake, and (the point of the format) the world can GROW after the bake: a third town or a new
// road changes nothing that was already there.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { imp, root } from '../scripts/lib-loader.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const { buildWorld } = await imp('world/buildWorld.js');
const { WORLD_RECIPE } = await imp('world/worldRecipe.js');
const { bakeWorld, clipSegment, chunkAt, chunkKey, CHUNK_SIZE } = await imp('world/bake.js');
const { loadBakedWorld } = await imp('world/bakedWorld.js');
const { generateTown } = await imp('city/townExtension.js');
const { elevationAt } = await imp('world/shapes.js');

const world = buildWorld();
const { manifest, chunks } = bakeWorld(world);
const all = Object.values(chunks);
const len = (s) => Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);

// ---- the cutting itself
{
  const s = clipSegment({ x: -10, z: 5 }, { x: 300, z: 5 }, 0, 0, 128, 128);
  check('a segment is clipped to a chunk: the part from 0 to 128 of one running from -10 to 300', s && s.a.x === 0 && s.b.x === 128 && s.a.z === 5);
  check('a segment outside a chunk is not in it (and one lying on its far edge is kept, since the box is closed: the plots and roads are given to a chunk by their centre or by cutting)', !clipSegment({ x: 200, z: 5 }, { x: 300, z: 5 }, 0, 0, 128, 128) && clipSegment({ x: 128, z: 0 }, { x: 128, z: 100 }, 0, 0, 128, 128) !== null);
  check('chunks are named by floor(x / 128), negatives included', chunkAt(0, 0).cx === 0 && chunkAt(-0.01, 127.9).cx === -1 && chunkAt(-0.01, 127.9).cz === 0 && chunkKey(-1, 3) === '-1_3' && CHUNK_SIZE === 128);
}

// ---- plots: every one in exactly one chunk, the right one
{
  const placed = new Map();
  for (const c of all) for (const p of c.plots) placed.set(p.id, [...(placed.get(p.id) ?? []), c]);
  check('every plot of every town is in exactly one chunk (2,080 plots)', world.plots.length === 2080 && placed.size === 2080 && [...placed.values()].every((l) => l.length === 1), `${placed.size} placed`);
  check('and it is in the chunk its centre is in, with the place, size and facing the generator gave it', world.plots.every((p) => { const c = placed.get(p.id)[0]; const q = c.plots.find((x) => x.id === p.id); const k = chunkAt(p.x, p.z); return c.cx === k.cx && c.cz === k.cz && q.x === p.x && q.z === p.z && q.w === p.w && q.d === p.d && q.facing === p.facing; }));
  check('the manifest agrees: each town\'s plot count and id range, the first town at the origin, the second at the town index x 1,000,000', manifest.towns.length === 2 && manifest.towns[0].origin.x === 0 && manifest.towns[0].origin.z === 0 && manifest.towns[0].plots.firstId < 1_000_000 && manifest.towns[1].plots.firstId >= 1_000_000 && manifest.towns.reduce((s, t) => s + t.plots.count, 0) === 2080 && manifest.totals.plots === 2080);
}

// ---- roads: the length survives the cutting
{
  const sums = (key) => { const m = new Map(); for (const c of all) for (const s of c[key]) m.set(s.id, (m.get(s.id) ?? 0) + len(s)); return m; };
  const town = sums('roads');
  const bridged = new Map(); // (a street over a river is a river-bridge piece in the highways, not a road piece: Harbor Town's streets over Mill Creek)
  for (const c of all) for (const h of c.highways) if (h.kind === 'river-bridge' && h.on) bridged.set(h.on, (bridged.get(h.on) ?? 0) + len(h));
  check('every town road is baked, and its pieces add up to its length (within a hundredth of a unit a cut)', world.roads.every((r) => Math.abs((town.get(r.id) ?? 0) + (bridged.get(r.id) ?? 0) - (r.to - r.from)) < 0.05 && (town.get(r.id) || bridged.get(r.id))), `${world.roads.length} roads`);
  const hw = sums('highways');
  const ringLength = (h) => h.ring.reduce((s, p, i) => s + Math.hypot(h.ring[(i + 1) % h.ring.length].x - p.x, h.ring[(i + 1) % h.ring.length].z - p.z), 0);
  check('each coastal ring is all there, its pieces (and the bridges over its rivers) adding up to its length', world.highways.every((h) => Math.abs(all.reduce((s, c) => s + c.highways.filter((x) => (x.id === h.id && x.kind === 'ring') || (x.kind === 'river-bridge' && x.on === h.id)).reduce((t, x) => t + len(x), 0), 0) - ringLength(h)) < 3), world.highways.map((h) => ringLength(h).toFixed(0)).join(', '));
  check('each spur, each link and each causeway (road and bridge) is all there too', world.highways.every((h) => h.spurs.every((s) => Math.abs((hw.get(`${h.id}:spur-${s.side}`) ?? 0) - s.length) < 0.1)) && world.links.every((l) => Math.abs((hw.get(l.id) ?? 0) - l.length) < 0.1) && world.causeways.every((c) => Math.abs((hw.get(c.id) ?? 0) - c.length) < 0.1));
  const bridge = all.flatMap((c) => c.highways.filter((s) => s.kind === 'causeway-bridge'));
  check('the bridge sections are marked, with their clearance, and are the 392 and 606 units of water', bridge.length > 0 && bridge.every((s) => Math.abs(s.clearance - 8.7) < 1e-6) && Math.abs(world.causeways.reduce((s, c) => s + c.bridge.length, 0) - bridge.reduce((s, x) => s + len(x), 0)) < 0.5);
  check('every piece lies inside its own chunk', all.every((c) => [...c.roads, ...c.highways].every((s) => [s.a, s.b].every((p) => p.x >= c.bounds.x0 - 0.01 && p.x <= c.bounds.x1 + 0.01 && p.z >= c.bounds.z0 - 0.01 && p.z <= c.bounds.z1 + 0.01))));
}

// ---- the ground
{
  const land = all.filter((c) => c.land > 0);
  check('open sea is not baked: only chunks with land, plots, roads or something standing there (a port boat, a buoy) are in the world', all.every((c) => c.land > 0 || c.ground || c.plots.length || c.roads.length || c.highways.length || c.props?.length || c.structures?.length) && all.length < 400, `${all.length} chunks`);
  check('the manifest lists exactly the chunks that were baked', manifest.chunks.length === all.length && manifest.chunk.count === all.length && manifest.chunks.every((m) => chunks[m.key]));
  const heights = all.filter((c) => c.ground?.h);
  const top = Math.max(...heights.flatMap((c) => c.ground.h)) / 100;
  check('the mountains are in the ground: the Blue Mountains chunks carry heights up to near 18, and flat chunks have none', heights.length >= 30 && top > 15 && top <= 18.1 && all.some((c) => c.land > 0.5 && !c.ground.h), `${heights.length} chunks with heights, highest ${top}`);
  const bm = world.landmasses[0];
  const some = heights.find((c) => c.bounds.x1 < 1300 && c.ground.h.some((h) => h > 800)); // on the mainland
  const i = some.ground.h.findIndex((h) => h > 800);
  const n = some.ground.n;
  const W = n + 3; // the grid has a ring beyond the chunk: index (i, j) from -1 to n + 1 is at (j + 1) * W + (i + 1)
  const px = some.bounds.x0 + (CHUNK_SIZE * ((i % W) - 1)) / n, pz = some.bounds.z0 + (CHUNK_SIZE * (Math.floor(i / W) - 1)) / n;
  check('a baked height is the height function own number: the same at the same place (to the centimetre)', Math.abs(some.ground.h[i] / 100 - elevationAt(bm.features.ranges, px, pz, bm.spec.coast.seed)) < 0.011);
  let shared = true;
  for (const c of heights) { const r = chunks[chunkKey(c.cx + 1, c.cz)]; if (r?.ground?.h) for (let j = -1; j <= n + 1; j++) if (c.ground.h[(j + 1) * W + (n + 1)] !== r.ground.h[(j + 1) * W + 1] || c.ground.h[(j + 1) * W + (n + 2)] !== r.ground.h[(j + 1) * W + 2]) shared = false; } // (the edge column, and the ring beyond it, are the neighbour own numbers)
  check('neighbouring chunks agree along their shared edge (no seam in the ground)', shared);
  check('the ground grid is 32 x 32 cells of sea (0), land (1) or beach (2), and a chunk land share is the share of cells that are not sea', all.filter((c) => c.ground).every((c) => c.ground.mask.length === 1024 && /^[012]+$/.test(c.ground.mask) && Math.abs(c.land - [...c.ground.mask].filter((v) => v !== '0').length / 1024) < 0.006) && all.some((c) => c.ground?.mask.includes('2')));
  check('the harbour, airstrip and ranges are in the manifest, and the first landmass\'s coast is its template', manifest.landmasses.length === 4 && manifest.landmasses[1].features.airstrip.name === 'Harbor Isle Airstrip' && manifest.landmasses[1].features.harbour.quay && manifest.landmasses[0].features.ranges.length >= 4 && manifest.landmasses[0].coast.template === 'jamaica');
  check('the land share is real: a chunk in the middle of the mainland is land (all of it, but for the river channel), one out to sea is not baked', chunks[chunkKey(...Object.values(chunkAt(world.towns[0].plots[0].x, world.towns[0].plots[0].z)))].land > 0.85 && !chunks[chunkKey(0, 20)] && land.length > 100);
}

// ---- the same bytes each time, and the files on disk are a fresh bake
{
  const again = bakeWorld(buildWorld(JSON.parse(JSON.stringify(WORLD_RECIPE))));
  check('baking twice gives the same bytes', JSON.stringify(again.manifest) === JSON.stringify(manifest) && JSON.stringify(again.chunks) === JSON.stringify(chunks));
  let out;
  let ok = true;
  try { out = execFileSync(process.execPath, [path.join(root, 'scripts/bake-world.mjs'), '--check'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { ok = false; out = `${e.stdout}${e.stderr}`; }
  check('the baked files in apps/web/public/world are a fresh bake (run `node scripts/bake-world.mjs` after any change to the recipe or the generators)', ok, out.trim().split('\n').slice(0, 3).join(' | '));
}

// ---- the loader reads it back
{
  const dir = path.join(root, 'apps/web/public/world');
  const baked = await loadBakedWorld(async (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
  const p0 = world.towns[0].plots[0], p1 = world.towns[1].plots[5];
  const a = await baked.plot(p0.id), b = await baked.plot(p1.id);
  check('the loader finds a plot by its global id, in either town', a?.x === p0.x && b?.x === p1.x && b.id >= 1_000_000, `${p0.id}, ${p1.id}`);
  const near = await baked.near(p0.x, p0.z, 130);
  check('and the chunks within a radius of a point (what the runtime asks for): a handful, all with content', near.length >= 4 && near.length <= 9 && near.some((c) => c.plots.length), `${near.length} chunks`);
  check('open sea is null, not an error', (await baked.chunk(0, 40)) === null);
}

// ---- the world can GROW after the bake
{
  // a third town on a third landmass, out from Harbor Isle: the recipe gains entries, and everything already baked stays exactly as it was
  const bigger = JSON.parse(JSON.stringify(WORLD_RECIPE));
  bigger.landmasses.push({ id: 'third-isle', name: 'Third Isle', towns: ['third'], coast: { seed: 5505, margin: 80 }, place: { from: 'harbor-isle', bearing: 100, gap: 300 }, features: ['beaches', 'headlands'] });
  bigger.towns.push({ id: 'third', index: 2, name: 'Third Town', seed: 4242, landmass: 'third-isle', live: false });
  const grown = bakeWorld(buildWorld(bigger));
  const same = Object.keys(chunks).filter((k) => JSON.stringify(grown.chunks[k]) === JSON.stringify(chunks[k]));
  const t0 = grown.manifest.towns.find((t) => t.id === 'voxel'), t1 = grown.manifest.towns.find((t) => t.id === 'harbor');
  const old = Object.values(chunks).filter((c) => c.plots.length || c.roads.length);
  check('adding a third town (index 2) leaves every existing town, plot id, plot place and road exactly where it was', t0.origin.x === 0 && JSON.stringify(t0) === JSON.stringify(manifest.towns[0]) && JSON.stringify(t1) === JSON.stringify(manifest.towns[1]) && old.every((c) => JSON.stringify(grown.chunks[chunkKey(c.cx, c.cz)]?.plots) === JSON.stringify(c.plots) && JSON.stringify(grown.chunks[chunkKey(c.cx, c.cz)]?.roads) === JSON.stringify(c.roads)), `${same.length} of ${Object.keys(chunks).length} chunks byte for byte`);
  const third = grown.manifest.towns.find((t) => t.id === 'third');
  check('the new town\'s plots are numbered from 2,000,000, so no id can meet an old one', third.plots.firstId >= 2_000_000 && third.plots.lastId < 3_000_000 && grown.manifest.totals.plots > 2080);
  const idsOld = new Set(world.plots.map((p) => p.id));
  check('no plot id was reused or renumbered', grown.manifest.towns.slice(0, 2).every((t, i) => t.plots.firstId === manifest.towns[i].plots.firstId && t.plots.lastId === manifest.towns[i].plots.lastId) && idsOld.size === 2080 && Object.values(grown.chunks).flatMap((c) => c.plots).filter((p) => p.town !== 'third').length === 2080);
  // a new road: the same recipe with no causeways, and with them: only the highway records differ
  const noCauseways = JSON.parse(JSON.stringify(WORLD_RECIPE));
  noCauseways.causeways = [];
  noCauseways.tunnels = []; // (a tunnel runs beside a causeway)
  const bare = bakeWorld(buildWorld(noCauseways));
  // (a chunk that is only over open water, with just a bridge in it, is not baked at all without the bridge)
  const cutKeys = new Set(Object.keys(chunks).filter((k) => chunks[k].ground?.h?.some((v) => v < 0))); // (the tunnel's portals cut the ground there: lib/world/tunnelSpec.js; the tunnel is beside a causeway)
  // (the tunnel's approach roads come with the tunnel, which is beside a causeway: left out with the causeways)
  const strip = (cs) => Object.fromEntries(Object.entries(cs).map(([k, c]) => [k, { ...c, ...(cutKeys.has(k) && c.ground ? { ground: { ...c.ground, h: null } } : {}), highways: c.highways.filter((h) => !h.id.endsWith('causeway') && !h.id.startsWith('harbor-tunnel')) }]).filter(([, c]) => c.land > 0 || c.plots.length || c.roads.length || c.highways.length));
  check('adding a road (the causeways, here) changes only the highway records: plots, town roads and ground are identical', JSON.stringify(strip(chunks)) === JSON.stringify(strip(bare.chunks)) && Object.values(bare.chunks).every((c) => c.highways.every((h) => !h.id.endsWith('causeway'))));
  // the first town is still the generator's own, bit for bit
  const city = generateTown(20260101);
  check('the first town\'s plot ids and places are still what the generator gives (the live database holds claims on them)', city.plots.every((p) => { const q = world.towns[0].plots.find((x) => x.id === p.id); return q && Math.abs(q.x - p.x) < 0.006 && Math.abs(q.z - p.z) < 0.006; }) && city.plots.length === world.towns[0].plots.length);
}

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
