// The level of detail of the zoomed-out city (docs/architecture/performance_policy.md, "Level of detail"). Pure: the same tier,
// zoom, override and previous level always give the same decision (tests/performance-policy.test.mjs).
//
//   parseLodOverride(search)            ?lod=off|on|auto (auto by default)
//   viewZoom(view)                      how many screen pixels one world unit covers at the view's target: the map camera's zoom,
//                                       or the same figure for a follow camera from its distance, field of view and the viewport
//   decideLod({ tier, zoom, override, previous })   the level in force and what it hides or replaces
//   lodHides(decision, cls)             whether a class of things is hidden at this decision
//   standInBox(box, matrix)             the stand-in of a building: its model's bounding box, as a unit box's matrix
//   averageModelColours(mesh, sample)   the colour of a model's walls and of its roof, for its stand-in
//   visibleInstances(spheres, planes, margin)   which instances of an instanced mesh are in view (off-screen culling)
//
// The levels, from the most detail to the least:
//   full   everything, as before the LOD existed
//   thin   the classes of small things below are hidden (they are a pixel or two wide at this zoom, and cost a draw call each)
//   far    also, every building model is drawn as a stand-in: its bounding box, in the colours of its walls and roof, all of
//          them in two instanced draw calls. The selected building is always drawn in full.
//
// The classes a level hides:
//   subpixel    the traffic-light lamps (0.07 units across: under a pixel below zoom 9)
//   smallProps  the cars parked in the car parks, the pennants and roof lights on the roofs
//   labels      the street-name signs (unreadable when zoomed out; the place names of parks, lakes and airports stay)
//
// Off screen: on the tiers without shadows ("medium" and "low"; and with ?lod=on when the shadows are off) the building models
// and the instanced props (trees, shrubs, parked cars) draw only the instances near the view: the rest cannot be seen, and
// with no shadow to cast they change nothing on screen. (On "high" an off-screen building can cast a shadow into view.)
//
// Nothing here may change what a visitor can do: a plot is selected through its stand-in exactly as through its model, the
// roof banners (logos and names) are drawn at every level, and the card, the call to action, attribution and the no-WebGL
// page do not read the level.

export const LOD_LEVELS = ['full', 'thin', 'far'];
export const LOD_CLASSES = ['subpixel', 'smallProps', 'labels'];
export const LOD_OVERRIDES = ['auto', 'on', 'off'];
const rank = (level) => LOD_LEVELS.indexOf(level);

// Per tier: below which zoom each level starts (null: never), and the classes each level hides.
// "high" keeps today's look: only when zoomed all the way out does it drop the sub-pixel lamps. "medium" and "low" replace
// the models when zoomed out and drop the small props sooner. `?lod=on` uses "on" whatever the tier (to compare with ?lod=off).
export const LOD_RULES = Object.freeze({
  high: Object.freeze({ cull: false, thinBelow: 6.5, farBelow: null, thin: Object.freeze(['subpixel']), far: Object.freeze(['subpixel']) }),
  medium: Object.freeze({ cull: true, thinBelow: 9, farBelow: 7.5, thin: Object.freeze(['subpixel', 'smallProps']), far: Object.freeze(['subpixel', 'smallProps', 'labels']) }),
  low: Object.freeze({ cull: true, thinBelow: 11, farBelow: 9, thin: Object.freeze(['subpixel', 'smallProps', 'labels']), far: Object.freeze(['subpixel', 'smallProps', 'labels']) }),
  on: Object.freeze({ cull: true, thinBelow: 11, farBelow: 9, thin: Object.freeze(['subpixel', 'smallProps', 'labels']), far: Object.freeze(['subpixel', 'smallProps', 'labels']) }),
});
// Hysteresis: a level is entered below its zoom, and left only once the zoom is this much above it, so a camera resting
// near a boundary (or the damping of a zoom gesture) does not switch back and forth.
export const LOD_EXIT_FACTOR = 1.15;

export function parseLodOverride(search = '') {
  let value;
  try {
    value = new URLSearchParams(search).get('lod');
  } catch {
    value = null;
  }
  const v = String(value ?? '').toLowerCase();
  return LOD_OVERRIDES.includes(v) ? v : 'auto';
}

// Pixels per world unit at the view's target. The map (orthographic) camera's zoom is exactly that. A follow (perspective)
// camera at `distance` from its target with a vertical field of view `fov` (degrees) on a viewport `height` CSS pixels tall
// shows 2 * distance * tan(fov / 2) units across that height. First person is always close: Infinity.
export function viewZoom({ iso = true, zoom = 13, distance = 0, fov = 40, height = 900, firstPerson = false } = {}) {
  if (firstPerson) return Infinity;
  if (iso) return zoom > 0 ? zoom : Infinity;
  const span = 2 * distance * Math.tan(((fov > 0 ? fov : 40) * Math.PI) / 360);
  return span > 0 && height > 0 ? height / span : Infinity;
}

