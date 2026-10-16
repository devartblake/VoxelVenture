// The outside of a building, as the owner sets it up: how many floors, which shape, what colours, what stands on the roof. Pure, so it is tested in Node.
//
//   config = { floors, model, palette, wallColor, crown, crownColor, back }
//     floors       a whole number within the plot's range (a bigger plot tier allows a taller building); the height is floors x FLOOR_HEIGHT
//     model        the id of a building shape from the catalogue that suits the height (null: the game picks one by the plot's number)
//     palette      a preset (see PALETTES); the wall colour is the preset's, or the owner's own pick
//     wallColor    "#rrggbb" or null (the brand colour tints the walls)
//     crown        what stands on the roof (see CROWNS), in `crownColor`
//     back         what is behind the building (see BACKS in lib/content/backyards.js), if the lot has room
//
// Everything is validated here, so the claim form, the owner's editor and a saved game can only ever produce a building the game can draw.
import { BUILDING_TYPES, GRAND_HEIGHT, LUXURY_HEIGHT, PRIME_HEIGHT, floorsForHeight } from '../city/cityGenerator';
import { BACK_IDS } from '../content/backyards';
import { heightReach } from '../content/models';

export const FLOOR_HEIGHT = 1.2; // floorsForHeight() is round(height / 1.2)
const HEX = /^#[0-9a-f]{6}$/i;

export const CROWNS = [
  { id: 'none', label: 'Nothing', hint: 'A clean roofline' },
  { id: 'beacon', label: 'Beacon', hint: 'A mast with a glowing light' },
  { id: 'dish', label: 'Dish', hint: 'A satellite dish on a mast' },
  { id: 'garden', label: 'Roof garden', hint: 'Planters and greenery' },
  { id: 'dome', label: 'Glass dome', hint: 'An observatory dome' },
  { id: 'spire', label: 'Spire', hint: 'A tall pointed spire' },
];
export const CROWN_IDS = CROWNS.map((c) => c.id);

// Curated finishes: the walls' colour and the colour of the roof feature. A preset with no colours leaves the walls to the brand colour.
export const PALETTES = [
  { id: 'brand', label: 'Brand colour', wall: null, accent: '#fbbf24' },
  { id: 'tokyo', label: 'Tokyo Cyberpunk', wall: '#2a2552', accent: '#ec4899' },
  { id: 'nordic', label: 'Nordic Minimalist', wall: '#e8dcc6', accent: '#b8895a' },
  { id: 'solar', label: 'High-Tech Solar', wall: '#334155', accent: '#4ade80' },
  { id: 'sunset', label: 'Sunset Brick', wall: '#d9722b', accent: '#fde68a' },
  { id: 'ocean', label: 'Ocean Glass', wall: '#38bdf8', accent: '#fef08a' },
  { id: 'mono', label: 'Monochrome', wall: '#e5e7eb', accent: '#111827' },
];
export const PALETTE_IDS = PALETTES.map((p) => p.id);
export const paletteById = (id) => PALETTES.find((p) => p.id === id) ?? PALETTES[0];

const tierMultiplier = (plot) => (plot?.grand ? GRAND_HEIGHT : plot?.luxury ? LUXURY_HEIGHT : plot?.prime ? PRIME_HEIGHT : 1);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// How many floors a plot allows: its tier's limit (a bigger plot can carry a taller building), and never more than the tallest building shape can reach on its
// footprint (a skyscraper shape stands about 12 units tall on an ordinary plot, 25 or more on an estate). `typical` is what a new owner starts with.
export const MAX_FLOORS = { ordinary: 10, prime: 12, luxury: 16, grand: 20 };
export const tierOfPlot = (plot) => (plot?.grand ? 'grand' : plot?.luxury ? 'luxury' : plot?.prime ? 'prime' : 'ordinary');
export function floorRange(plot, type) {
  const t = BUILDING_TYPES[type] ?? BUILDING_TYPES.shop;
  const mult = tierMultiplier(plot);
  const typical = floorsForHeight(Math.round(((t.height[0] + t.height[1]) / 2) * mult * 10) / 10);
  const reach = plot && plot.w ? Math.floor(heightReach({ ...plot, height: 3, exterior: {} }).max / FLOOR_HEIGHT + 1e-9) : MAX_FLOORS.ordinary;
  const min = 1;
  const max = clamp(Math.min(MAX_FLOORS[tierOfPlot(plot)], reach || MAX_FLOORS.ordinary), Math.max(2, typical + 1), 20);
  return { min, max, typical: clamp(typical, min, max) };
}

export const heightFor = (floors) => Math.round(floors * FLOOR_HEIGHT * 10) / 10;

// What a building of this many floors is called (the three tiers of a skyline).
export const tierName = (floors) => (floors <= 2 ? 'Low-rise' : floors <= 5 ? 'Mid-rise' : floors <= 9 ? 'High-rise' : 'Skyscraper');
export const tierNote = (floors) => (floors <= 2 ? 'Domestic: a low building' : floors <= 5 ? 'Neighbourhood: a mid-rise building' : floors <= 9 ? 'Urban: a tower' : 'Landmark: a skyscraper');

export function defaultExterior(plot, type) {
  return { floors: floorRange(plot, type).typical, model: null, palette: 'brand', wallColor: null, crown: 'none', crownColor: paletteById('brand').accent, back: 'none' };
}

// Anything in, a valid configuration out.
export function cleanExterior(input, plot, type) {
  const base = defaultExterior(plot, type);
  const range = floorRange(plot, type);
  const c = input && typeof input === 'object' ? input : {};
  const palette = PALETTE_IDS.includes(c.palette) ? c.palette : base.palette;
  const wallColor = HEX.test(c.wallColor ?? '') ? c.wallColor.toLowerCase() : null;
  return {
    floors: clamp(Math.round(Number(c.floors) || base.floors), range.min, range.max),
    model: typeof c.model === 'string' && /^[\w/.-]{1,80}$/.test(c.model) ? c.model : null,
    palette,
    wallColor,
    crown: CROWN_IDS.includes(c.crown) ? c.crown : 'none',
    crownColor: HEX.test(c.crownColor ?? '') ? c.crownColor.toLowerCase() : paletteById(palette).accent,
    back: BACK_IDS.includes(c.back) ? c.back : 'none',
  };
}

// The wall colour that results: the owner's own pick, else the palette's, else none (the brand colour tints the walls).
export const wallColorOf = (config) => config.wallColor ?? paletteById(config.palette).wall ?? null;

// The changes to a plot that its configuration makes: its height (and so the interior's floors), the wall colour and the stored settings.
export function applyExterior(plot, input, type = plot?.buildingType ?? 'shop') {
  const config = cleanExterior(input, plot, type);
  const height = heightFor(config.floors);
  return {
    height,
    wallColor: wallColorOf(config) ?? undefined,
    exterior: config,
    interiorData: plot?.interiorData ? { ...plot.interiorData, floors: config.floors } : plot?.interiorData,
  };
}

// Has the owner set the outside up themselves?
export const hasCustomExterior = (plot) => Boolean(plot?.exterior);
