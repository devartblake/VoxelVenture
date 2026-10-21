// The level of detail of the zoomed-out city (lib/performance/lodPolicy.js; docs/architecture/performance_policy.md), in Node:
//   - the level follows the tier and the zoom: high keeps today's look but for the sub-pixel lamps all the way out; medium and
//     low hide the small props sooner and draw the buildings as stand-ins when zoomed out
//   - hysteresis: a level is left only well above the zoom it was entered at, so a camera at a boundary does not flap
//   - ?lod=off never changes anything; ?lod=on applies the strongest rule on any tier
//   - a follow camera's distance gives the same pixels-per-unit as the map's zoom
//   - a stand-in is exactly its model's bounding box, moved by the model's matrix; its colours are the model's walls and roof
//   - off-screen culling only where no shadow can fall into view; it keeps exactly the instances near the view, in order
//   - the components wire it in: the stand-ins are selectable, the selected building stays a full model
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { imp, root } from './helpers.mjs';

const { LOD_LEVELS, LOD_RULES, LOD_EXIT_FACTOR, LOD_CLASSES, decideLod, lodHides, parseLodOverride, viewZoom, standInBox, averageModelColours, visibleInstances } = await imp('performance/lodPolicy.js');
const { TIERS } = await imp('performance/qualityPolicy.js');

const near = (a, b) => assert.ok(a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-9), `${a} != ${b}`);
let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log('ok  ', name);
};

ok('every tier has a rule, and the levels and classes are the documented ones', () => {
  assert.deepEqual(LOD_LEVELS, ['full', 'thin', 'far']);
  assert.deepEqual(LOD_CLASSES, ['subpixel', 'smallProps', 'labels']);
  for (const t of TIERS) assert.ok(LOD_RULES[t], t);
  for (const rule of Object.values(LOD_RULES)) for (const c of [...rule.thin, ...rule.far]) assert.ok(LOD_CLASSES.includes(c), c);
});

ok('close up (the default zoom 13 and nearer) nothing changes on any tier', () => {
  for (const tier of TIERS) for (const zoom of [13, 30, 90]) {
    const d = decideLod({ tier, zoom });
    assert.equal(d.level, 'full', `${tier} at ${zoom}`);
    assert.equal(d.buildings, 'full');
    assert.deepEqual(d.hidden, []);
  }
});

ok('high keeps today\'s look: never stand-ins; all the way out, only the sub-pixel lamps go', () => {
  for (const zoom of [5, 6, 8, 12]) assert.equal(decideLod({ tier: 'high', zoom }).buildings, 'full');
  assert.equal(decideLod({ tier: 'high', zoom: 8 }).level, 'full');
  const out = decideLod({ tier: 'high', zoom: 5 });
  assert.equal(out.level, 'thin');
  assert.deepEqual(out.hidden, ['subpixel']);
  assert.ok(!lodHides(out, 'smallProps') && !lodHides(out, 'labels'));
});

ok('medium and low: small props go below zoom 9 (low: 11), stand-ins below 7.5 (low: 9)', () => {
  assert.equal(decideLod({ tier: 'medium', zoom: 10 }).level, 'full');
  assert.equal(decideLod({ tier: 'medium', zoom: 8 }).level, 'thin');
  assert.ok(lodHides(decideLod({ tier: 'medium', zoom: 8 }), 'smallProps'));
  assert.ok(!lodHides(decideLod({ tier: 'medium', zoom: 8 }), 'labels'));
  assert.equal(decideLod({ tier: 'medium', zoom: 5 }).buildings, 'standin');
  assert.ok(lodHides(decideLod({ tier: 'medium', zoom: 5 }), 'labels'));
  assert.equal(decideLod({ tier: 'low', zoom: 10 }).level, 'thin');
  assert.ok(lodHides(decideLod({ tier: 'low', zoom: 10 }), 'labels'));
  assert.equal(decideLod({ tier: 'low', zoom: 8.9 }).buildings, 'standin');
  // the measurement's zoomed-out spots (whole-city at 5, airport-far at 6) are "far" on medium and low
  for (const tier of ['medium', 'low']) for (const zoom of [5, 6]) assert.equal(decideLod({ tier, zoom }).level, 'far');
});

