// The mini-golf course (docs/world/minigolf.md): nine holes laid out in a grid on a flat site, made of the Kenney Minigolf Kit's own tiles. A hole is a path of square TILES (3 units across, the kit's 1-unit tile
// scaled by 3: a lane 2.4 wide between walls 0.3 thick): a tee end, straights, corners, a rounded end with the cup, and on some holes a bar in the lane (obstacle-block), a windmill or a castle gate that the ball has
// to find the arch of. The same tiles give the ball's walls (`segments`: the inner faces, in the kit's own measurements) so what is drawn is what the ball bounces off, and plain boxes as a fallback where the
// models cannot load (a box has the `replaced` tag 2: the game hides it once the models are there). Pure (no three.js): the baked world gets the tiles as props and the boxes as structures (lib/world/bake.js),
// the game plays the holes from `holes[].segments` (lib/world/golfPhysics.js).

export const COURSE = {
  tile: 3, // the kit's 1-unit tile, scaled
  lane: 2.4, // between the walls (0.8 of the tile)
  wall: 0.3, // a wall's thickness (0.1 of the tile)
  felt: 0.19, // the felt's height over the ground (0.063 of the tile's 1 unit, scaled)
  top: 0.44, // the wall's top (0.147 scaled)
  ball: 0.22, // the ball's radius
  cup: 0.3, // the cup's radius (the kit's hole is about 0.25)
  grid: [3, 3], // holes across and down
  pitch: [54, 30], // from one hole's start to the next's, across and down (a hole fits in 48 x 24: 16 x 8 tiles)
  margin: 6, // the course's border all round
  scale: 3, // a tile model's scale
  colors: { wall: [217, 132, 94], felt: [92, 190, 138], mat: [198, 62, 52], flag: [216, 48, 44], pole: [240, 240, 240] },
};

import { generateLoopGrounds, generatePark } from './golfPark';

/** The kit's models the course uses (public/models/kenney/minigolf), by the name a baked prop gets (`golf-<file>`). */
export const GOLF_MODELS = ['straight', 'corner', 'end', 'hole-round', 'obstacle-block', 'structure-windmill', 'castle', 'flag-red'];

const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const r2 = (n) => Math.round(n * 100) / 100;
const pick = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

// the nine holes' kinds, in order: easy first, a water-less course's centrepiece (the windmill) at hole 4, the castle to finish
export const KINDS = ['straight', 'dogleg', 'block', 'windmill', 'uturn', 'zigzag', 'block', 'dogleg', 'castle'];

// the second nine, "The Adventure Loop" (docs/world/minigolf.md): the same kit and physics, a tighter layout (holes 36 apart across and 22 down, so nine of them fit on the flat land east of the park) and harder holes:
// more turns and more things in the way (par 31 to the first nine's 28)
export const LOOP = { kinds: ['zigzag', 'dogleg', 'windmill', 'uturn', 'castle', 'zigzag', 'block', 'uturn', 'windmill'], grid: [3, 3], pitch: [36, 22], margin: 6 };

// directions on the ground (x, z): north is -z. A tile's connections are the sides its lane opens on.
const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
const TURN = { N: 'W', W: 'S', S: 'E', E: 'N' }; // a quarter turn of a tile (yaw + 90 degrees) takes each side to this one
const rotDir = (d, r) => { let x = d; for (let i = 0; i < r; i++) x = TURN[x]; return x; };

