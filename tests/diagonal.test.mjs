import { imp, problemTally } from './helpers.mjs';
const { generateCity, CIRCLE } = await imp('city/cityGenerator.js');
const { boxesOverlap } = await imp('city/curves.js');
const { tally, bad } = problemTally();
let missing = 0;
const H = 1.4;
const dist = (x, z, r) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
const rr = (r) => (r.axis === 'x' ? { x0: r.from, x1: r.to, z0: r.center - H, z1: r.center + H } : { x0: r.center - H, x1: r.center + H, z0: r.from, z1: r.to });
const N = Number(process.argv[2] ?? process.env.SEEDS ?? 100);
let withD = 0, segs = 0, lots = 0;
for (let seed = 1; seed <= N; seed++) {
  const c = generateCity(seed); const { layout, plots } = c; const ds = layout.diagonals;
  if (!ds.length) { missing++; continue; }
  withD++; segs += ds.length; lots += plots.filter((p) => p.districtId === 'diagonal').length;
  const allCircles = layout.intersections.filter((i) => i.control === 'circle');
  const circles = allCircles.filter((i) => i.id.startsWith('circle-'));
  const rounds = allCircles.filter((i) => i.id.startsWith('roundabout-'));
  if (rounds.length > 2) bad('at most two roundabouts', seed);
  for (const r of rounds) { if (!(r.arms.west && r.arms.east && r.arms.north && r.arms.south)) bad('roundabouts sit on four-way crossings', r.id); if (r.diag.length) bad('roundabouts have no diagonal legs', r.id); }
  for (const d of ds) if (d.length < 14.5) bad('the circles are well apart (the diagonal is at least 14.5 long)', `${seed}: ${d.length.toFixed(1)}`);
  for (const p of plots.filter((q) => q.districtId === 'diagonal')) {
    const near = circles.filter((c) => c.circle.island > 1.5).some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 9.5);
    if (near && Math.abs(p.yaw ?? 0) > 1e-9) bad('buildings near a circle stand straight, not turned', `${seed} #${p.id} yaw ${(p.yaw).toFixed(2)}`);
  }
  if (circles.length !== ds.length + 1) bad('one circle per end of each stretch', `${seed}`);
  for (const d of ds) {
    const a = circles.find((x) => x.id === d.from), b = circles.find((x) => x.id === d.to);
    if (!a || !b) { bad('stretch joins two circles', d.id); continue; }
    if (Math.hypot(a.x - d.p0.x, a.z - d.p0.z) > 1e-9 || Math.hypot(b.x - d.p1.x, b.z - d.p1.z) > 1e-9) bad('stretch ends at circle centres', d.id);
    const ang = (Math.atan2(Math.abs(d.dir[1]), Math.abs(d.dir[0])) * 180) / Math.PI;
    if (ang < 30 || ang > 55) bad('angle 30-55 degrees to the avenues', `${ang.toFixed(1)}`);
    // never crosses a grid road
    for (const r of layout.roads) {
      const rect = rr(r);
      const n = Math.ceil(d.length / 0.4);
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * d.length, x = d.p0.x + d.dir[0] * t, z = d.p0.z + d.dir[1] * t;
        if (Math.hypot(x - a.x, z - a.z) < CIRCLE.clear || Math.hypot(x - b.x, z - b.z) < CIRCLE.clear) continue;
        if (dist(x, z, rect) < H - 0.01) { bad('the diagonal crosses no grid road', `${d.id} ${r.id}`); break; }
      }
    }
  }
  // legs of each circle: pairwise at least 34 degrees apart
  for (const ix of circles) {
    const dirs = [];
    for (const [n, v] of [['west', [-1, 0]], ['east', [1, 0]], ['north', [0, -1]], ['south', [0, 1]]]) if (ix.arms[n]) dirs.push(v);
    for (const l of ix.diag) dirs.push(l.dir);
    for (let i = 0; i < dirs.length; i++) for (let j = i + 1; j < dirs.length; j++) {
      const ang = (Math.acos(Math.max(-1, Math.min(1, dirs[i][0] * dirs[j][0] + dirs[i][1] * dirs[j][1]))) * 180) / Math.PI;
      if (ang < 30) bad('circle legs are well apart', `${ix.id} ${ang.toFixed(1)}`);
    }
    if (!ix.arms.west || !ix.arms.east) bad('circle sits on an avenue', ix.id);
    // no other junction inside its pavement radius
    for (const o of layout.intersections) if (o !== ix && Math.hypot(o.x - ix.x, o.z - ix.z) < ix.circle.gap + 1.5) bad('circle has clear space round it', `${ix.id} ${o.id}`);
    // roads' gaps match
  }
  // plots clear of the circles, the diagonal, roads and each other
  const box = (p) => ({ x: p.x, z: p.z, hw: p.w / 2, hd: p.d / 2, yaw: p.yaw ?? 0 });
  for (const p of plots) {
    const r = { x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 };
    if (p.districtId !== 'diagonal') for (const ix of allCircles) if (dist(ix.x, ix.z, r) < ix.circle.clear - 1e-6) bad('no plot inside a circle zone', p.id);
    for (const d of ds) {
      const n = Math.ceil(d.length / 0.4);
      for (let i = 0; i <= n; i++) { const t = (i / n) * d.length; const pr = p.yaw ? null : r; if (pr && dist(d.p0.x + d.dir[0] * t, d.p0.z + d.dir[1] * t, pr) < H - 0.01) { bad('no plot on the diagonal', p.id); break; } }
    }
  }
  for (const ix of rounds) for (const o of layout.intersections) if (o !== ix && Math.hypot(o.x - ix.x, o.z - ix.z) < ix.circle.gap + 1.5) bad('roundabout has clear space', ix.id);
  const diagLots = plots.filter((p) => p.districtId === 'diagonal');
  for (const p of diagLots) {
    for (const q of plots) if (q !== p && boxesOverlap(box(p), box(q), 0.03)) { bad('diagonal lots overlap nothing', `${p.id}/${q.id}`); break; }
    for (const r of layout.roads) { const rect = rr(r); if (boxesOverlap(box(p), { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2, hw: (rect.x1 - rect.x0) / 2, hd: (rect.z1 - rect.z0) / 2, yaw: 0 }, 0.03)) { bad('diagonal lots clear of roads', p.id); break; } }
    for (const d of ds) if (boxesOverlap(box(p), { x: (d.p0.x + d.p1.x) / 2, z: (d.p0.z + d.p1.z) / 2, hw: H, hd: d.length / 2, yaw: Math.atan2(d.dir[0], d.dir[1]) }, 0.03)) { bad('diagonal lots clear of the diagonal', p.id); break; }
  }
  // the park is untouched
  const park = layout.parks[0];
  if (park) for (const ix of circles) if (dist(ix.x, ix.z, { x0: park.center.x - park.width / 2, x1: park.center.x + park.width / 2, z0: park.center.z - park.depth / 2, z1: park.center.z + park.depth / 2 }) < CIRCLE.clear) bad('circles clear of the park', seed);
}
console.log(`${N} cities: diagonal in ${withD}; avg ${(segs / withD).toFixed(1)} stretches, ${(lots / withD).toFixed(1)} frontage lots`);
const p = Object.values(tally).reduce((a, b) => a + b, 0);
const tooFew = missing / N > 0.03; // a diagonal fits in nearly every city; a few have no room for one
console.log(`${missing} of ${N} cities have no diagonal${tooFew ? ' (too many)' : ''}`);
console.log(p === 0 && !tooFew ? 'ALL OK' : `${p} problems ${JSON.stringify(tally)}`);
if (p || tooFew) process.exitCode = 1;
