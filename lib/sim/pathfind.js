import { AVATAR_RADIUS, isBlocked } from './collision';
import { findRoute } from '../city/routing';

// A walking route for the avatar from where it stands to a clicked point, round the buildings and everything else solid in the collision
// map (lib/sim/collision.js). A grid search (A*, eight directions, no cutting corners) over the area around the two points, then the
// corners that a straight line can skip are dropped, so the avatar walks straight wherever it can.
//
// A short walk is searched on the grid alone (the area grows if the first has no way through). A long one, or one the grid cannot
// solve within its budget (a lake or a river in the way), follows the roads (lib/city/routing.js, with its bridges), and only the legs
// that are not a clear straight line (onto the road, off it, round a circle's island) are searched on the grid. A target
// inside something solid (a click on a building) moves to the nearest free spot beside it. Returns [{ x, z }, ...] ending at the target
// (without the start), or null when there is no way there.

const CLEARANCE = AVATAR_RADIUS + 0.12; // room to spare, so the route does not graze the walls it is planned round
export const CORNER_REACHED = 0.06; // how near a corner counts as there (a looser one lets the next straight leg clip a building)
const MAX_CELLS = 160000; // the largest grid one search may lay out (about 400 x 400)
const MAX_TESTS = 12000; // the most cells one search may test against the solids: it gives up after that (a few milliseconds)
const LONG_WALK = 30; // farther than this, a walk follows the roads when there are roads to follow

// The solids near an area, so each test looks at a few dozen of them, not the whole city: a bucket grid over the rects, made once per
// collision map and kept with it.
const BUCKET = 8;
const indexes = new WeakMap();
function indexOf(rects) {
  let idx = indexes.get(rects);
  if (idx) return idx;
  const buckets = new Map();
  const big = []; // a river, a hill: spans many buckets, kept apart and always tested
  for (const r of rects) {
    const i0 = Math.floor(r.x0 / BUCKET);
    const i1 = Math.floor(r.x1 / BUCKET);
    const j0 = Math.floor(r.z0 / BUCKET);
    const j1 = Math.floor(r.z1 / BUCKET);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 64) {
      big.push(r);
      continue;
    }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = `${i},${j}`;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(r);
    }
  }
  idx = { buckets, big };
  indexes.set(rects, idx);
  return idx;
}
// Builds the index for a collision map ahead of the first click (the avatar does it when the map changes).
export const prepareWalkMap = ({ rects }) => void indexOf(rects);
function near(rects, x0, z0, x1, z1) {
  const { buckets, big } = indexOf(rects);
  const out = new Set();
  for (let i = Math.floor(x0 / BUCKET); i <= Math.floor(x1 / BUCKET); i++) {
    for (let j = Math.floor(z0 / BUCKET); j <= Math.floor(z1 / BUCKET); j++) {
      for (const r of buckets.get(`${i},${j}`) ?? []) if (r.x1 > x0 && r.x0 < x1 && r.z1 > z0 && r.z0 < z1) out.add(r);
    }
  }
  for (const r of big) if (r.x1 > x0 && r.x0 < x1 && r.z1 > z0 && r.z0 < z1) out.add(r);
  return [...out];
}

// Can the avatar walk the straight line from a to b? Sampled every `step`.
export function clearLine(a, b, all, step = 0.12, r = CLEARANCE) {
  const rects = near(all, Math.min(a.x, b.x) - r - 0.01, Math.min(a.z, b.z) - r - 0.01, Math.max(a.x, b.x) + r + 0.01, Math.max(a.z, b.z) + r + 0.01);
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (isBlocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, rects, r)) return false;
  }
  return true;
}

// The nearest free point to (x, z), searching outwards in rings; (x, z) itself if it is free.
export function nearestFree(x, z, all, bounds, r = CLEARANCE, maxRadius = 8) {
  const rects = near(all, x - maxRadius - r - 0.2, z - maxRadius - r - 0.2, x + maxRadius + r + 0.2, z + maxRadius + r + 0.2);
  if (!isBlocked(x, z, rects, r)) return { x, z };
  for (let radius = 0.15; radius <= maxRadius; radius += 0.15) {
    const steps = Math.max(12, Math.ceil(radius * 12));
    let best = null;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = Math.min(Math.max(x + Math.cos(a) * radius, bounds.x0), bounds.x1);
      const pz = Math.min(Math.max(z + Math.sin(a) * radius, bounds.z0), bounds.z1);
      if (!isBlocked(px, pz, rects, r)) {
        best = { x: px, z: pz };
        break;
      }
    }
    if (best) return best;
  }
  return null;
}

// A small binary heap of [cost, index] for the open set.
function heap() {
  const a = [];
  return {
    get size() {
      return a.length;
    },
    push(f, i) {
      a.push([f, i]);
      let k = a.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (a[p][0] <= a[k][0]) break;
        [a[p], a[k]] = [a[k], a[p]];
        k = p;
      }
    },
    pop() {
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === k) break;
          [a[m], a[k]] = [a[k], a[m]];
          k = m;
        }
      }
      return top[1];
    },
  };
}

