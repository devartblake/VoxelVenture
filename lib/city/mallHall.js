// The walk-through hall of a mega mall: the mall is hollow. You go in at the door on the front, walk the concourse, and the stores' doors are on its
// two long sides. Pure (no three.js), so the walls (collision), the drawing and the tests all use the same numbers.
//
// A mall's own frame ("local"): x runs along its width, z towards the front (the door is at z = facing * d / 2); the mall is turned by `yaw`:
//   world = (mall.x + x cos yaw + z sin yaw,  mall.z - x sin yaw + z cos yaw)     (the same turn as the group in apps/web/components/city/Malls.jsx)
export const HALL = { wall: 0.3, door: 2.1, storeDoorInset: 0.9, sideMargin: 3.2 };

export function toWorld(mall, x, z) {
  const c = Math.cos(mall.yaw);
  const s = Math.sin(mall.yaw);
  return { x: mall.x + x * c + z * s, z: mall.z - x * s + z * c };
}
export function toLocal(mall, wx, wz) {
  const dx = wx - mall.x;
  const dz = wz - mall.z;
  const c = Math.cos(mall.yaw);
  const s = Math.sin(mall.yaw);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

// Is the point inside the mall's footprint (a little inside, so the doorway counts as outside)?
export const insideHall = (mall, wx, wz, margin = 0) => {
  const l = toLocal(mall, wx, wz);
  return Math.abs(l.x) < mall.w / 2 - margin && Math.abs(l.z) < mall.d / 2 - margin;
};

// The walls as turned boxes in world space: { cx, cz, hw, hd } (turned by the mall's yaw): the back wall, two side walls, and the front wall in two
// pieces with the doorway between them.
export function hallWalls(mall) {
  const { w, d, facing: f } = mall;
  const t = HALL.wall;
  const out = [];
  const box = (lx, lz, hw, hd) => out.push({ ...toWorld(mall, lx, lz), hw, hd });
  box(0, -f * (d / 2 - t), w / 2, t); // back
  for (const s of [-1, 1]) box(s * (w / 2 - t), 0, t, d / 2); // sides
  const seg = (w / 2 - HALL.door) / 2;
  for (const s of [-1, 1]) box(s * (HALL.door + seg), f * (d / 2 - t), seg, t); // front, with the doorway between
  return out;
}

// Where each store's door is: on the inside of a long side, the stores split between the two sides and spread from the back to the front.
// `local` is its place in the mall's frame, `x, z` its world place, `out` the way from the wall into the hall (local x).
export function storeDoors(mall) {
  const { w, d, facing: f, stores } = mall;
  const n = stores.length;
  const perSide = Math.ceil(n / 2);
  const span = d - 2 * HALL.sideMargin;
  return stores.map((store, k) => {
    const side = k < perSide ? -1 : 1;
    const idx = side === -1 ? k : k - perSide;
    const count = side === -1 ? perSide : n - perSide;
    const along = count > 1 ? idx / (count - 1) : 0.5;
    const lz = f * (-span / 2 + along * span);
    const lx = side * (w / 2 - HALL.wall - 0.05);
    return { store, side, local: { x: lx, z: lz }, ...toWorld(mall, lx, lz), standAt: toWorld(mall, side * (w / 2 - HALL.wall - HALL.storeDoorInset), lz) };
  });
}
