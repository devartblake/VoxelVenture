// The mainland's river system, as a plan (docs/world/river_plan.md, docs/world/river_system.md): every river of the real Jamaica that the mainland (Jamaica's shape on its real longitude and latitude) can have, placed on the game
// map from its real coordinates, with its mouth snapped to the game's coast, a course from its source to its mouth, a width, a fall, the highways it crosses (each is a bridge) and the harbour or port it reaches. Nothing here
// builds a river: it is the design, so the rest (the channels, the water, the boats, the ports) is built from one list and checked against it. Pure (no three.js).
//
// The real data is Wikipedia's (read 2026-11-17): `basis: 'page'` is a coordinate the page gives for that point, `'approx'` a position estimated from the river's described course (the pages give one coordinate or none).
// A real river's mouth is moved to the nearest point of the GAME's coast (the game's coast is Jamaica's with a few per cent of variation), and the plan reports how far that was.
import { JAMAICA_RANGES } from './shapes';
import { SEA_LEVEL } from './datum';

export const METRE = 18 / 2177; // game units to a metre of real height (lib/world/shapes.js: Blue Mountain Peak is 18 units)

/**
 * The rivers: [lon, lat] points, in order from the source to the mouth (`via` between). `kind`: what the mouth is (`mouth`: an ordinary river mouth, `delta`: a marsh delta (the Black River's morasses), `harbour`: it enters a
 * harbour, `gorge`: a steep, narrow upper course). `srcM`: the source's real height in metres (the fall); `km`: the real length, when the page gives one.
 */
export const RIVERS = [
  { id: 'rio-minho', name: 'Rio Minho', coast: 'south', kind: 'mouth', km: 92.8, srcM: 706, basis: 'page', source: [-77.43, 18.17], via: [], mouth: [-77.2, 17.74], note: 'the longest river; flows SSW through May Pen (the first town), so the game\'s Willow Run is its middle course; the Mocho Mountains (706 m) are its source; it enters the sea at Portland Bight (Carlisle Bay)' },
  { id: 'milk-river', name: 'Milk River', coast: 'south', kind: 'mouth', srcM: 300, basis: 'approx', source: [-77.47, 17.97], via: [], mouth: [-77.45, 17.79], note: 'one page coordinate (17.833, -77.367); a short river of the southern plain, west of the Rio Minho (moved a little west so the two do not meet in the game, where the south coast is narrower)' },
  { id: 'black-river', name: 'Black River', coast: 'south', kind: 'delta', km: 53.4, srcM: 300, basis: 'page', source: [-77.683307, 18.189553], via: [[-77.78, 18.1]], mouth: [-77.846949, 18.021624], note: 'from the Cockpit Country (it runs underground first) through the Upper and Lower Morass (marsh and mangrove) to a shallow estuary at Black River town: the boating river' },
  { id: 'rio-cobre', name: 'Rio Cobre', coast: 'south', kind: 'harbour', km: 51, srcM: 500, basis: 'approx', source: [-77.05, 18.18], via: [[-77.0, 18.1], [-76.95, 17.99]], mouth: [-76.8597, 17.984], note: 'a gorge between Bog Walk and Spanish Town, dammed above Spanish Town, then into Hunts Bay at the head of Kingston Harbour (the page\'s own source coordinate, 17.590, -76.523, is out at sea and is not used)' },
  { id: 'hope-river', name: 'Hope River', coast: 'south', kind: 'delta', srcM: 900, basis: 'approx', source: [-76.7, 18.07], via: [], mouth: [-76.77, 17.95], note: 'down from the Blue Mountains to a delta at Kingston, on the east side of the harbour' },
  { id: 'yallahs-river', name: 'Yallahs River', coast: 'south', kind: 'delta', srcM: 1200, basis: 'approx', source: [-76.6, 18.05], via: [], mouth: [-76.57, 17.86], note: 'a heavy silt load from landslides in the Blue Mountains, so a wide, braided gravel bed and a delta' },
  { id: 'plantain-garden-river', name: 'Plantain Garden River', coast: 'east', kind: 'mouth', srcM: 900, basis: 'approx', source: [-76.4, 18.05], via: [], mouth: [-76.2, 17.93], note: 'the only major river that runs east and west rather than north and south' },
  { id: 'rio-grande', name: 'Rio Grande', coast: 'north', kind: 'gorge', srcM: 1100, basis: 'approx', source: [-76.58, 18.1], via: [], mouth: [-76.43, 18.17], note: 'one of the largest; rafting; through the Blue and John Crow Mountains to Port Antonio' },
  { id: 'wag-water-river', name: 'Wag Water River', coast: 'north', kind: 'mouth', srcM: 700, basis: 'approx', source: [-77.0, 18.17], via: [], mouth: [-76.78, 18.28], note: 'the Agualta River; dammed at Hermitage; to Annotto Bay' },
  { id: 'white-river', name: 'White River', coast: 'north', kind: 'mouth', srcM: 600, basis: 'page', source: [-77.06, 18.25], via: [], mouth: [-77.071613, 18.415674], note: 'a short river to Ocho Rios, with a bridge near its mouth' },
  { id: 'rio-bueno', name: 'Rio Bueno', coast: 'north', kind: 'mouth', srcM: 400, basis: 'approx', source: [-77.57, 18.3], via: [], mouth: [-77.57, 18.467], note: 'one page coordinate (18.467, -77.450); a short river of the north coast, moved 0.12 degrees west (140 units) so it does not run through the Voxel Speedway circuit, which stands on that line' },
  { id: 'martha-brae-river', name: 'Martha Brae River', coast: 'north', kind: 'mouth', srcM: 500, basis: 'approx', source: [-77.62, 18.3], via: [], mouth: [-77.65, 18.5], note: 'from the Cockpit Country to Falmouth; rafting' },
  { id: 'great-river', name: 'Great River', coast: 'north', kind: 'mouth', km: 92, srcM: 430, basis: 'page', source: [-77.8835, 18.207196], via: [], mouth: [-77.9923, 18.449568], note: 'from near Pisgah to Great River Bay, west of Montego Bay; rafting' },
  { id: 'cabarita-river', name: 'Cabarita River', coast: 'west', kind: 'mouth', srcM: 300, basis: 'approx', source: [-78.1, 18.3], via: [], mouth: [-78.15, 18.22], note: 'Westmoreland, towards Savanna-la-Mar' },
];

