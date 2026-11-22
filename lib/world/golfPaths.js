// The mini-golf park's paths, drawn as the three logos (docs/world/minigolf.md, "The logo paths"): the first nine's boardwalks are the Synaptix brain (an outline with a fissure where the way in arrives, circuit
// traces between the holes meeting at a glowing orb, a node at every tee), the gateway between the car park and the brain is the Voxel Venture double V with its gold cube, and the second nine's are the
// Theoretical Minds half brain, a straight spine and right-angled traces to nodes. Everything is painted ground (the chunk's `surface` quads, the circuit's palette), so a phone pays for triangles and nothing else.
// Pure: every function takes the generator's `kit` (from `pathKit`) and the course's own numbers, and puts quads down. Colours are palette names (lib/world/track.js).

const r2 = (n) => Math.round(n * 100) / 100;
const STEP = 12; // the longest quad: the bake files a quad in the chunk of its middle, so a long one would vanish with its chunk

/** The painter: quads into `surface` by palette name, and the list of every centreline point laid (for keeping palms and bushes off the paths). */
export function pathKit(surface, PAL) {
  const pts = [];
  const poly = (pal, p) => { // up to four points; wound as the park's rects are (a quad of the wrong winding is turned over)
    const q = [0, 1, 2, 3].map((i) => p[Math.min(i, p.length - 1)]);
    const cross = (q[1][0] - q[0][0]) * (q[2][1] - q[1][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[1][0]);
    if (cross < 0) q.reverse();
    surface.push([PAL[pal], ...q.flatMap(([x, z]) => [r2(x), r2(z)])]);
  };
  const seg = (pal, x0, z0, x1, z1, w, e = 0) => { // a band of width w along a segment, each end pushed out by e so that joints close
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, nx = (-uz * w) / 2, nz = (ux * w) / 2;
    const ax = x0 - ux * e, az = z0 - uz * e, bx = x1 + ux * e, bz = z1 + uz * e;
    poly(pal, [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]]);
  };
  const disc = (pal, x, z, r, n = 8) => { for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2; poly(pal, [[x, z], [x + Math.cos(a0) * r, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, z + Math.sin(a1) * r]]); } };
  /** A boardwalk along a polyline: its dark edge, the boards, and a thin lit line down the middle whose colour runs along `cols` (palette names, spread over x0..x1). */
  const walk = (line, { w = 3.2, cols = ['inlay-cyan'], x0 = 0, x1 = 1, edge = false } = {}) => {
    const out = [line[0]];
    for (let i = 1; i < line.length; i++) { // cut long segments
      const [ax, az] = line[i - 1], [bx, bz] = line[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP));
      for (let j = 1; j <= n; j++) out.push([ax + ((bx - ax) * j) / n, az + ((bz - az) * j) / n]);
    }
    for (let i = 1; i < out.length; i++) {
      const [ax, az] = out[i - 1], [bx, bz] = out[i], e = w * 0.3;
      if (edge) seg('plank', ax, az, bx, bz, w + 0.8, e);
      seg('path', ax, az, bx, bz, w, e);
      const t = Math.min(0.999, Math.max(0, ((ax + bx) / 2 - x0) / (x1 - x0 || 1)));
      seg(cols[Math.floor(t * cols.length)], ax, az, bx, bz, 0.8, e);
    }
    for (const p of out) pts.push(p);
  };
  /** A node: a dark halo and a coloured core (`col` is one of the four node colours). */
  const node = (x, z, col, r = 2) => { disc('node-halo', x, z, r + 1.2, 6); disc(`node-${col}`, x, z, r, 6); pts.push([x, z]); };
  const near = (x, z, d) => pts.some((p) => Math.hypot(p[0] - x, p[1] - z) < d);
  return { poly, seg, disc, walk, node, near, pts };
}

/** A Catmull-Rom curve through control points, as a polyline every `step` units. */
export function curve(ctrl, closed = false, step = 3) {
  const n = ctrl.length, P = (i) => ctrl[(i + n) % n], out = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = closed ? P(i - 1) : ctrl[Math.max(i - 1, 0)], b = P(i), c = P(i + 1), e = closed ? P(i + 2) : ctrl[Math.min(i + 2, n - 1)];
    const p1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6], p2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6], m = Math.max(2, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / step));
    for (let j = 0; j < m; j++) { const t = j / m, u = 1 - t; out.push([u * u * u * b[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * c[0], u * u * u * b[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * c[1]]); }
  }
  if (!closed) out.push(ctrl[n - 1]);
  return out;
}

/** A branch that peels off a bus with a rounded corner (a quarter curve of radius rr) and runs straight to `edge`. */
export function branch(tx, from, edge, rr = 6) {
  const dir = edge > from ? 1 : -1, out = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6, u = 1 - t, x = u * u * (tx - rr) + 2 * u * t * tx + t * t * tx, z = u * u * from + 2 * u * t * from + t * t * (from + dir * rr); out.push([x, z]); }
  out.push([tx, edge]);
  return out;
}

