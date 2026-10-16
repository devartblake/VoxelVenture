// The free ground inside the built-up area is drawn as lawn (not bare slate), and the big park grows over the free ground beside it.
import { imp, problemTally } from './helpers.mjs';
const { generateCity } = await imp('city/cityGenerator.js');
const fl = await imp('city/freeLand.js');
const { bad, total } = problemTally();

const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.02 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.02;

// --- the merging: two free runs of three cells with a wall between them, and a free column joined down the rows
{
  const bounds = { x0: 0, x1: 20, z0: 0, z1: 12 };
  const walls = [{ x0: 8, x1: 12, z0: 0, z1: 6 }]; // a wall in the first three rows' middle
  const out = fl.lawnRects(walls, bounds, { cell: 2, clear: 0, minArea: 4 });
  const area = out.reduce((n, r) => n + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
  if (area !== 20 * 12 - 4 * 6) bad('lawn rectangles cover exactly the free ground', `${area}`);
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) if (overlap(out[i], out[j])) bad('lawn rectangles do not overlap', JSON.stringify([out[i], out[j]]));
  if (out.length > 4) bad('cells are joined into few rectangles', String(out.length));
  if (fl.lawnRects([], bounds, { cell: 2, minArea: 4 }).length !== 1) bad('open ground is one rectangle', '');
  if (fl.lawnRects([{ x0: -1, x1: 21, z0: -1, z1: 13 }], bounds, { cell: 2 }).length !== 0) bad('ground that is all taken has no lawn', '');
  const tiny = fl.lawnRects([{ x0: 3, x1: 20, z0: 0, z1: 12 }], bounds, { cell: 2, clear: 0, minArea: 8 });
  if (tiny.some((r) => (r.x1 - r.x0) * (r.z1 - r.z0) < 8)) bad('a lawn smaller than the minimum is dropped', '');
}

// --- in cities
const SEEDS = Number(process.env.SEEDS ?? 10);
let biggish = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const city = generateCity(seed);
  const { layout, plots, billboards } = city;
  const lawns = layout.lawns;
  if (!Array.isArray(lawns) || lawns.length < 5) { bad('the city has lawn in its free ground', `${seed}: ${lawns?.length}`); continue; }
  const u = layout.urban;
  if (lawns.some((r) => r.x0 < u.x0 - 1e-6 || r.x1 > u.x1 + 1e-6 || r.z0 < u.z0 - 1e-6 || r.z1 > u.z1 + 1e-6)) bad('lawn is inside the built-up area', seed);
  // clear of everything: the same things the lots keep clear of
  const taken = fl.cityRects(city);
  const index = new fl.RectIndex(taken);
  const hit = lawns.filter((r) => index.hits(r));
  if (hit.length) bad('lawn is clear of roads, lots, parks, water, the riverwalk, piers and the amusement park', `${seed}: ${hit.length} of ${lawns.length}, e.g. ${JSON.stringify(hit[0])}`);
  if (plots.some((p) => lawns.some((r) => overlap(r, { x0: p.x - p.w / 2 + 0.05, x1: p.x + p.w / 2 - 0.05, z0: p.z - p.d / 2 + 0.05, z1: p.z + p.d / 2 - 0.05 })) && !(p.yaw))) bad('no lawn under a lot', seed);
  for (const b of billboards) if (b.kind !== 'banner' && lawns.some((r) => b.x > r.x0 && b.x < r.x1 && b.z > r.z0 && b.z < r.z1)) bad('no lawn under a billboard post', seed);
  const area = lawns.reduce((n, r) => n + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
  if (!(area > 300)) bad('there is a fair amount of lawn', `${seed}: ${area}`);
  for (const r of lawns) if (!(r.x1 - r.x0 >= 2 - 1e-9 && r.z1 - r.z0 >= 2 - 1e-9)) bad('a lawn rectangle is at least one cell wide', JSON.stringify(r));
  if (JSON.stringify(generateCity(seed).layout.lawns) !== JSON.stringify(lawns)) bad('the same seed gives the same lawn', seed);
  // the big park is big
  const big = layout.parks.find((p) => p.id === 'park-2');
  if (big.width * big.depth >= 900) biggish++;
  if (big.width * big.depth < 560) bad('the big park is at least its first size (28 x 20)', `${seed}: ${big.width * big.depth}`);
}
if (biggish < SEEDS * 0.5) bad('the big park grows over free ground in most cities', `${biggish} of ${SEEDS}`);
const dflt = generateCity(20260101);
const rc = dflt.layout.parks.find((p) => p.id === 'park-2');
if (rc.name !== 'Riverside Commons' || rc.width * rc.depth < 1200) bad('Riverside Commons in the default city is big', `${rc.name} ${rc.width.toFixed(0)}x${rc.depth.toFixed(0)}`);
console.log(`${biggish} of ${SEEDS} cities have a big park of 900 or more square units; default Riverside Commons ${rc.width.toFixed(0)} x ${rc.depth.toFixed(0)}`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
