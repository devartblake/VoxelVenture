import { create } from 'zustand';
import { avatarState } from '../sim/avatarState';
import { isBlocked, resolveOverlap } from '../sim/collision';
import { inWater, newLine, pullLine } from '../sim/vehicles';
import { nearestPier, startDocking } from '../sim/docking';
import { deckRect } from '../city/piers';

// The vehicles the player has taken: which one they are in (avatarState.vehicle, which changes every frame), the cars they
// left parked, and where they left the boats. The things the 3D side shares with the rest are in `fleetRefs`
// (plain mutable data: they are not React state).
export const fleetRefs = {
  sim: null, // the traffic simulation: its cars can be taken
  collision: null, // the walking collision map (rects, bounds)
  water: [], // the water a boat can sail on
  line: newLine(), // the fishing line of the boat the player is in (or of the pier they fish from)
  piers: [], // the piers: where a boat docks, where you step off, where you fish from
  dock: null, // a boat sailing itself to a pier: { pier, route, i, align, ... } (lib/sim/docking.js)
  pierFishing: null, // the pier the player is fishing from on foot: { pier }
};

const KEY = 'voxelventure-parked';
// The cars left parked are remembered with the city's seed, so they are still there after a reload (and not in a different city).
function saveParked(seed, parked) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ seed, parked }));
  } catch {
    /* not remembered */
  }
}

export const useFleet = create((set, get) => ({
  parked: [], // cars the player left: { id, x, z, yaw, color }
  moved: {}, // boat id -> { x, z, yaw } where the player left it
  hud: null, // what the on-screen panel shows while driving or sailing: { kind, speed, phase }
  nextId: 1,
  seed: null,
  hydrate: (seed) => {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch {
      /* ignore */
    }
    const ok = saved && saved.seed === seed && Array.isArray(saved.parked);
    set({ seed, parked: ok ? saved.parked.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z)) : [] });
  },

  // Take a car off the road (the traffic simulation drops it and makes another later).
  enterCar: (car) => {
    if (avatarState.vehicle) return false;
    const sim = fleetRefs.sim;
    const i = sim ? sim.cars.indexOf(car) : -1;
    if (i >= 0) sim.cars.splice(i, 1);
    start({ kind: 'car', id: `car-${car.id}`, x: car.x, z: car.z, yaw: car.yaw, speed: Math.max(0, car.v ?? 0), color: car.color });
    return true;
  },
  enterParked: (id) => {
    const car = get().parked.find((p) => p.id === id);
    if (!car || avatarState.vehicle) return false;
    set({ parked: get().parked.filter((p) => p.id !== id) });
    saveParked(get().seed, get().parked);
    start({ kind: 'car', id: car.id, x: car.x, z: car.z, yaw: car.yaw, speed: 0, color: car.color });
    return true;
  },
  enterBoat: (boat) => {
    if (avatarState.vehicle) return false;
    const at = get().moved[boat.id] ?? boat;
    start({ kind: 'boat', id: boat.id, boatKind: boat.kind, x: at.x, z: at.z, yaw: at.yaw, speed: 0, color: boat.color });
    return true;
  },

  // Get out. A car is left where it stands, and you step out beside it. From a boat you step onto the shore or a pier if one is within reach;
  // if not, the boat sails itself to the nearest pier and docks, and you step off there (see finishDock). Returns true when you are out, 'docking'
  // when the boat has set off for a pier, and false when you can't get out (and there is no pier to go to).
  exit: () => {
    const v = avatarState.vehicle;
    const map = fleetRefs.collision;
    if (!v || !map) return false;
    if (fleetRefs.dock) return 'docking'; // already on its way
    const spot = freeSpotAround(v, map, v.kind === 'boat');
    if (!spot) {
      if (v.kind !== 'boat') return false;
      const pier = nearestPier(v, fleetRefs.piers, fleetRefs.water);
      if (!pier) return false;
      fleetRefs.line = newLine(); // reel the line in
      fleetRefs.dock = startDocking(v, pier);
      return 'docking';
    }
    stepOut(v, spot, set, get);
    return true;
  },
  // The boat has come alongside its pier and stopped: step onto the deck and leave the boat tied up where it is.
  finishDock: () => {
    const v = avatarState.vehicle;
    const dock = fleetRefs.dock;
    fleetRefs.dock = null;
    if (!v) return false;
    const map = fleetRefs.collision;
    const stand = dock?.pier?.stand;
    let spot = stand && map && !isBlocked(stand.x, stand.z, map.rects) ? { x: stand.x, z: stand.z } : map ? freeSpotAround(v, map, true) : null;
    if (!spot) spot = stand ?? { x: v.x, z: v.z };
    stepOut(v, spot, set, get);
    return true;
  },
  // Stop sailing to the pier (the player has taken the wheel, or it cannot get there).
  cancelDock: () => {
    fleetRefs.dock = null;
  },
  // Fish from the end of a pier on foot: cast, wait for a bite, reel in. Standing at the fishing spot is checked by the caller (apps/web/components/city/Avatar.jsx).
  pierFish: (pier, rand = Math.random) => {
    if (avatarState.vehicle) return null;
    fleetRefs.pierFishing = { pier };
    return pullLine(fleetRefs.line, rand);
  },
  stopPierFishing: () => {
    fleetRefs.pierFishing = null;
    fleetRefs.line = newLine();
  },
  setHud: (hud) => set({ hud }),
  reset: () => {
    avatarState.vehicle = null;
    fleetRefs.dock = null;
    fleetRefs.pierFishing = null;
    fleetRefs.line = newLine();
    set({ parked: [], moved: {}, hud: null }); // (not saved: this also runs when the page tears down, and the save is for the next visit)
  },
}));

