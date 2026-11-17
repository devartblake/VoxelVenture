// The bridge where the coastal ring crosses the Rio Minho (lib/world/riverBridge.js, lib/world/bake.js, docs/world/river_plan.md): a deck that rises over the channel so a boat passes under, with a girder, parapets and
// piers, a road that stays one road, and a deck a car can drive over.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const B = await imp('world/riverBridge.js');
const { chunkMeshes, deckHeight } = await imp('world/chunkMesh.js');
const { loadBakedWorld } = await imp('world/bakedWorld.js');
const { createTerrain, LIMITS } = await imp('world/terrain.js');
const { SEA_LEVEL, SEA_FLOOR } = await imp('world/datum.js');
const { bad, total } = problemTally();
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---- the spans along a road: a channel of 10 units at 50 to 60 is a bridge from the bank's margin and ramps on each side
const wet = (s) => s >= 50 && s <= 60;
const spans = B.spansAlong(200, wet);
const o = B.RIVER_BRIDGE;
if (spans.length !== 1 || !near(spans[0].s0, 50 - o.margin - o.ramp, 0.6) || !near(spans[0].s1, 60 + o.margin + o.ramp, 0.6)) bad('a channel makes one bridge: its margin and ramps on each side', JSON.stringify(spans));
if (B.spansAlong(200, (s) => (s >= 50 && s <= 60) || (s >= 80 && s <= 90)).length !== 1) bad('two channels close enough for their ramps to meet are one bridge', '');
if (B.spansAlong(500, (s) => (s >= 50 && s <= 60) || (s >= 400 && s <= 410)).length !== 2) bad('two far channels are two bridges', '');
if (B.spansAlong(20, () => false).length !== 0) bad('no channel, no bridge', '');
const clipped = B.spansAlong(40, (s) => s >= 30);
if (!(clipped[0].s1 <= 40 + 1e-9 && clipped[0].s0 >= 0)) bad('a bridge is kept to the road', JSON.stringify(clipped));

// ---- the boxes: normals of unit length, indices in range, every face turned out of its box
const piece = { a: { x: 0, z: 0 }, b: { x: 30, z: 0 }, width: 6, clearance: 2.4, ramp: 12, span: 30, along: [0, 30], channel: [8, 22] };
const boxes = B.bridgeBoxes(piece, (s) => deckHeight(piece, s), () => 0, SEA_FLOOR);
const n = boxes.positions.length / 3;
if (n < 100 || boxes.colors.length !== n * 3 || boxes.normals.length !== n * 3 || boxes.indices.some((i) => i >= n)) bad('the boxes are well formed: positions, normals and colours for each vertex, indices in range', `${n}`);
for (let i = 0; i < n; i++) if (!near(Math.hypot(boxes.normals[i * 3], boxes.normals[i * 3 + 1], boxes.normals[i * 3 + 2]), 1, 1e-6)) { bad('every normal is a unit vector', String(i)); break; }
let inward = 0;
for (let t = 0; t < boxes.indices.length; t += 3) {
  const [a, b, c] = [0, 1, 2].map((k) => boxes.indices[t + k] * 3), p = boxes.positions;
  const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
  const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (cr[0] * boxes.normals[a] + cr[1] * boxes.normals[a + 1] + cr[2] * boxes.normals[a + 2] <= 0) inward++;
}
if (inward) bad('every triangle faces the way its normal points (out of the box)', String(inward));
let top = -Infinity, bottom = Infinity;
for (let i = 1; i < boxes.positions.length; i += 3) { top = Math.max(top, boxes.positions[i]); bottom = Math.min(bottom, boxes.positions[i]); }
if (!(top > deckHeight(piece, 15) + 0.1 + o.parapet.height - 0.05) || !near(bottom, SEA_FLOOR, 0.05)) bad('the parapets stand over the road and the piers reach the bed', `${top} ${bottom}`);

// ---- the deck: from the ground up over the ramp to the clearance and back down
if (!near(deckHeight(piece, 0), 0) || !near(deckHeight(piece, 30), 0) || !near(deckHeight(piece, 15), 2.4) || !near(deckHeight(piece, 12), 2.4, 1e-9) || !(deckHeight(piece, 6) > 0 && deckHeight(piece, 6) < 2.4)) bad('the deck rises from the ground over the ramp to the clearance and comes down', '');

