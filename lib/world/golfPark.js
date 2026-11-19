// The grounds round the mini-golf course (docs/world/minigolf.md, "The park"): Harbor Mini-Golf's Caribbean-harbour golf park. Circulation first: an access road from the nearest highway to a gate with a sign, a car park,
// a clubhouse beside the first tee with the leaderboard on its wall, a path that leads to the first tee and loops round the nine holes in the order of play, benches and a picnic table by the windmill (the rest and
// let-through spot), a pond with a footbridge and a wrecked jetty, a lighthouse in the north-east corner (the landmark seen from the road), palms, bushes and flowers, a fence all round with the gate, and
// a strip west of the course kept clear for a second nine. Pure: it returns what the bake places (props of the nature, suburban and car kits, boxes, painted quads), no three.js.
import { PALETTE } from './track';

export const PARK = {
  road: 6, // the access road's width
  path: 3.2, // the paths' width
  lot: { w: 64, d: 20 }, // the car park
  models: { // the models the park places (`park-<name>`): file under public/models/kenney, and the scale that makes it the size of the town's things
    palm: ['nature/tree_palm', 3.4], palmBend: ['nature/tree_palmBend', 3.4], palmTall: ['nature/tree_palmTall', 3.8],
    bush: ['nature/plant_bushLarge', 3.4], flower: ['nature/flower_redA', 3.4],
    fence: ['nature/fence_simple', 2.6], sign: ['nature/sign', 5], rock: ['nature/rock_largeA', 3], log: ['nature/log', 3],
    clubhouse: ['suburban/building-type-c', 9.5], shop: ['suburban/building-type-a', 6.5],
    sedan: ['cars/sedan', 1.6], suv: ['cars/suv', 1.6], van: ['cars/van', 1.6], taxi: ['cars/taxi', 1.6],
    barrel: ['pirate/barrel', 0.9], jetty: ['pirate/structure-platform-dock-small', 2.4],
  },
  colors: { wood: [150, 98, 58], rail: [190, 140, 92], white: [240, 240, 240], red: [200, 52, 48], glass: [150, 205, 235], roof: [170, 70, 56], lamp: [250, 224, 130], seat: [120, 80, 50] },
  reserve: { x: 40, z: 60 }, // the strip kept clear for a second nine: how far west of the course it runs, and how much taller than the course it is
};

const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const r2 = (n) => Math.round(n * 100) / 100;
const PAL = Object.fromEntries(PALETTE.map((p, i) => [p.name, i]));

/** The park's models' names as placed props (`park-<name>`), and their files. */
export const PARK_MODELS = Object.keys(PARK.models);

/**
 * The park for a course { bounds, holes, seed }: { bounds, gate, road (from the nearest highway point to the gate: { from, to, width } or null), props, boxes, surface, scoreboard, reserve, labels }. `roads` are the world's
 * highways as segments ([{ a, b }]), to find where the access road leaves the road network.
 */
