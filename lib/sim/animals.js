import { hillHeight } from '../city/hills';

// The animals of the countryside: farm animals in the meadows (cows, sheep, horses, pigs), wildlife in and around the woods (deer, foxes, rabbits), goats on
// the hills, ducks on the lakes and the river, and birds circling over the woods and hills. Pure (no three.js), so it is tested in Node and drawn by
// apps/web/components/city/Animals.jsx.
//
//   createAnimals(layout) -> { animals, update(dt, t) }
//   an animal: { id, kind, x, y, z, yaw, mode, home, ... } updated in place; `grazing` is true while it stands with its head down.
//
// Everything is placed and moved from the city's seed, so the same city always has the same herds in the same fields.
const mulberry = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// kind: speed in units a second, how often it stops, and its "mode" (land, water, air)
export const KINDS = {
  cow: { speed: 0.16, stop: [3, 9], mode: 'land' },
  sheep: { speed: 0.18, stop: [2, 7], mode: 'land' },
  horse: { speed: 0.4, stop: [3, 8], mode: 'land' },
  pig: { speed: 0.15, stop: [2, 6], mode: 'land' },
  goat: { speed: 0.3, stop: [2, 6], mode: 'land' },
  deer: { speed: 0.35, stop: [3, 9], mode: 'land' },
  fox: { speed: 0.5, stop: [2, 6], mode: 'land' },
  rabbit: { speed: 0.6, stop: [1, 4], mode: 'land' },
  duck: { speed: 0.12, stop: [2, 6], mode: 'water' },
  bird: { speed: 0, stop: [0, 0], mode: 'air' },
};
const FARM_KINDS = ['cow', 'sheep', 'horse', 'pig', 'cow', 'sheep'];
const FARM_COUNT = { cow: [3, 5], sheep: [4, 8], horse: [2, 3], pig: [3, 5] };
const WATER_Y = 0.035;

const rectOf = (cx, cz, hw, hd) => ({ x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd });
const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const overlaps = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0;

// Clumps of trees (the woods are scattered trees): [{ x, z, n, rect }], by 14-unit cells.
function wood(layout) {
  const cells = new Map();
  for (const t of [...(layout.woods ?? []), ...(layout.landscape?.trees ?? [])]) {
    const k = `${Math.floor(t.x / 14)},${Math.floor(t.z / 14)}`;
    const c = cells.get(k) ?? { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, n: 0 };
    c.x0 = Math.min(c.x0, t.x);
    c.x1 = Math.max(c.x1, t.x);
    c.z0 = Math.min(c.z0, t.z);
    c.z1 = Math.max(c.z1, t.z);
    c.n++;
    cells.set(k, c);
  }
  return [...cells.values()].filter((c) => c.n >= 5).map((c) => ({ x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2, n: c.n, rect: c }));
}

