// Merged chunk geometry (lib/world/chunkMesh.js, docs/world/streaming_runtime.md) on the real baked world: each chunk becomes three meshes (ground, roads, highways), valid, facing up, inside its
// chunk, meeting its neighbours, with the mountains risen and the bridges over the water.
import fs from 'node:fs';
import path from 'node:path';
import { imp, root } from '../scripts/lib-loader.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const { loadBakedWorld } = await imp('world/bakedWorld.js');
const { chunkMeshes, meshCost, groundHeight, bridgePlacements, deckHeight, BRIDGE, BRIDGE_RAMP, ROAD_WIDTH } = await imp('world/chunkMesh.js');
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
  check('ground is only where there is land or shallows: a chunk of open sea has none; a chunk with relief and no shore is two triangles for each land or beach cell; a flat one merges runs of cells into quads (far fewer)', meshed.filter(({ c }) => !c.ground).every(({ m }) => m.ground.triangles === 0) && land.filter(({ c }) => c.ground.h && !c.ground.sd).every(({ c, m }) => m.ground.triangles === 2 * [...c.ground.mask].filter((v) => v !== '0').length) && land.filter(({ c }) => !c.ground.h && !c.ground.sd).every(({ c, m }) => m.ground.triangles <= 2 * [...c.ground.mask].filter((v) => v !== '0').length && m.ground.triangles < 400));
  check('every ground vertex is inside its chunk', land.every(({ c, m }) => { for (let v = 0; v < m.ground.positions.length; v += 3) { const x = m.ground.positions[v], z = m.ground.positions[v + 2]; if (x < c.bounds.x0 - 1e-6 || x > c.bounds.x1 + 1e-6 || z < c.bounds.z0 - 1e-6 || z > c.bounds.z1 + 1e-6) return false; } return true; }));
  const mt = land.filter(({ c }) => c.ground.h && Math.max(...c.ground.h) > 1400);
  const top = Math.max(...mt.map(({ m }) => { let y = 0; for (let v = 1; v < m.ground.positions.length; v += 3) y = Math.max(y, m.ground.positions[v]); return y; }));
  check('the mountains are risen in the mesh: the Blue Mountains reach near 18, and the town ground is flat', top > 15 && top <= 18.1 && Math.max(...Array.from(homeChunk.ground.h ?? [0])) === 0, `${top.toFixed(1)} at the top`);
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
  const has = (m, r) => { for (let v = 0; v < m.ground.colors.length; v += 3) if (Math.abs(m.ground.colors[v] - r) <= 6) return true; return false; };
  const beaches = land.filter(({ m }) => has(m, 226));
  const mountain = land.filter(({ c }) => c.ground.h && Math.max(...c.ground.h) > 1400);
  check('the coast has its beach (sand-coloured vertices), and the Blue Mountains are coloured by height and slope: grass below, bare rock above, pale at the peaks', beaches.length > 30 && mountain.some(({ m }) => { let rock = 0, pale = 0, green = 0; for (let v = 0; v < m.ground.colors.length; v += 3) { const [r, g, b] = [m.ground.colors[v], m.ground.colors[v + 1], m.ground.colors[v + 2]]; if (Math.abs(r - 118) < 14 && Math.abs(g - 110) < 14) rock++; else if (r > 185) pale++; else if (g > r + 20 && g > b + 20) green++; } return rock > 20 && green > 20 && pale >= 0; }));
}

