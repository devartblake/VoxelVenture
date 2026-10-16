import { boxesOverlap, plotsAlong, sampleCurve } from './curves';
import { HILL_MAX, HILL_SLOPE, HILL_VERGE } from './hills';
import { devToolsOn } from '../dev/devTools';
import { locationAttrsFor } from '../dev/locationAttrs';
import { landPrice, tierTargets } from '../game/landPrice';
import { LOTS as INFILL_LOTS, planBands, planInfill } from './infill';
import { planAmusement } from './amusement';
import { buildPiers, deckRect } from './piers';
import { BOAT_KINDS } from '../content/boatModels';
import { landingFor, planPromenades, riverSide } from './promenade';
import { RectIndex, cityRects, lawnRects } from './freeLand';
import { STREET_NAME_SETS } from '../content/streetNames';

// Seeded procedural city layout: district avenues (along X), cross streets (along Z),
// and plots filling the space between them. Same seed -> same city, so SSR and the
// client agree; pass a new seed to regenerate.

// --- geometry ---------------------------------------------------------------------------------
// Roads keep a fixed 2.8 corridor (1.6 asphalt + two 0.6 sidewalks); a plot's edge always sits on
// the corridor edge. Plots are PLOT_TILE wide, and every plot stores its own world position (x, z),
// so nothing else needs to know how the grid is spaced.
export const PLOT_TILE = 3;
const PLOT_GAP = 0.4; // between neighbouring plots
export const PLOT_PITCH = PLOT_TILE + PLOT_GAP; // centre to centre along a row
export const BUILDING_SCALE = 0.85; // a building fills this share of an ordinary tile
// A building stands this far in from every edge of its plot, whatever the plot's size (0.225 is what 0.85 of a 3-unit tile leaves),
// so a big estate sits exactly as close to the pavement as a small shop.
export const BUILDING_MARGIN = (PLOT_TILE * (1 - BUILDING_SCALE)) / 2;
export const buildingSize = (p) => ({ bw: (p.w ?? PLOT_TILE) - 2 * BUILDING_MARGIN, bd: (p.d ?? PLOT_TILE) - 2 * BUILDING_MARGIN });
const HALF_CORRIDOR = 1.4;
const ROW_OFFSET = HALF_CORRIDOR + PLOT_TILE / 2; // avenue centre line to the centre of the plot row beside it
const AVENUE_SPACING = 2 * HALF_CORRIDOR + 2 * PLOT_TILE + PLOT_GAP; // road, two back-to-back plot rows, road
const RING_GAP = 6; // outer edge of the plots to the perimeter road (billboards stand in this band)

// The size of the map: 1 is the standard city (about 700 plots, 300 x 290 units). A scale k gives k times as many avenues and as many
// columns of plots (the area grows by roughly k^2). Set NEXT_PUBLIC_MAP_SCALE in the environment, then build. See project_status 5v.
export const MAP_SCALE = Math.max(1, Math.min(12, Math.round(Number(process.env.NEXT_PUBLIC_MAP_SCALE) || 1)));
const GRID_X_MIN = -12 * MAP_SCALE;
const GRID_X_MAX = 12 * MAP_SCALE;
// Logical grid rows between avenues (the gridZ values). Only used to find a plot's neighbours.
const AVENUE_ROW_SPACING = 3;
// Eight avenues; the four districts repeat (never back to back) so each gets more frontage.
const AVENUE_INDEXES = Array.from({ length: 8 * MAP_SCALE }, (_, i) => i - 3);
// Road hierarchy: these avenue positions (indexes into AVENUE_INDEXES) are arterials, spaced
// three apart so there are two local avenues between/around them. Cross streets: see arterialColumns().
const ARTERIAL_AVENUES = new Set(AVENUE_INDEXES.map((_, i) => i).filter((i) => i % 3 === 1)); // every third avenue: 1, 4, 7, ...
// Roundabouts replace all-way stops at a few local x local intersections (traffic calming).
const MAX_ROUNDABOUTS = 2;
// An avenue block at least this long (between cross streets / city edge) gets a mid-block crossing.
const MIN_BLOCK_FOR_CROSSING = 8;
// Old Town: past the east ring, the first arterial avenue and the avenue either side of it carry on
// east as a small neighbourhood of house lots, with two local streets and its own east road. An
// owner who is bought out moves into the next free house.
export const SUBURB_FIRST_COL = GRID_X_MAX + 1;
export const SUBURB_LAST_COL = GRID_X_MAX + 10;
const SUBURB_STREET_COLS = [SUBURB_FIRST_COL + 3, SUBURB_FIRST_COL + 6];
export const SUBURB_ID = 'suburb';
const SUBURB_COLOR = '#a8a29e';
// Share of ordinary plots that start out claimed; the rest stay empty lots. 0.565 puts about half of the default city's plots (the estates and
// suburb lots included) in business.
const CLAIMED_RATIO = 0.565;
// The land the city stands on: everything in it (roads, plots, billboards, lakes, the river, the
// reserved site, farmland) plus this much ground all the way round.
const LAND_MARGIN = 16;
// --- the countryside --------------------------------------------------------------------------------
// A "county road" loops round the whole city, RURAL_DEPTH beyond the ring roads. The arterial avenues and
// streets carry on out to it, so every road starts and ends at a junction. Between the two lies open
// country: farmland, woods, a river with bridges, and rectangular lakes with a road all the way round.
const RURAL_DEPTH = 44;
const LOT_BAND = 5.4; // clear ground kept beside a road for lots (a lot, its gap and a little more)
const COUNTRY_LOT_SHARE = 0.73; // share of roadside spots along country roads that become a lot
const LAKE_COUNT = 3;
const LAKE_LOOP_GAP = 4.5; // from the water's edge to the middle of the road that rings the lake
const MIN_LAKE_SQUARE = 28; // free ground a lake and its loop road need
const MAX_LAKESIDE_LOTS = 18;
const JUNCTION_SPACING = 6; // two junctions on one road are never closer than this
// --- the diagonal avenue and its circles ----------------------------------------------------------------
// Like Broadway or L'Enfant's DC: one avenue cuts across the grid at about 45 degrees, and wherever it
// meets an avenue (or a street) there is a circle with a monument, rather than an ordinary junction.
// It runs between circles, so it never crosses a grid road mid-block.
export const CIRCLE = {
  island: 1.9, // central island radius
  ringIn: 2.3, // asphalt ring, inner edge
  ringOut: 3.9, // ... outer edge (the cars' lane runs down the middle)
  outer: 4.5, // outer edge of the sidewalk round the ring
  clear: 5.2, // nothing is built within this of a circle's centre
  gap: 4.3, // the pavement of a grid road stops this far from the centre
};
// A compact circle replaces each small roundabout: the same design as the big ones, sized to fit a grid crossing.
export const ROUNDABOUT = { island: 1.0, ringIn: 1.4, ringOut: 2.7, outer: 3.3, clear: 3.8, gap: 3.2 };
// Separate roundabouts keep well apart, so drivers and pedestrians never face two at once.
const ROUNDABOUT_SPACING = 52;
const DIAG_DX = [11.5, 15.5]; // how far sideways the diagonal runs while it crosses one block (an avenue spacing is 9.2): a longer, shallower cut, 31-38 degrees, with the circles well apart
const CIRCLE_SPACING = 7.4; // the circle's crosswalk (4.4 out) plus a neighbour's stop line (2.15) and zebra: nothing may overlap // a free-standing circle on an avenue keeps this far from the streets
const LAKE_NAMES = ['Mirror Lake', 'Voxel Lake', 'Duck Pond', 'Reed Lake'];
const RIVER_NAMES = ['Glass River', 'Mill Creek', 'Voxel River', 'Willow Run'];
// Land kept empty for a hand-designed road and plot: two sites per city, each beside a busy arterial (see
// planReservedSites). Nothing is ever generated on them.
const RESERVED_SIZE = [34, 30];
// Prime plots: a few lots take up several cells (two side by side, two back to back, or a 2 x 2
// flagship block). They are picked on or next to the arterials and the ring roads, are bigger and
// taller, and sell for a premium.
const PRIME_COUNTS = { block: 12, deep: 22, wide: 28 };
// Luxury estates: a few much bigger plots (3 x 2 cells, about 10 x 6 units) on the very best frontage:
// beside the park and on the arterials. Nobody owns one at the start (they are for the players), they cost
// far more than a prime plot, and a building on one stands taller and has a bigger interior.
const LUXURY_COUNT = 6; // luxury estates on the grid, next to the big plots and the open arterials: two become the admin companies' headquarters (ADMIN_HQS), four are for the players
const LUXURY_BUILT = 2; // the last of them are already built when the city starts (they become the two headquarters); the others are for the players
// Waterfront luxury estates stand on the land side of the river drive and outside each lake's loop road.
const WATERFRONT_LUXURY = 7; // (this includes the river's luxury estates below)
const RIVER_LUXURY = 3; // luxury estates along the river drive
const RIVER_GRAND = 2; // and grand estates
// Grand estates are the city's high-end flagships: the biggest buildings, tall, already built, standing by
// the water or on an open country arterial. A player can still take one over (at 1.25x its value).
const GRAND_COUNT = 6;
const GRAND_SIZE = [14, 7.6]; // along the road, deep
const GRAND_PREMIUM = 12; // value multiplier per cell
export const GRAND_HEIGHT = 2.4;
// Reserved land for the player's own road and plot: two sites, each beside a busy arterial.
const RESERVED_COUNT = 4;
const RESERVED_GAP = 3; // between the road's pavement and the site
// More buildings standing at the start, picked from empty plots (the city starts a little fuller).
const EXTRA_BUILT = { regular: 5, prime: 3 };
const LUXURY_PREMIUM = 8; // value multiplier per cell, for an empty luxury estate
export const LUXURY_HEIGHT = 1.8; // a luxury building is this much taller than a normal one of its type
const PRIME_PREMIUM = 3.5; // value multiplier, per cell, for an empty prime lot
const PRIME_CLAIMED_RATIO = 0.35;
export const PRIME_HEIGHT = 1.35; // a prime building is this much taller than a normal one of its type

export const DISTRICTS = [
  {
    id: 'saas',
    typeWeights: { office: 0.7, restaurant: 0.15, shop: 0.15 },
    name: 'SaaS Silicon Strip',
    color: '#3b82f6',
    palette: ['#3b82f6', '#6366f1', '#0ea5e9'],
    categories: ['Dev Tools', 'SaaS'],
    theme: 'cyberpunk',
    prefixes: ['Cloud', 'Stack', 'Byte', 'Nimbus', 'Quant'],
    suffixes: ['Labs', 'HQ Tower', 'API', 'Systems'],
  },
  {
    id: 'arcade',
    typeWeights: { office: 0.15, restaurant: 0.35, shop: 0.5 },
    name: 'Arcade Alley',
    color: '#ec4899',
    palette: ['#ec4899', '#f43f5e', '#d946ef'],
    categories: ['Gaming'],
    theme: 'arcade',
    prefixes: ['Pixel', 'Turbo', 'Joystick', 'Retro', 'Combo'],
    suffixes: ['Arena', 'Arcade', 'Quest', 'Studios'],
  },
  {
    id: 'creator',
    typeWeights: { office: 0.15, restaurant: 0.4, shop: 0.45 },
    name: 'Creator Commons',
    color: '#a855f7',
    palette: ['#a855f7', '#8b5cf6', '#f59e0b'],
    categories: ['Creators', 'Food & Merch'],
    theme: 'diner',
    prefixes: ['Maker', 'Sketch', 'Pizza', 'Indie', 'Zine'],
    suffixes: ['Market', 'Studio', 'Joint', 'Collective'],
  },
  {
    // The Bazaar: e-commerce, physical merchandise and indie products (it sits beside the pop-up market)
    id: 'bazaar',
    typeWeights: { shop: 0.7, restaurant: 0.15, office: 0.15 },
    name: 'The Bazaar',
    color: '#f97316',
    palette: ['#f97316', '#eab308', '#ef4444'],
    categories: ['E-commerce', 'Merch'],
    theme: 'market',
    prefixes: ['Maker', 'Crate', 'Cart', 'Trade', 'Bundle'],
    suffixes: ['Shop', 'Market', 'Emporium', 'Boutique', 'Outlet'],
  },
];

// What a building is decides its name, size, exterior cues and (in interiorScenes.js) its interior.
// `variants` are alternative layouts of the same type.
// One floor per ~1.2 units of building height (offices end up 2-4 floors, shops/restaurants 1-2).
export function floorsForHeight(height) {
  return Math.max(1, Math.round(height / 1.2));
}

export const BUILDING_TYPES = {
  office: { suffixes: ['HQ', 'Labs', 'Partners', 'Systems', 'Works'], category: null, height: [2.4, 4.8], variants: ['openplan', 'meetings'] },
  restaurant: { suffixes: ['Diner', 'Kitchen', 'Cafe', 'Pizzeria', 'Grill'], category: 'Food & Dining', height: [1.4, 2.2], variants: ['diner', 'cafe'] },
  shop: { suffixes: ['Shop', 'Market', 'Boutique', 'Emporium', 'Outlet'], category: 'Retail', height: [1.2, 2.4], variants: ['boutique', 'market'] },
  // Not generated by district odds: the homes of owners who were bought out (see the Old Town suburb).
  house: { suffixes: ['House'], category: 'Suburb', height: [0.8, 1.0], variants: ['cottage'] },
};