// ---- the baked bridge on the real ring
const dir = path.join(root, 'apps/web/public/world');
const baked = await loadBakedWorld(async (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
const loaded = new Map();
for (const c of baked.manifest.chunks) loaded.set(c.key, await baked.chunk(c.cx, c.cz));
const pieces = [];
for (const c of loaded.values()) for (const h of c.highways) if (h.kind === 'river-bridge') pieces.push({ c, h });
const ids = [...new Set(pieces.map(({ h }) => h.id))];
if (ids.length !== 14 || pieces.some(({ h }) => h.on !== 'mainland-ring' || h.clearance !== o.clearance || h.id !== h.id.replace(/-bridge$/, '') + '-bridge')) bad('the ring is bridged once over each of the fourteen rivers and nowhere else (no spur or link touches a river)', JSON.stringify(ids));
const minho = pieces.filter(({ h }) => h.id === 'rio-minho-bridge');
const spanOf = new Set(minho.map(({ h }) => h.span));
if (spanOf.size !== 1) bad('the pieces of a bridge share one span (a corner in the channel does not split it)', JSON.stringify([...spanOf]));
for (const id of ids) { const spans = new Set(pieces.filter(({ h }) => h.id === id).map(({ h }) => h.span)); if (spans.size !== 1) bad('every bridge is one span', id); }
const sorted = minho.map(({ h }) => h).sort((x, y) => x.along[0] - y.along[0]);
for (let i = 1; i < sorted.length; i++) if (!near(sorted[i].along[0], sorted[i - 1].along[1], 0.05)) bad('the pieces follow one another along the bridge', `${sorted[i - 1].along} ${sorted[i].along}`);
if (!near(sorted[0].along[0], 0, 0.05) || !near(sorted.at(-1).along[1], sorted[0].span, 0.05)) bad('the pieces cover the whole span', '');
// the road is one road: the ring pieces next to the bridge start and end where it does
const ends = [sorted[0].a, sorted.at(-1).b];
let joined = 0;
for (const c of loaded.values()) for (const h of c.highways) if (h.kind === 'ring') for (const e of ends) if (Math.hypot(h.a.x - e.x, h.a.z - e.z) < 0.02 || Math.hypot(h.b.x - e.x, h.b.z - e.z) < 0.02) joined++;
if (joined < 2) bad('the ring road meets the bridge at both ends, with no gap', String(joined));

// ---- what is drawn: the deck lies over the water, with the boxes as a mesh of their own
const withBridge = pieces.map(({ c }) => c).filter((c, i, a) => a.indexOf(c) === i);
for (const c of withBridge) {
  const m = chunkMeshes(c);
  if (!m.bridges.triangles || !m.bridges.normals || !m.bridges.colors) bad('the bridge boxes are a mesh of their own with normals and colours', c.cx + '_' + c.cz);
  const parts = Object.values(m).filter((x) => x.triangles).length;
  if (parts > 4) bad('a chunk with a bridge has no more than four meshes (ground, roads, highways, the bridge)', String(parts));
}

// ---- the lamps (docs/world/river_plan.md): the ring road's lamps over every river, one on each side every 14 units, inside the parapet, on the road, once each
const { riverBridgeLamps, RIVER_LAMP } = await imp('world/chunkMesh.js');
const { buildChunkObject, createChunkMaterials } = await imp('world/chunkObject.js');
const THREE = await import('three');
let lampsTotal = 0;
const lampSet = new Set();
for (const c of withBridge) {
  const lamps = riverBridgeLamps(c);
  lampsTotal += lamps.length;
  for (const l of lamps) {
    const key = `${l.x.toFixed(2)},${l.z.toFixed(2)}`;
    if (lampSet.has(key)) bad('a lamp is once (not in two chunks)', key);
    lampSet.add(key);
    if (!Number.isFinite(l.x + l.y + l.z + l.yaw)) bad('a lamp has a place and a turn', key);
    // inside the deck's width, over the road's surface
    const near = c.highways.filter((h) => h.kind === 'river-bridge').map((h) => { const dx = h.b.x - h.a.x, dz = h.b.z - h.a.z, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((l.x - h.a.x) * dx + (l.z - h.a.z) * dz) / l2)); return { h, d: Math.hypot(l.x - (h.a.x + t * dx), l.z - (h.a.z + t * dz)) }; }).sort((x, y) => x.d - y.d)[0];
    if (!(near.d > near.h.width / 2 - RIVER_LAMP.inset - 0.2 && near.d < near.h.width / 2 - RIVER_LAMP.inset + 0.2)) bad('a lamp stands just inside the parapet, at the edge of the deck', `${near.d.toFixed(2)} of ${near.h.width}`);
    if (!(l.y >= 0.05)) bad('a lamp stands on the road surface (over the ground)', String(l.y));
  }
}
if (lampsTotal < ids.length * 6) bad('every bridge has at least six lamps (three a side)', String(lampsTotal));
const lampPerBridge = lampsTotal / ids.length;
if (!(lampPerBridge >= 6 && lampPerBridge <= 16)) bad('a bridge has between six and sixteen lamps', String(lampPerBridge));
// the chunk object draws them as one instanced mesh (the same lamp model as the causeways), and a light pool for each
{
  const mats = createChunkMaterials(THREE);
  const model = (g) => ({ geometry: g, material: new THREE.MeshStandardMaterial() });
  const models = { deck: null, props: { lightPostModern: model(new THREE.BoxGeometry(0.1, 0.8, 0.1)) }, pool: model(new THREE.CircleGeometry(1, 8)) };
  const c = withBridge.find((x) => riverBridgeLamps(x).length);
  const g = buildChunkObject(THREE, c, mats, { models });
  const lamps = g.children.find((m) => m.name.endsWith(':bridge-lamps')), pools = g.children.find((m) => m.name.endsWith(':light-pools'));
  if (!lamps || lamps.count !== riverBridgeLamps(c).length) bad('the chunk draws its river bridge lamps as one instanced mesh', String(lamps?.count));
  if (!pools || pools.count < riverBridgeLamps(c).length) bad('each lamp has its pool of light on the road (dark by day: the glow is the game night)', String(pools?.count));
  const none = buildChunkObject(THREE, c, mats, { models: { deck: null, props: {} } });
  if (none.children.some((m) => m.name.endsWith(':bridge-lamps'))) bad('without the lamp model there are no lamps', '');
}