// the kit's tiles as they come (lane along z, unit tile centred on the origin, z south): their connections, and the walls' inner faces { a: [u, v], b: [u, v], n: [nu, nv] } in tile units
const arc = (r, from, to, n) => Array.from({ length: n }, (_, i) => { const t0 = from + ((to - from) * i) / n, t1 = from + ((to - from) * (i + 1)) / n; return { a: [Math.cos(t0) * r, Math.sin(t0) * r], b: [Math.cos(t1) * r, Math.sin(t1) * r], n: [-Math.cos((t0 + t1) / 2), -Math.sin((t0 + t1) / 2)] }; });
const WALL = { straight: [{ a: [-0.4, -0.5], b: [-0.4, 0.5], n: [1, 0] }, { a: [0.4, -0.5], b: [0.4, 0.5], n: [-1, 0] }] };
const BASE = {
  straight: { conn: ['N', 'S'], walls: WALL.straight },
  corner: { conn: ['N', 'W'], walls: [{ a: [0.4, -0.5], b: [0.4, 0.4], n: [-1, 0] }, { a: [-0.5, 0.4], b: [0.4, 0.4], n: [0, -1] }] }, // opens north and west
  end: { conn: ['N'], walls: [{ a: [-0.4, -0.5], b: [-0.4, 0.4], n: [1, 0] }, { a: [0.4, -0.5], b: [0.4, 0.4], n: [-1, 0] }, { a: [-0.4, 0.4], b: [0.4, 0.4], n: [0, -1] }] }, // closed behind the tee
  'hole-round': { conn: ['N'], walls: [{ a: [-0.4, -0.5], b: [-0.4, 0], n: [1, 0] }, { a: [0.4, -0.5], b: [0.4, 0], n: [-1, 0] }, ...arc(0.4, 0, Math.PI, 10)] }, // the U with the cup in its middle
};
const BAR = [{ a: [-0.06, -0.2], b: [0.06, -0.2], n: [0, -1] }, { a: [-0.06, 0.15], b: [0.06, 0.15], n: [0, 1] }, { a: [-0.06, -0.2], b: [-0.06, 0.15], n: [-1, 0] }, { a: [0.06, -0.2], b: [0.06, 0.15], n: [1, 0] }]; // obstacle-block's bar
const gate = (half, front, back) => [ // a body across the lane with an arch of `half` either side of the middle (the windmill's and the castle's)
  { a: [-0.4, front], b: [-half, front], n: [0, -1] }, { a: [-0.4, back], b: [-half, back], n: [0, 1] }, { a: [-half, front], b: [-half, back], n: [1, 0] },
  { a: [half, front], b: [0.4, front], n: [0, -1] }, { a: [half, back], b: [0.4, back], n: [0, 1] }, { a: [half, front], b: [half, back], n: [-1, 0] },
];
const EXTRA = { 'obstacle-block': { walls: BAR }, 'structure-windmill': { walls: gate(0.17, -3 / 10, 0.35) }, castle: { walls: gate(0.2, -0.4, 0.4) } };

/** One hole from its kind and a random stream: the path of tiles in tile coordinates: { kind, tiles: [{ ti, tj, m (the model), r (quarter turns), extra (a structure over the lane, or null) }], par, w, h (tiles) }. */
export function makeHole(kind, rnd) {
  // legs: [direction, moves]; a corner tile where a leg turns
  const turn = rnd() < 0.5 ? 'S' : 'N';
  const legs = {
    straight: [['E', pick(rnd, 7, 9)]],
    block: [['E', pick(rnd, 8, 10)]],
    windmill: [['E', pick(rnd, 8, 10)]],
    castle: [['E', pick(rnd, 8, 10)]],
    dogleg: [['E', pick(rnd, 5, 7)], [turn, pick(rnd, 3, 4)]],
    zigzag: [['E', pick(rnd, 3, 4)], [turn, pick(rnd, 2, 3)], ['E', pick(rnd, 3, 4)]],
    uturn: [['E', pick(rnd, 6, 8)], [turn, 2], ['W', pick(rnd, 5, 7)]],
  }[kind];
  const path = [{ ti: 0, tj: 0 }], dirs = [];
  let ti = 0, tj = 0;
  for (const [d, n] of legs) for (let k = 0; k < n; k++) { ti += DIRS[d][0]; tj += DIRS[d][1]; path.push({ ti, tj }); dirs.push(d); }
  const last = path.length - 1;
  // which tile gets the bar, the windmill or the castle: in the middle of the first long straight
  const mid = kind === 'block' ? [Math.floor(last / 3), Math.floor((2 * last) / 3)] : kind === 'windmill' || kind === 'castle' ? [Math.floor(last / 2)] : [];
  const tiles = path.map((p, i) => {
    if (i === 0) return { ...p, base: 'end', m: 'end', conn: [dirs[0]], extra: null };
    if (i === last) return { ...p, base: 'hole-round', m: 'hole-round', conn: [OPP[dirs[last - 1]]], extra: null };
    const back = OPP[dirs[i - 1]], fwd = dirs[i];
    const straight = back === OPP[fwd];
    const extra = mid.includes(i) && straight ? (kind === 'block' ? 'obstacle-block' : kind === 'windmill' ? 'structure-windmill' : 'castle') : null;
    return { ...p, base: straight ? 'straight' : 'corner', m: extra === 'obstacle-block' ? 'obstacle-block' : straight ? 'straight' : 'corner', conn: [back, fwd], extra };
  });
  // each tile's quarter turns: the turn that takes the kit's connections to the path's
  for (const t of tiles) {
    const need = [...t.conn].sort().join();
    t.r = [0, 1, 2, 3].find((r) => BASE[t.base].conn.map((c) => rotDir(c, r)).sort().join() === need);
    if (t.r === undefined) throw new Error(`no turn of the ${t.base} tile opens ${need}`);
  }
  const par = kind === 'straight' ? 2 : kind === 'dogleg' || kind === 'block' || kind === 'windmill' || kind === 'castle' ? 3 : 4;
  const w = Math.max(...path.map((p) => p.ti)) - Math.min(...path.map((p) => p.ti)) + 1, h = Math.max(...path.map((p) => p.tj)) - Math.min(...path.map((p) => p.tj)) + 1;
  return { kind, tiles, par, w, h };
}

