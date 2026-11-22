// The look of the mini-golf park (docs/world/minigolf.md, "The makeover"): the pieces that make it a theme park and not a car park with a lawn, built from boxes and a few models so the bake places them like the rest of the park.
// Every function takes the generator's own helpers, `k = { box, rect, prop, props, rnd }`, and puts things down; pure, no three.js. Colours are [r, g, b].
//
// A plain park read as a clinic: grey buildings, beige paths, one lawn. The theme (a pirate's harbour) is carried by colour (striped awnings, bunting, painted lodges), by ground that changes (boardwalk planks, sand
// beaches), and by things to look at (a volcano, a wrecked ship, a treasure chest, tiki torches, flower beds). Every one is a few boxes, so a phone pays little for it.

export const THEME = {
  teal: [34, 150, 160], navy: [38, 84, 132], cream: [244, 230, 196], sun: [248, 206, 84], coral: [232, 96, 72], red: [214, 52, 52], white: [244, 244, 244], wood: [150, 98, 58], dark: [88, 56, 36], glass: [150, 205, 235],
  rock: [96, 84, 80], lava: [255, 120, 30], gold: [244, 190, 40], leaf: [60, 160, 90], flags: [[214, 52, 52], [248, 206, 84], [34, 150, 160], [244, 244, 244], [232, 96, 72], [96, 90, 200]],
};

/** A row of small coloured flags strung between two posts, sagging a little (along x, or along z with `alongZ`). */
export function bunting(k, x0, z0, x1, z1, y, n = 12) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, sag = Math.sin(t * Math.PI) * 0.55;
    k.box(x0 + (x1 - x0) * t, y - sag - 0.3, z0 + (z1 - z0) * t, 0.22, 0.3, 0.22, THEME.flags[i % THEME.flags.length], Math.PI / 4);
  }
  k.box((x0 + x1) / 2, y - 0.3, (z0 + z1) / 2, Math.abs(x1 - x0) / 2 || 0.05, 0.04, Math.abs(z1 - z0) / 2 || 0.05, [60, 50, 44]); // the string
}

/** A striped canopy (alternating bands) over `x - hx .. x + hx`, projecting `depth` toward `f` (+1 or -1 in z), at height y. */
export function awning(k, x, y, z, hx, depth, f = 1, a = THEME.red, b = THEME.white) {
  const n = Math.max(2, Math.round(hx)), w = hx / n;
  for (let i = 0; i < n; i++) k.box(x - hx + w * (2 * i + 1), y, z + (f * depth) / 2, w, 0.12, depth / 2, i % 2 ? b : a);
  k.box(x, y - 0.35, z + f * depth, hx, 0.3, 0.06, a); // the valance
}

