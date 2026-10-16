// Ad rotation and legible ad text. Pure, so it is tested in Node.
//
// A billboard or aerial banner has one owner, who holds the slot (`ad`). Others can share its screen time (`ads`, up to MAX_SHARERS of them, each paying
// SHARE_PRICE of the slot's value): the screen then rotates through the owner's ad (twice the time) and the sharers' ads. What is on screen is worked out
// from the wall clock, so every player sees the same ad at the same moment (nothing to sync, and nothing that can drift from the server's time).
export const ROTATE_MS = 10000;
export const MAX_SHARERS = 2;
export const SHARE_PRICE = 0.4;
export const OWNER_WEIGHT = 2;

// The ads of a slot, in order, with how many turns each has: the owner's first.
export function adTurns(b) {
  if (!b) return [];
  const out = [];
  if (b.ad) for (let i = 0; i < OWNER_WEIGHT; i++) out.push(b.ad);
  for (const a of b.ads ?? []) out.push(a);
  return out;
}

// The ad on screen at time `now` (milliseconds): null for an empty slot. The owner's ad takes two of every OWNER_WEIGHT + sharers turns, in a fixed order.
export function adAt(b, now = Date.now()) {
  const turns = adTurns(b);
  if (!turns.length) return null;
  return turns[Math.floor(now / ROTATE_MS) % turns.length];
}
export const rotates = (b) => adTurns(b).length > 1 && new Set(adTurns(b)).size > 1;
export const msToNext = (now = Date.now()) => ROTATE_MS - (now % ROTATE_MS);

// ---- legible text (WCAG 2 contrast)
const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const rgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  const n = parseInt(m ? m[1] : '6366f1', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const luminance = (hex) => {
  const [r, g, b] = rgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
export const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
export const isHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c ?? ''));
export const LIGHT_TEXT = '#ffffff';
export const DARK_TEXT = '#000000';
// The text colour that reads better on `bg`: white or near-black, whichever has the higher contrast. The better of the two is at least 4.5:1 on any
// background (so a headline always passes WCAG AA for large text, and for most colours AA for small text too).
export const textOn = (bg) => (contrastRatio(bg, LIGHT_TEXT) >= contrastRatio(bg, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT);
export const textContrast = (bg) => contrastRatio(bg, textOn(bg));
