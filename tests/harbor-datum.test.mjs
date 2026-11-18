// Harbor Town against the datum (lib/world/datum.js, docs/world/datum.md): the town is baked into the world's chunks, so it stands on the datum's ground, its roads lie at the datum's lifts and its plots are on level ground.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const D = await imp('world/datum.js');
const { groundHeight, LIFT } = await imp('world/chunkMesh.js');
const { bad, total } = problemTally();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
const town = manifest.towns.find((t) => t.id === 'harbor');
const L = town.land, S = manifest.chunk.size;

const chunks = [];
for (const c of manifest.chunks) {
  const x0 = c.cx * S, z0 = c.cz * S;
  if (x0 < L.x1 && x0 + S > L.x0 && z0 < L.z1 && z0 + S > L.z0) chunks.push(JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/chunks', `${c.key}.json`), 'utf8')));
}
if (chunks.length < 10) bad('the chunks over Harbor Town\'s land are found', String(chunks.length));

// the ground: every chunk over the town is flat, at the datum's town ground
// (the tunnel's isle portal is in the town land's south-west corner, 40 units from any plot or street: its trench is the only cut ground, lib/world/tunnelSpec.js, and it is under the tube)
const hilly = chunks.filter((c) => c.ground?.h && !c.ground.h.some((v) => v < 0));
if (hilly.length) bad('every chunk over Harbor Town is flat ground (the datum\'s town ground)', hilly.map((c) => `${c.cx}_${c.cz}`).join(' '));
for (const c of chunks) if (groundHeight(c, c.bounds.x0 + 1, c.bounds.z0 + 1) !== D.TOWN_GROUND) bad('Harbor Town\'s ground is the datum town ground', `${c.cx}_${c.cz}`);
if (!(D.TOWN_GROUND > D.SEA_LEVEL)) bad('the town ground is over the sea', '');

// roads and plots, once each (a road or a plot is in every chunk it touches)
const roads = new Map(), plots = new Map();
for (const c of chunks) {
  for (const r of c.roads ?? []) if (r.town === 'harbor') roads.set(r.id, r);
  for (const p of c.plots ?? []) if (p.town === 'harbor') plots.set(p.id, p);
}
if (roads.size < 10 || plots.size < 100) bad('Harbor Town has its roads and plots', `${roads.size} roads, ${plots.size} plots`);
if (LIFT.road !== D.LIFT.road || LIFT.highway !== D.LIFT.highway) bad('its roads are laid at the datum lifts', JSON.stringify(LIFT));
// every road end and plot sits on ground at the datum height (the ground is flat there)
for (const r of roads.values()) for (const e of [r.a, r.b]) {
  const c = chunks.find((k) => e.x >= k.bounds.x0 && e.x < k.bounds.x1 && e.z >= k.bounds.z0 && e.z < k.bounds.z1);
  if (c && groundHeight(c, e.x, e.z) !== D.TOWN_GROUND) bad('a road end of Harbor Town is on the datum ground', r.id);
}
for (const p of plots.values()) if (!(p.x - p.w / 2 >= L.x0 && p.x + p.w / 2 <= L.x1 && p.z - p.d / 2 >= L.z0 && p.z + p.d / 2 <= L.z1)) bad('a plot of Harbor Town is inside the town\'s land', String(p.id));

// not live: it has no town slab or town water of its own yet (those are the first town's, the datum's open items), so it inherits nothing from them
if (town.live) bad('Harbor Town is not live: when it is, its slab and water must be put on the datum (docs/world/datum.md)', '');
console.log(`Harbor Town on the datum: ${chunks.length} flat chunks at ${D.TOWN_GROUND}, ${roads.size} roads, ${plots.size} plots`);
total();
