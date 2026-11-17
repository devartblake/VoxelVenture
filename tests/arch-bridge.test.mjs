// The arch bridge on the North Causeway (lib/world/archBridge.js, docs/world/arch_bridge.md): two latticed ribs, hangers and posts, struts, four pylons, a girder deck and no piers under the arch.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const A = await imp('world/archBridge.js');
const { ARCH } = await imp('world/archSpec.js');
const { SUSPENSION } = await imp('world/suspensionSpec.js');
const { bridgeKind, deckOf } = await imp('world/bridgeStyles.js');
const { deckSegments } = await imp('world/suspension.js');
const { trainLine } = await imp('world/train.js');
const { bridgePlacements } = await imp('world/chunkMesh.js');
const { bad, total } = problemTally();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
const causeway = manifest.causeways.find((c) => ARCH.ids.includes(c.id));
const line = trainLine(causeway);
const bridge = { id: line.id, span: line.bridgeLen, clearance: line.clearance };
const a = A.archBridge(bridge);

// ---- which bridges are which
if (!causeway || causeway.id !== 'north-causeway') bad('the North Causeway is the arch bridge', '');
if (bridgeKind({ id: 'north-causeway' }) !== 'arch' || bridgeKind({ id: 'harbor-causeway' }) !== 'suspension' || bridgeKind({ id: 'x' }) !== null) bad('each causeway has its own style', '');
if (deckOf({ id: 'north-causeway' }) !== ARCH || deckOf({ id: 'harbor-causeway' }) !== SUSPENSION || deckOf({ id: 'x' }) !== null) bad('a styled bridge has its deck numbers', '');
if (ARCH.ids.some((id) => SUSPENSION.ids.includes(id))) bad('no bridge is both', '');

// ---- the arch
const [a0, a1] = A.archS(bridge.span);
if (Math.abs(a.a0 - 0.1 * bridge.span) > 1e-6 || Math.abs(a.a1 - 0.9 * bridge.span) > 1e-6 || a1 - a0 < 400) bad('the arch spans 80% of the bridge, between approaches of 10%', `${a.a0} ${a.a1}`);
if (a.a0 < 60 - 1e-6) bad('the arch springs from where the deck is at its full height (the ramp is 60 long)', String(a.a0));
const mid = (a0 + a1) / 2;
if (Math.abs(a.topAt(mid) - a.topAt(mid + 0.01)) > 0.01 || a.topAt(mid) < a.topAt(a0 + 40) || a.topAt(mid) < a.topAt(a1 - 40)) bad('the crown is at the middle and is the highest point', '');
if (a.crown < bridge.clearance + 20 || a.crown > 60) bad('the crown stands well over the deck (more than 20 units) and not absurdly high', String(a.crown));
for (const s of [a0, a1]) if (Math.abs(a.bottomAt(s) + (a.topAt(s) - a.bottomAt(s)) / 2 - ARCH.springAbove) > 1e-6) bad('the ribs spring from the springing height', '');
if (!(a.topAt(mid) - a.bottomAt(mid) < a.topAt(a0) - a.bottomAt(a0))) bad('a rib is deeper at the springing than at the crown', '');
if (a.ribs.length !== 2 || a.ribs.some((r) => Math.abs(Math.abs(r.lateral) - ARCH.legOffset) > 1e-9) || ARCH.legOffset <= 4.1) bad('two ribs outside the 8-wide deck', '');
const rib = a.ribs[0];
if (rib.top.length !== rib.bottom.length || rib.web.length !== rib.top.length - 1 || rib.uprights.length !== rib.top.length) bad('a web member in each panel and an upright at each joint', `${rib.top.length} ${rib.web.length}`);
if (rib.web.some((w, i) => i && (w.from.y === rib.web[i - 1].from.y))) bad('the web zigzags (Warren)', '');
if (rib.web.some((w, i) => i && Math.abs(w.from.s - rib.web[i - 1].to.s) > 1e-9)) bad('the web members meet at the joints', '');

// ---- the deck hangs from the arch and stands on it
if (a.hangers.length < 40 || a.hangers.some((h) => !(h.y1 > a.deckY(h.s) + 0.8) || h.y0 > a.deckY(h.s))) bad('hangers run from the deck girder up to the bottom chord, in the middle of the span', String(a.hangers.length));
if (a.posts.length < 4 || a.posts.some((p) => !(p.y0 < a.deckY(p.s)) || p.y1 > a.deckY(p.s))) bad('posts carry the deck from the ribs where the arch is below it, near the ends', String(a.posts.length));
if (a.hangers.some((h) => h.s <= a0 || h.s >= a1)) bad('the hangers are inside the span', '');
// every cross strut leaves room under it for a train and a lorry
if (a.struts.length < 20 || a.struts.some((s) => s.y - a.deckY(s.s) < ARCH.strutClear - 1e-6)) bad('cross struts only where there is room under them (4.5 over the deck at least)', String(a.struts.length));
// nothing of the arch comes down into the road: no rib is inside the deck's width, no hanger is
if (a.ribs.some((r) => Math.abs(r.lateral) < 4.3)) bad('the ribs do not stand in the road', '');

