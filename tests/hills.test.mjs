// The hills in the north-east: low, level along the roads and the meadow, clear of everything else, with the road running between them.
import { imp, problemTally } from './helpers.mjs';
const { generateCity } = await imp('city/cityGenerator.js');
const { hillHeight, hillBlocked, HILL_MAX, HILL_VERGE } = await imp('city/hills.js');
const { buildCollisionMap, isBlocked } = await imp('sim/collision.js');
const { bad, total } = problemTally();

const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.02 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.02;
let withHills = 0;
let both = 0;
let peak = 0;
const SEEDS = 40;
for (let seed = 1; seed <= SEEDS; seed++) {
  const { layout, plots, billboards } = generateCity(seed);
  const H = layout.hills;
  if (!H) continue;
  withHills++;
  const { rect } = H;
  const ridge = layout.roads.filter((r) => r.id.startsWith('highlands-'));
  if (ridge.length !== 5 || !ridge.some((r) => r.kind === 'spur')) { bad('the hills have a loop road and a spur', `${seed}: ${ridge.length} roads`); continue; }
  // north-east, outside the county road
  // (north of the county or east of it, on the east half of the map)
  const cx = (rect.x0 + rect.x1) / 2;
  if (!(cx > (layout.county.x0 + layout.county.x1) / 2 && (rect.z1 < layout.county.z0 + 40 || rect.x0 > layout.county.x1))) bad('the hills are out in the north-east', `${seed} ${JSON.stringify(rect)}`);
  if (overlap(rect, { x0: layout.county.x0 + 3, x1: layout.county.x1 - 3, z0: layout.county.z0 + 3, z1: layout.county.z1 - 3 })) bad('the hills are outside the county road', String(seed));
  if (!(layout.land.x0 <= rect.x0 && layout.land.x1 >= rect.x1 && layout.land.z0 <= rect.z0 && layout.land.z1 >= rect.z1)) bad('the hills are inside the land', String(seed));

  // clear of everything else
  for (const p of plots) if (overlap(rect, { x0: p.x - 1.5, x1: p.x + 1.5, z0: p.z - 1.5, z1: p.z + 1.5 })) bad('no plot among the hills', `${seed} #${p.id}`);
  for (const a of layout.airports) if (overlap(rect, a.rect)) bad('no airport among the hills', String(seed));
  for (const l of layout.lakes) if (overlap(rect, { x0: l.x - l.rx, x1: l.x + l.rx, z0: l.z - l.rz, z1: l.z + l.rz })) bad('no lake among the hills', String(seed));
  for (const rv of layout.rivers) if (overlap(rect, rv)) bad('the river does not cross the hills', String(seed));
  for (const f of layout.fields) if (overlap(rect, f)) bad('no field among the hills', String(seed));
  for (const b of billboards) if (b.x > rect.x0 && b.x < rect.x1 && b.z > rect.z0 && b.z < rect.z1) bad('no billboard among the hills', String(seed));

  // heights: never above the maximum, and level on every road and the meadow
  let max = 0;
  for (let x = rect.x0; x <= rect.x1; x += 1) for (let z = rect.z0; z <= rect.z1; z += 1) max = Math.max(max, hillHeight(H, x, z));
  peak = Math.max(peak, max);
  if (max > HILL_MAX + 1e-9) bad('a hill never rises past the maximum', `${seed}: ${max}`);
  if (max < 1.2) bad('the hills are real hills, not a ripple', `${seed}: ${max.toFixed(2)}`);
  for (const r of layout.roads) {
    // every road that touches the area (the ridge roads and the county road beside it) stays level, with a verge
    for (let u = r.from; u <= r.to; u += 1) {
      for (const off of [-HILL_VERGE + 0.2, 0, HILL_VERGE - 0.2]) {
        const x = r.axis === 'x' ? u : r.center + off;
        const z = r.axis === 'x' ? r.center + off : u;
        if (hillHeight(H, x, z) > 0.005) { bad('the ground is level along every road', `${seed} ${r.id} at ${x.toFixed(1)},${z.toFixed(1)}: ${hillHeight(H, x, z).toFixed(2)}`); u = r.to; break; }
      }
    }
  }
  const meadow = H.flat[H.flat.length - 1];
  for (let x = meadow.x0; x <= meadow.x1; x += 1) for (let z = meadow.z0; z <= meadow.z1; z += 1) if (hillHeight(H, x, z) > 0.005) bad('the meadow inside the loop is level', `${seed} ${x},${z}`);

  // the road runs between hills: there are hills on both sides of the spur
  const spur = ridge.find((r) => r.kind === 'spur');
  const side = (sgn) => {
    let m = 0;
    for (let u = Math.min(spur.from, spur.to); u <= Math.max(spur.from, spur.to); u += 1) for (let o = 8; o <= 22; o += 1) {
      const x = spur.axis === 'x' ? u : spur.center + sgn * o;
      const z = spur.axis === 'x' ? spur.center + sgn * o : u;
      m = Math.max(m, hillHeight(H, x, z));
    }
    return m;
  };
  if (side(-1) > 0.8 && side(1) > 0.8) both++;

  // the avatar can walk the roads and the meadow, but not up the hills
  const map = buildCollisionMap({ plots, layout, billboards });
  const mid = [spur.axis === 'x' ? (spur.from + spur.to) / 2 : spur.center, spur.axis === 'x' ? spur.center : (spur.from + spur.to) / 2];
  if (isBlocked(mid[0], mid[1], map.rects)) bad('the road through the hills is walkable', String(seed));
  let blocked = 0;
  for (let x = rect.x0; x <= rect.x1; x += 2) for (let z = rect.z0; z <= rect.z1; z += 2) if (hillBlocked(H, x, z)) blocked++;
  if (blocked < 50) bad('the hills block the way up', `${seed}: ${blocked} cells`);
}
// (80%: the larger prime and luxury lots of the tier mix take room that the hills also need in some test cities; the real world is hand-made)
if (withHills < SEEDS * 0.8) bad('nearly every city has hills', `${withHills} of ${SEEDS}`);
if (both < withHills * 0.7) bad('the road passes between hills on both sides', `${both} of ${withHills}`);
console.log(`${withHills} of ${SEEDS} cities have hills; the highest is ${peak.toFixed(2)}; the road runs between hills in ${both}`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
