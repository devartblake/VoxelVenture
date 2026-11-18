// The mini-golf course (docs/world/minigolf.md): nine holes laid out in a grid on a flat site, made from a seed. A hole is a lane of felt (3 cells wide) that runs straight, bends, zigzags or doubles back,
// with a wall all round it and, on some, blocks in the way; a tee mat at one end and a cup with a flag at the other. Everything is worked out on a grid of CELL units, so a hole is a set of cells, its walls are the
// edges between the felt and the rest (merged into runs), and the ball's physics (lib/world/golfPhysics.js) bounces off the same edges. Pure (no three.js): the baked world gets the painted quads and the wall
// boxes (lib/world/bake.js), the Kenney Minigolf Kit can dress them with models later (the same layout), and the game plays the holes from `holes[].segments`.
import { PALETTE } from './track';

export const COURSE = {
  cell: 0.8, // the grid, in game units
  lane: 3, // cells across a lane of felt (2.4 units)
  wall: { height: 0.5, thick: 0.3 },
  ball: 0.22, // the ball's radius
  cup: 0.42, // the cup's radius
  grid: [3, 3], // holes across and down
  pitch: [46, 28], // from one hole's start to the next's, across and down (a hole fits in 42 x 24)
  margin: 6, // the course's border all round
  colors: { wall: [150, 98, 58], rail: [190, 140, 92], flag: [216, 48, 44], pole: [240, 240, 240] },
};

const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const r2 = (n) => Math.round(n * 100) / 100;
const pick = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

// the nine holes' kinds, in order: easy first, the harder ones after
export const KINDS = ['straight', 'dogleg', 'blocks', 'zigzag', 'uturn', 'dogleg', 'blocks', 'zigzag', 'straight'];

/** The legs of a hole in cells: [{ dx, dz, n }] from the start going +x, and the blocks to leave out: [{ i, j }] (2 x 2 cells, in the hole's own cells). */
function legsOf(kind, rnd) {
  const turn = rnd() < 0.5 ? 1 : -1;
  if (kind === 'straight') return { legs: [{ dx: 1, dz: 0, n: pick(rnd, 26, 34) }], blocks: [] };
  if (kind === 'blocks') {
    const n = pick(rnd, 28, 34);
    return { legs: [{ dx: 1, dz: 0, n }], blocks: [{ at: 0.35, side: -1 }, { at: 0.62, side: 1 }] };
  }
  if (kind === 'dogleg') return { legs: [{ dx: 1, dz: 0, n: pick(rnd, 18, 24) }, { dx: 0, dz: turn, n: pick(rnd, 9, 14) }], blocks: [] };
  if (kind === 'zigzag') return { legs: [{ dx: 1, dz: 0, n: pick(rnd, 12, 16) }, { dx: 0, dz: turn, n: pick(rnd, 7, 9) }, { dx: 1, dz: 0, n: pick(rnd, 12, 16) }], blocks: [] };
  return { legs: [{ dx: 1, dz: 0, n: pick(rnd, 22, 28) }, { dx: 0, dz: turn, n: 7 }, { dx: -1, dz: 0, n: pick(rnd, 18, 24) }], blocks: [] }; // uturn: back along a wall of its own
}

