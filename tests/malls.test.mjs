// The two mega malls: where they stand, that nothing is in their way, and that every store has a working interior.
import { imp, problemTally } from './helpers.mjs';
const { generateCity, BUILDING_TYPES } = await imp('city/cityGenerator.js');
// (the interior scenes themselves need the browser: the browser test opens real store interiors)
const layoutKey = (st) => `${st.interiorData.theme}/${st.interiorData.variant}`;
const { buildCollisionMap, isBlocked } = await imp('sim/collision.js');
const { useCityStore, businessById } = await imp('state/store.js');
const { storeDoors, insideHall, toWorld, HALL } = await imp('city/mallHall.js');
const { bad, total } = problemTally();

const H = 1.4;
const roadRect = (r) => (r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - H, z1: r.center + H } : { x0: r.center - H, x1: r.center + H, z0: r.from, z1: r.to });
const ov = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.05 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.05;
const plotRect = (p) => {
  const c = Math.abs(Math.cos(p.yaw ?? 0)), s = Math.abs(Math.sin(p.yaw ?? 0));
  const hw = (p.w * c + p.d * s) / 2, hd = (p.w * s + p.d * c) / 2;
  return { x0: p.x - hw, x1: p.x + hw, z0: p.z - hd, z1: p.z + hd };
};

let stores = 0, withOffers = 0;
for (let seed = 1; seed <= 40; seed++) {
  const city = generateCity(seed);
  const { layout, plots } = city;
  const malls = layout.malls;
  if (malls.length !== 2) {
    bad('two malls', `${seed}: ${malls.length}`);
    continue;
  }
  const [west, east] = malls;
  const mid = layout.center.x; // (the land is wider on one side now that the new streets and the park can stand outside the county road, so its middle is not the city's)
  if (!(west.end === 'west' && east.end === 'east' && west.x < mid && east.x > mid && east.x - west.x > 130)) bad('the malls stand at opposite ends of the streets', `${seed}: ${west.x.toFixed(0)} and ${east.x.toFixed(0)}`);
  for (const m of malls) {
    const r = m.rect;
    const front = layout.roads.find((rd) => rd.id === m.frontRoad);
    if (!front || !(front.class === 'arterial' || front.kind === 'county')) bad('a mall fronts a busy road', `${seed} ${m.id}`);
    else {
      const flush = front.axis === 'x' ? Math.abs(r.z0 - (front.center + H)) < 0.02 || Math.abs(front.center - H - r.z1) < 0.02 : Math.abs(r.x0 - (front.center + H)) < 0.02 || Math.abs(front.center - H - r.x1) < 0.02;
      if (!flush) bad('a mall is flush against its road (no gap)', `${seed} ${m.id}`);
      const js = layout.intersections.filter((i) => (front.axis === 'x' ? i.z === front.center : i.x === front.center)).map((i) => (front.axis === 'x' ? i.x : i.z));
      const along = front.axis === 'x' ? [r.x0, r.x1] : [r.z0, r.z1];
      if (js.some((j) => j > along[0] - 2 && j < along[1] + 2)) bad('a mall has no junction along its frontage', `${seed} ${m.id}`);
    }
    for (const rd of layout.roads) if (rd.id !== m.frontRoad && ov(r, roadRect(rd))) bad('a mall is clear of the other roads', `${seed} ${m.id} ${rd.id}`);
    for (const p of plots) if (ov(r, plotRect(p))) bad('a mall is clear of plots', `${seed} ${m.id} #${p.id}`);
    for (const l of layout.lakes) if (ov(r, { x0: l.x - l.rx, x1: l.x + l.rx, z0: l.z - l.rz, z1: l.z + l.rz })) bad('a mall is clear of the lakes', `${seed} ${m.id}`);
    for (const rv of layout.rivers) if (ov(r, rv)) bad('a mall is clear of the river', `${seed} ${m.id}`);
    for (const a of layout.airports) if (ov(r, a.rect)) bad('a mall is clear of the airports', `${seed} ${m.id}`);
    for (const a of layout.reserved) if (ov(r, a)) bad('a mall is clear of the reserved sites', `${seed} ${m.id}`);
    for (const pk of layout.parks) if (ov(r, { x0: pk.center.x - pk.width / 2, x1: pk.center.x + pk.width / 2, z0: pk.center.z - pk.depth / 2, z1: pk.center.z + pk.depth / 2 })) bad('a mall is clear of the parks', `${seed} ${m.id}`);

    // stores
    if (m.stores.length !== 10) bad('a mall has ten stores', `${seed} ${m.id}: ${m.stores.length}`);
    if (new Set(m.stores.map((s) => s.id)).size !== m.stores.length) bad('store ids are unique', `${seed} ${m.id}`);
    if (new Set(m.stores.map((s) => s.title)).size < m.stores.length - 1) bad('stores have their own names', `${seed} ${m.id}`);
    const types = new Set(m.stores.map((s) => s.buildingType));
    if (types.size < 3) bad('a mall has shops, restaurants and an office', `${seed} ${m.id}: ${[...types]}`);
    for (const st of m.stores) {
      stores++;
      if (!st.id.startsWith(`${m.id}-s`) || st.mall !== m.id) bad('a store knows its mall', st.id);
      const type = BUILDING_TYPES[st.buildingType];
      if (!type || st.interiorData.theme !== st.buildingType || !type.variants.includes(st.interiorData.variant)) bad('a store has an interior layout of its own type', `${st.id} ${layoutKey(st)}`);
      if (st.interiorData.floors !== 1 || !(st.height > 0.2) || !st.owner) bad('a store is a one-floor business with an owner', st.id);
      if (st.brand && (st.brand.coupon || st.brand.quest || st.brand.video || st.brand.game)) withOffers++;
    }
    if (new Set(m.stores.map(layoutKey)).size < 4) bad('a mall has at least four different interior layouts', `${seed} ${m.id}`);
  }
  // the building is solid and the door is not inside it
  const map = buildCollisionMap(city);
  for (const m of malls) {
    // the mall is hollow: walls all round, a doorway at the front, and a concourse you can walk to every store's door
    if (isBlocked(m.x, m.z, map.rects)) bad('the middle of a mall is open floor', `${seed} ${m.id}`);
    if (isBlocked(m.door.x, m.door.z, map.rects)) bad('a mall door is on open ground', `${seed} ${m.id}`);
    for (const [lx, lz] of [[0, -m.facing * (m.d / 2 - HALL.wall)], [m.w / 2 - HALL.wall, 0], [-(m.w / 2 - HALL.wall), 0], [HALL.door + 1.5, m.facing * (m.d / 2 - HALL.wall)]]) {
      const p = toWorld(m, lx, lz);
      if (!isBlocked(p.x, p.z, map.rects)) bad('a mall wall is solid', `${seed} ${m.id} ${lx.toFixed(1)},${lz.toFixed(1)}`);
    }
    const doorway = toWorld(m, 0, m.facing * (m.d / 2 - HALL.wall));
    if (isBlocked(doorway.x, doorway.z, map.rects)) bad('the doorway is open', `${seed} ${m.id}`);
    if (!insideHall(m, m.x, m.z) || insideHall(m, m.door.x, m.door.z)) bad('inside / outside the hall', `${seed} ${m.id}`);
    // flood the floor from the door in 0.35 steps: every store door's standing place must be reached
    const STEP = 0.35;
    const seen = new Set();
    const key = (i, j) => `${i},${j}`;
    const queue = [[Math.round(m.door.x / STEP), Math.round(m.door.z / STEP)]];
    seen.add(key(...queue[0]));
    for (let qi = 0; qi < queue.length && qi < 60000; qi++) {
      const [i, j] = queue[qi];
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        const x = ni * STEP, z = nj * STEP;
        if (seen.has(key(ni, nj)) || Math.hypot(x - m.x, z - m.z) > Math.hypot(m.w, m.d) / 2 + 3) continue;
        if (isBlocked(x, z, map.rects)) continue;
        seen.add(key(ni, nj));
        queue.push([ni, nj]);
      }
    }
    for (const sd of storeDoors(m)) {
      if (!insideHall(m, sd.standAt.x, sd.standAt.z)) bad('a store door is inside the hall', `${seed} ${sd.store.id}`);
      if (!seen.has(key(Math.round(sd.standAt.x / STEP), Math.round(sd.standAt.z / STEP)))) bad('you can walk to every store door', `${seed} ${sd.store.id}`);
    }
  }
}
if (withOffers < stores * 0.5) bad('most stores have offers', `${withOffers} of ${stores}`);

