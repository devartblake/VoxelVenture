// The colours of a business's inside, drawn from its brand: the walls take a light tint of the brand colour and the back wall is the brand colour itself.
// (The floor keeps its wood texture: a flat colour looked dull.)
// Pure, so it is tested in Node. The brand colour is the roof banner's colour (the owner's logo colour, else the building's own colour).
import { boardColor } from '../game/logos';
import { textOn } from '../game/adRotation';

const hex = (c) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c ?? ''));
  const n = parseInt(m ? m[1] : '64748b', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
// `amount` of b mixed into a (0 = a, 1 = b)
export const mix = (a, b, amount) => {
  const [x, y] = [hex(a), hex(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * amount));
};

export function brandPalette(plot) {
  const brand = toHex(hex(boardColor(plot ?? {}, plot?.logo)));
  return {
    brand,
    wall: mix(brand, '#ffffff', 0.86), // the room: a pale tint, so the furniture and the brand colour stand out
    accent: brand, // the back wall
    accentText: textOn(brand), // for a sign painted on it: white or black, whichever has the better contrast
  };
}

// A Pascal material (the shape the editor's colour panel writes). A wall needs `side: 'double'`: with only the front face drawn it disappears.
export const material = (color, side = 'front') => ({ preset: 'custom', properties: { color, roughness: 0.8, metalness: 0, opacity: 1, transparent: false, side } });
