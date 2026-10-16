// The banner planes. Pure maths (no three.js), so it can be tested headlessly like the traffic simulation.
//
// Two planes, one based at each airport. Each flies a closed circuit forever:
//   park at home -> taxi to the runway -> take off -> cross the city above the rooftops (towing a banner)
//   -> land at the other airport -> park (a rest) -> take off again -> cross the city on another line -> land at home.
// A route is a list of waypoints with a speed at each; `flightState` places a plane on it at any moment, and
// `trailPoint` says where it was a moment ago, which is where the banner hangs.

const GROUND_Y = 0.14; // wheels on the ground
const TAXI_SPEED = 2.2;
const CRUISE_SPEED = 6.5;
const DWELL_HOME = 14; // seconds parked at the home airport
const DWELL_AWAY = 11; // seconds parked at the other airport
export const BANNER_MIN_SPEED = 3.2; // the banner is out while the plane is faster than this

const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// Airport frame: world position of (t along the runway, n outwards from the county road) at height y, and the inverse.
function frameOf(airport) {
  const f = airport.frame;
  const at = (t, n, y = GROUND_Y) => ({ x: f.origin.x + f.t[0] * t + f.n[0] * n, y, z: f.origin.z + f.t[1] * t + f.n[1] * n });
  const tOf = (p) => (p.x - f.origin.x) * f.t[0] + (p.z - f.origin.z) * f.t[1];
  return { at, tOf, half: f.runwayHalf, rn: f.runwayN, parkT: [-9, 9] };
}

// Pushing back from a parking spot, taxiing to the end of the runway and taking off in direction `d` (+1 / -1 along t).
function departure(fr, spot, d, cruiseY) {
  const { at, half, rn } = fr;
  const pt = fr.parkT[spot];
  return [
    { ...at(pt, 34), v: 0, dwell: 0 },
    { ...at(pt, 38.2), v: TAXI_SPEED },
    { ...at(pt, rn), v: TAXI_SPEED },
    { ...at(-d * (half - 6), rn), v: TAXI_SPEED },
    { ...at(-d * (half - 4), rn), v: 0, dwell: 2.5 }, // line up and hold
    { ...at(-d * (half - 12), rn), v: 4.2 },
    { ...at(d * (half - 18), rn), v: 6.2 },
    { ...at(d * (half - 2), rn, 0.5), v: 7 }, // rotate
    { ...at(d * (half + 12), rn - 3, 2.6), v: 7 },
    { ...at(d * (half + 26), rn - 14, cruiseY * 0.6), v: CRUISE_SPEED },
    { ...at(d * (half + 36), rn - 32, cruiseY), v: CRUISE_SPEED },
  ];
}

// Coming in over the runway from the side the city is on, touching down at the near end, rolling out and parking.
function arrival(fr, spot, d, cruiseY) {
  const { at, half, rn } = fr;
  const pt = fr.parkT[spot];
  return [
    { ...at(-d * (half + 78), rn - 34, cruiseY), v: CRUISE_SPEED },
    { ...at(-d * (half + 52), rn - 18, cruiseY * 0.6), v: CRUISE_SPEED },
    { ...at(-d * (half + 30), rn - 7, cruiseY * 0.3), v: 6 },
    { ...at(-d * (half + 10), rn - 1, 2.4), v: 5.2 },
    { ...at(-d * (half - 6), rn, GROUND_Y + 0.04), v: 5 }, // touchdown
    { ...at(pt - d * 20, rn), v: 4 },
    { ...at(pt + d * 7, rn), v: 2.4 },
    { ...at(pt + d * 1.5, rn - 3.4), v: 1.8 },
    { ...at(pt, 36.4), v: 1.8 },
    { ...at(pt, 34), v: 0, dwell: 0 },
  ];
}

// Waypoints across the city between two points, on one side or the other of the straight line, high enough to clear every roof.
function overCity(from, to, centre, radius, side, y) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const px = -uz;
  const pz = ux;
  const off = radius * 0.32 * side;
  const pt = (along, across) => ({ x: centre.x + ux * along + px * across, y, z: centre.z + uz * along + pz * across, v: CRUISE_SPEED });
  return [pt(-radius * 1.25, off), pt(-radius * 0.45, off * 0.5), pt(radius * 0.45, off * 0.5), pt(radius * 1.25, off)];
}

