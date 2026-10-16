// The colours of a business's inside come from its brand.
import { imp, problemTally } from './helpers.mjs';
const { brandPalette, mix, material } = await imp('content/brandPalette.js');
const { luminance, contrastRatio } = await imp('game/adRotation.js');
const { generateCity } = await imp('city/cityGenerator.js');
const { bad, total } = problemTally();

const HEX = /^#[0-9a-f]{6}$/;
if (mix('#000000', '#ffffff', 0) !== '#000000' || mix('#000000', '#ffffff', 1) !== '#ffffff' || mix('#ff0000', '#0000ff', 0.5) !== '#800080') bad('colours mix', mix('#ff0000', '#0000ff', 0.5));
if (material('#123456').properties.color !== '#123456' || material('#123456').preset !== 'custom') bad('a material has the shape the editor writes', '');

let n = 0;
const wallColours = new Set();
for (let seed = 1; seed <= 12; seed++) {
  const { plots, layout } = generateCity(seed);
  for (const plot of [...plots.filter((p) => p.owner), ...(layout.malls ?? []).flatMap((m) => m.stores)]) {
    const p = brandPalette(plot);
    n++;
    if (![p.brand, p.wall, p.accent, p.accentText].every((c) => HEX.test(c))) bad('every colour is a plain #rrggbb', JSON.stringify(p));
    if (!(luminance(p.wall) >= luminance(p.brand) - 1e-9)) bad('the room walls are lighter than the brand colour', `${plot.id} ${p.brand} ${p.wall}`);
    if (luminance(p.wall) < 0.5) bad('the room walls are pale', `${plot.id} ${p.wall}`);
    if (contrastRatio(p.accent, p.accentText) < 4.5) bad('text on the back wall reads', `${plot.id} ${p.accent} ${p.accentText}`);
    wallColours.add(p.accent);
  }
}
if (wallColours.size < 6) bad('businesses have different brand colours', String(wallColours.size));

// the owner's logo colour wins over the building's colour; a bad colour falls back to a neutral
const base = { buildingType: 'shop', color: '#10b981' };
if (brandPalette({ ...base, logo: { kind: 'icon', icon: 'star', color: '#ef4444' } }).brand !== '#ef4444') bad('the logo colour is the brand colour', '');
if (brandPalette(base).brand !== '#10b981') bad('without a logo the building colour is used', '');
if (!HEX.test(brandPalette({ buildingType: 'shop', color: 'not-a-colour' }).brand) || !HEX.test(brandPalette(null).brand)) bad('bad input gets a neutral colour', '');
// a wall material draws both faces (the front face alone makes the wall vanish)
if (material('#123456', 'double').properties.side !== 'double' || material('#123456').properties.side !== 'front') bad('a material can draw both faces', '');

console.log(`${n} businesses, ${wallColours.size} different brand colours`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
