// The world recipe, the coast and the second town (lib/world/, docs/world/world_recipe.md): the recipe is valid and deterministic, plot ids are global and stable, each landmass has
// a valid coast round its town, the island is out at sea at exactly the gap the recipe asks for, and the first town is exactly what it has always been. Nothing here is loaded by the
// game: the main game still loads the first town alone.
import crypto from 'node:crypto';
import { imp } from '../scripts/lib-loader.mjs';
import { openDb } from '../services/api/db.mjs';
import * as core from '../services/api/core.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const { WORLD_RECIPE, TOWN_ID_STRIDE, toGlobalId, fromGlobalId, validateRecipe } = await imp('world/worldRecipe.js');
const { buildWorld } = await imp('world/buildWorld.js');
const { coastOutline, coastFeatures, pointInPolygon, polygonDistance, selfIntersects, polygonArea } = await imp('world/island.js');
const { elevationAt, templateOutline, chaikin, JAMAICA } = await imp('world/shapes.js');
const { generateCity } = await imp('city/cityGenerator.js');
const { generateTown } = await imp('city/townExtension.js');

// ---- the recipe
check('the recipe is valid', validateRecipe(WORLD_RECIPE).length === 0, validateRecipe(WORLD_RECIPE).join('; '));
const bad = (change) => validateRecipe(change(structuredClone(WORLD_RECIPE))).length > 0;
check('a recipe whose first town is not the live one is refused (the database depends on it)', bad((r) => { r.towns[0].seed = 1; return r; }));
check('two towns with one index, a town on the wrong landmass, an unplaced second landmass, and a missing gap are all refused', bad((r) => { r.towns[1].index = 0; return r; }) && bad((r) => { r.towns[1].landmass = 'mainland'; return r; }) && bad((r) => { delete r.landmasses[1].place; return r; }) && bad((r) => { r.landmasses[1].place.gap = 0; return r; }));
check('the first town is live and the island\'s is not (the game cannot show it yet)', WORLD_RECIPE.towns[0].live === true && WORLD_RECIPE.towns[1].live === false);

// ---- global plot ids
check('the first town\'s ids are what they always were; the others\' are shifted by the stride', toGlobalId(0, 123) === 123 && toGlobalId(1, 123) === 1000123 && TOWN_ID_STRIDE === 1000000);
check('an id says which town it is in and what the town called it', JSON.stringify(fromGlobalId(1000123)) === '{"town":1,"local":123}' && JSON.stringify(fromGlobalId(877)) === '{"town":0,"local":877}');
check('a town\'s own ids, even the editor\'s and the designs\', stay below the stride', 300000 + 999 < TOWN_ID_STRIDE);

// ---- the world
const world = buildWorld();
const again = buildWorld(structuredClone(WORLD_RECIPE));
check('building the world twice gives the same world', JSON.stringify(world.plots.map((p) => [p.id, p.x, p.z])) === JSON.stringify(again.plots.map((p) => [p.id, p.x, p.z])) && JSON.stringify(world.landmasses.map((l) => l.outline.points)) === JSON.stringify(again.landmasses.map((l) => l.outline.points)));
const [first, island] = world.towns;
check('two towns, on two landmasses', world.towns.length === 2 && world.landmasses.length === 2);
check('the first town is at the origin: the same coordinates and ids as the game uses', first.origin.x === 0 && first.origin.z === 0 && first.plots.every((p, i) => p.id === first.city.plots[i].id && p.x === Math.round(first.city.plots[i].x * 100) / 100));
const FIRST_TOWN_FINGERPRINT = '440f6fcc22b118a275b8326cb07f9d4fab8385e3d66e588007e39979d187c7ee';
const fingerprint = (plots) => { const h = crypto.createHash('sha256'); for (const p of plots) h.update(`${JSON.stringify(p, (k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v))}\n`); return h.digest('hex'); };
check('and the first 855 plots of it are still exactly the generator\'s (fingerprint)', fingerprint(first.city.plots.filter((p) => p.id < 881)) === FIRST_TOWN_FINGERPRINT && generateCity(20260101).plots.length === 855);
check('global ids are unique across the whole world', new Set(world.plots.map((p) => p.id)).size === world.plots.length);
check('the island\'s plots are numbered from 1,000,000, each the town\'s own id plus the stride', island.plots.every((p) => p.id === TOWN_ID_STRIDE + p.localId && p.town === 'harbor') && Math.min(...island.plots.map((p) => p.id)) >= TOWN_ID_STRIDE);
const reference = generateTown(island.seed).plots;
check('the island\'s town is the generator\'s town for its seed, moved and renumbered (nothing else changed)', island.plots.length === reference.length && island.plots.every((p, i) => p.localId === reference[i].id && Math.abs(p.x - island.origin.x - reference[i].x) < 0.02 && p.title === reference[i].title));
check('the island holds well over a thousand lots, as the first town does', island.plots.length > 1000 && first.plots.length > 1000, `${first.plots.length} and ${island.plots.length}`);

