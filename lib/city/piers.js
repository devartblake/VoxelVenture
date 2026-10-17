// Piers (design time, generated): a wooden pier into every lake and into the river beside each moored boat, so there is somewhere to tie up, to step off a
// boat, and to fish from on foot. Pure geometry, so it is tested in Node. The 3D drawing is apps/web/components/city/Piers.jsx; the avatar can walk on the deck
// (lib/sim/collision.js carves it out of the water), boats cannot sail through it, and the docking rules are in lib/sim/docking.js.
//
// A pier runs straight out from the bank (along x or z) into the water. All of it is axis-aligned:
//   axis 'x' | 'z'   the way it runs;  dir +1 | -1   from the land towards the water along that axis
//   x0 x1 z0 z1      the deck: from 0.8 on the land to `length` into the water, `width` wide
//   edge             where the bank is (the water's edge) along the axis
//   dock             where a boat ties up, beside the deck, facing along it: { x, z, yaw }
//   stand            where the avatar steps on and off: on the deck, beside the dock
//   fish             the spot at the far end to fish from, facing the water: { x, z, yaw }
export const PIER = { width: 1.6, land: 0.8, length: 6, dockOffset: 1.75, dockAt: 0.55 };

const r2 = (n) => Math.round(n * 100) / 100;
// the direction (sin yaw, cos yaw) of a unit vector along an axis
const yawOf = (axis, sign) => (axis === 'x' ? (sign > 0 ? Math.PI / 2 : -Math.PI / 2) : sign > 0 ? 0 : Math.PI);

// A pier from the bank at `edge` (the water's edge along `axis`), going into the water in direction `dir`, centred across at `at`.
export function makePier(id, waterId, { axis, dir, edge, at, length = PIER.length, boatSide = 0 }) {
  const w = PIER.width / 2;
  const from = edge - dir * PIER.land; // the land end
  const to = edge + dir * length; // the tip
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const deck = axis === 'x' ? { x0: lo, x1: hi, z0: at - w, z1: at + w } : { x0: at - w, x1: at + w, z0: lo, z1: hi };
  const along = (u, v) => (axis === 'x' ? { x: r2(u), z: r2(at + v) } : { x: r2(at + v), z: r2(u) }); // a point u along the axis, v across it
  const dockSide = boatSide ? -boatSide : 1; // the side the moored boat is not on
  const dockU = edge + dir * length * PIER.dockAt;
  const d = along(dockU, dockSide * PIER.dockOffset);
  const outYaw = yawOf(axis, dir);
  const s = along(dockU, 0);
  const f = along(to - dir * 0.45, 0);
  return {
    id,
    waterId,
    axis,
    dir,
    length,
    width: PIER.width,
    edge: r2(edge),
    at: r2(at),
    ...Object.fromEntries(Object.entries(deck).map(([k, v]) => [k, r2(v)])),
    tip: along(to, 0),
    start: along(from, 0),
    dock: { ...d, yaw: outYaw, side: dockSide },
    stand: s,
    fish: { ...f, yaw: outYaw },
  };
}

// A pier beside each boat's mooring: boats are moored at a lake's edge or on a river bank (lib/city/cityGenerator.js buildBoats), so the pier runs out
// from the bank next to the boat, on the side towards the middle of the water.
export function buildPiers({ lakes = [], rivers = [], boats = [] }) {
  const piers = [];
  const lakeById = Object.fromEntries(lakes.map((l) => [l.id, l]));
  const riverById = Object.fromEntries(rivers.map((v) => [v.id, v]));
  for (const b of boats) {
    const lake = lakeById[b.water];
    const river = riverById[b.water];
    if (lake) {
      // the boat sits 1.6 inside the west or east edge
      const west = b.x < lake.x;
      const edge = west ? lake.x - lake.rx : lake.x + lake.rx;
      const dir = west ? 1 : -1;
      const side = b.z >= lake.z ? -1 : 1; // towards the middle of the lake's length, so the pier stays on the water
      const room = Math.max(0.5, lake.rz - PIER.dockOffset - 1.1); // the dock beside the pier must be on the water too
      const at = Math.max(lake.z - room, Math.min(lake.z + room, b.z + side * 2.6));
      const toward = at <= lake.z ? 1 : -1; // the dock goes on the side towards the middle of the lake, where there is room
      piers.push(makePier(`pier-${piers.length + 1}`, lake.id, { axis: 'x', dir, edge, at, length: Math.min(PIER.length, lake.rx * 0.7), boatSide: -toward }));
    } else if (river) {
      const alongZ = river.axis === 'z';
      const width = alongZ ? river.x1 - river.x0 : river.z1 - river.z0;
      const mid = alongZ ? (river.x0 + river.x1) / 2 : (river.z0 + river.z1) / 2;
      const across = alongZ ? b.x : b.z;
      const lowBank = across < mid;
      const edge = lowBank ? (alongZ ? river.x0 : river.z0) : alongZ ? river.x1 : river.z1;
      const dir = lowBank ? 1 : -1;
      const along = alongZ ? b.z : b.x;
      piers.push(makePier(`pier-${piers.length + 1}`, river.id, { axis: alongZ ? 'x' : 'z', dir, edge, at: along + 2.6, length: Math.min(PIER.length, width * 0.5), boatSide: -1 }));
    }
  }
  return piers;
}

// The deck as a world rectangle, grown by `m`
export const deckRect = (p, m = 0) => ({ x0: p.x0 - m, x1: p.x1 + m, z0: p.z0 - m, z1: p.z1 + m });