function pickWeighted(rand, weights) {
  const entries = Object.entries(weights);
  let roll = rand() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

const OLD_TOWN_STREETS = ['Old Town Lane', 'Chapel St'];
const STREET_NAMES = [
  'Byte St', 'Pixel Ln', 'Voxel Way', 'Cache St', 'Sprite Rd', 'Mesh Ln', 'Shader St', 'Render Rd',
];
// The name of the i-th street: the eight names, then the same again numbered ("Byte St 2"), so a bigger map never runs out.
const streetNameAt = (names, i) => (i < names.length ? names[i] : `${names[i % names.length]} ${Math.floor(i / names.length) + 1}`);
// Real street names (lib/content/streetNames.js, made by scripts/streets): off unless asked for with generateCity(seed, { streetNames: 'amsterdam' | [names] })
// or NEXT_PUBLIC_STREET_NAMES=<set>, so the default city keeps its names.
const realStreetNames = (seed, options) => {
  const want = options.streetNames ?? process.env.NEXT_PUBLIC_STREET_NAMES;
  const list = Array.isArray(want) ? want : STREET_NAME_SETS[want]?.names;
  if (!list || !list.length) return null;
  return shuffle(forkRand(seed, 9101), list.filter((n) => n.length <= 22));
};
const PARK_NAMES = ['Voxel Park', 'Central Green', 'Pixel Gardens', 'Commons Square'];
const BIG_PARK_NAMES = ['Founders Park', 'Grand Meadow', 'Riverside Commons', 'Memorial Gardens'];
// The second park is built the same way as the first (hedge, paths, fountain, benches, trees, monument) but is far
// larger: it is first sited as 28 x 20 units beside a main road, then grows over the free ground beside it up to BIG_PARK_TARGET (44 x 32, about twenty times the
// footprint of the biggest block park), so a big empty block next to it does not stay bare slate. Its trees stand a little further apart than the small park's, so the
// bigger park does not mean four times the trees.
const BIG_PARK_SIZE = [28, 20];
const BIG_PARK_TARGET = [44, 32];
const BIG_PARK_TREE_SPACING = 1.15;
const BIG_PARK_NAME_STREAM = 9001;
const BIG_PARK_CONTENT_STREAM = 9002;
const BIG_PARK_BOOST_PERCENT = 35;
const BIG_PARK_REACH = 8; // plots this close to it share its foot traffic
const TREE_COLORS = ['#15803d', '#16a34a', '#22c55e', '#4d7c0f'];
// Plots next to the park get this much extra foot traffic.
export const PARK_BOOST_PERCENT = 25;
// Thickness of the hedge that rings the park lawn; trees keep their whole canopy inside it.
export const PARK_BORDER = 0.14;

const OWNERS = ['ApexDev', 'ChefLuigi', 'RetroWob', 'NovaMaker', 'PixelPat', 'ByteBaron', 'LunaCraft', 'KiloKid'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const int = (rand, min, max) => min + Math.floor(rand() * (max - min + 1));

function shuffle(rand, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function randomSeed() {
  return Math.floor(Math.random() * 1_000_000_000);
}

// World x of every plot column. Street columns are narrower than plot columns (a street's corridor
// replaces a plot, and the plots either side stay flush with it), and the jump into Old Town crosses
// the east ring. The main grid is centred on x = 0.
function buildColumnX(streetCols) {
  const x = {};
  x[GRID_X_MIN] = 0;
  for (let c = GRID_X_MIN + 1; c <= SUBURB_LAST_COL; c++) {
    if (c === SUBURB_FIRST_COL) {
      x[c] = x[c - 1] + PLOT_TILE / 2 + RING_GAP + HALF_CORRIDOR + PLOT_GAP + PLOT_TILE / 2;
    } else {
      const beside = streetCols.has(c) || streetCols.has(c - 1);
      x[c] = x[c - 1] + (beside ? HALF_CORRIDOR + PLOT_TILE / 2 : PLOT_PITCH);
    }
  }
  const shift = -(x[GRID_X_MIN] + x[GRID_X_MAX]) / 2;
  for (const c of Object.keys(x)) x[c] += shift;
  return x;
}

// World z of a logical plot row: row 3k +/- 1 is the row just north / south of avenue k.
function zOfGridZ(gridZ) {
  const k = Math.round(gridZ / AVENUE_ROW_SPACING);
  return k * AVENUE_SPACING + (gridZ - AVENUE_ROW_SPACING * k) * ROW_OFFSET;
}

// 2-3 cross-street columns, at least 3 columns apart, never on the outermost columns.
function pickStreetColumns(rand) {
  const count = int(rand, 5 * MAP_SCALE, 7 * MAP_SCALE);
  const candidates = shuffle(
    rand,
    Array.from({ length: GRID_X_MAX - GRID_X_MIN - 1 }, (_, i) => GRID_X_MIN + 1 + i)
  );
  const chosen = [];
  for (const col of candidates) {
    if (chosen.every((c) => Math.abs(c - col) >= 4)) chosen.push(col); // 4 apart: a block of three cells fits a luxury estate
    if (chosen.length === count) break;
  }
  return chosen.sort((a, b) => a - b);
}

// What stands in a park lawn: a monument in one random corner, and a jittered grid of trees that leaves
// the cross paths, the central plaza (pond and benches) and the monument clear.
function parkContents(rand, x0, x1, z0, z1, spacing = 0.8) {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const monument = {
    x: cx + (rand() < 0.5 ? -1 : 1) * (x1 - x0 - 1.1) / 2,
    z: cz + (rand() < 0.5 ? -1 : 1) * (z1 - z0 - 1.1) / 2,
  };
  const trees = [];
  for (let x = x0 + 0.5; x <= x1 - 0.5; x += spacing) {
    for (let z = z0 + 0.5; z <= z1 - 0.5; z += spacing) {
      const tx = x + (rand() - 0.5) * 0.4;
      const tz = z + (rand() - 0.5) * 0.4;
      const keep = rand() > 0.4;
      const size = 0.4 + rand() * 0.25;
      const trunk = 0.3 + rand() * 0.2;
      const color = pick(rand, TREE_COLORS);
      const dx = tx - cx;
      const dz = tz - cz;
      if (!keep || Math.abs(dx) < 0.5 || Math.abs(dz) < 0.5 || Math.hypot(dx, dz) < 1.7) continue;
      if (Math.hypot(tx - monument.x, tz - monument.z) < 0.8) continue;
      const limitX = (x1 - x0) / 2 - PARK_BORDER - size / 2 - 0.05;
      const limitZ = (z1 - z0) / 2 - PARK_BORDER - size / 2 - 0.05;
      if (Math.abs(dx) > limitX || Math.abs(dz) > limitZ) continue;
      trees.push({ x: tx, z: tz, size, trunk, color });
    }
  }
  return { cx, cz, monument, trees };
}

// A park replaces a block of plots between two adjacent avenues (the two back-to-back plot rows),
// 2-4 columns wide, never overlapping a cross street. Prefers wider parks.
function buildPark(rand, avenueRows, avenueZ, streetColumns, colX) {
  for (const len of [4, 3, 2]) {
    const candidates = [];
    for (let i = 0; i < avenueRows.length - 1; i++) {
      for (let col0 = GRID_X_MIN; col0 + len - 1 <= GRID_X_MAX; col0++) {
        const cols = Array.from({ length: len }, (_, n) => col0 + n);
        if (cols.some((c) => streetColumns.includes(c))) continue;
        candidates.push({ i, col0 });
      }
    }
    if (!candidates.length) continue;

    const { i, col0 } = pick(rand, candidates);
    const col1 = col0 + len - 1;
    const row = avenueRows[i] + 1;
    // the whole block between the two avenue corridors
    const x0 = colX[col0] - PLOT_TILE / 2;
    const x1 = colX[col1] + PLOT_TILE / 2;
    const z0 = avenueZ[i] + HALF_CORRIDOR;
    const z1 = avenueZ[i + 1] - HALF_CORRIDOR;
    const { cx, cz, monument, trees } = parkContents(rand, x0, x1, z0, z1);

    return {
      id: 'park',
      name: pick(rand, PARK_NAMES),
      col0,
      col1,
      gridZ: [row, row + 1],
      center: { x: cx, z: cz },
      width: x1 - x0,
      depth: z1 - z0,
      trees,
      monument,
      landmarks: ['Fountain', 'Monument'],
      visits: int(rand, 2500, 7500),
      boostPercent: PARK_BOOST_PERCENT,
      neighborIds: [],
    };
  }
  return null;
}

// A strip of land narrower than a lot between the park and a street looks like a mistake. If a street (a cross
// street at either end, or the next parallel one on the far side) is within STRETCH_MAX of the park, the park grows
// to meet it, so it sits square in its block, flush on every side. It only grows if nothing is in the way.
const STRETCH_MAX = 6.5;
const SIDES = [
  { key: 'x0', axis: 'z', other: ['z0', 'z1'], dir: -1 },
  { key: 'x1', axis: 'z', other: ['z0', 'z1'], dir: 1 },
  { key: 'z0', axis: 'x', other: ['x0', 'x1'], dir: -1 },
  { key: 'z1', axis: 'x', other: ['x0', 'x1'], dir: 1 },
];
// the gap from one side of the rectangle to a road standing across it (undefined when the road is not there)
function sideGap(rect, side, q) {
  if (q.axis !== side.axis || q.to < rect[side.other[0]] || q.from > rect[side.other[1]]) return undefined;
  const edge = side.dir < 0 ? q.center + HALF_CORRIDOR : q.center - HALF_CORRIDOR;
  return { edge, gap: side.dir < 0 ? rect[side.key] - edge : edge - rect[side.key] };
}
function stretchToStreets({ rect, road, side }, roads, obstacles) {
  const next = { ...rect };
  for (const sd of SIDES) {
    let best = null;
    for (const q of roads) {
      const g = sideGap(next, sd, q);
      if (g && g.gap > 0.05 && g.gap <= STRETCH_MAX && (!best || g.gap < best.gap)) best = g;
    }
    if (!best) continue;
    const grown = { ...next, [sd.key]: best.edge };
    const test = { ...inflateAway(grown, road, side, 0.25), [sd.key]: best.edge }; // the edge that meets the street is not inflated
    if (!obstacles.some((o) => rectsOverlap(test, o))) next[sd.key] = best.edge;
  }
  return next;
}
function hasSliver(rect, roads) {
  return SIDES.some((sd) => roads.some((q) => { const g = sideGap(rect, sd, q); return g && g.gap > 0.05 && g.gap <= STRETCH_MAX; }));
}

// The big park: flush against a main road, as near the city centre as there is room, clear of everything.
// Roads with more traffic score higher. Returns the park (same shape as the first) or null.
// Grows a park rectangle outward on the three sides that are not against its road, a unit at a time, over free ground, until it is `target` (long side x short side:
// the way round it already lies) or something is in the way. The side against the road stays where it is.
function growPark(rect, road, side, obstacles, target) {
  const wide = rect.x1 - rect.x0 >= rect.z1 - rect.z0;
  const [tw, td] = wide ? target : [target[1], target[0]];
  const roadKey = road.axis === 'x' ? (side < 0 ? 'z1' : 'z0') : side < 0 ? 'x1' : 'x0';
  const sides = [['x0', -1, 'x'], ['x1', 1, 'x'], ['z0', -1, 'z'], ['z1', 1, 'z']].filter(([k]) => k !== roadKey);
  const r = { ...rect };
  const size = (axis) => (axis === 'x' ? r.x1 - r.x0 : r.z1 - r.z0);
  const goal = (axis) => (axis === 'x' ? tw : td);
  for (let guard = 0; guard < 400; guard++) {
    let grew = false;
    for (const [key, dir, axis] of sides) {
      if (size(axis) >= goal(axis)) continue;
      // only the strip being added is tested (a little beyond it, 0.25), so an edge that already touches a road does not stop the others
      const edge = r[key];
      const strip = axis === 'x'
        ? { x0: Math.min(edge, edge + dir * 1.25), x1: Math.max(edge, edge + dir * 1.25), z0: r.z0 + 0.01, z1: r.z1 - 0.01 }
        : { z0: Math.min(edge, edge + dir * 1.25), z1: Math.max(edge, edge + dir * 1.25), x0: r.x0 + 0.01, x1: r.x1 - 0.01 };
      if (obstacles.some((o) => rectsOverlap(strip, o))) continue;
      const next = { [key]: edge + dir };
      r[key] = next[key];
      grew = true;
    }
    if (!grew) break;
  }
  return r;
}

function planBigPark(rand, roads, obstacles, centre, seed) {
  const cands = [];
  for (const r of roads) {
    const traffic = r.class === 'arterial' ? (r.kind === 'ring' ? 2 : 2.4) : r.kind === 'county' ? 0.6 : 0;
    if (!traffic) continue;
    for (const side of [-1, 1]) {
      for (const [LEN, DEPTH] of [BIG_PARK_SIZE, [BIG_PARK_SIZE[1], BIG_PARK_SIZE[0]]]) {
        for (let u = r.from + 3; u + LEN <= r.to - 3; u += 3) {
          const site = roadsideRect(r, side, u, LEN, DEPTH, 0);
          if (obstacles.some((o) => rectsOverlap(inflateAway(site.rect, r, side, 0.25), o))) continue;
          const d = Math.hypot(site.x - centre.x, site.z - centre.z);
          cands.push({ ...site, road: r, side, score: traffic * 4 - d * 0.12 + rand() * 2 });
        }
      }
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score);
  // the best site that ends up with no sliver beside a cross street (else just the best)
  const stretched = cands.slice(0, 12).map((c) => ({ c, rect: stretchToStreets(c, roads, obstacles) }));
  const pickedSite = stretched.find((s) => !hasSliver(s.rect, roads)) ?? stretched[0];
  // Grow over the free ground beside it, then settle against the streets. The biggest size that leaves no sliver of ground between the lawn and a cross street is
  // taken (a smaller target, down to its first size, when the biggest would leave one).
  const base = pickedSite.rect;
  const { road: siteRoad, side: siteSide } = pickedSite.c;
  let rect = base;
  for (const k of [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0]) {
    const target = [BIG_PARK_SIZE[0] + (BIG_PARK_TARGET[0] - BIG_PARK_SIZE[0]) * k, BIG_PARK_SIZE[1] + (BIG_PARK_TARGET[1] - BIG_PARK_SIZE[1]) * k];
    const grown = growPark(base, siteRoad, siteSide, obstacles, target);
    const settled = stretchToStreets({ rect: grown, road: siteRoad, side: siteSide }, roads, obstacles);
    rect = settled;
    if (!hasSliver(settled, roads)) break;
  }
  const x = (rect.x0 + rect.x1) / 2;
  const z = (rect.z0 + rect.z1) / 2;
  // The park's trees come from a stream of their own. The main stream is spent exactly as it was when the park was its first size (its trees, and the one number its
  // name used), so nothing else in the city moves because the park grew.
  parkContents(rand, base.x0, base.x1, base.z0, base.z1);
  rand();
  const { monument, trees } = parkContents(forkRand(seed, BIG_PARK_CONTENT_STREAM), rect.x0, rect.x1, rect.z0, rect.z1, BIG_PARK_TREE_SPACING);
  return {
    id: 'park-2',
    name: BIG_PARK_NAMES[Math.floor(forkRand(seed, BIG_PARK_NAME_STREAM)() * BIG_PARK_NAMES.length)], // its own stream: its name does not change when its size or trees do
    big: true,
    center: { x, z },
    width: rect.x1 - rect.x0,
    depth: rect.z1 - rect.z0,
    trees,
    monument,
    landmarks: ['Fountain', 'Monument', 'Great lawn'],
    visits: int(rand, 6000, 14000),
    boostPercent: BIG_PARK_BOOST_PERCENT,
    neighborIds: [],
  };
}

// Plots (and lots) within BIG_PARK_REACH of the big park share its foot traffic.
function applyBigParkBoost(park, plots) {
  const rect = { x0: park.center.x - park.width / 2, x1: park.center.x + park.width / 2, z0: park.center.z - park.depth / 2, z1: park.center.z + park.depth / 2 };
  for (const p of plots) {
    if (p.parkBoost) continue;
    const dx = Math.max(rect.x0 - p.x, 0, p.x - rect.x1);
    const dz = Math.max(rect.z0 - p.z, 0, p.z - rect.z1);
    if (Math.hypot(dx, dz) > BIG_PARK_REACH) continue;
    p.parkBoost = park.boostPercent;
    p.visits = Math.round(p.visits * (1 + park.boostPercent / 100));
    park.neighborIds.push(p.id);
  }
}

// Plots across the avenues from the park, and the ones beside it, share its foot traffic.
function applyParkBoost(park, plots) {
  const [r0, r1] = park.gridZ;
  for (const p of plots) {
    const touches = (p.cells ?? [[p.gridX, p.gridZ]]).some(([gx, gz]) => {
      const inColSpan = gx >= park.col0 - 1 && gx <= park.col1 + 1;
      const acrossRoad = (gz === r0 - 2 || gz === r1 + 2) && inColSpan;
      const beside = (gz === r0 || gz === r1) && (gx === park.col0 - 1 || gx === park.col1 + 1);
      return acrossRoad || beside;
    });
    if (!touches) continue;
    p.parkBoost = park.boostPercent;
    p.visits = Math.round(p.visits * (1 + park.boostPercent / 100));
    park.neighborIds.push(p.id);
  }
}

// One arterial cross street near the middle, two (spread apart) when there are four or more.
function arterialColumns(streetColumns) {
  const n = streetColumns.length;
  const picks = n <= 3 ? [Math.floor(n / 2)] : [1, n - 2];
  return new Set(picks.map((i) => streetColumns[i]));
}

// Traffic control by road class (standard practice):
//   arterial x arterial -> signal on every approach
//   arterial x local    -> two-way stop: only the local street stops, the arterial flows
//   local x local       -> all-way stop
// Approaches are named for where cars arrive from: west/east on x-roads, north/south on z-roads.
// `arms` says which of the four ways out of the junction exist. A road that ends at another one makes
// a T (three arms); two roads that end at each other make a corner (two arms, a plain bend).
const ARM_NAMES = ['west', 'east', 'north', 'south'];
const EPS = 1e-6;

// Where the x-road `h` and the z-road `v` meet, if they do: which of the junction's four arms exist.
function junctionArms(h, v) {
  if (v.center < h.from - EPS || v.center > h.to + EPS) return null;
  if (h.center < v.from - EPS || h.center > v.to + EPS) return null;
  const arms = {
    west: v.center > h.from + EPS,
    east: v.center < h.to - EPS,
    north: h.center > v.from + EPS,
    south: h.center < v.to - EPS,
  };
  return ARM_NAMES.filter((n) => arms[n]).length >= 2 ? arms : null;
}

function planIntersection(hIsArterial, vIsArterial, arms) {
  const present = ARM_NAMES.filter((n) => arms[n]);
  const set = (kind) => Object.fromEntries(ARM_NAMES.map((n) => [n, arms[n] ? kind(n) : null]));
  if (present.length === 2) return { control: 'free', approaches: set(() => 'free') }; // a bend: nobody crosses anybody
  if (present.length === 4) {
    if (hIsArterial && vIsArterial) return { control: 'signal', approaches: set(() => 'signal') };
    if (hIsArterial) return { control: 'two-way-stop', approaches: set((n) => (n === 'west' || n === 'east' ? 'free' : 'stop')) };
    if (vIsArterial) return { control: 'two-way-stop', approaches: set((n) => (n === 'west' || n === 'east' ? 'stop' : 'free')) };
    return { control: 'all-way-stop', approaches: set(() => 'stop') };
  }
  // a T: the road with both arms runs through, the other one ends against it
  const throughIsH = arms.west && arms.east;
  const throughArterial = throughIsH ? hIsArterial : vIsArterial;
  const stemArterial = throughIsH ? vIsArterial : hIsArterial;
  if (throughArterial && stemArterial) return { control: 'signal', approaches: set(() => 'signal') };
  if (throughArterial) return { control: 'two-way-stop', approaches: set((n) => ((n === 'west' || n === 'east') === throughIsH ? 'free' : 'stop')) };
  return { control: 'all-way-stop', approaches: set(() => 'stop') };
}

// Every place an x-road meets a z-road, with the pavement gaps cut into both.
function circleIntersection(c, arms) {
  const names = ['west', 'east', 'north', 'south'];
  return {
    id: c.id,
    x: c.x,
    z: c.z,
    arms,
    control: 'circle',
    approaches: { ...Object.fromEntries(names.map((n) => [n, arms[n] ? 'yield' : null])), ...Object.fromEntries(c.legs.map((l) => [l.key, 'yield'])) },
    diag: c.legs,
    circle: c.spec,
    phase: 0,
  };
}

function buildIntersections(roads, rand, circles = []) {
  for (const r of roads) r.gaps = [];
  const out = [];
  for (const h of roads.filter((r) => r.axis === 'x')) {
    for (const v of roads.filter((r) => r.axis === 'z')) {
      const arms = junctionArms(h, v);
      if (!arms) continue;
      const circle = circles.find((c) => c.avenue === h && c.street === v);
      if (circle) {
        out.push(circleIntersection(circle, arms));
        h.gaps.push([v.center - circle.spec.gap, v.center + circle.spec.gap]);
        v.gaps.push([h.center - circle.spec.gap, h.center + circle.spec.gap]);
        continue;
      }
      out.push({
        id: `x-${h.id}-${v.id}`,
        x: v.center,
        z: h.center,
        arms,
        ...planIntersection(h.class === 'arterial', v.class === 'arterial', arms),
        phase: rand() * 12, // signal timing offset so lights don't all change together
      });
      h.gaps.push([v.center - HALF_CORRIDOR, v.center + HALF_CORRIDOR]);
      v.gaps.push([h.center - HALF_CORRIDOR, h.center + HALF_CORRIDOR]);
    }
  }
  // circles that stand on an avenue between two streets
  for (const c of circles.filter((x) => !x.street)) {
    out.push(circleIntersection(c, { west: true, east: true, north: false, south: false }));
    c.avenue.gaps.push([c.x - c.spec.gap, c.x + c.spec.gap]);
  }
  for (const r of roads) r.gaps.sort((a, b) => a[0] - b[0]);
  return out;
}

// Positions along `road` of every junction on it.
function junctionsOn(road, roads) {
  const out = [];
  for (const q of roads) {
    if (q.axis === road.axis) continue;
    const arms = road.axis === 'x' ? junctionArms(road, q) : junctionArms(q, road);
    if (arms) out.push(q.center);
  }
  return out;
}

// Picks the groups of neighbouring cells that become prime plots. Candidates are every double-wide,
// double-deep and 2 x 2 arrangement of free cells; those with the most arterial or ring-road
// frontage come first (ties broken at random), then the first few of each kind that don't overlap
// are taken. `cellSet` holds the "gx,gz" keys of every free main-grid cell.
function pickPrimeGroups(rand, { avenueRows, cellSet, arterialCols, park }) {
  const key = (gx, gz) => `${gx},${gz}`;
  const has = (gx, gz) => cellSet.has(key(gx, gz));
  const arterialRows = new Set([...ARTERIAL_AVENUES].map((i) => avenueRows[i]));
  const firstRow = avenueRows[0] - 1;
  const lastRow = avenueRows[avenueRows.length - 1] + 1;

  const frontage = (cells) => {
    let score = 0;
    for (const [gx, gz] of cells) {
      const avenue = avenueRows.find((r) => Math.abs(gz - r) === 1); // the avenue this row's front door faces
      if (arterialRows.has(avenue)) score++;
      if (arterialCols.has(gx - 1) || arterialCols.has(gx + 1)) score++;
      if (gx === GRID_X_MIN || gx === GRID_X_MAX || gz === firstRow || gz === lastRow) score++; // faces a ring road
    }
    return score;
  };

  // cells beside the park are the best sites in the city
  const nearPark = (gx, gz) => Boolean(park) && gx >= park.col0 - 1 && gx <= park.col1 + 1 && gz >= Math.min(...park.gridZ) - 1 && gz <= Math.max(...park.gridZ) + 1;
  const candidates = { luxury: [], block: [], deep: [], wide: [] };
  const add = (kind, cells) => {
    if (!cells.every(([gx, gz]) => has(gx, gz))) return;
    const bonus = kind === 'luxury' ? cells.filter(([gx, gz]) => nearPark(gx, gz)).length * 3 : 0;
    candidates[kind].push({ kind, cells, score: frontage(cells) + bonus, jitter: rand() });
  };
  avenueRows.forEach((row, i) => {
    for (const gz of [row - 1, row + 1]) for (let gx = GRID_X_MIN; gx < GRID_X_MAX; gx++) add('wide', [[gx, gz], [gx + 1, gz]]);
    if (i < avenueRows.length - 1) {
      const rA = row + 1; // the two back-to-back rows between this avenue and the next
      const rB = row + 2;
      for (let gx = GRID_X_MIN; gx <= GRID_X_MAX; gx++) {
        add('deep', [[gx, rA], [gx, rB]]);
        if (gx < GRID_X_MAX) add('block', [[gx, rA], [gx + 1, rA], [gx, rB], [gx + 1, rB]]);
        if (gx <= GRID_X_MAX - 2) add('luxury', [[gx, rA], [gx + 1, rA], [gx + 2, rA], [gx, rB], [gx + 1, rB], [gx + 2, rB]]);
      }
    }
  });

  const used = new Set();
  const groups = [];
  const luxurySites = [];
  for (const kind of ['block', 'luxury', 'deep', 'wide']) {
    if (kind === 'luxury') {
      // estates belong next to the big plots (and the park, and open arterials): reward cells beside a large plot
      const big = new Set(groups.flatMap((g) => g.cells.map(([gx, gz]) => key(gx, gz))));
      const nearBig = (gx, gz) => [-1, 0, 1].some((dx) => [-1, 0, 1].some((dz) => big.has(key(gx + dx, gz + dz))));
      for (const c of candidates.luxury) c.score += c.cells.filter(([gx, gz]) => nearBig(gx, gz)).length * 2;
    }
    const ordered = candidates[kind].sort((a, b) => b.score - a.score || a.jitter - b.jitter);
    let taken = 0;
    // luxury: first spread well apart; if the grid is too cut up by streets for that, a second pass allows them closer
    for (const pass of kind === 'luxury' ? [0, 1] : [0]) for (const c of ordered) {
      if (taken >= (kind === 'luxury' ? LUXURY_COUNT : PRIME_COUNTS[kind])) break;
      if (c.cells.some(([gx, gz]) => used.has(key(gx, gz)))) continue;
      if (kind === 'luxury') {
        // spread them out: not within a few columns, or the neighbouring block, of another
        const cx = c.cells.reduce((s, [gx]) => s + gx, 0) / c.cells.length;
        const cz = c.cells.reduce((s, [, gz]) => s + gz, 0) / c.cells.length;
        if (luxurySites.some(([ox, oz]) => Math.abs(ox - cx) < (pass ? 0 : 6) && Math.abs(oz - cz) < (pass ? 0 : 5))) continue;
        luxurySites.push([cx, cz]);
      }
      c.cells.forEach(([gx, gz]) => used.add(key(gx, gz)));
      groups.push({ kind: c.kind, cells: c.cells, done: false, built: false });
      taken++;
    }
  }
  const luxuryGroups = groups.filter((g) => g.kind === 'luxury');
  for (const g of luxuryGroups.slice(Math.max(1, luxuryGroups.length - Math.min(LUXURY_BUILT, luxuryGroups.length - 1)))) g.built = true;
  return groups;
}

// --- filling the empty land -------------------------------------------------------------------
// Purchasable lots along the roads of the outer city: the "Outskirts" beside the ring roads, farm
// stands and cafes in the "Countryside" beside the county road and the country stretches of the
// arterials, and "Lakeside" lots round each lake. They are ordinary lots (a few start built).
const OUTSKIRTS = {
  id: 'outskirts',
  name: 'Outskirts',
  color: '#78716c',
  typeWeights: { office: 0.2, restaurant: 0.35, shop: 0.45 },
  palette: ['#78716c', '#a16207', '#0f766e'],
  categories: ['Services'],
  theme: 'office',
  prefixes: ['Ridge', 'Lakeside', 'Edge', 'Meadow', 'Harbor'],
  suffixes: ['Works', 'Depot', 'Partners', 'Studio'],
};
const COUNTRYSIDE = {
  id: 'countryside',
  name: 'Countryside',
  color: '#65a30d',
  typeWeights: { office: 0.05, restaurant: 0.4, shop: 0.55 },
  palette: ['#65a30d', '#a16207', '#b45309'],
  categories: ['Farm & Food'],
  theme: 'diner',
  prefixes: ['Orchard', 'Meadow', 'Barn', 'Hilltop', 'Creek', 'Harvest'],
  suffixes: ['Farm Stand', 'Market', 'Creamery', 'Cafe', 'Mill'],
};
const LAKESIDE = {
  id: 'lakeside',
  name: 'Lakeside',
  color: '#0ea5e9',
  typeWeights: { office: 0.15, restaurant: 0.45, shop: 0.4 },
  palette: ['#0ea5e9', '#14b8a6', '#6366f1'],
  categories: ['Hospitality'],
  theme: 'office',
  prefixes: ['Waterside', 'Reed', 'Heron', 'Mirror', 'Pier'],
  suffixes: ['Cafe', 'Studio', 'Boathouse', 'Lodge'],
};
const RIVERSIDE = {
  id: 'riverside',
  name: 'Riverside',
  color: '#06b6d4',
  typeWeights: { office: 0.25, restaurant: 0.4, shop: 0.35 },
  palette: ['#06b6d4', '#0ea5e9', '#14b8a6'],
  categories: ['Hospitality'],
  theme: 'office',
  prefixes: ['Quay', 'Wharf', 'Mill', 'Bridge', 'Embankment'],
  suffixes: ['Cafe', 'Lofts', 'Studio', 'Bistro'],
};
const DIAGONAL = {
  id: 'diagonal',
  name: 'Grand Diagonal',
  color: '#f43f5e',
  typeWeights: { office: 0.3, restaurant: 0.35, shop: 0.35 },
  palette: ['#f43f5e', '#fb7185', '#f59e0b'],
  categories: ['Landmark'],
  theme: 'office',
  prefixes: ['Circle', 'Plaza', 'Grand', 'Capitol', 'Monument', 'Rotunda'],
  suffixes: ['HQ', 'Gallery', 'Bistro', 'Boutique', 'Tower'],
};
// The new streets planned across the free ground between roads (lib/city/infill.js): a quiet quarter of ordinary lots.
const INFILL_DISTRICT = {
  id: 'meadow',
  name: 'Meadow Quarter',
  color: '#84cc16',
  typeWeights: { office: 0.2, restaurant: 0.35, shop: 0.45 },
  palette: ['#84cc16', '#22c55e', '#eab308'],
  categories: ['Neighbourhood'],
  theme: 'office',
  prefixes: ['Meadow', 'Clover', 'Willow', 'Maple', 'Fern', 'Hazel'],
  suffixes: ['Works', 'Studio', 'Cafe', 'Market', 'Partners'],
};
const INFILL_NAMES = ['Meadow Lane', 'Clover Way', 'Willow Court', 'Maple Row', 'Fern Street', 'Hazel Walk', 'Orchard Close', 'Linden Lane', 'Poppy Way', 'Cedar Row', 'Briar Lane', 'Sorrel Street'];
// How many lots the city is planned to have once the new streets are in (the tier shares in landPrice.js apply to this number), and how many lots the
// rest of the generator adds after the new streets are planned (roadside lots, lakeside lots, estates): measured on the default seeds.
const INFILL_TARGET = 1000;
const INFILL_OTHER_LOTS = 190;
const FRONTAGE_DISTRICT = { outskirts: OUTSKIRTS, country: COUNTRYSIDE, lake: LAKESIDE, riverside: RIVERSIDE, infill: INFILL_DISTRICT };
// A riverside drive runs beside the river: lots on its river side clear the bank (1.2) and a gap.
const DRIVE_OFFSET = 6.2;

const rectOf = (cx, cz, hw, hd) => ({ x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd });
const rectsOverlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.02 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.02;
const inflate = (r, m) => ({ x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m });
const corridorRect = (r) =>
  r.axis === 'x'
    ? { x0: r.from, x1: r.to, z0: r.center - HALF_CORRIDOR, z1: r.center + HALF_CORRIDOR }
    : { x0: r.center - HALF_CORRIDOR, x1: r.center + HALF_CORRIDOR, z0: r.from, z1: r.to };

// Everything a new lot or lake must stay clear of.
function obstacleRects({ roads, plots, billboards, parks = [], reserved, water = [], malls = [] }) {
  billboards = billboards.filter((b) => b.kind !== 'banner'); // banners fly: nothing stands where they are
  const rects = roads.map(corridorRect);
  for (const p of plots) {
    // a turned lot (along a diagonal or curve) needs its enclosing box, not its unturned footprint
    const c = Math.abs(Math.cos(p.yaw ?? 0));
    const sn = Math.abs(Math.sin(p.yaw ?? 0));
    rects.push(rectOf(p.x, p.z, (p.w * c + p.d * sn) / 2, (p.w * sn + p.d * c) / 2));
  }
  for (const b of billboards) {
    // a billboard is a thin slab, turned to face along a road; leave a little room round it
    rects.push(b.yaw ? rectOf(b.x, b.z, 0.9, b.width / 2 + 0.3) : rectOf(b.x, b.z, b.width / 2 + 0.3, 0.9));
  }
  for (const pk of parks) rects.push(rectOf(pk.center.x, pk.center.z, pk.width / 2, pk.depth / 2));
  for (const a of reserved) rects.push({ x0: a.x0 - 1, x1: a.x1 + 1, z0: a.z0 - 1, z1: a.z1 + 1 });
  for (const m of malls) rects.push(inflate(m.rect, 0.4));
  for (const w of water) rects.push(w);
  return rects;
}

// The parts of [a, b] that fall inside `ranges` (or all of it when there are none) and are long enough for a lot.
function clipRanges(a, b, ranges) {
  const out = ranges ? ranges.map(([ra, rb]) => [Math.max(a, ra), Math.min(b, rb)]) : [[a, b]];
  return out.filter(([x, y]) => y - x >= PLOT_TILE);
}

// Candidate lots beside every road that asks for them (`road.frontage`), packed from the start of each
// stretch between junctions, each touching the road's pavement like the main grid does. Anything that
// would overlap another road, a plot, a billboard, the park, the water or the reserved land is dropped.
function frontageLots(rand, roads, obstacles) {
  const lots = [];
  const perGroup = new Map();
  for (const r of roads) {
    if (!r.frontage) continue;
    for (const side of r.sides ?? [-1, 1]) {
      const offset = side * (ROW_OFFSET + (r.setback ?? 0));
      const pitch = r.pitch ?? PLOT_PITCH;
      for (const [a0, b0] of blocksBetween(r.from, r.to, r.gaps)) {
        for (const [a, b] of clipRanges(a0, b0, r.rural)) {
          for (let u = a + PLOT_TILE / 2; u + PLOT_TILE / 2 <= b + 1e-9; u += pitch) {
            if (r.group && (perGroup.get(r.group) ?? 0) >= MAX_LAKESIDE_LOTS) continue;
            const x = r.axis === 'x' ? u : r.center + offset;
            const z = r.axis === 'x' ? r.center + offset : u;
            const rect = rectOf(x, z, PLOT_TILE / 2, PLOT_TILE / 2);
            if (obstacles.some((o) => rectsOverlap(rect, o))) continue;
            if (r.density < 1 && rand() > r.density) continue;
            obstacles.push(rect);
            if (r.group) perGroup.set(r.group, (perGroup.get(r.group) ?? 0) + 1);
            // the front door looks at the road: along Z for east-west roads, turned a quarter for north-south ones
            if (r.axis === 'x') lots.push({ x, z, facing: side < 0 ? 1 : -1, yaw: 0, frontage: r.frontage, road: r.id, side });
            else lots.push({ x, z, facing: 1, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, frontage: r.frontage, road: r.id, side });
          }
        }
      }
    }
  }
  return lots;
}

// --- sites beside roads: reserved land and roadside estates -------------------------------------------
// `rect` grown by `m` on every side except the one facing road `r` (on `side`): the road is no obstacle to its own roadside site.
function inflateAway(rect, r, side, m) {
  const out = inflate(rect, m);
  if (r.axis === 'x') {
    if (side < 0) out.z1 = rect.z1;
    else out.z0 = rect.z0;
  } else if (side < 0) out.x1 = rect.x1;
  else out.x0 = rect.x0;
  return out;
}

// A rectangle `across` deep and `along` long, flush against one side of road `r` (`gap` from its pavement), at
// position `u` along it. Returns the rectangle and how a building in it should be turned.
function roadsideRect(r, side, u, along, across, gap = 0) {
  const near = HALF_CORRIDOR + gap;
  const far = near + across;
  if (r.axis === 'x') {
    const z0 = side < 0 ? r.center - far : r.center + near;
    const rect = { x0: u, x1: u + along, z0, z1: z0 + across };
    return { rect, x: u + along / 2, z: z0 + across / 2, yaw: 0, facing: side < 0 ? 1 : -1 };
  }
  const x0 = side < 0 ? r.center - far : r.center + near;
  const rect = { x0, x1: x0 + across, z0: u, z1: u + along };
  return { rect, x: x0 + across / 2, z: u + along / 2, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, facing: 1 };
}

// Two reserved sites for the player's own road and plot. Each is 34 x 30, runs along an arterial (the through
// roads: they carry the most traffic and the most people), with a clear frontage (no junction along it).
// Sites nearer the city centre and on busier roads score higher; the two are kept well apart.
function planReservedSites(rand, roads, obstacles, centre) {
  const cands = [];
  for (const r of roads) {
    // the through roads: arterials carry the most traffic and people; the county road ring carries some
    const traffic = r.class === 'arterial' ? (r.kind === 'ring' ? 2.2 : r.kind === 'drive' ? 2 : 2.4) : r.kind === 'county' ? 1.2 : 0;
    if (!traffic) continue;
    const junctions = junctionsOn(r, roads);
    for (const side of [-1, 1]) {
      // the site can run 34 along the road and 30 deep, or 30 along it and 34 deep
      for (const [LEN, DEPTH] of [RESERVED_SIZE, [RESERVED_SIZE[1], RESERVED_SIZE[0]]]) {
        for (let u = r.from + 3; u + LEN <= r.to - 3; u += 3) {
          if (junctions.some((j) => j > u - 2.5 && j < u + LEN + 2.5)) continue;
          const site = roadsideRect(r, side, u, LEN, DEPTH, RESERVED_GAP);
          if (obstacles.some((o) => rectsOverlap(inflate(site.rect, 1), o))) continue;
          const d = Math.hypot(site.x - centre.x, site.z - centre.z);
          cands.push({ ...site, road: r, side, score: traffic * 10 - d * 0.06 + rand() * 2 });
        }
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const c of cands) {
    if (chosen.length >= RESERVED_COUNT) break;
    if (chosen.some((o) => o.road === c.road || Math.hypot(o.x - c.x, o.z - c.z) < 70)) continue; // different road, well apart
    chosen.push(c);
  }
  // Every site has a number and an ID code (SD-0001 ...) so it can be told apart and talked about. The last one is the pop-up market.
  return chosen.map((c, i) => ({
    id: `reserved-${i + 1}`,
    number: i + 1,
    code: `SD-${String(i + 1).padStart(4, '0')}`,
    market: i === chosen.length - 1,
    label: i === chosen.length - 1 ? 'Pop-up market' : 'Reserved: your road & plot',
    x0: c.rect.x0,
    x1: c.rect.x1,
    z0: c.rect.z0,
    z1: c.rect.z1,
    frontRoad: c.road.id,
    frontSide: c.side,
  }));
}

// Estates (luxury or grand) beside roads. `accept(road)` says which roads qualify and `sides(road)` which sides of
// it to try. At most `perFeature` per water feature / road, spread apart, nearest the city centre first. Each one is
// flush against the pavement and faces the road; its rectangle is added to `obstacles`.
function placeEstates(rand, roads, obstacles, { size, count, accept, sides, centre, perFeature = 1 }) {
  const [W, D] = size;
  const cands = [];
  for (const r of roads) {
    if (!accept(r)) continue;
    for (const side of sides(r)) {
      for (const [a0, b0] of blocksBetween(r.from, r.to, r.gaps)) {
        for (const [a, b] of clipRanges(a0, b0, r.rural)) {
          for (let u = a + 0.5; u + W <= b - 0.5; u += 2) {
            const site = roadsideRect(r, side, u, W, D, 0);
            if (obstacles.some((o) => rectsOverlap(inflateAway(site.rect, r, side, 0.25), o))) continue;
            const dist = Math.hypot(site.x - centre.x, site.z - centre.z);
            cands.push({ ...site, road: r, side, score: -dist * 0.03 + rand() * 3 });
          }
        }
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const chosen = [];
  const perGroup = new Map();
  for (const c of cands) {
    if (chosen.length >= count) break;
    const group = c.road.group ?? c.road.id;
    if ((perGroup.get(group) ?? 0) >= perFeature) continue;
    if (chosen.some((o) => rectsOverlap(inflate(o.rect, 3), c.rect) || Math.hypot(o.x - c.x, o.z - c.z) < 30)) continue;
    chosen.push(c);
    perGroup.set(group, (perGroup.get(group) ?? 0) + 1);
  }
  for (const c of chosen) obstacles.push(inflateAway(c.rect, c.road, c.side, 0.3));
  return chosen;
}

// --- airports -----------------------------------------------------------------------------------------
// Two small airports stand outside the county road, each reached by a spur from it. Seen from the county road
// outwards (n is the distance outwards, t the distance along the road), an airport is:
//   n   2.5 .. 10    a spur road in from the county road
//   n  10 .. 29      the terminal block, ringed by a closed loop road (the spur meets the loop at a T)
//   n  30 .. 37      the apron (concrete, planes parked here), with a hangar at each end
//   n  38.7 .. 43.3  the runway, 64 long, parallel to the county road
const AIRPORT_NAMES = ['Voxel Field', 'Hillside Aerodrome', 'Crossroads Airfield', 'Lakeview Regional', 'Pixel Heights Airport'];
const INTL_NAMES = ['Voxel International', 'Capital International', 'Pixel Heights International'];
// A regional airport, and the one international airport (the first of the two): a longer, wider runway, a bigger terminal and
// tower, four hangars, a wider apron and parked airliners. Positions are along the runway (t) and out from the county road (n).
const AIRPORT = { half: 36, depth: 46, runwayLength: 64, runwayWidth: 4.6, runwayN: 41, blockN: 19.5, block: [10, 5], terminal: [10, 5], terminalT: -5, towerT: 2.2, hangarsT: [-24, 24], apronT: [-30, 30], windsockT: 31, airlinersT: [] };
const AIRPORT_INTL = { ...AIRPORT, half: 64, runwayLength: 116, runwayWidth: 7, block: [16, 5], terminal: [24, 6], terminalT: 0, towerT: 14.5, hangarsT: [-31, -42, 31, 42], apronT: [-54, 54], windsockT: 59, airlinersT: [-20, 20] };

function planAirports(rand, roads, obstacles, county, river, fronts = []) {
  const sides = {
    north: { n: [0, -1], t: [1, 0], c: county.z0, lo: county.x0, hi: county.x1 },
    south: { n: [0, 1], t: [1, 0], c: county.z1, lo: county.x0, hi: county.x1 },
    west: { n: [-1, 0], t: [0, 1], c: county.x0, lo: county.z0, hi: county.z1 },
    east: { n: [1, 0], t: [0, 1], c: county.x1, lo: county.z0, hi: county.z1 },
  };
  const opposite = { north: 'south', south: 'north', west: 'east', east: 'west' };
  const order = shuffle(rand, Object.keys(sides));
  const wanted = [order[0], rand() < 0.6 ? opposite[order[0]] : order[1]];
  const names = shuffle(rand, AIRPORT_NAMES);
  const intlName = pick(rand, INTL_NAMES);
  const airports = [];
  const added = [];

  // each airport tries its own side first, then the others (the international airport is the hardest to fit)
  const placeOn = (sideName, idx) => {
    const side = sides[sideName];
    const spec = idx === 0 ? AIRPORT_INTL : AIRPORT; // the first is the international airport
    for (let attempt = 0; attempt < 120; attempt++) {
      const tc = side.lo + spec.half + 12 + rand() * (side.hi - side.lo - 2 * (spec.half + 12));
      // local (t, n) to world; the origin is the county road's centre line at tc
      const origin = side.n[0] === 0 ? { x: tc, z: side.c } : { x: side.c, z: tc };
      const at = (t, n) => ({ x: origin.x + side.t[0] * t + side.n[0] * n, z: origin.z + side.t[1] * t + side.n[1] * n });
      const box = (t0, t1, n0, n1) => {
        const a = at(t0, n0);
        const b = at(t1, n1);
        return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) };
      };
      const whole = box(-spec.half, spec.half, 2.5, spec.depth);
      if (obstacles.some((o) => rectsOverlap(inflate(whole, 1), o))) continue;

      const id = `airport-${idx + 1}`;
      const name = idx === 0 ? intlName : names[idx];
      const centre = at(0, spec.blockN);
      const alongX = side.t[0] === 1; // the runway runs along x
      const blockLike = { id, name, x: centre.x, z: centre.z, rx: alongX ? spec.block[0] : spec.block[1], rz: alongX ? spec.block[1] : spec.block[0] };
      const plan = planLoopAndSpur(blockLike, [...roads, ...added], obstacles, river, fronts, { kind: 'airport', frontage: null, loopName: `${name} Loop` });
      if (!plan) continue;
      for (const r of plan.roads) r.labelAt = null; // the airport's name label stands on its terminal instead
      added.push(...plan.roads);

      // the airside buildings and surfaces, in world rectangles
      const solid = (t, n, w, d) => {
        const c = at(t, n);
        return { x: c.x, z: c.z, w: alongX ? w : d, d: alongX ? d : w };
      };
      const rwyEnds = [at(-spec.runwayLength / 2, spec.runwayN), at(spec.runwayLength / 2, spec.runwayN)];
      const airport = {
        id,
        name,
        side: sideName,
        axis: alongX ? 'x' : 'z', // the runway's direction
        centre,
        rect: whole,
        runway: { ...box(-spec.runwayLength / 2, spec.runwayLength / 2, spec.runwayN - spec.runwayWidth / 2, spec.runwayN + spec.runwayWidth / 2), length: spec.runwayLength, width: spec.runwayWidth, ends: rwyEnds },
        apron: box(spec.apronT[0], spec.apronT[1], 30.5, 37),
        terminal: solid(spec.terminalT, spec.blockN, spec.terminal[0], spec.terminal[1]),
        tower: solid(spec.towerT, spec.blockN, 2, 2),
        hangars: spec.hangarsT.map((t) => solid(t, 33.5, 9, 5)),
        // parked airliners on the international apron (scenery: solid, but not the banner planes)
        airliners: spec.airlinersT.map((t) => ({ ...solid(t, 34, 8.5, 7), yaw: 0 })),
        international: idx === 0,
        windsock: at(spec.windsockT, 44.5),
        parking: [at(-9, 34), at(9, 34)],
        taxiTo: [at(-9, 38.7 - 1), at(9, 38.7 - 1)],
        // the airport's own frame, for the flight paths: where the runway is and which way is "in" (towards the county road)
        frame: { origin, t: side.t, n: side.n, runwayN: spec.runwayN, runwayHalf: spec.runwayLength / 2 },
      };
      airports.push(airport);
      for (const r of plan.roads) obstacles.push(corridorRect(r));
      obstacles.push(whole);
      return true;
    }
    return false;
  };
  wanted.forEach((sideName, idx) => {
    for (const trySide of [sideName, ...order.filter((x) => x !== sideName)]) if (placeOn(trySide, idx)) break;
  });
  return { airports, roads: added };
}

// --- the hills ------------------------------------------------------------------------------------------
// A range of low hills in the north-east, outside the county road: a flat meadow ringed by a loop road ("Ridge Loop"), joined to the
// road network by a straight spur ("Ridge Rd") that runs in between the hills. The hills are a heightfield (lib/city/hills.js): level along
// every road and the meadow, rising to at most HILL_MAX on either side, and falling to the ground at the edge of the area.
// It is placed after everything else is final and draws only on its own random stream, so it changes nothing already planned except
// the size of the land round it.
const HILLS = { rx: 9, rz: 6, padX: 24, padZ: 22 }; // the meadow, and how far the hills run out from the loop road
function planHighlands(seed, roads, obstacles, county, river, fronts) {
  const rand = forkRand(seed, 9001);
  const halfX = HILLS.rx + LAKE_LOOP_GAP + HILLS.padX;
  const halfZ = HILLS.rz + LAKE_LOOP_GAP + HILLS.padZ;
  const countyRect = inflate({ x0: county.x0, x1: county.x1, z0: county.z0, z1: county.z1 }, 4);
  // the north-east first; only if no spot there is free (a river, an airport) does it look further along the north side
  const candidates = [];
  for (const xMin of [county.x1 - 35, county.x1 - 70]) {
    const found = [];
    for (let x = xMin; x <= county.x1 + 60; x += 4) {
      for (let z = county.z0 - 80; z <= county.z0 + 75; z += 4) {
        const area = rectOf(x, z, halfX, halfZ);
        if (rectsOverlap(area, countyRect)) continue; // outside the county road
        if (candidates.some((q) => q.x === x && q.z === z)) continue;
        found.push({ x, z, score: x - county.x1 + (county.z0 - z) + rand() * 8 }); // the further north-east the better
      }
    }
    candidates.push(...found.sort((p, q) => q.score - p.score));
  }
  for (const c of candidates) {
    const area = rectOf(c.x, c.z, halfX, halfZ);
    if (obstacles.some((o) => rectsOverlap(inflate(area, 1), o))) continue;
    const block = { id: 'highlands', name: 'Ridge', x: c.x, z: c.z, rx: HILLS.rx, rz: HILLS.rz };
    const plan = planLoopAndSpur(block, roads, obstacles, river, fronts, { kind: 'highland', frontage: null, loopName: 'Ridge Loop' });
    if (!plan) continue;
    for (const r of plan.roads) if (r.kind === 'highland' && r.id !== 'highlands-n') r.labelAt = null;
    // the hills flank the whole spur as well as ringing the loop: the area is the loop's area and a band either side of the spur, joined
    const spur = plan.roads.find((r) => r.kind === 'spur');
    // (it stops short of the road it joins, whose own corridor is clear ground)
    const trim = spur ? corridorRect({ ...spur, from: Math.min(spur.from, spur.to) + 4, to: Math.max(spur.from, spur.to) - 4 }) : null;
    const band = trim ? (spur.axis === 'x' ? { ...trim, z0: trim.z0 - HILLS.padZ, z1: trim.z1 + HILLS.padZ } : { ...trim, x0: trim.x0 - HILLS.padZ, x1: trim.x1 + HILLS.padZ }) : area;
    const whole = { x0: Math.min(area.x0, band.x0), x1: Math.max(area.x1, band.x1), z0: Math.min(area.z0, band.z0), z1: Math.max(area.z1, band.z1) };
    if (obstacles.some((o) => rectsOverlap(inflate(whole, 1), o))) continue;
    // level ground along the new roads and along any other road that runs by the hills (the county road)
    const flat = [...plan.roads, ...roads.filter((r) => rectsOverlap(inflate(whole, HILL_VERGE + HILL_SLOPE), corridorRect(r)))].map(corridorRect);
    flat.push(rectOf(c.x, c.z, HILLS.rx + LAKE_LOOP_GAP, HILLS.rz + LAKE_LOOP_GAP)); // the meadow inside the loop
    const hills = {
      id: 'hills-1',
      name: 'Ridge Hills',
      rect: whole,
      flat,
      seed: Math.floor(rand() * 1e6),
      amp: HILL_MAX,
    };
    return { roads: plan.roads, hills, area: whole };
  }
  return { roads: [], hills: null, area: null };
}

// --- landscaping ---------------------------------------------------------------------------------------
// Greenery that is part of the land rather than of a plot: trees along the country roads, the riverside drive,
// the ring roads and the roads round the lakes and airports (wherever the verge is free), and shrubs along the
// river banks and lake shores. Plot gardens (corner shrubs, front hedges, a tree on an empty lot) are drawn with
// the plots themselves (components/city/Plots.jsx).
const LEAF_COLOURS = ['#15803d', '#16a34a', '#22c55e', '#4d7c0f', '#166534'];
const SHRUB_COLOURS = ['#166534', '#15803d', '#4d7c0f', '#3f6212'];
const TREE_ROAD_KINDS = new Set(['county', 'spur', 'drive', 'lake', 'airport', 'ring', 'highland']);

function buildLandscape(rand, roads, obstacles, { river, riverRect, bridges, lakes }) {
  const trees = [];
  const bushes = [];
  const taken = [];
  // (shrubs may stand on the river's banks, which lie inside its keep-clear rectangle)
  const free = (rect, allowRiverBank = false) => !obstacles.some((o) => !(allowRiverBank && o === riverRect) && rectsOverlap(rect, o)) && !taken.some((q) => rectsOverlap(rect, q));

  // trees on the verge of the through roads, both sides, well away from junctions and anything built
  for (const r of roads) {
    const countryArterial = r.rural && r.rural.length > 0;
    if (!TREE_ROAD_KINDS.has(r.kind) && !countryArterial) continue;
    for (const side of [-1, 1]) {
      for (const [a0, b0] of blocksBetween(r.from, r.to, r.gaps)) {
        for (const [a, b] of clipRanges(a0, b0, TREE_ROAD_KINDS.has(r.kind) ? null : r.rural)) {
          for (let u = a + 2.4 + rand() * 2; u < b - 2.4; u += 5 + rand() * 2.2) {
            if (rand() < 0.12) continue; // a few gaps, so it is not a perfect avenue
            const size = 0.55 + rand() * 0.4;
            const off = side * (HALF_CORRIDOR + 0.45 + size / 2);
            const x = r.axis === 'x' ? u : r.center + off;
            const z = r.axis === 'x' ? r.center + off : u;
            const rect = rectOf(x, z, size / 2 + 0.15, size / 2 + 0.15);
            if (!free(rect)) continue;
            taken.push(rect);
            trees.push({ x, z, size, trunk: 0.4 + size * 0.5, color: pick(rand, LEAF_COLOURS) });
          }
        }
      }
    }
  }

  // shrubs on the river banks, leaving the bridges clear
  const bridgeAt = (x, z) => bridges.some((br) => (br.axis === 'x' ? Math.abs(x - (br.u0 + br.u1) / 2) < (br.u1 - br.u0) / 2 + 2.6 && Math.abs(z - br.center) < 3 : Math.abs(z - (br.u0 + br.u1) / 2) < (br.u1 - br.u0) / 2 + 2.6 && Math.abs(x - br.center) < 3));
  const shrub = (x, z) => {
    const w = 0.45 + rand() * 0.4;
    const rect = rectOf(x, z, w / 2 + 0.1, w / 2 + 0.1);
    const onRiver = rectsOverlap(rect, { x0: river.x0, x1: river.x1, z0: river.z0, z1: river.z1 });
    if (onRiver || bridgeAt(x, z) || !free(rect, true)) return;
    taken.push(rect);
    bushes.push({ x, z, w, h: 0.3 + rand() * 0.25, color: pick(rand, SHRUB_COLOURS) });
  };
  for (const edge of river.axis === 'z' ? [river.x0 - 1.5, river.x1 + 1.5] : [river.z0 - 1.5, river.z1 + 1.5]) {
    const from = river.axis === 'z' ? river.z0 : river.x0;
    const to = river.axis === 'z' ? river.z1 : river.x1;
    for (let u = from + 2; u < to - 2; u += 2.6 + rand() * 1.8) {
      const across = edge + (rand() - 0.5) * 0.6;
      if (river.axis === 'z') shrub(across, u);
      else shrub(u, across);
    }
  }
  // shrubs round each lake's shore, just outside the sand
  for (const l of lakes) {
    const hw = l.rx + 1.7;
    const hd = l.rz + 1.7;
    const perimeter = 4 * (hw + hd);
    for (let s = 0; s < perimeter; s += 2.4 + rand() * 1.6) {
      let t = s;
      let x;
      let z;
      if (t < 2 * hw) [x, z] = [l.x - hw + t, l.z - hd];
      else if ((t -= 2 * hw) < 2 * hd) [x, z] = [l.x + hw, l.z - hd + t];
      else if ((t -= 2 * hd) < 2 * hw) [x, z] = [l.x + hw - t, l.z + hd];
      else [x, z] = [l.x - hw, l.z + hd - (t - 2 * hw)];
      shrub(x, z);
    }
  }
  return { trees, bushes };
}

// --- the diagonal avenue ------------------------------------------------------------------------------
const distToRect = (x, z, r) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
function segmentNearRect(a, b, rect, d) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / 0.4));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (distToRect(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, rect) < d) return true;
  }
  return false;
}

// A chain of two to four circles on neighbouring avenues, each about one block sideways from the last,
// so the avenue between them runs diagonally across the middle of one block and never meets another
// road. A circle sits on a street where one is in the right place, otherwise on the avenue itself.
// Returns null if nothing fits (it always has in the cities tried).
function planDiagonal(rand, { avenues, streets, xMin, xMax, avoid = [] }) {
  const streetXs = streets.map((s) => s.center);
  for (let attempt = 0; attempt < 700; attempt++) {
    const steps = 1; // two circles at most: a longer chain put too many circles in one area
    const first = int(rand, 0, avenues.length - 1 - steps);
    const sgn = rand() < 0.5 ? -1 : 1;
    const nodes = [];
    let x = rand() < 0.6 ? pick(rand, streetXs) : xMin + 12 + rand() * (xMax - xMin - 24);
    let ok = true;
    for (let k = 0; k <= steps && ok; k++) {
      const avenue = avenues[first + k];
      let street = null;
      if (k > 0) {
        const prev = nodes[k - 1].x;
        // candidate spots one block sideways: a street if one is in range, then free spots along the avenue
        const lo = prev + sgn * DIAG_DX[0];
        const hi = prev + sgn * DIAG_DX[1];
        const candidates = streets.filter((st) => st.center >= Math.min(lo, hi) - 1e-9 && st.center <= Math.max(lo, hi) + 1e-9).map((st) => ({ x: st.center, street: st }));
        const free = shuffle(rand, Array.from({ length: 8 }, (_, i) => ({ x: prev + sgn * (DIAG_DX[0] + (i / 7) * (DIAG_DX[1] - DIAG_DX[0])), street: null })));
        const valid = (c) =>
          c.x >= xMin && c.x <= xMax &&
          // a street strictly between the two circles would be crossed by the avenue
          !streets.some((st) => st.center > Math.min(prev, c.x) + 0.5 && st.center < Math.max(prev, c.x) - 0.5) &&
          (c.street || !streetXs.some((sx) => Math.abs(sx - c.x) < CIRCLE_SPACING));
        const pickOne = [...(rand() < 0.85 ? candidates : []), ...free, ...candidates].find(valid);
        if (!pickOne) {
          ok = false;
          break;
        }
        x = pickOne.x;
        street = pickOne.street;
      } else {
        street = streets.find((st) => Math.abs(st.center - x) < 1e-9) ?? null;
        if (!street && streetXs.some((c) => Math.abs(c - x) < CIRCLE_SPACING)) ok = false; // too close to a street to stand on its own
        if (x < xMin || x > xMax) ok = false;
      }
      nodes.push({ x, z: avenue.center, avenue, street, spec: CIRCLE });
    }
    if (!ok) continue;
    if (avoid.length) {
      const near = (n) => avoid.some((r) => distToRect(n.x, n.z, r) < CIRCLE.clear + 0.5);
      if (nodes.some(near)) continue;
      let hit = false;
      for (let k = 0; k < nodes.length - 1; k++) if (avoid.some((r) => segmentNearRect(nodes[k], nodes[k + 1], r, 2))) hit = true;
      if (hit) continue;
    }
    return nodes;
  }
  return null;
}

// Plots on the line of the diagonal, or too close to a circle, are cleared away; new lots then fill
// the wedges: along both sides of each stretch of avenue and round each circle, facing it.
function carveDiagonal(rand, chain, nodes, plots, roads, park, bounds) {
  const segs = [];
  for (let k = 0; k < chain.length - 1; k++) {
    const a = chain[k];
    const b = chain[k + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    segs.push({ k, p0: { x: a.x, z: a.z }, p1: { x: b.x, z: b.z }, length, dir: [(b.x - a.x) / length, (b.z - a.z) / length] });
  }
  const rectOfPlot = (p) => ({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 });
  const kept = plots.filter((p) => {
    const r = rectOfPlot(p);
    if (nodes.some((n) => distToRect(n.x, n.z, r) < n.spec.clear)) return false;
    return !segs.some((s) => segmentNearRect(s.p0, s.p1, r, HALF_CORRIDOR + 0.15));
  });
  const removed = new Set(plots.filter((p) => !kept.includes(p)).map((p) => p.id));
  plots.splice(0, plots.length, ...kept);
  if (park) park.neighborIds = park.neighborIds.filter((id) => !removed.has(id));

  // what new lots must stay clear of
  const asBox = (r) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, hw: (r.x1 - r.x0) / 2, hd: (r.z1 - r.z0) / 2, yaw: 0 });
  const blockers = [
    ...roads.map((r) => asBox(corridorRect(r))),
    ...plots.map((p) => asBox(rectOfPlot(p))),
    ...segs.map((s) => ({ x: (s.p0.x + s.p1.x) / 2, z: (s.p0.z + s.p1.z) / 2, hw: HALF_CORRIDOR + 0.2, hd: s.length / 2, yaw: Math.atan2(s.dir[0], s.dir[1]) })),
  ];
  if (park) blockers.push({ x: park.center.x, z: park.center.z, hw: park.width / 2, hd: park.depth / 2, yaw: 0 });

  const lots = [];
  // new lots stay inside the plot grid, clear of the billboards and the ring roads beyond it
  const inBounds = (x, z) => x > bounds.x0 + 2.2 && x < bounds.x1 - 2.2 && z > bounds.z0 + 2.2 && z < bounds.z1 - 2.2;
  const tryLot = (x, z, yaw) => {
    if (nodes.some((n) => Math.hypot(n.x - x, n.z - z) < n.spec.clear + 2.1)) return; // not inside any circle's clear zone (the rings below are placed at exactly the right radius)
    if (!inBounds(x, z)) return;
    const box = { x, z, hw: PLOT_TILE / 2, hd: PLOT_TILE / 2, yaw };
    if (blockers.some((b) => boxesOverlap(box, b))) return;
    blockers.push(box);
    lots.push({ x, z, yaw });
  };
  // lots round each circle stand straight (square to the streets, not turned to follow the ring), in the corners the
  // crossing leaves, on the same lattice as the grid; their doors look along Z towards the circle's centre line
  for (const n of nodes.filter((x) => x.spec === CIRCLE)) {
    for (let i = -3; i <= 3; i++) {
      for (let k = -3; k <= 3; k++) {
        const dx = i * PLOT_PITCH;
        const dz = k * PLOT_PITCH;
        const nearest = Math.hypot(Math.max(Math.abs(dx) - PLOT_TILE / 2, 0), Math.max(Math.abs(dz) - PLOT_TILE / 2, 0));
        if (nearest < CIRCLE.outer + 0.5 || Math.hypot(dx, dz) > CIRCLE.outer + 0.5 + PLOT_TILE * 1.6) continue;
        const x = n.x + dx;
        const z = n.z + dz;
        if (!inBounds(x, z)) continue;
        const box = { x, z, hw: PLOT_TILE / 2, hd: PLOT_TILE / 2, yaw: 0 };
        if (blockers.some((b) => boxesOverlap(box, b))) continue;
        blockers.push(box);
        lots.push({ x, z, yaw: 0, facing: dz === 0 ? 1 : dz > 0 ? -1 : 1 });
      }
    }
  }
  // along each stretch of avenue, both sides
  for (const s of segs) {
    const from = CIRCLE.outer + 4.6; // the turned lots along the diagonal start well clear of the circles, where the straight ones end
    const len = s.length - 2 * from;
    if (len < PLOT_TILE) continue;
    const curve = sampleCurve({ start: { x: s.p0.x + s.dir[0] * from, z: s.p0.z + s.dir[1] * from, heading: Math.atan2(s.dir[0], s.dir[1]) }, segments: [{ line: len }] });
    for (const side of ['left', 'right']) for (const c of plotsAlong(curve, { side })) tryLot(c.x, c.z, c.yaw);
  }
  return { segs, lots };
}

// --- water: a river with bridges, and rectangular lakes ringed by a road ---------------------------------
// The river runs straight across one side of the country belt, wall to wall of the land. Every road
// that crosses it gets a bridge.
function planRiver(rand, { county, ringW, ringN, ringS, eastEdge }) {
  const side = pick(rand, ['west', 'east', 'north', 'south']);
  const width = 11 + rand() * 3;
  const wobble = (rand() - 0.5) * 6;
  const FAR = 400; // clipped to the land once that is known
  const name = pick(rand, RIVER_NAMES);
  if (side === 'west' || side === 'east') {
    const c = (side === 'west' ? (county.x0 + ringW) / 2 : (eastEdge + county.x1) / 2) + wobble;
    return { id: 'river-1', name, axis: 'z', side, width, x0: c - width / 2, x1: c + width / 2, z0: county.z0 - FAR, z1: county.z1 + FAR };
  }
  const c = (side === 'north' ? (county.z0 + ringN) / 2 : (ringS + county.z1) / 2) + wobble;
  return { id: 'river-1', name, axis: 'x', side, width, x0: county.x0 - FAR, x1: county.x1 + FAR, z0: c - width / 2, z1: c + width / 2 };
}

// Where each road crosses the river: the stretch of the road that is a bridge.
function bridgesOver(river, roads) {
  const bridges = [];
  for (const r of roads) {
    if (r.axis === river.axis) continue; // runs alongside it
    const lo = river.axis === 'z' ? river.x0 : river.z0;
    const hi = river.axis === 'z' ? river.x1 : river.z1;
    if (r.from < lo - 2 && r.to > hi + 2) bridges.push({ id: `bridge-${r.id}`, roadId: r.id, axis: r.axis, center: r.center, u0: lo, u1: hi, riverId: river.id });
  }
  return bridges;
}

// Lakes: rasterise the country, find the biggest free squares, and put a rectangular lake in a few of
// them (spread apart). Each lake is ringed by a closed four-sided road (all four corners are junctions)
// and joined to the network by a straight spur that meets another road at a T. Returns the lakes and the
// roads they add.
function planLakes(rand, roads, obstacles, county, riverSpan, fronts = []) {
  const x0 = Math.floor(county.x0);
  const z0 = Math.floor(county.z0);
  const cols = Math.ceil(county.x1 - x0);
  const rows = Math.ceil(county.z1 - z0);
  const blocked = new Uint8Array(cols * rows);
  const mark = (r, margin) => {
    for (let cz = Math.max(0, Math.floor(r.z0 - margin - z0)); cz <= Math.min(rows - 1, Math.floor(r.z1 + margin - z0)); cz++) {
      for (let cx = Math.max(0, Math.floor(r.x0 - margin - x0)); cx <= Math.min(cols - 1, Math.floor(r.x1 + margin - x0)); cx++) blocked[cz * cols + cx] = 1;
    }
  };
  for (const r of obstacles) mark(r, LOT_BAND);
  // size of the biggest free square whose bottom-right corner is each cell
  const square = new Int16Array(cols * rows);
  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      if (blocked[cz * cols + cx]) continue;
      square[cz * cols + cx] = cx && cz ? 1 + Math.min(square[cz * cols + cx - 1], square[(cz - 1) * cols + cx], square[(cz - 1) * cols + cx - 1]) : 1;
    }
  }
  const midX = (county.x0 + county.x1) / 2;
  const midZ = (county.z0 + county.z1) / 2;
  const candidates = [];
  for (let cz = 0; cz < rows; cz += 2) {
    for (let cx = 0; cx < cols; cx += 2) {
      const side = square[cz * cols + cx];
      if (side < MIN_LAKE_SQUARE) continue;
      const x = x0 + cx - side / 2 + 0.5;
      const z = z0 + cz - side / 2 + 0.5;
      candidates.push({ x, z, side, score: side - Math.hypot(x - midX, z - midZ) * 0.03 + rand() * 4 });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const lakes = [];
  const added = [];
  const names = shuffle(rand, LAKE_NAMES);
  for (const c of candidates) {
    if (lakes.length >= LAKE_COUNT) break;
    if (lakes.some((l) => Math.hypot(l.x - c.x, l.z - c.z) < 45)) continue; // spread them round the city
    const half = c.side / 2 - HALF_CORRIDOR - 0.2; // the loop road's middle line, at most
    const rx = Math.min(half - LAKE_LOOP_GAP, 7 + rand() * 3);
    const rz = Math.max(4, Math.min(half - LAKE_LOOP_GAP, rx * (0.55 + rand() * 0.3)));
    if (rx < 5) continue;
    const lake = { id: `lake-${lakes.length + 1}`, name: names[lakes.length], shape: 'rect', x: c.x, z: c.z, rx, rz, yaw: 0 };
    const plan = planLoopAndSpur(lake, [...roads, ...added], obstacles, riverSpan, fronts);
    if (!plan) continue;
    lakes.push(lake);
    added.push(...plan.roads);
    for (const r of plan.roads) obstacles.push(corridorRect(r));
    obstacles.push(rectOf(lake.x, lake.z, lake.rx + 1.3, lake.rz + 1.3));
  }
  return { lakes, roads: added };
}

// The four roads round a lake, and the shortest straight spur from one of them to a road elsewhere.
function planLoopAndSpur(lake, roads, obstacles, riverSpan, fronts = [], opts = {}) {
  const reach = LAKE_LOOP_GAP;
  const xL0 = lake.x - lake.rx - reach;
  const xL1 = lake.x + lake.rx + reach;
  const zL0 = lake.z - lake.rz - reach;
  const zL1 = lake.z + lake.rz + reach;
  const group = `${lake.id}-loop`;
  const loopBase = { kind: opts.kind ?? 'lake', class: 'local', frontage: opts.frontage === undefined ? 'lake' : opts.frontage, density: 1, group };
  const loopName = opts.loopName ?? `${lake.name} Loop`;
  const loop = [
    { ...loopBase, id: `${lake.id}-n`, axis: 'x', name: loopName, center: zL0, from: xL0, to: xL1, labelAt: [lake.x, zL0] },
    { ...loopBase, id: `${lake.id}-s`, axis: 'x', name: loopName, center: zL1, from: xL0, to: xL1, labelAt: null },
    { ...loopBase, id: `${lake.id}-w`, axis: 'z', name: loopName, center: xL0, from: zL0, to: zL1, labelAt: null },
    { ...loopBase, id: `${lake.id}-e`, axis: 'z', name: loopName, center: xL1, from: zL0, to: zL1, labelAt: null },
  ].map((r) => ({ color: '#e2e8f0', gaps: [], ...r }));
  let best = null;
  // `spur` meets `target` at spur.from or spur.to; `at` is where along the target (it is also the spur's own centre line).
  const tryTarget = (spur, target, rect, at) => {
    // the T must be clear of the target's ends, every other junction on it, and any bridge on it
    if (at < target.from + JUNCTION_SPACING || at > target.to - JUNCTION_SPACING) return;
    if (junctionsOn(target, roads).some((j) => Math.abs(j - at) < JUNCTION_SPACING)) return;
    // never along the frontage of a reserved site: that stretch of road must stay clear for the player's own road
    if (fronts.some((f) => f.road === target.id && at > f.u0 - JUNCTION_SPACING && at < f.u1 + JUNCTION_SPACING)) return;
    if (riverSpan && target.axis !== riverSpan.axis) {
      const [lo, hi] = riverSpan.axis === 'z' ? [riverSpan.x0, riverSpan.x1] : [riverSpan.z0, riverSpan.z1];
      if (at > lo - JUNCTION_SPACING && at < hi + JUNCTION_SPACING) return;
    }
    if (obstacles.some((o) => rectsOverlap(rect, o))) return;
    const length = Math.abs(spur.to - spur.from);
    if (!best || length < best.length) best = { spur, length };
  };

  const along = (u0, u1) => {
    const out = [];
    for (let u = u0 + JUNCTION_SPACING; u <= u1 - JUNCTION_SPACING + 1e-9; u += 3.4) out.push(u);
    return out;
  };
  const spurBase = { kind: 'spur', class: 'local', frontage: 'country', density: 0.45, labelAt: null, color: '#e2e8f0', gaps: [] };
  for (const target of roads) {
    if (target.kind === 'lake' || target.kind === 'airport' || target.kind === 'highland') continue;
    const spurId = `${lake.id}-spur`;
    const spurName = `${lake.name} Rd`;
    if (target.axis === 'z') {
      // spurs run east-west, meeting the vertical road `target`
      for (const zs of along(zL0, zL1)) {
        const h = HALF_CORRIDOR;
        if (target.center < xL0 - 8) {
          tryTarget({ ...spurBase, id: spurId, axis: 'x', name: spurName, center: zs, from: target.center, to: xL0 }, target, { x0: target.center + h, x1: xL0 - h, z0: zs - h, z1: zs + h }, zs);
        } else if (target.center > xL1 + 8) {
          tryTarget({ ...spurBase, id: spurId, axis: 'x', name: spurName, center: zs, from: xL1, to: target.center }, target, { x0: xL1 + h, x1: target.center - h, z0: zs - h, z1: zs + h }, zs);
        }
      }
    } else {
      for (const xs of along(xL0, xL1)) {
        const h = HALF_CORRIDOR;
        if (target.center < zL0 - 8) {
          tryTarget({ ...spurBase, id: spurId, axis: 'z', name: spurName, center: xs, from: target.center, to: zL0 }, target, { x0: xs - h, x1: xs + h, z0: target.center + h, z1: zL0 - h }, xs);
        } else if (target.center > zL1 + 8) {
          tryTarget({ ...spurBase, id: spurId, axis: 'z', name: spurName, center: xs, from: zL1, to: target.center }, target, { x0: xs - h, x1: xs + h, z0: zL1 + h, z1: target.center - h }, xs);
        }
      }
    }
  }
  if (!best) return null;
  return { roads: [...loop, best.spur] };
}

// Open country between the roads: fields and woods in every free cell outside the city, so the
// countryside looks farmed rather than bare.
const CROPS = ['wheat', 'corn', 'plough', 'meadow'];
const TREE_SHADES = ['#15803d', '#16a34a', '#22c55e', '#4d7c0f'];
function buildFarmland(rand, land, urban, obstacles) {
  const CELL_W = 11;
  const CELL_D = 9;
  const fields = [];
  const woods = [];
  for (let z = land.z0 + 1; z + CELL_D <= land.z1 - 1; z += CELL_D) {
    for (let x = land.x0 + 1; x + CELL_W <= land.x1 - 1; x += CELL_W) {
      const rect = { x0: x + 0.8, x1: x + CELL_W - 0.8, z0: z + 0.8, z1: z + CELL_D - 0.8 };
      if (rectsOverlap(rect, urban)) continue;
      if (obstacles.some((o) => rectsOverlap(inflate(rect, 0.5), o))) continue;
      if (rand() < 0.22) {
        const count = int(rand, 5, 9);
        for (let i = 0; i < count; i++) {
          const size = 0.5 + rand() * 0.4;
          woods.push({
            x: rect.x0 + 0.6 + rand() * (rect.x1 - rect.x0 - 1.2),
            z: rect.z0 + 0.6 + rand() * (rect.z1 - rect.z0 - 1.2),
            size,
            trunk: 0.4 + size * 0.5,
            color: pick(rand, TREE_SHADES),
          });
        }
      } else {
        fields.push({ ...rect, crop: pick(rand, CROPS) });
      }
    }
  }
  return { fields, woods };
}

// --- storefront offers -------------------------------------------------------------------------
// What a business offers visitors: a coupon (a limited number can be claimed) and a "visit" quest
// (spend a little time in the building for Gold). The city's own businesses get these as plain data;
// a video or game demo is only ever added by a player, through the validated embed links.
const COUPON_TEXT = {
  office: 'A free day pass for the coworking floor',
  restaurant: 'A free dessert with any main',
  shop: '10% off your first order',
};
const QUEST_LABEL = {
  office: 'Take the office tour',
  restaurant: 'Tour the kitchen',
  shop: 'Browse the showroom',
};

function makeBrand(rand, type, title, prime) {
  const hasCoupon = rand() < 0.6;
  const hasQuest = rand() < 0.5;
  if (!hasCoupon && !hasQuest) return null;
  const letters = title.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'VV';
  return {
    video: null,
    game: null,
    coupon: hasCoupon ? { code: `${letters}-${int(rand, 100, 999)}`, text: COUPON_TEXT[type], total: int(rand, 5, 20) * (prime ? 2 : 1), claimed: 0 } : null,
    quest: hasQuest ? { label: QUEST_LABEL[type], seconds: 20 + 10 * int(rand, 0, 2), gold: (10 + 5 * int(rand, 0, 4)) * (prime ? 2 : 1) } : null,
  };
}

// [from, to] stretches of a road left after removing the intersections.
function blocksBetween(from, to, gaps) {
  const blocks = [];
  let cursor = from;
  for (const [a, b] of [...gaps].sort((x, y) => x[0] - y[0])) {
    if (a > cursor) blocks.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < to) blocks.push([cursor, to]);
  return blocks;
}

// `facing`: +1 / -1 = which way (Z) the front door looks, toward the avenue the plot sits on.
const AD_TAGLINES = {
  office: ['Built for teams that ship.', 'Where great work happens.', 'Your next big project starts here.'],
  restaurant: ['Fresh, fast, and on the corner.', 'Come hungry. Leave happy.', 'Taste the district.'],
  shop: ['Everything you need, one block away.', 'New arrivals every week.', 'Find your thing.'],
};

export const BILLBOARD_BUYOUT_MULTIPLIER = 1.25;
// Buying a business out from under its owner: they get 25% more than the plot is worth.
export const TAKEOVER_MULTIPLIER = 1.25;

// Large billboards stand in the band between the city and the perimeter road: beside the west end of
// each arterial avenue (facing east, down the road) and beside the north end of the first arterial
// cross street (facing south). They are set to the side so they never sit on a road. The last one
// starts empty so there is always a slot to take over; the others advertise a business from the city.
function buildBillboards(rand, roads, plots, { xWest, zNorth }) {
  const arterials = roads.filter((r) => r.class === 'arterial');
  const sites = [
    ...arterials.filter((r) => r.kind === 'avenue'),
    ...arterials.filter((r) => r.kind === 'street').slice(0, 1),
  ];
  const advertisers = shuffle(rand, plots.filter((p) => p.owner));
  const SIDE = HALF_CORRIDOR + 2.6 + 0.4; // road centre to the middle of the 5.2-wide screen, clear of the corridor

  return sites.map((road, i) => {
    const alongX = road.axis === 'x';
    const plot = i < sites.length - 1 ? advertisers[i] : null;
    const views = plot ? int(rand, 8000, 60000) : 0;
    return {
      id: `billboard-${road.id}`,
      roadName: road.name,
      x: alongX ? xWest - 2.4 : road.center + SIDE,
      z: alongX ? road.center - SIDE : zNorth - 2.4,
      yaw: alongX ? Math.PI / 2 : 0, // local +Z (the screen) turned to face along the road
      width: 5.2,
      height: 2.4,
      ad: plot
        ? {
            advertiser: plot.owner,
            headline: plot.title,
            tagline: pick(rand, AD_TAGLINES[plot.buildingType]),
            url: plot.website,
            color: plot.color,
          }
        : null,
      value: plot ? Math.round(int(rand, 400, 1200) / 5) * 5 : 250,
      views,
      clicks: Math.round(views * (0.02 + rand() * 0.04)),
      history: [], // advertisers who were bought out, newest first
    };
  });
}

// The two planes that tow advertising banners: each is an ad slot, bought out like a billboard (see the store's
// buyBillboard), with the same stats and quest. They are kept in the billboard list, marked `kind: 'banner'`.
const AIRLINES = ['Voxel Air', 'Skyline Ads'];
function buildBanners(rand, plots, airports) {
  const advertisers = shuffle(rand, plots.filter((p) => p.owner && !p.luxury && p.buildingType !== 'house'));
  return airports.slice(0, 2).map((airport, i) => {
    const plot = i === 0 ? advertisers[0] : null; // the second banner starts empty so there is always a slot to take
    const views = plot ? int(rand, 12000, 90000) : 0;
    return {
      id: `banner-${i + 1}`,
      kind: 'banner',
      roadName: `${AIRLINES[i]} aerial banner`,
      airline: AIRLINES[i],
      x: airport.centre.x,
      z: airport.centre.z,
      yaw: 0,
      width: 17,
      height: 2.3,
      ad: plot
        ? { advertiser: plot.owner, headline: plot.title, tagline: pick(rand, AD_TAGLINES[plot.buildingType]), url: plot.website, color: plot.color }
        : null,
      value: plot ? Math.round(int(rand, 900, 2400) / 5) * 5 : 450, // dearer than a billboard: it is seen over the whole city
      views,
      clicks: Math.round(views * (0.02 + rand() * 0.04)),
      history: [],
    };
  });
}

// The admin companies. Each takes one of the two luxury estates that are built when the city starts (the best, nearest the centre first) and
// stands on it as a landmark: a tall voxel building of its own (public/models/vox/buildings/<model>.vox), not for sale and not open to a take-over.
// Change the names, colours, heights and websites here (the websites are placeholders).
export const ADMIN_HQS = [
  {
    id: 'synaptix-play',
    company: 'Synaptix Play',
    model: 'voxel/synaptix-hq',
    color: '#6d28d9',
    height: 8.4,
    logo: { kind: 'icon', icon: 'game', color: '#8b5cf6' },
    website: 'https://example.com/synaptix-play',
    description: 'Synaptix Play HQ is the home of Synaptix Play: games, play and community. An admin building: it is not for sale.',
  },
  {
    id: 'theoretical-minds',
    company: 'Theoretical Minds Technology',
    model: 'voxel/theoretical-minds-hq',
    color: '#0f766e',
    height: 7.6,
    logo: { kind: 'icon', icon: 'gear', color: '#14b8a6' },
    website: 'https://example.com/theoretical-minds',
    description: 'Theoretical Minds Technology HQ is where the research, ideas and engines behind the city come from. An admin building: it is not for sale.',
  },
];
const HQ_VALUE = 120000;

// Turns the luxury estates that were already built into the admin headquarters. Falls back to the most central luxury estates if the grid left fewer than two.
function assignAdminHqs(plots, centre) {
  const dist = (p) => Math.hypot(p.x - centre.x, p.z - centre.z);
  const grid = plots.filter((p) => p.luxury && !p.grand && p.primeKind === 'luxury' && !p.designSite && !p.admin);
  const chosen = [...grid.filter((p) => p.owner).sort((a, b) => dist(a) - dist(b)), ...grid.filter((p) => !p.owner).sort((a, b) => dist(a) - dist(b))].slice(0, ADMIN_HQS.length);
  chosen.forEach((p, i) => {
    const hq = ADMIN_HQS[i];
    Object.assign(p, {
      owner: hq.company,
      title: `${hq.company} HQ`,
      website: hq.website,
      description: hq.description,
      buildingType: 'office',
      category: 'Headquarters',
      generated: true,
      value: HQ_VALUE,
      visits: 90000,
      height: hq.height,
      color: hq.color,
      logo: hq.logo,
      brand: null,
      admin: true,
      hq: hq.id,
      hqModel: hq.model,
      interiorData: { rooms: 2, theme: 'office', variant: 'meetings', floors: floorsForHeight(hq.height), luxury: true, hq: true },
    });
  });
}

function makePlot(rand, id, pos, gridX, gridZ, district, facing, shape = null, forceBuilt = false, forceEmpty = false) {
  const prime = Boolean(shape);
  const grand = shape?.kind === 'grand';
  const luxury = grand || shape?.kind === 'luxury';
  const built = forceBuilt || Boolean(shape?.built);
  const cellCount = prime ? shape.cells.length : 1;
  const base = {
    id,
    gridX,
    gridZ,
    x: pos.x,
    z: pos.z,
    w: prime ? shape.w : PLOT_TILE, // footprint, in world units
    d: prime ? shape.d : PLOT_TILE,
    facing,
    districtId: district.id,
    district: district.name,
    ...(prime && { prime: true, cellCount, cells: shape.cells, primeKind: shape.kind }),
    ...(luxury && { luxury: true }),
    ...(grand && { grand: true }),
  };
  // a luxury estate always starts for sale
  if (!built && (luxury || forceEmpty || rand() >= (prime ? PRIME_CLAIMED_RATIO : CLAIMED_RATIO))) {
    return {
      ...base,
      title: grand ? `Grand Estate #${id}` : luxury ? `Luxury Estate #${id}` : prime ? `Prime Lot #${id}` : `Empty Lot #${id}`,
      owner: null,
      website: null,
      value: int(rand, 50, 100) * (grand ? Math.round(cellCount * GRAND_PREMIUM) : luxury ? Math.round(cellCount * LUXURY_PREMIUM) : prime ? Math.round(cellCount * PRIME_PREMIUM) : 1),
      visits: int(rand, 5, 60) * cellCount,
      height: 0.2,
      color: '#475569',
      category: grand ? 'Grand estate' : luxury ? 'Luxury estate' : prime ? 'Prime lot' : 'Unclaimed',
      interiorData: null,
    };
  }
  const buildingType = pickWeighted(rand, district.typeWeights);
  const type = BUILDING_TYPES[buildingType];
  const title = `${pick(rand, district.prefixes)} ${pick(rand, type.suffixes)}`;
  // Shops in Arcade Alley are game rooms
  const variant = buildingType === 'shop' && district.id === 'arcade' && rand() < 0.7 ? 'arcade' : pick(rand, type.variants);
  const height = Math.round((type.height[0] + rand() * (type.height[1] - type.height[0])) * (grand ? GRAND_HEIGHT : luxury ? LUXURY_HEIGHT : prime ? PRIME_HEIGHT : 1) * 10) / 10;
  return {
    ...base,
    title: grand ? `${title} Grand Estate` : luxury ? `${title} Estate` : prime ? `${title} Flagship` : title,
    buildingType,
    generated: true,
    owner: pick(rand, OWNERS),
    website: `https://example.com/${title.toLowerCase().replace(/\s+/g, '-')}`,
    value: int(rand, 150, 900) * (grand ? Math.round(cellCount * 6) : luxury ? Math.round(cellCount * 3) : prime ? Math.round(cellCount * 1.6) : 1),
    visits: int(rand, 100, 9000) * cellCount,
    height,
    color: pick(rand, district.palette),
    category: type.category ?? pick(rand, district.categories),
    interiorData: { rooms: rand() < 0.3 ? 2 : 1, theme: buildingType, variant, floors: floorsForHeight(height), ...(prime && { prime: true }), ...(luxury && { luxury: true }), ...(grand && { grand: true }) },
    brand: makeBrand(rand, buildingType, title, prime),
  };
}

// A few empty plots get a building at the start, so the city begins a little fuller: some ordinary
// plots and some prime plots (the luxury estates that start built are chosen with the other prime groups).
function buildMore(rand, plots, districtById) {
  const grid = (p) => districtById[p.districtId] && p.gridX != null;
  const pools = {
    regular: shuffle(rand, plots.filter((p) => !p.owner && !p.prime && grid(p))),
    prime: shuffle(rand, plots.filter((p) => !p.owner && p.prime && !p.luxury && grid(p))),
  };
  for (const [kind, count] of Object.entries(EXTRA_BUILT)) {
    for (const old of pools[kind].slice(0, count)) {
      const shape = old.prime ? { kind: old.primeKind, cells: old.cells, w: old.w, d: old.d } : null;
      const fresh = makePlot(rand, old.id, { x: old.x, z: old.z }, old.gridX, old.gridZ, districtById[old.districtId], old.facing, shape, true);
      if (old.parkBoost) {
        fresh.parkBoost = old.parkBoost;
        fresh.visits = Math.round(fresh.visits * (1 + old.parkBoost / 100));
      }
      plots[plots.indexOf(old)] = fresh;
    }
  }
}

function makeSuburbLot(rand, id, pos, gridX, gridZ, facing) {
  return {
    id,
    gridX,
    gridZ,
    x: pos.x,
    z: pos.z,
    w: PLOT_TILE,
    d: PLOT_TILE,
    facing,
    districtId: SUBURB_ID,
    district: 'Old Town',
    title: `Old Town lot #${id}`,
    owner: null,
    website: null,
    value: int(rand, 20, 40),
    visits: int(rand, 1, 20),
    height: 0.2,
    color: '#475569',
    category: 'Unclaimed',
    interiorData: null,
  };
}

// --- the reserved-site designer (development tool) ---------------------------------------------------
// A reserved site (34 x 30, beside a busy road) is empty land for a hand-designed road and plots. The designer lays a
// U-shaped street into it: two legs that meet the front road at T junctions, a street across the far end, and 0-2
// rungs between the legs. Every end is a junction (the traffic model needs that), and lots line both sides of every
// street. It is a pure function: it returns what it would add and changes nothing, so the editor can preview it and
// generateCity() can apply it. Its randomness comes from its own seeded stream, never the city's, so adding a design
// leaves every other building, lot and colour of the city exactly as it was.
export const DESIGN_DEFAULTS = { width: 14, rungs: 1, density: 0.85, entry: 0, depth: 1, link: true, landscaping: true, seed: 1, style: 'street', radius: 7 };
export const DESIGN_LIMITS = { width: [8, 22], rungs: [0, 2], curveWidth: [13, 28], radius: [6.5, 12] };
const DESIGN_NAMES = ['Homestead Way', 'Founders Row', 'Claim Court', 'Settler Lane', 'Pioneer Close', 'Keystone Way'];
const DESIGN_DISTRICT = {
  id: 'private',
  name: 'Private Estates',
  color: '#f59e0b',
  typeWeights: { office: 0.3, restaurant: 0.3, shop: 0.4 },
  palette: ['#f59e0b', '#fbbf24', '#d97706'],
  categories: ['Services'],
  theme: 'office',
  prefixes: ['Claim', 'Homestead', 'Keystone', 'Settler'],
  suffixes: ['Works', 'Studio', 'Partners'],
};
export const DESIGN_PLOT_BASE = 100000; // design plots are numbered from here, 1000 to a site, so they never shift other plot ids
const forkRand = (...nums) => mulberry32(nums.reduce((h, n) => Math.imul(h ^ (Math.floor(n) | 0), 2654435761) >>> 0, 0x9e3779b9));
const clampTo = (n, [lo, hi]) => Math.min(hi, Math.max(lo, n));

// `ctx` is { roads, plots, billboards, parks, reserved, landscape? } (anything a design of this site would add is
// ignored if it is already in there). Returns { ok: false, error } or { ok: true, params, roads, lots, bushes, trees, clear, summary }.
export function designReservedSite(ctx, site, input = {}) {
  const p = { ...DESIGN_DEFAULTS, ...input };
  const front = ctx.roads.find((r) => r.id === site.frontRoad);
  if (!front) return { ok: false, error: 'The road in front of this site is missing.' };
  if (p.style === 'curve') return designCurvedSite(ctx, site, p, front); // a curved crescent instead of straight streets
  const side = site.frontSide;
  const alongX = front.axis === 'x';
  const [u0, u1] = alongX ? [site.x0, site.x1] : [site.z0, site.z1];
  const nStart = HALF_CORRIDOR + RESERVED_GAP;
  const nEnd = nStart + (alongX ? site.z1 - site.z0 : site.x1 - site.x0);
  const farMax = nEnd - (PLOT_TILE + 0.2); // the far street, as deep as the site allows (room for a row of lots beyond it)
  const farMin = nStart + 10; // ... and as shallow as a short court (about three lots deep)
  const outer = ROW_OFFSET + PLOT_TILE / 2; // a street's centre to the outer edge of its lots
  p.depth = clampTo(Number(p.depth ?? 1) || 0, [0, 1]);
  const nFar = farMin + (farMax - farMin) * p.depth; // how far the streets reach into the site
  const widthMax = Math.min(DESIGN_LIMITS.width[1], Math.floor(u1 - u0 - 2 * outer));
  p.width = clampTo(Math.round(p.width), [DESIGN_LIMITS.width[0], widthMax]);
  p.rungs = clampTo(Math.round(p.rungs), DESIGN_LIMITS.rungs);
  p.link = p.link !== false;
  p.entry = clampTo(Number(p.entry) || 0, [-1, 1]);
  p.density = clampTo(Number(p.density) || 1, [0.2, 1]);
  const toWorld = (u, n) => (alongX ? { x: u, z: front.center + side * n } : { x: front.center + side * n, z: u });
  const mid = (u0 + u1) / 2;
  const maxShift = Math.max(0, (u1 - u0) / 2 - p.width / 2 - outer);

  const others = ctx.plots.filter((q) => q.designSite !== site.id);
  const blockers = obstacleRects({ roads: [], plots: others, billboards: ctx.billboards, parks: ctx.parks ?? [], reserved: [], water: [] });
  const junctions = junctionsOn(front, ctx.roads.filter((r) => !String(r.id).startsWith(`${site.id}-d-`)));
  // the stretch of each leg between the front road and the site must be clear, and clear of other junctions
  const legClear = (ul) => {
    const a = toWorld(ul - HALF_CORRIDOR, 0);
    const b = toWorld(ul + HALF_CORRIDOR, nStart);
    const rect = inflate({ x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) }, 0.3);
    return !blockers.some((o) => rectsOverlap(rect, o)) && junctions.every((j) => Math.abs(j - ul) >= JUNCTION_SPACING);
  };
  let uc = null;
  const steps = maxShift > 0 ? Math.ceil(maxShift / 0.5) : 0;
  const base = p.entry * maxShift;
  for (let k = 0; k <= steps * 2 + 1 && uc === null; k++) {
    for (const shift of k === 0 ? [base] : [base + (k / 2) * 0.5, base - (k / 2) * 0.5]) {
      if (Math.abs(shift) > maxShift + 1e-9) continue;
      const c = mid + shift;
      if (legClear(c - p.width / 2) && legClear(c + p.width / 2)) {
        uc = c;
        break;
      }
    }
  }
  if (uc === null) return { ok: false, error: 'Something stands in the way of every possible entrance (another plot, a billboard or a junction). Try a different width.' };
  p.entryAt = Math.round((maxShift ? (uc - mid) / maxShift : 0) * 100) / 100;

  const rand = forkRand(ctx.seed ?? 0, p.seed, site.id.length * 131 + Number(site.id.replace(/\D/g, '')));
  const name = pick(rand, DESIGN_NAMES);
  const legAxis = alongX ? 'z' : 'x';
  const mk = (id, axis, center, a, b) => ({ id: `${site.id}-d-${id}`, kind: 'design', class: 'local', frontage: 'design', density: p.density, labelAt: null, color: '#e2e8f0', gaps: [], design: site.id, name, axis, center, from: Math.min(a, b), to: Math.max(a, b) });
  const ul1 = uc - p.width / 2;
  const ul2 = uc + p.width / 2;
  const fc = front.center;
  const roads = [
    mk('leg-a', legAxis, ul1, fc, fc + side * nFar),
    mk('leg-b', legAxis, ul2, fc, fc + side * nFar),
    mk('far', front.axis, fc + side * nFar, ul1, ul2),
  ];
  for (let k = 1; k <= p.rungs; k++) roads.push(mk(`rung-${k}`, front.axis, fc + side * (nStart + ((nFar - nStart) * k) / (p.rungs + 1)), ul1, ul2));

  // Link up: where an existing road runs beyond the site, the design's streets carry on to it instead of stopping.
  //   - a road parallel to the front road, beyond the far edge: both legs continue straight through to it (T junctions);
  //   - a road parallel to the legs (a cross street past either end of the site): the far street continues sideways to it.
  // A link is only made when its whole stretch is clear (no plot, billboard, park, water or other road in the way) and the
  // new junction keeps its distance from the others on that road.
  const links = [];
  const linkClear = [];
  if (p.link) {
    const existing = ctx.roads.filter((r) => !String(r.id).startsWith(`${site.id}-d-`));
    const stretch = (axis, centre, a, b) => inflate(corridorRect({ axis, center: centre, from: Math.min(a, b), to: Math.max(a, b) }), -0.05);
    const roadsOf = (except) => existing.filter((r) => r !== except && r !== front).map(corridorRect);
    const free = (rect, except) => !blockers.some((o) => rectsOverlap(rect, o)) && !roadsOf(except).some((o) => rectsOverlap(rect, o));
    const spaced = (road, at) => road.from + JUNCTION_SPACING <= at && at <= road.to - JUNCTION_SPACING && junctionsOn(road, existing).every((j) => Math.abs(j - at) >= JUNCTION_SPACING);
    const nOf = (road) => Math.abs(road.center - fc);
    const [legA, legB, far] = roads;
    // beyond the far edge
    const beyond = existing
      .filter((r) => r.axis === front.axis && r !== front && (r.center - fc) * side > 0 && nOf(r) >= nEnd + HALF_CORRIDOR && nOf(r) - nFar <= 18)
      .sort((a, b) => nOf(a) - nOf(b))[0];
    if (beyond && spaced(beyond, ul1) && spaced(beyond, ul2)) {
      const legRect = (ul) => stretch(legAxis, ul, fc + side * nFar, beyond.center - side * HALF_CORRIDOR);
      if (free(legRect(ul1), beyond) && free(legRect(ul2), beyond)) {
        for (const leg of [legA, legB]) {
          leg.from = Math.min(fc, beyond.center);
          leg.to = Math.max(fc, beyond.center);
        }
        links.push({ road: beyond.id, name: beyond.name ?? beyond.id, kind: 'far', at: 2 });
        linkClear.push(legRect(ul1), legRect(ul2));
      }
    }
    // past either end of the site
    const farCentre = far.center;
    for (const dirn of [-1, 1]) {
      const edge = dirn < 0 ? ul1 : ul2;
      const cross = existing
        .filter((r) => r.axis === legAxis && (r.center - edge) * dirn > 0 && Math.abs(r.center - edge) <= 18 && Math.abs(r.center - edge) >= HALF_CORRIDOR + 2 && (dirn < 0 ? r.center < u0 - 0.5 : r.center > u1 + 0.5))
        .sort((a, b) => Math.abs(a.center - edge) - Math.abs(b.center - edge))[0];
      if (!cross || !spaced(cross, farCentre)) continue;
      const rect = stretch(front.axis, farCentre, edge, cross.center - dirn * HALF_CORRIDOR);
      if (!free(rect, cross)) continue;
      if (dirn < 0) far.from = cross.center;
      else far.to = cross.center;
      links.push({ road: cross.id, name: cross.name ?? cross.id, kind: 'side', at: 1 });
      linkClear.push(rect);
    }
  }

  // where each street meets another: pavement gaps, so lots start after the crossings
  const frontClone = { ...front, gaps: [] };
  const clones = roads.map((r) => ({ ...r, gaps: [] }));
  const all = [...clones, frontClone];
  for (const h of all.filter((r) => r.axis === 'x')) {
    for (const v of all.filter((r) => r.axis === 'z')) {
      if (!junctionArms(h, v)) continue;
      h.gaps.push([v.center - HALF_CORRIDOR, v.center + HALF_CORRIDOR]);
      v.gaps.push([h.center - HALF_CORRIDOR, h.center + HALF_CORRIDOR]);
    }
  }
  for (const r of clones) r.gaps.sort((a, b) => a[0] - b[0]);
  const BIG = 1e5;
  const outside = [
    { x0: -BIG, x1: site.x0, z0: -BIG, z1: BIG },
    { x0: site.x1, x1: BIG, z0: -BIG, z1: BIG },
    { x0: -BIG, x1: BIG, z0: -BIG, z1: site.z0 },
    { x0: -BIG, x1: BIG, z0: site.z1, z1: BIG },
  ];
  const obstacles = [...blockers, ...outside, corridorRect(front), ...clones.map(corridorRect)];
  const lots = frontageLots(rand, clones, obstacles);

  // greenery in what is left: shrubs, and now and then a tree
  const bushes = [];
  const trees = [];
  if (p.landscaping) {
    const taken = [...lots.map((l) => rectOf(l.x, l.z, PLOT_TILE / 2 + 0.3, PLOT_TILE / 2 + 0.3)), ...clones.map((r) => inflate(corridorRect(r), 0.4))];
    const strip = roads.slice(0, 2).map((r) => inflate(corridorRect({ ...r, from: Math.min(fc, fc + side * nStart), to: Math.max(fc, fc + side * nStart) }), 0.4));
    for (let x = site.x0 + 1; x < site.x1 - 0.5; x += 2) {
      for (let z = site.z0 + 1; z < site.z1 - 0.5; z += 2) {
        const px = x + (rand() - 0.5) * 1.2;
        const pz = z + (rand() - 0.5) * 1.2;
        const size = 0.55 + rand() * 0.4;
        const rect = rectOf(px, pz, size / 2 + 0.1, size / 2 + 0.1);
        if (rand() > 0.55 || [...taken, ...strip].some((o) => rectsOverlap(rect, o))) continue;
        taken.push(rect);
        if (rand() < 0.3) trees.push({ x: px, z: pz, size, trunk: 0.4 + size * 0.5, color: pick(rand, LEAF_COLOURS) });
        else bushes.push({ x: px, z: pz, w: size * 0.8, h: 0.3 + rand() * 0.25, color: pick(rand, SHRUB_COLOURS) });
      }
    }
  }

  // surrounding greenery that the new streets and lots displace
  const clear = [inflate({ x0: site.x0, x1: site.x1, z0: site.z0, z1: site.z1 }, 0.5), ...roads.slice(0, 2).map((r) => inflate(corridorRect({ ...r, from: Math.min(fc, fc + side * nStart), to: Math.max(fc, fc + side * nStart) }), 0.8))];
  clear.push(...linkClear.map((r) => inflate(r, 0.8)));
  const inClear = (o) => clear.some((c) => o.x >= c.x0 && o.x <= c.x1 && o.z >= c.z0 && o.z <= c.z1);
  const moved = ctx.landscape ? [...ctx.landscape.trees, ...ctx.landscape.bushes].filter(inClear).length : 0;
  return {
    ok: true,
    params: p,
    name,
    roads,
    lots,
    bushes,
    trees,
    clear,
    inClear,
    summary: { streets: roads.length, junctions: 2 + 2 + 2 * p.rungs + links.reduce((n, l) => n + l.at, 0), links: links.map((l) => l.name), lots: lots.length, greenery: bushes.length + trees.length, displaced: moved, frontRoad: front.name ?? front.id },
  };
}

// --- a curved reserved site (development tool) ------------------------------------------------------------
// The "crescent": one curved street that leaves the front road at a T junction, runs into the site, sweeps round a half circle (two 90 degree arcs, with a
// straight between them when the site is wide) and comes back to the front road at a second T junction, with lots along both sides. It is described like
// every curved road (lib/city/curves.js), so it is drawn, walked on and lined with turned lots by the code that already exists; the street itself goes in
// `layout.curvedRoads`, and the two mouths are curb cuts in the front road (cars on the crescent are driven by lib/sim/curveTraffic.js).
// Same contract as designReservedSite: pure, seeded from its own stream, returns { ok, params, name, roads: [], curvedRoads, frontGaps, lots, bushes, trees,
// clear, inClear, summary } or { ok: false, error }.
function designCurvedSite(ctx, site, p, front) {
  const side = site.frontSide;
  const alongX = front.axis === 'x';
  const [u0, u1] = alongX ? [site.x0, site.x1] : [site.z0, site.z1];
  const nStart = HALF_CORRIDOR + RESERVED_GAP;
  const nEnd = nStart + (alongX ? site.z1 - site.z0 : site.x1 - site.x0);
  const outer = ROW_OFFSET + PLOT_TILE / 2 + 0.2; // a street's centre to the outer edge of its lots
  const toWorld = (u, n) => (alongX ? { x: u, z: front.center + side * n } : { x: front.center + side * n, z: u });
  const uOf = (x, z) => (alongX ? x : z);
  const nOf = (x, z) => (alongX ? z - front.center : x - front.center) * side;

  p.depth = clampTo(Number(p.depth ?? 1) || 0, [0, 1]);
  p.radius = clampTo(Number(p.radius) || DESIGN_DEFAULTS.radius, DESIGN_LIMITS.radius);
  const widthMax = Math.min(DESIGN_LIMITS.curveWidth[1], Math.floor(u1 - u0 - 2 * outer));
  p.width = clampTo(Math.round(Number(p.width) || 16), [Math.min(Math.ceil(2 * p.radius), widthMax), widthMax]);
  if (widthMax < Math.ceil(2 * p.radius)) return { ok: false, error: 'The site is too narrow for a crescent with that radius. Try a smaller radius.' };
  p.entry = clampTo(Number(p.entry) || 0, [-1, 1]);
  p.density = clampTo(Number(p.density) || 1, [0.2, 1]);
  p.link = false; // a crescent returns to its own front road: there is nothing to link to
  const R = p.radius;
  const M = Math.max(0, p.width - 2 * R); // the straight between the two arcs
  const farMax = nEnd - outer; // the far side of the bend, with room beyond it for a row of lots
  const farMin = nStart + R + 6; // as shallow as: the mouth, a short leg and the bend
  const nFar = farMin + (farMax - farMin) * p.depth; // where the far side of the bend is, from the front road's centre line
  const L = nFar - HALF_CORRIDOR - R; // each leg's straight run
  if (L < 1) return { ok: false, error: 'The site is not deep enough for a crescent with that radius.' };

  const others = ctx.plots.filter((q) => q.designSite !== site.id);
  const blockers = obstacleRects({ roads: [], plots: others, billboards: ctx.billboards, parks: ctx.parks ?? [], reserved: [], water: [] });
  const junctions = junctionsOn(front, ctx.roads);
  const mouthClear = (ul) => {
    const a = toWorld(ul - HALF_CORRIDOR, 0);
    const b = toWorld(ul + HALF_CORRIDOR, nStart);
    const rect = inflate({ x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) }, 0.3);
    return !blockers.some((o) => rectsOverlap(rect, o)) && junctions.every((j) => Math.abs(j - ul) >= JUNCTION_SPACING);
  };
  const mid = (u0 + u1) / 2;
  const maxShift = Math.max(0, (u1 - u0) / 2 - p.width / 2 - outer);
  let uc = null;
  const steps = maxShift > 0 ? Math.ceil(maxShift / 0.5) : 0;
  const base = p.entry * maxShift;
  for (let k = 0; k <= steps * 2 + 1 && uc === null; k++) {
    for (const shift of k === 0 ? [base] : [base + (k / 2) * 0.5, base - (k / 2) * 0.5]) {
      if (Math.abs(shift) > maxShift + 1e-9) continue;
      const c = mid + shift;
      if (mouthClear(c - p.width / 2) && mouthClear(c + p.width / 2)) {
        uc = c;
        break;
      }
    }
  }
  if (uc === null) return { ok: false, error: 'Something stands in the way of every possible entrance (another plot, a billboard or a junction). Try a different width.' };
  p.entryAt = Math.round((maxShift ? (uc - mid) / maxShift : 0) * 100) / 100;
  const ua = uc - p.width / 2;
  const ub = uc + p.width / 2;

  const rand = forkRand(ctx.seed ?? 0, p.seed, site.id.length * 131 + Number(site.id.replace(/\D/g, '')));
  const name = `${pick(rand, DESIGN_NAMES).split(' ')[0]} Crescent`;
  // the street: start at the front road's pavement edge on the left leg, head into the site, turn towards the other leg and come back
  const start = toWorld(ua, HALF_CORRIDOR);
  const heading = alongX ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
  const wantU = alongX ? [1, 0] : [0, 1];
  const right = [-Math.cos(heading), Math.sin(heading)]; // rightOf(heading), see curves.js
  const turn = (right[0] * wantU[0] + right[1] * wantU[1] > 0 ? 1 : -1) * (Math.PI / 2);
  const segments = [{ line: L }, { arc: { radius: R, angle: turn } }, ...(M > 0.01 ? [{ line: M }] : []), { arc: { radius: R, angle: turn } }, { line: L }];
  const spec = { id: `${site.id}-d-crescent`, name, design: site.id, start: { x: start.x, z: start.z, heading }, segments };
  const curve = sampleCurve(spec);
  // the whole street must lie inside the site's width (the legs start at the front road, so only the far bend is checked against its depth)
  for (const pt of curve.points) {
    const u = uOf(pt.x, pt.z);
    const n = nOf(pt.x, pt.z);
    if (u < u0 + outer - 0.01 || u > u1 - outer + 0.01 || n > nEnd - outer + 0.01) return { ok: false, error: `The crescent does not fit in the site (street at across ${u.toFixed(1)} of ${(u0 + outer).toFixed(1)} to ${(u1 - outer).toFixed(1)}, depth ${n.toFixed(1)} of ${(nEnd - outer).toFixed(1)}). Try a smaller width or depth.` };
  }

  // lots on both sides: turned to follow the curve, kept inside the site and clear of one another
  const placed = [];
  const inSite = (b) => {
    const c = Math.cos(b.yaw);
    const sn = Math.sin(b.yaw);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([sx, sz]) => {
      const x = b.x + sx * b.hw * c + sz * b.hd * sn;
      const z = b.z - sx * b.hw * sn + sz * b.hd * c;
      return x >= site.x0 + 0.1 && x <= site.x1 - 0.1 && z >= site.z0 + 0.1 && z <= site.z1 - 0.1;
    });
  };
  const cornerReachesRoad = (lot) => {
    const c = Math.cos(lot.yaw);
    const sn = Math.sin(lot.yaw);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].some(([sx, sz]) => {
      const x = lot.x + sx * (PLOT_TILE / 2) * c + sz * (PLOT_TILE / 2) * sn;
      const z = lot.z - sx * (PLOT_TILE / 2) * sn + sz * (PLOT_TILE / 2) * c;
      return curve.points.some((pt) => Math.hypot(pt.x - x, pt.z - z) < HALF_CORRIDOR - 0.05);
    });
  };
  const frontStrip = inflate(corridorRect({ axis: front.axis, center: front.center, from: Math.min(site.x0, site.z0) - 1e3, to: Math.max(site.x1, site.z1) + 1e3 }), 0.4);
  for (const sideName of ['right', 'left']) {
    for (const lot of plotsAlong(curve, { side: sideName, tile: PLOT_TILE, gap: 0.4, from: 1.6, to: curve.length - 1.6 })) {
      const box = { x: lot.x, z: lot.z, hw: PLOT_TILE / 2 + 0.2, hd: PLOT_TILE / 2 + 0.2, yaw: lot.yaw };
      if (!inSite(box)) continue;
      if (cornerReachesRoad(lot)) continue; // on a tight bend a lot's corner can poke into the street: such a lot is dropped
      const r = PLOT_TILE / 2 * 1.42;
      if (rectsOverlap(rectOf(lot.x, lot.z, r, r), frontStrip)) continue;
      if (placed.some((q) => boxesOverlap(q, box))) continue; // opposite sides of a tight bend can crowd one another
      placed.push(box);
    }
  }
  const lots = placed.map((b) => ({ x: Math.round(b.x * 100) / 100, z: Math.round(b.z * 100) / 100, facing: 1, yaw: Math.round(b.yaw * 1000) / 1000 }));

  // greenery in what is left
  const bushes = [];
  const trees = [];
  const strips = [ua, ub].map((ul) => {
    const a = toWorld(ul - HALF_CORRIDOR, 0);
    const b = toWorld(ul + HALF_CORRIDOR, nStart);
    return inflate({ x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) }, 0.4);
  });
  const nearRoad = (x, z, d) => curve.points.some((pt, i) => i % 4 === 0 && Math.hypot(pt.x - x, pt.z - z) < d);
  if (p.landscaping) {
    const taken = placed.map((b) => rectOf(b.x, b.z, PLOT_TILE / 2 + 0.5, PLOT_TILE / 2 + 0.5));
    for (let x = site.x0 + 1; x < site.x1 - 0.5; x += 2) {
      for (let z = site.z0 + 1; z < site.z1 - 0.5; z += 2) {
        const px = x + (rand() - 0.5) * 1.2;
        const pz = z + (rand() - 0.5) * 1.2;
        const size = 0.55 + rand() * 0.4;
        const rect = rectOf(px, pz, size / 2 + 0.1, size / 2 + 0.1);
        if (rand() > 0.55 || nearRoad(px, pz, CORRIDOR_HALF_FOR_GREEN) || [...taken, ...strips].some((o) => rectsOverlap(rect, o))) continue;
        taken.push(rect);
        if (rand() < 0.3) trees.push({ x: px, z: pz, size, trunk: 0.4 + size * 0.5, color: pick(rand, LEAF_COLOURS) });
        else bushes.push({ x: px, z: pz, w: size * 0.8, h: 0.3 + rand() * 0.25, color: pick(rand, SHRUB_COLOURS) });
      }
    }
  }
  const clear = [inflate({ x0: site.x0, x1: site.x1, z0: site.z0, z1: site.z1 }, 0.5), ...strips.map((r) => inflate(r, 0.4))];
  const inClear = (o) => clear.some((c) => o.x >= c.x0 && o.x <= c.x1 && o.z >= c.z0 && o.z <= c.z1);
  const moved = ctx.landscape ? [...ctx.landscape.trees, ...ctx.landscape.bushes].filter(inClear).length : 0;
  return {
    ok: true,
    params: p,
    name,
    roads: [],
    curvedRoads: [spec],
    frontGaps: [[ua - HALF_CORRIDOR, ua + HALF_CORRIDOR], [ub - HALF_CORRIDOR, ub + HALF_CORRIDOR]],
    lots,
    bushes,
    trees,
    clear,
    inClear,
    summary: { streets: 1, junctions: 2, links: [], lots: lots.length, greenery: bushes.length + trees.length, displaced: moved, curved: true, length: Math.round(curve.length * 10) / 10 },
  };
}
const CORRIDOR_HALF_FOR_GREEN = 2.2; // shrubs and trees keep this far from the middle of a curved street

