// The ports and harbours (docs/world/river_plan.md, "The ports"): a shipping port on each of the two large landmasses and a harbour for boats. The plan (lib/world/riverPlan.js: PORTS, and Harbor Isle's existing harbour)
// says where; this makes what stands there from a point on the coast and the direction out to sea: a quay with a deck a car can drive on, jetties, a container yard, gantry cranes, a terminal, a breakwater and floating
// docks. Everything is boxes (the same box builder as the bridges, lib/world/riverBridge.js): the decks are also baked as `jetty` road pieces (a flat deck, walkable and drivable: lib/world/terrain.js), the rest as
// compact box descriptors in the chunk (`structures`: [cx, cy, cz, hx, hy, hz, yaw, r, g, b]). Nothing stands further than 26 units from the shore, so the coastal ring road (30 units inland) is clear. Pure.
import { nearestOnCoast, inside } from './riverPlan';
import { highwaySegments, planOf, riverField } from './rivers';

export const PORT = {
  deck: 0.5, // a quay's and a jetty's deck over the ground
  quayDepth: 14, // the quay: this deep over the land, and `over` over the water
  over: 7,
  yard: [16, 25], // the container yard: from this far to this far behind the shore
  container: { len: 3.6, wide: 1.45, high: 1.5 },
  colors: {
    concrete: [152, 158, 166], pile: [78, 70, 62], wood: [156, 114, 72], stone: [118, 122, 128], warehouse: [178, 182, 190], roof: [96, 104, 120],
    crane: [208, 66, 52], craneDark: [70, 76, 88], light: [250, 230, 150],
    containers: [[196, 70, 56], [52, 112, 176], [60, 144, 92], [214, 160, 54], [140, 150, 160], [170, 90, 140], [84, 150, 170], [222, 218, 206]],
  },
};

/** The port's frame at a coast point: the unit tangent along the shore (t), the unit normal out to sea (n), checked against the coast polygon (the sea is where a point is not inside it). */
export function shoreFrame(coast, at) {
  const near = nearestOnCoast(coast, at.x, at.z);
  const e = 1.5;
  const probe = (ax, az) => ({ x: near.x + ax * e, z: near.z + az * e });
  // the tangent: from the coast points either side of the nearest one
  const around = [-6, 6].map((d) => { for (let i = 0, j = coast.length - 1; i < coast.length; j = i++) { const a = coast[j], b = coast[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1, t = ((near.x - a.x) * dx + (near.z - a.z) * dz) / l2; if (t >= 0 && t <= 1 && Math.hypot(near.x - (a.x + t * dx), near.z - (a.z + t * dz)) < 1e-6) { const l = Math.sqrt(l2); return { x: dx / l * d, z: dz / l * d }; } } return { x: d, z: 0 }; });
  const tx = around[1].x - around[0].x, tz = around[1].z - around[0].z, tl = Math.hypot(tx, tz) || 1;
  const t = { x: tx / tl, z: tz / tl };
  let n = { x: -t.z, z: t.x };
  const p = probe(n.x, n.z);
  if (inside(coast, p.x, p.z)) n = { x: -n.x, z: -n.z }; // the normal points out to sea
  return { at: { x: near.x, z: near.z }, t, n, moved: near.d };
}

const box = (f, a, b, y, ha, hb, hy, color, alongN = false) => {
  // a box at `a` along the shore and `b` out to sea (negative: inland), y its middle height, half sizes along the shore (ha), out (hb) and up (hy)
  const x = f.at.x + f.t.x * a + f.n.x * b, z = f.at.z + f.t.z * a + f.n.z * b;
  const yaw = alongN ? Math.atan2(f.n.z, f.n.x) : Math.atan2(f.t.z, f.t.x);
  return [r2(x), r2(y), r2(z), r2(alongN ? hb : ha), r2(hy), r2(alongN ? ha : hb), r2(yaw), ...color];
};
const r2 = (n) => Math.round(n * 100) / 100;

/** A flat deck piece (a `jetty` road piece the bake lays): from a to b along the shore or out to sea, `width` wide. */
const deckPiece = (f, a0, b0, a1, b1, width) => ({
  a: { x: r2(f.at.x + f.t.x * a0 + f.n.x * b0), z: r2(f.at.z + f.t.z * a0 + f.n.z * b0) },
  b: { x: r2(f.at.x + f.t.x * a1 + f.n.x * b1), z: r2(f.at.z + f.t.z * a1 + f.n.z * b1) },
  width,
});

const cranes = (f, list, C, boxes) => {
  for (const a of list) {
    const reach = 15;
    for (const side of [-1, 1]) for (const lead of [-1, 1]) boxes.push(box(f, a + side * 4.2, PORT.over - 2 + lead * 1.8, 3.6, 0.28, 0.28, 3.6, C.crane)); // four legs on the quay's edge
    boxes.push(box(f, a, PORT.over - 2, 7.6, 5, 0.5, 0.45, C.crane)); // the portal beam across the legs
    boxes.push(box(f, a, PORT.over - 2 + reach / 2 - 4, 8.3, 0.55, reach / 2 + 2, 0.4, C.crane, true)); // the boom out over the water and back over the quay
    boxes.push(box(f, a, PORT.over - 8, 7.9, 1.0, 1.4, 0.7, C.craneDark)); // the machinery house
  }
};

const containerYard = (f, C, boxes, { rows, cols, from }) => {
  const c = PORT.container;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const h = 1 + ((r * 7 + k * 3) % 3); // 1 to 3 high
    const col = C.containers[(r * 5 + k * 3 + (r % 2)) % C.containers.length];
    for (let level = 0; level < h; level++) {
      boxes.push(box(f, (k - (cols - 1) / 2) * (c.len + 0.35), -(from + r * (c.wide + 0.9)), PORT.deck + c.high / 2 + level * c.high, c.len / 2, c.wide / 2, c.high / 2, col));
    }
  }
};

