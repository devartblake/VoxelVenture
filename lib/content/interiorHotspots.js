// Hotspots inside a building: places the visitor can jump to, in the room's own frame (x across, z from the back wall to the front, y up, in metres).
// Always an overview, the entrance, the back wall and the two sides; and for a business with offers, one for each: the coupon, the video wall, the game
// cabinet and the visit reward, which also point at that part of the storefront panel (`section`).
export function hotspotsFor(plot, room, doorX) {
  const W = room.width;
  const D = room.depth;
  const spots = [
    { id: 'overview', label: 'Whole room', pos: null, section: null },
    { id: 'entrance', label: 'Entrance', pos: [Math.min(W - 1, Math.max(1, doorX ?? W / 2)), 1.2, D - 1.1], section: null },
    { id: 'back', label: 'Back wall', pos: [W / 2, 1.3, 1.0], section: null },
    { id: 'left', label: 'Left side', pos: [1.0, 1.2, D / 2], section: null },
    { id: 'right', label: 'Right side', pos: [W - 1.0, 1.2, D / 2], section: null },
  ];
  const brand = plot?.brand;
  if (brand?.coupon) spots.push({ id: 'offer', label: 'Offer desk', pos: [W * 0.3, 1.1, D * 0.68], section: 'offer', offer: true });
  if (brand?.video) spots.push({ id: 'video', label: 'Video wall', pos: [W / 2, 1.7, 0.8], section: 'video', offer: true });
  if (brand?.game) spots.push({ id: 'game', label: 'Game cabinet', pos: [W - 1.4, 1.1, D * 0.4], section: 'game', offer: true });
  if (brand?.quest) spots.push({ id: 'reward', label: 'Visit reward', pos: [W / 2, 1.1, D / 2], section: 'reward', offer: true });
  return spots;
}

// Where the camera stands to look at a hotspot: a few metres back towards the middle of the room, and a little above.
export function viewFor(spot, room, targetY = 0) {
  const [x, y, z] = spot.pos;
  const cx = room.width / 2;
  const cz = room.depth / 2;
  let dx = cx - x;
  let dz = cz - z;
  let len = Math.hypot(dx, dz);
  if (len < 1) {
    // a spot in the middle of the room: stand towards the front, looking back at it
    dx = 0;
    dz = 1;
    len = 1;
  }
  const back = Math.min(5, Math.max(3.2, len * 0.9));
  return { eye: [x + (dx / len) * back, targetY + y + 1.1, z + (dz / len) * back], look: [x, targetY + y, z] };
}