// New junctions for the roads a design adds, without touching any other junction (so signal phases and everything
// else about the rest of the city stay as they were).
function addDesignJunctions(newRoads, roads, intersections, rand) {
  const isNew = new Set(newRoads);
  for (const h of roads.filter((r) => r.axis === 'x')) {
    for (const v of roads.filter((r) => r.axis === 'z')) {
      if (!isNew.has(h) && !isNew.has(v)) continue;
      const arms = junctionArms(h, v);
      if (!arms) continue;
      intersections.push({
        id: `x-${h.id}-${v.id}`,
        x: v.center,
        z: h.center,
        arms,
        ...planIntersection(h.class === 'arterial', v.class === 'arterial', arms),
        phase: rand() * 12,
      });
      h.gaps.push([v.center - HALF_CORRIDOR, v.center + HALF_CORRIDOR]);
      v.gaps.push([h.center - HALF_CORRIDOR, h.center + HALF_CORRIDOR]);
    }
  }
  for (const r of roads) r.gaps.sort((a, b) => a[0] - b[0]);
}

// --- mega malls --------------------------------------------------------------------------------------------
// Two big malls, one at each end of the streets (the west and the east of the land), flush to a busy road with a clear
// frontage. Each is one large building with a row of stores along its front. Walk to the door (or click the mall) and a
// directory lists the stores; every store has its own interior, offers and logo (lib/content/interiorScenes.js).
// A store is plot-shaped but is not in `plots` (it has no lot of its own): its id is `mall-<n>-s<k>`.
export const MALL = { size: [36, 24], height: 3.6, storeCount: 10 };
const MALL_NAMES = ['Westgate Mega Mall', 'Eastgate Mega Mall'];
const MALL_STORE_TYPES = ['shop', 'restaurant', 'shop', 'shop', 'restaurant', 'office', 'shop', 'shop', 'restaurant', 'shop'];
const MALL_DISTRICT = {
  id: 'mall',
  name: 'Mega Mall',
  color: '#6366f1',
  typeWeights: { shop: 1 },
  palette: ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6', '#ef4444', '#0ea5e9'],
  categories: ['Retail'],
  theme: 'shop',
  prefixes: ['Pixel', 'Nova', 'Urban', 'Bloom', 'Retro', 'Vivid', 'Orbit', 'Maple', 'Echo', 'Atlas', 'Luna', 'Crisp'],
  suffixes: ['Boutique', 'Outfitters', 'Gadgets', 'Kitchen', 'Grill', 'Cafe', 'Studio', 'Games', 'Books', 'Threads'],
};