ok('hysteresis: entered below the threshold, left only above threshold x exit factor', () => {
  assert.equal(LOD_EXIT_FACTOR > 1, true);
  const t = LOD_RULES.medium.farBelow;
  // zooming out past the threshold enters "far"
  let level = decideLod({ tier: 'medium', zoom: t - 0.01, previous: 'thin' }).level;
  assert.equal(level, 'far');
  // a little back in stays "far"
  level = decideLod({ tier: 'medium', zoom: t + 0.2, previous: level }).level;
  assert.equal(level, 'far');
  level = decideLod({ tier: 'medium', zoom: t * LOD_EXIT_FACTOR - 0.01, previous: level }).level;
  assert.equal(level, 'far');
  // well past it, back to thin, and the same zoom from "thin" does not re-enter far
  level = decideLod({ tier: 'medium', zoom: t * LOD_EXIT_FACTOR + 0.01, previous: level }).level;
  assert.equal(level, 'thin');
  assert.equal(decideLod({ tier: 'medium', zoom: t + 0.2, previous: 'thin' }).level, 'thin');
  // a camera wobbling round the threshold (the damping of a zoom gesture) switches once, not on every frame
  let changes = 0;
  let prev = 'thin';
  for (let i = 0; i < 200; i++) {
    const zoom = t + Math.sin(i / 3) * 0.3;
    const next = decideLod({ tier: 'medium', zoom, previous: prev }).level;
    if (next !== prev) changes++;
    prev = next;
  }
  assert.equal(changes, 1);
  // from "far" straight to close: full
  assert.equal(decideLod({ tier: 'medium', zoom: 13, previous: 'far' }).level, 'full');
});

ok('?lod=off never changes anything; ?lod=on applies the strongest rule on any tier; anything else is auto', () => {
  assert.equal(parseLodOverride('?lod=off'), 'off');
  assert.equal(parseLodOverride('?lod=ON'), 'on');
  assert.equal(parseLodOverride('?lod=maybe'), 'auto');
  assert.equal(parseLodOverride(''), 'auto');
  for (const tier of TIERS) {
    const off = decideLod({ tier, zoom: 5, override: 'off', previous: 'far' });
    assert.equal(off.level, 'full');
    assert.deepEqual(off.hidden, []);
  }
  assert.equal(decideLod({ tier: 'high', zoom: 5, override: 'on' }).buildings, 'standin');
  assert.equal(decideLod({ tier: 'high', zoom: 5, override: 'on' }).reason, 'lod=on');
  assert.equal(decideLod({ tier: 'high', zoom: 13, override: 'on' }).level, 'full');
});

ok('off-screen culling: on medium and low (no shadows), never on high or with shadows, never with ?lod=off', () => {
  assert.equal(decideLod({ tier: 'medium', zoom: 13 }).cull, true);
  assert.equal(decideLod({ tier: 'low', zoom: 30 }).cull, true);
  assert.equal(decideLod({ tier: 'high', zoom: 5 }).cull, false);
  assert.equal(decideLod({ tier: 'high', zoom: 13, override: 'on', shadows: true }).cull, false);
  assert.equal(decideLod({ tier: 'high', zoom: 13, override: 'on', shadows: false }).cull, true);
  assert.equal(decideLod({ tier: 'low', zoom: 13, shadows: true }).cull, false);
  assert.equal(decideLod({ tier: 'low', zoom: 13, override: 'off' }).cull, false);
});

ok('the instances in view: inside every plane (widened by the radius and the margin), in their order', () => {
  // a box view: -10 <= x <= 10, -10 <= z <= 10 (four planes, inside where n.p + c >= 0)
  const planes = [[1, 0, 0, 10], [-1, 0, 0, 10], [0, 0, 1, 10], [0, 0, -1, 10]];
  const spheres = new Float32Array([0, 0, 0, 1, /* in */ 11.5, 0, 0, 1, /* off by 1.5, radius 1 */ -30, 0, 0, 2, /* far off */ 5, 3, -9, 0.5 /* in */]);
  assert.deepEqual(visibleInstances(spheres, planes, 0), [0, 3]);
  assert.deepEqual(visibleInstances(spheres, planes, 1), [0, 1, 3]); // the margin brings the one just off the edge in
  assert.deepEqual(visibleInstances(spheres, planes, 100), [0, 1, 2, 3]);
  assert.deepEqual(visibleInstances(new Float32Array(0), planes, 3), []);
});

ok('the same inputs always give the same decision', () => {
  const a = decideLod({ tier: 'low', zoom: 7, previous: 'thin' });
  const b = decideLod({ tier: 'low', zoom: 7, previous: 'thin' });
  assert.deepEqual(a, b);
  a.hidden.push('x');
  assert.ok(!LOD_RULES.low.far.includes('x'), 'the decision is a copy, not the rule');
});