export function planHerds(layout) {
  const rand = mulberry((layout.seed ?? 1) * 7919 + 101);
  const herds = [];
  const urban = layout.urban ?? null;
  const hills = layout.hills ?? null;
  const pick = (list, n) => {
    const a = [...list];
    const out = [];
    while (a.length && out.length < n) out.push(a.splice(Math.floor(rand() * a.length), 1)[0]);
    return out;
  };
  const clear = (r) => !(urban && overlaps(r, urban)) && !(hills && overlaps(r, hills.rect)); // the countryside only; the hills have their own animals
  // farms: the meadow fields, each with a herd of one kind
  const meadows = (layout.fields ?? []).filter((f) => f.crop === 'meadow' && f.x1 - f.x0 >= 4 && f.z1 - f.z0 >= 4 && clear(f));
  pick(meadows, 16).forEach((f, i) => {
    const kind = FARM_KINDS[i % FARM_KINDS.length];
    const [lo, hi] = FARM_COUNT[kind];
    const small = Math.min(f.x1 - f.x0, f.z1 - f.z0) < 6;
    herds.push({ kind, count: small ? lo : lo + Math.floor(rand() * (hi - lo + 1)), home: { x0: f.x0 + 0.5, x1: f.x1 - 0.5, z0: f.z0 + 0.5, z1: f.z1 - 0.5 }, place: 'farm' });
  });
  // wildlife in the woods
  const woods = wood(layout).filter((w) => clear({ x0: w.rect.x0 - 6, x1: w.rect.x1 + 6, z0: w.rect.z0 - 6, z1: w.rect.z1 + 6 })); // (the herd's home reaches up to 5 beyond the trees)
  const clumps = pick(woods, 14);
  clumps.slice(0, 7).forEach((w) => herds.push({ kind: 'deer', count: 2 + Math.floor(rand() * 3), home: rectOf(w.x, w.z, (w.rect.x1 - w.rect.x0) / 2 + 5, (w.rect.z1 - w.rect.z0) / 2 + 5), place: 'woods' }));
  clumps.slice(7, 10).forEach((w) => herds.push({ kind: 'fox', count: 1 + Math.floor(rand() * 2), home: rectOf(w.x, w.z, (w.rect.x1 - w.rect.x0) / 2 + 4, (w.rect.z1 - w.rect.z0) / 2 + 4), place: 'woods' }));
  clumps.slice(10, 14).forEach((w) => herds.push({ kind: 'rabbit', count: 3 + Math.floor(rand() * 3), home: rectOf(w.x, w.z, (w.rect.x1 - w.rect.x0) / 2 + 3, (w.rect.z1 - w.rect.z0) / 2 + 3), place: 'woods' }));
  pick(woods, 3).forEach((w) => herds.push({ kind: 'bird', count: 5 + Math.floor(rand() * 3), home: rectOf(w.x, w.z, 8, 8), place: 'sky' }));
  // the hills: goats on the slopes, birds above
  if (hills) {
    // one flock on one stretch of slope (an anchor on a hill, and a patch round it), so they do not wander across the level road
    for (let i = 0; i < 40; i++) {
      const x = hills.rect.x0 + rand() * (hills.rect.x1 - hills.rect.x0);
      const z = hills.rect.z0 + rand() * (hills.rect.z1 - hills.rect.z0);
      if (hillHeight(hills, x, z) < 0.9) continue;
      const r = rectOf(x, z, 8, 8);
      herds.push({ kind: 'goat', count: 5, home: { x0: Math.max(r.x0, hills.rect.x0), x1: Math.min(r.x1, hills.rect.x1), z0: Math.max(r.z0, hills.rect.z0), z1: Math.min(r.z1, hills.rect.z1) }, place: 'hills' });
      break;
    }
    herds.push({ kind: 'bird', count: 6, home: rectOf((hills.rect.x0 + hills.rect.x1) / 2, (hills.rect.z0 + hills.rect.z1) / 2, 12, 12), place: 'sky' });
  }
  // water: ducks on each lake and on a stretch of the river
  for (const l of layout.lakes ?? []) herds.push({ kind: 'duck', count: 2 + Math.floor(rand() * 3), home: rectOf(l.x, l.z, l.rx - 0.8, l.rz - 0.8), place: 'lake' });
  const river = layout.rivers?.[0];
  if (river) {
    const bridges = (layout.bridges ?? []).filter((b) => b.riverId === river.id).map((b) => b.center);
    const alongX = river.axis === 'x';
    const lo = alongX ? river.x0 : river.z0;
    const hi = alongX ? river.x1 : river.z1;
    for (let k = 0; k < 4; k++) {
      const c = lo + (hi - lo) * (0.12 + rand() * 0.76);
      if (bridges.some((b) => Math.abs(b - c) < 14)) continue; // not under a bridge
      const half = alongX ? [6, (river.z1 - river.z0) / 2 - 1.5] : [(river.x1 - river.x0) / 2 - 1.5, 6];
      herds.push({ kind: 'duck', count: 3, home: rectOf(alongX ? c : (river.x0 + river.x1) / 2, alongX ? (river.z0 + river.z1) / 2 : c, half[0], half[1]), place: 'river' });
    }
  }
  return herds;
}

