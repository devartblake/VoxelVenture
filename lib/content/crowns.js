// The rooftop features an owner can put on a building, as a few simple solids. Pure (no three.js), so they are tested in Node and drawn by
// components/city/Crowns.jsx with one instanced mesh per shape (so a hundred crowns cost five draw calls, not five hundred).
//
// A part is { shape, pos: [x, y, z], scale: [x, y, z], color } in the crown's own units, standing on the roof (y = 0) and about one unit tall at most:
//   shape  'cyl' (a cylinder 1 across and 1 high), 'sphere' (1 across), 'box' (1 on each side), 'cone' (1 across and 1 high), 'glow' (a sphere that shines)
//   color  a "#rrggbb", or 'accent' for the colour the owner chose for the roof feature
// `pos` is the middle of the solid.
const GREY = '#cbd5e1';
const PARTS = {
  none: [],
  beacon: [
    { shape: 'cyl', pos: [0, 0.55, 0], scale: [0.07, 1.1, 0.07], color: GREY },
    { shape: 'glow', pos: [0, 1.2, 0], scale: [0.32, 0.32, 0.32], color: 'accent' },
  ],
  dish: [
    { shape: 'cyl', pos: [0, 0.3, 0], scale: [0.08, 0.6, 0.08], color: GREY },
    { shape: 'sphere', pos: [0, 0.68, 0], scale: [0.78, 0.24, 0.78], color: '#e2e8f0' },
    { shape: 'cyl', pos: [0, 0.86, 0], scale: [0.04, 0.3, 0.04], color: 'accent' },
  ],
  garden: [
    { shape: 'box', pos: [0, 0.08, 0], scale: [1.05, 0.16, 0.8], color: '#92400e' },
    { shape: 'sphere', pos: [-0.3, 0.34, 0.05], scale: [0.42, 0.42, 0.42], color: '#16a34a' },
    { shape: 'sphere', pos: [0.26, 0.4, 0.1], scale: [0.5, 0.5, 0.5], color: '#22c55e' },
    { shape: 'sphere', pos: [0.02, 0.32, -0.22], scale: [0.36, 0.36, 0.36], color: '#15803d' },
    { shape: 'glow', pos: [0.3, 0.7, 0.1], scale: [0.12, 0.12, 0.12], color: 'accent' },
  ],
  dome: [
    { shape: 'cyl', pos: [0, 0.1, 0], scale: [0.95, 0.2, 0.95], color: GREY },
    { shape: 'sphere', pos: [0, 0.2, 0], scale: [0.9, 0.85, 0.9], color: 'accent' },
  ],
  spire: [
    { shape: 'cone', pos: [0, 0.85, 0], scale: [0.36, 1.7, 0.36], color: 'accent' },
    { shape: 'glow', pos: [0, 1.76, 0], scale: [0.14, 0.14, 0.14], color: '#f8fafc' },
  ],
};
export const CROWN_SHAPES = ['cyl', 'sphere', 'box', 'cone', 'glow'];
export const crownParts = (crown) => PARTS[crown] ?? [];
// How tall a crown stands above the roof, in its own units (for the preview and the tests).
export const crownHeight = (crown) => Math.max(0, ...crownParts(crown).map((p) => p.pos[1] + p.scale[1] / 2));

// The crowns to draw for a list of plots: [{ x, z, y, yaw, scale, parts: [{ shape, pos, scale, color }] }] with every `accent` already replaced by the
// owner's colour. `roofOf(plot)` gives the height of the roof (the model's height, or the plot's own); a crown stands toward the back of the roof, away from the
// roof banner at the front.
export function crownInstances(plots, roofOf) {
  const out = [];
  for (const plot of plots) {
    const cfg = plot.exterior;
    if (!plot.owner || !cfg || !cfg.crown || cfg.crown === 'none') continue;
    const parts = crownParts(cfg.crown);
    if (!parts.length) continue;
    const bw = plot.w ?? 3;
    const bd = plot.d ?? 3;
    const scale = Math.min(1.3, Math.max(0.45, Math.min(bw, bd) * 0.28));
    const back = -(plot.facing ?? 1) * bd * 0.16; // along the plot's own z, turned by its yaw
    const yaw = plot.yaw ?? 0;
    out.push({
      id: plot.id,
      x: plot.x + Math.sin(yaw) * back,
      z: plot.z + Math.cos(yaw) * back,
      y: 0.1 + roofOf(plot),
      yaw,
      scale,
      parts: parts.map((p) => ({ ...p, color: p.color === 'accent' ? cfg.crownColor ?? '#fbbf24' : p.color })),
    });
  }
  return out;
}