/** Ports and harbours the plan reaches (docs/world/river_system.md: a shipping port on both large landmasses, and a harbour for boats). */
export const PORTS = [
  { id: 'kingston-harbour', name: 'Kingston Harbour', role: 'shipping port', at: [-76.83, 17.965], basis: 'page', note: 'an almost landlocked natural harbour about 16 km by 3.2 km (the centre the page gives is 17.95, -76.80), closed by the Palisadoes spit; the Rio Cobre enters at its head (Hunts Bay); the container terminal. In the game the port stands at the head of the harbour inlet' },
  { id: 'port-royal', name: 'Port Royal', role: 'boat harbour', at: [-76.8411, 17.9375], basis: 'page', note: 'at the harbour mouth, at the end of the Palisadoes: a fishing and small-boat harbour' },
  { id: 'montego-bay', name: 'Montego Bay', role: 'cruise and cargo port', at: [-77.93, 18.47], basis: 'approx', note: 'the north-west; beside the Great River\'s mouth (not read: position approximate)' },
];

const solve3 = (rows, key) => {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
  for (const o of rows) { const v = [o.lon, o.lat, 1]; for (let i = 0; i < 3; i++) { b[i] += v[i] * o[key]; for (let j = 0; j < 3; j++) A[i][j] += v[i] * v[j]; } }
  const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det(A);
  return [0, 1, 2].map((c) => det(A.map((r, i) => r.map((v, j) => (j === c ? b[i] : v)))) / D);
};

/**
 * The map from real longitude and latitude to the game's x and z for a landmass built from the Jamaica template: the mountain ranges are in both (the template's lon/lat and the manifest's world coordinates), and the
 * map is a turn, a scale and a shift, so it is an affine fit to them. { at(lon, lat) -> { x, z }, worst } (`worst`: the largest error over the range points, in units).
 */
export function projectionFor(landmass, ranges = JAMAICA_RANGES) {
  const pairs = [];
  for (const r of ranges) {
    const w = (landmass.features?.ranges ?? []).find((x) => x.name === r.name);
    if (w && w.points.length === r.line.length) r.line.forEach(([lon, lat], i) => pairs.push({ lon, lat, x: w.points[i].x, z: w.points[i].z }));
  }
  if (pairs.length < 6) throw new Error('not enough mountain points to place the real map on the game map');
  const X = solve3(pairs, 'x'), Z = solve3(pairs, 'z');
  const at = (lon, lat) => ({ x: X[0] * lon + X[1] * lat + X[2], z: Z[0] * lon + Z[1] * lat + Z[2] });
  let worst = 0;
  for (const o of pairs) { const p = at(o.lon, o.lat); worst = Math.max(worst, Math.hypot(p.x - o.x, p.z - o.z)); }
  return { at, worst, pairs: pairs.length };
}

