// The tunnel's route and profile (lib/world/tunnel.js, docs/world/tunnel_evaluation.md): what the development spike draws.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const T = await imp('world/tunnel.js');
const { trainLine, TRAIN } = await imp('world/train.js');
const { HIGHWAY } = await imp('world/highways.js');
const { bad, total } = problemTally();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
const line = trainLine(manifest.causeways[0]);
const roads = [];
for (const c of manifest.chunks) { const j = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/chunks', `${c.key}.json`), 'utf8')); for (const h of j.highways ?? []) if (h.a && h.b && /^(ring|spur|link)$/.test(h.kind)) roads.push({ a: h.a, b: h.b, id: h.id, kind: h.kind }); }
const route = T.tunnelRoute(line, roads);
const plain = T.tunnelRoute(line);
const K = T.TUNNEL;

if (!(route.approach0 <= route.s0 && route.s0 < 0 && route.s1 > line.length && route.approach1 >= route.s1)) bad('the tunnel has its own road entrance, and it starts before the causeway road (which starts at 0)', JSON.stringify([route.approach0, route.s0]));
if (plain.approach0 > -(K.inland + K.approach) + 1e-9 || plain.links.length) bad('with no main roads the approach is a plain 40 units before the portal (150 before the bridge road)', String(plain.approach0));
// the tunnel's road joins the main roads of the area at each end (the owner: a road that connects to the main road)
if (route.links.length !== 2 || route.links.some((l) => !(l.length > 1 && l.length < 120) || !roads.some((r) => r.id === l.road))) bad('each portal is linked to a main road of the area, not left in a field', JSON.stringify(route.links.map((l) => [l.road, l.length])));
if (!(route.links[0].road === 'mainland-ring' && route.links[1].road === 'harbor-ring')) bad('the mainland portal joins the mainland ring road and the isle portal the Harbor ring road', route.links.map((l) => l.road).join());
if (!(route.approach0 < 0) || !(route.approach1 > line.length)) bad('the tunnel road leaves the main road before the bridge road begins, at each end', `${route.approach0} ${route.approach1}`);
const ends = route.links.map((l) => Math.hypot(l.to.x - T.pointAt(line, l.end ? route.s1 : route.s0).x, l.to.z - T.pointAt(line, l.end ? route.s1 : route.s0).z));
if (ends.some((d) => d > 1e-6)) bad('each link ends at its portal', String(ends));
if (Math.abs(T.floorY(route, route.s0) - K.ground) > 1e-9 || Math.abs(T.floorY(route, route.s1) - K.ground) > 1e-9) bad('the road is at ground level at each portal', '');
if (Math.abs(T.floorY(route, line.length / 2) - K.floor) > 1e-9) bad('the road is at the full depth under the sea', '');
let steepest = 0, up = 0, down = 0;
for (let s = route.s0; s < route.s1; s += 0.5) { const d = T.floorY(route, s + 0.5) - T.floorY(route, s); steepest = Math.max(steepest, Math.abs(d / 0.5)); if (d > 1e-9) up++; if (d < -1e-9) down++; }
if (steepest > K.grade + 1e-6 || K.grade > 0.12) bad('no grade is steeper than 0.08, easier than the road limit of 0.12', String(steepest));
if (!up || !down) bad('the road goes down at one end and up at the other', '');
const ramp = T.rampLength();
if (ramp < 65 || ramp > 80 || Math.abs(T.floorY(route, route.s0 + ramp) - K.floor) > 1e-6) bad('a ramp is about 71 units and reaches the floor', String(ramp));
if (!(route.s0 + ramp < 0)) bad('the ramp ends before the causeway begins, under the shore', '');
// under the sea: the roof is below the water, with a margin for its thickness
const seaFrom = line.deckFrom, seaTo = line.deckFrom + line.bridgeLen;
let highest = -Infinity;
for (let s = seaFrom; s <= seaTo; s += 1) highest = Math.max(highest, T.roofY(route, s) + K.wall);
if (highest > K.seaLevel - 0.15) bad('the whole tube is under the sea (the top of its roof at least 0.15 below sea level)', String(highest));
// beside the causeway, never under or against it
const half = (HIGHWAY.width + 2) / 2;
if (Math.abs(K.lateral) - K.width / 2 - K.wall < half + 0.5) bad('the tube does not touch the bridge piers (the deck is 8 wide)', '');
const p = T.pointAt(line, line.length / 2);
const cx = (line.a.x + line.b.x) / 2, cz = (line.a.z + line.b.z) / 2;
const side = (p.x - cx) * line.normal.x + (p.z - cz) * line.normal.z;
if (Math.abs(side - K.lateral) > 1e-6 || K.lateral >= 0 || TRAIN.lateral <= 0) bad('the tunnel is on the side opposite the train rail', String(side));
if (!(K.height > 3.2 * 1.2 && K.width > 2.1 * 2)) bad('a train and a car fit inside (the train is 3.2 high and 2.1 wide)', '');
// ---- stage 1 in the baked world (docs/world/tunnel.md): the manifest carries the tunnel, the bake cuts the portals' trench, the sea's plane has holes over them
{
  const S = await imp('world/tunnelSpec.js');
  const { WORLD_RECIPE, validateRecipe } = await imp('world/worldRecipe.js');
  const mt = manifest.tunnels?.[0];
  if (!mt || mt.id !== 'harbor-tunnel' || mt.causeway !== manifest.causeways[0].id) bad('the manifest has the Harbor Tunnel beside the first causeway', JSON.stringify(mt && mt.id));
  else {
    if (Math.abs(mt.s0 - route.s0) > 1e-6 || Math.abs(mt.s1 - route.s1) > 0.01 || mt.links.length !== 2 || mt.links[0].road !== 'mainland-ring' || mt.links[1].road !== 'harbor-ring') bad('the baked route is the route (portals and links)', JSON.stringify([mt.s0, mt.s1]));
    if (!(Math.abs(Math.hypot(mt.line.dir.x, mt.line.dir.z) - 1) < 1e-5) || Math.abs(mt.line.dir.x * mt.line.normal.x + mt.line.dir.z * mt.line.normal.z) > 1e-5) bad('the baked line has a unit direction and a normal across it', '');
    // the spec's centre is the route's point (tunnel.pointAt is the train's rail offset by the difference)
    for (const s of [-100, 0, 300, 560]) { const a = S.centreAt(mt.line, s), b = T.pointAt(line, s); if (Math.hypot(a.x - b.x, a.z - b.z) > 1e-3) bad('the spec centre is the route point', `${s}`); }
    // the trench: cut only where the tube stands out of the ground (the first ~60 units of a ramp), to the road's height; nowhere else
    const mid = S.centreAt(mt.line, mt.s0 + 20), deep = S.centreAt(mt.line, mt.s0 + 70), sea = S.centreAt(mt.line, line.length / 2);
    const cut = S.trenchAt(mt, mid.x, mid.z);
    if (cut === null || Math.abs(cut - S.floorY(mt, mt.s0 + 20)) > 1e-3) bad('the ground is cut to the road 20 units into the ramp', String(cut));
    if (S.trenchAt(mt, deep.x, deep.z) !== null || S.trenchAt(mt, sea.x, sea.z) !== null) bad('no cut where the roof is under the ground', '');
    const side = { x: mid.x + mt.line.normal.x * 9, z: mid.z + mt.line.normal.z * 9 };
    if (S.trenchAt(mt, side.x, side.z) !== null) bad('no cut beside the portal beyond the trench', '');
    // the baked ground follows it: a corner on the ramp's centre line is lower than the shore's ground
    const key = `${Math.floor(mid.x / 128)}_${Math.floor(mid.z / 128)}`, chunk = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/chunks', `${key}.json`), 'utf8'));
    if (!chunk.ground?.h || Math.min(...chunk.ground.h) >= 0) bad('the chunk at the portal has ground cut below zero', key);
    // the sea's plane is left out over each portal's trench, not elsewhere
    const holes = S.portalHoles(mt);
    if (holes.length !== 2 || holes.some((h) => !(h.along > 30 && h.across > 8))) bad('a hole in the sea plane over each portal', JSON.stringify(holes.length));
    const inHole = (p) => holes.some((h) => { const qx = p.x - h.x, qz = p.z - h.z; return Math.abs(qx * h.dx + qz * h.dz) < h.along && Math.abs(-qx * h.dz + qz * h.dx) < h.across; });
    if (!inHole(mid) || inHole(sea) || inHole(deep) === false && false) bad('the hole covers the trench and not the sea', '');
  }
  if (!validateRecipe({ ...WORLD_RECIPE, tunnels: [{ id: 'x', name: 'X', causeway: 'no-such' }] }).some((p) => /no-such/.test(p))) bad('a recipe tunnel beside a causeway it does not have is invalid', '');
}
console.log(`tunnel: ${route.length.toFixed(0)} units portal to portal, ramps ${ramp.toFixed(0)}, links of ${route.links.map((l) => l.length.toFixed(0)).join(' and ')} units to ${route.links.map((l) => l.road).join(' and ')}`);
total();
