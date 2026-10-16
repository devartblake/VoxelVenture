// Roof banner logos: the three kinds, what is accepted, what every building shows, and the banner size.
import { imp, problemTally } from './helpers.mjs';
const { generateCity } = await imp('city/cityGenerator.js');
const logos = await imp('game/logos.js');
const { bad, total } = problemTally();

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const accept = (name, logo) => { if (!logos.isValidLogo(logo)) bad('accepts', name); };
const reject = (name, logo) => { if (logos.isValidLogo(logo)) bad('rejects', name); };
accept('generated', { kind: 'generated' });
accept('icon', { kind: 'icon', icon: 'rocket', color: '#10b981' });
accept('an icon saved before there were kinds', { icon: 'rocket', color: '#10b981' });
accept('an image', { kind: 'image', image: png, color: '#0f172a' });
reject('nothing', null);
reject('an unknown kind', { kind: 'video' });
reject('an icon not in the set', { kind: 'icon', icon: 'bomb', color: '#10b981' });
reject('a bad colour', { kind: 'icon', icon: 'rocket', color: 'red' });
reject('a picture from the web', { kind: 'image', image: 'https://example.com/logo.png', color: '#0f172a' });
reject('a script', { kind: 'image', image: 'data:image/svg+xml;base64,PHN2Zz4=', color: '#0f172a' });
reject('javascript:', { kind: 'image', image: 'javascript:alert(1)', color: '#0f172a' });
reject('a huge picture', { kind: 'image', image: `data:image/png;base64,${'A'.repeat(logos.MAX_IMAGE_CHARS)}`, color: '#0f172a' });
const cleaned = logos.cleanLogo({ kind: 'icon', icon: 'gem', color: '#ABCDEF', extra: 'x' });
if (JSON.stringify(cleaned) !== JSON.stringify({ kind: 'icon', icon: 'gem', color: '#abcdef' })) bad('cleaning keeps only what a logo is made of', JSON.stringify(cleaned));

if (logos.monogram('Pixel Perfect Studio') !== 'PP' || logos.monogram('Kiosk') !== 'KI' || logos.monogram('') !== '?') bad('monograms', logos.monogram('Pixel Perfect Studio'));

let withBanner = 0, without = 0, minW = 99;
for (let seed = 1; seed <= 20; seed++) {
  const { plots } = generateCity(seed);
  for (const p of plots) {
    const l = logos.logoOf(p);
    if (p.owner && p.buildingType !== 'house' && p.height > 0.2) {
      withBanner++;
      if (!l || !logos.isValidLogo(l)) bad('every building has a valid logo', `${seed} #${p.id}`);
      else if (l.kind !== 'generated' && !p.admin) bad('buildings the city starts with get a generated logo', `${seed} #${p.id}`);
      const spec = logos.generatedSpec(p);
      if (!spec.letters || !['hexagon', 'circle', 'tag'].includes(spec.shape)) bad('a generated logo has letters and a shape', `${seed} #${p.id}`);
      if (JSON.stringify(spec) !== JSON.stringify(logos.generatedSpec(p))) bad('a generated logo is stable', `${seed} #${p.id}`);
      const size = logos.bannerSize(p, p.w - 0.45);
      minW = Math.min(minW, size.width);
      if (size.height < 1.4 || size.width < 3.4) bad('banners are big enough to see (at least 3.4 x 1.4)', `${seed} #${p.id} ${size.width.toFixed(1)}x${size.height}`);
      if (size.width / size.height < 2 || size.width / size.height > 4.5) bad('a banner has a sensible shape', `${seed} #${p.id}`);
    } else {
      without++;
      if (l) bad('empty lots and houses have no banner', `${seed} #${p.id}`);
    }
  }
}
const small = { grand: true, w: 14, d: 7.6 }, big = logos.bannerSize(small, 13.5), ord = logos.bannerSize({ w: 3 }, 2.55);
if (!(big.height > ord.height * 2 && big.width > ord.width * 1.8)) bad('a grand estate has a much bigger banner', `${big.width}x${big.height} vs ${ord.width}x${ord.height}`);
console.log(`${withBanner} banners over 20 cities (${without} plots without); smallest ${minW.toFixed(1)} wide`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