/** A painted lodge: walls with a trim, a two-tier roof with an overhang, a door, windows, a striped canopy over the porch, a flagpole. `f` is the way it faces (+1: its front toward +z). Returns its front z. */
export function lodge(k, x, z, f, { hx = 7, hz = 5, h = 5, wall = THEME.cream, trim = THEME.teal, roof = THEME.coral, flag = THEME.red, a = THEME.red, b = THEME.white } = {}) {
  const front = z + f * hz;
  k.box(x, h / 2, z, hx, h / 2, hz, wall); // the walls
  k.box(x, 0.5, z, hx + 0.12, 0.5, hz + 0.12, trim); // a painted base
  k.box(x, h + 0.35, z, hx + 1.1, 0.35, hz + 1.1, roof); // the roof, overhanging
  k.box(x, h + 1.3, z, hx - 1, 0.6, hz - 0.9, roof.map((v) => Math.round(v * 0.82))); // the upper tier
  k.box(x, h + 2.2, z, hx - 3, 0.35, hz - 2.4, trim); // a ridge in the trim colour
  k.box(x + hx * 0.45, h + 2.6, z - f * hz * 0.4, 0.7, 1.1, 0.7, [120, 80, 70]); // a chimney
  k.box(x, 1.4, front + f * 0.05, 0.9, 1.4, 0.06, THEME.dark); // the door
  k.box(x, 3.1, front + f * 0.06, 1.05, 0.12, 0.05, trim);
  for (const s of [-1, 1]) { // windows each side of the door: glass in a white frame
    const wx = x + s * hx * 0.55;
    k.box(wx, 2.6, front + f * 0.04, 1.35, 1.15, 0.05, THEME.white); k.box(wx, 2.6, front + f * 0.07, 1.15, 0.95, 0.05, THEME.glass);
    k.box(wx, 1.35, front + f * 0.3, 1.5, 0.12, 0.3, trim); // a sill / flower box
  }
  awning(k, x, h - 0.9, front, hx * 0.62, 2.6, f, a, b);
  for (const s of [-1, 1]) k.box(x + s * hx * 0.62, (h - 0.9) / 2, front + f * 2.5, 0.1, (h - 0.9) / 2, 0.1, THEME.wood); // the canopy's posts
  const px = x + hx + 1.4; // a flagpole at the side, a pennant at its top
  k.box(px, 5, z + f * (hz - 0.5), 0.1, 5, 0.1, [220, 220, 220]); k.box(px + 0.9, 9, z + f * (hz - 0.5), 0.9, 0.55, 0.05, flag); k.box(px, 10.2, z + f * (hz - 0.5), 0.2, 0.2, 0.2, THEME.gold);
  return front;
}

/** A pirate's ship run aground: a hull, a rim, two masts with cream sails and a black flag, a stern cabin and a bowsprit. `rot` 1 turns it a quarter. */
export function ship(k, x, z, s = 1, rot = 0) {
  const b = (dx, dy, dz, hx, hy, hz, col, yaw = 0) => (rot ? k.box(x + dz * s, dy * s, z - dx * s, hz * s, hy * s, hx * s, col, yaw ? yaw + Math.PI / 2 : Math.PI / 2 * 0) : k.box(x + dx * s, dy * s, z + dz * s, hx * s, hy * s, hz * s, col, yaw));
  b(0, 0.9, 0, 3, 0.9, 8, [120, 76, 44]); b(0, 2.0, 0, 3.4, 0.5, 8.6, [96, 60, 36]); b(0, 2.9, -8.5, 1.3, 0.5, 1.4, [96, 60, 36]); // the hull, its rim, the prow
  b(0, 1.0, -9.3, 0.6, 0.6, 1.1, [96, 60, 36]);
  b(0, 7, -2.5, 0.28, 5, 0.28, THEME.wood); b(0, 6, 3.5, 0.28, 4, 0.28, THEME.wood); // the masts
  b(0, 7.4, -2.5, 2.4, 2.1, 0.08, THEME.cream); b(0, 6.4, 3.5, 2.0, 1.7, 0.08, THEME.cream); b(0, 9.2, -2.5, 2.5, 0.16, 0.16, THEME.wood); b(0, 8.0, 3.5, 2.1, 0.16, 0.16, THEME.wood); // the sails and their yards
  b(0.7, 12.2, -2.5, 0.8, 0.5, 0.05, [30, 30, 34]); b(0.7, 12.2, -2.45, 0.2, 0.2, 0.06, THEME.white); // the black flag with its skull's eye
  b(0, 4.1, 6.3, 2.5, 1.2, 1.9, THEME.wood); b(0, 5.6, 6.3, 2.8, 0.3, 2.2, THEME.coral); b(0, 4.3, 4.35, 1.5, 0.55, 0.05, THEME.glass); // the stern cabin
  b(0, 2.4, -11.3, 0.18, 0.18, 2, THEME.wood); // the bowsprit
}