function planMalls(rand, roads, obstacles, county, centreZ) {
  const centreX = (county.x0 + county.x1) / 2;
  const half = (county.x1 - county.x0) / 2;
  const cands = { west: [], east: [] };
  for (const r of roads) {
    const traffic = r.class === 'arterial' ? 2 : r.kind === 'county' ? 1 : 0;
    if (!traffic) continue;
    const junctions = junctionsOn(r, roads);
    for (const side of [-1, 1]) {
      for (const [LEN, DEPTH] of [MALL.size, [MALL.size[1], MALL.size[0]]]) {
        for (let u = r.from + 4; u + LEN <= r.to - 4; u += 4) {
          if (junctions.some((j) => j > u - 3 && j < u + LEN + 3)) continue; // a clear frontage: the door is on it
          const site = roadsideRect(r, side, u, LEN, DEPTH, 0);
          const off = site.x - centreX;
          if (Math.abs(off) < half * 0.45) continue; // out towards the ends
          if (obstacles.some((o) => rectsOverlap(inflateAway(site.rect, r, side, 0.6), o))) continue;
          (off < 0 ? cands.west : cands.east).push({ ...site, road: r, side, w: LEN, d: DEPTH, score: traffic * 3 + Math.abs(off) * 0.1 - Math.abs(site.z - centreZ) * 0.04 + rand() * 3 });
        }
      }
    }
  }
  const malls = [];
  for (const [i, end] of ['west', 'east'].entries()) {
    const list = cands[end].sort((a, b) => b.score - a.score);
    const c = list.find((x) => malls.every((m) => Math.hypot(m.x - x.x, m.z - x.z) > 80));
    if (!c) continue;
    const out = c.facing * (c.d / 2 + 0.35); // the door, on the front wall's middle (like a plot's)
    malls.push({
      id: `mall-${i + 1}`,
      name: MALL_NAMES[i],
      end,
      x: c.x,
      z: c.z,
      w: c.w,
      d: c.d,
      yaw: c.yaw,
      facing: c.facing,
      rect: c.rect,
      height: MALL.height,
      frontRoad: c.road.id,
      frontSide: c.side,
      door: { x: c.x + Math.sin(c.yaw) * out, z: c.z + Math.cos(c.yaw) * out },
    });
    obstacles.push(inflate(c.rect, 0.4));
  }
  return malls;
}