/** One hole from its kind and a random stream: { cells: Set of 'i,j', tee, cup (cell centres), par, w, h (cells), kind }, in the hole's own cells (0,0 at its top-left). */
export function makeHole(kind, rnd) {
  const { legs, blocks } = legsOf(kind, rnd);
  const cells = new Set(), half = (COURSE.lane - 1) / 2;
  let ci = 0, cj = 0, ldx = 1, ldz = 0;
  const first = { ci, cj };
  const centres = [];
  for (const leg of legs) {
    for (let k = 0; k <= leg.n; k++) {
      const x = ci + leg.dx * k, z = cj + leg.dz * k;
      centres.push({ x, z });
      for (let a = -half; a <= half; a++) for (let b = -half; b <= half; b++) cells.add(`${x + a},${z + b}`);
    }
    ci += leg.dx * leg.n; cj += leg.dz * leg.n; ldx = leg.dx; ldz = leg.dz;
  }
  // blocks (a 2 x 2 wall in the lane, alternate sides, leaving a gap of one cell): left out of the felt, so the walls round them are made with the rest
  if (blocks.length) {
    const n = legs[0].n;
    for (const b of blocks) {
      const x = Math.round(n * b.at), z = b.side < 0 ? -half : half - 1;
      for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) cells.delete(`${x + a},${z + c}`);
    }
  }
  const turns = legs.length - 1;
  const par = kind === 'straight' ? 2 : kind === 'blocks' ? 3 : Math.min(4, 2 + turns);
  // shift so the smallest cell is (0, 0)
  let mi = Infinity, mj = Infinity, ma = -Infinity, mb = -Infinity;
  for (const c of cells) { const [i, j] = c.split(',').map(Number); mi = Math.min(mi, i); mj = Math.min(mj, j); ma = Math.max(ma, i); mb = Math.max(mb, j); }
  const shifted = new Set([...cells].map((c) => { const [i, j] = c.split(',').map(Number); return `${i - mi},${j - mj}`; }));
  const at = (p) => ({ i: p.x - mi, j: p.z - mj });
  const tee = at({ x: first.ci + 2, z: first.cj }), end = at({ x: ci - ldx * 2, z: cj - ldz * 2 });
  return { kind, cells: shifted, tee, cup: end, par, w: ma - mi + 1, h: mb - mj + 1, centres: centres.map(at) };
}

/** The boundary edges of a set of cells, merged into runs: [{ axis: 'x' | 'z', at (the edge's coordinate in cells), from, to (cells along it), out (+1 or -1: which side the outside is) }]. */
export function boundaryRuns(cells) {
  const has = (i, j) => cells.has(`${i},${j}`);
  const edges = { x: new Map(), z: new Map() }; // x: a horizontal edge (along x) at row line j; z: a vertical edge at column line i
  const add = (axis, line, pos, out) => { const key = `${line}|${out}`; if (!edges[axis].has(key)) edges[axis].set(key, []); edges[axis].get(key).push(pos); };
  for (const c of cells) {
    const [i, j] = c.split(',').map(Number);
    if (!has(i, j - 1)) add('x', j, i, -1);
    if (!has(i, j + 1)) add('x', j + 1, i, 1);
    if (!has(i - 1, j)) add('z', i, j, -1);
    if (!has(i + 1, j)) add('z', i + 1, j, 1);
  }
  const runs = [];
  for (const axis of ['x', 'z']) for (const [key, list] of edges[axis]) {
    const [line, out] = key.split('|').map(Number);
    list.sort((a, b) => a - b);
    let from = list[0], prev = list[0];
    for (let k = 1; k <= list.length; k++) {
      if (k === list.length || list[k] !== prev + 1) { runs.push({ axis, at: line, from, to: prev + 1, out }); from = list[k]; }
      prev = list[k];
    }
  }
  return runs;
}

/**
 * The course: { id, name, seed, origin, bounds, holes: [{ n, kind, par, tee: {x, z}, cup: {x, z}, bounds, segments (the walls' inner faces: [{ a, b, nx, nz }]) }], surface (painted quads, chunk.surface format),
 * boxes (the walls and the flags: chunk.structures format), cups: [{ x, z, r }] }. `origin` = the course's top-left corner in the world (x, z).
 */
