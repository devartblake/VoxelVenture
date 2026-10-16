// The logo on a building's roof banner. There are three kinds:
//   { kind: 'generated' }                   drawn from the business: a monogram of its name in a shape that suits its type
//   { kind: 'icon', icon, color }           an icon from a fixed set on a board of the owner's colour
//   { kind: 'image', image, color }         the owner's own picture, uploaded (kept as a small data: URL, nothing is fetched)
// The owner picks one when they set up a plot (the claim and take-over forms will not go through without a valid logo),
// and can change it later. The buildings the city starts with get a generated one, so the skyline reads the same from
// the first frame.
export const LOGO_ICONS = [
  { id: 'rocket', emoji: '🚀', label: 'Rocket', types: ['office'] },
  { id: 'laptop', emoji: '💻', label: 'Laptop', types: ['office'] },
  { id: 'chart', emoji: '📊', label: 'Chart', types: ['office'] },
  { id: 'gear', emoji: '⚙', label: 'Gear', types: ['office'] },
  { id: 'coffee', emoji: '☕', label: 'Coffee', types: ['restaurant'] },
  { id: 'burger', emoji: '🍔', label: 'Burger', types: ['restaurant'] },
  { id: 'pizza', emoji: '🍕', label: 'Pizza', types: ['restaurant'] },
  { id: 'noodles', emoji: '🍜', label: 'Noodles', types: ['restaurant'] },
  { id: 'bag', emoji: '🛍', label: 'Shopping bag', types: ['shop'] },
  { id: 'game', emoji: '🎮', label: 'Game', types: ['shop'] },
  { id: 'books', emoji: '📚', label: 'Books', types: ['shop'] },
  { id: 'shirt', emoji: '👕', label: 'Clothes', types: ['shop'] },
  { id: 'star', emoji: '⭐', label: 'Star', types: [] },
  { id: 'gem', emoji: '💎', label: 'Gem', types: [] },
  { id: 'music', emoji: '🎵', label: 'Music', types: [] },
  { id: 'palette', emoji: '🎨', label: 'Palette', types: [] },
];
export const LOGO_ICON_IDS = LOGO_ICONS.map((i) => i.id);
export const LOGO_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b', '#0f172a'];
export const LOGO_KINDS = ['generated', 'icon', 'image'];
export const MAX_IMAGE_CHARS = 90000; // an uploaded picture is shrunk to fit well inside this (about 65 KB)

const HEX = /^#[0-9a-fA-F]{6}$/;
const IMAGE_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export const isImageUrl = (s) => typeof s === 'string' && s.length <= MAX_IMAGE_CHARS && IMAGE_URL.test(s);

// The kind of a logo; a logo saved before there were kinds (just { icon, color }) is an icon.
export const kindOf = (logo) => (logo?.kind ?? (logo?.icon ? 'icon' : null));

export function isValidLogo(logo) {
  switch (kindOf(logo)) {
    case 'generated':
      return true;
    case 'icon':
      return LOGO_ICON_IDS.includes(logo.icon) && HEX.test(logo.color ?? '');
    case 'image':
      return isImageUrl(logo.image) && HEX.test(logo.color ?? '#0f172a');
    default:
      return false;
  }
}

// Only what a logo is made of survives (anything else on the object is dropped).
export function cleanLogo(logo) {
  if (!isValidLogo(logo)) return null;
  const kind = kindOf(logo);
  if (kind === 'generated') return { kind };
  if (kind === 'icon') return { kind, icon: logo.icon, color: logo.color.toLowerCase() };
  return { kind, image: logo.image, color: (logo.color ?? '#0f172a').toLowerCase() };
}

const hash = (n) => (Math.imul(n * 2654435761 + 40503, 2246822519) >>> 0) / 4294967296;
const hashString = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};

// Up to two capital letters from a business name ("Pixel Perfect Studio" -> "PP", "Kiosk" -> "KI").
export function monogram(title) {
  const words = String(title ?? '').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const SHAPES = { office: 'hexagon', restaurant: 'circle', shop: 'tag' };
// Colours for a generated logo: a pair that goes with the building's own colour, chosen from the name so the same
// business always gets the same logo.
const GENERATED_PAIRS = [
  ['#0f172a', '#f8fafc'],
  ['#fef3c7', '#92400e'],
  ['#f8fafc', '#1d4ed8'],
  ['#fce7f3', '#9d174d'],
  ['#dcfce7', '#166534'],
  ['#ede9fe', '#5b21b6'],
  ['#ffedd5', '#c2410c'],
  ['#e0f2fe', '#0c4a6e'],
];

// What a generated logo is drawn with: the letters, the shape, and two colours.
export function generatedSpec(plot) {
  const h = hashString(`${plot.title ?? ''}|${plot.id}`);
  const [bg, fg] = GENERATED_PAIRS[h % GENERATED_PAIRS.length];
  const icon = LOGO_ICONS.filter((i) => i.types.includes(plot.buildingType));
  return { letters: monogram(plot.title), shape: SHAPES[plot.buildingType] ?? 'circle', bg, fg, icon: icon.length ? icon[Math.floor(hash(plot.id) * icon.length)].emoji : '⭐' };
}

// What a plot's roof banner shows: its logo, or a generated one. Null where there is no banner (empty lots, Old Town houses).
export function logoOf(plot) {
  if (!plot.owner || plot.buildingType === 'house' || !(plot.height > 0.2)) return null;
  return isValidLogo(plot.logo) ? plot.logo : { kind: 'generated' };
}

// The board's colour: the owner's choice, else the building's own.
export const boardColor = (plot, logo) => (logo?.color && HEX.test(logo.color) ? logo.color : HEX.test(plot.color ?? '') ? plot.color : LOGO_COLORS[8]);

// The banner's size in world units: big enough to read from the map, bigger for bigger buildings.
export function bannerSize(plot, buildingWidth) {
  const tier = plot.grand ? 2.6 : plot.luxury ? 2 : plot.prime ? 1.5 : 1;
  const height = 1.45 * tier; // an ordinary building's banner is 1.45 high and 3.5 wide: bigger than its roof, so it reads from the map
  const width = Math.max(height * 2.4, Math.min(buildingWidth * 0.8, height * 4.4));
  return { width, height };
}