export function createAnimals(layout) {
  const hills = layout.hills ?? null;
  const herds = planHerds(layout);
  const rand = mulberry((layout.seed ?? 1) * 104729 + 7);
  const animals = [];
  let id = 0;
  const randomIn = (home, r = rand) => ({ x: home.x0 + r() * (home.x1 - home.x0), z: home.z0 + r() * (home.z1 - home.z0) });
  // a spot on the hills that is properly a slope (not the level road verge)
  const slope = (home, r = rand) => {
    for (let i = 0; i < 60; i++) {
      const p = randomIn(home, r);
      if (hillHeight(hills, p.x, p.z) > 0.35) return p;
    }
    return null;
  };
  for (const h of herds) {
    const spec = KINDS[h.kind];
    // for the sky the home is the circle's box; the birds fly round its middle
    for (let i = 0; i < h.count; i++) {
      const own = mulberry(((layout.seed ?? 1) * 31 + id * 2654435761) >>> 0);
      let at = h.place === 'hills' ? slope(h.home) : randomIn(h.home);
      if (!at) continue;
      const a = { id: id++, kind: h.kind, mode: spec.mode, home: h.home, place: h.place, x: at.x, z: at.z, y: 0, yaw: own() * Math.PI * 2, tx: at.x, tz: at.z, wait: own() * 6, grazing: true, rng: own, speed: spec.speed * (0.8 + own() * 0.4), phase: own() * 100 };
      if (spec.mode === 'air') {
        a.cx = (h.home.x0 + h.home.x1) / 2;
        a.cz = (h.home.z0 + h.home.z1) / 2;
        a.radius = 3 + own() * 6;
        a.omega = (0.25 + own() * 0.25) * (own() < 0.5 ? -1 : 1);
        a.angle = own() * Math.PI * 2;
        a.alt = 3 + own() * 3;
      }
      animals.push(a);
    }
  }

  const groundY = (a) => (hills && a.place === 'hills' ? hillHeight(hills, a.x, a.z) + 0.012 : a.mode === 'water' ? WATER_Y : 0.012);
  for (const a of animals) {
    if (a.mode === 'air') {
      a.x = a.cx + Math.cos(a.angle) * a.radius;
      a.z = a.cz + Math.sin(a.angle) * a.radius;
      a.y = a.alt;
    } else a.y = groundY(a);
  }

  function update(dt, t = 0) {
    const step = Math.min(dt, 0.25);
    for (const a of animals) {
      if (a.mode === 'air') {
        a.angle += a.omega * step;
        a.x = a.cx + Math.cos(a.angle) * a.radius;
        a.z = a.cz + Math.sin(a.angle) * a.radius;
        a.y = a.alt + Math.sin(t * 0.7 + a.phase) * 0.4;
        // facing along the circle
        const tx = -Math.sin(a.angle) * Math.sign(a.omega);
        const tz = Math.cos(a.angle) * Math.sign(a.omega);
        a.yaw = Math.atan2(-tz, tx);
        continue;
      }
      if (a.wait > 0) {
        a.wait -= step;
        a.grazing = true;
        if (a.wait <= 0) {
          // choose where to go next: somewhere in its home (on a slope for a goat)
          const next = a.place === 'hills' ? slope(a.home, a.rng) : randomIn(a.home, a.rng);
          if (next) {
            a.tx = next.x;
            a.tz = next.z;
          }
          a.grazing = false;
        }
        continue;
      }
      const dx = a.tx - a.x;
      const dz = a.tz - a.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.08) {
        const [lo, hi] = KINDS[a.kind].stop;
        a.wait = lo + a.rng() * (hi - lo);
        a.grazing = true;
        continue;
      }
      a.yaw = Math.atan2(-dz, dx); // the model faces +x; rotation.y turns +x to (cos, -sin)
      const m = Math.min(d, a.speed * step);
      a.x = clamp(a.x + (dx / d) * m, a.home.x0, a.home.x1);
      a.z = clamp(a.z + (dz / d) * m, a.home.z0, a.home.z1);
      a.y = groundY(a);
    }
  }
  return { animals, update, herds };
}

export const animalCounts = (animals) => animals.reduce((o, a) => ({ ...o, [a.kind]: (o[a.kind] ?? 0) + 1 }), {});
export { inRect };