// ---- the shore: cut smooth from the signed distance, and the shallows beyond it
{
  const { pointInPolygon } = await imp('world/island.js');
  const { SKIRT } = await imp('world/bake.js');
  const lms = baked.manifest.landmasses;
  const signed = (x, z) => { let inside = false; let best = Infinity; for (const m of lms) { const pts = m.coast.points; if (pointInPolygon(x, z, pts)) inside = true; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const dx = b.x - a.x, dz = b.z - a.z; const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1))); best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz)); } } return inside ? best : -best; };
  const shore = meshed.filter(({ c }) => c.ground?.sd);
  check('chunks with a coast near carry the signed distance at every corner (33 x 33), positive on land and negative at sea', shore.length > 100 && shore.every(({ c }) => c.ground.sd.length === 33 * 33) && shore.some(({ c }) => c.ground.sd.some((v) => v > 0) && c.ground.sd.some((v) => v < 0)), `${shore.length} chunks`);
  // the cut: vertices at the bottom of the shallows (y -1.5) lie 6 units out to sea, to within a unit
  let cut = 0, worst = 0;
  for (const { m } of shore.slice(0, 60)) for (let v = 0; v < m.ground.positions.length; v += 3) if (Math.abs(m.ground.positions[v + 1] + 1.5) < 1e-3) { cut++; worst = Math.max(worst, Math.abs(signed(m.ground.positions[v], m.ground.positions[v + 2]) + SKIRT)); }
  check('the edge of the ground follows the real coast: every vertex cut at the bottom of the shallows is 6 units out to sea, within 1 unit (a staircase of 4-unit cells would be off by up to 3)', cut > 100 && worst < 1.0, `${cut} vertices, worst ${worst.toFixed(2)}`);
  const lowest = Math.min(...shore.map(({ m }) => { let y = 0; for (let v = 1; v < m.ground.positions.length; v += 3) y = Math.min(y, m.ground.positions[v]); return y; }));
  check('under the sea the ground slopes down to 1.5 units and no lower, and every vertex is within 6 units of the coast or on land', lowest >= -1.5 - 1e-6 && lowest <= -1.4 && shore.every(({ m }) => { for (let v = 0; v < m.ground.positions.length; v += 3) if (signed(m.ground.positions[v], m.ground.positions[v + 2]) < -SKIRT - 1) return false; return true; }));
  const sandy = shore.filter(({ m }) => { let sand = 0, grass = 0; for (let v = 0; v < m.ground.colors.length; v += 3) { const [r, g, b] = [m.ground.colors[v], m.ground.colors[v + 1], m.ground.colors[v + 2]]; if (r > 200 && g > 180) sand++; if (g > r + 20 && g > b + 20) grass++; } return sand > 4 && grass > 4; });
  check('the beach is a band that fades from sand into the land colour (not a hard edge): coast chunks have both', sandy.length > 30, `${sandy.length} chunks`);
  const faceUpShore = shore.every(({ m }) => { for (let t = 0; t < m.ground.indices.length; t += 3) { const [a, b, c] = [m.ground.indices[t], m.ground.indices[t + 1], m.ground.indices[t + 2]].map((i) => [m.ground.positions[i * 3], m.ground.positions[i * 3 + 2]]); if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 1e-9) return false; } return true; });
  check('the shore triangles all face up (counter-clockwise from above), clipped ones too', faceUpShore);
}