// The stores in a mall: plot-shaped (title, type, interior, offers), from a stream of their own.
function makeMallStores(seed, mall, index) {
  const rand = forkRand(seed, 6000 + index);
  const used = new Set();
  return MALL_STORE_TYPES.slice(0, MALL.storeCount).map((type, k) => {
    const district = { ...MALL_DISTRICT, typeWeights: { [type]: 1 } };
    let store = makePlot(rand, `${mall.id}-s${k + 1}`, { x: mall.x, z: mall.z }, null, null, district, mall.facing, null, true);
    for (let tries = 0; used.has(store.title) && tries < 12; tries++) store = makePlot(rand, store.id, { x: mall.x, z: mall.z }, null, null, district, mall.facing, null, true);
    used.add(store.title);
    return {
      ...store,
      mall: mall.id,
      unit: k,
      owner: mall.name,
      districtId: 'mall',
      district: 'Mega Mall',
      height: 2.4,
      interiorData: { ...store.interiorData, floors: 1 },
    };
  });
}

// --- boats ---------------------------------------------------------------------------------------------------
// Boats moored just off the bank: one on each lake and two on the river, kept clear of the bridges. The player can sail them
// (lib/sim/vehicles.js). They come from their own random stream, so they change nothing else.
const BOAT_COLOURS = ['#b45309', '#1d4ed8', '#dc2626', '#f8fafc', '#15803d', '#f59e0b'];
function buildBoats(seed, { lakes, river, bridges }) {
  const rand = forkRand(seed, 4243);
  const boats = [];
  const add = (x, z, yaw, water) =>
    boats.push({ id: `boat-${boats.length + 1}`, kind: pick(rand, BOAT_KINDS), x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, yaw, color: pick(rand, BOAT_COLOURS), water });
  for (const l of lakes) {
    const side = rand() < 0.5 ? -1 : 1;
    add(l.x + side * (l.rx - 1.6), l.z + (rand() - 0.5) * l.rz * 0.8, side < 0 ? 0 : Math.PI, l.id);
  }
  const alongZ = river.axis === 'z';
  const [lo, hi] = alongZ ? [river.z0 + 12, river.z1 - 12] : [river.x0 + 12, river.x1 - 12];
  const placed = [];
  for (let n = 0, tries = 0; n < 2 && tries < 60; tries++) {
    const u = lo + rand() * (hi - lo);
    if (bridges.some((b) => Math.abs(b.center - u) < 9) || placed.some((p) => Math.abs(p - u) < 16)) continue;
    placed.push(u);
    const bank = rand() < 0.5 ? 0 : 1;
    const across = alongZ ? (bank ? river.x1 - 1.7 : river.x0 + 1.7) : bank ? river.z1 - 1.7 : river.z0 + 1.7;
    if (alongZ) add(across, u, bank ? Math.PI : 0, river.id);
    else add(u, across, bank ? Math.PI * 1.5 : Math.PI / 2, river.id);
    n++;
  }
  return boats;
}

