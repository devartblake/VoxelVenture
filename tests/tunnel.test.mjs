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
if (plain.approach0 > -(K.inland + K.approach) + 1e-9 || plain.links.length) bad('with no main roads the approach is a plain 40 units before the portal (110 before the bridge road)', String(plain.approach0));
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
if (steepest > K.grade + 1e-6) bad('no grade is steeper than the road limit of 0.12', String(steepest));
if (!up || !down) bad('the road goes down at one end and up at the other', '');
const ramp = T.rampLength();
if (ramp < 40 || ramp > 55 || Math.abs(T.floorY(route, route.s0 + ramp) - K.floor) > 1e-6) bad('a ramp is about 48 units and reaches the floor', String(ramp));
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
console.log(`tunnel: ${route.length.toFixed(0)} units portal to portal, ramps ${ramp.toFixed(0)}, links of ${route.links.map((l) => l.length.toFixed(0)).join(' and ')} units to ${route.links.map((l) => l.road).join(' and ')}`);
total();
