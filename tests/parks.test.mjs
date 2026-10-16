// The two parks: the block park and the much larger roadside park.
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
const rectOfPark = (p) => ({ x0: p.center.x - p.width / 2, x1: p.center.x + p.width / 2, z0: p.center.z - p.depth / 2, z1: p.center.z + p.depth / 2 });
const roadRect = (r) => (r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - H, z1: r.center + H } : { x0: r.center - H, x1: r.center + H, z0: r.from, z1: r.to });
const turned = (p) => {
  const c = Math.abs(Math.cos(p.yaw ?? 0)), s = Math.abs(Math.sin(p.yaw ?? 0));
  return { x0: p.x - (p.w * c + p.d * s) / 2, x1: p.x + (p.w * c + p.d * s) / 2, z0: p.z - (p.w * s + p.d * c) / 2, z1: p.z + (p.w * s + p.d * c) / 2 };
};

const N = Number(process.env.SEEDS ?? 60);
let ratio = 0, boosted = 0, slivers = 0;
for (let seed = 1; seed <= N; seed++) {
  const c = generateCity(seed);
  const { layout, plots } = c;
  expect(layout.parks.length === 2, `city ${seed}: two parks`);
  const [first, big] = layout.parks;
  if (!first || !big) continue;
  ratio += (big.width * big.depth) / (first.width * first.depth);
  expect(big.width * big.depth >= 4 * first.width * first.depth, 'the second park is at least four times the footprint of the first');
  expect(big.id === 'park-2' && big.big && first.id === 'park' && !first.big, 'the parks have their own ids');
  expect(big.name !== first.name, 'the parks have different names');
  expect(big.landmarks.includes('Fountain') && big.landmarks.includes('Monument') && big.trees.length > 100, 'the big park has the same features as the first, with many trees');

  const r = rectOfPark(big);
  // flush against a main road
  const flush = layout.roads.some((rd) => {
    if (!(rd.class === 'arterial' || rd.kind === 'county')) return false;
    if (rd.axis === 'x') return !(r.x1 <= rd.from || r.x0 >= rd.to) && (Math.abs(r.z0 - (rd.center + H)) < 0.02 || Math.abs(rd.center - H - r.z1) < 0.02);
    return !(r.z1 <= rd.from || r.z0 >= rd.to) && (Math.abs(r.x0 - (rd.center + H)) < 0.02 || Math.abs(rd.center - H - r.x1) < 0.02);
  });
  expect(flush, 'the big park stands exactly against an arterial or the county road (no gap)');
  // no sliver of land, narrower than a lot, between the park and any street
  const sliver = layout.roads.some((rd) => {
    const [lo, hi, a0, a1] = rd.axis === 'z' ? [r.x0, r.x1, r.z0, r.z1] : [r.z0, r.z1, r.x0, r.x1];
    if (rd.to < a0 || rd.from > a1) return false;
    return [lo - (rd.center + H), rd.center - H - hi].some((g) => g > 0.05 && g < 6.4);
  });
  if (sliver) slivers++;
  for (const rd of layout.roads) expect(!overlap(r, roadRect(rd)), 'the big park is clear of roads');
  for (const p of plots) expect(!overlap(r, turned(p)), 'the big park is clear of plots');
  for (const a of layout.reserved) expect(!overlap(r, a), 'the big park is clear of the reserved sites');
  for (const b of c.billboards) expect(!overlap(r, b.yaw ? { x0: b.x - 0.9, x1: b.x + 0.9, z0: b.z - b.width / 2, z1: b.z + b.width / 2 } : { x0: b.x - b.width / 2, x1: b.x + b.width / 2, z0: b.z - 0.9, z1: b.z + 0.9 }), 'the big park is clear of billboards');
  for (const rv of layout.rivers) expect(!overlap(r, rv), 'the big park is clear of the river');
  for (const l of layout.lakes) expect(!overlap(r, { x0: l.x - l.rx - 1, x1: l.x + l.rx + 1, z0: l.z - l.rz - 1, z1: l.z + l.rz + 1 }), 'the big park is clear of the lakes');
  expect(!overlap(r, rectOfPark(first)), 'the parks do not overlap');
  expect(big.trees.every((t) => t.x > r.x0 && t.x < r.x1 && t.z > r.z0 && t.z < r.z1), 'the big park trees are inside its lawn');
  expect(big.monument.x > r.x0 && big.monument.x < r.x1 && big.monument.z > r.z0 && big.monument.z < r.z1, 'the monument is inside the lawn');

  // its foot traffic reaches the plots beside it
  expect(big.neighborIds.length > 0 && big.neighborIds.every((id) => plots.find((p) => p.id === id)?.parkBoost), 'plots beside the big park share its foot traffic');
  boosted += big.neighborIds.length;

  // you cannot walk through the hedge or the fountain, but you can reach the middle through a gate
  if (seed <= 6) {
    const map = buildCollisionMap(c);
    expect(map.rects.some((q) => q.kind === 'fountain' && Math.abs((q.x0 + q.x1) / 2 - big.center.x) < 1e-6), 'the big park has a fountain you cannot walk into');
    expect(map.rects.filter((q) => q.kind === 'hedge' && q.x0 >= r.x0 - 1 && q.x1 <= r.x1 + 1 && q.z0 >= r.z0 - 1 && q.z1 <= r.z1 + 1).length === 8, 'the big park has its eight hedge sections (a gate on each side)');
  }
}
console.log(`${N} cities: the second park is ${(ratio / N).toFixed(1)}x the footprint of the first; ${(boosted / N).toFixed(0)} plots beside it share its foot traffic`);
expect(slivers <= N * 0.1, `at most 10% of big parks leave a sliver beside a cross street (${slivers} of ${N} do)`);
console.log(`${slivers} of ${N} big parks leave a sliver`);
console.log(failed ? 'FAILED' : 'ALL OK');
if (failed) process.exitCode = 1;