const building = (f, a, b, w, d, h, C, boxes) => {
  boxes.push(box(f, a, b, PORT.deck + h / 2, w / 2, d / 2, h / 2, C.warehouse));
  boxes.push(box(f, a, b, PORT.deck + h + 0.15, w / 2 + 0.2, d / 2 + 0.2, 0.15, C.roof));
};

/** The quay's body (over the shore and out over the water) and the piles under its water edge. */
const quay = (f, len, C, boxes) => {
  boxes.push(box(f, 0, (PORT.over - PORT.quayDepth) / 2, PORT.deck / 2 - 0.2, len / 2, (PORT.quayDepth + PORT.over) / 2, PORT.deck / 2 + 0.2, C.concrete));
  for (let a = -len / 2 + 2; a <= len / 2 - 2; a += 6) boxes.push(box(f, a, PORT.over - 0.4, -0.8, 0.35, 0.35, 0.9, C.pile));
};

const jetty = (f, a, len, width, C, boxes, decks) => {
  boxes.push(box(f, a, len / 2 + 2, PORT.deck / 2 - 0.1, width / 2, len / 2 + 2, PORT.deck / 2 + 0.1, C.wood, true));
  decks.push(deckPiece(f, a, -2, a, len, width));
  for (let b = 4; b <= len; b += 6) for (const s of [-1, 1]) boxes.push(box(f, a + s * (width / 2 - 0.3), b, -0.7, 0.28, 0.28, 0.8, C.pile));
};

/**
 * What stands at a port: { boxes: [[cx, cy, cz, hx, hy, hz, yaw, r, g, b]], decks: [{ a, b, width }] (flat deck pieces), frame }. `role`: 'shipping' (a quay, container yard, gantry cranes, a terminal), 'boats' (a breakwater,
 * floating docks, a small warehouse, a light), 'cruise' (a long pier, a terminal, a crane and a few containers), 'shipping-cruise' (the island's: a quay, two piers, a terminal and a few containers).
 */
export function portStructures(role, coast, at, o = PORT) {
  const f = shoreFrame(coast, at), C = o.colors, boxes = [], decks = [];
  if (role === 'shipping') {
    quay(f, 84, C, boxes);
    decks.push(deckPiece(f, -42, (o.over - o.quayDepth) / 2, 42, (o.over - o.quayDepth) / 2, o.quayDepth + o.over));
    cranes(f, [-24, 22], C, boxes);
    containerYard(f, C, boxes, { rows: 4, cols: 9, from: o.yard[0] });
    building(f, 0, -25, 22, 3.2, 3.4, C, boxes); // a gate house and offices at the back
  } else if (role === 'boats') {
    // a breakwater out from the shore at one end, with a light at its tip, floating docks with finger piers inside it, and a boat shed
    boxes.push(box(f, 22, 15, 0.45, 2.1, 15, 0.9, C.stone, true));
    boxes.push(box(f, 22, 28, 1.7, 0.45, 0.45, 1.3, C.light));
    for (let i = 0; i < 3; i++) {
      boxes.push(box(f, -16 + i * 11, 8, 0.1, 4.2, 0.9, 0.2, C.wood, true));
      for (const s of [-1, 1]) boxes.push(box(f, -16 + i * 11 + s * 4, 8, 0.15, 0.18, 4.0, 0.18, C.wood, true));
      decks.push(deckPiece(f, -16 + i * 11, -3, -16 + i * 11, 15, 2.4));
    }
    boxes.push(box(f, 0, -3, PORT.deck / 2 - 0.2, 26, 5, PORT.deck / 2 + 0.2, C.concrete));
    decks.push(deckPiece(f, -26, -3, 26, -3, 10));
    building(f, -12, -14, 14, 6, 3.2, C, boxes);
  } else if (role === 'cruise') {
    jetty(f, -6, 52, 8, C, boxes, decks);
    quay(f, 40, C, boxes);
    decks.push(deckPiece(f, -20, (o.over - o.quayDepth) / 2, 20, (o.over - o.quayDepth) / 2, o.quayDepth + o.over));
    building(f, 10, -17, 24, 8, 4.5, C, boxes);
    cranes(f, [-8], C, boxes);
    containerYard(f, C, boxes, { rows: 1, cols: 5, from: o.yard[0] });
  } else if (role === 'shipping-cruise') {
    quay(f, 60, C, boxes);
    decks.push(deckPiece(f, -30, (o.over - o.quayDepth) / 2, 30, (o.over - o.quayDepth) / 2, o.quayDepth + o.over));
    jetty(f, -34, 34, 6, C, boxes, decks);
    jetty(f, 36, 34, 6, C, boxes, decks);
    cranes(f, [-12], C, boxes);
    containerYard(f, C, boxes, { rows: 2, cols: 6, from: o.yard[0] });
    building(f, 12, -24, 20, 3.5, 3.8, C, boxes);
  }
  return { boxes, decks, frame: f };
}

