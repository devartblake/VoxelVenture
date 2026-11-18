// Stage 2 of the tunnel (lib/world/tunnelSpec.js layers, lib/world/terrain.js, docs/world/tunnel.md): a person or a car can go in at one portal, along the tube's road and out at the other, on the tunnel layer; the walls,
// the kerb and the cut ground beyond a mouth hold them in; the ground above the tube is still the ground; the rail side is kerbed off.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const { createTerrain } = await imp('world/terrain.js');
const S = await imp('world/tunnelSpec.js');
const { loadBakedWorld } = await imp('world/bakedWorld.js');
const { SEA_LEVEL } = await imp('world/datum.js');
const { bad, total } = problemTally();
const dir = path.join(root, 'apps/web/public/world');
const baked = await loadBakedWorld(async (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
const loaded = new Map();
for (const c of baked.manifest.chunks) loaded.set(c.key, await baked.chunk(c.cx, c.cz));
const have = new Set(baked.manifest.chunks.map((c) => c.key));
const mt = baked.manifest.tunnels[0], K = S.TUNNEL;
const terrain = createTerrain({ chunkAt: (cx, cz) => loaded.get(`${cx}_${cz}`), has: (cx, cz) => have.has(`${cx}_${cz}`), tunnels: baked.manifest.tunnels });
// a point at `s` along the tunnel and `lat` across it (from the tube's middle, positive toward the road side, away from the causeway)
const at = (s, lat) => { const c = S.centreAt(mt.line, s); return { x: c.x - mt.line.normal.x * lat, z: c.z - mt.line.normal.z * lat }; };
const frame = (p) => S.tunnelFrame(mt, p.x, p.z);

if (!(K.laneFrom < 0 && K.railOffset > 0 && K.mouth > 0 && K.pitLen > 60)) bad('the stage 2 constants', '');
const lane = 1.5; // the middle of the road lane

// ---- go through on foot or by car, from either portal to the other
for (const mode of ['walk', 'car']) for (const dirn of [1, -1]) {
  const from = dirn > 0 ? mt.s0 - 30 : mt.s1 + 30, to = dirn > 0 ? mt.s1 + 30 : mt.s0 - 30;
  let p = at(from, lane), layer = 'surface', prevY = terrain.groundY(p.x, p.z, layer), maxStep = 0, blocked = 0, enters = 0, leaves = 0, lowest = Infinity;
  const stepLen = mode === 'car' ? 0.3 : 0.15;
  for (let s = from; dirn > 0 ? s < to : s > to; s += dirn * stepLen) {
    const target = at(s + dirn * stepLen, lane), r = terrain.move(p.x, p.z, target.x - p.x, target.z - p.z, mode, layer);
    if (r.blocked.x || r.blocked.z) { blocked++; break; }
    if (r.layer !== layer) { if (r.layer === 'tunnel') enters++; else leaves++; }
    p = { x: r.x, z: r.z }; layer = r.layer;
    const y = terrain.groundY(p.x, p.z, layer);
    maxStep = Math.max(maxStep, Math.abs(y - prevY)); prevY = y; lowest = Math.min(lowest, y);
  }
  const tag = `${mode} ${dirn > 0 ? 'mainland to isle' : 'isle to mainland'}`;
  if (blocked) bad('you can go through the whole tunnel (not stopped)', `${tag}: stopped at s=${frame(p).s.toFixed(1)}`);
  if (enters !== 1 || leaves !== 1 || layer !== 'surface') bad('in at one mouth, out at the other: one change of layer each way', `${tag}: ${enters} in, ${leaves} out, ends on ${layer}`);
  if (maxStep > 0.2) bad('the height is continuous (no jump at a mouth or a ramp)', `${tag}: ${maxStep.toFixed(2)}`);
  if (Math.abs(lowest - K.floor) > 0.05) bad('at the bottom the road is at the tunnel floor', `${tag}: ${lowest}`);
}

// ---- inside: the walls, the kerb and the rail side hold you
{
  const inside = at(mt.s0 + 120, lane);
  const into = (lat) => { const q = at(mt.s0 + 120, lat); return terrain.move(inside.x, inside.z, q.x - inside.x, q.z - inside.z, 'walk', 'tunnel'); };
  const wall = into(K.width / 2 + 0.6), rail = into(-1.5);
  if (!(wall.blocked.x || wall.blocked.z)) bad('the wall stops you (the causeway side)', '');
  if (!(rail.blocked.x || rail.blocked.z)) bad('the kerb keeps you off the rail', '');
  const lanePoint = at(mt.s0 + 120, 1.5), railPoint = at(mt.s0 + 120, -1.5);
  if (terrain.sample(lanePoint.x, lanePoint.z, 'tunnel').surface !== 'tunnel') bad('the road lane is the tunnel layer', '');
  if (terrain.sample(railPoint.x, railPoint.z, 'tunnel').surface !== 'wall') bad('the rail side is not standable', '');
  if (terrain.canStand(inside.x, inside.z, 'boat', 'tunnel')) bad('no boat in the tube', '');
  // under the sea the tunnel layer is below the water and the surface above it is the sea
  const mid = at((mt.s0 + mt.s1) / 2, lane);
  if (!(terrain.groundY(mid.x, mid.z, 'tunnel') < SEA_LEVEL - 4) || terrain.sample(mid.x, mid.z).surface === 'tunnel') bad('under the sea: the tunnel layer is deep, the surface layer is the sea', '');
}

// ---- above the tube the ground is the ground, and you cannot drop in from the side or over the roof
{
  const above = at(mt.s0 + 100, lane); // under the grass, over the tube
  const g = terrain.sample(above.x, above.z);
  if (g.surface === 'tunnel' || !(g.y > -0.5)) bad('over the tube the surface layer is the ground', JSON.stringify(g));
  if (!terrain.canStand(above.x, above.z, 'walk')) bad('you can walk on the ground over the tube', '');
  let p = at(mt.s0 + 100, 8), layer = 'surface';
  for (let i = 0; i < 80; i++) { const t = at(mt.s0 + 100, 8 - i * 0.2), r = terrain.move(p.x, p.z, t.x - p.x, t.z - p.z, 'walk', layer); p = { x: r.x, z: r.z }; layer = r.layer; }
  if (layer !== 'surface') bad('crossing over the tube does not put you in it', layer);
  // the cut ground inside a portal (beyond the mouth) is closed to the surface layer: from the side you cannot get in
  const cut = at(mt.s0 + 30, 0), sy = terrain.sample(cut.x, cut.z);
  if (!(sy.surface === 'pit' || sy.surface === 'wall' || sy.surface === 'rail')) bad('the cut ground inside the portal is closed to the surface layer', sy.surface);
  const wallPoint = at(mt.s0 + 30, K.width / 2 + 0.2);
  if (terrain.canStand(wallPoint.x, wallPoint.z, 'walk')) bad('the tube wall that stands out of the ground is a wall', '');
  // the mouth itself is open ground
  const mouth = at(mt.s0 + 2, lane);
  if (!terrain.canStand(mouth.x, mouth.z, 'walk') || !terrain.canStand(mouth.x, mouth.z, 'car')) bad('the mouth of a portal is open ground', '');
}
// ---- the approach roads come from the road side and never run over the rail
{
  const roads = [];
  for (const c of baked.manifest.chunks) for (const h of loaded.get(c.key).highways ?? []) if (h.id.startsWith('harbor-tunnel-link')) roads.push(h);
  if (roads.length < 4) bad('each portal has an approach road of two legs', String(roads.length));
  const half = (K.width / 2 - K.laneFrom) / 2; // the baked road is as wide as the lane
  if (roads.some((h) => Math.abs(h.width - half * 2) > 1e-6)) bad('an approach road is as wide as the lane', JSON.stringify(roads.map((h) => h.width)));
  const seg = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz); };
  // the ring roads are on the road side: every link leaves its ring road from a point with lat > 0
  for (const l of mt.links) if (!(frame(l.from).lat > 0)) bad('the approach road leaves the ring road from the road side of the tunnel', `${l.road} lat ${frame(l.from).lat.toFixed(1)}`);
  // the rail (from the stations to the portals, 1.6 on the other side of the tube's middle) is clear of every approach road's ribbon
  let worst = Infinity;
  for (const end of [[mt.s0 - 40, mt.s0 + 10], [mt.s1 - 10, mt.s1 + 40]]) for (let s = end[0]; s <= end[1]; s += 1) {
    const rail = at(s, -K.railOffset);
    for (const h of roads) worst = Math.min(worst, seg(rail, h.a, h.b) - h.width / 2);
  }
  if (!(worst > 0.3)) bad('the rail is clear of the approach roads (the train does not overlap the road)', `${worst.toFixed(2)} units of clearance`);
  console.log(`  rail clear of the approach roads by ${worst.toFixed(2)} units`);
}
console.log(`tunnel walk: in and out of both portals on foot and by car (${baked.manifest.tunnels.length} tunnel)`);
if (total()) process.exitCode = 1;
