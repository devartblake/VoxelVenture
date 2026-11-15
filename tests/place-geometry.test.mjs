// Where is a point? (lib/world/placeGeometry.js, docs/architecture/presence_positions.md.) The places, roads, zones and districts the TASKS name must exist in the geometry the presence server
// uses, by the same ids, or a task would ask for something no position can ever be in. It is built from the game's own city (generateTown), the one the page builds.
import fs from 'node:fs';
import path from 'node:path';
import { imp, root } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const SEED = 20260101;
const { generateTown } = await imp('city/townExtension.js');
const { buildPlaceGeometry, DISTRICT_RADIUS, EDGE_BAND } = await imp('world/placeGeometry.js');
const { ZONES } = await imp('game/soundZones.js');
const city = generateTown(SEED);
const g = buildPlaceGeometry(city);
const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'lib/game/taskCatalogue.json'), 'utf8'));
const tasks = catalogue.tasks;

// ---- the catalogue's names resolve
const unresolved = new Set();
for (const t of tasks) {
  const go = t.goal;
  if (go.type === 'reach' && typeof go.place === 'string' && go.id && go.place !== 'ride' && !g.placeOf(go.place, go.id)) unresolved.add(`${go.place}:${go.id}`);
  if (go.type === 'reach' && go.ids) for (const id of go.ids) if (!g.places.some((p) => p.id === id && (!go.place || p.kind === go.place))) unresolved.add(`ids:${id}`);
  if (go.type === 'road' && go.road && !g.roads.has(go.road)) unresolved.add(`road:${go.road}`);
  if (go.type === 'road' && go.roads) for (const r of go.roads) if (!g.roads.has(r)) unresolved.add(`road:${r}`);
  if (go.type === 'zone' && !g.zones.includes(go.zone)) unresolved.add(`zone:${go.zone}`);
  if (['be-in', 'distance'].includes(go.type) && go.district && !g.districts.includes(go.district)) unresolved.add(`district:${go.district}`);
  if (go.type === 'travel' && (!g.districts.includes(go.from) || !g.districts.includes(go.to))) unresolved.add(`trip:${go.from}-${go.to}`);
}
check('every place, pair of places, road, pair of roads, zone and district that a task names exists in the geometry', unresolved.size === 0, [...unresolved].join(' '));
check('the geometry has the 42 roads the catalogue walks (and the city\'s other named roads)', g.roads.size >= 42, String(g.roads.size));
check('every sound zone of the game is a zone here', Object.keys(ZONES).every((z) => g.zones.includes(z)));
const kinds = new Set(g.places.map((p) => p.kind));
check('all eight kinds of place are there: park, lake, bridge, airport, mall, the fun park, a pier, the river', ['park', 'lake', 'bridge', 'airport', 'mall', 'funpark', 'pier', 'river'].every((k) => kinds.has(k)), [...kinds].join(','));
check('19 places in all: 2 parks... as the catalogue counts them', g.places.length === 19, String(g.places.length));

// ---- locate
const park = g.placeOf('park', 'park');
const pc = { x: (park.rect.x0 + park.rect.x1) / 2, z: (park.rect.z0 + park.rect.z1) / 2 };
check('the centre of Voxel Park is in the park', g.locate(pc.x, pc.z).places.some((p) => p.kind === 'park' && p.id === 'park'));
check('and a point far from it is not', !g.locate(pc.x + 60, pc.z + 60).places.some((p) => p.kind === 'park'));
const lake = g.placeOf('lake', 'lake-1');
check('the middle of a lake is in the lake, and in the water sound zone', (() => { const at = g.locate((lake.rect.x0 + lake.rect.x1) / 2, (lake.rect.z0 + lake.rect.z1) / 2); return at.places.some((p) => p.id === 'lake-1') && at.zones.includes('water'); })());
const pier = g.placeOf('pier', 'pier-1');
check('a pier has a start and a tip, and the tip is on the pier', pier.anchors.length === 2 && g.locate(pier.anchors[1].x, pier.anchors[1].z).places.some((p) => p.id === 'pier-1'));
const bridge = g.placeOf('bridge', 'bridge-avenue-1-creator');
check('a bridge has an end at each side of the river', bridge.anchors.length === 2 && bridge.anchors[0].x !== bridge.anchors[1].x || bridge.anchors[0].z !== bridge.anchors[1].z);
check('the middle of a bridge is on it', (() => { const [a, b] = bridge.anchors; return g.locate((a.x + b.x) / 2, (a.z + b.z) / 2).places.some((p) => p.id === bridge.id); })());

// ---- districts: the nearest plot's, within the radius
const plot = city.plots.find((p) => p.districtId === 'saas');
check('on a plot the district is that plot\'s', g.districtAt(plot.x, plot.z) === 'saas');
check(`more than ${DISTRICT_RADIUS} units from every plot there is no district`, g.districtAt(plot.x + 5000, plot.z) === null);
check('the built-up land belongs to a district; only open fields and water have none (about 60% of the land rectangle has one)', (() => { let n = 0, inD = 0; for (let x = g.land.x0; x < g.land.x1; x += 15) for (let z = g.land.z0; z < g.land.z1; z += 15) { n++; if (g.districtAt(x, z)) inD++; } return inD / n > 0.5; })() && city.plots.every((p) => !p.districtId || g.districtAt(p.x, p.z) !== null));

// ---- roads, edges, bounds
const lane = g.roads.get('Pixel Ln');
const s0 = lane.segments[0];
const mid = s0.axis === 'z' ? { x: s0.center, z: (s0.from + s0.to) / 2 } : { x: (s0.from + s0.to) / 2, z: s0.center };
check('the middle of a road is on it, about half way along', (() => { const r = g.locate(mid.x, mid.z).roads.find((x) => x.name === 'Pixel Ln'); return Boolean(r) && Math.abs(r.t - 0.5) < 0.2; })());
check('a road\'s t runs from 0 at one end to 1 at the other', (() => { const a = s0.axis === 'z' ? g.locate(s0.center, s0.from + 1) : g.locate(s0.from + 1, s0.center); const b = s0.axis === 'z' ? g.locate(s0.center, s0.to - 1) : g.locate(s0.to - 1, s0.center); const ra = a.roads.find((x) => x.name === 'Pixel Ln'), rb = b.roads.find((x) => x.name === 'Pixel Ln'); return ra && rb && ra.t < 0.1 && rb.t > 0.9; })());
check('the land\'s edges are edges: west, east, north, south', g.locate(g.land.x0 + 1, 0).edge === 'west' && g.locate(g.land.x1 - 1, 0).edge === 'east' && g.locate(0, g.land.z0 + 1).edge === 'north' && g.locate(0, g.land.z1 - 1).edge === 'south' && g.locate(0, 0).edge === null, `band ${EDGE_BAND}`);
check('the bounds are the land and a margin, as data (a bigger world is a different land)', g.inBounds(0, 0) && g.inBounds(g.land.x0 - 20, 0) && !g.inBounds(g.land.x0 - 100, 0) && !g.inBounds(0, g.land.z1 + 500));

// ---- it is the game's city
const src = fs.readFileSync(path.join(root, 'lib/world/placeGeometry.js'), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
check('the geometry never builds a city of its own: it is given the game\'s (generateTown), so it cannot disagree with it', !/generateCity\(|generateTown\(/.test(src));
check('the same city gives the same geometry', JSON.stringify(buildPlaceGeometry(generateTown(SEED)).places) === JSON.stringify(g.places));

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