ok('a follow camera\'s distance is turned into pixels per unit like the map\'s zoom; first person is always close', () => {
  assert.equal(viewZoom({ iso: true, zoom: 5 }), 5);
  // 900 px tall, fov 40: 2 * d * tan(20 deg) units across
  const z = viewZoom({ iso: false, distance: 160, fov: 40, height: 900 });
  assert.ok(Math.abs(z - 900 / (2 * 160 * Math.tan(Math.PI / 9))) < 1e-9);
  assert.ok(z < 9 && z > 7); // the overview preset counts as zoomed out
  assert.ok(viewZoom({ iso: false, distance: 28, fov: 38, height: 900 }) > 13); // the default follow view is close
  assert.equal(viewZoom({ firstPerson: true }), Infinity);
  assert.equal(decideLod({ tier: 'low', zoom: viewZoom({ firstPerson: true }) }).level, 'full');
});

ok('a stand-in is the model\'s bounding box, moved by the model\'s matrix', () => {
  const box = { min: [-1, 0, -2], max: [1, 3, 2] };
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const m = standInBox(box, identity);
  assert.deepEqual(m, [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 0, 1.5, 0, 1]);
  // a model scaled by 2 and moved to (10, 0.1, 5)
  const placed = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 10, 0.1, 5, 1];
  const p = standInBox(box, placed);
  assert.deepEqual([p[0], p[5], p[10]], [4, 6, 8]);
  assert.deepEqual([p[12], p[13], p[14]], [10, 0.1 + 3, 5]);
  // turned a quarter round Y: the unit box's x axis follows the model's
  const c = Math.cos(Math.PI / 2);
  const s = Math.sin(Math.PI / 2);
  const turned = standInBox({ min: [0, 0, 0], max: [2, 1, 1] }, [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  assert.ok(Math.abs(turned[0]) < 1e-9 && Math.abs(turned[2] - -2) < 1e-9);
});

ok('a model\'s stand-in colours: the mean of its walls and of its roof, by area', () => {
  // a unit cube's top (two triangles, facing up) red, one side (two triangles) blue
  const positions = [0, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0];
  const colors = [...Array(6).fill([1, 0, 0]).flat(), ...Array(6).fill([0, 0, 1]).flat()];
  const look = averageModelColours({ positions, colors });
  near(look.roof, [1, 0, 0]);
  near(look.wall, [0, 0, 1]);
  // from a texture: the sampler is asked at each vertex's uv
  const uvs = [...Array(6).fill([0.25, 0.5]).flat(), ...Array(6).fill([0.75, 0.5]).flat()];
  const tex = averageModelColours({ positions, uvs }, (u) => (u < 0.5 ? [0, 1, 0] : [1, 1, 1]));
  near(tex.roof, [0, 1, 0]);
  near(tex.wall, [1, 1, 1]);
  // no roof: the walls' colour; indexed geometry works the same
  const walls = averageModelColours({ positions: positions.slice(18), colors: colors.slice(18) });
  near(walls.roof, walls.wall);
  const indexed = averageModelColours({ positions: positions.slice(0, 9), colors: colors.slice(0, 9), index: [0, 1, 2] });
  near(indexed.roof, [1, 0, 0]);
});

ok('the city wires it in: stand-ins are clickable, the selected building stays full, the props follow their class', () => {
  const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
  const standIns = read('apps', 'web', 'components', 'lod', 'BuildingStandIns.jsx');
  assert.ok(/onClick/.test(standIns) && /onSelect\(p\)/.test(standIns), 'a stand-in selects its plot');
  assert.equal((standIns.match(/<instancedMesh/g) ?? []).length, 2, 'two instanced meshes: the walls and the roofs');
  const buildings = read('apps', 'web', 'components', 'city', 'ModelBuildings.jsx');
  assert.ok(/p\.id !== keepFull/.test(buildings), 'the selected building is never a stand-in');
  const classes = {
    'IntersectionControl.jsx': 'subpixel',
    'River.jsx': 'subpixel',
    'Billboard.jsx': 'subpixel',
    'ParkingLots.jsx': 'smallProps',
    'Plots.jsx': 'smallProps',
    'AmusementPark.jsx': 'smallProps',
  };
  for (const [file, cls] of Object.entries(classes)) assert.ok(read('apps', 'web', 'components', 'city', file).includes(`useLodHidden('${cls}'`), file);
  for (const file of ['Road.jsx', 'DiagonalRoad.jsx', 'CurvedRoad.jsx']) assert.ok(read('apps', 'web', 'components', 'city', file).includes('lod="labels"'), file);
  // selection, the card, attribution and the no-WebGL page do not read the level of detail
  for (const file of ['apps/web/components/business', 'apps/web/components/legal']) {
    const dir = path.join(root, file);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir, { recursive: true }).filter((x) => /\.jsx?$/.test(x))) assert.ok(!/lodRuntime|lodPolicy/.test(fs.readFileSync(path.join(dir, f), 'utf8')), f);
  }
});

console.log(`\n${n} checks passed`);