// ---- the coasts
for (const l of world.landmasses) {
  const t = world.towns.find((x) => x.landmass === l.id);
  check(`${l.id}: the coast is a closed shape that does not cross itself`, l.outline.points.length >= 48 && !selfIntersects(l.outline.points) && polygonArea(l.outline.points) > 1e5);
  check(`${l.id}: every plot, every road end and every corner of the town's land is inside the coast`, t.plots.every((p) => pointInPolygon(p.x, p.z, l.outline.points)) && t.roads.every((r) => (r.axis === 'x' ? [[r.from, r.center], [r.to, r.center]] : [[r.center, r.from], [r.center, r.to]]).every(([x, z]) => pointInPolygon(x, z, l.outline.points))) && [[t.land.x0, t.land.z0], [t.land.x1, t.land.z0], [t.land.x1, t.land.z1], [t.land.x0, t.land.z1]].every(([x, z]) => pointInPolygon(x, z, l.outline.points)));
}
const [mainland, isle] = world.landmasses;
const water = polygonDistance(mainland.outline.points, isle.outline.points);
check('the two landmasses do not touch, and the open water between them is the gap the recipe asks for (380)', water > 370 && water < 390, `${water.toFixed(1)} of water`);
check('the island is out to sea to the east, hundreds of units from the first town', island.origin.x > 500 && Math.hypot(isle.centre.x - mainland.centre.x, isle.centre.z - mainland.centre.z) > 700);
check('the whole island is clear of the mainland\'s land: none of its plots is inside the mainland\'s coast, nor the other way round', island.plots.every((p) => !pointInPolygon(p.x, p.z, mainland.outline.points)) && first.plots.every((p) => !pointInPolygon(p.x, p.z, isle.outline.points)));
check('the ocean holds both landmasses with open sea round them', world.landmasses.every((l) => l.bounds.x0 > world.ocean.x0 + 400 && l.bounds.x1 < world.ocean.x1 - 400 && l.bounds.z0 > world.ocean.z0 + 400 && l.bounds.z1 < world.ocean.z1 - 400));
const a = coastOutline({ rect: { x0: -100, x1: 100, z0: -80, z1: 80 }, seed: 5 });
const b = coastOutline({ rect: { x0: -100, x1: 100, z0: -80, z1: 80 }, seed: 6 });
check('a coast is made from its seed alone: the same seed gives the same shape, another seed another', JSON.stringify(a.points) === JSON.stringify(coastOutline({ rect: { x0: -100, x1: 100, z0: -80, z1: 80 }, seed: 5 }).points) && JSON.stringify(a.points) !== JSON.stringify(b.points));
const rects = [{ x0: -60, x1: 60, z0: -60, z1: 60 }, { x0: -300, x1: 150, z0: -40, z1: 40 }, { x0: 0, x1: 20, z0: 0, z1: 400 }];
check('whatever the seed and the shape of the land, the land is inside its coast and the coast is simple', [1, 2, 3, 77, 2202, 99999].every((seed) => rects.every((rect) => { const o = coastOutline({ rect, seed }); return !selfIntersects(o.points) && [[rect.x0, rect.z0], [rect.x1, rect.z0], [rect.x1, rect.z1], [rect.x0, rect.z1]].every(([x, z]) => pointInPolygon(x, z, o.points)); })));

