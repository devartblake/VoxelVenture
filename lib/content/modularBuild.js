// A building's outside built from kit pieces (docs/product/building_designer.md, phase 1): the owner picks what each side looks like and the game assembles it from Kenney's Building Kit walls, windows,
// doorways, corners and roof edge. Pure (no three.js), tested in Node, drawn by apps/web/components/city/Crowns.jsx with the prop models (instanced).
//
// The box stays: the plot's footprint, height and collision are unchanged. The pieces are a skin on the box's faces, a hair outside, in the plot's own frame (x across the building, z front to back, the
// front at +z x facing). A wall is cut into cells about CELL units wide (an odd number, at least five along a side: the two ends are the corners, and there is a middle cell for the door); each floor is FLOOR high.
//
// The kit's pieces are drawn on a 2 x 2.4 cell (a straight wall lies along z with its thickness along x; the corner is an L whose outside corner is at +x +z): they are scaled to the cell, not
// uniformly, so that a wall stays thin.
import { buildingSize } from '../city/cityGenerator';

export const CELL = 0.5; // the width a cell is cut to, in world units (an odd number of cells along a side, so there is a middle cell for the door)
export const FLOOR = 1.2; // a floor's height (lib/game/exterior.js FLOOR_HEIGHT)
export const KIT = { cell: 2, floor: 2.4 };
export const MAX_PIECES = 6000; // pieces drawn in the whole scene
const HAIR = 0.015; // how far a piece's outside face stands beyond the box's, so the two never fight
// how far the outside of each kind of piece is from its centre line in the kit (a wall is 0.1 thick, a window or doorway 0.2, a roof border's lip is at 0.25)
const OUTER = { wall: 0.05, window: 0.05, doorway: 0.05, border: 0.25 }; // (a window's or doorway's frame stands out a little more: 0.1)
const outerOf = (kind) => (kind.startsWith('border') ? OUTER.border : kind.includes('window') ? OUTER.window : kind.includes('doorway') ? OUTER.doorway : OUTER.wall);
// the walls take the building's wall colour, softened, and brightened: the kit's walls are a mid grey-blue under a texture, and a tint multiplies it (an instance colour may be over 1)
const BRIGHT = 2.2;
const tintOf = (color) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color ?? '');
  const mix = (h) => (255 - (255 - parseInt(h, 16)) * 0.55) / 255;
  return m ? [mix(m[1]) * BRIGHT, mix(m[2]) * BRIGHT, mix(m[3]) * BRIGHT] : [BRIGHT, BRIGHT, BRIGHT];
};

export const FRONTS = [
  { id: 'shopfront', label: 'Shopfront', hint: 'A doorway in the middle with windows beside it' },
  { id: 'homefront', label: 'Home front', hint: 'A doorway with a window each side' },
  { id: 'doorway', label: 'Doorway only', hint: 'A doorway in a plain wall' },
];
export const SIDE_STYLES = [
  { id: 'windows', label: 'Windows', hint: 'A window in every cell' },
  { id: 'plain', label: 'Plain', hint: 'A bare wall' },
];
export const WINDOWS = [
  { id: 'square', label: 'Square', hint: 'Square windows' },
  { id: 'round', label: 'Round', hint: 'Arched windows and doorways' },
  { id: 'wide', label: 'Wide', hint: 'Wide windows two cells across' },
];
export const CORNERS = [
  { id: 'plain', label: 'Plain', hint: 'Square corners' },
  { id: 'columns', label: 'Columns', hint: 'A column on each corner' },
  { id: 'round', label: 'Rounded', hint: 'Rounded corners' },
];
export const ROOFS = [
  { id: 'none', label: 'None', hint: 'A flat roofline' },
  { id: 'border', label: 'Low border', hint: 'A low lip round the roof' },
  { id: 'high', label: 'Parapet', hint: 'A high parapet round the roof' },
];
const ids = (list) => list.map((x) => x.id);

// What a new design starts as, by the kind of business.
export const BUILD_STARTS = {
  shop: { front: 'shopfront', back: 'plain', sides: 'windows', windows: 'wide', corners: 'plain', roof: 'border' },
  restaurant: { front: 'shopfront', back: 'plain', sides: 'windows', windows: 'round', corners: 'columns', roof: 'border' },
  office: { front: 'shopfront', back: 'windows', sides: 'windows', windows: 'square', corners: 'plain', roof: 'high' },
  house: { front: 'homefront', back: 'plain', sides: 'windows', windows: 'square', corners: 'plain', roof: 'border' },
};
export const startFor = (type) => ({ ...(BUILD_STARTS[type] ?? BUILD_STARTS.shop) });

/** Anything in, a valid design (or null for "not designed") out. A field that is not one of the options takes the start for the kind of business. */
export function cleanBuild(input, type) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const s = startFor(type);
  const pick = (v, list, fallback) => (ids(list).includes(v) ? v : fallback);
  return {
    front: pick(input.front, FRONTS, s.front),
    back: pick(input.back, SIDE_STYLES, s.back),
    sides: pick(input.sides, SIDE_STYLES, s.sides),
    windows: pick(input.windows, WINDOWS, s.windows),
    corners: pick(input.corners, CORNERS, s.corners),
    roof: pick(input.roof, ROOFS, s.roof),
  };
}

// every piece the designer can use (the prop catalogue's ids, class `piece` of the kit `building`)
const PIECES = ['wall', 'wall-window-square', 'wall-window-round', 'wall-window-wide-square', 'wall-doorway-square', 'wall-doorway-round', 'wall-corner', 'wall-corner-column', 'wall-corner-round', 'border', 'border-corner', 'border-high', 'border-high-corner'];
export const BUILD_PIECE_IDS = PIECES.map((p) => `building/${p}`);

