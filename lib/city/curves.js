// Curved roads. Everything here is plain maths (no three.js), so it can be tested headlessly.
//
// A curved road is described like a turtle walking: a start pose and a list of segments.
//
//   {
//     id: 'old-town-bend',
//     name: 'Bend Rd',
//     start: { x: 50, z: 4, heading: Math.PI / 2 },     // heading: direction of travel, forward = (sin h, cos h)
//     segments: [
//       { line: 6 },                                     // straight, 6 long
//       { arc: { radius: 12, angle: Math.PI / 2 } },     // turn RIGHT by 90 degrees (use a negative angle for left)
//       { line: 8 },
//       { bezier: { c1: [x, z], c2: [x, z], to: [x, z] } },  // a smooth curve to an absolute point (control points in world coordinates)
//     ],
//   }
//
// Headings: 0 = south (+z), PI/2 = east (+x), PI = north, -PI/2 = west. A road that starts on an
// axis-aligned heading (a multiple of PI/2) at the end of an existing road joins it cleanly.
// Road cross-section matches the straight roads: 1.6 asphalt + a 0.6 sidewalk each side (a 2.8 corridor).

export const CURVE_STEP = 0.25; // distance between samples along the centre line
export const ROAD_HALF = 0.8; // half the asphalt width
export const SIDEWALK = 0.6;
export const CORRIDOR_HALF = ROAD_HALF + SIDEWALK; // 1.4, same as the straight roads
// The tightest bend that keeps the inside sidewalk from folding over itself, with room to spare.
export const MIN_RADIUS = CORRIDOR_HALF + 1;

// The traveller's right-hand direction on the ground, for a heading h.
export const rightOf = (h) => [-Math.cos(h), Math.sin(h)];
export const forwardOf = (h) => [Math.sin(h), Math.cos(h)];

