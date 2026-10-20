// Where a new player starts (lib/game/spawn.js): many good spots spread over the city, none blocked, in water, on a runway or inside a
// plot, each with businesses near it, no district holding too many; the same list every time for a city; a random pick per page load;
// ?spawn=fixed keeps the old spot and a building link starts beside that building.
import { imp } from './helpers.mjs';

const { generateCity } = await imp('city/cityGenerator.js');
const { buildCollisionMap, findSpawn, isBlocked, AVATAR_RADIUS } = await imp('sim/collision.js');
const { findWalkPath, prepareWalkMap } = await imp('sim/pathfind.js');
const { graphFor } = await imp('city/routing.js');
const { spawnCandidates, pickSpawn, startSpot, spawnMode, rememberLink, facingCentre, SPAWN_NEAR, SPAWN_BUSINESSES, SPAWN_EDGE } = await imp('game/spawn.js');

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

for (const seed of [20260101, 7, 42]) {
  const city = generateCity(seed);
  const { layout, plots } = city;
  const collision = buildCollisionMap({ plots, layout, billboards: city.billboards });
  const list = spawnCandidates(layout, collision, plots);
  const counts = {};
  for (const c of list) counts[c.district] = (counts[c.district] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  console.log(`  seed ${seed}: ${list.length} spawn points in ${Object.keys(counts).length} districts ${JSON.stringify(counts)}`);
  check(`seed ${seed}: many spawn points`, list.length >= 300, String(list.length));
  check(`seed ${seed}: spread over at least 6 districts`, Object.keys(counts).length >= 6, String(Object.keys(counts).length));
  check(`seed ${seed}: no district has more than 40% of them`, top[1] / list.length <= 0.4, `${top[0]} ${(100 * top[1] / list.length).toFixed(0)}%`);
  check(`seed ${seed}: none is blocked (buildings, water, hills, hedges)`, list.every((c) => !isBlocked(c.x, c.z, collision.rects, AVATAR_RADIUS)));
  const b = collision.bounds;
  check(`seed ${seed}: all inside the walkable area`, list.every((c) => c.x > b.x0 && c.x < b.x1 && c.z > b.z0 && c.z < b.z1));
  const onRunway = list.filter((c) => (layout.airports ?? []).some((a) => [a.runway, a.apron].some((r) => r && c.x > r.x0 && c.x < r.x1 && c.z > r.z0 && c.z < r.z1)));
  check(`seed ${seed}: none on an airport's runway or apron`, onRunway.length === 0, JSON.stringify(onRunway.slice(0, 2)));
  const inPlot = list.filter((c) => plots.some((p) => {
    const dx = c.x - p.x, dz = c.z - p.z, y = p.yaw ?? 0;
    return Math.abs(dx * Math.cos(y) - dz * Math.sin(y)) < p.w / 2 && Math.abs(dx * Math.sin(y) + dz * Math.cos(y)) < p.d / 2;
  }));
  check(`seed ${seed}: none inside a plot (built or empty)`, inPlot.length === 0, JSON.stringify(inPlot.slice(0, 2)));
  const lonely = list.filter((c) => plots.filter((p) => p.owner && p.buildingType !== 'house' && Math.hypot(p.x - c.x, p.z - c.z) <= SPAWN_NEAR).length < SPAWN_BUSINESSES);
  check(`seed ${seed}: each has at least ${SPAWN_BUSINESSES} businesses within ${SPAWN_NEAR} units`, lonely.length === 0, String(lonely.length));
  {
    // never on the outer edge: no spot further from the centre than SPAWN_EDGE of the businesses
    const reach = plots.filter((p) => p.owner && p.buildingType !== 'house').map((p) => Math.hypot(p.x - layout.center.x, p.z - layout.center.z)).sort((x, y) => x - y);
    const edge = reach[Math.floor(SPAWN_EDGE * reach.length)];
    check(`seed ${seed}: no spot on the outer edge (beyond ${edge.toFixed(0)} from the centre)`, list.every((c) => Math.hypot(c.x - layout.center.x, c.z - layout.center.z) <= edge + 1e-9));
  }
  check(`seed ${seed}: the same list every time`, JSON.stringify(spawnCandidates(layout, collision, plots)) === JSON.stringify(list));

  // every spot can be walked to from the old fixed spot (none is on a walled-in island)
  prepareWalkMap(collision);
  const graph = graphFor(layout);
  const from = findSpawn(layout, collision);
  const rand = rng(seed);
  let unreachable = 0;
  for (let k = 0; k < 25; k++) {
    const c = list[Math.floor(rand() * list.length)];
    const path = findWalkPath(from, c, collision, { graph });
    const end = path?.at(-1);
    if (!end || Math.hypot(end.x - c.x, end.z - c.z) > 0.3) unreachable++;
  }
  check(`seed ${seed}: sampled spots are reachable on foot`, unreachable === 0, String(unreachable));

  // 50 new players
  const r = rng(seed + 1);
  const landed = Array.from({ length: 50 }, () => pickSpawn(list, r));
  const distinct = new Set(landed.map((p) => `${p.x},${p.z}`)).size;
  check(`seed ${seed}: 50 new players land at 30 or more different spots`, distinct >= 30, String(distinct));
}

// pickSpawn uses the random number it is given
{
  const list = [{ x: 1, z: 1 }, { x: 2, z: 2 }, { x: 3, z: 3 }, { x: 4, z: 4 }];
  check('pickSpawn: rand 0 picks the first spot', JSON.stringify(pickSpawn(list, () => 0)) === JSON.stringify({ x: 1, z: 1 }));
  check('pickSpawn: rand 0.6 picks the third', JSON.stringify(pickSpawn(list, () => 0.6)) === JSON.stringify({ x: 3, z: 3 }));
  check('pickSpawn: rand just under 1 picks the last', JSON.stringify(pickSpawn(list, () => 0.9999999)) === JSON.stringify({ x: 4, z: 4 }));
  check('pickSpawn: nothing to pick from is null', pickSpawn([], () => 0.5) === null);
  const a = rng(5);
  const b = rng(5);
  check('pickSpawn: the same seed gives the same players', Array.from({ length: 20 }, () => JSON.stringify(pickSpawn(list, a))).join() === Array.from({ length: 20 }, () => JSON.stringify(pickSpawn(list, b))).join());
}

// startSpot: ?spawn=fixed, a building link, a random spot that stays put for the city, and the fallback
{
  const city = generateCity(20260101);
  const { layout, plots } = city;
  const collision = buildCollisionMap({ plots, layout, billboards: city.billboards });
  check('spawnMode reads ?spawn=fixed', spawnMode('?spawn=fixed') === 'fixed' && spawnMode('?view=iso') === 'random' && spawnMode('') === 'random');
  check('?spawn=fixed starts at the old spot on the avenue', JSON.stringify(startSpot({ layout, collision, plots, search: '?spawn=fixed&view=iso' })) === JSON.stringify(findSpawn(layout, collision)));
  const target = plots.find((p) => p.owner && p.buildingType !== 'house' && p.districtId === 'bazaar');
  const linked = startSpot({ layout: { ...layout }, collision, plots, search: `?plot=${target.id}&city=${layout.seed}` });
  check('a building link starts beside that building', Math.hypot(linked.x - target.x, linked.z - target.z) < 12, `${Math.hypot(linked.x - target.x, linked.z - target.z).toFixed(1)} units`);
  rememberLink(`?plot=${target.id}`); // DeepLink keeps the link before it tidies the address to "/"
  const later = startSpot({ layout: { ...layout, seed: 98 }, collision, plots, search: '' });
  rememberLink('');
  check('...also when the avatar is placed after the address was tidied', Math.hypot(later.x - target.x, later.z - target.z) < 12, JSON.stringify(later));
  const other = { ...layout, seed: 99 };
  const wrong = startSpot({ layout: other, collision, plots, search: `?plot=${target.id}&city=1`, rand: () => 0 });
  check('a link for another city does not steer the start', JSON.stringify(wrong) === JSON.stringify(pickSpawn(spawnCandidates(other, collision, plots), () => 0)));
  const fresh = { ...layout, seed: 123 };
  const first = startSpot({ layout: fresh, collision, plots, rand: () => 0.37 });
  const again = startSpot({ layout: fresh, collision, plots, rand: () => 0.91 });
  check('the start stays put for a city when it runs again (the camera changing view)', JSON.stringify(first) === JSON.stringify(again));
  check('the random start is a candidate spot, not the old one', JSON.stringify(first) !== JSON.stringify(findSpawn(layout, collision)) && !isBlocked(first.x, first.z, collision.rects));
  const empty = { ...layout, seed: 124, roads: layout.roads.filter((r) => r.kind === 'avenue' && r.class === 'arterial') };
  const noPlots = startSpot({ layout: empty, collision, plots: [] });
  check('with no good spot it falls back to the old one', JSON.stringify(noPlots) === JSON.stringify(findSpawn(empty, collision)));
}

{
  // the follow camera starts on the side away from the centre, looking across the avatar into the city
  const centre = { center: { x: 10, z: -5 } };
  const at = (az, d = 28) => ({ x: Math.sin(az) * d, z: Math.cos(az) * d }); // the camera's offset from the avatar (FollowCamera)
  for (const spot of [{ x: 110, z: -5 }, { x: 10, z: 170 }, { x: -60, z: -90 }]) {
    const cam = at(facingCentre(spot, centre));
    const toCentre = { x: centre.center.x - spot.x, z: centre.center.z - spot.z };
    check(`the camera looks from ${spot.x},${spot.z} towards the centre`, cam.x * toCentre.x + cam.z * toCentre.z < 0); // the camera is behind: opposite the centre
  }
}

console.log(fails ? `\n${fails} check(s) failed` : '\nall spawn checks passed');
process.exit(fails ? 1 : 0);