// ---- the pylons
if (a.pylons.length !== 4 || new Set(a.pylons.map((p) => p.s)).size !== 2) bad('four pylons, two at each end', String(a.pylons.length));
if (a.pylons.some((p) => Math.abs(p.lateral) < 4.3 + ARCH.pylon.across / 2)) bad('the pylons stand beside the deck, not on it', '');
const py = a.pylons[0];
if (py.boxes[0].y0 > -1.4 || Math.abs(py.top - (a.deckY(py.s) + ARCH.pylon.top + 0.7)) > 1e-6 || !(py.boxes.at(-2).across < py.boxes[1].across)) bad('a pylon runs from the foundation to its cap and tapers', '');

// ---- the deck, the piers, the lamps
const deck = deckSegments(bridge);
if (deck.length < 140 || Math.abs(deck.reduce((n, g) => n + g.length, 0) - bridge.span) > 1e-6) bad('the deck is cut into 4-unit pieces over the whole bridge', String(deck.length));
const chunks = [];
for (const c of manifest.chunks) { const j = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/chunks', `${c.key}.json`), 'utf8')); if (j.highways?.some((h) => h.id === 'north-causeway' && h.kind === 'causeway-bridge')) chunks.push(j); }
if (chunks.length < 4) bad('the second causeway crosses several chunks', String(chunks.length));
const placed = chunks.map((c) => ({ c, p: bridgePlacements(c) }));
const onLine = (q) => (q.x - line.a.x) * line.dir.x + (q.z - line.a.z) * line.dir.z - line.deckFrom;
const piers = placed.flatMap(({ p }) => p.pillars);
if (piers.filter((q) => { const s = onLine(q); return s > a0 + 3 && s < a1 - 3; }).length) bad('no pier stands under the arch', '');
if (piers.length < 4) bad('the approaches keep their piers', String(piers.length));
if (piers.some((q) => q.y1 > bridge.clearance - ARCH.deckThickness + 0.2)) bad('a pier reaches up to the underside of the girder', '');
if (placed.flatMap(({ p }) => p.tiles).some((t) => t.styled !== 'arch')) bad('every kit deck tile of this bridge is flagged: the arch layer draws the deck', '');
const lamps = placed.flatMap(({ p }) => p.lamps);
let worst = 0;
for (const l of lamps) {
  const s = onLine(l);
  const lateral = (l.x - line.a.x) * line.normal.x + (l.z - line.a.z) * line.normal.z;
  const g = deck.find((q) => Math.abs(q.s - s) <= q.length / 2 + 1e-9);
  worst = Math.max(worst, Math.abs(l.y - (g.y + Math.tan(g.pitch) * (s - g.s) + ARCH.kerb.height)));
  if (Math.abs(Math.abs(lateral) - ARCH.kerb.centre) > 0.01) bad('a lamp stands in the middle of the kerb', String(lateral));
}
if (lamps.length < 20 || worst > 0.02) bad('every lamp stands on the kerb, aligned with the girder surface', `${lamps.length} lamps, ${worst}`);

// ---- the lights at night
const kinds = (l) => l.filter((x) => x.kind === 'beacon').length;
if (kinds(a.lights) !== 2 || a.lights.length < 40) bad('a beacon on each rib at the crown and a string of lights along the arch', `${kinds(a.lights)} beacons, ${a.lights.length} lights`);
if (a.lights.some((l) => !Number.isFinite(l.s + l.lateral + l.y))) bad('every light has a place', '');
const rods = a.ribs.reduce((n, r) => n + r.top.length * 2 + r.web.length + r.uprights.length, 0) + a.hangers.length * 2 + a.posts.length * 2;
if (rods > 2200) bad('the arch stays cheap to draw (instances)', String(rods));
console.log(`arch: crown ${a.crown.toFixed(1)}, ${rods} rods, ${a.hangers.length} hangers, ${a.posts.length} posts, ${a.struts.length} struts, ${a.lights.length} lights, ${piers.length} approach piers`);
total();
