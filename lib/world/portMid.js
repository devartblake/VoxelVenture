// The mid tier of the ports' models (docs/world/ports_models.md): what a phone draws in place of the boxes. Automatic simplification only takes the Kenney containers from 402 to about 308 triangles (the colour map's seams
// are borders the simplifier will not collapse), so the numerous heavy models have small made models of their own here (a container is 72 triangles: a body, a darker door end and corner posts; a tank is a
// 16-sided cylinder with a rim); the others (boats, buoy, ramp, palm) use the simplified copy of the Kenney model (scripts/world/make-lods.mjs). Pure: arrays in the models' own units (the same sizes and origins as the
// Kenney models: the middle of the base, the long axis along Z), with vertex colours.
export const MID_MADE = ['ctr-a', 'ctr-b', 'ctr-c', 'tank']; // the made models; every other port model has a simplified Kenney copy
export const MID_COLORS = { 'ctr-a': [196, 74, 58], 'ctr-b': [58, 112, 178], 'ctr-c': [70, 144, 96], tank: [186, 190, 198] };

const build = () => {
  const positions = [], normals = [], colors = [], indices = [];
  const quad = (a, b, c, d, n, col) => { const base = positions.length / 3; for (const p of [a, b, c, d]) { positions.push(...p); normals.push(...n); colors.push(...col); } indices.push(base, base + 1, base + 2, base, base + 2, base + 3); };
  const box = (cx, cy, cz, hx, hy, hz, col, shade = 1) => { // an axis-aligned box: six faces, each a quad wound out of the box
    const c = (k) => col.map((v) => Math.min(255, Math.round(v * k * shade)));
    const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], c(0.9));
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], c(0.9));
    quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], c(1.12));
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], c(0.55));
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c(0.78));
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], c(0.78));
  };
  return { positions, normals, colors, indices, box };
};

/** A container (0.37 wide, 0.35 high, 0.82 long: the Kenney container's size after its own scale): the body in the kit colour, a darker door end and four corner posts. 72 triangles. */
export function midContainer(color) {
  const b = build(), W = 0.185, H = 0.35, L = 0.41;
  b.box(0, H / 2, 0, W - 0.004, H / 2, L - 0.012, color); // the body
  b.box(0, H / 2, L - 0.008, W - 0.02, H / 2 - 0.02, 0.004, color, 0.45); // the door end, darker, a hair proud of the body
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (W - 0.006), H / 2, sz * (L - 0.006), 0.006, H / 2, 0.006, color, 0.6); // the corner posts
  return { positions: Float32Array.from(b.positions), normals: Float32Array.from(b.normals), colors: Float32Array.from(b.colors.map((v) => v / 255)), indices: Uint16Array.from(b.indices) };
}

/** A tank (1.5 across, 0.96 high, the Kenney tank's size): a 16-sided cylinder, a flat roof with a rim, in the tank colour. About 64 triangles. */
export function midTank(color, sides = 16) {
  const positions = [], normals = [], colors = [], indices = [], R = 0.75, H = 0.96;
  const col = (k) => color.map((v) => Math.min(255, Math.round(v * k)) / 255);
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
    positions.push(x * R, 0, z * R, x * R, H * 0.94, z * R); normals.push(x, 0, z, x, 0, z); colors.push(...col(0.8 + 0.2 * Math.abs(x)), ...col(0.8 + 0.2 * Math.abs(x)));
    if (i < sides) { const k = i * 2; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  // the roof: a fan, and a rim ring
  const c = positions.length / 3;
  positions.push(0, H, 0); normals.push(0, 1, 0); colors.push(...col(1.1));
  for (let i = 0; i <= sides; i++) { const a = (i / sides) * Math.PI * 2; positions.push(Math.cos(a) * R * 0.98, H * 0.94, Math.sin(a) * R * 0.98); normals.push(0, 1, 0); colors.push(...col(1.05)); }
  for (let i = 0; i < sides; i++) indices.push(c, c + 2 + i, c + 1 + i);
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), colors: Float32Array.from(colors), indices: Uint16Array.from(indices) };
}

/** The made model for a port model name: { positions, normals, colors (0 to 1), indices }. */
export const midModel = (name) => (name === 'tank' ? midTank(MID_COLORS.tank) : midContainer(MID_COLORS[name]));
export const triangles = (m) => m.indices.length / 3;