// Step out of the vehicle at `spot`: the avatar stands there, a car is parked, a boat is left where it floats.
function stepOut(v, spot, set, get) {
  avatarState.x = spot.x;
  avatarState.z = spot.z;
  avatarState.yaw = v.yaw;
  avatarState.vehicle = null;
  avatarState.target = null;
  fleetRefs.line = newLine();
  if (v.kind === 'car') {
    set({ parked: [...get().parked, { id: v.id, x: v.x, z: v.z, yaw: v.yaw, color: v.color }], hud: null });
    saveParked(get().seed, get().parked);
  } else set({ moved: { ...get().moved, [v.id]: { x: v.x, z: v.z, yaw: v.yaw } }, hud: null });
}

function start(v) {
  avatarState.vehicle = v;
  avatarState.x = v.x;
  avatarState.z = v.z;
  avatarState.yaw = v.yaw;
  avatarState.target = null;
  avatarState.joy = null;
  fleetRefs.line = newLine();
}

// A spot beside the vehicle where the avatar can stand: not inside anything solid, and (leaving a boat) on land.
function freeSpotAround(v, map, onShore) {
  const { rects } = map;
  for (let radius = onShore ? 1.0 : 0.9; radius <= (onShore ? 3.4 : 2.4); radius += 0.2) {
    for (let a = 0; a < 24; a++) {
      const angle = v.yaw + Math.PI / 2 + (a % 2 ? 1 : -1) * Math.floor(a / 2) * (Math.PI / 12);
      const x = v.x + Math.sin(angle) * radius;
      const z = v.z + Math.cos(angle) * radius;
      if (isBlocked(x, z, rects)) continue;
      if (onShore && inWater(x, z, fleetRefs.water, -0.2) && !fleetRefs.piers.some((p) => onDeck(p, x, z))) continue; // (a pier's deck is dry)
      return resolveOverlap(x, z, map);
    }
  }
  return null;
}

// Is (x, z) on this pier's deck?
const onDeck = (p, x, z) => {
  const d = deckRect(p);
  return x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1;
};
export const isOnDeck = onDeck;