// ---- where they stand
export const PORT_ROLES = { 'kingston-harbour': 'shipping', 'port-royal': 'boats', 'montego-bay': 'cruise', 'george-town': 'shipping-cruise' };
const LANDMASS = { 'kingston-harbour': 'mainland', 'port-royal': 'mainland', 'montego-bay': 'mainland', 'george-town': 'harbor-isle' };
const SHIFT = { 'port-royal': 78 }; // Port Royal's boat harbour starts this far along the shore from the Kingston port's point (the plan has them 14 units apart: on the real Palisadoes they are across the harbour mouth)

/** How far a box's outline is from the nearest road edge (a road is 6 wide): negative when it overlaps a road. The outline is sampled every 1.5 units. */
export const roadClearance = (b, roads) => {
  const [cx, , cz, hx, , hz, yaw] = b, ux = Math.cos(yaw), uz = Math.sin(yaw), wx = -Math.sin(yaw), wz = Math.cos(yaw);
  const pts = [];
  const nx = Math.max(1, Math.ceil((2 * hx) / 1.5)), nz = Math.max(1, Math.ceil((2 * hz) / 1.5));
  for (let i = 0; i <= nx; i++) for (const sz of [-1, 1]) { const a = -hx + (2 * hx * i) / nx; pts.push([cx + ux * a + wx * hz * sz, cz + uz * a + wz * hz * sz]); }
  for (let i = 0; i <= nz; i++) for (const sx of [-1, 1]) { const c = -hz + (2 * hz * i) / nz; pts.push([cx + ux * hx * sx + wx * c, cz + uz * hx * sx + wz * c]); }
  let best = Infinity;
  for (const [x, z] of pts) for (const s of roads) {
    const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - s.a.x) * dx + (z - s.a.z) * dz) / l2));
    best = Math.min(best, Math.hypot(x - (s.a.x + t * dx), z - (s.a.z + t * dz)) - 3);
  }
  return best;
};

/** What stands at each port the recipe turns on (`ids`), for a built world: [{ id, name, role, landmass, at, t, n, boxes, decks }]. */
export function buildPorts(world, ids = []) {
  if (!ids.length) return [];
  const plan = planOf(world);
  const field = world.rivers?.length ? riverField(world.rivers) : null;
  const roads = highwaySegments(world);
  const out = [];
  for (const id of ids) {
    const planned = plan.ports.find((p) => p.id === id) ?? plan.islandPorts.find((p) => p.id === id);
    if (!planned) throw new Error(`the recipe turns on a port (${id}) that is not in the plan`);
    const lm = world.landmasses.find((l) => l.id === LANDMASS[id]);
    const coast = lm.outline.points;
    const f0 = shoreFrame(coast, planned.atGame);
    // the planned point, then along the shore either way by 12 units at a time to the first place where nothing stands in a river or on a road and no other port is near
    let chosen = null;
    for (let k = 0; k <= 60 && !chosen; k++) {
      for (const sign of k === 0 ? [1] : [1, -1]) {
        const shift = (SHIFT[id] ?? 0) + sign * k * 12;
        const p = shoreFrame(coast, { x: f0.at.x + f0.t.x * shift, z: f0.at.z + f0.t.z * shift });
        const s = portStructures(PORT_ROLES[id], coast, p.at);
        const clear = s.boxes.every((b) => (!field || field.sdAt(b[0], b[2]) >= 1) && roadClearance(b, roads) > -0.2)
          && s.decks.every((d) => !field || [d.a, d.b].every((e) => field.sdAt(e.x, e.z) >= 1))
          && out.every((o) => o.landmass !== lm.id || Math.hypot(o.at.x - s.frame.at.x, o.at.z - s.frame.at.z) >= 60);
        if (clear) { chosen = { s, shift: Math.abs(shift) }; break; }
      }
    }
    if (!chosen) throw new Error(`there is no room for the port ${id} on the coast near its point`);
    const s = chosen.s;
    out.push({ id, name: planned.name, role: PORT_ROLES[id], planned: planned.role, landmass: lm.id, at: s.frame.at, t: s.frame.t, n: s.frame.n, boxes: s.boxes, decks: s.decks });
  }
  return out;
}
