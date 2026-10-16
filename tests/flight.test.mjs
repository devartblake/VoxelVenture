// The airports and the banner planes' flight paths.
import { imp } from './helpers.mjs';

const { generateCity } = await imp('city/cityGenerator.js');
const { buildFlightPlan, flightState, trailPoint, BANNER_MIN_SPEED } = await imp('sim/flight.js');

let failed = false;
const seen = {};
const expect = (ok, what, extra = '') => {
  if (!ok) {
    seen[what] = (seen[what] ?? 0) + 1;
    if (seen[what] <= 3) console.log('FAIL', what, extra);
    failed = true;
  }
};
const H = 1.4;
const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.02 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.02;
const roadRect = (r) => (r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - H, z1: r.center + H } : { x0: r.center - H, x1: r.center + H, z0: r.from, z1: r.to });
const box = (b) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 });
const inside = (r, x, z, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
const turned = (p) => {
  const c = Math.abs(Math.cos(p.yaw ?? 0)), s = Math.abs(Math.sin(p.yaw ?? 0));
  return { x0: p.x - (p.w * c + p.d * s) / 2, x1: p.x + (p.w * c + p.d * s) / 2, z0: p.z - (p.w * s + p.d * c) / 2, z1: p.z + (p.w * s + p.d * c) / 2 };
};

const N = Number(process.env.SEEDS ?? 30);
let airborneSeconds = 0, towingSeconds = 0, periodSum = 0;
for (let seed = 1; seed <= N; seed++) {
  const { layout, plots, billboards } = generateCity(seed);
  const { airports, roads, land } = layout;

  // ---- the airports ----
  expect(airports.length === 2, `city ${seed}: two airports`);
  expect(new Set(airports.map((a) => a.name)).size === 2, 'the airports have different names');
  for (const a of airports) {
    const rw = a.runway;
    expect(a.international ? rw.length === 116 && Math.abs(rw.width - 7) < 1e-9 : rw.length === 64 && Math.abs(rw.width - 4.6) < 1e-9, 'a regional runway is 64 x 4.6 and the international one 116 x 7');
    expect((rw.x1 - rw.x0 > rw.z1 - rw.z0) === (a.axis === 'x'), 'the runway runs along the airport axis');
    for (const r of [a.rect, rw, a.apron, box(a.terminal), box(a.tower), ...a.hangars.map(box)]) {
      expect(r.x0 >= land.x0 - 1e-6 && r.x1 <= land.x1 + 1e-6 && r.z0 >= land.z0 - 1e-6 && r.z1 <= land.z1 + 1e-6, 'an airport is inside the land');
    }
    // airside layout: the runway and apron inside the airport, the buildings inside the apron or the loop
    expect(rw.x0 >= a.rect.x0 - 1e-6 && rw.x1 <= a.rect.x1 + 1e-6 && rw.z0 >= a.rect.z0 - 1e-6 && rw.z1 <= a.rect.z1 + 1e-6, 'the runway is inside the airport');
    for (const hgr of a.hangars) expect(!overlap(box(hgr), rw), 'a hangar is clear of the runway');
    expect(!overlap(box(a.terminal), box(a.tower)), 'the tower is beside the terminal, not in it');
    // no other road or plot or the river inside its fenced rectangle (its own loop and spur are the only roads there)
    const own = (r) => r.id.startsWith(`${a.id}-`); // its loop and its spur
    for (const r of roads) if (!own(r)) expect(!overlap(a.rect, roadRect(r)), 'no other road crosses an airport');
    for (const p of plots) expect(!overlap(a.rect, turned(p)), 'no plot stands inside an airport');
    for (const rv of layout.rivers) expect(!overlap(a.rect, rv), 'no river crosses an airport');
    for (const l of layout.lakes) expect(!overlap(a.rect, { x0: l.x - l.rx, x1: l.x + l.rx, z0: l.z - l.rz, z1: l.z + l.rz }), 'no lake inside an airport');
    for (const pk of layout.parks) expect(!overlap(a.rect, { x0: pk.center.x - pk.width / 2, x1: pk.center.x + pk.width / 2, z0: pk.center.z - pk.depth / 2, z1: pk.center.z + pk.depth / 2 }), 'no park inside an airport');
    // its loop road is closed, and a spur joins it to the road network
    const loop = roads.filter((r) => r.group === `${a.id}-loop`);
    expect(loop.length === 4, 'an airport has a four-sided loop road');
    expect(roads.some((r) => r.id === `${a.id}-spur`), 'an airport has a spur road');
    for (const f of a.fields ?? []) void f;
  }
  // one of them is the international airport: the first, and clearly the bigger
  const intl = airports.filter((a) => a.international);
  expect(intl.length === 1 && airports[0].international, `city ${seed}: exactly one international airport (the first)`);
  if (intl.length === 1 && airports[1]) {
    const [big, small] = [airports[0], airports[1]];
    const area = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
    expect(big.name.includes('International') && !small.name.includes('International'), 'only the big one is called International');
    expect(big.runway.length >= small.runway.length * 1.6 && big.runway.width > small.runway.width, 'the international runway is much longer and wider');
    expect(area(big.rect) > area(small.rect) * 1.5, 'the international airport covers a lot more ground');
    expect(big.hangars.length === 4 && small.hangars.length === 2, 'four hangars at the international airport, two at the other');
    expect(big.terminal.w * big.terminal.d > small.terminal.w * small.terminal.d * 2.5, 'a much bigger terminal');
    expect(big.airliners.length === 2 && small.airliners.length === 0, 'airliners are parked at the international airport only');
    // the airliners stand on the apron, clear of the buildings and the banner planes' parking
    for (const l of big.airliners) {
      expect(inside(big.apron, l.x, l.z, 0.5), 'an airliner stands on the apron');
      for (const b of [big.terminal, big.tower, ...big.hangars]) expect(!overlap(box(l), box(b)), 'an airliner is clear of the buildings');
      for (const p of big.parking) expect(Math.hypot(l.x - p.x, l.z - p.z) > 6, 'an airliner is clear of the parking spots');
    }
    for (const b of [big.terminal, big.tower, ...big.hangars]) expect(!overlap(box(b), big.runway), 'the buildings are off the runway');
  }
  const [a0, a1] = airports;
  if (a1) expect(!overlap(a0.rect, a1.rect), 'the airports do not overlap');
  for (const f of layout.fields) for (const a of airports) expect(!overlap(f, a.rect), 'no field inside an airport');
  for (const b of billboards.filter((q) => !q.kind)) for (const a of airports) expect(!inside(a.rect, b.x, b.z), 'no billboard inside an airport');

  // ---- the planes ----
  const plan = buildFlightPlan(layout, plots);
  expect(plan.planes.length === 2, `city ${seed}: two planes`);
  const solids = airports.flatMap((a) => [box(a.terminal), box(a.tower), ...a.hangars.map(box)]);
  const turnedPlots = plots.map((p) => ({ r: turned(p), h: p.height }));
  const rectsNear = (x, z) => turnedPlots.filter((q) => inside(q.r, x, z));
  for (let i = 0; i < 2; i++) {
    const period = plan.planes[i].route.period;
    periodSum += period;
    expect(period > 120 && period < 400, `a plane's circuit takes ${period.toFixed(0)} s (between 2 and 6.5 minutes)`);
    let prev = null;
    const visited = new Set();
    let ground = 0, air = 0, tow = 0;
    const STEP = 0.2;
    for (let t = 0; t < period * 1.02; t += STEP) {
      const s = flightState(plan, i, t);
      expect(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z) && Number.isFinite(s.yaw), 'every flight state is a real number');
      expect(s.y >= 0.1 && s.y <= plan.cruiseY + 2, `altitude stays between the ground and cruise height (got ${s.y.toFixed(2)})`);
      if (prev) expect(Math.hypot(s.x - prev.x, s.y - prev.y, s.z - prev.z) <= 9 * STEP * 1.5, 'a plane never jumps', `${Math.hypot(s.x - prev.x, s.y - prev.y, s.z - prev.z).toFixed(2)} in ${STEP}s`);
      prev = s;
      if (s.onGround) {
        ground++;
        // on the ground it is on a runway, an apron or a taxiway, never inside a building
        const onAirport = airports.find((a) => inside(a.rect, s.x, s.z, 1));
        expect(Boolean(onAirport), 'a plane on the ground is at an airport', `${s.x.toFixed(1)},${s.z.toFixed(1)}`);
        if (onAirport) visited.add(onAirport.id);
        for (const r of solids) expect(!inside(r, s.x, s.z, -0.2), 'a plane on the ground does not drive through a building');
      } else air++;
      if (s.towing) tow++;
      // above the city it clears every roof, with room for the banner hanging below it
      for (const q of rectsNear(s.x, s.z)) expect(s.y >= q.h + 2.2, `a plane clears the rooftops (y ${s.y.toFixed(1)} over a ${q.h} building)`);
      // and the banner that trails behind it
      if (s.towing) {
        for (const back of [0.5, 1, 1.5, 2.2]) {
          const tp = trailPoint(plan, i, t, back);
          for (const q of rectsNear(tp.x, tp.z)) expect(tp.y - 1.8 >= q.h + 0.1, `the banner clears the rooftops (y ${tp.y.toFixed(1)} over a ${q.h} building)`);
        }
      }
    }
    expect(visited.size === 2, 'each plane lands at both airports', [...visited].join(','));
    expect(tow > 20 / STEP, 'a plane tows its banner for a good part of the circuit');
    airborneSeconds += (air * STEP) / period;
    towingSeconds += (tow * STEP) / period;
    void ground;
  }
  // the two planes are never parked or flying in the same spot
  let close = 0;
  for (let t = 0; t < Math.min(plan.planes[0].route.period, 300); t += 1) {
    const a = flightState(plan, 0, t), b = flightState(plan, 1, t);
    if (Math.hypot(a.x - b.x, a.z - b.z) < 2 && Math.abs(a.y - b.y) < 2) close++;
  }
  expect(close === 0, 'the two planes never come within 2 units of each other', `city ${seed}: ${close} s`);
  expect(Boolean(BANNER_MIN_SPEED), 'the banner threshold exists');
}
console.log(`${N} cities: circuit ${(periodSum / (2 * N)).toFixed(0)} s on average, airborne ${((airborneSeconds / (2 * N)) * 100).toFixed(0)}% of the time, towing its banner ${((towingSeconds / (2 * N)) * 100).toFixed(0)}%`);
console.log(failed ? 'FAILED' : 'ALL OK');
if (failed) process.exitCode = 1;