// ---- the features
const f = isle.features;
check('the island has a harbour on the side that faces the mainland, with piers that point out to sea', f.harbour && f.harbour.at.x < isle.centre.x && f.harbour.piers.length === 3 && f.harbour.out.x < 0 && f.harbour.piers.every((p) => p.length >= 26));
check('and a beach, headlands and hills (the hills on the island but not on the town, and away from the harbour)', f.beaches.length >= 1 && f.headlands.length === 3 && f.hills.length >= 1 && f.hills.every((h) => pointInPolygon(h.x, h.z, isle.outline.points) && h.x >= isle.centre.x - 1));
check('the mainland has the features its recipe lists, and no harbour (it asks for none)', mainland.features.beaches && mainland.features.headlands && !mainland.features.harbour && !mainland.features.hills);
check('features are deterministic', JSON.stringify(coastFeatures(isle.outline, { seed: 2202, facing: { x: -1, z: 0 }, landRect: isle.land })) === JSON.stringify(coastFeatures(isle.outline, { seed: 2202, facing: { x: -1, z: 0 }, landRect: isle.land })));

// ---- the mainland is a variation of Jamaica, not a rounded square (lib/world/shapes.js)
{
  const o = mainland.outline;
  const w = mainland.bounds.x1 - mainland.bounds.x0, h = mainland.bounds.z1 - mainland.bounds.z0;
  check('the mainland\'s coast comes from the Jamaica template, smooth and simple (it never crosses itself)', o.kind === 'template' && o.template === 'jamaica' && o.points.length > 150 && !selfIntersects(o.points));
  check('it is long, not square: its reach east to west is well over its reach north to south', w / h > 1.4, `${w.toFixed(0)} x ${h.toFixed(0)}`);
  check('and it has bays and peninsulas: its area is well under its bounding box (a rounded square fills about 85% of it, this is about 55%)', mainland.area / (w * h) < 0.72, `${(mainland.area / (w * h) * 100).toFixed(0)}%`);
  const rect = generateTown(20260101).layout.land;
  const edge = []; for (let x = rect.x0; x <= rect.x1; x += 20) edge.push([x, rect.z0], [x, rect.z1]); for (let z = rect.z0; z <= rect.z1; z += 20) edge.push([rect.x0, z], [rect.x1, z]);
  const clear = (x, z) => Math.min(...o.points.map((q, i) => { const r = o.points[(i + 1) % o.points.length]; const dx = r.x - q.x, dz = r.z - q.z; const t = Math.max(0, Math.min(1, ((x - q.x) * dx + (z - q.z) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - q.x - t * dx, z - q.z - t * dz); }));
  check('the first town\'s land is on the island with at least the recipe\'s 70 units of beach all round it, and its own coordinates are what they always were', edge.every(([x, z]) => pointInPolygon(x, z, o.points) && clear(x, z) >= 70) && world.towns[0].origin.x === 0 && world.towns[0].origin.z === 0, `${Math.min(...edge.map(([x, z]) => clear(x, z))).toFixed(0)} units at the tightest`);
  const spec = WORLD_RECIPE.landmasses[0].coast;
  const a = templateOutline({ template: 'jamaica', rect, seed: spec.seed, margin: spec.margin, length: spec.length, anchor: spec.anchor, stretch: spec.stretch, rotate: spec.rotate, variation: spec.variation });
  const b = templateOutline({ template: 'jamaica', rect, seed: spec.seed + 1, margin: spec.margin, length: spec.length, anchor: spec.anchor, stretch: spec.stretch, rotate: spec.rotate, variation: spec.variation });
  check('the same seed gives the same coast every time', JSON.stringify(a.points) === JSON.stringify(templateOutline({ template: 'jamaica', rect, seed: spec.seed, margin: spec.margin, length: spec.length, anchor: spec.anchor, stretch: spec.stretch, rotate: spec.rotate, variation: spec.variation }).points));
  check('another seed really is another coast, and no variation at all would be Jamaica itself: the variation changes it', JSON.stringify(a.points) !== JSON.stringify(b.points) && JSON.stringify(a.points) !== JSON.stringify(templateOutline({ template: 'jamaica', rect, seed: spec.seed, margin: spec.margin, length: spec.length, anchor: spec.anchor, stretch: spec.stretch, rotate: 0, variation: 0 }).points));
  check('the template is a real outline: about 50 points, closed, and after two rounds of corner-cutting four times as many', JAMAICA.length >= 45 && chaikin(JAMAICA.map(([x, z]) => ({ x, z }))).length === JAMAICA.length * 4);
  check('a coast whose town cannot fit asks for nothing impossible: a land far bigger than the island is an error, not a coast that leaves the town in the sea', (() => { try { templateOutline({ template: 'jamaica', rect: { x0: -3000, x1: 3000, z0: -3000, z1: 3000 }, seed: 1, margin: 70, length: 400, anchor: { lon: -77.28, lat: 18.02 } }); return false; } catch (e) { return /does not fit/.test(e.message); } })());
  check('the recipe checks its coast: an unknown shape, or mountain ranges on a plain coast, are refused', bad((r) => { r.landmasses[0].coast.shape = 'atlantis'; return r; }) && bad((r) => { r.landmasses[1].features.push('ranges'); return r; }) && bad((r) => { delete r.landmasses[0].coast.anchor; return r; }));
}

// ---- its mountains: ranges with a height function
{
  const ranges = mainland.features.ranges;
  const rect = world.towns[0].land;
  check('the mainland has its mountain ranges: the Blue Mountains in the east, Cockpit Country and Dolphin Head in the west', ranges.length >= 3 && ['Blue Mountains', 'Cockpit Country', 'Dolphin Head'].every((n) => ranges.some((r) => r.name === n)) && ranges.find((r) => r.name === 'Blue Mountains').points[0].x > mainland.centre.x && ranges.find((r) => r.name === 'Cockpit Country').points[0].x < mainland.centre.x);
  check('every range is on the land (inside the coast) and none touches the first town: the town stays on the plains', ranges.every((r) => r.points.every((p) => pointInPolygon(p.x, p.z, mainland.outline.points) && !(p.x > rect.x0 - 40 && p.x < rect.x1 + 40 && p.z > rect.z0 - 40 && p.z < rect.z1 + 40))));
  let town = 0;
  for (let x = rect.x0; x <= rect.x1; x += 8) for (let z = rect.z0; z <= rect.z1; z += 8) town = Math.max(town, elevationAt(ranges, x, z, 7));
  check('the ground is flat (0) over all of the first town\'s land', town === 0, String(town));
  const blue = ranges.find((r) => r.name === 'Blue Mountains');
  let peak = 0, jump = 0, prev = null;
  for (let i = 0; i <= 600; i++) {
    const t = i / 600, a = blue.points[0], b = blue.points[blue.points.length - 1];
    const hh = elevationAt(ranges, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 7);
    peak = Math.max(peak, hh);
    if (prev !== null) jump = Math.max(jump, Math.abs(hh - prev));
    prev = hh;
  }
  check('the Blue Mountains rise to near their height (14) and never past it', peak > 0.8 * blue.height && peak <= blue.height, peak.toFixed(2));
  check('the ground is continuous: no step of more than a unit between points a unit apart, and it falls to nothing at the foot of the range', jump < 1 && elevationAt(ranges, blue.points[0].x, blue.points[0].z - blue.width, 7) === 0, `${jump.toFixed(2)}`);
  check('the same ground every time for the same seed (a mesh and a collision map can both read it), and the seed changes the lumps', elevationAt(ranges, blue.points[1].x, blue.points[1].z, 7) === elevationAt(ranges, blue.points[1].x, blue.points[1].z, 7) && elevationAt(ranges, blue.points[1].x + 5, blue.points[1].z + 3, 7) !== elevationAt(ranges, blue.points[1].x + 5, blue.points[1].z + 3, 99));
  check('far from every range the ground is 0, and the old low hills (at most 2.2) are not these mountains', elevationAt(ranges, rect.x0, rect.z0, 7) === 0 && blue.height > 2.2 * 4);
}

// ---- the island is still placed at exactly its gap, now that the mainland is so much bigger
check('Harbor Isle is still 380 units of open water from the mainland, and does not touch it', Math.abs(polygonDistance(mainland.outline.points, isle.outline.points) - 380) < 0.5, polygonDistance(mainland.outline.points, isle.outline.points).toFixed(2));

// ---- the island's airstrip: a destination for flights (docs/world/player_flight.md)
{
  const a = f.airstrip;
  check('the island has an airstrip, named for it; the mainland has none (it has its real airports)', Boolean(a) && a.name === 'Harbor Isle Airstrip' && !mainland.features.airstrip);
  const [tx, tz] = a.frame.t;
  const [nx, nz] = a.frame.n;
  const footprint = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, j]) => ({ x: a.at.x + tx * i * a.frame.runwayHalf - nx * j * 22, z: a.at.z + tz * i * a.frame.runwayHalf - nz * j * 22 }));
  const distToCoast = (p) => Math.min(...isle.outline.points.map((q, i) => { const r = isle.outline.points[(i + 1) % isle.outline.points.length]; const dx = r.x - q.x, dz = r.z - q.z; const t = Math.max(0, Math.min(1, ((p.x - q.x) * dx + (p.z - q.z) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(p.x - q.x - t * dx, p.z - q.z - t * dz); }));
  check('its whole footprint (runway and room round it) is on the island and at least 14 units from the water', footprint.every((p) => pointInPolygon(p.x, p.z, isle.outline.points) && distToCoast(p) >= 14));
  check('and off the town\'s land, clear of every hill, and away from the harbour', !(a.at.x > isle.land.x0 && a.at.x < isle.land.x1 && a.at.z > isle.land.z0 && a.at.z < isle.land.z1) && f.hills.every((h) => Math.hypot(h.x - a.at.x, h.z - a.at.z) > h.radius + a.frame.runwayHalf) && Math.hypot(f.harbour.at.x - a.at.x, f.harbour.at.z - a.at.z) > 70);
  check('its frame is the shape the city\'s airports use: origin, unit t and n at right angles, runwayN 0, and a runway shorter than the international\'s 116', a.frame.origin.x === a.at.x && Math.abs(Math.hypot(tx, tz) - 1) < 1e-9 && Math.abs(Math.hypot(nx, nz) - 1) < 1e-9 && Math.abs(tx * nx + tz * nz) < 1e-9 && a.frame.runwayN === 0 && a.frame.runwayHalf * 2 === a.length && a.length < 116);
  check('n points towards the town and the apron lies on that side of the runway', (isle.land.x0 + isle.land.x1) / 2 * nx + (isle.land.z0 + isle.land.z1) / 2 * nz - (a.at.x * nx + a.at.z * nz) > 0 && (a.apron.x - a.at.x) * nx + (a.apron.z - a.at.z) * nz > 0);
  check('the airstrip is deterministic, and changes nothing else: the island\'s plots, roads and coast are what they were', JSON.stringify(buildWorld().landmasses.find((l) => l.id === 'harbor-isle').features.airstrip) === JSON.stringify(a) && isle.outline.points.length > 0 && buildWorld().towns.find((t) => t.id === 'harbor').plots.length === 1070);
  check('with no land rectangle there is no airstrip (nothing to place it beside)', coastFeatures(isle.outline, { seed: 2202, facing: { x: -1, z: 0 } }).airstrip === null);
}

// ---- the server: the island's lots go in only when asked, closed, and as empty land
{
  const db = openDb(':memory:');
  core.seedWorld(db, 20260101);
  const before = db.prepare('SELECT COUNT(*) AS n FROM plots').get().n;
  check('by default the server knows only the first town', before === first.plots.length && db.prepare('SELECT COUNT(*) AS n FROM plots WHERE id >= 1000000').get().n === 0);
  const r = core.seedTowns(db, { towns: ['harbor'] });
  const rows = db.prepare('SELECT * FROM plots WHERE id >= 1000000').all();
  check('with the switch on, the island\'s lots are added under their global ids', r.added === island.plots.length && rows.length === island.plots.length && rows.every((x) => x.id >= TOWN_ID_STRIDE));
  check('but closed (not claimable) and empty land (no owner, no business), so nothing of the island shows in the directory, the market or the pages', rows.every((x) => x.claimable === 0 && x.owner_name === null && x.owner_account === null && x.building_type === null));
  check('their facts carry world coordinates and say which town they are in', (() => { const x = JSON.parse(rows[0].facts); const p = island.plots.find((q) => q.id === rows[0].id); return x.town === 'harbor' && x.localId === p.localId && Math.abs(x.x - p.x) < 0.01; })());
  check('the first town\'s rows did not change', db.prepare('SELECT COUNT(*) AS n FROM plots WHERE id < 1000000').get().n === before);
  check('switching it on again adds nothing, and an unknown or live town adds nothing', core.seedTowns(db, { towns: ['harbor'] }).added === 0 && core.seedTowns(db, { towns: ['nowhere', 'voxel'] }).added === 0);
}

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