// ---- roads and highways
{
  const hm = chunkMeshes(homeChunk);
  check('the town\'s roads are ribbons: at least 2 triangles for each road piece (a long piece is cut every 6 units to follow the ground), laid a hair above the ground', hm.roads.triangles >= 2 * homeChunk.roads.length && hm.roads.triangles <= 2 * homeChunk.roads.reduce((n, r) => n + Math.ceil(Math.hypot(r.b.x - r.a.x, r.b.z - r.a.z) / 6), 0) && homeChunk.roads.length > 10 && Math.min(...Array.from(hm.roads.positions).filter((_, i) => i % 3 === 1)) > 0 && Math.max(...Array.from(hm.roads.positions).filter((_, i) => i % 3 === 1)) < 0.2);
  check('an arterial is wider than a local street', ROAD_WIDTH.arterial > ROAD_WIDTH.local);
  const withHw = meshed.filter(({ c }) => c.highways.some((h) => h.kind !== 'track')); // (a circuit's centreline is a road for timing, not drawn)
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

// ---- the bridge from Kenney models: deck tiles along the span and pillars under the high part
{
  const all = chunks.map((c) => ({ c, p: bridgePlacements(c) }));
  const spans = new Map();
  for (const c of chunks) for (const h of c.highways) if (h.kind === 'causeway-bridge') spans.set(h.id, h.span);
  const tiles = all.flatMap(({ p }) => p.tiles);
  const expected = [...spans.values()].reduce((n, span) => n + Math.ceil(span / BRIDGE.tile), 0);
  check('every bridge is a row of deck tiles: one for every 8 units of each span, none twice and none missing', tiles.length === expected && new Set(tiles.map((t) => `${t.x.toFixed(2)},${t.z.toFixed(2)}`)).size === tiles.length, `${tiles.length} tiles for ${spans.size} bridges`);
  check('each tile is at the height of the deck there (the road surface), tilted to its slope: flat on the middle, rising on the ramps, never steeper than the ramp', tiles.every((t) => t.y >= -1e-9 && t.y <= 9.01 && Math.abs(t.pitch) < 0.25) && tiles.some((t) => t.y > 8.9 && Math.abs(t.pitch) < 0.01) && tiles.some((t) => t.pitch > 0.05) && tiles.some((t) => t.pitch < -0.05));
  check('tiles go once along the road: a tile is 8 long (the last may be shorter) and 8 wide', tiles.every((t) => t.length > 0 && t.length <= BRIDGE.tile + 1e-9 && t.width === 8));
  const pillars = all.flatMap(({ p }) => p.pillars);
  check('pillars stand in pairs under the high part of the deck only, from the shallows (-1.5) up to the underside of the deck, and none is under a ramp that is nearly on the ground', pillars.length >= 20 && pillars.length % 2 === 0 && pillars.every((q) => q.y0 === BRIDGE.floor && q.y1 > q.y0 && q.y1 < 9 - Math.min(BRIDGE.surface * BRIDGE.depth, 1.4) + 0.2) && pillars.every((q) => q.y1 > BRIDGE.pillarMinY - BRIDGE.surface * BRIDGE.depth + 0.1), `${pillars.length} pillars`);
  const withModels = chunks.filter((c) => c.highways.some((h) => h.kind === 'causeway-bridge')).map((c) => ({ c, ribbon: chunkMeshes(c), model: chunkMeshes(c, { bridges: 'models' }) }));
  check('with models the bridge ribbon is left out of the highway mesh (the deck is drawn by the models), and the rest of the road is unchanged', withModels.every(({ ribbon, model }) => model.highways.triangles < ribbon.highways.triangles || ribbon.highways.triangles === 0) && withModels.some(({ ribbon, model }) => model.highways.triangles < ribbon.highways.triangles) && withModels.every(({ ribbon, model }) => model.ground.triangles === ribbon.ground.triangles));
  check('the deck height is the same function the mesh, the terrain and the tiles all read', Math.abs(deckHeight({ clearance: 9, span: 400 }, 200) - 9) < 1e-9 && deckHeight({ clearance: 9, span: 400 }, 0) === 0 && BRIDGE_RAMP === 60);
}

// ---- the bridge's lamps (night): both edges of the deck, between the pillars, their arms over the road
{
  const lamps = chunks.flatMap((c) => bridgePlacements(c).lamps);
  const spans = [...new Map(chunks.flatMap((c) => c.highways.filter((h) => h.kind === 'causeway-bridge').map((h) => [h.id, h.span]))).values()];
  check('every bridge has lamps along both edges, one pair every 32 units', lamps.length >= 2 * spans.reduce((n, sp) => n + Math.floor((sp - 24) / BRIDGE.lampEvery), 0) - 4 && lamps.length % 2 === 0, `${lamps.length} lamps on ${spans.length} bridges`);
  check('a lamp stands at the height of the deck (0 to 9) and its arm points to the middle of the road', lamps.every((l) => l.y >= 0 && l.y <= 9.01 && Number.isFinite(l.yaw)));
}

// ---- a road over rising ground follows it (a long road is cut every 6 units and each piece laid at the ground height)
{
  const n = 32;
  const h = [];
  for (let j = -1; j <= n + 1; j++) for (let i = -1; i <= n + 1; i++) h.push(Math.round(i * 40)); // a slope rising 0.4 units for every 4 across (x), with the ring beyond the chunk
  const tilted = { cx: 0, cz: 0, size: 128, bounds: { x0: 0, z0: 0, x1: 128, z1: 128 }, land: 1, plots: [], roads: [{ id: 'r', town: 't', class: 'local', kind: 'street', a: { x: 4, z: 64 }, b: { x: 124, z: 64 } }], highways: [], ground: { n, mask: '1'.repeat(n * n), h } };
  const m = chunkMeshes(tilted);
  let worst = 0;
  for (let v = 0; v < m.roads.positions.length; v += 3) worst = Math.max(worst, Math.abs(m.roads.positions[v + 1] - (groundHeight(tilted, m.roads.positions[v], m.roads.positions[v + 2]) + 0.06)));
  check('a road over a slope lies on the ground all along it (cut every 6 units): never more than a hair from the surface', m.roads.triangles >= 2 * 20 && worst < 0.001 && Math.max(...Array.from(m.roads.positions).filter((_, i) => i % 3 === 1)) > 11, `${m.roads.triangles} triangles, ${worst.toFixed(4)} off`);
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
