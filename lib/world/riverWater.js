// The water of the rivers (docs/world/river_plan.md, "The river's water"): the sea's plane lies under the whole world and shows through the channels, but its shader shades by the distance to the COAST, so a river
// looked pale and washed out (and the same everywhere along it). This is a ribbon of water laid along each river's course at the sea's level: light and clear over the shallow banks, deeper in the middle, tinted by what
// kind of river it is (a marsh is tea-coloured, a mountain gorge clear and pale), and fading into the sea past its mouth so the two waters blend. Pure (no three.js): positions, colours with alpha, indices.
import { SEA_LEVEL } from './datum';
import { widthAt } from './riverPlan';

export const RIVER_WATER = {
  lift: 0.02, // over the sea's plane (the ribbon is never at the same height: no flicker)
  step: 4, // units between the rows of the ribbon
  rows: 5, // across: edge, shallow, middle, shallow, edge
  fraction: 0.94, // the ribbon's half width, as a share of the river's: the water's edge is just inside the bank
  tail: 14, // it runs on past the mouth, fading out
  palettes: {
    mouth: { edge: [112, 206, 196, 0.5], middle: [30, 118, 168, 0.8] },
    delta: { edge: [126, 168, 130, 0.55], middle: [58, 104, 98, 0.85] }, // a marsh: tea and green
    harbour: { edge: [108, 200, 200, 0.5], middle: [26, 104, 160, 0.82] },
    gorge: { edge: [176, 226, 232, 0.55], middle: [74, 160, 190, 0.78] }, // clear and pale over rock
  },
};

const lerp = (a, b, t) => a + (b - a) * t;

/** The points along a river's course every `step` units, with the distance along it and the share of its length: [{ x, z, s, t, dx, dz }] (dx, dz the unit direction). */
export function sampleCourse(course, step = RIVER_WATER.step) {
  const cum = [0];
  for (let i = 1; i < course.length; i++) cum.push(cum[i - 1] + Math.hypot(course[i].x - course[i - 1].x, course[i].z - course[i - 1].z));
  const total = cum[cum.length - 1];
  const out = [];
  const n = Math.max(2, Math.ceil(total / step));
  let j = 1;
  for (let k = 0; k <= n; k++) {
    const s = (total * k) / n;
    while (j < course.length - 1 && cum[j] < s) j++;
    const a = course[j - 1], b = course[j], u = (s - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1), dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    out.push({ x: lerp(a.x, b.x, u), z: lerp(a.z, b.z, u), s, t: s / total, dx: dx / l, dz: dz / l });
  }
  return out;
}

/** The ribbon of one river (a manifest river: course, length, kind, townT, townWidth): { positions (x y z), colors (r g b a, 0 to 1 for a), indices, vertices }. */
export function riverWaterMesh(river, o = RIVER_WATER) {
  const pts = sampleCourse(river.course, o.step);
  const last = pts[pts.length - 1];
  // past the mouth: a few rows straight on, fading out into the sea
  const tailRows = Math.round(o.tail / o.step);
  for (let k = 1; k <= tailRows; k++) pts.push({ x: last.x + last.dx * k * o.step, z: last.z + last.dz * k * o.step, s: last.s + k * o.step, t: 1, dx: last.dx, dz: last.dz, tail: k / tailRows });
  const pal = o.palettes[river.kind] ?? o.palettes.mouth;
  const positions = [], colors = [], indices = [];
  const y = SEA_LEVEL + o.lift;
  pts.forEach((p) => {
    const half = (widthAt({ length: river.length, kind: river.kind, townT: river.townT, townWidth: river.townWidth }, Math.min(1, p.t)) / 2) * o.fraction;
    const fade = p.tail ? 1 - p.tail : 1;
    for (let c = 0; c < o.rows; c++) {
      const u = (c / (o.rows - 1)) * 2 - 1; // -1 left bank .. 1 right bank
      const depth = 1 - Math.abs(u) * Math.abs(u); // 0 at the banks, 1 in the middle
      positions.push(p.x + -p.dz * half * u, y, p.z + p.dx * half * u);
      for (let k = 0; k < 3; k++) colors.push(lerp(pal.edge[k], pal.middle[k], depth) / 255);
      colors.push(lerp(pal.edge[3], pal.middle[3], depth) * fade);
    }
  });
  for (let r = 0; r + 1 < pts.length; r++) {
    for (let c = 0; c + 1 < o.rows; c++) {
      const a = r * o.rows + c, b = a + 1, d = (r + 1) * o.rows + c, e = d + 1;
      indices.push(a, b, d, b, e, d); // counter-clockwise seen from above (the rows go along the river, the columns from bank to bank)
    }
  }
  return { positions: Float32Array.from(positions), colors: Float32Array.from(colors), indices: Uint32Array.from(indices), vertices: positions.length / 3 };
}