// A closed circuit of timed waypoints for plane `index`.
function planeRoute(layout, index, cruiseY, centre, radius) {
  const home = layout.airports[index % layout.airports.length];
  const away = layout.airports[(index + 1) % layout.airports.length];
  const fh = frameOf(home);
  const fa = frameOf(away);
  // take off towards the side of the airport the city lies on, and land coming from the city side
  const dirFor = (fr) => (fr.tOf(centre) >= 0 ? 1 : -1);
  const dHome = dirFor(fh);
  const dAway = dirFor(fa);
  const side = index % 2 === 0 ? 1 : -1;

  const out = departure(fh, 0, dHome, cruiseY);
  const inn = arrival(fa, 1, -dAway, cruiseY); // lands rolling away from the city side
  const back = departure(fa, 1, dAway, cruiseY);
  const home2 = arrival(fh, 0, -dHome, cruiseY);

  const nodes = [];
  const push = (list, dwellAtEnd) => {
    list.forEach((n, i) => nodes.push({ ...n, dwell: i === list.length - 1 ? dwellAtEnd : n.dwell ?? 0 }));
  };
  push(out, 0);
  nodes.push(...overCity(out[out.length - 1], inn[0], centre, radius, side, cruiseY));
  push(inn, DWELL_AWAY);
  // the hold at the start of the next departure replaces the first parked node
  push(back, 0);
  nodes.push(...overCity(back[back.length - 1], home2[0], centre, radius, -side, cruiseY));
  push(home2, DWELL_HOME);
  return nodes;
}

// Times for every node (a node with a `dwell` is held for that long), and a smooth path through them.
function timeRoute(nodes) {
  const pts = [];
  let t = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (i > 0) {
      const prev = nodes[i - 1];
      const avg = Math.max(0.8, (Math.max(prev.v ?? 0, 1) + Math.max(n.v ?? 0, 1)) / 2);
      t += Math.max(0.05, dist3(prev, n) / avg);
    }
    pts.push({ x: n.x, y: n.y, z: n.z, v: n.v ?? 0, t, still: false });
    if (n.dwell > 0) {
      t += n.dwell;
      pts.push({ x: n.x, y: n.y, z: n.z, v: 0, t, still: true });
      pts[pts.length - 2].still = true;
    }
  }
  // close the loop: back to the first node, which is where the last dwell ends
  const first = pts[0];
  const last = pts[pts.length - 1];
  const closing = Math.max(0.05, dist3(last, first) / 1.4);
  const period = last.t + closing;
  // tangents (velocity) at each node: central differences over the neighbours, zero where the plane is held
  const n = pts.length;
  const at = (i) => pts[((i % n) + n) % n];
  const time = (i) => at(i).t + Math.floor(i / n) * period;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (p.still || p.v === 0) {
      p.mx = p.my = p.mz = 0;
      continue;
    }
    const a = at(i - 1);
    const b = at(i + 1);
    const span = time(i + 1) - (time(i - 1));
    p.mx = (b.x - a.x) / span;
    p.my = (b.y - a.y) / span;
    p.mz = (b.z - a.z) / span;
  }
  return { pts, period };
}

// Everything the planes need for one city. `plots` give the height of the buildings the planes must clear.
export function buildFlightPlan(layout, plots) {
  const airports = layout.airports ?? [];
  if (airports.length < 2) return { planes: [], period: 0, cruiseY: 0 };
  const hmax = Math.max(0, ...plots.map((p) => p.height ?? 0));
  const cruiseY = Math.max(11, hmax + 4.5);
  const u = layout.urban;
  const centre = { x: (u.x0 + u.x1) / 2, z: (u.z0 + u.z1) / 2 };
  const radius = Math.max(u.x1 - u.x0, u.z1 - u.z0) / 2;
  const planes = [0, 1].map((index) => {
    const route = timeRoute(planeRoute(layout, index, cruiseY, centre, radius));
    return { index, route, offset: 0 };
  });
  // Start the second plane at the moment in its circuit that keeps the two planes furthest apart.
  const plan = { planes, cruiseY, centre, radius };
  const [first, second] = planes;
  let best = { offset: second.route.period / 2, gap: -1 };
  for (let k = 0; k < 96; k++) {
    second.offset = (second.route.period * k) / 96;
    let gap = Infinity;
    for (let t = 0; t < first.route.period; t += 0.5) {
      const a = flightState(plan, 0, t);
      const b = flightState(plan, 1, t);
      gap = Math.min(gap, Math.hypot(a.x - b.x, a.z - b.z, (a.y - b.y) * 2));
      if (gap <= best.gap) break;
    }
    if (gap > best.gap) best = { offset: second.offset, gap };
  }
  second.offset = best.offset;
  return plan;
}