// the store lookup and the coupon work for a store that is not in `plots`
{
  const city = generateCity(2);
  useCityStore.setState({ plots: city.plots, layout: city.layout, billboards: city.billboards });
  const st = city.layout.malls[0].stores.find((s) => s.brand?.coupon) ?? city.layout.malls[0].stores[0];
  if (businessById(useCityStore.getState(), st.id)?.title !== st.title) bad('a store can be looked up by id', st.id);
  if (businessById(useCityStore.getState(), city.plots[0].id)?.id !== city.plots[0].id) bad('a plot can still be looked up by id', '');
  if (st.brand?.coupon) {
    const before = st.brand.coupon.claimed;
    const r = useCityStore.getState().claimCoupon(st.id);
    const after = businessById(useCityStore.getState(), st.id).brand.coupon.claimed;
    if (!r.ok || after !== before + 1 || !useCityStore.getState().redeemed[st.id]) bad('a store coupon can be claimed', JSON.stringify(r));
  }
}

// renting a store
{
  const city = generateCity(3);
  useCityStore.setState({ plots: city.plots, layout: city.layout, billboards: city.billboards });
  const st = city.layout.malls[1].stores[4];
  const price = useCityStore.getState().rentStore(st.id, 'Tester', 'My Corner Shop', 'https://example.com', { kind: 'generated' });
  const mine = businessById(useCityStore.getState(), st.id);
  if (price !== Math.round(st.value * 1.25)) bad('a store rents at the claim price', `${price}`);
  if (!mine.userClaimed || mine.title !== 'My Corner Shop' || mine.owner !== 'Tester') bad('a rented store is the players', JSON.stringify([mine.userClaimed, mine.title, mine.owner]));
  if (mine.buildingType !== st.buildingType || mine.interiorData.variant !== st.interiorData.variant || mine.mall !== st.mall || mine.unit !== st.unit) bad('a rented store keeps its kind, interior and place in the mall', st.id);
  if (useCityStore.getState().rentStore(st.id, 'Other', 'Again', 'https://x.example', { kind: 'generated' }) !== null) bad('a store cannot be rented twice', '');
  if (useCityStore.getState().rentStore(city.layout.malls[0].stores[0].id, 'T', 'No logo', 'https://x.example', null) !== null) bad('renting needs a roof banner', '');
}

console.log(`${stores} stores in ${40 * 2} malls; ${withOffers} have offers`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