// --- ground textures ---------------------------------------------------------------------------------
// Patches of different ground in the open country (dirt, gravel, sand, dry grass, meadow, moss), clustered so each
// reads as a stretch of land rather than confetti. Placed from a stream of their own, so they change nothing else.
export const GROUND_KINDS = ['dirt', 'gravel', 'sand', 'dry', 'meadow', 'moss'];
function buildGroundPatches(seed, { land, urban, obstacles, fields }) {
  const rand = forkRand(seed, 7919);
  const phase = [rand() * 100, rand() * 100, rand() * 100, rand() * 100];
  const noise = (x, z, k) => 0.5 + 0.25 * Math.sin(x / 17 + phase[k]) + 0.25 * Math.sin(z / 13 + phase[(k + 1) % 4] + x / 31);
  const patches = [];
  const taken = [];
  const free = (r) => r.x0 > land.x0 + 0.5 && r.x1 < land.x1 - 0.5 && r.z0 > land.z0 + 0.5 && r.z1 < land.z1 - 0.5 && !rectsOverlap(r, urban) && !obstacles.some((o) => rectsOverlap(r, o)) && !fields.some((f) => rectsOverlap(r, f)) && !taken.some((t) => rectsOverlap(r, t));
  for (let z = land.z0 + 3; z < land.z1 - 3; z += 3.2) {
    for (let x = land.x0 + 3; x < land.x1 - 3; x += 3.2) {
      if (rand() > 0.34) continue;
      const w = 2.4 + rand() * 4.6;
      const d = 2.4 + rand() * 4.6;
      const cx = x + (rand() - 0.5) * 2;
      const cz = z + (rand() - 0.5) * 2;
      const rect = rectOf(cx, cz, w / 2, d / 2);
      if (!free(inflate(rect, 0.3))) continue;
      const n = noise(cx, cz, 0);
      const m = noise(cx, cz, 2);
      const kind = n < 0.3 ? 'dirt' : n < 0.42 ? 'gravel' : n < 0.52 ? 'sand' : m < 0.45 ? 'dry' : m < 0.7 ? 'meadow' : 'moss';
      taken.push(rect);
      patches.push({ x: cx, z: cz, w: Math.round(w * 10) / 10, d: Math.round(d * 10) / 10, kind });
    }
  }
  return patches;
}