// One A* search on a grid of `cell` over the box [x0, x1] x [z0, z1]. Returns the cell centres from start to goal, or null.
function searchGrid(from, to, rects, box, cell) {
  const nx = Math.max(2, Math.ceil((box.x1 - box.x0) / cell));
  const nz = Math.max(2, Math.ceil((box.z1 - box.z0) / cell));
  if (nx * nz > MAX_CELLS) return { cells: null, edge: true };
  const local = near(rects, box.x0 - 1, box.z0 - 1, box.x1 + 1, box.z1 + 1);
  const cx = (i) => box.x0 + (i + 0.5) * cell;
  const cz = (j) => box.z0 + (j + 0.5) * cell;
  let tests = 0;
  const free = new Int8Array(nx * nz); // 0 unknown, 1 free, -1 blocked: tested only when the search reaches a cell
  const open = (i, j) => {
    const k = j * nx + i;
    if (!free[k]) (tests++, (free[k] = isBlocked(cx(i), cz(j), local, CLEARANCE) ? -1 : 1));
    return free[k] === 1;
  };
  const cellOf = (p) => [Math.min(nx - 1, Math.max(0, Math.floor((p.x - box.x0) / cell))), Math.min(nz - 1, Math.max(0, Math.floor((p.z - box.z0) / cell)))];
  const [si, sj] = cellOf(from);
  const [gi, gj] = cellOf(to);
  const start = sj * nx + si;
  const goal = gj * nx + gi;
  free[start] = 1; // where the avatar stands is walkable even if a wall is within the clearance
  free[goal] = 1;
  const g = new Float32Array(nx * nz).fill(Infinity);
  const came = new Int32Array(nx * nz).fill(-1);
  const h = (i, j) => {
    const dx = Math.abs(i - gi);
    const dz = Math.abs(j - gj);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const q = heap();
  g[start] = 0;
  q.push(h(si, sj), start);
  const done = new Uint8Array(nx * nz);
  let edge = false; // did the search reach the box's edge? If not, the start is walled in and a bigger box will not help
  while (q.size) {
    const k = q.pop();
    if (done[k]) continue;
    done[k] = 1;
    if (k === goal) break;
    if (tests > MAX_TESTS) return { cells: null, edge: true, over: true };
    const i = k % nx;
    const j = (k - i) / nx;
    if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1) edge = true;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz || !open(a, b)) continue;
        if (di && dj && (!open(i + di, j) || !open(i, j + dj))) continue; // never squeeze diagonally between two solids
        const n = b * nx + a;
        const cost = g[k] + (di && dj ? Math.SQRT2 : 1);
        if (cost < g[n]) {
          g[n] = cost;
          came[n] = k;
          q.push(cost + h(a, b), n);
        }
      }
    }
  }
  if (came[goal] < 0 && goal !== start) return { cells: null, edge };
  const cells = [];
  for (let k = goal; k !== -1; k = came[k]) cells.push({ x: cx(k % nx), z: cz(Math.floor(k / nx)) });
  return { cells: cells.reverse(), edge: true };
}

// Drops every corner a straight walk can skip (string pulling): from each point, jump to the farthest later point in clear view.
function simplify(points, rects) {
  const out = [points[0]];
  let i = 0;
  while (i < points.length - 1) {
    // look at most 40 points or 40 units ahead: farther straight lines are rare and slow to test
    let j = Math.min(points.length - 1, i + 40);
    while (j > i + 1 && Math.hypot(points[j].x - points[i].x, points[j].z - points[i].z) > 40) j--;
    while (j > i + 1 && !clearLine(points[i], points[j], rects)) j--;
    out.push(points[j]);
    i = j;
  }
  return out;
}

// A grid route from a to b (both free), with boxes growing by `pads`; the points after a, or null.
function gridLeg(a, b, rects, bounds, pads) {
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  for (const pad of pads) {
    const box = {
      x0: Math.max(bounds.x0, Math.min(a.x, b.x) - pad),
      x1: Math.min(bounds.x1, Math.max(a.x, b.x) + pad),
      z0: Math.max(bounds.z0, Math.min(a.z, b.z) - pad),
      z1: Math.min(bounds.z1, Math.max(a.z, b.z) + pad),
    };
    const span = Math.max(box.x1 - box.x0, box.z1 - box.z0);
    const cell = Math.max(0.2, Math.min(0.5, span / 300, dist / 120)); // fine nearby, coarser for a long walk
    const { cells, edge } = searchGrid(a, b, rects, box, cell);
    if (!cells && !edge) return null; // walled in: no wider search can find a way out
    if (cells) return [...cells.slice(1, -1), b];
  }
  return null;
}

// The route from `from` to `to` through the collision map ({ rects, bounds }); with `graph` (lib/city/routing.js graphFor(layout)) a
// long walk follows the roads. See the top of the file.
export function findWalkPath(from, to, { rects, bounds }, { graph } = {}) {
  const goal = nearestFree(to.x, to.z, rects, bounds);
  if (!goal) return null;
  const local = near(rects, Math.min(from.x, goal.x) - 2, Math.min(from.z, goal.z) - 2, Math.max(from.x, goal.x) + 2, Math.max(from.z, goal.z) + 2);
  if (clearLine(from, goal, local)) return [goal]; // nothing in the way: walk straight
  const dist = Math.hypot(goal.x - from.x, goal.z - from.z);
  const finish = (pts) => simplify(pts, rects).slice(1);
  // first the grid round the two points (a short walk, or a long one with no roads)
  if (dist <= LONG_WALK || !graph) {
    const leg = gridLeg(from, goal, rects, bounds, graph ? [4, 12] : [4, 12, 30]);
    if (leg) return finish([from, ...leg]);
    if (!graph) return null;
  }
  // then the roads: their corners in turn, each leg straight when it can be, on the grid when it cannot
  const route = findRoute(graph, from, goal);
  if (!route.onRoad) return null;
  const corners = route.points.slice(1, -1).map((p) => nearestFree(p.x, p.z, rects, bounds) ?? p);
  const pts = [from];
  for (const c of [...corners, goal]) {
    const last = pts.at(-1);
    if (clearLine(last, c, rects)) pts.push(c);
    else {
      const leg = gridLeg(last, c, rects, bounds, [3, 8]);
      if (!leg) return null;
      pts.push(...leg);
    }
  }
  return finish(pts);
}