const NODE_COLS = ['cyan', 'blue', 'violet', 'pink'];
const col = (n) => NODE_COLS[n % 4];
const rowOf = (h) => Math.ceil(h.n / 3) - 1, colOf = (h) => (h.n - 1) % 3;
/** The gaps between the rows and columns of a course's nine holes (3 x 3): { a, b } the z of the two row gaps, { ca, cb } the x of the two column gaps. */
function gaps(holes) {
  const rows = [0, 1, 2].map((r) => holes.filter((h) => rowOf(h) === r)), cols = [0, 1, 2].map((c) => holes.filter((h) => colOf(h) === c));
  const maxZ = (hs) => Math.max(...hs.map((h) => h.bounds.z1)), minZ = (hs) => Math.min(...hs.map((h) => h.bounds.z0)), maxX = (hs) => Math.max(...hs.map((h) => h.bounds.x1)), minX = (hs) => Math.min(...hs.map((h) => h.bounds.x0));
  return { a: (maxZ(rows[0]) + minZ(rows[1])) / 2, b: (maxZ(rows[1]) + minZ(rows[2])) / 2, ca: (maxX(cols[0]) + minX(cols[1])) / 2, cb: (maxX(cols[1]) + minX(cols[2])) / 2 };
}

/**
 * The first nine: the Synaptix brain. The outline is a rounded box with lobes, a fissure at the top (where the way in comes down) and a stem at the bottom right; inside, two buses and two spines of circuit
 * between the rows and columns of holes, a branch from a bus to every hole with a node at the hole's edge by its tee, and the orb where the first two buses cross the middle. Returns { outline, notch, east(z) }.
 */
export function synaptix(kit, course, ring) {
  const cx = (ring.x0 + ring.x1) / 2, rx = (ring.x1 - ring.x0) / 2, rz = 53, cz = ring.z0 + rz, outline = [];
  for (let i = 0; i < 120; i++) {
    const th = (i / 120) * Math.PI * 2 - Math.PI / 2, c = Math.cos(th), s = Math.sin(th), k = Math.pow(Math.pow(Math.abs(c), 3) + Math.pow(Math.abs(s), 3), -1 / 3);
    const r = 1 + 0.05 * Math.cos(th * 9 + 0.6) + 0.018 * Math.cos(th * 17 + 1.1);
    const x = cx + c * k * rx * r;
    let z = cz + s * k * rz * r;
    if (s < -0.88) z += 9 * Math.exp(-Math.pow((x - cx) / 6.5, 2)); // the fissure
    if (s > 0.75 && c > 0.15) z += 5 * Math.exp(-Math.pow((x - (cx + 52)) / 14, 2)); // the stem
    outline.push([r2(x), r2(z)]);
  }
  kit.walk([...outline, outline[0]], { w: 3.4, edge: true, cols: ['inlay-cyan', 'inlay-blue', 'inlay-violet'], x0: ring.x0, x1: ring.x1 });
  const { a, b, ca, cb } = gaps(course.holes), x0 = ring.x0 + 4, x1 = ring.x1 - 2, spine = { z0: a - 20, z1: b + 26 }, lit = { cols: ['inlay-cyan', 'inlay-blue', 'inlay-violet'], x0: ring.x0, x1: ring.x1 };
  const wob = (z) => { const pts = []; for (let x = x0; x <= x1 + 0.1; x += 22) pts.push([x, z + Math.sin(x * 0.09) * 1.1]); return curve(pts, false, 6); }; // a bus is not ruled: it wanders a little
  kit.walk(wob(a), lit); kit.walk(wob(b), lit);
  kit.walk([[ca, spine.z0], [ca, spine.z1]], lit); kit.walk([[cb, spine.z0], [cb, spine.z1]], lit);
  for (const h of course.holes) { // a branch and a node for every hole
    const from = rowOf(h) === 2 ? b : a, edge = h.tee.z < from ? h.bounds.z1 : h.bounds.z0, tx = h.tee.x + 1.6;
    kit.walk(branch(tx, from, edge), { cols: ['inlay-pink', 'inlay-violet'], x0: ring.x0, x1: ring.x1, edge: false });
    kit.node(r2(tx), r2(edge), col(h.n), 1.7);
  }
  const orb = { x: r2((ca + cb) / 2), z: r2(a) };
  kit.disc('node-halo', orb.x, orb.z, 6.6, 12); kit.disc('orb', orb.x, orb.z, 5, 12);
  [[ca, spine.z0, 1], [cb, spine.z0, 3], [ca, spine.z1, 0], [cb, spine.z1, 2], [x0, a, 3], [x1, a, 0], [x0, b, 2], [x1, b, 1]].forEach(([x, z, c]) => kit.node(x, r2(z), col(c), 2.2));
  const top = outline.filter(([x, z]) => z < cz && Math.abs(x - cx) < 4).sort((p, q) => q[1] - p[1])[0] ?? [cx, ring.z0 + 9]; // the fissure's floor: the lowest of the top points at the middle
  const edge = (z, east) => { let best = null; for (const p of outline) if ((east ? p[0] > cx : p[0] < cx) && (!best || Math.abs(p[1] - z) < Math.abs(best[1] - z))) best = p; return best; };
  return { outline, notch: { x: cx, z: top[1] }, edge, orb };
}

