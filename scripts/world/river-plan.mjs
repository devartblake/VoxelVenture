// Makes the mainland's river plan picture and table (docs/world/river_plan.md): the planned rivers, ports and the town on the mainland's coast, as an image (docs/world/gallery/river_plan.webp) and a table printed for the doc.
//   node scripts/world/river-plan.mjs [--write]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { imp, root } from '../lib-loader.mjs';

const { planRivers } = await imp('world/riverPlan.js');
const { generateCity } = await imp('city/cityGenerator.js');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/world/manifest.json'), 'utf8'));
const dir = path.join(root, 'apps/web/public/world/chunks');
const highways = new Map();
for (const c of manifest.chunks) {
  if (!c.highways) continue;
  for (const h of JSON.parse(fs.readFileSync(path.join(dir, `${c.key}.json`), 'utf8')).highways ?? []) if (h.kind !== 'track' && h.kind !== 'causeway-bridge' && h.kind !== 'causeway') highways.set(`${h.id}|${h.a.x}|${h.a.z}`, h);
}
const city = generateCity(20260101);
const townRiver = (city.layout ?? city).rivers[0];
const plan = planRivers({ manifest, highways: [...highways.values()], townRiver });
export { plan };
if (process.argv.includes('--json')) { console.log(JSON.stringify(plan, null, 1)); process.exit(0); }

console.log('projection', plan.projection);
for (const r of plan.rivers) console.log(r.id.padEnd(22), r.coast.padEnd(6), r.kind.padEnd(8), 'len', String(r.length).padStart(4), 'w', JSON.stringify(r.width), 'fall', r.fall, 'moved', r.mouthMoved, 'crosses', r.crosses.map((c) => c.highway).join(',') || '-');
for (const p of plan.ports) console.log('port', p.id, p.role, JSON.stringify(p.atGame), 'moved', p.movedToCoast);
console.log('problems', plan.problems);

// the picture: the coast, the town, the highways, the rivers and the ports
const main = manifest.landmasses.find((l) => l.id === 'mainland');
const b = main.bounds, pad = 40, S = 0.9;
const X = (x) => ((x - b.x0 + pad) * S).toFixed(1), Z = (z) => ((z - b.z0 + pad) * S).toFixed(1);
const W = Math.round((b.x1 - b.x0 + 2 * pad) * S), H = Math.round((b.z1 - b.z0 + 2 * pad) * S);
const poly = (pts) => pts.map((p) => `${X(p.x)},${Z(p.z)}`).join(' ');
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial" font-size="11"><rect width="100%" height="100%" fill="#0e3a5c"/>`;
svg += `<polygon points="${poly(main.coast.points)}" fill="#c9d8a6" stroke="#f3ecd0" stroke-width="2"/>`;
for (const r of main.features.ranges) svg += `<polyline points="${poly(r.points)}" fill="none" stroke="#8a7f64" stroke-width="${Math.max(4, r.width * S * 0.5)}" stroke-opacity="0.45" stroke-linecap="round"/>`;
for (const h of highways.values()) svg += `<line x1="${X(h.a.x)}" y1="${Z(h.a.z)}" x2="${X(h.b.x)}" y2="${Z(h.b.z)}" stroke="#a9792b" stroke-width="1.6"/>`;
const t = manifest.towns[0].land;
svg += `<rect x="${X(t.x0)}" y="${Z(t.z0)}" width="${(t.x1 - t.x0) * S}" height="${(t.z1 - t.z0) * S}" fill="#6b8f4e" fill-opacity="0.6" stroke="#3d5a2a"/><text x="${X(t.x0 + 6)}" y="${Z(t.z0 + 16)}" fill="#1c2e12">Voxel Town</text>`;
for (const r of plan.rivers) {
  const w = Math.max(1.6, r.width.mid * S * 0.6);
  svg += `<polyline points="${poly(r.course)}" fill="none" stroke="${r.id === 'rio-minho' ? '#1d4ed8' : '#2f86d6'}" stroke-width="${w.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const m = r.mouthAt, lbl = r.course[Math.floor(r.course.length * 0.45)];
  svg += `<circle cx="${X(m.x)}" cy="${Z(m.z)}" r="3.5" fill="#fff" stroke="#1d4ed8"/><text x="${X(lbl.x + 5)}" y="${Z(lbl.z)}" fill="#10243a" stroke="#f3ecd0" stroke-width="2.5" paint-order="stroke">${r.name}</text>`;
  for (const c of r.crosses) svg += `<rect x="${(+X(c.x) - 3).toFixed(1)}" y="${(+Z(c.z) - 3).toFixed(1)}" width="6" height="6" fill="#e0a82e" stroke="#5b3a00"/>`;
}
for (const p of plan.ports) svg += `<path d="M${X(p.atGame.x)} ${(+Z(p.atGame.z) - 9).toFixed(1)} l6 12 l-12 0 z" fill="#c2185b" stroke="#fff"/><text x="${(+X(p.atGame.x) + 9).toFixed(1)}" y="${(+Z(p.atGame.z) + 3).toFixed(1)}" fill="#fff" stroke="#0e3a5c" stroke-width="2.5" paint-order="stroke">${p.name}</text>`;
svg += `<text x="12" y="${H - 14}" fill="#fff">blue lines: planned rivers (the dark one: the Rio Minho through Voxel Town) · white dots: mouths · gold squares: bridges where a river crosses a highway · triangles: ports</text></svg>`;
fs.writeFileSync(path.join(process.env.TEMP ?? '.', 'river_plan.svg'), svg);
if (process.argv.includes('--write')) {
  await sharp(Buffer.from(svg)).webp({ quality: 85 }).toFile(path.join(root, 'docs/world/gallery/river_plan.webp'));
  console.log('wrote docs/world/gallery/river_plan.webp');
}
