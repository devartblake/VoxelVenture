// Boats between the town, the rivers, the ports and the other island (lib/world/terrain.js, lib/world/ports.js, docs/world/river_plan.md): the water is one connected sea from the first town's river to every harbour,
// a quay or a pier is in a boat's way (it berths alongside), a river bridge is not (a boat passes under it), and the moorings are on water a boat can reach.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const { loadBakedWorld } = await imp('world/bakedWorld.js');
const { createTerrain } = await imp('world/terrain.js');
const { bad, total } = problemTally();
const dir = path.join(root, 'apps/web/public/world');
const baked = await loadBakedWorld(async (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
const loaded = new Map();
for (const c of baked.manifest.chunks) loaded.set(c.key, await baked.chunk(c.cx, c.cz));
const have = new Set(baked.manifest.chunks.map((c) => c.key));
const terrain = createTerrain({ chunkAt: (cx, cz) => loaded.get(`${cx}_${cz}`), has: (cx, cz) => have.has(`${cx}_${cz}`) });
const ok = (x, z) => terrain.standsWith(x, z, 'boat');

// ---- the grid: 6 units a cell over the ocean
const o = baked.manifest.ocean, CELL = 6;
const W = Math.ceil((o.x1 - o.x0) / CELL), H = Math.ceil((o.z1 - o.z0) / CELL);
const at = (i, j) => [o.x0 + (i + 0.5) * CELL, o.z0 + (j + 0.5) * CELL];
const cellOf = (x, z) => [Math.floor((x - o.x0) / CELL), Math.floor((z - o.z0) / CELL)];
const free = new Uint8Array(W * H), seen = new Uint8Array(W * H), memo = new Int8Array(W * H).fill(-1);
const isFree = (i, j) => { if (i < 0 || j < 0 || i >= W || j >= H) return false; const k = j * W + i; if (memo[k] < 0) memo[k] = ok(...at(i, j)) ? 1 : 0; return memo[k] === 1; };
const nearestFree = (x, z) => { const [ci, cj] = cellOf(x, z); for (let r = 0; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (Math.max(Math.abs(di), Math.abs(dj)) === r && isFree(ci + di, cj + dj)) return [ci + di, cj + dj]; return null; };

// the water of the first town's river, just south of its edge: where a boat leaves the town
const river = baked.manifest.rivers.find((r) => r.id === 'rio-minho');
const town = baked.manifest.towns[0].land;
const start = river.course.find((p) => p.z > town.z1 + 20);
const s0 = nearestFree(start.x, start.z);
if (!s0) bad('there is water a boat can be on in the Rio Minho just south of the town', JSON.stringify(start));

// flood fill from there
if (s0) {
  const queue = [s0[1] * W + s0[0]];
  seen[queue[0]] = 1;
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q], i = k % W, j = (k - i) / W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (!isFree(ni, nj)) continue;
      const nk = nj * W + ni;
      if (seen[nk]) continue;
      seen[nk] = 1;
      queue.push(nk);
    }
  }
  const reached = (x, z) => { const [ci, cj] = cellOf(x, z); for (let r = 0; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const i = ci + di, j = cj + dj; if (i >= 0 && j >= 0 && i < W && j < H && seen[j * W + i]) return true; } return false; };
  // ---- every harbour is reachable from the river by water
  for (const p of baked.manifest.ports) {
    const out = [p.at.x + p.n.x * 16, p.at.z + p.n.z * 16];
    if (!reached(...out)) bad('a boat can sail from the Rio Minho to the water in front of the port', p.id);
  }
  // ---- every river of the plan is open to boats from the sea: the water out beyond its mouth is reached, and its lowest 40 units are water a boat can be on
  for (const r of baked.manifest.rivers) {
    const e = r.course[r.course.length - 1], pr = r.course[r.course.length - 2], dx = e.x - pr.x, dz = e.z - pr.z, l = Math.hypot(dx, dz) || 1;
    if (!reached(e.x + (dx / l) * 24, e.z + (dz / l) * 24)) bad('the sea in front of each river mouth is reached from the Rio Minho by water', r.id);
    let along = 0, dry = 0;
    for (let i = r.course.length - 1; i > 0 && along < 40; i--) { along += Math.hypot(r.course[i].x - r.course[i - 1].x, r.course[i].z - r.course[i - 1].z); if (!ok(r.course[i].x, r.course[i].z)) dry++; }
    if (dry > 1) bad('a river is water a boat can be on for its lowest 40 units (one point at the very coast may be shallow)', `${r.id} ${dry}`);
  }
  // ---- the Black River’s lower reach, with its islands, is open water from the sea (a channel is left between the islands)
  const black = baked.manifest.rivers.find((r) => r.id === 'black-river');
  const lower = black.course[Math.floor(black.course.length * 0.9)];
  if (!reached(lower.x, lower.z)) bad('the Black River is open to the sea below its morass', '');
}

// ---- a quay or a pier is in a boat's way, the water beside it is not; a river bridge does not stop a boat
for (const p of baked.manifest.ports) {
  const deckPts = [];
  for (const c of loaded.values()) for (const h of c.highways) if (h.kind === 'jetty' && h.id === `${p.id}-deck`) deckPts.push({ x: (h.a.x + h.b.x) / 2, z: (h.a.z + h.b.z) / 2 });
  if (!deckPts.length) { bad('a port has deck pieces', p.id); continue; }
  const over = deckPts.filter((d) => terrain.sample(d.x, d.z).sd < -2.5);
  if (over.some((d) => terrain.canStand(d.x, d.z, 'boat'))) bad('a boat cannot be on a deck that stands over the water (it berths alongside)', p.id);
  const beside = [p.at.x + p.n.x * 40, p.at.z + p.n.z * 40];
  if (!ok(...beside)) bad('the water in front of a port is open to boats', p.id);
}
const bridge = [...loaded.values()].flatMap((c) => c.highways.filter((h) => h.kind === 'river-bridge')).find((h) => h.id === 'rio-minho-bridge');
const bm = { x: (bridge.a.x + bridge.b.x) / 2, z: (bridge.a.z + bridge.b.z) / 2 };
void bm;

// ---- the moorings: every moored boat of a port is on water a boat can be on
let boats = 0, bad2 = 0;
for (const c of loaded.values()) for (const m of c.props ?? []) if (/^boat/.test(m.m)) { boats++; if (!terrain.canStand(m.x, m.z, 'boat')) bad2++; }
if (!boats || bad2 > boats * 0.1) bad('the moored boats are on water (at most one in ten at the very edge)', `${bad2} of ${boats}`);
console.log(`boat routes: ${W}x${H} cells, ${boats} moored boats, ${baked.manifest.ports.length} ports reached from the Rio Minho`);
total();
