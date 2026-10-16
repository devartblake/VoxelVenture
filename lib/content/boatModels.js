// The boats' 3D models (Kenney Watercraft Kit, CC0; public/models/kenney/watercraft). Each kind of boat in `layout.boats` has a model, a scale (the models are about
// 2.4 to 3.9 long; the game's boats are about 2.2 to 3.2), where the avatar sits (in the boat's own frame: x right, y up, z forward; y is above the water) and how
// far ahead of the middle the fishing rod reaches (`bow`), and how far the hull sits down in the water (`sink`). Until a model has loaded (or with ?models=0) the old box boat is drawn.
export const BOAT_KINDS = ['rowboat', 'rowboat-large', 'fishing'];
export const BOAT_MODELS = {
  rowboat: { id: 'watercraft/boat-row-small', scale: 0.95, seat: [0, 0.27, -0.05], bow: 1.25, sink: 0.1 },
  'rowboat-large': { id: 'watercraft/boat-row-large', scale: 0.9, seat: [0, 0.3, -0.12], bow: 1.3, sink: 0.1 },
  fishing: { id: 'watercraft/boat-fishing-small', scale: 0.8, seat: [0, 0.36, 0.78], bow: 1.7, sink: 0.2 },
  sailboat: { id: 'watercraft/boat-sail-a', scale: 0.8, seat: [0, 0.4, 0.9], bow: 1.8, sink: 0.2 },
};
export const boatModel = (kind) => BOAT_MODELS[kind] ?? BOAT_MODELS.rowboat;
// Where the avatar sits in the world, for a boat at (x, z) facing `yaw`: the seat turned by the boat's heading.
export function seatWorld(v) {
  const m = boatModel(v.boatKind);
  const [sx, , sz] = m.seat;
  const s = Math.sin(v.yaw);
  const c = Math.cos(v.yaw);
  return { x: v.x + sx * c + sz * s, y: m.seat[1], z: v.z - sx * s + sz * c };
}
