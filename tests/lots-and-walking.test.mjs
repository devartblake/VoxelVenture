import { imp, problemTally } from './helpers.mjs';
const { generateCity } = await imp('city/cityGenerator.js');
const { buildCollisionMap, isBlocked, findSpawn, buildingHalf } = await imp('sim/collision.js');
const { scavengerHunt } = await imp('game/daily.js');

const { tally, bad } = problemTally();
const H = 1.4;
const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.02 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.02;
const roadRect = (r) => (r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - H, z1: r.center + H } : { x0: r.center - H, x1: r.center + H, z0: r.from, z1: r.to });
const plotRect = (p) => {
  // a plot turned along a road covers its turned bounds
  const c = Math.abs(Math.cos(p.yaw ?? 0)), sn = Math.abs(Math.sin(p.yaw ?? 0));
  const hw = (p.w * c + p.d * sn) / 2, hd = (p.w * sn + p.d * c) / 2;
  return { x0: p.x - hw, x1: p.x + hw, z0: p.z - hd, z1: p.z + hd };
};
const inside = (r, land) => r.x0 >= land.x0 - 1e-6 && r.x1 <= land.x1 + 1e-6 && r.z0 >= land.z0 - 1e-6 && r.z1 <= land.z1 + 1e-6;

const SEEDS = Number(process.argv[2] ?? process.env.SEEDS ?? 30);
const WALK_SEEDS = Number(process.argv[3] ?? process.env.WALK_SEEDS ?? 4);
const stats = { riverside: 0, rural: 0, lake: 0, outskirts: 0, fields: 0, trees: 0, tall: 0, short: 0 };