// a tile-local point (u, v) turned by r quarter turns (three.js's yaw: x' = u cos + v sin, z' = -u sin + v cos)
const turnBy = ([u, v], r) => { const c = [1, 0, -1, 0][r], s = [0, 1, 0, -1][r]; return [u * c + v * s, -u * s + v * c]; };

/**
 * The course: { id, name, seed, origin, bounds, holes: [{ n, kind, par, tee: {x, z}, cup: {x, z}, bounds, segments (the walls' inner faces: [{ a, b, nx, nz }]) }], tiles (the models to place: [{ m, x, z, yaw, s }]),
 * boxes (the fallback boxes and the tee mats: chunk.structures format, the model-covered ones tagged 2), surface ([]: the felt is the tiles), cups }. `origin` = the course's top-left corner in the world (x, z).
 */
export function generateCourse({ seed = 1, origin = { x: 0, z: 0 }, id = 'course', name = 'Mini-golf', layout = null } = {}) {
  const rnd = mulberry(seed);
  const L = layout ?? { kinds: KINDS, grid: COURSE.grid, pitch: COURSE.pitch, margin: COURSE.margin }; // (the first nine's layout, or LOOP's)
  const C = { ...COURSE, grid: L.grid, pitch: L.pitch, margin: L.margin }, T = C.tile;
  const holes = [], tiles = [], boxes = [];
  const [cols, rows] = C.grid;
  const ox = origin.x + C.margin, oz = origin.z + C.margin;
  L.kinds.slice(0, cols * rows).forEach((kind, n) => {
    const hole = makeHole(kind, rnd);
    const col = n % cols, row = Math.floor(n / cols);
    const minI = Math.min(...hole.tiles.map((t) => t.ti)), minJ = Math.min(...hole.tiles.map((t) => t.tj));
    // centred in its cell of the grid
    const x0 = ox + col * C.pitch[0] + (C.pitch[0] - 6 - hole.w * T) / 2, z0 = oz + row * C.pitch[1] + (C.pitch[1] - 6 - hole.h * T) / 2;
    const segments = [], cx = (t) => x0 + (t.ti - minI + 0.5) * T, cz = (t) => z0 + (t.tj - minJ + 0.5) * T;
    const seg = (t, w) => {
      const a = turnBy(w.a, t.r), b = turnBy(w.b, t.r), nn = turnBy(w.n, t.r);
      return { a: { x: r2(cx(t) + a[0] * T), z: r2(cz(t) + a[1] * T) }, b: { x: r2(cx(t) + b[0] * T), z: r2(cz(t) + b[1] * T) }, nx: Math.round(nn[0] * 1e4) / 1e4, nz: Math.round(nn[1] * 1e4) / 1e4 };
    };
    for (const t of hole.tiles) {
      tiles.push({ m: t.m, x: r2(cx(t)), z: r2(cz(t)), yaw: (t.r * Math.PI) / 2, s: C.scale });
      if (t.extra && t.extra !== 'obstacle-block') tiles.push({ m: t.extra, x: r2(cx(t)), z: r2(cz(t)), yaw: (t.r * Math.PI) / 2, s: C.scale });
      for (const w of BASE[t.base].walls) segments.push(seg(t, w));
      if (t.extra) for (const w of EXTRA[t.extra].walls) segments.push(seg(t, w));
      // the fallback: the felt as a flat box, replaced by the model
      boxes.push([r2(cx(t)), r2(C.felt / 2), r2(cz(t)), T / 2, r2(C.felt / 2), T / 2, 0, ...C.colors.felt, 2]);
    }
    // the fallback walls: a box along each face, standing behind it
    for (const s of segments) {
      const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, len = Math.hypot(dx, dz), yaw = Math.atan2(dz, dx);
      boxes.push([r2((s.a.x + s.b.x) / 2 - s.nx * C.wall / 2), r2(C.top / 2), r2((s.a.z + s.b.z) / 2 - s.nz * C.wall / 2), r2(len / 2), r2(C.top / 2), r2(C.wall / 2), r2(yaw), ...C.colors.wall, 2]);
    }
    const first = hole.tiles[0], end = hole.tiles[hole.tiles.length - 1];
    const f = DIRS[first.conn[0]];
    const tee = { x: r2(cx(first) + f[0] * T * 0.1), z: r2(cz(first) + f[1] * T * 0.1) }, cup = { x: r2(cx(end)), z: r2(cz(end)) };
    boxes.push([tee.x, r2(C.felt + 0.01), tee.z, 0.9, 0.01, 0.9, 0, ...C.colors.mat]); // the tee mat (always drawn: the kit has no mat)
    tiles.push({ m: 'flag-red', x: cup.x, z: cup.z, yaw: 0, s: 1.4 });
    holes.push({ n: n + 1, kind, par: hole.par, aim: r2(Math.atan2(f[1], f[0])), tee, cup, bounds: { x0: r2(x0), z0: r2(z0), x1: r2(x0 + hole.w * T), z1: r2(z0 + hole.h * T) }, segments });
  });
  const bounds = { x0: origin.x, z0: origin.z, x1: r2(origin.x + C.margin * 2 + cols * C.pitch[0]), z1: r2(origin.z + C.margin * 2 + rows * C.pitch[1]) };
  return { id, name, seed, origin, bounds, holes, tiles, boxes, surface: [], cups: holes.map((h) => ({ x: h.cup.x, z: h.cup.z, r: C.cup })), par: holes.reduce((s, h) => s + h.par, 0) };
}