/** The pieces to draw for a built plot, as the items PropInstances draws: [{ x, z, y, model: { id, scale, scaleV: [x, y, z], rotY, offset } }]. `catalog` is the prop catalogue; a piece it lacks is left out. */
export function buildPieces(plot, build, catalog) {
  if (!plot || !build) return [];
  const have = new Set(catalog.map((m) => m.id));
  const { bw, bd } = buildingSize(plot);
  const floors = Math.max(1, Math.round((plot.exterior?.floors ?? (plot.height ?? FLOOR * 2) / FLOOR)));
  const odd = (n) => Math.max(5, n % 2 ? n : n + 1);
  const cols = odd(Math.round(bw / CELL)), rows = odd(Math.round(bd / CELL));
  const cw = bw / cols, cd = bd / rows;
  const f = plot.facing ?? 1;
  const yaw = plot.yaw ?? 0;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const sy = FLOOR / KIT.floor;
  const tint = tintOf(plot.wallColor);
  const out = [];
  const put = (kind, lx, lz, rot, sx, sz, syy = sy, y = 0) => {
    const id = `building/${kind}`;
    if (!have.has(id)) return;
    out.push({ x: plot.x + lx * cos + lz * sin, z: plot.z - lx * sin + lz * cos, y: 0.1 + y, tint: tint, model: { id, scale: syy, scaleV: [sx, syy, sz], rotY: yaw + rot, offset: [0, 0, 0] } });
  };

  const win = (style, wide) => (wide ? 'wall-window-wide-square' : style === 'round' ? 'wall-window-round' : 'wall-window-square');
  const door = (style) => (style === 'round' ? 'wall-doorway-round' : 'wall-doorway-square');

  // the four sides: the outward direction (in the plot's frame), the cells along it (the straight ones: not the two corner cells), how long a cell is and where the wall line is
  const sides = [
    { name: 'front', out: [0, f], along: 'x', n: cols - 2, len: cw, line: (f * bd) / 2, style: build.front },
    { name: 'back', out: [0, -f], along: 'x', n: cols - 2, len: cw, line: (-f * bd) / 2, style: build.back },
    { name: 'right', out: [1, 0], along: 'z', n: rows - 2, len: cd, line: bw / 2, style: build.sides },
    { name: 'left', out: [-1, 0], along: 'z', n: rows - 2, len: cd, line: -bw / 2, style: build.sides },
  ];
  const thick = Math.min(sy, 0.5);
  for (const side of sides) {
    const rot = Math.atan2(-side.out[1], side.out[0]); // a wall's outside is +x in the kit: turn it to face outward
    const first = -(side.along === 'x' ? bw : bd) / 2 + side.len * 1.5; // the middle of the first straight cell
    const mid = Math.floor((side.n - 1) / 2); // the cell with the door (the front only)
    for (let k = 0; k < floors; k++) {
      const y = k * FLOOR;
      let c = 0;
      while (c < side.n) {
        let kind = 'wall';
        let span = 1;
        const ground = k === 0;
        if (side.name === 'front') {
          if (ground && c === mid) kind = door(build.windows);
          else if (side.style === 'shopfront') kind = win(build.windows, false);
          else if (side.style === 'homefront') kind = ground ? (Math.abs(c - mid) === 1 ? win(build.windows, false) : 'wall') : win(build.windows, false);
        } else if (side.style === 'windows') {
          const wide = build.windows === 'wide' && c + 1 < side.n; // two cells across
          kind = win(build.windows, wide);
          span = wide ? 2 : 1;
        }
        const centre = first + (c + (span - 1) / 2) * side.len;
        const lineIn = side.line - (side.line > 0 ? 1 : -1) * (outerOf(kind) * thick - HAIR); // the outside face a hair beyond the box
        const lx = side.along === 'x' ? centre : lineIn, lz = side.along === 'x' ? lineIn : centre;
        put(kind, lx, lz, rot, thick, side.len / 2, sy, y);
        c += span;
      }
    }
  }

  // corners: the kit's corner is an L with its outside corner at +x +z: turn it to each corner
  const cornerKind = { plain: 'wall-corner', columns: 'wall-corner-column', round: 'wall-corner-round' }[build.corners] ?? 'wall-corner';
  const corners = [[1, 1, 0], [1, -1, Math.PI / 2], [-1, -1, Math.PI], [-1, 1, -Math.PI / 2]];
  for (let k = 0; k < floors; k++) for (const [sxn, szn, rot] of corners) put(cornerKind, sxn * (bw / 2 - cw / 2 + HAIR), szn * (bd / 2 - cd / 2 + HAIR), rot, cw / 2, cd / 2, sy, k * FLOOR);

  // the roof edge
  if (build.roof !== 'none') {
    const high = build.roof === 'high';
    const edge = high ? 'border-high' : 'border', edgeCorner = high ? 'border-high-corner' : 'border-corner';
    const ey = floors * FLOOR;
    const es = FLOOR / KIT.floor;
    for (const side of sides) {
      const rot = Math.atan2(-side.out[1], side.out[0]);
      const first = -(side.along === 'x' ? bw : bd) / 2 + side.len * 1.5;
      for (let c = 0; c < side.n; c++) {
        const centre = first + c * side.len;
        const lineIn = side.line - (side.line > 0 ? 1 : -1) * (OUTER.border * es - HAIR);
        put(edge, side.along === 'x' ? centre : lineIn, side.along === 'x' ? lineIn : centre, rot, es, side.len / 2, es, ey);
      }
    }
    for (const [sxn, szn, rot] of corners) put(edgeCorner, sxn * (bw / 2 - cw / 2 + HAIR), szn * (bd / 2 - cd / 2 + HAIR), rot, cw / 2, cd / 2, es, ey);
  }
  return out;
}
