// Roadside trees and bank / shore shrubs: they stand where they should and nowhere else.
import { imp } from './helpers.mjs';
const { generateCity } = await imp('city/cityGenerator.js');
const { buildCollisionMap } = await imp('sim/collision.js');

let failed = false;
const seen = {};
const expect = (ok, what) => {
  if (!ok) {
    seen[what] = (seen[what] ?? 0) + 1;
    if (seen[what] <= 3) console.log('FAIL', what);
    failed = true;
  }
};
const H = 1.4;
const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.02 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.02;
const roadRect = (r) => (r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - H, z1: r.center + H } : { x0: r.center - H, x1: r.center + H, z0: r.from, z1: r.to });
const turned = (p) => {
  const c = Math.abs(Math.cos(p.yaw ?? 0)), s = Math.abs(Math.sin(p.yaw ?? 0));
  return { x0: p.x - (p.w * c + p.d * s) / 2, x1: p.x + (p.w * c + p.d * s) / 2, z0: p.z - (p.w * s + p.d * c) / 2, z1: p.z + (p.w * s + p.d * c) / 2 };
};
const spot = (t, half = 0.25) => ({ x0: t.x - half, x1: t.x + half, z0: t.z - half, z1: t.z + half });

const N = Number(process.env.SEEDS ?? 40);
let trees = 0, bushes = 0;
for (let seed = 1; seed <= N; seed++) {
  const c = generateCity(seed);
  const { layout, plots } = c;
  const { landscape, land } = layout;
  trees += landscape.trees.length;
  bushes += landscape.bushes.length;
  expect(landscape.trees.length > 60 && landscape.bushes.length > 30, `city ${seed}: a good amount of landscaping`);
  const everything = [
    ...layout.roads.map(roadRect),
    ...plots.map(turned),
    ...layout.parks.map((p) => ({ x0: p.center.x - p.width / 2, x1: p.center.x + p.width / 2, z0: p.center.z - p.depth / 2, z1: p.center.z + p.depth / 2 })),
    ...layout.reserved,
    ...layout.airports.map((a) => a.rect),
    ...layout.rivers,
    ...layout.lakes.map((l) => ({ x0: l.x - l.rx - 0.5, x1: l.x + l.rx + 0.5, z0: l.z - l.rz - 0.5, z1: l.z + l.rz + 0.5 })),
  ];
  for (const t of [...landscape.trees, ...landscape.bushes]) {
    const r = spot(t, (t.size ?? t.w) / 2);
    expect(r.x0 > land.x0 && r.x1 < land.x1 && r.z0 > land.z0 && r.z1 < land.z1, 'greenery is inside the land');
    for (const o of everything) if (overlap(r, o)) { expect(false, 'greenery stands clear of roads, plots, parks, reserved sites, airports, water'); break; }
  }
  // trees are solid trunks you walk round; shrubs are not
  if (seed <= 3) {
    const map = buildCollisionMap(c);
    const trunks = map.rects.filter((q) => q.kind === 'tree').length;
    expect(trunks >= layout.woods.length + landscape.trees.length, 'every roadside tree has a trunk in the collision map');
  }
  // trees are well spaced
  const ts = landscape.trees;
  for (let i = 0; i < ts.length && i < 400; i++) for (let j = i + 1; j < ts.length; j++) if (Math.hypot(ts[i].x - ts[j].x, ts[i].z - ts[j].z) < 0.6) { expect(false, 'trees do not stand on each other'); break; }
}
console.log(`${N} cities: ${(trees / N).toFixed(0)} roadside trees and ${(bushes / N).toFixed(0)} bank and shore shrubs per city`);
console.log(failed ? 'FAILED' : 'ALL OK');
if (failed) process.exitCode = 1;