export function generateCourse({ seed = 1, origin = { x: 0, z: 0 }, id = 'course', name = 'Mini-golf' } = {}) {
  const rnd = mulberry(seed);
  const C = COURSE, P = Object.fromEntries(PALETTE.map((p, i) => [p.name, i]));
  const holes = [], surface = [], boxes = [];
  const [cols, rows] = C.grid;
  const ox = origin.x + C.margin, oz = origin.z + C.margin;
  KINDS.slice(0, cols * rows).forEach((kind, n) => {
    const hole = makeHole(kind, rnd);
    const col = n % cols, row = Math.floor(n / cols);
    // centred in its cell of the grid
    const wx = hole.w * C.cell, wz = hole.h * C.cell;
    const x0 = ox + col * C.pitch[0] + (C.pitch[0] - 4 - wx) / 2, z0 = oz + row * C.pitch[1] + (C.pitch[1] - 4 - wz) / 2;
    const X = (i) => r2(x0 + i * C.cell), Z = (j) => r2(z0 + j * C.cell);
    // felt: rows of cells merged into runs, in stripes of four cells (a mown look)
    for (let j = 0; j < hole.h; j++) {
      let i = 0;
      while (i < hole.w) {
        if (!hole.cells.has(`${i},${j}`)) { i++; continue; }
        const stripe = Math.floor(i / 4);
        let k = i;
        while (k + 1 < hole.w && hole.cells.has(`${k + 1},${j}`) && Math.floor((k + 1) / 4) === stripe) k++;
        surface.push([stripe % 2 ? P['felt-light'] : P.felt, X(i), Z(j), X(k + 1), Z(j), X(k + 1), Z(j + 1), X(i), Z(j + 1)]); // (the corners in the order chunkMesh's trackSurface turns up)
        i = k + 1;
      }
    }
    // the tee mat (the first cells of the lane) and the cup
    const tee = { x: r2(x0 + (hole.tee.i + 0.5) * C.cell), z: r2(z0 + (hole.tee.j + 0.5) * C.cell) }, cup = { x: r2(x0 + (hole.cup.i + 0.5) * C.cell), z: r2(z0 + (hole.cup.j + 0.5) * C.cell) };
    const mh = C.cell * 1.2;
    surface.push([P.mat, r2(tee.x - mh), r2(tee.z - mh), r2(tee.x + mh), r2(tee.z - mh), r2(tee.x + mh), r2(tee.z + mh), r2(tee.x - mh), r2(tee.z + mh)]);
    surface.push([P.black, r2(cup.x - C.cup), r2(cup.z - C.cup), r2(cup.x + C.cup), r2(cup.z - C.cup), r2(cup.x + C.cup), r2(cup.z + C.cup), r2(cup.x - C.cup), r2(cup.z + C.cup)]);
    // the walls: a box along each run, standing outside the felt (its inner face on the edge), a little longer than the run at both ends so the corners are closed
    const segments = [];
    const T = C.wall.thick, H = C.wall.height;
    for (const run of boundaryRuns(hole.cells)) {
      const a = run.from * C.cell - T / 2, b = run.to * C.cell + T / 2, line = run.at * C.cell + run.out * T / 2;
      if (run.axis === 'x') {
        boxes.push([r2(x0 + (a + b) / 2), r2(H / 2), r2(z0 + line), r2((b - a) / 2), r2(H / 2), r2(T / 2), 0, ...C.colors.wall]);
        segments.push({ a: { x: r2(x0 + run.from * C.cell), z: r2(z0 + run.at * C.cell) }, b: { x: r2(x0 + run.to * C.cell), z: r2(z0 + run.at * C.cell) }, nx: 0, nz: -run.out });
      } else {
        boxes.push([r2(x0 + line), r2(H / 2), r2(z0 + (a + b) / 2), r2(T / 2), r2(H / 2), r2((b - a) / 2), 0, ...C.colors.wall]);
        segments.push({ a: { x: r2(x0 + run.at * C.cell), z: r2(z0 + run.from * C.cell) }, b: { x: r2(x0 + run.at * C.cell), z: r2(z0 + run.to * C.cell) }, nx: -run.out, nz: 0 });
      }
    }
    // the flag: a pole and a pennant beside the cup
    boxes.push([r2(cup.x), r2(0.9), r2(cup.z - 0.15), 0.03, 0.9, 0.03, 0, ...C.colors.pole]);
    boxes.push([r2(cup.x + 0.28), r2(1.55), r2(cup.z - 0.15), 0.28, 0.17, 0.02, 0, ...C.colors.flag]);
    holes.push({ n: n + 1, kind, par: hole.par, tee, cup, bounds: { x0: r2(x0), z0: r2(z0), x1: r2(x0 + wx), z1: r2(z0 + wz) }, segments });
  });
  const bounds = { x0: origin.x, z0: origin.z, x1: r2(origin.x + C.margin * 2 + cols * C.pitch[0]), z1: r2(origin.z + C.margin * 2 + rows * C.pitch[1]) };
  return { id, name, seed, origin, bounds, holes, surface, boxes, cups: holes.map((h) => ({ x: h.cup.x, z: h.cup.z, r: C.cup })), par: holes.reduce((s, h) => s + h.par, 0) };
}

