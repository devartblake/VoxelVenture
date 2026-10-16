// Docking a boat (pure rules, no React or three.js, so they are tested in Node): which pier is the nearest on the water the boat is on, the route to
// its dock round the end of the pier if it is in the way, and the autopilot that steers the boat along it and brings it to rest alongside.
//   route    a list of points to pass through, the last of them the dock (beside the pier)
//   autopilot(v, state, dt) -> { throttle, steer, done }   what the boat's controls should be this moment
import { deckRect } from '../city/piers';

const wrap = (a) => {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const inside = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

// Does the segment a-b pass through the rectangle?
export function segmentHitsRect(a, b, r) {
  if (inside(r, a.x, a.z) || inside(r, b.x, b.z)) return true;
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [p, q] of [[-dx, a.x - r.x0], [dx, r.x1 - a.x], [-dz, a.z - r.z0], [dz, r.z1 - a.z]]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

// The water rectangle (from waterRects) a point is on, or null
export const waterAt = (x, z, water) => water.find((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) ?? null;

// The nearest pier to dock at: on the same water as the boat, by the distance to its dock. Returns null when that water has no pier.
export function nearestPier(v, piers, water) {
  const here = waterAt(v.x, v.z, water);
  const candidates = piers.filter((p) => !here || p.waterId === here.id);
  let best = null;
  let bestD = Infinity;
  for (const p of candidates) {
    const d = Math.hypot(p.dock.x - v.x, p.dock.z - v.z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

// A boat may not sail through a pier's deck (its sides are given a little room for the boat's size)
export const hitsPier = (x, z, r, piers) => piers.some((p) => x > p.x0 - r && x < p.x1 + r && z > p.z0 - r && z < p.z1 + r);

// The way to a pier's dock: a point out to the side of the dock (so the boat comes in sideways to the pier), and round the end of the pier first if the
// straight way to that point would cross the deck. The last point is the dock itself.
export function routeToPier(v, pier) {
  const sideVec = pier.axis === 'x' ? { x: 0, z: pier.dock.side } : { x: pier.dock.side, z: 0 };
  const dirVec = pier.axis === 'x' ? { x: pier.dir, z: 0 } : { x: 0, z: pier.dir };
  const out = { x: pier.dock.x + sideVec.x * 2.4, z: pier.dock.z + sideVec.z * 2.4 };
  const route = [out, { x: pier.dock.x, z: pier.dock.z }];
  const start = { x: v.x, z: v.z };
  if (segmentHitsRect(start, out, deckRect(pier, 1.3))) {
    // round the tip: out past the end of the pier, on the dock's side
    const tipOut = { x: pier.tip.x + dirVec.x * 2.8 + sideVec.x * 1.2, z: pier.tip.z + dirVec.z * 2.8 + sideVec.z * 1.2 };
    route.unshift(tipOut);
  }
  return route;
}

// A docking in progress: { pier, route, i (the point being steered to), align (true once at the dock) }.
export function startDocking(v, pier) {
  return { pier, route: routeToPier(v, pier), i: 0, align: false, still: 0, best: Infinity, far: 0, stuck: 0 };
}

// The boat's controls for this moment. { throttle: -1..1, steer: -1..1, done, failed } : `done` when it lies alongside the pier, still and facing along it.
export function autopilot(v, st, dt) {
  const last = st.route.length - 1;
  if (st.align) {
    const out = st.pier.dock.yaw;
    const target = Math.abs(wrap(out - v.yaw)) <= Math.PI / 2 ? out : out + Math.PI; // along the pier, whichever way is the shorter turn
    const err = wrap(target - v.yaw);
    const calm = Math.abs(v.speed) < 0.25;
    st.still = calm ? st.still + dt : 0;
    return { throttle: 0, steer: clamp(-err * 2.5, -1, 1), done: calm && Math.abs(err) < 0.12 && st.still > 0.25, failed: false };
  }
  const wp = st.route[st.i];
  const dx = wp.x - v.x;
  const dz = wp.z - v.z;
  const dist = Math.hypot(dx, dz);
  const err = wrap(Math.atan2(dx, dz) - v.yaw);
  if (dist < (st.i === last ? 0.45 : 1.1)) {
    if (st.i === last) st.align = true;
    else st.i++;
    return { throttle: 0, steer: 0, done: false, failed: false };
  }
  // stuck: it has been stopped for a few seconds (against something), or it has got no nearer to the point for a long time
  if (dist < st.best - 0.05) {
    st.best = dist;
    st.far = 0;
  } else st.far = (st.far ?? 0) + dt;
  st.stuck = Math.abs(v.speed) < 0.15 ? st.stuck + dt : 0;
  const turning = Math.abs(err) > 0.9;
  let throttle = turning ? 0.12 : 0.9 * Math.min(1, Math.max(0.18, dist * 0.35)) * (1 - Math.abs(err) / 2);
  if (st.i === last) throttle = Math.min(throttle, dist < 0.9 ? 0.1 : 0.28); // the last stretch, gently, creeping the last of it
  return { throttle, steer: clamp(-err * 2.2, -1, 1), done: false, failed: st.stuck > 5 || st.far > 40 };
}
