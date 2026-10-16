// Ad rotation (shared billboards and banners) and legible ad text.
import { imp, problemTally } from './helpers.mjs';
const r = await imp('game/adRotation.js');
const { generateCity } = await imp('city/cityGenerator.js');
const { useCityStore } = await imp('state/store.js');
const { bad, total } = problemTally();

const A = { advertiser: 'A', headline: 'a', color: '#ff0000' };
const B = { advertiser: 'B', headline: 'b', color: '#00ff00' };
const C = { advertiser: 'C', headline: 'c', color: '#0000ff' };

// empty and single slots
if (r.adAt({ ad: null }, 5000) !== null) bad('an empty slot shows no ad', '');
if (r.adAt({ ad: A }, 123456789) !== A || r.rotates({ ad: A })) bad('a single ad does not rotate', '');
// rotation: the owner gets two of every four turns with two sharers... (owner x2, then each sharer once), and it is a function of the clock only
const slot = { ad: A, ads: [B, C] };
const seen = [];
for (let k = 0; k < 8; k++) seen.push(r.adAt(slot, k * r.ROTATE_MS + 17).advertiser);
if (seen.slice(0, 4).join('') !== 'AABC' || seen.slice(4).join('') !== 'AABC') bad('the owner has two turns of four, then each sharer one, repeating', seen.join(''));
if (r.adAt(slot, 41 * r.ROTATE_MS + 3) !== r.adAt(slot, 41 * r.ROTATE_MS + r.ROTATE_MS - 3)) bad('an ad stays for its whole turn', '');
if (!r.rotates(slot)) bad('a shared slot rotates', '');
if (r.msToNext(r.ROTATE_MS * 5 + 1000) !== r.ROTATE_MS - 1000) bad('the next turn is known', '');

// text colour: always at least WCAG AA for large text, and the better of white and near-black
let worst = Infinity;
for (let rr = 0; rr < 256; rr += 5) for (let g = 0; g < 256; g += 5) for (let b = 0; b < 256; b += 5) {
  const hex = `#${((1 << 24) | (rr << 16) | (g << 8) | b).toString(16).slice(1)}`;
  const c = r.textContrast(hex);
  worst = Math.min(worst, c);
  if (c < r.contrastRatio(hex, r.LIGHT_TEXT) - 1e-9 && c < r.contrastRatio(hex, r.DARK_TEXT) - 1e-9) bad('the better text colour is chosen', hex);
}
if (worst < 4.5) bad('every brand colour gets text with at least 4.5:1 contrast', worst.toFixed(2));
if (r.textOn('#facc15') !== r.DARK_TEXT || r.textOn('#1e1b4b') !== r.LIGHT_TEXT) bad('yellow gets dark text and navy gets white', '');
if (r.isHex('red') || r.isHex('#fff') || !r.isHex('#A1b2C3')) bad('only #rrggbb is a colour', '');

// the store: sharing
{
  const city = generateCity(5);
  useCityStore.setState({ plots: city.plots, layout: city.layout, billboards: city.billboards });
  const first = useCityStore.getState().billboards.find((b) => b.ad && b.kind !== 'banner');
  const empty = useCityStore.getState().billboards.find((b) => !b.ad);
  const price = useCityStore.getState().shareBillboard(first.id, B);
  if (price !== Math.round(first.value * r.SHARE_PRICE)) bad('sharing costs a share of the value', `${price}`);
  useCityStore.getState().shareBillboard(first.id, { ...C, color: 'not a colour' });
  const mine = useCityStore.getState().billboards.find((b) => b.id === first.id);
  if (mine.ads.length !== 2 || mine.ads[1].color !== '#6366f1') bad('two ads can share and a bad colour is replaced', JSON.stringify(mine.ads));
  if (useCityStore.getState().shareBillboard(first.id, A) !== null) bad('no more than two sharers', '');
  if (empty && useCityStore.getState().shareBillboard(empty.id, A) !== null) bad('an empty slot is bought, not shared', '');
  useCityStore.getState().unshareBillboard(first.id, 0);
  if (useCityStore.getState().billboards.find((b) => b.id === first.id).ads.length !== 1) bad('a share can be removed', '');
  useCityStore.getState().buyBillboard(first.id, { ...A, color: 'javascript:alert(1)' });
  const after = useCityStore.getState().billboards.find((b) => b.id === first.id);
  if (after.ad.color !== '#6366f1' || after.ads.length !== 1) bad('a take-over cleans the colour and keeps the sharers', JSON.stringify([after.ad.color, after.ads.length]));
}

console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