/** Builds the world's courses from the recipe (`recipe.courses`: [{ id, name, landmass, site: { x, z } (the middle), seed }]), checking each sits on flat land clear of the coast, the highways, the towns and the waters. */
export function buildCourses(world, specs = world.recipe.courses ?? [], { pointInPolygon, distToSegment, elevationAt }) {
  return specs.map((spec) => {
    const m = world.landmasses.find((l) => l.id === spec.landmass);
    if (!m) throw new Error(`course ${spec.id} is on a landmass (${spec.landmass}) that is not in the recipe`);
    const w = COURSE.margin * 2 + COURSE.grid[0] * COURSE.pitch[0], d = COURSE.margin * 2 + COURSE.grid[1] * COURSE.pitch[1];
    const course = generateCourse({ seed: spec.seed, origin: { x: spec.site.x - w / 2, z: spec.site.z - d / 2 }, id: spec.id, name: spec.name });
    const b = course.bounds, coast = m.outline.points, problems = [];
    const roads = [];
    for (const h of world.highways ?? []) {
      for (let i = 0; i < h.ring.length; i++) roads.push([h.ring[i], h.ring[(i + 1) % h.ring.length]]);
      for (const s of h.spurs) { const way = s.via ? [s.from, s.via, s.to] : [s.from, s.to]; for (let k = 0; k + 1 < way.length; k++) roads.push([way[k], way[k + 1]]); }
    }
    const ranges = m.features.ranges ?? [];
    for (let x = b.x0; x <= b.x1; x += 16) for (let z = b.z0; z <= b.z1; z += 16) {
      if (!pointInPolygon(x, z, coast)) { problems.push(`(${Math.round(x)}, ${Math.round(z)}) is not on land`); continue; }
      let dc = Infinity;
      for (let i = 0; i < coast.length; i++) dc = Math.min(dc, distToSegment({ x, z }, coast[i], coast[(i + 1) % coast.length]));
      if (dc < 40) problems.push(`(${Math.round(x)}, ${Math.round(z)}) is ${Math.round(dc)} from the coast`);
      if (elevationAt(ranges, x, z, m.spec.coast.seed) > 0.05) problems.push(`(${Math.round(x)}, ${Math.round(z)}) is not flat`);
      for (const [u, v] of roads) { const r = distToSegment({ x, z }, u, v); if (r < 14) { problems.push(`a highway is ${Math.round(r)} from (${Math.round(x)}, ${Math.round(z)})`); break; } }
      for (const rv of world.rivers ?? []) { let rr = Infinity; for (const p of rv.course) rr = Math.min(rr, Math.hypot(p.x - x, p.z - z)); if (rr < 40) { problems.push(`${rv.name} is ${Math.round(rr)} from (${Math.round(x)}, ${Math.round(z)})`); break; } }
    }
    for (const t of world.towns.filter((t) => t.landmass === m.id)) if (b.x1 > t.land.x0 - 40 && b.x0 < t.land.x1 + 40 && b.z1 > t.land.z0 - 40 && b.z0 < t.land.z1 + 40) problems.push(`it touches ${t.name}'s land`);
    if (problems.length) throw new Error(`the course ${spec.id} does not fit where the recipe puts it: ${problems.slice(0, 4).join('; ')}`);
    return { landmass: m.id, ...course };
  });
}
