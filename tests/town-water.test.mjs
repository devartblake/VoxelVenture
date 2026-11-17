// The town river against the sea (lib/world/townWater.js, docs/world/river_system.md): the river is sunk into a trench through the slab at the sea level, the slab and what lies on it are cut round it, boats float on the
// water they are on, and the baked river takes a boat over at the town edge.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const W = await imp('world/townWater.js');
const D = await imp('world/datum.js');
const { generateCity } = await imp('city/cityGenerator.js');
const { waterRects, inWater } = await imp('sim/vehicles.js');
const { waterYFor, boatYFor } = await imp('city/surfaceHeight.js');
const { createAnimals } = await imp('sim/animals.js');
const { bad, total } = problemTally();
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const area = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));

// ---- subtracting rectangles
const base = { x0: 0, x1: 10, z0: 0, z1: 10 };
const pieces = W.subtractRects(base, [{ x0: 3, x1: 5, z0: -1, z1: 11 }, { x0: 7, x1: 8, z0: 4, z1: 6 }]);
if (!near(pieces.reduce((s, p) => s + area(p), 0), 100 - 20 - 2)) bad('the pieces left cover the rectangle less the cuts', JSON.stringify(pieces));
for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) if (overlap(pieces[i], pieces[j]) > 1e-9) bad('the pieces do not overlap each other', '');
if (W.subtractRects(base, [{ x0: -1, x1: 11, z0: -1, z1: 11 }]).length !== 0 || W.subtractRects(base, [{ x0: 20, x1: 30, z0: 0, z1: 10 }]).length !== 1) bad('a cut over everything leaves nothing, a cut elsewhere leaves it whole', '');

// ---- the real first town
const { layout } = generateCity(20260101);
const rivers = W.riverRects(layout);
if (rivers.length !== 1 || !(rivers[0].x1 - rivers[0].x0 > 10)) bad('the first town has its river', JSON.stringify(rivers));
const cut = W.cutLand(layout);
const landArea = area(layout.land), riverArea = rivers.reduce((s, r) => s + area(r), 0);
if (!near(cut.slab.reduce((s, p) => s + area(p), 0), landArea - riverArea, 1e-6)) bad('the slab is the land less the river', `${cut.slab.reduce((s, p) => s + area(p), 0)} ${landArea - riverArea}`);
for (const [what, list] of [['slab', cut.slab], ['urban', cut.urban], ['lawns', cut.lawns]]) for (const p of list) for (const r of rivers) if (overlap(p, r) > 1e-9) bad(`nothing of the ${what} lies over the river`, JSON.stringify(p));
const urbanArea = area(layout.urban);
if (!(cut.urban.reduce((s, p) => s + area(p), 0) <= urbanArea + 1e-9)) bad('the built-up ground is cut, not grown', '');
const lawnArea = (layout.lawns ?? []).reduce((s, r) => s + area(r), 0);
if (!(cut.lawns.reduce((s, p) => s + area(p), 0) <= lawnArea + 1e-9)) bad('the lawns are cut, not grown', '');

// ---- the levels: the river is the sea, a lake is a pond; a boat floats on the water it is on
const r = rivers[0], mid = { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 }, lake = layout.lakes[0];
if (!near(W.waterYAt(rivers, mid.x, mid.z), D.SEA_LEVEL) || !near(W.waterYAt(rivers, lake.x, lake.z), D.TOWN_WATER)) bad('the river is at the sea level and a lake at the pond level', '');
if (!near(waterYFor(layout, mid.x, mid.z), D.SEA_LEVEL) || !near(waterYFor(layout, lake.x, lake.z), D.TOWN_WATER)) bad('the game asks the same levels', '');
if (!near(boatYFor(layout, mid.x, mid.z), D.SEA_LEVEL + D.BOAT_FLOAT) || !near(boatYFor(layout, lake.x, lake.z), D.TOWN_WATER)) bad('a boat on the river floats like a boat at sea, on a lake as it always did', '');
if (!(W.TRENCH.top > W.TRENCH.water && W.TRENCH.water > W.TRENCH.bed && W.TRENCH.bed === D.SEA_FLOOR)) bad('the trench: the slab top over the water over the bed (the seabed)', JSON.stringify(W.TRENCH));
for (const t of layout.bridges) if (!(t.axis === 'x' || t.axis === 'z')) bad('a bridge has an axis', '');

// ---- boats: the river runs on out of the town when the baked world is mounted
const closed = waterRects(layout), open = waterRects(layout, { reach: 4 });
const rr = closed.find((q) => q.id === r.id), ro = open.find((q) => q.id === r.id);
if (!near(ro.z1 - rr.z1, 4) || !near(rr.z0 - ro.z0, 4) || !near(ro.x0, rr.x0) || !near(ro.x1, rr.x1)) bad('the open river rectangle reaches 4 units past the land at both long ends and no wider', JSON.stringify([rr, ro]));
const margin = 0.3, edgeZ = layout.land.z1;
if (inWater(mid.x, edgeZ + 1, closed, margin) || !inWater(mid.x, edgeZ + 1, open, margin) || !inWater(mid.x, edgeZ - 0.2, open, margin)) bad('with the baked world a boat can sail across the town edge; without it, it stops at the edge', '');

// ---- the ducks swim on the water they are on
const { animals } = (() => { const sim = createAnimals(layout); return { animals: sim.animals }; })();
const onRiver = animals.filter((a) => a.mode === 'water' && W.inRiver(rivers, a.x, a.z));
const onPond = animals.filter((a) => a.mode === 'water' && !W.inRiver(rivers, a.x, a.z));
if (onRiver.some((a) => !near(a.y, D.SEA_LEVEL)) || onPond.some((a) => !near(a.y, D.TOWN_WATER))) bad('a duck sits on the river at the sea level and on a pond at the pond level', '');

// ---- the manifest carries the town river, the same rectangle (shifted by the town origin, which is 0 for the first town)
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
const mr = manifest.towns[0].rivers?.[0];
if (!mr || Math.abs(mr.x0 - r.x0) > 0.01 || Math.abs(mr.x1 - r.x1) > 0.01 || Math.abs(mr.z0 - r.z0) > 0.01) bad('the manifest has the town river rectangle', JSON.stringify(mr));
console.log(`town water: slab ${cut.slab.length} pieces, ${landArea.toFixed(0)} less ${riverArea.toFixed(0)}; ${onRiver.length} ducks on the river, ${onPond.length} on ponds`);
total();