// ---- the terrain: a car drives over the deck, a boat sails under it, a person on the deck is at the deck height
const have = new Set(baked.manifest.chunks.map((c) => c.key));
const terrain = createTerrain({ chunkAt: (cx, cz) => loaded.get(`${cx}_${cz}`), has: (cx, cz) => have.has(`${cx}_${cz}`) });
const cmid = (sorted[0].channel[0] + sorted[0].channel[1]) / 2; // the middle of the channel, along the whole bridge
const mid = sorted.find((h) => h.along[0] <= cmid && h.along[1] >= cmid);
const tt = (cmid - mid.along[0]) / (mid.along[1] - mid.along[0]);
const chan = [mid.a.x + (mid.b.x - mid.a.x) * tt, mid.a.z + (mid.b.z - mid.a.z) * tt];
const deck = terrain.sample(chan[0], chan[1]);
if (deck.surface !== 'bridge' || !(deck.y > 1) || !terrain.canStand(chan[0], chan[1], 'car') || !terrain.canStand(chan[0], chan[1], 'walk')) bad('on the deck over the channel the surface is a bridge, high over the water, and a car and a person can be on it', JSON.stringify([deck.surface, deck.y]));
if (!(deck.y - SEA_LEVEL > 2)) bad('a boat has more than two units of clearance under the deck', String(deck.y - SEA_LEVEL));
if (!(deck.sd < -LIMITS.boat.depth) || !terrain.canStand(chan[0], chan[1], 'boat')) bad('the water under the deck is deep enough for a boat', String(deck.sd));
console.log(`river bridge: ${pieces.length} baked pieces, span ${sorted[0].span}, deck ${deck.y.toFixed(2)} over the water at the middle, ${boxes.indices.length / 3} triangles in a 30-unit bridge`);
total();