// ---- the coast: inside, and the nearest point of it
export const inside = (poly, x, z) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
};
/** The nearest point of the coast to (x, z): { x, z, d }. */
export function nearestOnCoast(poly, x, z) {
  let best = { x: 0, z: 0, d: Infinity };
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const px = a.x + t * dx, pz = a.z + t * dz, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { x: px, z: pz, d };
  }
  return best;
}

const hashOf = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

/** A Catmull-Rom curve through the points, sampled about every `step` units: [{ x, z }]. */
export function smoothCurve(pts, step = 12) {
  if (pts.length < 3) {
    const [a, b] = pts, n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n }));
  }
  const P = [pts[0], ...pts, pts[pts.length - 1]], out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export const lengthOf = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0), 0);

/** Do the segments a-b and c-d cross? (the point, or null) */
export function crossing(a, b, c, d) {
  const r = { x: b.x - a.x, z: b.z - a.z }, s = { x: d.x - c.x, z: d.z - c.z };
  const den = r.x * s.z - r.z * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / den, u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + t * r.x, z: a.z + t * r.z } : null;
}

/** The width of a river at a point `t` (0 source, 1 mouth) of its course: narrow at the source, widening to the mouth, which flares. Game units. */
export function widthAt(river, t) {
  const L = river.length, base = Math.max(8, Math.min(18, 6 + L / 60));
  const flare = river.kind === 'delta' ? 2.2 : river.kind === 'harbour' ? 1.8 : 1.5;
  const body = 6 + (base - 6) * Math.pow(Math.max(0, Math.min(1, t)), 0.8);
  const w = body * (1 + (flare - 1) * Math.pow(Math.max(0, (t - 0.88) / 0.12), 2)) * (river.kind === 'gorge' ? 0.7 : 1);
  // through the first town the river is the town's own (its width, the trench in the slab): the baked river meets it at that width and eases to its own over 0.15 of its length
  if (river.townWidth && river.townT) {
    const [t0, t1] = river.townT, d = t < t0 ? t0 - t : t > t1 ? t - t1 : 0, k = Math.max(0, Math.min(1, d / 0.15)), s = k * k * (3 - 2 * k);
    return river.townWidth * (1 - s) + w * s;
  }
  return w;
}

/**
 * The surface of a river at a point `t` (0 source, 1 mouth), in game units: the sea at the mouth, rising upstream on a concave profile (steep near the source) to its source height, but never more than `limit` over the
 * sea. A lowland river's surface stays at the sea's until the hills; this is the height of the WATER, which the channel is cut under (the ground there is flat at the datum on the plain).
 */
export function surfaceAt(river, t, limit = 4) {
  const top = Math.min(limit, river.srcM * METRE);
  return SEA_LEVEL + (top - 0) * Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
}

/**
 * The plan: for each river its game-map course, mouth (snapped), length, width, fall and what it crosses, and the ports; plus `problems` (a source outside the land, a mouth more than 60 units from the coast, rivers that cross).
 * `manifest` is the baked manifest, `highways` its highway pieces ([{ id, kind, a, b }], from the chunks), `townRiver` the first town's river rectangle ({ x0, x1, z0, z1 }: Willow Run).
 */
