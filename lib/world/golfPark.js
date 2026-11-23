// The grounds round the mini-golf course (docs/world/minigolf.md, "The park"): Harbor Mini-Golf's Caribbean-harbour golf park. Circulation first: an access road from the nearest highway to a gate with a sign, a car park,
// a clubhouse beside the first tee with the leaderboard on its wall, a path that leads to the first tee and loops round the nine holes in the order of play, benches and a picnic table by the windmill (the rest and
// let-through spot), a pond with a footbridge and a wrecked jetty, a lighthouse in the north-east corner (the landmark seen from the road), palms, bushes and flowers, a fence all round with the gate, and
// a strip west of the course kept clear for a second nine. Pure: it returns what the bake places (props of the nature, suburban and car kits, boxes, painted quads), no three.js.
import { PALETTE } from './track';
import { THEME, archStripes, bunting, flowerBed, lodge, ship, tiki, treasure, volcano } from './golfTheme';
import { cube, gateway, pathKit, synaptix, theoreticalMinds } from './golfPaths';

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
    stallFood: ['coaster/stall-food', 3.8], stallDrinks: ['coaster/stall-drinks', 3.8], stallInfo: ['coaster/stall-information', 3.8],
    barrel: ['pirate/barrel', 0.9], crate: ['pirate/crate', 0.9], jetty: ['pirate/structure-platform-dock-small', 2.4],
  },
  colors: { wood: [150, 98, 58], rail: [190, 140, 92], white: [240, 240, 240], red: [200, 52, 48], glass: [150, 205, 235], roof: [170, 70, 56], lamp: [250, 224, 130], seat: [120, 80, 50] },
  link: 6, // where the way to the second nine leaves the loop on its east side: this far south of the course's top edge
  west: 16, // the room west of the course the park keeps inside its fence
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
  const P = { x0: r2(B.x0 - PARK.west), x1: r2(B.x1 + 34), z0: r2(B.z0 - 60), z1: r2(B.z1 + 4) };
  const props = [], boxes = [], surface = [], labels = [];
  const prop = (m, x, z, yaw = 0, k = 1, y = 0) => props.push({ m: `park-${m}`, x: r2(x), y, z: r2(z), yaw: r2(yaw), s: r2(PARK.models[m][1] * k) });
  const box = (x, y, z, hx, hy, hz, color, yaw = 0) => boxes.push([r2(x), r2(y), r2(z), r2(hx), r2(hy), r2(hz), r2(yaw), ...color]);
  const rect = (pal, x0, z0, x1, z1) => surface.push([PAL[pal], r2(x0), r2(z0), r2(x1), r2(z0), r2(x1), r2(z1), r2(x0), r2(z1)]);
  const k = { box, rect, prop, props, rnd }; // (the theme's pieces: lib/world/golfTheme.js)
  const sandy = (x, z, rx, rz, n = 10) => { for (let i = 0; i < n; i++) { const a0 = (i / n) * 6.2832, a1 = ((i + 1) / n) * 6.2832; surface.push([PAL.sand, r2(x), r2(z), r2(x + Math.cos(a0) * rx), r2(z + Math.sin(a0) * rz), r2(x + Math.cos(a1) * rx), r2(z + Math.sin(a1) * rz), r2(x + Math.cos(a1) * rx), r2(z + Math.sin(a1) * rz)]); } }; // (a beach: a fan of triangles)
  const inside = (x, z, m = 0) => x > P.x0 + m && x < P.x1 - m && z > P.z0 + m && z < P.z1 - m;

  // ---- the gate, the access road and the car park (north, toward the spur road)
  const gate = { x: r2(cx), z: P.z0, yaw: 0 };
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) box(gate.x + sx * 6.5, 0.5 + i, gate.z, 0.62, 0.52, 0.62, i % 2 ? THEME.white : THEME.red); box(gate.x, 6.3, gate.z, 7.3, 0.45, 0.45, C.wood); bunting(k, gate.x - 6.5, gate.z, gate.x + 6.5, gate.z, 5.9, 16);
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
  lodge(k, club.x, club.z, 1, { h: 5.5 }); // (a painted lodge facing +z: its front toward the course)
  box(club.x, 0.18, club.z + 6.6, 7.5, 0.18, 2.2, C.wood); // the porch
  box(club.x - 9, 2.1, club.z + 5.2, 0.12, 2.1, 0.1, C.wood); box(club.x + 9, 2.1, club.z + 5.2, 0.12, 2.1, 0.1, C.wood);
  const board = { x: r2(club.x - 14), z: r2(club.z + 6.5), yaw: 0 }; // the leaderboard stands in front of the shop
  box(board.x - 3.4, 1.8, board.z, 0.15, 1.8, 0.15, C.wood); box(board.x + 3.4, 1.8, board.z, 0.15, 1.8, 0.15, C.wood); box(board.x, 3.6, board.z - 0.1, 3.9, 1.4, 0.18, [26, 52, 78]);
  labels.push({ text: 'LEADERS', x: board.x, y: 4.6, z: board.z + 0.05 }, { text: 'CLUBHOUSE', x: club.x, y: 10.8, z: club.z + 5.2 });
  lodge(k, club.x - 25, club.z + 1, 1, { hx: 4.6, hz: 3.6, h: 4.2, wall: THEME.sun, trim: THEME.navy, roof: THEME.teal, flag: THEME.navy }); // a small shop beside it (the shed behind it)
  // the shop's stand in front of it: a counter under a red awning with the coloured balls laid out on it and a rack of putters behind (a display: nothing is sold)
  { const sx = club.x - 33, sz = club.z + 4;
    box(sx, 0.55, sz, 1.8, 0.55, 0.5, C.wood); box(sx - 1.7, 1.2, sz - 0.4, 0.08, 1.2, 0.08, C.wood); box(sx + 1.7, 1.2, sz - 0.4, 0.08, 1.2, 0.08, C.wood); box(sx, 2.5, sz - 0.2, 2.1, 0.1, 0.95, C.red);
    [[200, 52, 48], [60, 120, 210], [240, 210, 60], [70, 170, 90]].forEach((c, i) => box(sx - 1.05 + i * 0.7, 1.28, sz, 0.17, 0.17, 0.17, c));
    box(sx, 1.5, sz - 0.75, 1.7, 0.05, 0.12, C.wood); for (let i = 0; i < 5; i++) box(sx - 1.2 + i * 0.6, 1.0, sz - 0.75, 0.04, 0.5, 0.04, [200, 205, 210]); // the putters, shafts in a rack
    labels.push({ text: 'RENT A PUTTER', x: sx, y: 3.3, z: sz + 0.5 }); }
  box(club.x + 20, 1.6, club.z - 4, 3, 1.6, 2.4, C.wood); box(club.x + 20, 3.4, club.z - 4, 3.3, 0.3, 2.7, C.roof); // the service shed, behind the clubhouse's side
  for (let i = 0; i < 4; i++) prop('barrel', club.x + 14 + (i % 2) * 1.6, club.z + 2 + Math.floor(i / 2) * 1.6, 0, 1); // barrels by the porch
  prop('stallFood', club.x + 25, club.z + 3, 0, 1); prop('stallDrinks', club.x + 30.5, club.z + 3, 0, 1); // a food stall and a drinks stall, striped and bright
  for (const sx of [-1, 1]) { flowerBed(k, club.x + sx * 11, club.z + 9.5, 2.4, 6); flowerBed(k, gate.x + sx * 10, gate.z + 4, 2.4, 6); }

  // ---- the paths: from the car park to the clubhouse, to the first tee, and the loop round the nine holes
  const pad = 5;
  const ring = { x0: B.x0 - pad, x1: B.x1 + pad, z0: B.z0 - pad, z1: B.z1 + pad };
  const kit = pathKit(surface, PAL); // (the logo paths: lib/world/golfPaths.js)
  const brain = synaptix(kit, course, ring); // the first nine's boardwalks are the Synaptix brain: an outline with a fissure, circuit between the holes, a node at every tee
  const plazaEnd = gateway(kit, gate.x, lot.z1).z1; // the Voxel Venture double V, laid as a plaza between the car park and the brain
  kit.walk([[gate.x, plazaEnd], [brain.notch.x, brain.notch.z]], { cols: ['gold'] }); // the way in comes down the brain's fissure
  { const wz = club.z + 14.5, ax = club.x - 12, p = brain.outline.filter(([, z]) => z < ring.z0 + 16).reduce((m, q) => (Math.hypot(q[0] - ax, q[1] - wz) < Math.hypot(m[0] - ax, m[1] - wz) ? q : m));
    kit.walk([[ax, wz], [club.x, wz], [gate.x - 26, wz]], { cols: ['inlay-cyan'], x0: 0, x1: 1 }); // the clubhouse's walk to the plaza
    kit.walk([[club.x, club.z + 8.8], [club.x, wz]], { cols: ['inlay-cyan'] }); // from its porch
    kit.walk([[ax, wz], p], { cols: ['inlay-cyan'] }); } // and down to the brain
  const link = { x: P.x1, z: r2(B.z0 + PARK.link) }; // the way to the second nine (The Adventure Loop, east of the park): a gap in the fence and a path from the loop's east leg
  { const e = brain.edge(link.z, true); kit.walk([[e[0], link.z], [P.x1 + 6, link.z]], { cols: ['gold'] }); cube(kit, r2((e[0] + P.x1) / 2), link.z - 1, 3.6); } // the way to the second nine, a gold cube at the gap in the fence

  // ---- benches and a picnic table: along the loop, and the rest and let-through spot by the windmill (hole 4)
  const bench = (x, z, yaw = 0) => { box(x, 0.45, z, 1.4, 0.07, 0.4, C.seat, yaw); box(x, 0.85, z - Math.cos(yaw) * 0.35, 1.4, 0.3, 0.06, C.seat, yaw); box(x - 1.1 * Math.cos(yaw), 0.22, z + 1.1 * Math.sin(yaw), 0.08, 0.22, 0.3, C.wood, yaw); box(x + 1.1 * Math.cos(yaw), 0.22, z - 1.1 * Math.sin(yaw), 0.08, 0.22, 0.3, C.wood, yaw); };
  for (const [x, z] of [[ring.x0 - 4, cz - 20], [ring.x1 + 4, cz - 22], [ring.x1 + 4, cz + 24], [ring.x0 - 4, cz + 22]]) bench(x, z, 0);
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
  sandy(pond.x, pond.z, pond.rx + 3.8, pond.rz + 3.6); // a beach round the pond
  const vol = { x: r2(B.x1 + 22), z: r2(B.z0 + 24) }; // a volcano in the north-east corner of the grounds, with torches round it and treasure at its foot
  volcano(k, vol.x, vol.z, 1); labels.push({ text: 'MOUNT PUTT', x: vol.x, y: 11.5, z: vol.z });
  for (const [dx, dz] of [[-9, -6], [9, -6], [-9, 7], [9, 7]]) tiki(k, vol.x + dx, vol.z + dz, 1);
  treasure(k, vol.x - 10, vol.z + 1.5, 1);
  const bz = pond.z; // the footbridge: from the loop's east path across the pond's neck to the lawn on the far bank
  box((ring.x1 + pond.x + pond.rx + 3) / 2, 0.55, bz, (pond.x + pond.rx + 3 - ring.x1) / 2, 0.12, 1.5, C.wood);
  for (const s of [-1, 1]) box((ring.x1 + pond.x + pond.rx + 3) / 2, 1.1, bz + s * 1.45, (pond.x + pond.rx + 3 - ring.x1) / 2, 0.4, 0.07, C.rail);
  kit.walk([[brain.edge(bz, true)[0], bz], [ring.x1 + 2, bz]], { cols: ['inlay-blue'] }); // (from the brain's edge to the bridge)
  prop('jetty', pond.x - pond.rx - 2.6, pond.z - 6, Math.PI / 2, 1);
  const lh = { x: r2(P.x1 - 9), z: r2(P.z0 + 20) }; // the lighthouse: red and white bands, a lantern room and a roof
  for (let i = 0; i < 6; i++) { const r = 2.6 - i * 0.22, col = i % 2 ? C.white : C.red; box(lh.x, 2.4 + i * 4.4, lh.z, r, 2.2, r, col); box(lh.x, 2.4 + i * 4.4, lh.z, r, 2.2, r, col, Math.PI / 4); }
  box(lh.x, 27.4, lh.z, 2.6, 0.3, 2.6, [60, 70, 78]); box(lh.x, 29.1, lh.z, 1.5, 1.4, 1.5, C.lamp); box(lh.x, 31, lh.z, 2, 0.5, 2, C.roof); box(lh.x, 31.9, lh.z, 0.5, 0.5, 0.5, C.red);
  box(lh.x, 0.25, lh.z, 5, 0.25, 5, [140, 140, 140]);
  labels.push({ text: 'HARBOR LIGHT', x: lh.x, y: 33.6, z: lh.z });

  // ---- the fence all round, but at the gate; palms, bushes and flowers
  const fenceStep = PARK.models.fence[1];
  const fence = (x0, z0, x1, z1) => { const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / fenceStep), yaw = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2; for (let i = 0; i < n; i++) { const x = x0 + ((x1 - x0) * (i + 0.5)) / n, z = z0 + ((z1 - z0) * (i + 0.5)) / n; if ((Math.abs(x - gate.x) < 7 && Math.abs(z - gate.z) < 2) || (Math.abs(x - link.x) < 2 && Math.abs(z - link.z) < 5)) continue; prop('fence', x, z, yaw, 1); } };
  fence(P.x0, P.z0, P.x1, P.z0); fence(P.x1, P.z0, P.x1, P.z1); fence(P.x1, P.z1, P.x0, P.z1); fence(P.x0, P.z1, P.x0, P.z0);
  const keepClear = (x, z) => inside(x, z, 2) && !kit.near(x, z, 4.5) && !(Math.abs(x - gate.x) < 32 && z > lot.z1 - 2 && z < ring.z0 + 10) && !(x > B.x0 - 2 && x < B.x1 + 2 && z > B.z0 - 2 && z < B.z1 + 2) // not on the course or its apron
    && !(x > lot.x0 - 2 && x < lot.x1 + 2 && z > P.z0 - 2 && z < lot.z1 + 2) && !(Math.abs(x - club.x) < 22 && z > lot.z1 && z < ring.z0) && !(x > ring.x1 && Math.abs(z - bz) < 4) && !(x > ring.x1 && Math.abs(z - link.z) < 5) && Math.hypot(x - vol.x, z - vol.z) > 12 && !(Math.abs(x - club.x - 28) < 8 && Math.abs(z - club.z - 3) < 7);
  const palms = ['palm', 'palmBend', 'palmTall'];
  for (let tries = 0, placed = 0; placed < 46 && tries < 900; tries++) { const x = P.x0 + 3 + rnd() * (P.x1 - P.x0 - 6), z = P.z0 + 3 + rnd() * (P.z1 - P.z0 - 6); if (!keepClear(x, z) || Math.hypot(x - lh.x, z - lh.z) < 7 || Math.hypot((x - pond.x) / (pond.rx + 3), (z - pond.z) / (pond.rz + 3)) < 1) continue; prop(palms[Math.floor(rnd() * 3)], x, z, rnd() * 6.28, 0.85 + rnd() * 0.4); placed++; }
  for (let tries = 0, placed = 0; placed < 60 && tries < 1200; tries++) { const x = P.x0 + 3 + rnd() * (P.x1 - P.x0 - 6), z = P.z0 + 3 + rnd() * (P.z1 - P.z0 - 6); if (!keepClear(x, z) || Math.hypot(x - lh.x, z - lh.z) < 6 || Math.hypot((x - pond.x) / (pond.rx + 1), (z - pond.z) / (pond.rz + 1)) < 1) continue; prop('bush', x, z, rnd() * 6.28, 0.8 + rnd() * 0.5); placed++; }
  for (let i = 0; i < 5; i++) for (const tz of [ring.z0 - 2.2, ring.z1 + 2.2]) if (!kit.near(ring.x0 + 14 + i * 28, tz, 3.4)) tiki(k, ring.x0 + 14 + i * 28, tz, 1); // tiki torches along the loop's north and south legs
  // lamps along the car park and the clubhouse path (the Racing Kit's lightPostModern, as the track has: it glows at night)
  for (const [x, z] of [[lot.x0 + 3, lot.z1 + 1.5], [lot.x1 - 3, lot.z1 + 1.5], [cx - 28, lot.z1 + 12], [cx + 28, lot.z1 + 12], [club.x - 8, club.z + 12], [club.x + 8, club.z + 12]]) props.push({ m: 'lightPostModern', x: r2(x), y: 0, z: r2(z), yaw: Math.PI, s: 5 }); // the Racing Kit's street lamp, as along the track: its head glows at night and it throws a pool of light (chunkObject.js), the arm over the car park or the path

  const out = { bounds: P, gate, road, lot, club, board, rest, pond, lighthouse: lh, ring, link, logo: { notch: brain.notch, orb: brain.orb }, props, boxes, surface, labels };
  return out;
}