// The ground round an airport that new streets keep clear of: the planes are low along the runway's line (the airport's long side) and towing banners, so
// the corridor runs 90 out beyond each end and 28 beyond the runway side (away from the city; towards the city the county road is the limit).
const approachRect = (r, county) => {
  const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
  if (alongX) {
    const north = (r.z0 + r.z1) / 2 < (county.z0 + county.z1) / 2; // outside the north county road, else the south
    return { x0: r.x0 - 90, x1: r.x1 + 90, z0: north ? r.z0 - 28 : r.z0, z1: north ? r.z1 : r.z1 + 28 };
  }
  const west = (r.x0 + r.x1) / 2 < (county.x0 + county.x1) / 2;
  return { x0: west ? r.x0 - 28 : r.x0, x1: west ? r.x1 : r.x1 + 28, z0: r.z0 - 90, z1: r.z1 + 90 };
};

export function generateCity(seed, options = {}) {
  const rand = mulberry32(seed);
  const shuffled = shuffle(rand, DISTRICTS);
  const districts = AVENUE_INDEXES.map((_, i) => shuffled[i % shuffled.length]);
  const streetColumns = pickStreetColumns(rand);
  const streetNames = shuffle(rand, STREET_NAMES);
  const realNames = realStreetNames(seed, options); // real names replace the built-in ones without touching the main random stream
  const arterialCols = arterialColumns(streetColumns);

  const colX = buildColumnX(new Set([...streetColumns, ...SUBURB_STREET_COLS]));
  const avenueRows = AVENUE_INDEXES.map((k) => k * AVENUE_ROW_SPACING); // logical rows
  const avenueZ = AVENUE_INDEXES.map((k) => k * AVENUE_SPACING); // world z of each avenue
  const park = buildPark(rand, avenueRows, avenueZ, streetColumns, colX);

  // The main grid's outer plot edges, the perimeter ring roads around them, and Old Town's extent.
  const xWest = colX[GRID_X_MIN] - PLOT_TILE / 2;
  const xEast = colX[GRID_X_MAX] + PLOT_TILE / 2;
  const zNorth = avenueZ[0] - ROW_OFFSET - PLOT_TILE / 2;
  const zSouth = avenueZ[avenueZ.length - 1] + ROW_OFFSET + PLOT_TILE / 2;
  const ringW = xWest - RING_GAP;
  const ringE = xEast + RING_GAP;
  const ringN = zNorth - RING_GAP;
  const ringS = zSouth + RING_GAP;

  const spineIdx = [...ARTERIAL_AVENUES][0];
  const oldTownAvenues = new Set([spineIdx - 1, spineIdx, spineIdx + 1]);
  const oldTownEast = colX[SUBURB_LAST_COL] + PLOT_TILE / 2;
  const oldTownRoadX = oldTownEast + PLOT_GAP + HALF_CORRIDOR;
  // Old Town is boxed in by the ring road on its north side and by the next avenue south of it.
  const oldTownBoundaryIdx = Math.max(...oldTownAvenues) + 1;

  // The county road loops round the whole city; the arterials carry on out to it.
  const county = {
    x0: ringW - RURAL_DEPTH,
    x1: oldTownRoadX + RURAL_DEPTH,
    z0: ringN - RURAL_DEPTH,
    z1: ringS + RURAL_DEPTH,
  };

  const plots = [];
  const roads = [];
  let nextId = 1;

  const road = (r) => roads.push({ color: '#e2e8f0', gaps: [], density: 1, ...r });

  // --- roads: every one starts and ends at a junction --------------------------------------------
  districts.forEach((district, i) => {
    const arterial = ARTERIAL_AVENUES.has(i);
    const inOldTown = oldTownAvenues.has(i);
    const from = arterial ? county.x0 : ringW;
    const to = inOldTown ? (arterial ? county.x1 : oldTownRoadX) : i === oldTownBoundaryIdx ? oldTownRoadX : ringE;
    const rural = [];
    if (from < ringW) rural.push([from, ringW - 7]);
    if (to > oldTownRoadX) rural.push([oldTownRoadX + 7, to]);
    road({
      id: `avenue-${i}-${district.id}`,
      kind: 'avenue',
      class: arterial ? 'arterial' : 'local',
      axis: 'x',
      name: district.name,
      color: district.color,
      center: avenueZ[i],
      from,
      to,
      labelAt: [xWest - 1.2, avenueZ[i]],
      frontage: rural.length ? 'country' : null,
      density: COUNTRY_LOT_SHARE,
      rural,
    });
  });
  streetColumns.forEach((col, i) => {
    const arterial = arterialCols.has(col);
    road({
      id: `street-${col}`,
      kind: 'street',
      class: arterial ? 'arterial' : 'local',
      axis: 'z',
      name: streetNameAt(realNames || streetNames, i),
      center: colX[col],
      from: arterial ? county.z0 : ringN,
      to: arterial ? county.z1 : ringS,
      labelAt: [colX[col], zNorth - 1.2],
      frontage: arterial ? 'country' : null,
      density: COUNTRY_LOT_SHARE,
      rural: arterial ? [[county.z0, ringN - 7], [ringS + 7, county.z1]] : undefined,
    });
  });
  // the perimeter: arterial ring roads that every avenue and street meets (the north one carries on east to close Old Town)
  const ring = { kind: 'ring', class: 'arterial', frontage: 'outskirts', density: 1 };
  road({ ...ring, id: 'ring-north', axis: 'x', name: 'North Ring', center: ringN, from: ringW, to: oldTownRoadX, labelAt: [ringW + 7, ringN] });
  road({ ...ring, id: 'ring-south', axis: 'x', name: 'South Ring', center: ringS, from: ringW, to: ringE, labelAt: [ringW + 7, ringS] });
  road({ ...ring, id: 'ring-west', axis: 'z', name: 'West Ring', center: ringW, from: ringN, to: ringS, labelAt: [ringW, ringN + 7] });
  road({ ...ring, id: 'ring-east', axis: 'z', name: 'East Ring', center: ringE, from: ringN, to: ringS, labelAt: [ringE, ringN + 7] });
  // Old Town's own streets, from the north ring to its southern boundary avenue
  const oldTownSouthRoad = avenueZ[oldTownBoundaryIdx];
  SUBURB_STREET_COLS.forEach((col, i) => {
    road({
      id: `oldtown-street-${col}`,
      kind: 'street',
      class: 'local',
      axis: 'z',
      name: OLD_TOWN_STREETS[i],
      center: colX[col],
      from: ringN,
      to: oldTownSouthRoad,
      labelAt: [colX[col], ringN + 1.5],
    });
  });
  road({ id: 'oldtown-east', kind: 'ring', class: 'local', axis: 'z', name: 'Old Town Rd', center: oldTownRoadX, from: ringN, to: oldTownSouthRoad, labelAt: [oldTownRoadX, ringN + 1.5], frontage: 'outskirts', density: 1 });
  // the county road
  const countyBase = { kind: 'county', class: 'local', frontage: 'country', density: COUNTRY_LOT_SHARE };
  road({ ...countyBase, id: 'county-north', axis: 'x', name: 'North County Rd', center: county.z0, from: county.x0, to: county.x1, labelAt: [county.x0 + 10, county.z0] });
  road({ ...countyBase, id: 'county-south', axis: 'x', name: 'South County Rd', center: county.z1, from: county.x0, to: county.x1, labelAt: [county.x0 + 10, county.z1] });
  road({ ...countyBase, id: 'county-west', axis: 'z', name: 'West County Rd', center: county.x0, from: county.z0, to: county.z1, labelAt: [county.x0, county.z0 + 10] });
  road({ ...countyBase, id: 'county-east', axis: 'z', name: 'East County Rd', center: county.x1, from: county.z0, to: county.z1, labelAt: [county.x1, county.z0 + 10] });

  // --- plots --------------------------------------------------------------------------------
  // First work out which cells exist, then which of them merge into prime plots.
  const cellSet = new Set();
  districts.forEach((_, i) => {
    const row = avenueRows[i];
    for (const gridZ of [row - 1, row + 1]) {
      for (let gridX = GRID_X_MIN; gridX <= GRID_X_MAX; gridX++) {
        if (streetColumns.includes(gridX)) continue;
        if (park && park.gridZ.includes(gridZ) && gridX >= park.col0 && gridX <= park.col1) continue;
        cellSet.add(`${gridX},${gridZ}`);
      }
    }
  });
  const primeGroups = pickPrimeGroups(rand, { avenueRows, cellSet, arterialCols, park });
  const groupOfCell = new Map();
  for (const g of primeGroups) for (const [gx, gz] of g.cells) groupOfCell.set(`${gx},${gz}`, g);

  districts.forEach((district, i) => {
    const row = avenueRows[i];
    for (const gridZ of [row - 1, row + 1]) {
      for (let gridX = GRID_X_MIN; gridX <= GRID_X_MAX; gridX++) {
        if (!cellSet.has(`${gridX},${gridZ}`)) continue;
        const facing = gridZ < row ? 1 : -1;
        const group = groupOfCell.get(`${gridX},${gridZ}`);
        if (group) {
          if (group.done) continue; // the first cell we reach creates the whole plot
          group.done = true;
          const xs = group.cells.map(([gx]) => colX[gx]);
          const zs = group.cells.map(([, gz]) => zOfGridZ(gz));
          const shape = {
            kind: group.kind,
            cells: group.cells,
            w: Math.max(...xs) - Math.min(...xs) + PLOT_TILE,
            d: Math.max(...zs) - Math.min(...zs) + PLOT_TILE,
            built: group.built,
          };
          const pos = { x: (Math.max(...xs) + Math.min(...xs)) / 2, z: (Math.max(...zs) + Math.min(...zs)) / 2 };
          plots.push(makePlot(rand, nextId++, pos, gridX, gridZ, district, facing, shape));
          continue;
        }
        plots.push(makePlot(rand, nextId++, { x: colX[gridX], z: zOfGridZ(gridZ) }, gridX, gridZ, district, facing));
      }
    }
  });
  for (const i of oldTownAvenues) {
    const row = avenueRows[i];
    for (const gridZ of [row - 1, row + 1]) {
      for (let gridX = SUBURB_FIRST_COL; gridX <= SUBURB_LAST_COL; gridX++) {
        if (SUBURB_STREET_COLS.includes(gridX)) continue;
        plots.push(makeSuburbLot(rand, nextId++, { x: colX[gridX], z: zOfGridZ(gridZ) }, gridX, gridZ, gridZ < row ? 1 : -1));
      }
    }
  }

  if (park) applyParkBoost(park, plots);

  // --- the diagonal avenue: a chain of circles, the plots cleared round them, new lots in the wedges ---
  const parkRect = park ? { x0: park.center.x - park.width / 2, x1: park.center.x + park.width / 2, z0: park.center.z - park.depth / 2, z1: park.center.z + park.depth / 2 } : null;
  const avenueRoads = roads.filter((r) => r.kind === 'avenue').sort((a, b) => a.center - b.center);
  const mainStreets = roads.filter((r) => r.kind === 'street' && !r.id.startsWith('oldtown'));
  // the park and the luxury estates are never built over
  const estateRect = (p) => ({ x0: p.x - p.w / 2 - 0.5, x1: p.x + p.w / 2 + 0.5, z0: p.z - p.d / 2 - 0.5, z1: p.z + p.d / 2 + 0.5 });
  let avoidRects = [parkRect, ...plots.filter((p) => p.luxury).map(estateRect)].filter(Boolean);
  const planArgs = { avenues: avenueRoads, streets: mainStreets, xMin: xWest + 8, xMax: xEast - 8 };
  let chain = planDiagonal(rand, { ...planArgs, avoid: avoidRects });
  if (!chain) {
    // no room: let it run over the estates that are already built (the ones for sale are never touched)
    avoidRects = [parkRect, ...plots.filter((p) => p.luxury && !p.owner).map(estateRect)].filter(Boolean);
    chain = planDiagonal(rand, { ...planArgs, avoid: avoidRects });
  }
  const circles = [];
  const diagonals = [];
  const diagonalName = pick(rand, ['Grand Diagonal', 'Union Avenue', 'Capitol Avenue', 'Broadway']);
  (chain ?? []).forEach((n, k) => circles.push({ id: `circle-${k + 1}`, x: n.x, z: n.z, avenue: n.avenue, street: n.street, spec: CIRCLE, legs: [] }));
  // A couple of quiet local x local four-way crossings become compact circles too (these replace the old
  // small roundabouts, whose ring did not meet the road edges). Never next to the big circles or the park.
  const roundaboutSpots = shuffle(
    rand,
    avenueRoads
      .filter((a) => a.class === 'local')
      .flatMap((a) => mainStreets.filter((st) => st.class === 'local').map((st) => ({ x: st.center, z: a.center, avenue: a, street: st })))
  ).filter((c) => !(chain ?? []).some((n) => Math.hypot(n.x - c.x, n.z - c.z) < ROUNDABOUT_SPACING) && !avoidRects.some((r) => distToRect(c.x, c.z, r) < ROUNDABOUT.clear + 1));
  const chosen = [];
  for (const c of roundaboutSpots) {
    if (chosen.length >= MAX_ROUNDABOUTS) break;
    if (chosen.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < ROUNDABOUT_SPACING)) continue;
    chosen.push(c);
  }
  chosen.forEach((c, k) => circles.push({ id: `roundabout-${k + 1}`, ...c, spec: ROUNDABOUT, legs: [] }));

  const carved = carveDiagonal(rand, chain ?? [], circles, plots, roads, park, { x0: xWest, x1: xEast, z0: zNorth, z1: zSouth });
  carved.segs.forEach((s) => {
    const id = `diagonal-${s.k + 1}`;
    diagonals.push({ id, name: diagonalName, class: 'arterial', p0: s.p0, p1: s.p1, length: s.length, dir: s.dir, from: circles[s.k].id, to: circles[s.k + 1].id });
    circles[s.k].legs.push({ key: `d${circles[s.k].legs.length}`, road: id, end: 'from', dir: s.dir });
    circles[s.k + 1].legs.push({ key: `d${circles[s.k + 1].legs.length}`, road: id, end: 'to', dir: [-s.dir[0], -s.dir[1]] });
  });
  for (const lot of carved.lots) {
    const plot = makePlot(rand, nextId++, { x: lot.x, z: lot.z }, null, null, DIAGONAL, lot.facing ?? 1);
    plot.yaw = lot.yaw;
    plot.value = Math.round(plot.value * 1.4); // frontage on a circle
    plots.push(plot);
  }
  // rectangles standing for the diagonal's roadway and circles, for anything placed later to keep clear of
  const diagonalRects = [
    ...circles.map((c) => rectOf(c.x, c.z, c.spec.clear, c.spec.clear)),
    ...diagonals.flatMap((d) => {
      const out = [];
      for (let t = 0; t <= d.length; t += 1.2) out.push(rectOf(d.p0.x + d.dir[0] * t, d.p0.z + d.dir[1] * t, 1.5, 1.5));
      return out;
    }),
  ];

  buildMore(rand, plots, Object.fromEntries(DISTRICTS.map((d) => [d.id, d])));

  const billboards = buildBillboards(rand, roads, plots, { xWest, zNorth });

  // --- water: a river across one side of the country, and rectangular lakes with loop roads -------------
  const river = planRiver(rand, { county, ringW, ringN, ringS, eastEdge: oldTownRoadX });
  // A drive runs along the city side of the river, like an embankment road: it joins the county road at a
  // T at each end and crosses the arterials on the way, with riverside lots beside it.
  const driveBase = { id: 'river-drive', kind: 'drive', class: 'arterial', name: `${river.name} Drive`, frontage: 'riverside', density: 0.55, color: '#e2e8f0', gaps: [] };
  let drive;
  if (river.axis === 'z') {
    const cx = river.side === 'west' ? river.x1 + DRIVE_OFFSET : river.x0 - DRIVE_OFFSET;
    drive = { ...driveBase, axis: 'z', center: cx, from: county.z0, to: county.z1, labelAt: [cx, county.z0 + 14] };
  } else {
    const cz = river.side === 'north' ? river.z1 + DRIVE_OFFSET : river.z0 - DRIVE_OFFSET;
    drive = { ...driveBase, axis: 'x', center: cz, from: county.x0, to: county.x1, labelAt: [county.x0 + 16, cz] };
  }
  drive.sides = [-riverSide(river, drive)]; // lots only on the city side: the river side is the riverwalk (lib/city/promenade.js)
  roads.push(drive);
  const riverRect = inflate({ x0: river.x0, x1: river.x1, z0: river.z0, z1: river.z1 }, 1.6);
  const cityCentre = { x: (ringW + oldTownRoadX) / 2, z: (ringN + ringS) / 2 };
  // Land kept for the player's own road and plot: two sites beside busy arterials.
  const reserved = planReservedSites(rand, roads, obstacleRects({ roads, plots, billboards, parks: park ? [park] : [], reserved: [], water: [riverRect, ...diagonalRects] }), cityCentre);
  // The second, much larger park, beside a main road.
  const bigPark = planBigPark(rand, roads, obstacleRects({ roads, plots, billboards, parks: park ? [park] : [], reserved, water: [riverRect, ...diagonalRects] }), cityCentre, seed);
  const parks = [park, bigPark].filter(Boolean);
  const base = obstacleRects({ roads, plots, billboards, parks, reserved, water: [riverRect, ...diagonalRects] });
  const reservedFronts = reserved.map((a) => {
    const road = roads.find((r) => r.id === a.frontRoad);
    return { road: a.frontRoad, u0: road.axis === 'x' ? a.x0 : a.z0, u1: road.axis === 'x' ? a.x1 : a.z1 };
  });
  const lakePlan = planLakes(rand, roads, base, county, river, reservedFronts);
  roads.push(...lakePlan.roads);
  const lakes = lakePlan.lakes;
  // Two airports beyond the county road, each joined to it by a spur and ringed by its own road.
  const airportPlan = planAirports(rand, roads, base, county, river, reservedFronts);
  roads.push(...airportPlan.roads);
  const airports = airportPlan.airports;
  // A range of low hills in the north-east, with a road through them.
  const highlandPlan = planHighlands(seed, roads, base, county, river, reservedFronts);
  roads.push(...highlandPlan.roads);
  for (const r of highlandPlan.roads) base.push(corridorRect(r));
  if (highlandPlan.area) base.push(highlandPlan.area);
  const hills = highlandPlan.hills;
  // The two malls, at the ends of the streets: they take what is left at the west and east ends, after the lakes and airports
  // have their room (the stores come from streams of their own).
  const mallObstacles = obstacleRects({ roads, plots, billboards, parks, reserved, water: [riverRect, ...diagonalRects, ...lakes.map((l) => rectOf(l.x, l.z, l.rx + 1.3, l.rz + 1.3)), ...airports.map((a) => a.rect), ...(highlandPlan.area ? [highlandPlan.area] : [])] });
  const malls = planMalls(rand, roads, mallObstacles, county, cityCentre.z).map((m, i) => ({ ...m, stores: makeMallStores(seed, m, i) }));
  const bridges = bridgesOver(river, roads);
  // The moored boats, a pier beside each one (to tie up at, step off on and fish from), and the riverwalk: a paved walking area between the river drive and
  // the water, with a paved landing where each pier meets the bank. Planned before the lots, so nothing is built on them.
  const boats = buildBoats(seed, { lakes, river, bridges });
  const piers = buildPiers({ lakes, rivers: [river], boats });
  // each pier's paved landing, as deep as fits (it stops short of a road or a lot that is in the way: the loop road round a lake is 3.1 from the water)
  const landObstacles = obstacleRects({ roads, plots, billboards, parks, reserved, water: [], malls });
  for (const pier of piers) {
    let depth = 3.2;
    pier.plaza = landingFor(pier, { depth });
    while (depth > 0.7 && landObstacles.some((o) => rectsOverlap(pier.plaza, o))) {
      depth -= 0.4;
      pier.plaza = landingFor(pier, { depth });
    }
  }
  const walkBlockers = billboards.filter((b) => b.kind !== 'banner').map((b) => (b.yaw ? rectOf(b.x, b.z, 0.9, b.width / 2 + 0.3) : rectOf(b.x, b.z, b.width / 2 + 0.3, 0.9)));
  const promenades = planPromenades({ river, drive, roads, blockers: walkBlockers }).promenades;

  // --- infill: new local streets across the free ground between roads, found by lib/city/infill.js; each runs from one road to the next
  // and gets lots on both sides below. Planned before the junctions, so they get their junctions (and the pavement gaps) with all the others.
  const infillOn = options.infill !== false && process.env.NEXT_PUBLIC_INFILL !== '0'; // NEXT_PUBLIC_INFILL=0 builds the game without the new streets (for comparing)
  const amusementOn = options.amusement !== false && process.env.NEXT_PUBLIC_AMUSEMENT !== '0';
  const infillCfg = { target: INFILL_TARGET, ...(typeof options.infill === 'object' ? options.infill : {}) };
  const infillRoads = [];
  let amusement = null;
  if (infillOn || amusementOn) {
    const lakeRects = lakes.map((l) => rectOf(l.x, l.z, l.rx + 1.3, l.rz + 1.3));
    const planObstacles = obstacleRects({ roads, plots, billboards, parks, reserved, water: [riverRect, ...diagonalRects, ...lakeRects, ...airports.map((a) => approachRect(a.rect, county)), ...(highlandPlan.area ? [highlandPlan.area] : [])], malls }); // (the planes are low along the runway line, with their banners)
    const extra = Math.max(0, infillCfg.target - (plots.length + INFILL_OTHER_LOTS));
    const index = new RectIndex(planObstacles);
    const claimed = new Map(); // where the new streets already make junctions, road by road
    // stretches of road that must keep clear of new junctions: in front of the reserved sites and of the malls
    const keepOut = [...reservedFronts, ...malls.map((m) => ({ road: m.frontRoad, u0: roads.find((r) => r.id === m.frontRoad).axis === 'x' ? m.rect.x0 : m.rect.z0, u1: roads.find((r) => r.id === m.frontRoad).axis === 'x' ? m.rect.x1 : m.rect.z1 }))];
    // the amusement park (lib/city/amusement.js): its ground is reserved first, so the new streets and lots go round it
    if (amusementOn) {
      amusement = planAmusement({ roads, obstacles: index, bounds: inflate(county, 110), centre: cityCentre });
      if (amusement) {
        index.add(amusement.keepClear);
        keepOut.push(amusement.keepOut);
      }
    }
  if (infillOn) {
    const mk = (spec, name, extraFields = {}) => ({
      id: `infill-${infillRoads.length + 1}`,
      kind: 'infill',
      class: 'local',
      axis: spec.axis,
      name,
      color: '#e2e8f0',
      gaps: [],
      density: 1,
      center: spec.center,
      from: spec.from,
      to: spec.to,
      labelAt: spec.axis === 'z' ? [spec.center, spec.from + 4] : [spec.from + 4, spec.center],
      frontage: 'infill',
      infill: true,
      setback: INFILL_LOTS.setback, // lots on the new streets stand back from the street, and are spaced along it (lib/city/infill.js)
      pitch: INFILL_LOTS.pitch,
      ...extraFields,
    });
    const nameOf = () => {
      const i = infillRoads.length;
      const round = Math.floor(i / INFILL_NAMES.length);
      return INFILL_NAMES[i % INFILL_NAMES.length] + (round ? ` ${round + 1}` : '');
    };
    // first the streets between roads that are already there (the free ground inside the county road), then outer blocks in the country for the rest
    const plan = planInfill({ roads, obstacles: index, bounds: county, extra, centre: cityCentre, keepOut, claimed });
    for (const st of plan.streets) infillRoads.push(mk(st, nameOf(), { joins: [st.a, st.b] }));
    const rest = Math.max(0, extra - plan.lots);
    if (rest > 0) {
      const bands = planBands({ roads, obstacles: index, bounds: inflate(county, 110), extra: rest, centre: cityCentre, keepOut, claimed, why: options.infillWhy ?? null });
      for (const b of bands.blocks) {
        const name = nameOf();
        infillRoads.push(mk(b.far, `${name} Loop`, { joins: b.legs.map((l) => l.center) }));
        for (const leg of b.legs) infillRoads.push(mk(leg, nameOf(), { joins: [b.county] }));
      }
    }
    roads.push(...infillRoads);
  }
  }

  // --- junctions: every place an x-road meets a z-road, crossing or ending ----------------------
  const intersections = buildIntersections(roads, rand, circles);

  // Mid-block pedestrian crossings on long avenue blocks, so people don't walk a whole block to cross.
  const crossings = [];
  for (const r of roads.filter((x) => x.kind === 'avenue')) {
    r.crossings = [];
    for (const [a, b] of blocksBetween(r.from, r.to, r.gaps)) {
      if (b - a < MIN_BLOCK_FOR_CROSSING || rand() > 0.9) continue;
      const u = (a + b) / 2;
      if (r.rural && r.rural.some(([ra, rb]) => u > ra - 2 && u < rb + 2)) continue; // none out in the country
      r.crossings.push(u);
      crossings.push({ id: `${r.id}-c${crossings.length}`, axis: 'x', x: u, z: r.center });
    }
  }

  // --- fill the empty land with lots along the outer roads ---------------------------------------
  const lakeBodies = lakes.map((l) => rectOf(l.x, l.z, l.rx + 1.3, l.rz + 1.3));
  const water = [riverRect, ...lakeBodies, ...diagonalRects, ...airports.map((a) => a.rect), ...(highlandPlan.area ? [highlandPlan.area] : []), ...(amusement ? [amusement.keepClear] : []), ...piers.flatMap((p) => [deckRect(p, 0.6), p.plaza]), ...promenades.map((w) => w.rect)];

  // Estates first, so the ordinary lots fill in round them: the high-end Grand estates (already built) and the
  // waterfront luxury estates (for sale), on the land side of the river drive and outside each lake's loop road.
  const estateObstacles = obstacleRects({ roads, plots, billboards, parks, reserved, water, malls });
  const lakeById = Object.fromEntries(lakes.map((l) => [l.id, l]));
  const awayFromWater = (r) => {
    if (r.kind === 'drive') return [river.axis === 'z' ? (river.side === 'west' ? 1 : -1) : river.side === 'north' ? 1 : -1];
    const lake = lakeById[String(r.group).replace(/-loop$/, '')];
    if (!lake) return [];
    const toLake = r.axis === 'x' ? lake.z - r.center : lake.x - r.center;
    return [toLake > 0 ? -1 : 1];
  };
  const waterRoad = (r) => r.kind === 'drive' || r.kind === 'lake';
  const openArterial = (r) => r.class === 'arterial' && r.rural && r.rural.length > 0;
  const estateSites = [];
  // The river is the best address in the city (the riverwalk is on its other side): grand and luxury estates along the river drive, on the land side, are placed first.
  const riverDrive = (r) => r.kind === 'drive';
  estateSites.push(
    ...placeEstates(rand, roads, estateObstacles, { size: GRAND_SIZE, count: RIVER_GRAND, accept: riverDrive, sides: awayFromWater, centre: cityCentre, perFeature: RIVER_GRAND }).map((c) => ({ ...c, tier: 'grand' })),
    ...placeEstates(rand, roads, estateObstacles, { size: [PLOT_TILE * 3 + PLOT_GAP * 2, PLOT_TILE * 2 + PLOT_GAP], count: RIVER_LUXURY, accept: riverDrive, sides: awayFromWater, centre: cityCentre, perFeature: RIVER_LUXURY }).map((c) => ({ ...c, tier: 'luxury' })),
  );
  // waterfront luxury: one per water feature if it can, then more beside the same water if there is no other room
  for (const perFeature of [1, 2, 4]) {
    if (estateSites.filter((e) => e.tier === 'luxury').length >= WATERFRONT_LUXURY) break;
    const got = placeEstates(rand, roads, estateObstacles, {
      size: [PLOT_TILE * 3 + PLOT_GAP * 2, PLOT_TILE * 2 + PLOT_GAP],
      count: WATERFRONT_LUXURY - estateSites.filter((e) => e.tier === 'luxury').length,
      accept: waterRoad,
      sides: awayFromWater,
      centre: cityCentre,
      perFeature,
    });
    estateSites.push(...got.map((c) => ({ ...c, tier: 'luxury' })));
  }
  // the grand estates come after the waterfront luxury ones, so they do not take all the water-side sites
  estateSites.push(
    ...placeEstates(rand, roads, estateObstacles, {
      size: GRAND_SIZE,
      count: GRAND_COUNT - estateSites.filter((e) => e.tier === 'grand').length,
      accept: (r) => waterRoad(r) || openArterial(r),
      sides: (r) => (waterRoad(r) ? awayFromWater(r) : [-1, 1]),
      centre: cityCentre,
    }).map((c) => ({ ...c, tier: 'grand' })),
  );
  // the new streets get their share of luxury and grand estates, so the mix of tiers (landPrice.js: TIER_SHARES) holds for the bigger city
  if (infillRoads.length) {
    const want = tierTargets(Math.max(infillCfg.target, plots.length + estateSites.length + INFILL_OTHER_LOTS));
    const haveOf = (tier) => plots.filter((p) => (tier === 'grand' ? p.grand : p.luxury && !p.grand)).length + estateSites.filter((e) => e.tier === tier).length;
    for (const [tier, size] of [['luxury', [PLOT_TILE * 3 + PLOT_GAP * 2, PLOT_TILE * 2 + PLOT_GAP]], ['grand', GRAND_SIZE]]) {
      const need = want[tier] - haveOf(tier);
      if (need <= 0) continue;
      estateSites.push(...placeEstates(rand, roads, estateObstacles, { size, count: need, accept: (r) => r.infill, sides: () => [-1, 1], centre: cityCentre }).map((c) => ({ ...c, tier })));
    }
  }
  for (const site of estateSites) {
    const grand = site.tier === 'grand';
    const size = grand ? GRAND_SIZE : [PLOT_TILE * 3 + PLOT_GAP * 2, PLOT_TILE * 2 + PLOT_GAP];
    const shape = { kind: site.tier, cells: Array.from({ length: grand ? 10 : 6 }, () => [null, null]), w: size[0], d: size[1], built: grand };
    const district = site.road.kind === 'drive' ? RIVERSIDE : site.road.kind === 'lake' ? LAKESIDE : site.road.infill ? INFILL_DISTRICT : COUNTRYSIDE;
    const plot = makePlot(rand, nextId++, { x: site.x, z: site.z }, null, null, district, site.facing, shape);
    if (site.yaw) plot.yaw = site.yaw;
    plots.push(plot);
  }

  const obstacles = obstacleRects({ roads, plots, billboards, parks, reserved, water, malls });
  // the new streets claim their lots first (the roads they join would otherwise take the lots beside the junctions)
  const lots = frontageLots(rand, [...roads.filter((r) => r.infill), ...roads.filter((r) => !r.infill)], obstacles);
  // Prime lots on the new streets: pairs of neighbouring lots, nearest the middle of the city first, until the city has its share of prime lots.
  const joined = new Set();
  const pairs = [];
  if (infillRoads.length) {
    const wantPrime = tierTargets(plots.length + lots.length).prime;
    let need = Math.max(0, wantPrime - plots.filter((p) => p.prime && !p.luxury).length);
    const roadById = Object.fromEntries(infillRoads.map((r) => [r.id, r]));
    const along = (l) => (roadById[l.road].axis === 'x' ? l.x : l.z);
    const rows = new Map();
    for (const l of lots) if (l.frontage === 'infill') rows.set(`${l.road}|${l.side}`, [...(rows.get(`${l.road}|${l.side}`) ?? []), l]);
    const candidates = [];
    for (const row of rows.values()) {
      row.sort((a, b) => along(a) - along(b));
      for (let i = 0; i + 1 < row.length; i++) if (Math.abs(along(row[i + 1]) - along(row[i]) - INFILL_LOTS.pitch) < 0.05) candidates.push([row[i], row[i + 1]]);
    }
    const near = ([a, b]) => Math.hypot((a.x + b.x) / 2 - cityCentre.x, (a.z + b.z) / 2 - cityCentre.z);
    candidates.sort((p, q) => near(p) - near(q) || p[0].x - q[0].x || p[0].z - q[0].z);
    for (const pair of candidates) {
      if (need <= 0) break;
      if (joined.has(pair[0]) || joined.has(pair[1])) continue;
      joined.add(pair[0]);
      joined.add(pair[1]);
      pairs.push(pair);
      need--;
    }
  }
  for (const [a, b] of pairs) {
    const shape = { kind: 'wide', cells: [[null, null], [null, null]], w: INFILL_LOTS.pitch + PLOT_TILE, d: PLOT_TILE, built: false };
    const plot = makePlot(rand, nextId++, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, null, null, INFILL_DISTRICT, a.facing, shape);
    if (a.yaw) plot.yaw = a.yaw;
    plots.push(plot);
  }
  for (const lot of lots) {
    if (joined.has(lot)) continue;
    const district = FRONTAGE_DISTRICT[lot.frontage];
    const plot = makePlot(rand, nextId++, { x: lot.x, z: lot.z }, null, null, district, lot.facing);
    if (lot.yaw) plot.yaw = lot.yaw;
    if (lot.frontage === 'lake' || lot.frontage === 'riverside') plot.value = Math.round(plot.value * 1.5); // waterfront: dearer than a normal lot, but below a prime one
    plots.push(plot);
  }

  if (bigPark) applyBigParkBoost(bigPark, plots);
  assignAdminHqs(plots, cityCentre);

  // Tall downtown, lower towards the edge: building height falls off with distance from the centre.
  const coreRadius = Math.hypot((oldTownRoadX - ringW) / 2, (ringS - ringN) / 2);
  for (const p of plots) {
    if (!p.owner || p.buildingType === 'house' || p.height <= 0.2 || p.luxury) continue;
    const d = Math.hypot(p.x - cityCentre.x, p.z - cityCentre.z) / coreRadius;
    const factor = Math.max(0.55, Math.min(1.2, 1.25 - 0.7 * d));
    p.height = Math.round(Math.max(BUILDING_TYPES[p.buildingType].height[0] * 0.7, p.height * factor) * 10) / 10;
    if (p.interiorData) p.interiorData.floors = floorsForHeight(p.height);
  }

  // The land: a rectangle round all of it.
  const content = [...obstacles.filter((o) => o !== riverRect)];
  const land = {
    x0: Math.min(...content.map((r) => r.x0)) - LAND_MARGIN,
    x1: Math.max(...content.map((r) => r.x1)) + LAND_MARGIN,
    z0: Math.min(...content.map((r) => r.z0)) - LAND_MARGIN,
    z1: Math.max(...content.map((r) => r.z1)) + LAND_MARGIN,
  };
  // the river runs wall to wall across the land
  if (river.axis === 'z') {
    river.z0 = land.z0;
    river.z1 = land.z1;
  } else {
    river.x0 = land.x0;
    river.x1 = land.x1;
  }
  const urban = { x0: ringW - 7.5, x1: oldTownRoadX + 7.5, z0: ringN - 7.5, z1: ringS + 7.5 };
  const { fields, woods } = buildFarmland(rand, land, urban, obstacles);
  const landscape = buildLandscape(rand, roads, obstacles, { river, riverRect, bridges, lakes });
  landscape.patches = buildGroundPatches(seed, { land, urban, obstacles, fields });

  billboards.push(...buildBanners(rand, plots, airports));

  // Reserved-site designs (development only): each adds streets, junctions and lots inside its site and clears the
  // greenery round it. Everything above is already final, so none of it can change.
  const designs = devToolsOn() ? options.designs ?? {} : {};
  const designedDistrict = [];
  const curvedRoads = [];
  reserved.forEach((site, index) => {
    const input = designs[site.id];
    if (!input) return;
    const result = designReservedSite({ roads, plots, billboards, parks, reserved, landscape, seed }, site, input);
    if (!result.ok) {
      site.designError = result.error;
      return;
    }
    const fork = forkRand(seed, 31, index);
    roads.push(...result.roads);
    addDesignJunctions(result.roads, roads, intersections, fork);
    if (result.curvedRoads) {
      // a curved street: it goes in the curved roads, and its mouths are curb cuts in the front road's pavement
      curvedRoads.push(...result.curvedRoads);
      const frontRoad = roads.find((r) => r.id === site.frontRoad);
      if (frontRoad) {
        frontRoad.gaps.push(...result.frontGaps);
        frontRoad.gaps.sort((a, b) => a[0] - b[0]);
      }
    }
    result.lots.forEach((lot, k) => {
      const plot = makePlot(fork, DESIGN_PLOT_BASE + index * 1000 + k, { x: lot.x, z: lot.z }, null, null, DESIGN_DISTRICT, lot.facing, null, false, true);
      if (lot.yaw) plot.yaw = lot.yaw;
      plot.designSite = site.id;
      plots.push(plot);
    });
    landscape.trees = landscape.trees.filter((t) => !result.inClear(t)).concat(result.trees);
    landscape.bushes = landscape.bushes.filter((b) => !result.inClear(b)).concat(result.bushes);
    for (let i = woods.length - 1; i >= 0; i--) if (result.inClear(woods[i])) woods.splice(i, 1);
    for (let i = fields.length - 1; i >= 0; i--) if (rectsOverlap(fields[i], result.clear[0])) fields.splice(i, 1);
    for (let i = landscape.patches.length - 1; i >= 0; i--) if (result.inClear(landscape.patches[i])) landscape.patches.splice(i, 1);
    site.designed = true;
    site.design = result.params;
    site.designName = result.name;
    site.designSummary = result.summary;
    designedDistrict.push(DESIGN_DISTRICT);
  });

  // Each plot's pricing attributes and its land price (lib/game/landPrice.js). This is design-time data standing in for what the hand-authored world's plots will carry.
  for (const p of plots) {
    p.land = locationAttrsFor(p, { roads, parks, amusement }, plots);
    p.price = landPrice(p.land);
  }

  // The free ground inside the built-up area, as lawn (the ground there is slate, which looked like dead ground where nothing is built): rectangles for the land to draw as grass.
  const lawns = lawnRects(cityRects({ plots, billboards, layout: { roads, parks, reserved, malls, lakes, rivers: [river], airports, hills, intersections, diagonals, curvedRoads, amusement, promenades, piers } }), urban);

  return {
    plots,
    billboards,
    layout: {
      seed,
      lawns, // free ground inside `urban`, as rectangles to draw as grass (lib/city/freeLand.js lawnRects)
      roads,
      parks,
      airports,
      intersections,
      crossings,
      reserved,
      curvedRoads, // hand-designed curved roads (see lib/city/curves.js for the format); a curved reserved site adds its street here
      diagonals, // the diagonal avenue's stretches, circle to circle (straight, at an angle)
      lakes,
      rivers: [river],
      bridges,
      fields,
      woods,
      landscape,
      boats,
      piers,
      promenades, // the riverwalk (lib/city/promenade.js)
      malls,
      hills,
      urban,
      county,
      land,
      districts: [
        ...shuffled.map((d) => ({ id: d.id, name: d.name, color: d.color })),
        { id: SUBURB_ID, name: 'Old Town (suburb)', color: SUBURB_COLOR },
        { id: OUTSKIRTS.id, name: OUTSKIRTS.name, color: OUTSKIRTS.color },
        { id: COUNTRYSIDE.id, name: COUNTRYSIDE.name, color: COUNTRYSIDE.color },
        { id: LAKESIDE.id, name: LAKESIDE.name, color: LAKESIDE.color },
        { id: RIVERSIDE.id, name: RIVERSIDE.name, color: RIVERSIDE.color },
        { id: DIAGONAL.id, name: DIAGONAL.name, color: DIAGONAL.color },
        ...(infillRoads.length ? [{ id: INFILL_DISTRICT.id, name: INFILL_DISTRICT.name, color: INFILL_DISTRICT.color }] : []),
        ...(designedDistrict.length ? [{ id: DESIGN_DISTRICT.id, name: DESIGN_DISTRICT.name, color: DESIGN_DISTRICT.color }] : []),
      ],
      amusement, // the amusement park (lib/city/amusement.js), or null
      center: cityCentre,
    },
  };
}

// The generator's own pieces, for the city editor (lib/city/cityEdit.js): it makes junctions, lots and parks with the generator's own functions, so what it makes is what the
// generator would have made. `districtById` has every district a lot can be in.
export const generatorParts = {
  makePlot,
  junctionArms,
  planIntersection,
  parkContents,
  mulberry32,
  districtById: Object.fromEntries([...DISTRICTS, OUTSKIRTS, COUNTRYSIDE, LAKESIDE, RIVERSIDE, DIAGONAL, INFILL_DISTRICT, DESIGN_DISTRICT].map((d) => [d.id, d])),
};
