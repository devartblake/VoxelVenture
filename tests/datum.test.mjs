// The world's datum (lib/world/datum.js, docs/world/datum.md): the named heights are consistent, every system that stands on them reads them, and the sources do not grow a number of their own.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const D = await imp('world/datum.js');
const { SEA_LEVEL: terrainSea } = await imp('world/terrain.js');
const { WATER_Y } = await imp('city/surfaceHeight.js');
const { LIFT: chunkLift, BRIDGE } = await imp('world/chunkMesh.js');
const { TUNNEL } = await imp('world/tunnel.js');
const { SUSPENSION } = await imp('world/suspensionSpec.js');
const { ARCH } = await imp('world/archSpec.js');
const { LAND_LIFT } = await imp('world/train.js');
const { bad, total } = problemTally();

// ---- the values
if (!(D.SEA_FLOOR < D.SEA_LEVEL && D.SEA_LEVEL < D.TOWN_GROUND && D.TOWN_GROUND <= D.TOWN_WATER)) bad('the datum is ordered: the seabed under the sea under the town ground, the town water at or over it', JSON.stringify([D.SEA_FLOOR, D.SEA_LEVEL, D.TOWN_GROUND, D.TOWN_WATER]));
if (!(D.LIFT.road > 0 && D.LIFT.road < D.LIFT.highway && D.LIFT.prop > 0 && D.LIFT.rail > D.LIFT.highway)) bad('lifts: a road under a highway, and the rail over both', JSON.stringify(D.LIFT));
if (!(D.SHORE_GROUND > 0 && D.SHORE_GROUND < 0.5) || D.DECK_BASE !== D.TOWN_GROUND) bad('the shore is 0 to 0.5 and decks are measured from the town ground', '');
if (Math.abs(D.overSea(9) - 9.3) > 1e-9) bad('a deck 9 high is 9.3 over the water', String(D.overSea(9)));
const ls = D.layers();
if (new Set(ls.map((l) => l.id)).size !== ls.length || ls.some((l) => !Number.isFinite(l.y) || !/^#[0-9a-f]{6}$/.test(l.color) || !l.label)) bad('every layer has a unique id, a height, a colour and a label', '');
const y = (id) => ls.find((l) => l.id === id).y;
if (!(y('townTop') > D.TOWN_GROUND && y('townTop') < D.LIFT.road)) bad('the town slab is a hair over the town ground, under the roads', String(y('townTop')));
if (!(y('tunnelFloor') < y('tunnelRoof') && y('tunnelRoof') < y('sea') && y('sea') > y('seaFloor') && y('deck') > y('sea') + 5)) bad('the layers stack: the tunnel under the sea, the deck high over it', '');

// ---- every system reads the datum
if (terrainSea !== D.SEA_LEVEL) bad('the terrain uses the datum sea level', String(terrainSea));
if (WATER_Y !== D.TOWN_WATER) bad('the town uses the datum town water', String(WATER_Y));
if (chunkLift.road !== D.LIFT.road || chunkLift.highway !== D.LIFT.highway) bad('roads and highways are laid at the datum lifts', JSON.stringify(chunkLift));
if (BRIDGE.floor !== D.SEA_FLOOR || SUSPENSION.foot !== D.SEA_FLOOR || ARCH.foot !== D.SEA_FLOOR) bad('bridge piers and foundations stand on the datum seabed', '');
if (TUNNEL.seaLevel !== D.SEA_LEVEL || TUNNEL.ground !== D.SHORE_GROUND) bad('the tunnel uses the datum sea level and shore', '');
if (LAND_LIFT !== D.LIFT.rail) bad('the train rail uses the datum rail lift', '');
if (TUNNEL.floor + TUNNEL.height + TUNNEL.wall >= D.SEA_LEVEL) bad('the tunnel roof (with its thickness) stays under the sea', '');
if (TUNNEL.floor - 0.12 - TUNNEL.wall < D.SEA_FLOOR - 6) bad('the tunnel is not absurdly far below the seabed', '');
// the causeways' decks: their flat height is the baked clearance, over the datum's deck base
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
for (const c of manifest.causeways) if (!(c.clearance >= 8 && D.overSea(c.clearance) > c.clearance)) bad('a causeway deck leaves room for a boat under it, measured over the water', `${c.id}: ${c.clearance}`);

// the racing circuit's paint layers, the train's rail on a deck, and what owners build on a plot, all at the datum's lifts
const { PALETTE } = await imp('world/track.js');
const paint = (name) => PALETTE.find((p) => p.name === name).y;
if (paint('gravel') !== D.LIFT.paint.gravel || paint('asphalt') !== D.LIFT.paint.asphalt || paint('line') !== D.LIFT.paint.mark || paint('black') !== D.LIFT.paint.top) bad('the circuit paint layers are the datum ones', '');
if (!(D.LIFT.paint.gravel < D.LIFT.paint.asphalt && D.LIFT.paint.asphalt < D.LIFT.paint.mark && D.LIFT.paint.mark < D.LIFT.paint.top)) bad('the paint layers are stacked: gravel, asphalt, marks, the top', '');
if (!(D.LIFT.yard > D.LIFT.plot && D.LIFT.deckRail > 0)) bad('a yard\'s models stand over its ground, and the rail over the deck', '');
const { buildPieces } = await imp('content/modularBuild.js');
const { PROP_CATALOG } = await imp('content/propCatalog.js');
const piece = buildPieces({ id: 1, owner: 'x', x: 0, z: 0, w: 3, d: 3, facing: 1, yaw: 0, height: 1.2, exterior: { floors: 1, build: { front: 'doorway', back: 'plain', sides: 'plain', windows: 'square', corners: 'plain', roof: 'none' } } }, { front: 'doorway', back: 'plain', sides: 'plain', windows: 'square', corners: 'plain', roof: 'none' }, PROP_CATALOG)[0];
if (!piece || Math.abs(piece.y - D.LIFT.plot) > 1e-9) bad('a building\'s pieces stand at the datum\'s plot lift on the ground floor', String(piece?.y));

// ---- what is still unsettled is listed, and listed honestly
const ids = D.DATUM_ISSUES.map((i) => i.id).sort().join();
if (ids !== 'animal-water,deck-from-ground,town-top,town-water-vs-sea') bad('the known disagreements: the town water against the sea, decks from the ground, the town slab, the animals', ids);
const gap = (id) => D.DATUM_ISSUES.find((i) => i.id === id).gap;
if (Math.abs(gap('town-water-vs-sea') - (D.TOWN_WATER - D.SEA_LEVEL)) > 1e-9 || Math.abs(gap('deck-from-ground') + D.SEA_LEVEL) > 1e-9 || Math.abs(gap('animal-water') - 0.009) > 1e-9 || gap('town-top') !== D.TOWN_GROUND_TOP) bad('each disagreement states its real size', '');

// ---- the sources do not grow a height of their own
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const files = [];
const walk = (dir, filter) => { for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { const rel = `${dir}/${e.name}`; if (e.isDirectory()) { if (e.name !== 'data') walk(rel, filter); } else if (filter(rel)) files.push(rel); } };
walk('lib/world', (f) => /\.js$/.test(f));
files.push('lib/city/surfaceHeight.js', 'lib/sim/animals.js');
walk('apps/web/components/world', (f) => /\.jsx$/.test(f));
files.push('apps/web/components/city/River.jsx', 'apps/web/components/city/Vehicles.jsx');
const rules = [
  { name: 'the sea level is declared once, in the datum', re: /\b(?:const|let|var)\s+SEA_LEVEL\s*=|export\s+const\s+SEA_LEVEL\s*=/ },
  { name: 'the water height is declared once, in the datum', re: /\b(?:const|let|var)\s+WATER_Y\s*=\s*[-\d]|export\s+const\s+WATER_Y\s*=\s*[-\d]/ },
  { name: 'the town water height (0.026) is the datum\'s, not a copy', re: /(?<![\w.])0\.026(?!\d)/ },
];
const worldOnly = [
  { name: 'the seabed (-1.5) is the datum\'s SEA_FLOOR, not a copy', re: /(?<![\w.])-1\.5(?![\d])/ },
  { name: 'the sea level (-0.3) is the datum\'s SEA_LEVEL, not a copy', re: /(?<![\w.])-0\.3(?![\d])/ },
];
for (const f of files) {
  if (f === 'lib/world/datum.js') continue;
  const src = strip(fs.readFileSync(path.join(root, f), 'utf8'));
  for (const r of [...rules, ...(f.startsWith('lib/world/') || f === 'apps/web/components/world/StreamedWorld.jsx' ? worldOnly : [])]) {
    const m = r.re.exec(src);
    if (m) bad(`${r.name}: ${f}`, `...${src.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, ' ')}...`);
  }
}
console.log(`datum: ${ls.length} layers, ${D.DATUM_ISSUES.length} known disagreements, ${files.length} source files checked`);
total();
