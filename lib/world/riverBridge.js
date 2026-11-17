// The bridges where a road crosses a river (docs/world/river_plan.md): every river has to cross the coastal ring to reach the sea, and a flat slab over the channel is no bridge. A road piece that meets a river's
// channel is split by the bake: the road up to the bridge, a `river-bridge` piece (a deck that rises from the bank over `ramp` units to `clearance` over the ground, so a boat passes under, and comes down again),
// and the road after it. The piece records where the channel is along it (`channel`), so the piers stand in the water. This file has the pure parts: finding the spans along a road and building the bridge's
// boxes (a girder, parapets, end posts and piers) for one baked piece. No three.js.

export const RIVER_BRIDGE = {
  clearance: 2.4, // the deck's height over the ground at the middle (the water is 0.3 under the ground: a boat is about a unit high)
  ramp: 22, // the deck rises from the ground to the clearance over this many units on each side of the channel
  margin: 4, // the flat part beyond the channel's edge on each side, on the banks
  step: 3, // the deck is cut into pieces this long, each laid along the slope
  girder: 0.55, // the girder's depth under the deck
  parapet: { height: 0.6, width: 0.24 },
  pier: { width: 1.1, every: 12 }, // a pier in the water every so many units along the channel
};

/**
 * The bridge spans along the segment a-b given `sdAt(x, z)` (negative in a river's channel): [{ s0, s1, c0, c1 }], distances along the segment: the whole bridge (the ramps and the margin included, kept to the
 * segment) and the channel in it. Spans that overlap are one bridge.
 */
export function bridgeSpans(a, b, sdAt, o = RIVER_BRIDGE) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 1) return [];
  const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
  return spansAlong(len, (s) => sdAt(a.x + dx * s, a.z + dz * s) < 0, o);
}

/** The same along any path of length `len`, given `wetAt(s)` (is the road in the channel at distance s along it). */
export function spansAlong(len, wetAt, o = RIVER_BRIDGE) {
  const runs = [];
  let from = null;
  for (let s = 0; s <= len + 1e-9; s += 0.5) {
    const wet = wetAt(s);
    if (wet && from === null) from = s;
    if (!wet && from !== null) { runs.push([from, s - 0.5]); from = null; }
  }
  if (from !== null) runs.push([from, len]);
  const spans = [];
  for (const [c0, c1] of runs) {
    const s0 = Math.max(0, c0 - o.margin - o.ramp), s1 = Math.min(len, c1 + o.margin + o.ramp);
    const last = spans[spans.length - 1];
    if (last && s0 <= last.s1) { last.s1 = s1; last.c1 = c1; } else spans.push({ s0, s1, c0, c1 });
  }
  return spans;
}