for (let seed = 1; seed <= SEEDS; seed++) {
  const c = generateCity(seed);
  const { layout, plots } = c;
  const { roads, land } = layout;
  const roadRects = roads.map(roadRect);

  // --- lots ---
  // ordinary roadside lots (the luxury and grand estates beside them have their own test)
  const lots = plots.filter((p) => ['outskirts', 'countryside', 'lakeside', 'riverside'].includes(p.districtId) && !p.luxury);
  stats.riverside += lots.filter((p) => p.districtId === 'riverside').length;
  stats.rural += lots.filter((p) => p.districtId === 'countryside').length;
  stats.lake += lots.filter((p) => p.districtId === 'lakeside').length;
  stats.outskirts += lots.filter((p) => p.districtId === 'outskirts').length;
  for (const p of lots) {
    // it touches a road's pavement edge and its door looks at that road
    const door = { x: p.x + Math.sin(p.yaw ?? 0) * p.facing * 1.6, z: p.z + Math.cos(p.yaw ?? 0) * p.facing * 1.6 };
    const touching = roads.some((r) => {
      const along = r.axis === 'x' ? p.x : p.z;
      const across = r.axis === 'x' ? p.z : p.x;
      const doorAcross = r.axis === 'x' ? door.z : door.x;
      return along > r.from - 0.01 && along < r.to + 0.01 && Math.abs(Math.abs(across - r.center) - 2.9) < 0.01 && Math.abs(doorAcross - r.center) < Math.abs(across - r.center);
    });
    if (!touching) bad('lot touches a road and faces it', `${p.id} ${p.districtId}`);
    if ((p.districtId === 'lakeside' || p.districtId === 'riverside') && (p.value < 75 || p.value > 150) && !p.owner) bad('lakeside priced as waterfront', `${p.id} ${p.value}`);
  }
  const perLake = layout.lakes.map((l) => lots.filter((p) => p.districtId === 'lakeside' && Math.hypot(p.x - l.x, p.z - l.z) < Math.max(l.rx, l.rz) + 14).length);
  for (const n of perLake) if (n > 18) bad('lakeside lot cap', `${n}`);

  // --- farmland ---
  const plotRects = plots.map(plotRect);
  const park = layout.parks[0];
  const parkRect = park ? { x0: park.center.x - park.width / 2, x1: park.center.x + park.width / 2, z0: park.center.z - park.depth / 2, z1: park.center.z + park.depth / 2 } : null;
  const waterRects = [...layout.rivers, ...layout.lakes.map((l) => ({ x0: l.x - l.rx, x1: l.x + l.rx, z0: l.z - l.rz, z1: l.z + l.rz }))];
  stats.fields += layout.fields.length;
  stats.trees += layout.woods.length;
  for (const f of layout.fields) {
    if (!inside(f, land)) bad('fields inside the land', seed);
    if (roadRects.some((r) => overlap(f, r))) bad('fields clear of roads', seed);
    if (plotRects.some((r) => overlap(f, r))) bad('fields clear of plots', seed);
    if (waterRects.some((r) => overlap(f, r))) bad('fields clear of water', seed);
    if (parkRect && overlap(f, parkRect)) bad('fields clear of the park', seed);
    if (layout.reserved.some((r) => overlap(f, r))) bad('fields clear of the reserved land', seed);
    if (overlap(f, layout.urban)) bad('fields outside the built-up area', seed);
    if (layout.bridges.length === 0 && layout.rivers.length) bad('river has bridges', seed);
  }
  for (const t of layout.woods) {
    const r = { x0: t.x - 0.2, x1: t.x + 0.2, z0: t.z - 0.2, z1: t.z + 0.2 };
    if (roadRects.some((q) => overlap(r, q)) || plotRects.some((q) => overlap(r, q)) || waterRects.some((q) => overlap(r, q))) bad('trees clear of everything', seed);
    if (!inside(r, land)) bad('trees inside the land', seed);
  }

  // --- everything is inside the land ---
  for (const r of roadRects) if (!inside(r, land)) bad('roads inside the land', seed);
  for (const r of plotRects) if (!inside(r, land)) bad('plots inside the land', seed);
  for (const l of layout.lakes) if (!inside({ x0: l.x - l.rx - 1, x1: l.x + l.rx + 1, z0: l.z - l.rz - 1, z1: l.z + l.rz + 1 }, land)) bad('lakes inside the land', seed);
  // the river spans the land from edge to edge
  for (const rv of layout.rivers) {
    const full = rv.axis === 'z' ? Math.abs(rv.z0 - land.z0) < 1e-6 && Math.abs(rv.z1 - land.z1) < 1e-6 : Math.abs(rv.x0 - land.x0) < 1e-6 && Math.abs(rv.x1 - land.x1) < 1e-6;
    if (!full) bad('river runs edge to edge', seed);
  }
  // lots don't sit on the bridges / banks
  for (const b of layout.bridges) {
    const road = roads.find((r) => r.id === b.roadId);
    const span = road.axis === 'x' ? { x0: b.u0 - 1.2, x1: b.u1 + 1.2, z0: road.center - 2, z1: road.center + 2 } : { x0: road.center - 2, x1: road.center + 2, z0: b.u0 - 1.2, z1: b.u1 + 1.2 };
    if (plotRects.some((r) => overlap(r, span))) bad('nothing built on a bridge', b.id);
  }

  // --- downtown is taller than the outskirts ---
  const built = plots.filter((p) => p.owner && p.buildingType !== 'house' && p.height > 0.2);
  const centre = layout.center;
  const near = built.filter((p) => Math.hypot(p.x - centre.x, p.z - centre.z) < 25).map((p) => p.height);
  const far = built.filter((p) => Math.hypot(p.x - centre.x, p.z - centre.z) > 60).map((p) => p.height);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  if (near.length && far.length) {
    stats.tall += avg(near);
    stats.short += avg(far);
    if (avg(near) <= avg(far)) bad('downtown taller than the edge', `${avg(near).toFixed(2)} vs ${avg(far).toFixed(2)}`);
  }
  for (const p of built) if (!(p.height >= 0.5) || p.interiorData.floors < 1) bad('buildings have a sane height and floors', p.id);

  // --- walking ---
  if (seed <= WALK_SEEDS) {
    const map = buildCollisionMap(c);
    const spawn = findSpawn(layout, map);
    const STEP = 0.4;
    const b = map.bounds;
    const cols = Math.ceil((b.x1 - b.x0) / STEP);
    const rows = Math.ceil((b.z1 - b.z0) / STEP);
    const seen = new Uint8Array(cols * rows);
    const cell = (x, z) => [Math.round((x - b.x0) / STEP), Math.round((z - b.z0) / STEP)];
    const queue = [cell(spawn.x, spawn.z)];
    seen[queue[0][1] * cols + queue[0][0]] = 1;
    while (queue.length) {
      const [cx, cz] = queue.pop();
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + ax, nz = cz + az;
        if (nx < 0 || nz < 0 || nx >= cols || nz >= rows || seen[nz * cols + nx]) continue;
        if (isBlocked(b.x0 + nx * STEP, b.z0 + nz * STEP, map.rects)) continue;
        seen[nz * cols + nx] = 1;
        queue.push([nx, nz]);
      }
    }
    const reachable = (x, z) => {
      const [cx, cz] = cell(x, z);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (seen[(cz + dz) * cols + cx + dx]) return true;
      return false;
    };
    // every road's whole length (both ends and the middle)
    for (const r of roads) {
      for (const f of [0, 0.25, 0.5, 0.75, 1]) {
        const u = r.from + (r.to - r.from) * f;
        const [x, z] = r.axis === 'x' ? [u, r.center] : [r.center, u];
        // the middle of a roundabout is its island: test the lane beside it instead
        const island = layout.intersections.some((i) => (i.control === 'roundabout' && Math.hypot(i.x - x, i.z - z) < 0.6) || (i.control === 'circle' && Math.hypot(i.x - x, i.z - z) < i.circle.island * 1.2));
        const [tx, tz] = island ? (r.axis === 'x' ? [x, z + 3.1] : [x + 3.1, z]) : [x, z]; // the ring beside the island
        if (!reachable(tx, tz)) bad('every road reachable on foot', `${r.id}@${f} seed ${seed}`);
      }
    }
    // both banks of the river are reachable, which means the bridges can be walked across
    for (const rv of layout.rivers) {
      const mid = rv.axis === 'z' ? (rv.z0 + rv.z1) / 2 : (rv.x0 + rv.x1) / 2;
      const sides = rv.axis === 'z' ? [[rv.x0 - 1, mid], [rv.x1 + 1, mid]] : [[mid, rv.z0 - 1], [mid, rv.z1 + 1]];
      for (const [x, z] of sides) if (!reachable(x, z)) bad('both river banks reachable (bridges work)', `seed ${seed}`);
      // ...and the water itself is not walkable
      const mx = (rv.x0 + rv.x1) / 2, mz = (rv.z0 + rv.z1) / 2;
      const onWater = rv.axis === 'z' ? [mx, mz + 0.7] : [mx + 0.7, mz];
      // pick a point that is far from any bridge
      const far = layout.bridges.every((br) => Math.abs((rv.axis === 'z' ? onWater[1] : onWater[0]) - br.center) > 3);
      if (far && !isBlocked(onWater[0], onWater[1], map.rects)) bad('the river is not walkable', `seed ${seed}`);
    }
    // a bridge deck is walkable down its whole length
    for (const br of layout.bridges) {
      for (let u = br.u0 - 0.5; u <= br.u1 + 0.5; u += 0.5) {
        const [x, z] = br.axis === 'x' ? [u, br.center] : [br.center, u];
        if (isBlocked(x, z, map.rects)) bad('bridges are walkable end to end', br.id);
      }
    }
    // lakes: shore reachable, water not walkable
    for (const l of layout.lakes) {
      for (const [x, z] of [[l.x - l.rx - 0.6, l.z], [l.x + l.rx + 0.6, l.z], [l.x, l.z - l.rz - 0.6], [l.x, l.z + l.rz + 0.6]]) if (!reachable(x, z)) bad('lake shores reachable', l.id);
      if (!isBlocked(l.x, l.z, map.rects)) bad('lake water blocks walking', l.id);
    }
    // doors
    for (const p of plots.filter((q) => q.owner)) {
      const { hd } = buildingHalf(p);
      const out = p.facing * (hd + 0.33);
      if (!reachable(p.x + Math.sin(p.yaw ?? 0) * out, p.z + Math.cos(p.yaw ?? 0) * out)) bad('every door reachable', `plot ${p.id} ${p.districtId}`);
    }
    // the corners of the land
    for (const [x, z] of [[land.x0 + 2, land.z0 + 2], [land.x1 - 2, land.z0 + 2], [land.x0 + 2, land.z1 - 2], [land.x1 - 2, land.z1 - 2]]) if (!reachable(x, z)) bad('corners of the land reachable', `seed ${seed} ${x.toFixed(0)},${z.toFixed(0)}`);
    // the reserved site
    for (const a of layout.reserved) if (!reachable((a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2)) bad('reserved land reachable', seed);
    // the middle of every park, by the fountain, can be reached through a gate
    for (const park of layout.parks) if (!reachable(park.center.x + 1.7, park.center.z)) bad('park centres reachable', `seed ${seed} ${park.id}`);
    // every scavenger-hunt star, on a spread of days, is somewhere you can walk to
    for (const day of ['2026-01-01', '2026-03-09', '2026-06-15', '2026-09-30', '2026-10-12', '2027-02-14']) {
      for (const spot of scavengerHunt(layout, plots, seed, day)) if (!reachable(spot.x, spot.z) || isBlocked(spot.x, spot.z, map.rects)) bad('hunt stars reachable', `seed ${seed} ${day}: ${spot.kind} "${spot.clue}"`);
    }
  }
}
const f1 = (n) => (n / SEEDS).toFixed(0);
console.log(`${SEEDS} cities: per city ${f1(stats.outskirts)} outskirts lots, ${f1(stats.rural)} countryside lots, ${f1(stats.lake)} lakeside lots, ${f1(stats.riverside)} riverside lots, ${f1(stats.fields)} fields, ${f1(stats.trees)} wood trees; mean height downtown ${(stats.tall / SEEDS).toFixed(2)} vs edge ${(stats.short / SEEDS).toFixed(2)}; walking tested in ${WALK_SEEDS}`);
const problems = Object.values(tally).reduce((a, b) => a + b, 0);
console.log(problems === 0 ? 'ALL OK' : `${problems} problems ${JSON.stringify(tally)}`);
if (problems) process.exitCode = 1;
