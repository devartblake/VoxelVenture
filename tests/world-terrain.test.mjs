// The ground under things (lib/world/terrain.js, docs/world/streaming_runtime.md): on the real baked world, how high the ground is, what it is, and where an avatar, a car and a boat can go.
import fs from 'node:fs';
import path from 'node:path';
import { imp, root } from '../scripts/lib-loader.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const { loadBakedWorld } = await imp('world/bakedWorld.js');
const { createTerrain, activeTerrain, setActiveTerrain, SEA_LEVEL } = await imp('world/terrain.js');
const dir = path.join(root, 'apps/web/public/world');
const baked = await loadBakedWorld(async (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
const loaded = new Map();
for (const c of baked.manifest.chunks) loaded.set(c.key, await baked.chunk(c.cx, c.cz));
const have = new Set(loaded.keys());
const terrain = createTerrain({ chunkAt: (cx, cz) => loaded.get(`${cx}_${cz}`), has: (cx, cz) => have.has(`${cx}_${cz}`) });
const town = baked.manifest.towns[0];
const home = { x: (town.land.x0 + town.land.x1) / 2, z: (town.land.z0 + town.land.z1) / 2 };

// ---- what is where
{
  const t = terrain.sample(home.x, home.z);
  check('the first town is land at ground level 0, flat', t.known && t.surface === 'land' && t.y === 0 && t.slope === 0, JSON.stringify({ s: t.surface, y: t.y }));
  const sea = terrain.sample(-2000, 300);
  check('far out to sea (no chunk baked) is sea, and known: nothing can stand there', sea.known && sea.surface === 'sea' && !terrain.canStand(-2000, 300, 'walk') && !terrain.canStand(-2000, 300, 'car') && terrain.canStand(-2000, 300, 'boat'));
  // the bluff on the mountains: the highest point of the Blue Mountains
  let best = null;
  for (const c of loaded.values()) if (c.ground?.h && c.bounds.x1 < 1300) for (let k = 0; k < c.ground.h.length; k++) if (!best || c.ground.h[k] > best.h) best = { h: c.ground.h[k], c, k };
  const W = best.c.ground.n + 3;
  const px = best.c.bounds.x0 + (128 * ((best.k % W) - 1)) / best.c.ground.n, pz = best.c.bounds.z0 + (128 * (Math.floor(best.k / W) - 1)) / best.c.ground.n;
  const peak = terrain.sample(px, pz);
  check('the summit of the Blue Mountains is 18 units up and land', peak.surface === 'land' && peak.y > 17 && peak.y <= 18.01, `${peak.y.toFixed(2)} at ${px.toFixed(0)}, ${pz.toFixed(0)}`);
  let steepest = { slope: 0 };
  for (let k = 0; k < 6000; k++) { const x = 560 + (k * 7919) % 900, z = -280 + (k * 104729) % 700; const s = terrain.sample(x, z); if (s.known && s.slope > steepest.slope) steepest = { slope: s.slope, x, z }; }
  check('there is steep ground in the mountains that a car cannot climb (slope over 0.45; a person can climb up to 1, 45 degrees)', steepest.slope > 0.45 && !terrain.canStand(steepest.x, steepest.z, 'car'), `steepest ${steepest.slope.toFixed(2)}`);
  check('a steep slope is an obstacle by its angle: the same place is walkable if the slope limit allows', terrain.canStand(steepest.x, steepest.z, 'walk') === (steepest.slope <= 1.0));
}

// ---- walking to the sea: the beach, then the coast stops you
{
  // from the town, west along a line to the mainland's western coast
  const row = [];
  let x = home.x, z = home.z - 40;
  let pos = { x, z };
  let steps = 0;
  let wasBeach = false;
  let stopped = false;
  for (let k = 0; k < 4000; k++) {
    const r = terrain.move(pos.x, pos.z, -0.5, 0, 'walk');
    const s = terrain.sample(r.x, r.z);
    if (s.surface === 'beach') wasBeach = true;
    if (r.blocked.x) { stopped = true; pos = r; break; }
    pos = r; steps++;
  }
  const end = terrain.sample(pos.x, pos.z);
  check('walking west from the town: across the land, onto the beach, and the sea stops you (still on land, 0.3 or more from the water)', stopped && wasBeach && end.sd >= 0.3 - 1e-6 && end.surface === 'beach' && row.length === 0, `${steps} steps, stopped at x ${pos.x.toFixed(0)}, ${end.sd.toFixed(1)} from the coast`);
  // sliding: pushing diagonally into the coast keeps the free axis moving
  const slides = [0.5, -0.5].map((dz) => terrain.move(pos.x, pos.z, -0.5, dz, 'walk'));
  check('pushing into the coast at an angle slides along it: the blocked axis stays and the other moves (at least one way along the coast is open)', slides.some((r) => r.blocked.x && r.z !== pos.z));
  check('a car stops at the coast too, and earlier than a person (it is wider)', (() => { let p = { x: home.x, z: home.z - 40 }; for (let k = 0; k < 4000; k++) { const r = terrain.move(p.x, p.z, -0.5, 0, 'car'); if (r.blocked.x) break; p = r; } return p.x >= pos.x - 1e-6 && terrain.sample(p.x, p.z).sd >= 0.5 - 1e-6; })());
}

// ---- the causeways: a car can drive the whole way over the water, and the deck is a smooth climb and descent
{
  const hw = baked.manifest.landmasses;
  const pieces = [];
  for (const c of loaded.values()) for (const h of c.highways) if (h.kind === 'causeway-bridge' && h.id === 'harbor-causeway') pieces.push(h);
  pieces.sort((a, b) => a.along[0] - b.along[0]);
  const first = pieces[0], last = pieces[pieces.length - 1];
  const span = first.span;
  const from = { x: first.a.x, z: first.a.z };
  // walk the bridge from its first end to its last, in 1-unit steps along its line
  const dirx = (last.b.x - first.a.x) / span, dirz = (last.b.z - first.a.z) / span;
  let pos = { ...from };
  let refused = 0;
  let maxJump = 0;
  let top = 0;
  let prevY = terrain.sample(pos.x, pos.z).y;
  let onBridge = 0;
  for (let s = 1; s <= span; s++) {
    const r = terrain.move(pos.x, pos.z, dirx, dirz, 'car');
    if (r.blocked.x || r.blocked.z) refused++;
    pos = { x: pos.x + dirx, z: pos.z + dirz };
    const t = terrain.sample(pos.x, pos.z);
    if (t.surface === 'bridge') onBridge++;
    maxJump = Math.max(maxJump, Math.abs(t.y - prevY));
    prevY = t.y;
    top = Math.max(top, t.y);
  }
  check(`a car drives the whole Harbor Causeway bridge (${span.toFixed(0)} units) without being refused once`, refused === 0 && onBridge > span * 0.95, `${refused} refused, ${onBridge} of ${span.toFixed(0)} on the bridge`);
  check('the deck climbs smoothly to 9 units and comes down: no step of more than 0.25 between points a unit apart, the top at 9', maxJump < 0.25 && top > 8.9 && top < 9.2, `top ${top.toFixed(2)}, biggest step ${maxJump.toFixed(2)}`);
  const mid = { x: first.a.x + dirx * span / 2, z: first.a.z + dirz * span / 2 };
  const m = terrain.sample(mid.x, mid.z);
  check('under the middle of the bridge is sea: a boat can sail there (the deck is overhead), and on it you stand 9 up', m.surface === 'bridge' && m.y > 8.9 && terrain.canStand(mid.x, mid.z, 'boat') && m.sd < -20);
  check('the shore end of the bridge is at ground level, and the foot of the ramp is walkable', terrain.sample(first.a.x, first.a.z).y < 0.3 && terrain.canStand(first.a.x, first.a.z, 'walk'));
  // a boat sails the gap between the landmasses, on a line that crosses no land
  let boat = { x: mid.x + 60 * dirz, z: mid.z - 60 * dirx };
  let boatOk = true;
  for (let k = 0; k < 200; k++) { const r = terrain.move(boat.x, boat.z, dirz * 0.5, -dirx * 0.5, 'boat'); if (r.blocked.x && r.blocked.z) { boatOk = false; break; } boat = r; }
  check('a boat sails along the water between the landmasses for 100 units without being stopped', boatOk);
  check('and a boat cannot go onto land: from the sea heading at the coast, it stops in water at least 2.5 units out', (() => { let p = { x: mid.x, z: mid.z }; for (let k = 0; k < 800; k++) { const r = terrain.move(p.x, p.z, -dirx * 0.5, -dirz * 0.5, 'boat'); if (r.blocked.x && r.blocked.z) break; if (r.x === p.x && r.z === p.z) break; p = r; } return terrain.sample(p.x, p.z).sd <= -2.5 + 1e-6 && hw.length > 0; })());
}

// ---- what the terrain leaves to the game, and what it will not do
{
  const skipTown = createTerrain({ chunkAt: (cx, cz) => loaded.get(`${cx}_${cz}`), has: (cx, cz) => have.has(`${cx}_${cz}`), skipped: (cx, cz) => cx * 128 < town.land.x1 && cx * 128 + 128 > town.land.x0 && cz * 128 < town.land.z1 && cz * 128 + 128 > town.land.z0 });
  const s = skipTown.sample(home.x, home.z);
  check('where the caller draws the ground itself (the first town) the terrain does not decide: surface "town", not known, so the game\'s own rules apply', s.surface === 'town' && !s.known && !skipTown.decides(home.x, home.z) && skipTown.decides(-2000, 300));
  const partial = createTerrain({ chunkAt: () => undefined, has: () => true });
  const p = partial.sample(home.x, home.z);
  check('a chunk that exists but is not loaded yet is not known, and nothing may move into it (a wait while it streams, not a fall)', !p.known && p.surface === 'loading' && partial.move(home.x, home.z, 1, 0, 'walk').blocked.x);
  check('the active terrain is held in one place for the game to read, and can be cleared', activeTerrain() === null && (setActiveTerrain(terrain), activeTerrain() === terrain) && (setActiveTerrain(null), activeTerrain() === null) && SEA_LEVEL === -0.3);
  const t0 = Date.now();
  let acc = 0;
  for (let k = 0; k < 100000; k++) acc += terrain.sample(-900 + (k % 400) * 8, -800 + (Math.floor(k / 400) % 250) * 8).y;
  check('it is fast enough to run every frame for every body: 100,000 samples in under a second and a half', Date.now() - t0 < 1500 && Number.isFinite(acc), `${Date.now() - t0} ms`);
}

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
