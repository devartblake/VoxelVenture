// Driving, sailing and fishing: the pure rules (no React, no three.js), so they can be tested on their own.
//   - a vehicle is { kind: 'car' | 'boat', x, z, yaw, speed } in city coordinates (yaw: it points along (sin yaw, cos yaw))
//   - a car drives anywhere the avatar could walk (buildings, water and the other solids stop it)
//   - a boat sails only on water: the lakes and the river
//   - from a boat you can fish: cast, wait for a bite, reel in before the fish gets away
export const VEHICLES = {
  car: { label: 'car', maxSpeed: 7, reverseSpeed: 2.6, accel: 8, brake: 16, drag: 2.5, turnRate: 2.3, radius: 0.5, scale: 2 },
  boat: { label: 'boat', maxSpeed: 3.6, reverseSpeed: 1.2, accel: 2.4, brake: 3, drag: 0.9, turnRate: 1.5, radius: 0.5, scale: 1.6 },
};

// ---- water ---------------------------------------------------------------------------------------------------------
// The rectangles of water a boat can be on: each lake, and the river (kept to the land).
export function waterRects(layout) {
  const out = (layout.lakes ?? []).map((l) => ({ id: l.id, x0: l.x - l.rx, x1: l.x + l.rx, z0: l.z - l.rz, z1: l.z + l.rz }));
  for (const r of layout.rivers ?? []) {
    const land = layout.land;
    out.push({
      id: r.id,
      x0: Math.max(r.x0, land?.x0 ?? r.x0),
      x1: Math.min(r.x1, land?.x1 ?? r.x1),
      z0: Math.max(r.z0, land?.z0 ?? r.z0),
      z1: Math.min(r.z1, land?.z1 ?? r.z1),
    });
  }
  return out;
}
export const inWater = (x, z, rects, margin = 0) => rects.some((r) => x > r.x0 + margin && x < r.x1 - margin && z > r.z0 + margin && z < r.z1 - margin);

// ---- driving -------------------------------------------------------------------------------------------------------
// One step of a vehicle. `input` is { throttle: -1..1 (forward / back), steer: -1..1 (right / left) }. `canMove(x, z, r)` says
// whether a vehicle of radius r may be at (x, z). Arcade handling: the vehicle speeds up and slows down smoothly, turns
// only while it moves (a boat a little at a standstill), and slides along whatever it hits. Returns the distance moved.
export function stepVehicle(v, input, dt, canMove) {
  const spec = VEHICLES[v.kind];
  const throttle = Math.max(-1, Math.min(1, input.throttle ?? 0));
  const steer = Math.max(-1, Math.min(1, input.steer ?? 0));
  const target = throttle >= 0 ? throttle * spec.maxSpeed : throttle * spec.reverseSpeed;
  const braking = (target > 0 && v.speed < 0) || (target < 0 && v.speed > 0) || (target === 0 && Math.abs(v.speed) > 0);
  const rate = target === 0 ? spec.drag : braking ? spec.brake : spec.accel;
  const diff = target - v.speed;
  v.speed += Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
  // steering: a car needs to be moving; a boat turns a little even when still
  const grip = v.kind === 'boat' ? 0.3 + 0.7 * Math.min(1, Math.abs(v.speed) / spec.maxSpeed) : Math.min(1, Math.abs(v.speed) / 2.5);
  v.yaw -= steer * spec.turnRate * grip * dt * (v.speed < 0 ? -1 : 1);
  const dx = Math.sin(v.yaw) * v.speed * dt;
  const dz = Math.cos(v.yaw) * v.speed * dt;
  let moved = 0;
  // one axis at a time, so it slides along a wall
  if (canMove(v.x + dx, v.z, spec.radius)) {
    v.x += dx;
    moved += Math.abs(dx);
  }
  if (canMove(v.x, v.z + dz, spec.radius)) {
    v.z += dz;
    moved += Math.abs(dz);
  }
  if (moved < Math.abs(v.speed) * dt * 0.5) v.speed *= 0.4; // ran into something
  return moved;
}

// ---- fishing -------------------------------------------------------------------------------------------------------
export const FISH = [
  { id: 'minnow', name: 'Minnow', gold: 2, weight: 28 },
  { id: 'perch', name: 'Perch', gold: 4, weight: 24 },
  { id: 'trout', name: 'Trout', gold: 7, weight: 18 },
  { id: 'pike', name: 'Pike', gold: 12, weight: 9 },
  { id: 'eel', name: 'Eel', gold: 15, weight: 5 },
  { id: 'koi', name: 'Golden koi', gold: 40, weight: 1.5 },
  { id: 'boot', name: 'Old boot', gold: 0, weight: 8 },
];
export const FISH_DAILY_CAP = 120; // Gold a day from fishing
export const FISHING = { waitMin: 3, waitMax: 9, biteWindow: 2.2, maxBoatSpeed: 0.7 };
export const FISH_BY_ID = Object.fromEntries(FISH.map((f) => [f.id, f]));

export const pickFish = (rand) => {
  const total = FISH.reduce((a, f) => a + f.weight, 0);
  let roll = rand() * total;
  for (const f of FISH) {
    roll -= f.weight;
    if (roll <= 0) return f;
  }
  return FISH[0];
};

// The line's state: { phase: 'idle' | 'waiting' | 'bite', timer, fish }.
export const newLine = () => ({ phase: 'idle', timer: 0, fish: null });

// Press the fishing button: cast if idle; reel in on a bite (returns the fish); pull up an empty line otherwise.
export function pullLine(line, rand) {
  if (line.phase === 'idle') {
    line.phase = 'waiting';
    line.timer = FISHING.waitMin + rand() * (FISHING.waitMax - FISHING.waitMin);
    line.fish = pickFish(rand);
    return { event: 'cast' };
  }
  if (line.phase === 'bite') {
    const fish = line.fish;
    Object.assign(line, newLine());
    return { event: 'caught', fish };
  }
  Object.assign(line, newLine());
  return { event: 'reeled-empty' };
}

// Time passes: a waiting line gets a bite; a bite that is not reeled in gets away.
export function tickLine(line, dt) {
  if (line.phase === 'waiting') {
    line.timer -= dt;
    if (line.timer <= 0) {
      line.phase = 'bite';
      line.timer = FISHING.biteWindow;
      return 'bite';
    }
  } else if (line.phase === 'bite') {
    line.timer -= dt;
    if (line.timer <= 0) {
      Object.assign(line, newLine());
      return 'escaped';
    }
  }
  return null;
}
