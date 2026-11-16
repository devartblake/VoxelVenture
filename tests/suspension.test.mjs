// The suspension bridge on Harbor Causeway (lib/world/suspension.js, docs/world/suspension_bridge.md): towers, cables, suspenders and a girder deck, and no piers under the main span.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const S = await imp('world/suspension.js');
const { SUSPENSION } = await imp('world/suspensionSpec.js');
const { trainLine, TRAIN } = await imp('world/train.js');
const { bridgePlacements, deckHeight } = await imp('world/chunkMesh.js');
const { bad, total } = problemTally();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
const causeway = manifest.causeways.find((c) => SUSPENSION.ids.includes(c.id));
const line = trainLine(causeway);
const bridge = { id: line.id, span: line.bridgeLen, clearance: line.clearance };
const st = S.suspension(bridge);

// ---- which bridges
if (!causeway || causeway.id !== 'harbor-causeway' || manifest.causeways.filter((c) => SUSPENSION.ids.includes(c.id)).length !== 1) bad('only Harbor Causeway (the first) is a suspension bridge', '');
if (S.isSuspension({ id: 'north-causeway' }) || !S.isSuspension({ id: 'harbor-causeway' })) bad('the North Causeway keeps the plain deck', '');

// ---- the towers
if (st.towers.length !== 2) bad('two towers', String(st.towers.length));
const [t0, t1] = st.towers;
if (Math.abs(t0.s - 0.17 * bridge.span) > 1e-6 || Math.abs(t1.s - 0.83 * bridge.span) > 1e-6) bad('the towers stand at 17% and 83%: side spans of a sixth, a main span of two thirds', `${t0.s} ${t1.s}`);
if (Math.abs(t0.top - t0.deck - bridge.clearance * SUSPENSION.heightAbove) > 1e-6 || t0.top < 25) bad('a tower rises 2.4 times the deck height above the deck (about 22 units over a deck 9 high)', `${t0.top - t0.deck}`);
if (t0.legs.length !== 2 || t0.legs.some((l) => Math.abs(l.lateral) <= 4.1)) bad('each tower has two legs standing outside the 8-wide deck, so nothing on the road touches them', JSON.stringify(t0.legs.map((l) => l.lateral)));
const boxes = t0.legs[0].boxes;
if (boxes[0].y0 > -1.4 || Math.abs(boxes.at(-1).y1 - t0.top) > 1e-6) bad('a leg runs from the foundation to the head', `${boxes[0].y0} ${boxes.at(-1).y1}`);
if (!(boxes.at(-1).across < boxes[1].across && boxes.at(-1).along < boxes[1].along)) bad('a leg tapers toward its head', '');
if (boxes.some((b, i) => i && Math.abs(b.y0 - boxes[i - 1].y1) > 1e-6 && i > 1)) bad('the boxes of a leg meet end to end', '');
if (t0.braces.length !== 5 || Math.min(...t0.braces.map((b) => b.y - t0.deck)) < 4.0 || Math.max(...t0.braces.map((b) => b.y)) > t0.top) bad('five cross struts, the lowest more than 4 units over the deck (a train is 3.2 high) and none above the head', JSON.stringify(t0.braces.map((b) => (b.y - t0.deck).toFixed(1))));

// ---- the cables
const sides = new Set(st.cables.map((c) => c.side));
if (st.cables.length !== 6 || sides.size !== 2) bad('a main cable and two back-stays on each side', String(st.cables.length));
const main = st.cables.filter((c) => c.part === 'main');
for (const c of main) {
  if (Math.abs(c.points[0].y - t0.top) > 1e-6 || Math.abs(c.points.at(-1).y - t1.top) > 1e-6) bad('the main cable hangs from the head of one tower to the other', `${c.points[0].y} ${c.points.at(-1).y}`);
  const low = Math.min(...c.points.map((p) => p.y));
  const deckAtLow = deckHeight(bridge, c.points.find((p) => p.y === low).s);
  if (!(low > deckAtLow + 1.5 && low < deckAtLow + 4.5)) bad('the cable sags to a couple of units over the deck at mid-span', `${low - deckAtLow}`);
}
const cableMid = main[0].points[Math.floor(main[0].points.length / 2)];
if (Math.abs(cableMid.s - bridge.span / 2) > 1) bad('the lowest point of the cable is at mid-span', String(cableMid.s));
for (const c of st.cables) for (const p of c.points) if (p.y < deckHeight(bridge, p.s) + 0.9) bad('a cable never comes down to the deck', `${c.part} ${p.s} ${p.y}`);
const stays = st.cables.filter((c) => c.part !== 'main');
if (stays.some((c) => !(c.points.some((p) => p.s === 0) || c.points.some((p) => Math.abs(p.s - bridge.span) < 1e-6)))) bad('a back-stay runs to the end of the bridge', '');
// the cables stand over the legs, outside the deck
if (SUSPENSION.legOffset <= 4.1) bad('the cables hang outside the deck', '');