/** A volcano: a steep cone of dark rock layers with a glowing crater, and two rivers of lava running down it. */
export function volcano(k, x, z, s = 1) {
  const n = 7, rs = [], cols = [[58, 48, 46], [66, 52, 48], [76, 54, 48], [88, 56, 48], [102, 58, 46], [118, 60, 44], [136, 62, 40]];
  for (let i = 0; i < n; i++) {
    const r = (6.6 - i * 0.78) * s, y = (0.65 + i * 1.3) * s; rs.push({ r, y });
    k.box(x, y, z, r * 1.08, 0.68 * s, r * 1.08, cols[i], i % 2 ? Math.PI / 4 : Math.PI / 8);
  }
  const top = rs[n - 1].y + 0.7 * s;
  k.box(x, top + 0.05 * s, z, 1.7 * s, 0.12 * s, 1.7 * s, THEME.lava, Math.PI / 4); k.box(x, top + 0.2 * s, z, 1.0 * s, 0.12 * s, 1.0 * s, [255, 214, 80], Math.PI / 4); // the crater, glowing
  for (const [dx, dz] of [[1, 0], [-0.5, 0.87]]) for (let i = 0; i < n - 1; i++) { const q = rs[i].r * 1.1; k.box(x + dx * q, rs[i].y + 0.05 * s, z + dz * q, 0.5 * s, 0.74 * s, 0.5 * s, i % 2 ? [255, 160, 40] : THEME.lava); } // the lava, in two streams
  k.box(x + 0.9 * s, top + 0.9 * s, z, 0.5 * s, 0.7 * s, 0.5 * s, [255, 170, 50], 0.5); // a spurt of lava over the rim
}

/** A tiki torch: a carved post, a bowl and a flame (orange: it does not light anything, the lamp posts do that). */
export function tiki(k, x, z, s = 1) {
  k.box(x, 1.3 * s, z, 0.14 * s, 1.3 * s, 0.14 * s, THEME.dark); k.box(x, 2.75 * s, z, 0.3 * s, 0.25 * s, 0.3 * s, THEME.lava); k.box(x, 1.6 * s, z, 0.2 * s, 0.1 * s, 0.2 * s, THEME.teal); // (three boxes: the post, the flame, a painted band)
}

/** A treasure chest with its lid open, and gold spilling out. */
export function treasure(k, x, z, s = 1) {
  k.box(x, 0.45 * s, z, 0.9 * s, 0.45 * s, 0.6 * s, [130, 82, 46]); k.box(x, 0.95 * s, z - 0.5 * s, 0.92 * s, 0.1 * s, 0.1 * s, THEME.gold); k.box(x, 1.2 * s, z - 0.7 * s, 0.9 * s, 0.35 * s, 0.07 * s, [110, 70, 40]);
  k.box(x, 0.95 * s, z, 0.78 * s, 0.1 * s, 0.5 * s, THEME.gold); for (let i = 0; i < 5; i++) k.box(x - 1.2 * s + i * 0.6 * s, 0.1 * s, z + (1 + (i % 2) * 0.3) * s, 0.22 * s, 0.1 * s, 0.22 * s, THEME.gold);
}

/** A flower bed: a patch of green with `n` blooms in six colours at different heights (the nature kit's flower model renders nearly black, so the blooms are boxes). */
export function flowerBed(k, x, z, r = 2.5, n = 6) {
  const cols = [[232, 60, 80], [250, 210, 60], [170, 90, 220], [255, 140, 60], [250, 250, 250], [240, 110, 170]];
  k.box(x, 0.15, z, r, 0.15, r, [52, 140, 70], Math.PI / 4); // (few boxes: each is twelve triangles in the chunk's merged mesh, and a chunk is held to a few thousand)
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + k.rnd(), d = r * (0.2 + k.rnd() * 0.55); k.box(x + Math.cos(a) * d, 0.7, z + Math.sin(a) * d, 0.36, 0.4, 0.36, cols[i % cols.length], k.rnd()); }
}

/** The arch's posts as painted stripes (red and white), the lintel and bunting strung across the way. `span` is the half-width between the posts, `h` the height of the lintel. */
export function archStripes(k, x, z, span, h) {
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) k.box(x, (h / 6) * (i + 0.5), z + s * span, 0.62, h / 12, 0.62, i % 2 ? THEME.white : THEME.red);
  bunting(k, x, z - span, x, z + span, h - 0.3, 14);
}
