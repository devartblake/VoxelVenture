// Daily content is picked from the date and the city's seed, so it is the same all day and for
// everyone with the same city, with no server involved.

export const POTD_VISIT_GOLD = 20;

// Local calendar day, e.g. "2026-10-12".
export function dayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Plot of the Day: one of the businesses the city started with (`generated`). Judging by that
// flag rather than by who owns it now keeps the pick fixed all day even if plots change hands.
export function plotOfTheDay(plots, seed, day) {
  const pool = plots.filter((p) => p.generated);
  if (!pool.length) return null;
  return pool[hashString(`${seed}|${day}|potd`) % pool.length];
}

// The mystery chest: sits on a sidewalk a little way along from one of the intersections.
export function dailyChest(intersections, seed, day) {
  // it sits on the pavement of an east-west road, so the junction needs both arms of one
  const through = intersections.filter((i) => i.control !== 'circle' && (!i.arms || (i.arms.west && i.arms.east)));
  if (!through.length) return null;
  const h = hashString(`${seed}|${day}|chest`);
  const spot = through[h % through.length];
  const sx = h & 4 ? 1 : -1;
  const sz = h & 8 ? 1 : -1;
  return {
    x: spot.x + sx * 2.9,
    z: spot.z + sz * 1.1, // the middle of the avenue's sidewalk
    gold: 10 + (hashString(`${seed}|${day}|gold`) % 41),
  };
}


// --- scavenger hunt ------------------------------------------------------------------------------------
// Three gold stars are hidden at landmarks each day (the fountain in the park, a circle's ring, a bridge, a
// lake's shore, the door of a grand estate), a different three every day and the same for everyone in the same
// city. Each pays HUNT_GOLD; finding all three pays HUNT_BONUS on top. Every spot is a place you can walk to.
export const HUNT_COUNT = 3;
export const HUNT_GOLD = 15;
export const HUNT_BONUS = 40;

export function scavengerHunt(layout, plots, seed, day) {
  const spots = [];
  const add = (kind, x, z, clue) => spots.push({ kind, x, z, clue });
  for (const park of layout.parks) {
    // on the central path, just beside the fountain (the paths are the one part of the lawn with no trees)
    add('park', park.center.x + 1.7, park.center.z, `By the fountain in ${park.name}`);
  }
  const bigCircles = layout.intersections.filter((i) => i.control === 'circle' && i.circle.island > 1.5);
  for (const c of bigCircles) add('circle', c.x + (c.circle.ringIn + c.circle.ringOut) / 2, c.z, `On the ring of a big circle on ${layout.diagonals[0]?.name ?? 'the diagonal'}`);
  for (const b of layout.bridges) {
    const mid = (b.u0 + b.u1) / 2;
    const river = layout.rivers.find((r) => r.id === b.riverId);
    add('bridge', b.axis === 'x' ? mid : b.center, b.axis === 'x' ? b.center : mid, `Halfway across a bridge over the ${river?.name ?? 'river'}`);
  }
  for (const l of layout.lakes) add('lake', l.x, l.z + l.rz + 0.9, `On the sandy shore of ${l.name}`);
  for (const p of plots) {
    if (!p.grand) continue;
    const out = p.facing * (p.d * 0.425 + 1.2);
    add('estate', p.x + Math.sin(p.yaw ?? 0) * out, p.z + Math.cos(p.yaw ?? 0) * out, `Outside the door of ${p.title}`);
  }
  // a different mix every day: take them in a day-dependent order, at most one of each kind
  const ordered = spots
    .map((spot, i) => ({ spot, key: hashString(`${seed}|${day}|hunt|${i}`) }))
    .sort((a, b) => a.key - b.key)
    .map((o) => o.spot);
  const picked = [];
  for (const spot of ordered) {
    if (picked.length >= HUNT_COUNT) break;
    if (picked.some((p) => p.kind === spot.kind)) continue;
    picked.push(spot);
  }
  for (const spot of ordered) {
    if (picked.length >= HUNT_COUNT) break;
    if (!picked.includes(spot)) picked.push(spot);
  }
  return picked.map((spot, i) => ({ ...spot, index: i }));
}