/** The gateway: the Voxel Venture double V, laid as a plaza of navy ground between the car park and the brain, a gold cube at the middle. `gx, gz` is the top middle; the plaza is 46 wide and 24 deep. */
export function gateway(kit, gx, gz) {
  const W = 46, H = 24, t = 6.4, { poly } = kit;
  poly('logo-navy', [[gx - W / 2 - 3, gz - 1], [gx + W / 2 + 3, gz - 1], [gx + W / 2 + 3, gz + H + 2.5], [gx - W / 2 - 3, gz + H + 2.5]]);
  const stroke = (xa, xb, c1, c2) => { const xm = (xa + xb) / 2; poly(c1, [[xa, gz], [xa + t, gz], [xm + t / 2, gz + H], [xm - t / 2, gz + H]]); poly(c2, [[xb, gz], [xb - t, gz], [xm - t / 2, gz + H], [xm + t / 2, gz + H]]); };
  stroke(gx - W / 2, gx, 'v-sky', 'v-royal'); stroke(gx, gx + W / 2, 'v-lilac', 'v-indigo');
  cube(kit, gx, gz + 10.7, 5.6); // (the middle of the V, where the gold cube sits)
  return { z1: gz + H + 2.5 };
}
/** A gold cube seen from above: a light top and two darker sides. */
export function cube(kit, x, z, s) {
  const { poly } = kit;
  poly('gold-light', [[x, z - s * 0.55], [x + s, z - s * 0.2], [x, z + s * 0.15], [x - s, z - s * 0.2]]);
  poly('gold', [[x - s, z - s * 0.2], [x, z + s * 0.15], [x, z + s * 0.95], [x - s, z + s * 0.6]]);
  poly('gold-dark', [[x + s, z - s * 0.2], [x, z + s * 0.15], [x, z + s * 0.95], [x + s, z + s * 0.6]]);
}

/**
 * The second nine: Theoretical Minds. A curved half-brain boardwalk wraps the left column of holes (a node at each of their tees on its inside), a straight spine runs down the middle to the plaza, and two
 * right-angled traces branch east from it, with a branch and node for each hole in the other two columns and a node at each trace's end. `plazaZ` is where the spine ends.
 */
export function theoreticalMinds(kit, course, ring, link, plazaZ) {
  const { a, b } = gaps(course.holes), left = course.holes.filter((h) => colOf(h) === 0), mid = course.holes.filter((h) => colOf(h) === 1);
  const spineX = r2((Math.max(...left.map((h) => h.bounds.x1)) + Math.min(...mid.map((h) => h.bounds.x0))) / 2), o = (dx, dz) => [ring.x0 + dx, ring.z0 + dz];
  const half = [[spineX, ring.z0], o(30, -2.4), o(17, -0.5), o(7, 6), o(2, 15), o(4, 22), o(0, 31), o(5, 39), o(1, 48), o(4, 55), o(-1, 63), o(4, 71), o(3, 78), o(10, 84.5), o(20, 87.5), o(31, 87.2), [spineX, ring.z1 - 2.5]];
  const lit = { cols: ['inlay-cyan', 'inlay-blue', 'inlay-violet'], x0: ring.x0, x1: ring.x1 }, xe = ring.x1 - 9;
  kit.walk(curve(half, false, 3), { ...lit, w: 3.4, edge: true });
  kit.walk([[spineX, ring.z0], [spineX, plazaZ]], lit);
  kit.walk([[spineX, a], [xe, a]], lit); kit.walk([[spineX, b], [xe, b]], lit);
  for (const h of course.holes) {
    if (colOf(h) === 0) { kit.walk([[ring.x0 + 4, h.tee.z], [r2(h.tee.x - 0.5), h.tee.z]], lit); kit.node(r2(h.tee.x - 0.5), h.tee.z, col(h.n), 1.7); continue; }
    const from = rowOf(h) === 2 ? b : a, edge = h.tee.z < from ? h.bounds.z1 : h.bounds.z0, tx = h.tee.x + 1.6;
    kit.walk(branch(tx, from, edge), { ...lit, edge: false }); kit.node(r2(tx), r2(edge), col(h.n), 1.7);
  }
  [[xe, a, 0], [xe, b, 2], [spineX, ring.z0, 1], [spineX, plazaZ, 3], [ring.x0 - 1, link.z, 0], [ring.x0, ring.z0 + 31, 3]].forEach(([x, z, c]) => kit.node(r2(x), r2(z), col(c), 2.2));
  return { spineX, half };
}