/**
 * The grounds of the second nine, "The Adventure Loop" (docs/world/minigolf.md): east of the park, joined to its loop by a path through a gap in the fence (`parent.link`). An arch over the path with the
 * name, a leaderboard of its own, a path round the nine holes, a pirate yard of barrels and crates at the entrance, palms and rocks, benches and lamps. The same shape as a park (props, boxes, surface, labels,
 * board, bounds) so the bake and the game treat it alike; no gate and no road: you walk in from the first nine.
 */
export function generateLoopGrounds(course, parent) {
  const rnd = mulberry((course.seed ?? 1) + 199), B = course.bounds, C = PARK.colors, w = PARK.path, pad = 5;
  const link = parent.link;
  const P = { x0: r2(link.x), x1: r2(B.x1 + 12), z0: r2(B.z0 - 8), z1: r2(B.z1 + 9) };
  const props = [], boxes = [], surface = [], labels = [];
  const prop = (m, x, z, yaw = 0, k = 1, y = 0) => props.push({ m: `park-${m}`, x: r2(x), y, z: r2(z), yaw: r2(yaw), s: r2(PARK.models[m][1] * k) });
  const box = (x, y, z, hx, hy, hz, color, yaw = 0) => boxes.push([r2(x), r2(y), r2(z), r2(hx), r2(hy), r2(hz), r2(yaw), ...color]);
  const rect = (pal, x0, z0, x1, z1) => surface.push([PAL[pal], r2(x0), r2(z0), r2(x1), r2(z0), r2(x1), r2(z1), r2(x0), r2(z1)]);
  const k = { box, rect, prop, props, rnd }; // (the theme's pieces: lib/world/golfTheme.js)
  const walk = (x0, z0, x1, z1) => { rect('plank', x0 - 0.35, z0 - 0.35, x1 + 0.35, z1 + 0.35); rect('path', x0, z0, x1, z1); }; // (a boardwalk: its boards on a darker edge)
  const sandy = (x, z, rx, rz, n = 10) => { for (let i = 0; i < n; i++) { const a0 = (i / n) * 6.2832, a1 = ((i + 1) / n) * 6.2832; surface.push([PAL.sand, r2(x), r2(z), r2(x + Math.cos(a0) * rx), r2(z + Math.sin(a0) * rz), r2(x + Math.cos(a1) * rx), r2(z + Math.sin(a1) * rz), r2(x + Math.cos(a1) * rx), r2(z + Math.sin(a1) * rz)]); } }; // (a beach: a fan of triangles)
  const ring = { x0: B.x0 - pad, x1: B.x1 + pad, z0: B.z0 - pad, z1: B.z1 + pad };
  // the path from the first nine's gap to the loop, and the loop round the nine holes
  const kit = pathKit(surface, PAL); // (the logo paths: lib/world/golfPaths.js)
  const logo = theoreticalMinds(kit, course, ring, link, P.z1 + 1.5 + w / 2); // the second nine's boardwalks are the Theoretical Minds half brain, a spine and right-angled circuit to every hole; its spine ends at the plaza's walk
  // the arch over the path, with the name; the board beside it
  const arch = { x: r2(link.x + 8), z: link.z };
  archStripes(k, arch.x, arch.z, 5, 6); box(arch.x, 6.3, arch.z, 0.45, 0.45, 5.7, C.wood); tiki(k, arch.x + 2.5, arch.z - 7.5, 1); tiki(k, arch.x + 2.5, arch.z + 7.5, 1); treasure(k, arch.x + 9, arch.z + 4.5, 1);
  box(arch.x, 6.9, arch.z - 5, 0.6, 0.5, 0.6, C.red); box(arch.x, 6.9, arch.z + 5, 0.6, 0.5, 0.6, C.red);
  labels.push({ text: 'THE ADVENTURE LOOP', x: arch.x - 0.6, y: 7.9, z: arch.z });
  const board = { x: r2(arch.x + 2), z: r2(arch.z - 13), yaw: 0 };
  box(board.x - 3.4, 1.8, board.z, 0.15, 1.8, 0.15, C.wood); box(board.x + 3.4, 1.8, board.z, 0.15, 1.8, 0.15, C.wood); box(board.x, 3.6, board.z - 0.1, 3.9, 1.4, 0.18, [26, 52, 78]);
  labels.push({ text: 'LEADERS', x: board.x, y: 4.6, z: board.z + 0.05 });
  // a pirate yard by the entrance: barrels and crates stacked beside the path
  for (let i = 0; i < 5; i++) prop('barrel', arch.x + 5 + (i % 3) * 1.5, arch.z + 8 + Math.floor(i / 3) * 1.5, 0, 1);
  for (let i = 0; i < 4; i++) prop('crate', arch.x + 5 + (i % 2) * 1.6, arch.z - 8 - Math.floor(i / 2) * 1.6, rnd() * 3, 1);
  // a barrel and a crate by every third hole's tee
  course.holes.forEach((h, i) => { if (i % 3 === 1) { prop('barrel', h.tee.x - 2.2, h.tee.z + 3, 0, 1); prop('crate', h.tee.x - 3.8, h.tee.z + 3.4, rnd() * 3, 1); } });
  // benches and lamps along the loop
  const bench = (x, z) => { box(x, 0.45, z, 1.4, 0.07, 0.4, C.seat); box(x, 0.85, z - 0.35, 1.4, 0.3, 0.06, C.seat); box(x - 1.1, 0.22, z, 0.08, 0.22, 0.3, C.wood); box(x + 1.1, 0.22, z, 0.08, 0.22, 0.3, C.wood); };
  bench((ring.x0 + ring.x1) / 2 - 20, ring.z1 + 1.6); bench((ring.x0 + ring.x1) / 2 + 20, ring.z1 + 1.6);
  for (const [x, z] of [[ring.x0 - 2, ring.z0 + 2], [ring.x1 + 2, ring.z0 + 2], [ring.x1 + 2, ring.z1 - 2], [arch.x - 3, arch.z - 4]]) props.push({ m: 'lightPostModern', x: r2(x), y: 0, z: r2(z), yaw: Math.PI, s: 5 });
  // palms, rocks and bushes round the edge, off the course, the loop and the way in
  const inside = (x, z) => x > P.x0 + 3 && x < P.x1 - 3 && z > P.z0 + 3 && z < P.z1 - 3;
  const clear = (x, z) => inside(x, z) && !kit.near(x, z, 4.5) && !(x > ring.x0 - 1 && x < ring.x1 + 1 && z > ring.z0 - 1 && z < ring.z1 + 1) && !(Math.abs(z - link.z) < 7 && x < ring.x0 + 2) && Math.hypot(x - board.x, z - board.z) > 6 && Math.hypot(x - arch.x - 7, z - arch.z) > 10;
  const palms = ['palm', 'palmBend', 'palmTall'];
  for (let tries = 0, placed = 0; placed < 30 && tries < 900; tries++) { const x = P.x0 + rnd() * (P.x1 - P.x0), z = P.z0 + rnd() * (P.z1 - P.z0); if (!clear(x, z)) continue; prop(palms[Math.floor(rnd() * 3)], x, z, rnd() * 6.28, 0.85 + rnd() * 0.4); placed++; }
  for (let tries = 0, placed = 0; placed < 14 && tries < 600; tries++) { const x = P.x0 + rnd() * (P.x1 - P.x0), z = P.z0 + rnd() * (P.z1 - P.z0); if (!clear(x, z)) continue; prop('rock', x, z, rnd() * 6, 0.7 + rnd() * 0.6); placed++; }
  for (let tries = 0, placed = 0; placed < 24 && tries < 900; tries++) { const x = P.x0 + rnd() * (P.x1 - P.x0), z = P.z0 + rnd() * (P.z1 - P.z0); if (!clear(x, z)) continue; prop('bush', x, z, rnd() * 6.28, 0.8 + rnd() * 0.5); placed++; }
  // ---- the plaza south of the loop: the second nine's own clubhouse, shop and rest spot (a rectangle of its own: the land south of the loop is free where the coast and the highway to the south-east are not)
  const plaza = { x0: r2(ring.x0), x1: r2(Math.min(B.x1 - 40, ring.x0 + 88)), z0: P.z1, z1: r2(P.z1 + 24) };
  const walkZ = plaza.z0 + 1.5; // the walk along the front of the buildings
  walk(plaza.x0, walkZ, plaza.x1, walkZ + w); // (it joins the loop's south leg by a path)
  const club = { x: r2(plaza.x0 + 22), z: r2(plaza.z0 + 14) };
  walk(club.x - w / 2, ring.z1, club.x + w / 2, walkZ);
  lodge(k, club.x, club.z, -1, { h: 5.5, wall: THEME.navy, trim: THEME.cream, roof: THEME.red, flag: [30, 30, 34] }); // (facing north: its front toward the walk and the loop)
  box(club.x, 0.18, club.z - 6, 6.4, 0.18, 1.9, C.wood); // the porch
  labels.push({ text: "THE CAPTAIN'S CABIN", x: club.x, y: 11.4, z: club.z - 4.5 });
  // the shop: a small shop and, in front of it, a stand with the balls laid out and a rack of putters, a display (nothing is sold)
  const shop = { x: r2(club.x + 26), z: r2(plaza.z0 + 14) };
  lodge(k, shop.x, shop.z, -1, { hx: 4.6, hz: 3.6, h: 4.2, wall: THEME.sun, trim: THEME.navy, roof: THEME.teal, flag: THEME.navy });
  { const sx = shop.x, sz = shop.z - 9.5;
    box(sx, 0.55, sz, 1.8, 0.55, 0.5, C.wood); box(sx - 1.7, 1.2, sz + 0.4, 0.08, 1.2, 0.08, C.wood); box(sx + 1.7, 1.2, sz + 0.4, 0.08, 1.2, 0.08, C.wood); box(sx, 2.5, sz + 0.2, 2.1, 0.1, 0.95, C.red);
    [[200, 52, 48], [60, 120, 210], [240, 210, 60], [70, 170, 90]].forEach((c, i) => box(sx - 1.05 + i * 0.7, 1.28, sz, 0.17, 0.17, 0.17, c));
    box(sx, 1.5, sz + 0.75, 1.7, 0.05, 0.12, C.wood); for (let i = 0; i < 5; i++) box(sx - 1.2 + i * 0.6, 1.0, sz + 0.75, 0.04, 0.5, 0.04, [200, 205, 210]);
    labels.push({ text: 'BALLS & MAPS', x: sx, y: 3.3, z: sz - 0.5 }); }
  // the rest spot: benches, a picnic table, a bin and barrel stools under a palm, by the shop
  const rest = { x: r2(shop.x + 22), z: r2(plaza.z0 + 11) };
  const seat2 = (x, z) => { box(x, 0.45, z, 1.4, 0.07, 0.4, C.seat); box(x, 0.85, z + 0.35, 1.4, 0.3, 0.06, C.seat); box(x - 1.1, 0.22, z, 0.08, 0.22, 0.3, C.wood); box(x + 1.1, 0.22, z, 0.08, 0.22, 0.3, C.wood); }; // (the back to the south, the seat facing the loop)
  seat2(rest.x - 4, rest.z - 3); seat2(rest.x + 4, rest.z - 3);
  box(rest.x, 0.85, rest.z + 1.2, 1.6, 0.07, 0.8, C.seat); box(rest.x - 1.2, 0.42, rest.z + 1.2, 0.1, 0.42, 0.7, C.wood); box(rest.x + 1.2, 0.42, rest.z + 1.2, 0.1, 0.42, 0.7, C.wood); // a picnic table
  box(rest.x + 7, 0.6, rest.z - 3, 0.4, 0.6, 0.4, [60, 70, 78]); // a bin
  prop('barrel', rest.x - 3, rest.z + 4, 0, 1); prop('barrel', rest.x - 1.6, rest.z + 4.4, 0, 1); prop('palmBend', rest.x + 3, rest.z + 5, 1.2, 1.1); prop('palm', rest.x - 7, rest.z + 3, 0.4, 1);
  prop('stallFood', shop.x + 11, plaza.z0 + 10, Math.PI, 1); prop('stallDrinks', shop.x + 14.5, plaza.z0 + 10, Math.PI, 1);
  ship(k, plaza.x0 + 7, plaza.z0 + 14, 0.8); sandy(plaza.x0 + 7, plaza.z0 + 14, 8.5, 12.5); labels.push({ text: 'THE WRECK', x: plaza.x0 + 7, y: 11.5, z: plaza.z0 + 14 });
  for (const sx of [-1, 1]) flowerBed(k, club.x + sx * 10, club.z - 9, 2.2, 6); flowerBed(k, shop.x, shop.z - 14, 2, 5);
  labels.push({ text: 'REST STOP', x: rest.x, y: 2.8, z: rest.z - 5 }); box(rest.x, 1.3, rest.z - 5.1, 0.12, 1.3, 0.12, C.wood);
  for (const [x, z] of [[plaza.x0 + 6, walkZ - 1], [shop.x - 12, walkZ - 1], [rest.x - 10, walkZ - 1]]) props.push({ m: 'lightPostModern', x: r2(x), y: 0, z: r2(z), yaw: 0, s: 5 });
  for (let i = 0; i < 6; i++) prop('bush', plaza.x0 + 4 + i * 14 + rnd() * 4, plaza.z1 - 2.5 - rnd() * 2, rnd() * 6, 0.9);
  return { bounds: P, areas: [P, plaza], plaza, gate: null, road: null, board, arch, ring, club, shop, rest, logo: { spineX: logo.spineX }, props, boxes, surface, labels };
}