// The level for a zoom, with hysteresis from the previous level.
function levelFor(zoom, rule, previous) {
  const below = (threshold, exiting) => threshold != null && zoom < threshold * (exiting ? LOD_EXIT_FACTOR : 1);
  const prev = rank(previous);
  if (below(rule.farBelow, prev >= rank('far'))) return 'far';
  if (below(rule.thinBelow, prev >= rank('thin'))) return 'thin';
  return 'full';
}

// `shadows`: whether the sun casts shadows now (an off-screen building may then shade the view, so nothing is culled).
export function decideLod({ tier = 'high', zoom = Infinity, override = 'auto', previous = 'full', shadows = false } = {}) {
  const rule = override === 'on' ? LOD_RULES.on : LOD_RULES[tier] ?? LOD_RULES.high;
  if (override === 'off') return { level: 'full', buildings: 'full', hidden: [], cull: false, rule: 'off', reason: 'lod=off' };
  const level = levelFor(Number.isFinite(zoom) ? zoom : Infinity, rule, previous);
  return {
    level,
    buildings: level === 'far' ? 'standin' : 'full',
    cull: Boolean(rule.cull) && !shadows,
    hidden: level === 'full' ? [] : [...rule[level]],
    rule: override === 'on' ? 'on' : tier,
    reason: override === 'on' ? 'lod=on' : `tier ${tier}`,
  };
}

export const lodHides = (decision, cls) => Boolean(decision?.hidden?.includes(cls));

// A stand-in is a unit box (centred on the origin) moved onto the model's bounding box, then by the model's own instance
// matrix: matrix * translate(centre) * scale(size). `box` is { min: [x, y, z], max: [x, y, z] }; `matrix` and the result
// are column-major 4x4 arrays (three.js Matrix4.elements).
export function standInBox(box, matrix) {
  const size = [0, 1, 2].map((i) => Math.max(1e-3, box.max[i] - box.min[i]));
  const centre = [0, 1, 2].map((i) => (box.max[i] + box.min[i]) / 2);
  const local = [size[0], 0, 0, 0, 0, size[1], 0, 0, 0, 0, size[2], 0, centre[0], centre[1], centre[2], 1];
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += matrix[k * 4 + r] * local[c * 4 + k];
    out[c * 4 + r] = s;
  }
  return out;
}

// The colour of a model's walls and of its roof: the mean colour of its triangles, weighted by their area, split by whether
// a triangle faces up (its normal's y above 0.7: a roof) or not (a wall). `mesh` is { positions, normals?, uvs?, colors?,
// index? } as flat arrays; `sample(u, v)` returns [r, g, b] (0..1) from the model's colour texture, or the vertex colours
// are used. A model with no upward faces uses its walls' colour for the roof, and the other way round.
export function averageModelColours({ positions, uvs = null, colors = null, index = null }, sample = null) {
  const acc = { wall: [0, 0, 0, 0], roof: [0, 0, 0, 0] };
  const count = index ? index.length : positions.length / 3;
  const vtx = (k) => (index ? index[k] : k);
  const p = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  const colourAt = (i) => {
    if (colors) return [colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]];
    if (uvs && sample) return sample(uvs[i * 2], uvs[i * 2 + 1]);
    return [1, 1, 1];
  };
  for (let t = 0; t + 2 < count; t += 3) {
    const [a, b, c] = [vtx(t), vtx(t + 1), vtx(t + 2)];
    const [pa, pb, pc] = [p(a), p(b), p(c)];
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(n[0], n[1], n[2]);
    if (!(len > 0)) continue;
    const area = len / 2;
    const bucket = n[1] / len > 0.7 ? acc.roof : acc.wall;
    for (const i of [a, b, c]) {
      const col = colourAt(i);
      for (let k = 0; k < 3; k++) bucket[k] += (col[k] * area) / 3;
    }
    bucket[3] += area;
  }
  const mean = (x) => (x[3] > 0 ? [x[0] / x[3], x[1] / x[3], x[2] / x[3]] : null);
  const wall = mean(acc.wall);
  const roof = mean(acc.roof);
  return { wall: wall ?? roof ?? [1, 1, 1], roof: roof ?? wall ?? [1, 1, 1] };
}

// The instances in view, in their order: `spheres` holds each instance's bounding sphere (x, y, z, radius) in the same space as
// the frustum `planes` ([nx, ny, nz, constant], inside where nx*x + ny*y + nz*z + constant >= 0, as three.js Frustum planes).
// `margin` widens the view (world units), so an instance just off the edge is already there when the view moves a little.
export function visibleInstances(spheres, planes, margin = 0) {
  const out = [];
  const n = Math.floor(spheres.length / 4);
  outer: for (let i = 0; i < n; i++) {
    const x = spheres[i * 4];
    const y = spheres[i * 4 + 1];
    const z = spheres[i * 4 + 2];
    const r = spheres[i * 4 + 3] + margin;
    for (const [a, b, c, d] of planes) if (a * x + b * y + c * z + d < -r) continue outer;
    out.push(i);
  }
  return out;
}