export function generatePark(course, roads = []) {
  const rnd = mulberry((course.seed ?? 1) + 99), B = course.bounds, C = PARK.colors;
  const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
  const P = { x0: r2(B.x0 - PARK.reserve.x), x1: r2(B.x1 + 34), z0: r2(B.z0 - 60), z1: r2(B.z1 + 4) };
  const props = [], boxes = [], surface = [], labels = [];
  const prop = (m, x, z, yaw = 0, k = 1, y = 0) => props.push({ m: `park-${m}`, x: r2(x), y, z: r2(z), yaw: r2(yaw), s: r2(PARK.models[m][1] * k) });
  const box = (x, y, z, hx, hy, hz, color, yaw = 0) => boxes.push([r2(x), r2(y), r2(z), r2(hx), r2(hy), r2(hz), r2(yaw), ...color]);
  const rect = (pal, x0, z0, x1, z1) => surface.push([PAL[pal], r2(x0), r2(z0), r2(x1), r2(z0), r2(x1), r2(z1), r2(x0), r2(z1)]);
  const inside = (x, z, m = 0) => x > P.x0 + m && x < P.x1 - m && z > P.z0 + m && z < P.z1 - m;

  // ---- the gate, the access road and the car park (north, toward the spur road)
  const gate = { x: r2(cx), z: P.z0, yaw: 0 };
  box(gate.x - 6.5, 3, gate.z, 0.5, 3, 0.5, C.wood); box(gate.x + 6.5, 3, gate.z, 0.5, 3, 0.5, C.wood); box(gate.x, 6.3, gate.z, 7.3, 0.45, 0.45, C.wood);
  box(gate.x - 6.5, 6.9, gate.z, 0.7, 0.5, 0.7, C.red); box(gate.x + 6.5, 6.9, gate.z, 0.7, 0.5, 0.7, C.red);
  labels.push({ text: 'HARBOR MINI-GOLF', x: gate.x, y: 7.9, z: gate.z });
  prop('sign', gate.x + 9.5, gate.z + 1.4, 0, 1);
  let road = null;
  if (roads.length) { // the nearest point of any highway to the gate
    let best = null;
    for (const r of roads) {
      const dx = r.b.x - r.a.x, dz = r.b.z - r.a.z, t = Math.max(0, Math.min(1, ((gate.x - r.a.x) * dx + (gate.z - r.a.z) * dz) / (dx * dx + dz * dz || 1)));
      const q = { x: r.a.x + t * dx, z: r.a.z + t * dz }, d = Math.hypot(gate.x - q.x, gate.z - q.z);
      if (!best || d < best.d) best = { q, d };
    }
    road = { from: { x: r2(best.q.x), z: r2(best.q.z) }, to: { x: gate.x, z: r2(gate.z + 10) }, width: PARK.road };
  }
  const lot = { x0: cx - PARK.lot.w / 2, x1: cx + PARK.lot.w / 2, z0: P.z0 + 8, z1: P.z0 + 8 + PARK.lot.d };
  rect('asphalt', lot.x0, lot.z0, lot.x1, lot.z1);
  rect('asphalt', gate.x - PARK.road / 2, gate.z - 1, gate.x + PARK.road / 2, lot.z0 + 1); // the drive in from the gate
  const aisle = (lot.z0 + lot.z1) / 2, bays = Math.floor(PARK.lot.w / 4.6);
  for (let i = 0; i <= bays; i++) { const x = lot.x0 + 1.2 + i * 4.6; rect('line', x - 0.07, lot.z0 + 0.8, x + 0.07, aisle - 2.6); rect('line', x - 0.07, aisle + 2.6, x + 0.07, lot.z1 - 0.8); }
  const kinds = ['sedan', 'suv', 'van', 'taxi'];
  for (let i = 0; i < bays; i++) for (const row of [0, 1]) {
    if (rnd() < 0.62) continue; // most bays are empty: a quiet course
    const x = lot.x0 + 1.2 + (i + 0.5) * 4.6, z = row === 0 ? lot.z0 + 0.8 + 4.4 : lot.z1 - 0.8 - 4.4;
    prop(kinds[Math.floor(rnd() * kinds.length)], x, z, row === 0 ? 0 : Math.PI, 1);
  }

  // ---- the clubhouse beside the first tee, its door toward the path to the tee, the leaderboard on its front
  const tee1 = course.holes[0].tee;
  const club = { x: r2(tee1.x + 7), z: r2(lot.z1 + 11) };
  prop('clubhouse', club.x, club.z, 0, 1); // (the house faces +z: its front toward the course)
  box(club.x, 0.18, club.z + 6.6, 7.5, 0.18, 2.2, C.wood); // the porch
  box(club.x - 9, 2.1, club.z + 5.2, 0.12, 2.1, 0.1, C.wood); box(club.x + 9, 2.1, club.z + 5.2, 0.12, 2.1, 0.1, C.wood);
  const board = { x: r2(club.x - 14), z: r2(club.z + 6.5), yaw: 0 }; // the leaderboard stands in front of the shop
  box(board.x - 3.4, 1.8, board.z, 0.15, 1.8, 0.15, C.wood); box(board.x + 3.4, 1.8, board.z, 0.15, 1.8, 0.15, C.wood); box(board.x, 3.6, board.z - 0.1, 3.9, 1.4, 0.18, [26, 52, 78]);
  labels.push({ text: 'LEADERS', x: board.x, y: 4.6, z: board.z + 0.05 }, { text: 'CLUBHOUSE', x: club.x, y: 12.6, z: club.z + 5.2 });
  prop('shop', club.x - 25, club.z + 1, 0, 1); // a small shop beside it (the shed behind it)
  // the shop's stand in front of it: a counter under a red awning with the coloured balls laid out on it and a rack of putters behind (a display: nothing is sold)
  { const sx = club.x - 21.5, sz = club.z + 5.5;
    box(sx, 0.55, sz, 1.8, 0.55, 0.5, C.wood); box(sx - 1.7, 1.2, sz - 0.4, 0.08, 1.2, 0.08, C.wood); box(sx + 1.7, 1.2, sz - 0.4, 0.08, 1.2, 0.08, C.wood); box(sx, 2.5, sz - 0.2, 2.1, 0.1, 0.95, C.red);
    [[200, 52, 48], [60, 120, 210], [240, 210, 60], [70, 170, 90]].forEach((c, i) => box(sx - 1.05 + i * 0.7, 1.28, sz, 0.17, 0.17, 0.17, c));
    box(sx, 1.5, sz - 0.75, 1.7, 0.05, 0.12, C.wood); for (let i = 0; i < 5; i++) box(sx - 1.2 + i * 0.6, 1.0, sz - 0.75, 0.04, 0.5, 0.04, [200, 205, 210]); // the putters, shafts in a rack
    labels.push({ text: 'RENT A PUTTER', x: sx, y: 3.3, z: sz + 0.5 }); }
  box(club.x + 20, 1.6, club.z - 4, 3, 1.6, 2.4, C.wood); box(club.x + 20, 3.4, club.z - 4, 3.3, 0.3, 2.7, C.roof); // the service shed, behind the clubhouse's side
  for (let i = 0; i < 4; i++) prop('barrel', club.x + 14 + (i % 2) * 1.6, club.z + 2 + Math.floor(i / 2) * 1.6, 0, 1); // barrels by the porch

  // ---- the paths: from the car park to the clubhouse, to the first tee, and the loop round the nine holes
  const w = PARK.path, pad = 5;
  const ring = { x0: B.x0 - pad, x1: B.x1 + pad, z0: B.z0 - pad, z1: B.z1 + pad };
  rect('path', cx - w / 2, lot.z1, cx + w / 2, club.z + 8 + w); // the car park to the path along the clubhouse's front
  rect('path', Math.min(cx, club.x) - w / 2, club.z + 8, Math.max(cx, club.x) + w / 2, club.z + 8 + w); // along the front of the clubhouse
  rect('path', club.x - w / 2, club.z + 8, club.x + w / 2, ring.z0); // to the ring, at the first tee
  rect('path', ring.x0, ring.z0, ring.x1, ring.z0 + w); rect('path', ring.x0, ring.z1 - w, ring.x1, ring.z1); // the loop: north and south legs
  rect('path', ring.x0, ring.z0, ring.x0 + w, ring.z1); rect('path', ring.x1 - w, ring.z0, ring.x1, ring.z1); // west and east
  const ex = P.x0 + 6; rect('path', ex, cz - w / 2, ring.x0, cz + w / 2); // the stub west: a second nine would start here
  labels.push({ text: 'THE ADVENTURE LOOP: COMING SOON', x: ex + 2, y: 2.6, z: cz - 2 });
  box(ex + 2, 1.2, cz, 0.12, 1.2, 0.12, C.wood);

  // ---- benches and a picnic table: along the loop, and the rest and let-through spot by the windmill (hole 4)
  const bench = (x, z, yaw = 0) => { box(x, 0.45, z, 1.4, 0.07, 0.4, C.seat, yaw); box(x, 0.85, z - Math.cos(yaw) * 0.35, 1.4, 0.3, 0.06, C.seat, yaw); box(x - 1.1 * Math.cos(yaw), 0.22, z + 1.1 * Math.sin(yaw), 0.08, 0.22, 0.3, C.wood, yaw); box(x + 1.1 * Math.cos(yaw), 0.22, z - 1.1 * Math.sin(yaw), 0.08, 0.22, 0.3, C.wood, yaw); };
  for (const [x, z] of [[ring.x0 + 30, ring.z1 + 1.6], [ring.x1 - 30, ring.z1 + 1.6], [ring.x1 + 1.6, cz + 24], [ring.x0 - 1.6, cz + 22]]) bench(x, z, 0);
  const w4 = course.holes[3], rest = { x: (w4.bounds.x0 + w4.bounds.x1) / 2, z: ring.z0 - 2 };
  bench(rest.x - 5, rest.z, Math.PI); bench(rest.x + 5, rest.z, Math.PI);
  box(rest.x, 0.85, rest.z - 2.4, 1.6, 0.07, 0.8, C.seat); box(rest.x - 1.2, 0.42, rest.z - 2.4, 0.1, 0.42, 0.7, C.wood); box(rest.x + 1.2, 0.42, rest.z - 2.4, 0.1, 0.42, 0.7, C.wood); // a picnic table
  box(rest.x + 9, 0.6, rest.z, 0.4, 0.6, 0.4, [60, 70, 78]); // a bin

  // ---- the pond with its footbridge and the wrecked jetty (east), the lighthouse (north-east corner)
  const pond = { x: r2(B.x1 + 19), z: r2(cz + 18), rx: 8.5, rz: 15 };
  const seg = 14;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p0 = [pond.x + Math.cos(a0) * pond.rx, pond.z + Math.sin(a0) * pond.rz], p1 = [pond.x + Math.cos(a1) * pond.rx, pond.z + Math.sin(a1) * pond.rz];
    surface.push([PAL.pond, r2(pond.x), r2(pond.z), r2(p0[0]), r2(p0[1]), r2(p1[0]), r2(p1[1]), r2(p1[0]), r2(p1[1])]); // (a triangle: the centre and two rim points, wound upward: the quad's last two corners are the same)
  }
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.3; prop('rock', pond.x + Math.cos(a) * (pond.rx + 1.4), pond.z + Math.sin(a) * (pond.rz + 1.4), rnd() * 6, 0.6 + rnd() * 0.5); }
  const bz = pond.z; // the footbridge: from the loop's east path across the pond's neck to the lawn on the far bank
  box((ring.x1 + pond.x + pond.rx + 3) / 2, 0.55, bz, (pond.x + pond.rx + 3 - ring.x1) / 2, 0.12, 1.5, C.wood);
  for (const s of [-1, 1]) box((ring.x1 + pond.x + pond.rx + 3) / 2, 1.1, bz + s * 1.45, (pond.x + pond.rx + 3 - ring.x1) / 2, 0.4, 0.07, C.rail);
  rect('path', ring.x1, bz - 1.6, ring.x1 + 2, bz + 1.6);
  prop('jetty', pond.x - pond.rx - 2.6, pond.z - 6, Math.PI / 2, 1);
  const lh = { x: r2(P.x1 - 9), z: r2(P.z0 + 20) }; // the lighthouse: red and white bands, a lantern room and a roof
  for (let i = 0; i < 6; i++) { const r = 2.6 - i * 0.22, col = i % 2 ? C.white : C.red; box(lh.x, 2.4 + i * 4.4, lh.z, r, 2.2, r, col); box(lh.x, 2.4 + i * 4.4, lh.z, r, 2.2, r, col, Math.PI / 4); }
  box(lh.x, 27.4, lh.z, 2.6, 0.3, 2.6, [60, 70, 78]); box(lh.x, 29.1, lh.z, 1.5, 1.4, 1.5, C.lamp); box(lh.x, 31, lh.z, 2, 0.5, 2, C.roof); box(lh.x, 31.9, lh.z, 0.5, 0.5, 0.5, C.red);
  box(lh.x, 0.25, lh.z, 5, 0.25, 5, [140, 140, 140]);
  labels.push({ text: 'HARBOR LIGHT', x: lh.x, y: 33.6, z: lh.z });

  // ---- the fence all round, but at the gate; palms, bushes and flowers
  const fenceStep = PARK.models.fence[1];
  const fence = (x0, z0, x1, z1) => { const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / fenceStep), yaw = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2; for (let i = 0; i < n; i++) { const x = x0 + ((x1 - x0) * (i + 0.5)) / n, z = z0 + ((z1 - z0) * (i + 0.5)) / n; if (Math.abs(x - gate.x) < 7 && Math.abs(z - gate.z) < 2) continue; prop('fence', x, z, yaw, 1); } };
  fence(P.x0, P.z0, P.x1, P.z0); fence(P.x1, P.z0, P.x1, P.z1); fence(P.x1, P.z1, P.x0, P.z1); fence(P.x0, P.z1, P.x0, P.z0);
  const keepClear = (x, z) => inside(x, z, 2) && !(x > B.x0 - 2 && x < B.x1 + 2 && z > B.z0 - 2 && z < B.z1 + 2) // not on the course or its apron
    && !(x > lot.x0 - 2 && x < lot.x1 + 2 && z > P.z0 - 2 && z < lot.z1 + 2) && !(Math.abs(x - club.x) < 22 && z > lot.z1 && z < ring.z0) && !(x > P.x0 && x < B.x0 - 4 && Math.abs(z - cz) < PARK.reserve.z / 2) && !(x > ring.x1 && Math.abs(z - bz) < 4);
  const palms = ['palm', 'palmBend', 'palmTall'];
  for (let tries = 0, placed = 0; placed < 46 && tries < 900; tries++) { const x = P.x0 + 3 + rnd() * (P.x1 - P.x0 - 6), z = P.z0 + 3 + rnd() * (P.z1 - P.z0 - 6); if (!keepClear(x, z) || Math.hypot(x - lh.x, z - lh.z) < 7 || Math.hypot((x - pond.x) / (pond.rx + 3), (z - pond.z) / (pond.rz + 3)) < 1) continue; prop(palms[Math.floor(rnd() * 3)], x, z, rnd() * 6.28, 0.85 + rnd() * 0.4); placed++; }
  for (let tries = 0, placed = 0; placed < 60 && tries < 1200; tries++) { const x = P.x0 + 3 + rnd() * (P.x1 - P.x0 - 6), z = P.z0 + 3 + rnd() * (P.z1 - P.z0 - 6); if (!keepClear(x, z) || Math.hypot(x - lh.x, z - lh.z) < 6 || Math.hypot((x - pond.x) / (pond.rx + 1), (z - pond.z) / (pond.rz + 1)) < 1) continue; prop(['bush', 'flower', 'bush', 'flower'][Math.floor(rnd() * 4)], x, z, rnd() * 6.28, 0.8 + rnd() * 0.5); placed++; }
  // lamps along the car park and the clubhouse path (the Racing Kit's lightPostModern, as the track has: it glows at night)
  for (const [x, z] of [[lot.x0 + 3, lot.z1 + 1.5], [lot.x1 - 3, lot.z1 + 1.5], [cx, lot.z1 + 12], [club.x - 8, club.z + 12], [club.x + 8, club.z + 12]]) props.push({ m: 'lightPostModern', x: r2(x), y: 0, z: r2(z), yaw: Math.PI, s: 5 }); // the Racing Kit's street lamp, as along the track: its head glows at night and it throws a pool of light (chunkObject.js), the arm over the car park or the path

  const out = { bounds: P, gate, road, lot, club, board, rest, pond, lighthouse: lh, ring, props, boxes, surface, labels, reserve: { x0: P.x0, x1: r2(B.x0 - 4), z0: r2(cz - PARK.reserve.z / 2), z1: r2(cz + PARK.reserve.z / 2) } };
  return out;
}