// ---- the suspenders
const hangers = st.hangers;
if (hangers.length < 60 || hangers.length > 220) bad('a few dozen suspenders on each side', String(hangers.length));
if (hangers.some((h) => !(h.y1 > h.y0 + 0.8) || Math.abs(h.y0 - deckHeight(bridge, h.s)) > 1e-6 || Math.abs(h.y1 - st.cableAt(h.s)) > 1e-6)) bad('every suspender runs from the deck up to the cable', '');
if (new Set(hangers.map((h) => h.side)).size !== 2) bad('suspenders on both sides', '');
if (hangers.some((h) => Math.abs(h.s - t0.s) < 2 || Math.abs(h.s - t1.s) < 2)) bad('no suspender at a tower', '');

// ---- the lights at night: a red beacon on every leg's head, a warm light at each strut end and along the cables
const beacons = st.lights.filter((l) => l.kind === 'beacon'), warm = st.lights.filter((l) => l.kind === 'warm');
if (beacons.length !== 4 || beacons.some((b) => Math.abs(b.y - (t0.top + 0.6)) > 1e-6 && Math.abs(b.y - (t1.top + 0.6)) > 1e-6)) bad('a red beacon on the head of each of the four legs', String(beacons.length));
if (warm.length < 40 || st.lights.some((l) => !Number.isFinite(l.s + l.lateral + l.y))) bad('warm lights on the struts and along the cables', String(warm.length));
if (warm.some((l) => l.y < deckHeight(bridge, l.s) + 0.5)) bad('no light is below the deck', '');
// ---- the deck
const deck = S.deckSegments(bridge);
if (deck.length < 90 || deck.some((g) => !(g.length > 3 && g.length <= SUSPENSION.deckSegment + 1e-6))) bad('the deck is cut into 4-unit pieces', String(deck.length));
if (Math.abs(deck.reduce((n, g) => n + g.length, 0) - bridge.span) > 1e-6) bad('the pieces add up to the whole bridge', '');
if (deck.some((g) => Math.abs(g.y - deckHeight(bridge, g.s)) > 0.2 || Math.abs(g.pitch) > 0.25)) bad('the road surface follows the game deck (a car on it stands on it)', '');
if (SUSPENSION.deckWidth !== 8) bad('as wide as the plain deck', '');

// ---- no piers under the main span, and the piers of the side spans meet the thinner deck
const chunks = [];
for (const c of manifest.chunks) { const j = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/chunks', `${c.key}.json`), 'utf8')); if (j.highways?.some((h) => h.id === 'harbor-causeway' && h.kind === 'causeway-bridge')) chunks.push(j); }
if (chunks.length < 3) bad('the first causeway crosses several chunks', String(chunks.length));
const placed = chunks.map((c) => ({ c, p: bridgePlacements(c) }));
const piers = placed.flatMap(({ p }) => p.pillars);
const onLine = (q) => (q.x - line.a.x) * line.dir.x + (q.z - line.a.z) * line.dir.z - line.deckFrom; // s along the bridge
const inside = piers.filter((q) => { const s = onLine(q); return s > t0.s + 3 && s < t1.s - 3; });
if (inside.length) bad('no pier stands under the main span, between the towers', String(inside.length));
if (piers.length < 6) bad('the side spans keep their piers', String(piers.length));
if (piers.some((q) => q.y1 > 9 - SUSPENSION.deckThickness + 0.2)) bad('a pier reaches up to the underside of the thinner girder', '');
if (placed.flatMap(({ p }) => p.tiles).some((t) => t.styled !== 'suspension')) bad('every deck tile of the bridge is flagged: the layer draws it, the kit tiles do not', '');
// the lamps stand on the deck: on the kerb walk, its top 0.12 over the road surface the girder really has, within a hair
const lamps = placed.flatMap(({ p }) => p.lamps);
if (lamps.length < 16) bad('the bridge has lamps', String(lamps.length));
const K = SUSPENSION.kerb;
let worst = 0;
for (const l of lamps) {
  const s = onLine(l);
  const lateral = (l.x - line.a.x) * line.normal.x + (l.z - line.a.z) * line.normal.z;
  const g = deck.find((q) => Math.abs(q.s - s) <= q.length / 2 + 1e-9);
  const surface = g.y + Math.tan(g.pitch) * (s - g.s);
  worst = Math.max(worst, Math.abs(l.y - (surface + K.height)));
  if (Math.abs(Math.abs(lateral) - K.centre) > 0.01) bad('a lamp stands in the middle of the kerb walk', String(lateral));
  if (Math.abs(lateral) + K.width / 2 > SUSPENSION.deckWidth / 2 + 0.01) bad('the kerb walk is on the deck', '');
}
if (worst > 0.02) bad('every lamp stands on the kerb, within 2 cm of the real road surface plus the kerb height (aligned with the bridge floor)', String(worst));
// the train and the tunnel stay clear of the structure
if (TRAIN.lateral + (TRAIN.scale * 1.4) / 2 > 4.1 || TRAIN.lateral + TRAIN.scale * 0.7 > SUSPENSION.legOffset) bad('the train fits between the legs', '');
if (S.towerS(100)[0] !== 17) bad('towerS', '');
console.log(`suspension: towers ${t0.top.toFixed(1)} high at ${t0.s.toFixed(0)} and ${t1.s.toFixed(0)}, ${hangers.length} suspenders, ${deck.length} deck pieces, ${piers.length} piers on the side spans`);
total();