function sample(route, time) {
  const { pts, period } = route;
  const t = ((time % period) + period) % period;
  // binary search for the segment
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].t <= t) lo = mid;
    else hi = mid;
  }
  let a = pts[lo];
  let b = pts[hi];
  if (t >= pts[pts.length - 1].t) {
    // the closing stretch back to the first node
    a = pts[pts.length - 1];
    b = { ...pts[0], t: period };
  }
  const span = Math.max(1e-6, b.t - a.t);
  const u = Math.min(1, Math.max(0, (t - a.t) / span));
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  const mix = (pa, pb, ma, mb) => h00 * pa + h10 * span * ma + h01 * pb + h11 * span * mb;
  return {
    x: mix(a.x, b.x, a.mx ?? 0, b.mx ?? 0),
    y: Math.max(GROUND_Y, mix(a.y, b.y, a.my ?? 0, b.my ?? 0)),
    z: mix(a.z, b.z, a.mz ?? 0, b.mz ?? 0),
  };
}

// Where plane `i` is at `time` (seconds), which way it faces and how fast it is going.
export function flightState(plan, i, time) {
  const plane = plan.planes[i];
  const T = time + plane.offset;
  const p = sample(plane.route, T);
  const dt = 0.12;
  const a = sample(plane.route, T - dt);
  const b = sample(plane.route, T + dt);
  const vx = (b.x - a.x) / (2 * dt);
  const vz = (b.z - a.z) / (2 * dt);
  const vy = (b.y - a.y) / (2 * dt);
  const speed = Math.hypot(vx, vz, vy);
  // parked or nearly so: face the way it is about to go
  let heading = Math.hypot(vx, vz) > 0.25 ? Math.atan2(vx, vz) : null;
  if (heading === null) {
    for (const look of [0.7, 1.5, 3, 6, -0.7, -1.5, -3]) {
      const q = sample(plane.route, T + look);
      const w = sample(plane.route, T + look + 0.3);
      if (Math.hypot(w.x - q.x, w.z - q.z) > 0.02) {
        heading = Math.atan2(w.x - q.x, w.z - q.z);
        break;
      }
    }
  }
  const yaw = heading ?? 0;
  const horizontal = Math.hypot(vx, vz);
  const pitch = horizontal > 0.5 ? Math.atan2(vy, horizontal) : 0;
  // bank into turns
  const ahead = sample(plane.route, T + 0.5);
  const behind = sample(plane.route, T - 0.5);
  const h2 = Math.atan2(ahead.x - p.x, ahead.z - p.z);
  const h1 = Math.atan2(p.x - behind.x, p.z - behind.z);
  let turn = h2 - h1;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  const roll = p.y > 1 ? Math.max(-0.5, Math.min(0.5, -turn * 1.6)) : 0;
  return { ...p, yaw, pitch, roll, speed, onGround: p.y < 0.3, towing: speed > BANNER_MIN_SPEED && p.y > 0.2 };
}

// Where plane `i` was `back` seconds ago: the banner hangs along these points.
export function trailPoint(plan, i, time, back) {
  return sample(plan.planes[i].route, time + plan.planes[i].offset - back);
}

export const FLIGHT_CONSTANTS = { GROUND_Y, TAXI_SPEED, CRUISE_SPEED };

// --- shared by the 3D planes and the mini-map ---------------------------------------------------------
const START = typeof performance !== 'undefined' ? performance.now() : 0;
// Seconds since the page loaded. A test driver can freeze it by setting window.__vvFlightTime to a number.
export function flightClock() {
  if (typeof window !== 'undefined' && typeof window.__vvFlightTime === 'number') return window.__vvFlightTime;
  return (performance.now() - START) / 1000;
}

// The plan for a city, built once (building it searches for the best offset between the planes) and reused
// until the city or the tallest building changes.
let cached = { layout: null, hmax: -1, plan: null };
export function flightPlanFor(layout, plots) {
  const hmax = Math.ceil(Math.max(0, ...plots.map((p) => p.height ?? 0)));
  if (cached.layout !== layout || cached.hmax !== hmax) cached = { layout, hmax, plan: buildFlightPlan(layout, plots) };
  return cached.plan;
}