/** Builds the world's courses from the recipe (`recipe.courses`: [{ id, name, landmass, site: { x, z } (the middle), seed }]), checking each sits on flat land clear of the coast, the highways, the towns and the waters. */
export function buildCourses(world, specs = world.recipe.courses ?? [], { pointInPolygon, distToSegment, elevationAt }) {
  const built = [];
  for (const spec of specs) {
    const m = world.landmasses.find((l) => l.id === spec.landmass);
    if (!m) throw new Error(`course ${spec.id} is on a landmass (${spec.landmass}) that is not in the recipe`);
    const layout = spec.layout === 'loop' ? LOOP : null, LY = layout ?? COURSE;
    const w = LY.margin * 2 + LY.grid[0] * LY.pitch[0], d = LY.margin * 2 + LY.grid[1] * LY.pitch[1];
    const course = generateCourse({ seed: spec.seed, origin: { x: spec.site.x - w / 2, z: spec.site.z - d / 2 }, id: spec.id, name: spec.name, layout });
    const coast = m.outline.points, problems = [];
    const roads = [];
    for (const h of world.highways ?? []) {
      for (let i = 0; i < h.ring.length; i++) roads.push([h.ring[i], h.ring[(i + 1) % h.ring.length]]);
      for (const s of h.spurs) { const way = s.via ? [s.from, s.via, s.to] : [s.from, s.to]; for (let k = 0; k + 1 < way.length; k++) roads.push([way[k], way[k + 1]]); }
    }
    // the park (golfPark.js) round it, if the recipe asks: the whole of it must be on flat land clear of the coast, the highways (but for its own access road), the rivers and the town
    if (spec.park) course.park = generatePark(course, roads.map(([a, b]) => ({ a, b })));
    if (spec.loopOf) { // the second nine's grounds: joined to the first nine's park by a path through a gap in its fence
      const parent = built.find((c) => c.id === spec.loopOf);
      if (!parent?.park) throw new Error(`course ${spec.id} is the second nine of ${spec.loopOf}, which has no park`);
      course.park = generateLoopGrounds(course, parent.park);
    }
    const areas = course.park ? (course.park.areas ?? [course.park.bounds]) : [course.bounds]; // (a park may be several rectangles: the second nine's grounds and its plaza)
    const ranges = m.features.ranges ?? [];
    for (const b of areas) {
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
    }
    if (problems.length) throw new Error(`the course ${spec.id} does not fit where the recipe puts it: ${problems.slice(0, 4).join('; ')}`);
    built.push({ landmass: m.id, ...course });
  }
  return built;
}