export function planRivers({ manifest, highways = [], townRiver = null }) {
  const main = manifest.landmasses.find((l) => l.id === 'mainland');
  const proj = projectionFor(main);
  const coast = main.coast.points;
  const problems = [];
  const rivers = RIVERS.map((def) => {
    const src = proj.at(...def.source);
    const mouth0 = proj.at(...def.mouth);
    const snapped = nearestOnCoast(coast, mouth0.x, mouth0.z);
    // a mouth just inside the coast (the river's last point is on the land, its mouth the coast)
    const mouth = { x: snapped.x, z: snapped.z };
    let pts = [src, ...def.via.map((v) => proj.at(...v)), mouth];
    // the Rio Minho goes through the first town: Willow Run is its middle course
    if (def.id === 'rio-minho' && townRiver) {
      const rx = (townRiver.x0 + townRiver.x1) / 2;
      // south of the town the river bends west, clear of the south spur (the river drive's road, which runs on down x = -61 beside it)
      const sm = nearestOnCoast(coast, rx - 22, townRiver.z1 + 165);
      pts = [src, { x: rx - 62, z: townRiver.z0 - 42 }, { x: rx - 22, z: townRiver.z0 - 14 }, { x: rx, z: townRiver.z0 }, { x: rx, z: townRiver.z1 }, { x: rx - 26, z: townRiver.z1 + 34 }, { x: rx - 30, z: townRiver.z1 + 100 }, { x: sm.x, z: sm.z }];
    }
    let course = smoothCurve(pts);
    // a gentle, seeded meander on the plain parts of the course (not through the town, not at the ends)
    const amp = def.kind === 'gorge' ? 3 : def.kind === 'delta' ? 9 : 6, ph = hashOf(def.id) * 6.28;
    course = course.map((p, i) => {
      if (i === 0 || i === course.length - 1) return p;
      const prev = course[i - 1], next = course[i + 1], dx = next.x - prev.x, dz = next.z - prev.z, len = Math.hypot(dx, dz) || 1;
      // no meander in the town, and none for 80 units either side of it (the river drive runs beside the river there: the meander eases in)
      const nearTown = def.id === 'rio-minho' && townRiver ? Math.min(1, Math.max(0, p.z < townRiver.z0 ? townRiver.z0 - p.z : p.z > townRiver.z1 ? p.z - townRiver.z1 : 0) / 80) * (p.z >= townRiver.z0 && p.z <= townRiver.z1 ? 0 : 1) : 1;
      const k = nearTown * amp * Math.sin(i * 0.35 + ph) * Math.min(1, i / 8, (course.length - 1 - i) / 8);
      return { x: p.x + (-dz / len) * k, z: p.z + (dx / len) * k };
    });
    const length = lengthOf(course);
    const river = { ...def, sourceAt: src, mouthAt: course[course.length - 1], mouthMoved: Math.round(snapped.d), course, length: Math.round(length) };
    if (def.id === 'rio-minho' && townRiver) { // where the course is in the town, as a fraction of its length: the width there is the town river's
      let run = 0; const cum = course.map((p, i) => (i ? (run += Math.hypot(p.x - course[i - 1].x, p.z - course[i - 1].z)) : 0));
      const a = course.findIndex((p) => p.z >= townRiver.z0), b = course.findIndex((p) => p.z > townRiver.z1);
      river.townT = [cum[a] / run, cum[b] / run];
      river.townWidth = townRiver.x1 - townRiver.x0;
    }
    river.width = { source: +widthAt(river, 0).toFixed(1), mid: +widthAt(river, 0.5).toFixed(1), mouth: +widthAt(river, 1).toFixed(1) };
    river.fall = +(Math.min(4, def.srcM * METRE) - SEA_LEVEL).toFixed(2); // from the sea at the mouth to the source's height
    river.sourceInLand = inside(coast, src.x, src.z);
    // the highways each river crosses (each crossing is a bridge)
    river.crosses = [];
    for (const h of highways) for (let i = 1; i < course.length; i++) {
      const c = crossing(course[i - 1], course[i], h.a, h.b);
      if (c) { river.crosses.push({ highway: h.id, kind: h.kind, x: +c.x.toFixed(1), z: +c.z.toFixed(1) }); break; }
    }
    if (!river.sourceInLand) problems.push(`${def.name}: its source is not on the mainland`);
    if (snapped.d > (def.basis === 'page' ? 60 : 100)) problems.push(`${def.name}: its real mouth is ${Math.round(snapped.d)} units from the game's coast`);
    return river;
  });
  // rivers that cross one another
  for (let a = 0; a < rivers.length; a++) for (let b = a + 1; b < rivers.length; b++) {
    outer: for (let i = 1; i < rivers[a].course.length; i++) for (let j = 1; j < rivers[b].course.length; j++) {
      if (crossing(rivers[a].course[i - 1], rivers[a].course[i], rivers[b].course[j - 1], rivers[b].course[j])) { problems.push(`${rivers[a].name} crosses ${rivers[b].name}`); break outer; }
    }
  }
  const ports = PORTS.map((p) => {
    const at = proj.at(...p.at), n = nearestOnCoast(coast, at.x, at.z);
    return { ...p, atGame: { x: +n.x.toFixed(1), z: +n.z.toFixed(1) }, movedToCoast: Math.round(n.d) };
  });
  // Harbor Isle's shipping port is the harbour it already has (the manifest's `harbour`: a quay and three piers on the west coast, facing the mainland)
  const isle = manifest.landmasses.find((l) => l.id === 'harbor-isle')?.features?.harbour;
  const islandPorts = isle ? [{ id: 'george-town', name: 'George Town (Harbor Isle)', role: 'shipping port and cruise anchorage', atGame: isle.quay, piers: isle.piers.length, note: 'the island existing harbour: a quay and three piers on the west coast; the real George Town takes cargo at the Port Authority quay and cruise ships at anchor, tendered ashore' }] : [];
  return { projection: { worst: +proj.worst.toFixed(3), pairs: proj.pairs }, rivers, ports, islandPorts, problems };
}