// ---- boxes: an oriented box with its own axes, as flat-shaded faces with normals and vertex colours
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A growing mesh of boxes: positions, normals, colours (bytes) and indices. */
export function boxBuilder() {
  const positions = [], normals = [], colors = [], indices = [];
  /** A box at `c` with half sizes `h` ([along, up, across]) on the axes `u` (along), `v` (up), `w` (across), in `color` ([r, g, b]). */
  const add = (c, h, u, v, w, color) => {
    const faces = [[u, 1, [v, w]], [u, -1, [w, v]], [v, 1, [w, u]], [v, -1, [u, w]], [w, 1, [u, v]], [w, -1, [v, u]]];
    for (const [axis, sign, [p, q]] of faces) {
      const hs = (ax) => (ax === u ? h[0] : ax === v ? h[1] : h[2]);
      const base = positions.length / 3;
      const n = [axis[0] * sign, axis[1] * sign, axis[2] * sign];
      for (const [sp, sq] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        positions.push(
          c[0] + axis[0] * hs(axis) * sign + p[0] * hs(p) * sp + q[0] * hs(q) * sq,
          c[1] + axis[1] * hs(axis) * sign + p[1] * hs(p) * sp + q[1] * hs(q) * sq,
          c[2] + axis[2] * hs(axis) * sign + p[2] * hs(p) * sp + q[2] * hs(q) * sq,
        );
        normals.push(...n);
        colors.push(...color);
      }
      // wound so the face points along its normal
      const t = cross([positions[(base + 1) * 3] - positions[base * 3], positions[(base + 1) * 3 + 1] - positions[base * 3 + 1], positions[(base + 1) * 3 + 2] - positions[base * 3 + 2]], [positions[(base + 2) * 3] - positions[base * 3], positions[(base + 2) * 3 + 1] - positions[base * 3 + 1], positions[(base + 2) * 3 + 2] - positions[base * 3 + 2]]);
      if (t[0] * n[0] + t[1] * n[1] + t[2] * n[2] >= 0) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  };
  return { positions, normals, colors, indices, add };
}

export const BRIDGE_COLORS = { girder: [96, 104, 116], parapet: [208, 216, 226], pier: [126, 134, 144], post: [188, 196, 208] };

/**
 * The boxes of one baked `river-bridge` piece (h: { a, b, width, clearance, ramp, span, along: [s0, s1], channel: [c0, c1] }, `deck(s)` the deck's height at a distance s along the whole bridge): a girder
 * and two parapets along the piece in `step`-long pieces laid along the slope, a post at each end of the bridge, and piers in the water. `ground(x, z)` is the height of the ground (the bed, for the piers).
 */
export function bridgeBoxes(h, deck, ground, bed, o = RIVER_BRIDGE) {
  const b = boxBuilder();
  const len = Math.hypot(h.b.x - h.a.x, h.b.z - h.a.z);
  if (len < 0.5) return b;
  const dx = (h.b.x - h.a.x) / len, dz = (h.b.z - h.a.z) / len;
  const across = [-dz, 0, dx];
  const at = (t) => ({ x: h.a.x + (h.b.x - h.a.x) * t, z: h.a.z + (h.b.z - h.a.z) * t });
  const top = (s) => deck(s) + ground(at((s - h.along[0]) / (h.along[1] - h.along[0] || 1)).x, at((s - h.along[0]) / (h.along[1] - h.along[0] || 1)).z) + 0.1; // the road's surface: the ribbon is laid at the deck + the highway lift
  const steps = Math.max(1, Math.ceil(len / o.step));
  const W = h.width;
  for (let k = 0; k < steps; k++) {
    const s0 = h.along[0] + ((h.along[1] - h.along[0]) * k) / steps, s1 = h.along[0] + ((h.along[1] - h.along[0]) * (k + 1)) / steps;
    const p0 = at(k / steps), p1 = at((k + 1) / steps);
    const y0 = top(s0), y1 = top(s1), L = Math.hypot(p1.x - p0.x, p1.z - p0.z, y1 - y0);
    const u = norm([p1.x - p0.x, y1 - y0, p1.z - p0.z]);
    const v = norm(cross(across, u)); // up, tilted with the slope
    const mid = [(p0.x + p1.x) / 2, (y0 + y1) / 2, (p0.z + p1.z) / 2];
    const lift = (d) => [mid[0] + v[0] * d, mid[1] + v[1] * d, mid[2] + v[2] * d];
    b.add(lift(-0.04 - o.girder / 2), [L / 2 + 0.02, o.girder / 2, W / 2 + 0.3], u, v, across, BRIDGE_COLORS.girder); // under the road (its top a hair under the ribbon)
    for (const side of [-1, 1]) {
      const c = lift(o.parapet.height / 2);
      b.add([c[0] + across[0] * side * (W / 2 - o.parapet.width / 2), c[1], c[2] + across[2] * side * (W / 2 - o.parapet.width / 2)], [L / 2 + 0.02, o.parapet.height / 2, o.parapet.width / 2], u, v, across, BRIDGE_COLORS.parapet);
    }
  }
  // a post at each end of the bridge, on both sides
  for (const [s, p] of [[0, h.a], [h.span, h.b]]) {
    if (s < h.along[0] - 0.01 || s > h.along[1] + 0.01) continue;
    const y = top(s);
    for (const side of [-1, 1]) b.add([p.x + across[0] * side * (W / 2 - 0.2), y + 0.45, p.z + across[2] * side * (W / 2 - 0.2)], [0.2, 0.45, 0.2], [dx, 0, dz], [0, 1, 0], across, BRIDGE_COLORS.post);
  }
  // piers in the water: from the bed up to the girder
  if (h.channel) {
    const [c0, c1] = h.channel;
    const n = Math.max(0, Math.floor((c1 - c0) / o.pier.every));
    for (let i = 1; i <= n; i++) {
      const s = c0 + ((c1 - c0) * i) / (n + 1);
      if (s < h.along[0] || s > h.along[1]) continue;
      const q = at((s - h.along[0]) / (h.along[1] - h.along[0] || 1)), yTop = top(s) - o.girder - 0.04;
      b.add([q.x, (yTop + bed) / 2, q.z], [o.pier.width / 2, (yTop - bed) / 2, W / 2 - 0.2], [dx, 0, dz], [0, 1, 0], across, BRIDGE_COLORS.pier);
    }
  }
  return b;
}