export function sampleCurve(spec) {
  const { start, segments } = spec;
  let { x, z, heading: h } = start;
  let s = 0;
  const points = [{ x, z, h, s }];

  for (const seg of segments) {
    if (typeof seg.line === 'number') {
      const n = Math.max(1, Math.round(seg.line / CURVE_STEP));
      const d = seg.line / n;
      for (let i = 0; i < n; i++) {
        x += Math.sin(h) * d;
        z += Math.cos(h) * d;
        s += d;
        points.push({ x, z, h, s });
      }
    } else if (seg.bezier) {
      // A cubic Bezier from here to `to`. It leaves along the current heading only if c1 lies ahead of
      // the road, and arrives heading from c2 toward `to`. Sampled by arc length so points are evenly spaced.
      const { c1, c2, to } = seg.bezier;
      const p0 = [x, z];
      const at = (t) => {
        const u = 1 - t;
        return [
          u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * to[0],
          u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * to[1],
        ];
      };
      const slope = (t) => {
        const u = 1 - t;
        return [
          3 * u * u * (c1[0] - p0[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (to[0] - c2[0]),
          3 * u * u * (c1[1] - p0[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (to[1] - c2[1]),
        ];
      };
      const N = 800;
      const cumulative = [0];
      let prev = p0;
      for (let i = 1; i <= N; i++) {
        const q = at(i / N);
        cumulative.push(cumulative[i - 1] + Math.hypot(q[0] - prev[0], q[1] - prev[1]));
        prev = q;
      }
      const total = cumulative[N];
      const n = Math.max(2, Math.round(total / CURVE_STEP));
      let i = 0;
      for (let k = 1; k <= n; k++) {
        const target = (total * k) / n;
        while (i < N && cumulative[i + 1] < target) i++;
        const span = cumulative[i + 1] - cumulative[i] || 1;
        const t = (i + (target - cumulative[i]) / span) / N;
        const q = at(Math.min(t, 1));
        const d = slope(Math.min(t, 1));
        x = q[0];
        z = q[1];
        h = Math.atan2(d[0], d[1]);
        points.push({ x, z, h, s: s + target });
      }
      s += total;
    } else if (seg.arc) {
      const { radius, angle } = seg.arc;
      const length = Math.abs(angle) * radius;
      const n = Math.max(2, Math.round(length / CURVE_STEP));
      const dh = -angle / n; // a right turn (positive angle) lowers the heading
      const d = length / n;
      const chord = 2 * radius * Math.sin(Math.abs(dh) / 2); // exact for a circle
      for (let i = 0; i < n; i++) {
        const mid = h + dh / 2;
        x += Math.sin(mid) * chord;
        z += Math.cos(mid) * chord;
        h += dh;
        s += d;
        points.push({ x, z, h, s });
      }
    }
  }
  return { id: spec.id, name: spec.name, spec, points, length: s };
}

// Problems with a spec that would make a bad-looking or unusable road.
export function validateSpec(spec) {
  const problems = [];
  for (const [i, seg] of spec.segments.entries()) {
    if (seg.arc && Math.abs(seg.arc.radius) < MIN_RADIUS) problems.push(`segment ${i}: radius ${seg.arc.radius} is below the minimum ${MIN_RADIUS}`);
    if (typeof seg.line === 'number' && seg.line <= 0) problems.push(`segment ${i}: line length must be positive`);
    if (seg.bezier && !['c1', 'c2', 'to'].every((k) => Array.isArray(seg.bezier[k]) && seg.bezier[k].length === 2 && seg.bezier[k].every(Number.isFinite))) problems.push(`segment ${i}: a bezier needs c1, c2 and to, each [x, z]`);
    if (!seg.arc && !seg.bezier && typeof seg.line !== 'number') problems.push(`segment ${i}: needs a "line", an "arc" or a "bezier"`);
  }
  return problems;
}

// The tightest bend anywhere along a sampled curve (smallest radius), from how fast the heading turns.
// Used to check smooth connecting curves, whose radius isn't given directly.
export function minRadius(curve) {
  let smallest = Infinity;
  for (let i = 1; i < curve.points.length; i++) {
    const a = curve.points[i - 1];
    const b = curve.points[i];
    const turn = Math.abs(Math.atan2(Math.sin(b.h - a.h), Math.cos(b.h - a.h)));
    if (turn > 1e-6) smallest = Math.min(smallest, (b.s - a.s) / turn);
  }
  return smallest;
}

// The point (and heading) a distance s along the road.
export function pointAt(curve, s) {
  const { points, length } = curve;
  const t = Math.min(Math.max(s, 0), length);
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].s <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const f = b.s === a.s ? 0 : (t - a.s) / (b.s - a.s);
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, h: a.h + (b.h - a.h) * f, s: t };
}

export const offsetPoint = (p, d) => {
  const r = rightOf(p.h);
  return [p.x + r[0] * d, p.z + r[1] * d];
};

// ---------------------------------------------------------------------------------------------
// Mesh data. Each builder returns { positions, indices } (flat number arrays) for a three.js
// BufferGeometry. Materials should be double-sided, so the winding doesn't matter visually.
// ---------------------------------------------------------------------------------------------

// A strip along the road between two edges, each a (lateral offset, height) pair. Flat when the
// heights match (asphalt, a pavement top); a vertical wall when the offsets match (a kerb).
export function ribbon(points, a, b) {
  const positions = [];
  const indices = [];
  points.forEach((p) => {
    const [ax, az] = offsetPoint(p, a.d);
    const [bx, bz] = offsetPoint(p, b.d);
    positions.push(ax, a.y, az, bx, b.y, bz);
  });
  for (let i = 0; i < points.length - 1; i++) {
    const q = i * 2;
    indices.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
  }
  return { positions, indices };
}

export function mergeMeshData(parts) {
  const positions = [];
  const indices = [];
  for (const part of parts) {
    const base = positions.length / 3;
    positions.push(...part.positions);
    for (const i of part.indices) indices.push(base + i);
  }
  return { positions, indices };
}

export const ASPHALT_Y = 0.03;
export const SIDEWALK_Y = 0.08;

export const asphaltData = (curve) => ribbon(curve.points, { d: -ROAD_HALF, y: ASPHALT_Y }, { d: ROAD_HALF, y: ASPHALT_Y });

// One pavement: a top and the two kerbs, on the right (+1) or left (-1) of the road.
export function sidewalkData(curve, side) {
  const inner = side * ROAD_HALF;
  const outer = side * CORRIDOR_HALF;
  const lo = Math.min(inner, outer);
  const hi = Math.max(inner, outer);
  return mergeMeshData([
    ribbon(curve.points, { d: lo, y: SIDEWALK_Y }, { d: hi, y: SIDEWALK_Y }),
    ribbon(curve.points, { d: inner, y: ASPHALT_Y }, { d: inner, y: SIDEWALK_Y }),
    ribbon(curve.points, { d: outer, y: ASPHALT_Y }, { d: outer, y: SIDEWALK_Y }),
  ]);
}

// Dashed centre line: short flat quads every `pitch`.
export function dashData(curve, { pitch = 1.2, length = 0.6, width = 0.07 } = {}) {
  const parts = [];
  for (let s = pitch / 2; s + length / 2 < curve.length; s += pitch) {
    const a = pointAt(curve, s - length / 2);
    const b = pointAt(curve, s + length / 2);
    const m = pointAt(curve, s);
    const r = rightOf(m.h);
    const w = width / 2;
    parts.push({
      positions: [
        a.x - r[0] * w, ASPHALT_Y + 0.003, a.z - r[1] * w,
        a.x + r[0] * w, ASPHALT_Y + 0.003, a.z + r[1] * w,
        b.x - r[0] * w, ASPHALT_Y + 0.003, b.z - r[1] * w,
        b.x + r[0] * w, ASPHALT_Y + 0.003, b.z + r[1] * w,
      ],
      indices: [0, 1, 2, 1, 3, 2],
    });
  }
  return mergeMeshData(parts);
}

// Street lamps stand in the middle of the pavement, alternating sides.
export function lampPositions(curve, { pitch = 4.8 } = {}) {
  const lamps = [];
  let n = 0;
  for (let s = pitch / 2; s < curve.length - 1; s += pitch, n++) {
    const p = pointAt(curve, s);
    const side = n % 2 === 0 ? -1 : 1;
    const [x, z] = offsetPoint(p, side * (ROAD_HALF + SIDEWALK / 2));
    lamps.push({ x, z, h: p.h, side });
  }
  return lamps;
}

// ---------------------------------------------------------------------------------------------
// Plots beside a curve
// ---------------------------------------------------------------------------------------------

// Plots lined up along one side of the road, each with its front door facing the road. Each plot is
// { x, z, yaw, s }; `yaw` turns the plot's own +Z (its front, when facing = +1) toward the road.
//
// Two things keep them tidy on a bend. On the INSIDE of a bend the road curls round the plot, so
// a square plot's corner would cut into the pavement; the plot is moved out by exactly the amount
// that clears it. And each plot is placed at the first spot where it clears the one before by the
// full gap (measured with the real rotated boxes), so on the inside they stay shoulder to shoulder
// and on the outside they fan out, rather than piling up or overlapping.
export function plotsAlong(curve, { side = 'right', tile = 3, gap = 0.4, from = 0, to = curve.length } = {}) {
  const sign = side === 'right' ? 1 : -1;
  const half = tile / 2;
  const base = CORRIDOR_HALF + half;
  const plots = [];
  let previous = null;

  for (let s = from + half; s <= to - half + 1e-9; s += CURVE_STEP / 10) {
    const p = pointAt(curve, s);
    // How sharply the road bends toward this side (1 / radius; positive = this is the inside of the bend).
    const toward = sign * -(pointAt(curve, s + 0.5).h - pointAt(curve, s - 0.5).h);
    let offset = base;
    if (toward > 1e-6) {
      const radius = 1 / toward;
      if (radius < CORRIDOR_HALF + tile * 1.5) continue; // too tight for plots on this side
      // where the plot's nearest corner (half a tile along, half a tile in) just touches the corridor edge
      offset = Math.max(base, radius + half - Math.sqrt((radius - CORRIDOR_HALF) ** 2 - half ** 2) + 0.01);
    }
    const [x, z] = offsetPoint(p, sign * offset);
    const yaw = side === 'right' ? p.h + Math.PI / 2 : p.h - Math.PI / 2;
    // both boxes inflated by half the gap, so "not overlapping" means "at least a gap apart"
    const box = { x, z, hw: half + gap / 2, hd: half + gap / 2, yaw };
    if (previous && boxesOverlap(previous, box)) continue;
    plots.push({ x, z, yaw, s });
    previous = box;
  }
  return plots;
}

// Oriented-box overlap (separating axis test) between two { x, z, hw, hd, yaw } boxes.
export function boxesOverlap(a, b, eps = 1e-6) {
  const axes = [a, b].flatMap((box) => [
    [Math.cos(box.yaw), -Math.sin(box.yaw)],
    [Math.sin(box.yaw), Math.cos(box.yaw)],
  ]);
  const corners = (box) => {
    const c = Math.cos(box.yaw);
    const s = Math.sin(box.yaw);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
      const lx = sx * box.hw;
      const lz = sz * box.hd;
      return [box.x + lx * c + lz * s, box.z - lx * s + lz * c];
    });
  };
  const ca = corners(a);
  const cb = corners(b);
  for (const [ax, az] of axes) {
    const pa = ca.map(([x, z]) => x * ax + z * az);
    const pb = cb.map(([x, z]) => x * ax + z * az);
    if (Math.max(...pa) <= Math.min(...pb) + eps || Math.max(...pb) <= Math.min(...pa) + eps) return false;
  }
  return true;
}

// Does any plot sit on the road, or on top of another plot?
export function plotProblems(curve, plots, tile = 3, gap = 0.4) {
  const problems = [];
  const boxes = plots.map((p) => ({ x: p.x, z: p.z, hw: tile / 2, hd: tile / 2, yaw: p.yaw }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) if (boxesOverlap(boxes[i], boxes[j])) problems.push(`plots ${i} and ${j} overlap`);
  }
  // the corridor, approximated by the road's own samples: a plot corner must stay outside it
  for (const [i, box] of boxes.entries()) {
    const c = Math.cos(box.yaw);
    const s = Math.sin(box.yaw);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = box.x + sx * box.hw * c + sz * box.hd * s;
      const cz = box.z - sx * box.hw * s + sz * box.hd * c;
      const nearest = Math.min(...curve.points.map((p) => Math.hypot(p.x - cx, p.z - cz)));
      if (nearest < CORRIDOR_HALF - 0.05) problems.push(`plot ${i} reaches into the road`);
    }
  }
  return problems;
}
