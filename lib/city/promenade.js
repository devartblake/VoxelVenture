// The riverwalk and the pier landings (design time, generated): a paved walking area for avatars between the river drive and the water, with benches facing the
// river and lamps along the drive side, broken where a road crosses it, and a paved landing where each pier meets the bank. Cars never come here: the drive
// has no lots on the river side any more (see `riverSide`), so the strip belongs to people. Pure geometry, so it is tested in Node; the 3D drawing is
// apps/web/components/city/Promenade.jsx and the benches and lamps are solid in lib/sim/collision.js (the paving is walkable).
//
//   promenade { id, riverId, axis, rect, benches: [{ x, z, yaw }], lamps: [{ x, z }] }   one paved stretch
//   landing   { x0 x1 z0 z1 }                                                         the paved ground where a pier meets the bank (kept on the pier as `plaza`)
export const WALK = {
  bankGap: 1.4, // from the water's edge to the paving (the sandy bank is 1.2)
  driveGap: 1.9, // from the drive's middle line to the paving (its corridor is 1.4, then a kerb)
  minLength: 8, // a stretch shorter than this is not built
  crossGap: 0.7, // clear of a road that crosses it, beside that road's corridor
  benchEvery: 13,
  lampEvery: 9.5,
};

// Which side of the river drive is the river: -1 or +1 across the drive (the side of its centre line), for a drive of `axis` at `center`.
export function riverSide(river, drive) {
  const mid = drive.axis === 'z' ? (river.x0 + river.x1) / 2 : (river.z0 + river.z1) / 2;
  return mid < drive.center ? -1 : 1;
}

const overlapsStrip = (r, s) => Math.min(r.x1, s.x1) - Math.max(r.x0, s.x0) > 0.02 && Math.min(r.z1, s.z1) - Math.max(r.z0, s.z0) > 0.02;
const r2 = (n) => Math.round(n * 100) / 100;

// The strips between the river drive and the water. `roads`: every road (the drive and its crossings are among them); `blockers`: rectangles to keep clear of
// (billboards and anything else that stands there); `land`: the land's extent along the river.
export function planPromenades({ river, drive, roads, blockers = [], piers = [] }) {
  const alongZ = drive.axis === 'z';
  const side = riverSide(river, drive); // the river is on this side of the drive
  const bank = alongZ ? (side < 0 ? river.x1 : river.x0) : side < 0 ? river.z1 : river.z0; // the river's edge facing the drive
  const near = bank - side * WALK.bankGap; // paving starts here (beside the water, towards the drive)
  const far = drive.center + side * WALK.driveGap; // and ends here (beside the drive)
  const lo = Math.min(near, far);
  const hi = Math.max(near, far);
  if (hi - lo < 1) return { promenades: [], landings: [] };
  const from = drive.from + 4;
  const to = drive.to - 4;
  // what cuts the strip along its length: roads that cross it, the blockers, and the piers' decks (the landing is paved separately)
  const cuts = [];
  const strip = (a, b) => (alongZ ? { x0: lo, x1: hi, z0: a, z1: b } : { x0: a, x1: b, z0: lo, z1: hi });
  const probe = strip(from, to);
  for (const r of roads) {
    if (r === drive || r.axis === drive.axis) continue; // roads along the strip are not crossings
    const c = r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - 1.4, z1: r.center + 1.4 } : { x0: r.center - 1.4, x1: r.center + 1.4, z0: r.from, z1: r.to };
    if (overlapsStrip(c, probe)) cuts.push(alongZ ? [c.z0 - WALK.crossGap, c.z1 + WALK.crossGap] : [c.x0 - WALK.crossGap, c.x1 + WALK.crossGap]);
  }
  for (const b of blockers) if (overlapsStrip(b, probe)) cuts.push(alongZ ? [b.z0 - 0.3, b.z1 + 0.3] : [b.x0 - 0.3, b.x1 + 0.3]);
  cuts.sort((p, q) => p[0] - q[0]);
  const pieces = [];
  let cursor = from;
  for (const [a, b] of cuts) {
    if (a > cursor) pieces.push([cursor, Math.min(a, to)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < to) pieces.push([cursor, to]);
  const promenades = [];
  for (const [a, b] of pieces) {
    if (b - a < WALK.minLength) continue;
    const rect = strip(a, b);
    // benches on the water side of the paving, facing the water; lamps on the drive side
    const benches = [];
    const lamps = [];
    const waterEdge = near - side * 0.55; // a bench is this far in from the water's side of the paving (it sits 0.55 in)
    const driveEdge = far + side * 0.35;
    const lampAt = (u) => (alongZ ? { x: r2(driveEdge), z: r2(u) } : { x: r2(u), z: r2(driveEdge) });
    const benchAt = (u) => (alongZ ? { x: r2(waterEdge), z: r2(u), yaw: side < 0 ? -Math.PI / 2 : Math.PI / 2 } : { x: r2(u), z: r2(waterEdge), yaw: side < 0 ? Math.PI : 0 });
    for (let u = a + 5; u < b - 2.5; u += WALK.benchEvery) benches.push(benchAt(u));
    for (let u = a + 2.5; u < b - 1; u += WALK.lampEvery) lamps.push(lampAt(u));
    promenades.push({ id: `walk-${river.id}-${promenades.length + 1}`, riverId: river.id, axis: drive.axis, rect: Object.fromEntries(Object.entries(rect).map(([k, v]) => [k, r2(v)])), benches, lamps });
  }
  return { promenades, landings: [] };
}

// A paved landing where a pier meets the bank: it spans from the water's edge inland `depth`, `width` across, centred on the pier. On the river drive's side it
// reaches the paving; elsewhere it is a small square with the pier's own bench and lamp.
export function landingFor(pier, { depth = 3.2, width = 3.6 } = {}) {
  const w = width / 2;
  const inland = -pier.dir; // the direction from the water to the land along the pier's axis
  const a = pier.edge - inland * 0; // at the water's edge
  const b = pier.edge + inland * depth;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const rect = pier.axis === 'x' ? { x0: lo, x1: hi, z0: pier.at - w, z1: pier.at + w } : { x0: pier.at - w, x1: pier.at + w, z0: lo, z1: hi };
  return Object.fromEntries(Object.entries(rect).map(([k, v]) => [k, r2(v)]));
}
