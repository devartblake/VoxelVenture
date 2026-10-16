// Re-fitting lots after the roads changed.
import { imp, problemTally } from './helpers.mjs';
const ce = await imp('city/cityEdit.js');
const { generateCity } = await imp('city/cityGenerator.js');
const { bad, total } = problemTally();

const base = generateCity(20260101);
const stranded = (city) => ce.validate(city).warnings.filter((w) => ['lot-on-road', 'no-road'].includes(w.kind) || w.kind === 'lots-overlap').length;

// a city nobody touched needs no re-fit
const quiet = ce.refitLots(base);
if (quiet.ops.length > 0 && quiet.moved.length !== quiet.ops.length) bad('ops match the moved lots', '');

// a street with lots beside it, moved sideways without clearing them
const road = base.layout.roads.filter((r) => r.axis === 'z' && r.kind === 'street' && r.to - r.from > 40).find((r) => base.plots.filter((p) => Math.abs(p.x - r.center) < 4.5 && p.z > r.from && p.z < r.to).length >= 6);
if (!road) { bad('probe road found', ''); total(); }
const next = ce.applyEdits(base, [{ t: 'road~', id: road.id, set: { center: road.center + 1.8 }, clear: false }]);
const before = ce.validate(next);
const hit = before.warnings.filter((w) => w.kind === 'lot-on-road').length;
if (!hit) bad('moving the road put lots under it (probe)', '');
const fit = ce.refitLots(next);
if (!fit.moved.length) bad('some lots were moved', JSON.stringify(fit));
const after = ce.applyEdits(next, fit.ops);
const left = ce.validate(after).warnings.filter((w) => w.kind === 'lot-on-road').length;
if (left > fit.stuck.length) bad('every lot that found room is off the road', `${left} left, ${fit.stuck.length} stuck`);
if (ce.validate(after).errors.length) bad('re-fit made no errors', '');
for (const op of fit.ops) {
  if (op.t !== 'plot~' || !Number.isFinite(op.set.x) || !Number.isFinite(op.set.z)) bad('every op is a finite move', JSON.stringify(op));
  const p = after.plots.find((q) => q.id === op.id);
  const b = ce.plotBox(p);
  if (after.layout.roads.some((r) => { const c = ce.corridorOf(r); return Math.min(b.x1, c.x1) - Math.max(b.x0, c.x0) > 0.06 && Math.min(b.z1, c.z1) - Math.max(b.z0, c.z0) > 0.06; })) bad('a moved lot stands clear of every road', String(op.id));
}
// again: nothing more to do
const again = ce.refitLots(after);
if (again.moved.length) bad('a second re-fit moves nothing', String(again.moved.length));
// deterministic
if (JSON.stringify(ce.refitLots(next)) !== JSON.stringify(fit)) bad('same input, same result', '');
console.log(`refit: road moved, ${hit} lots on it, ${fit.moved.length} moved, ${fit.stuck.length} stuck (of ${stranded(next)} flagged)`);
total();
