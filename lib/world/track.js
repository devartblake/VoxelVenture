// A racing circuit on the map (docs/world/racing_track.md): the SHAPE of a real circuit from OpenStreetMap (lib/world/data/raceways.js: Dover Raceway, Jamwest Speedway, Palisadoes), turned and scaled to fit
// the site, smoothed, and built into a real-looking track: asphalt with white edge lines, red and white kerbs on the bends, gravel run-off on the outside of them, a chequered start line and a painted
// grid, with the Kenney Racing Kit's barriers, grandstands, pits, tents and start gantry round it. Pure and deterministic.
//
//   generateTrack({ shape, seed, origin: { x, z }, fit: [width, depth] })  ->  { centreline, length, width, start, checkpoints, surface, props, bounds, ... }
//
// `surface` is a list of painted quads, [palette, x0, z0, x1, z1, x2, z2, x3, z3] counter-clockwise from above; the bake puts each in a chunk and chunkMesh.js turns them into one mesh. `props` are placements
// of Racing Kit models: { model, x, z, yaw, s } (yaw turns the model's own +z to a heading, as for the bridge decks).
import { RACEWAYS } from './data/raceways';

export const TRACK = { width: 10, fit: [210, 135], spacing: 2.5 };
export const TRACK_MODELS = ['roadStart', 'barrierRed', 'barrierWhite', 'grandStand', 'grandStandAwning', 'tent', 'pitsOffice', 'lightPostModern', 'treeLarge', 'treeSmall', 'raceCarRed', 'raceCarGreen', 'raceCarOrange', 'raceCarWhite', 'lightPostLarge'];
export const CAR_MODELS = ['raceCarRed', 'raceCarGreen', 'raceCarOrange', 'raceCarWhite'];
// stadium lights: tall masts (the kit's lightPostLarge scaled up) round the circuit, each throwing a wide pool of light; placed so that every point of the road is within FLOOD.reach of one
export const FLOOD = { reach: 52, pool: 56, scale: 22, setback: 21, towards: 12 };
export const CAR_FACING = 0; // the turn that points a race car's own front along the lap (the car's front is its +z: checked by eye on /world/stream)
export const CAR_SCALE = 3.1; // a race car is 1.35 long in the kit: about 4.2 units here, the size of the city cars
// where each model's own origin is, as a share of its size: the middle of the cell for the cell-sized pieces, the base centre for a post or a tree
// Where each model's anchor is, in the kit's own coordinates: the point put at the place a prop is given. The anchors were measured on the models as modelled, and every model of the Racing Kit sits in its glb
// at a node offset of (-0.35, -0.65) (x, z) from that, which the game's loader keeps; ANCHOR is the measured point moved by that offset, and tests/track-anchors.test.mjs checks that each lies on the model as drawn.
export const NODE_OFFSET = [-0.35, -0.65];
const MEASURED = { roadStart: [0.5, -1], grandStand: [0.5, -0.5], grandStandAwning: [0.5, -0.5], tent: [0.5, -0.5], pitsOffice: [0.5, -0.5], barrierRed: [0.125, -0.06], barrierWhite: [0.125, -0.06], lightPostModern: [0, 0], lightPostLarge: [0, 0], treeLarge: [0, 0], treeSmall: [0, 0], raceCarRed: [0.305, -0.675], raceCarGreen: [0.305, -0.675], raceCarOrange: [0.305, -0.675], raceCarWhite: [0.305, -0.675] };
export const ANCHOR = Object.fromEntries(Object.entries(MEASURED).map(([k, [x, z]]) => [k, [Math.round((x + NODE_OFFSET[0]) * 1000) / 1000, Math.round((z + NODE_OFFSET[1]) * 1000) / 1000]]));

// the paint: the palette of the surface quads (colour and height above the ground; the layers are 0.03 apart and the material is pulled toward the camera, so they do not flicker)
import { LIFT } from './datum';
export const PALETTE = [
  { name: 'asphalt', color: [74, 77, 84], y: LIFT.paint.asphalt },
  { name: 'asphalt-worn', color: [82, 85, 92], y: LIFT.paint.asphalt },
  { name: 'line', color: [236, 238, 240], y: LIFT.paint.mark },
  { name: 'kerb-red', color: [196, 40, 44], y: LIFT.paint.mark },
  { name: 'kerb-white', color: [238, 238, 238], y: LIFT.paint.mark },
  { name: 'gravel', color: [196, 176, 128], y: LIFT.paint.gravel },
  { name: 'black', color: [28, 28, 30], y: LIFT.paint.top },
  { name: 'white', color: [246, 246, 246], y: LIFT.paint.top },
  { name: 'grid', color: [226, 228, 230], y: LIFT.paint.mark },
  // the mini-golf course's felt (lib/world/minigolf.js), appended: the circuit's palette indices stay where they were
  { name: 'felt', color: [28, 168, 104], y: LIFT.paint.asphalt },
  { name: 'felt-light', color: [52, 196, 126], y: LIFT.paint.asphalt },
  { name: 'mat', color: [198, 62, 52], y: LIFT.paint.mark },
  // the mini-golf park's paths and pond (lib/world/golfPark.js)
  { name: 'path', color: [196, 142, 88], y: LIFT.paint.mark }, // (the boardwalk's boards: warm wood, over its darker edge)
  { name: 'pond', color: [44, 168, 206], y: LIFT.paint.asphalt }, // (over the sand of its beach)
  // the park's makeover (lib/world/golfTheme.js), appended
  { name: 'plank', color: [124, 82, 50], y: LIFT.paint.asphalt },
  { name: 'sand', color: [240, 216, 150], y: LIFT.paint.gravel },
];
const P = Object.fromEntries(PALETTE.map((p, i) => [p.name, i]));

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const r2 = (n) => Math.round(n * 100) / 100;
const r1 = (n) => Math.round(n * 10) / 10;

/** A closed polyline smoothed by corner-cutting (Chaikin), so the OpenStreetMap polygon's corners become curves. */
function chaikin(pts, rounds) {
  let p = pts;
  for (let r = 0; r < rounds; r++) {
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    p = out;
  }
  return p;
}

/** A closed polyline resampled at an even spacing. */
function resample(pts, spacing) {
  const n = pts.length;
  const total = pts.reduce((s, p, i) => s + Math.hypot(pts[(i + 1) % n].x - p.x, pts[(i + 1) % n].z - p.z), 0);
  const count = Math.max(8, Math.round(total / spacing));
  const step = total / count;
  const out = [];
  let carry = 0;
  let i = 0;
  let a = pts[0], b = pts[1 % n];
  let seg = Math.hypot(b.x - a.x, b.z - a.z);
  for (let k = 0; k < count; k++) {
    const target = k * step;
    while (carry + seg < target - 1e-9 && i < n * 2) { carry += seg; i++; a = pts[i % n]; b = pts[(i + 1) % n]; seg = Math.hypot(b.x - a.x, b.z - a.z); }
    const t = seg ? (target - carry) / seg : 0;
    out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  }
  return out;
}

const signedArea = (pts) => pts.reduce((s, p, i) => s + (p.x * pts[(i + 1) % pts.length].z - pts[(i + 1) % pts.length].x * p.z), 0) / 2;

/** The outline of a real circuit as a smooth, evenly spaced, closed centreline in metres, centred on its middle (x east, z south). */
export function outlineOf(shape) {
  const r = RACEWAYS[shape];
  if (!r) throw new Error(`there is no raceway called ${shape}`);
  const ring = r.points.slice(0, -1); // (the ring repeats its first point)
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length, lon0 = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const flat = ring.map(([lon, lat]) => ({ x: (lon - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180), z: -(lat - lat0) * 110574 }));
  return resample(chaikin(flat, 2), TRACK.spacing);
}

/**
 * Turns the outline (`pts`, in metres) so it fits `fit` [width, depth] at the largest scale, trying every 5 degrees; returns { points, scale, angle } centred on the origin. Real circuits are long and
 * thin, so the best turn is the one that lays the long axis along the longer side of the site.
 */
function fitTo(pts, fit) {
  let best = null;
  for (let deg = 0; deg < 180; deg += 5) {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const q = pts.map((p) => ({ x: p.x * c - p.z * s, z: p.x * s + p.z * c }));
    const x0 = Math.min(...q.map((p) => p.x)), x1 = Math.max(...q.map((p) => p.x)), z0 = Math.min(...q.map((p) => p.z)), z1 = Math.max(...q.map((p) => p.z));
    const scale = Math.min(fit[0] / (x1 - x0), fit[1] / (z1 - z0));
    if (!best || scale > best.scale) best = { scale, angle: a, points: q.map((p) => ({ x: (p.x - (x0 + x1) / 2) * scale, z: (p.z - (z0 + z1) / 2) * scale })) };
  }
  return best;
}

/**
 * Pushes apart the parts of the circuit that pass closer than `gap` to each other (a real circuit is drawn to its own scale, and shrunk to fit a site its parallel stretches come too close for a
 * road of this width): each point nearer than `gap` to a point that is not near it along the lap is moved away, then the line is smoothed so it stays a flowing curve, and this is repeated until
 * nothing is too close. The shape is kept; only the squeezed places open out a little.
 */
function relax(pts, gap) {
  let p = pts.map((q) => ({ ...q }));
  const n = p.length;
  const near = 40; // points this close along the lap are the same stretch of road
  for (let round = 0; round < 80; round++) {
    const move = p.map(() => ({ x: 0, z: 0 }));
    let worst = Infinity;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const lapGap = Math.min(j - i, n - (j - i));
      if (lapGap < near) continue;
      const dx = p[j].x - p[i].x, dz = p[j].z - p[i].z, d = Math.hypot(dx, dz);
      if (d >= gap) continue;
      worst = Math.min(worst, d);
      const push = (gap - d) / 2 + 0.05, ux = dx / (d || 1), uz = dz / (d || 1);
      move[i].x -= ux * push; move[i].z -= uz * push; move[j].x += ux * push; move[j].z += uz * push;
    }
    if (worst === Infinity) break;
    p = p.map((q, i) => ({ x: q.x + move[i].x * 0.5, z: q.z + move[i].z * 0.5 }));
    // smooth: each point toward the middle of its neighbours, so the pushed stretch stays a curve
    for (let pass = 0; pass < 2; pass++) p = p.map((q, i) => { const a = p[(i + n - 1) % n], b = p[(i + 1) % n]; return { x: q.x * 0.5 + (a.x + b.x) * 0.25, z: q.z * 0.5 + (a.z + b.z) * 0.25 }; });
  }
  return p;
}

export function generateTrack({ shape = 'dover-raceway', seed = 1, origin = { x: 0, z: 0 }, fit = TRACK.fit, width = TRACK.width } = {}) {
  const rand = mulberry32(seed);
  const raw = outlineOf(shape);
  const fitted = fitTo(raw, fit);
  let pts = fitted.points.map((p) => ({ x: p.x + origin.x, z: p.z + origin.z }));
  if (signedArea(pts) < 0) pts = pts.reverse(); // one direction of travel for every circuit: clockwise on the map
  pts = resample(pts, TRACK.spacing);
  pts = resample(relax(pts, width + 6), TRACK.spacing); // (pushed apart where it was too close, then spaced evenly again)
  const n = pts.length;
  const half = width / 2;
  const at = (i) => pts[((i % n) + n) % n];

  // heading, left normal and curvature at every point
  const tangent = pts.map((_, i) => { const a = at(i - 2), b = at(i + 2); const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: (b.x - a.x) / l, z: (b.z - a.z) / l }; });
  const normal = tangent.map((t) => ({ x: t.z, z: -t.x })); // to the left of travel on a map with z south
  const curvature = pts.map((_, i) => { const a = tangent[(i + n - 3) % n], b = tangent[(i + 3) % n]; return (a.x * b.z - a.z * b.x) / (6 * TRACK.spacing); }); // signed: positive turns right on the map
  const bendy = curvature.map((k) => Math.abs(k) > 0.011);
  // the sharpest turning at each point, over a short baseline (the longer one above smooths a hairpin away): how tight the offset lines may be drawn
  const tight = pts.map((_, i) => { let k = 0; for (const w of [1, 2, 3]) { const a = tangent[(i + n - w) % n], b = tangent[(i + w) % n]; k = Math.max(k, Math.abs(a.x * b.z - a.z * b.x) / (2 * w * TRACK.spacing)); } return k; });

  // the start: the straightest stretch of the lap (the least turning over 24 points, 60 units: a circuit shrunk to a site has no long straight to speak of) that also has room on both sides for the
  // grandstands and the pits. A building must be clear of the WHOLE circuit, which doubles back close to itself, so a stretch with another part of the road beside it is passed over.
  const room = half + 1.3 + 6.5 + 8; // the road, its kerb and run-off, the barrier and a building's depth
  const distToTrack = (x, z) => { let d = Infinity; for (let j = 0; j < n; j++) d = Math.min(d, Math.hypot(pts[j].x - x, pts[j].z - z)); return d; };
  const spotAt = (i, side, off) => ({ x: pts[i].x + normal[i].x * (half + 1.3 + 6.5 + off) * side, z: pts[i].z + normal[i].z * (half + 1.3 + 6.5 + off) * side });
  let startIdx = 0;
  let least = Infinity;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -12; k <= 12; k++) sum += Math.abs(curvature[(i + k + n) % n]);
    let blocked = 0;
    for (const j of [-10, 0, 10]) for (const side of [-1, 1]) { const q = spotAt((i + j + n) % n, side, 11); if (distToTrack(q.x, q.z) < room) blocked++; }
    const score = sum + blocked * 0.12;
    if (score < least) { least = score; startIdx = i; }
  }
  const start = { x: r2(pts[startIdx].x), z: r2(pts[startIdx].z), heading: Math.atan2(tangent[startIdx].x, tangent[startIdx].z), index: startIdx };

  // ---- the surface: quads along the circuit, the gravel first and the paint last, so the paint lies over the road
  const surface = [];
  const quad = (palette, i, lo, hi, thickness = 1) => { // between points i and i + thickness, from lateral offset lo to hi (left positive)
    const ia = ((i % n) + n) % n, ib = (((i + thickness) % n) + n) % n;
    const a = pts[ia], b = pts[ib], na = normal[ia], nb = normal[ib];
    // on the inside of a tight bend the offset line would cross the centre of the curve and the quad would fold over: the offset is kept to 0.9 of the radius there
    const k = (curvature[ia] + curvature[ib]) / 2; // the side the bend turns to is the inside
    const sharp = Math.max(tight[ia], tight[ib]);
    const cap = (v) => { const room = sharp > 1e-6 ? 0.55 / sharp : Infinity; return (k > 0 && v < 0) || (k < 0 && v > 0) ? Math.sign(v) * Math.min(Math.abs(v), room) : v; };
    lo = cap(lo); hi = cap(hi);
    if (Math.abs(hi - lo) < 0.05) return;
    surface.push([palette, r1(a.x + na.x * lo), r1(a.z + na.z * lo), r1(a.x + na.x * hi), r1(a.z + na.z * hi), r1(b.x + nb.x * hi), r1(b.z + nb.z * hi), r1(b.x + nb.x * lo), r1(b.z + nb.z * lo)]);
  };
  const kerbW = 1.3, runoff = 6.5;
  for (let i = 0; i < n; i++) {
    const k = curvature[i];
    const worn = ((i * 7) % 5) === 0 ? P['asphalt-worn'] : P.asphalt;
    // gravel on the outside of a bend, asphalt across, white lines on both edges, kerbs on both edges of a bend (red and white in turn every 3 points)
    if (bendy[i]) {
      if (k > 0) quad(P.gravel, i, half + kerbW, half + kerbW + runoff); else quad(P.gravel, i, -(half + kerbW + runoff), -(half + kerbW));
    }
    quad(worn, i, -half, half);
    quad(P.line, i, half - 0.55, half - 0.2);
    quad(P.line, i, -(half - 0.2), -(half - 0.55));
    if (bendy[i]) {
      const c = Math.floor(i / 3) % 2 ? P['kerb-red'] : P['kerb-white'];
      quad(c, i, half, half + kerbW);
      quad(c, i, -(half + kerbW), -half);
    }
  }
  // the start line (a chequered strip across the road, two points long) and the grid: painted boxes in rows behind it
  for (let q = 0; q < 8; q++) for (const row of [0, 1]) quad((q + row) % 2 ? P.white : P.black, startIdx + row, -half + (q * width) / 8, -half + ((q + 1) * width) / 8);
  for (let slot = 0; slot < 8; slot++) {
    const side = slot % 2 ? 1 : -1;
    quad(P.grid, startIdx - 4 - slot * 3, side * 1.2 - 0.9, side * 1.2 + 0.9, 2);
  }

  // ---- the props
  const props = [];
  const push = (model, x, z, yaw, s) => props.push({ model, x: r2(x), z: r2(z), yaw: Math.round(yaw * 1e4) / 1e4, s: r2(s) });
  const heading = (i) => Math.atan2(tangent[i].x, tangent[i].z);
  push('roadStart', start.x, start.z, start.heading, width / 1.26); // the gantry spans the road
  // the grid: six race cars in the first six boxes behind the start line, in the four colours, pointing along the lap
  for (let slot = 0; slot < 6; slot++) {
    const i = (((startIdx - 4 - slot * 3) % n) + n) % n, side = slot % 2 ? 1 : -1;
    const c = pts[(i + 1) % n];
    push(CAR_MODELS[slot % CAR_MODELS.length], c.x + normal[i].x * side * 1.2, c.z + normal[i].z * side * 1.2, heading(i) + CAR_FACING, CAR_SCALE);
  }
  // barriers on both sides all the way round, in red and white, beyond the run-off (each is 2 units long at scale 8)
  const barrierOff = half + kerbW + runoff + 1.2;
  const clearOfTrack = (x, z) => { for (let j = 0; j < n; j++) if (Math.hypot(pts[j].x - x, pts[j].z - z) < half + kerbW + 1.5) return false; return true; }; // (a barrier never lies across the road: not on the inside of a tight bend, not across another part of the circuit that passes close by)
  for (let i = 0; i < n; i++) for (const side of [-1, 1]) {
    const p = pts[i], nm = normal[i];
    if (!clearOfTrack(p.x + nm.x * barrierOff * side, p.z + nm.z * barrierOff * side)) continue;
    push((i + (side > 0 ? 1 : 0)) % 2 ? 'barrierWhite' : 'barrierRed', p.x + nm.x * barrierOff * side, p.z + nm.z * barrierOff * side, heading(i) + Math.PI / 2, 8);
  }
  // along the main straight: a few grandstands on the right of the track, pits and tents on the left, lights on both sides. Every building is kept clear of the WHOLE circuit (not only the stretch it stands
  // beside): the track doubles back near the start, so a building that fits beside the straight can sit on another part of the road.
  const along = [-10, 0, 10].map((j) => (startIdx + j + n) % n); // three places 25 units apart, round the start line
  let stands = 0, pitsBuilt = 0;
  along.forEach((i, k) => {
    const p = pts[i], nm = normal[i];
    const towardLeft = Math.atan2(nm.x, nm.z); // the heading that points to the left of travel
    // each side's room: the stand (11 from the run-off) and the pits (10) go on the side with more space, and the other side gets the other kind if it has any
    const spot = (side, off) => ({ x: p.x + nm.x * (half + kerbW + runoff + off) * side, z: p.z + nm.z * (half + kerbW + runoff + off) * side });
    const sides = [-1, 1].map((side) => ({ side, free: distToTrack(spot(side, 11).x, spot(side, 11).z) })).sort((u, v) => v.free - u.free);
    const standSide = sides[0], pitSide = sides[1];
    if (stands < 3 && standSide.free >= room) { const q = spot(standSide.side, 11); push(k === 1 ? 'grandStandAwning' : 'grandStand', q.x, q.z, towardLeft + (standSide.side > 0 ? Math.PI : 0), 6); stands++; } // a stand, facing the track
    if (pitsBuilt < 3 && pitSide.free >= room) { const q = spot(pitSide.side, 10); push(k === 1 ? 'tent' : 'pitsOffice', q.x, q.z, towardLeft + (pitSide.side > 0 ? Math.PI : 0), 6); pitsBuilt++; } // pits, facing the track
    if (k !== 1) for (const side of [-1, 1]) push('lightPostModern', p.x + nm.x * (half + 3.2) * side, p.z + nm.z * (half + 3.2) * side, Math.atan2(-nm.x * side, -nm.z * side), 5); // the arm reaches over the road
  });
  // stadium lights: masts outside the barriers, chosen one at a time to light the most of the road not yet lit, until every point of the road is within FLOOD.reach of a mast. Each stands FLOOD.setback
  // from the road (beyond the barrier), clear of the other buildings, and its head turns to the road.
  const floods = [];
  {
    const lit = new Array(n).fill(false);
    const clearOf = (x, z) => distToTrack(x, z) >= FLOOD.setback - 2 && props.every((p) => Math.hypot(p.x - x, p.z - z) >= (p.model === 'treeLarge' || p.model === 'treeSmall' || p.model.startsWith('barrier') ? 0 : 9));
    const candidates = [];
    for (let i = 0; i < n; i += 5) for (const side of [-1, 1]) { const q = { x: pts[i].x + normal[i].x * FLOOD.setback * side, z: pts[i].z + normal[i].z * FLOOD.setback * side, i, side }; if (clearOf(q.x, q.z)) candidates.push(q); }
    for (let round = 0; round < 30 && lit.some((v) => !v); round++) {
      let best = null, gain = 0;
      for (const c of candidates) {
        if (floods.some((f) => Math.hypot(f.x - c.x, f.z - c.z) < 30)) continue; // not two masts side by side
        let g = 0;
        for (let j = 0; j < n; j++) if (!lit[j] && Math.hypot(pts[j].x - c.x, pts[j].z - c.z) <= FLOOD.reach) g++;
        if (g > gain) { gain = g; best = c; }
      }
      if (!best) break;
      floods.push(best);
      for (let j = 0; j < n; j++) if (Math.hypot(pts[j].x - best.x, pts[j].z - best.z) <= FLOOD.reach) lit[j] = true;
    }
    for (const f of floods) push('lightPostLarge', f.x, f.z, Math.atan2(-normal[f.i].x * f.side, -normal[f.i].z * f.side), FLOOD.scale);
  }
  // trees in the open ground beyond the barriers, never nearer than 20 to the circuit
  const near = (x, z) => { for (let i = 0; i < n; i += 4) if (Math.hypot(pts[i].x - x, pts[i].z - z) < half + 20) return true; return false; };
  const x0 = Math.min(...pts.map((p) => p.x)) - 30, x1 = Math.max(...pts.map((p) => p.x)) + 30, z0 = Math.min(...pts.map((p) => p.z)) - 30, z1 = Math.max(...pts.map((p) => p.z)) + 30;
  for (let t = 0; t < 400; t++) {
    const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
    if (near(x, z)) continue;
    push(rand() < 0.3 ? 'treeLarge' : 'treeSmall', x, z, rand() * Math.PI * 2, 3.6);
  }

  const centreline = pts.map((p) => ({ x: r2(p.x), z: r2(p.z) }));
  const length = r2(pts.reduce((s, p, i) => s + Math.hypot(at(i + 1).x - p.x, at(i + 1).z - p.z), 0));
  const checkpoints = [1, 2, 3, 4, 5, 6, 7].map((q) => { const i = (startIdx + Math.floor((q * n) / 8)) % n; return { x: r2(pts[i].x), z: r2(pts[i].z), index: i }; });
  const r = RACEWAYS[shape];
  return {
    shape, shapeName: r.name, osmWay: r.osmWay, seed, width, origin, scale: r2(fitted.scale), angle: r2(fitted.angle),
    centreline, length, start, checkpoints, surface, props,
    bounds: { x0: r2(x0 - 10), x1: r2(x1 + 10), z0: r2(z0 - 10), z1: r2(z1 + 10) },
    bends: bendy.filter(Boolean).length,
  };
}

/**
 * The recipe's tracks, built on a landmass and checked. A track spec is { id, name, landmass, shape, site: { x, z } (its middle), seed, fit }. It must be on flat land, at least 40 units from the coast and
 * 40 from the first town's land, and 24 units clear of every highway: a recipe that puts it anywhere else is an error, not a track in the sea. `world` has the landmasses (with features and the town
 * land) and the highways already built.
 */
export function buildTracks(world, specs = world.recipe.tracks ?? [], { pointInPolygon, distToSegment, elevationAt }) {
  return specs.map((spec) => {
    const m = world.landmasses.find((l) => l.id === spec.landmass);
    if (!m) throw new Error(`track ${spec.id} is on a landmass (${spec.landmass}) that is not in the recipe`);
    const track = generateTrack({ shape: spec.shape, seed: spec.seed, origin: spec.site, fit: spec.fit });
    const b = track.bounds;
    const coast = m.outline.points;
    const roads = [];
    for (const h of world.highways ?? []) {
      for (let i = 0; i < h.ring.length; i++) roads.push([h.ring[i], h.ring[(i + 1) % h.ring.length]]);
      for (const s of h.spurs) { const way = s.via ? [s.from, s.via, s.to] : [s.from, s.to]; for (let k = 0; k + 1 < way.length; k++) roads.push([way[k], way[k + 1]]); }
    }
    const ranges = m.features.ranges ?? [];
    const problems = [];
    for (let x = b.x0; x <= b.x1; x += 16) for (let z = b.z0; z <= b.z1; z += 16) {
      if (!pointInPolygon(x, z, coast)) { problems.push(`(${Math.round(x)}, ${Math.round(z)}) is not on land`); continue; }
      let d = Infinity;
      for (let i = 0; i < coast.length; i++) d = Math.min(d, distToSegment({ x, z }, coast[i], coast[(i + 1) % coast.length]));
      if (d < 40) problems.push(`(${Math.round(x)}, ${Math.round(z)}) is ${Math.round(d)} from the coast`);
      if (elevationAt(ranges, x, z, m.spec.coast.seed) > 0.05) problems.push(`(${Math.round(x)}, ${Math.round(z)}) is not flat`);
    }
    for (const p of track.centreline) {
      let r = Infinity;
      for (const [u, v] of roads) r = Math.min(r, distToSegment(p, u, v));
      if (r < 24) { problems.push(`the circuit passes ${Math.round(r)} from a highway at (${Math.round(p.x)}, ${Math.round(p.z)})`); break; }
    }
    for (const t of world.towns.filter((t) => t.landmass === m.id)) if (b.x1 > t.land.x0 - 40 && b.x0 < t.land.x1 + 40 && b.z1 > t.land.z0 - 40 && b.z0 < t.land.z1 + 40) problems.push(`it touches ${t.name}'s land`);
    if (problems.length) throw new Error(`the track ${spec.id} does not fit where the recipe puts it: ${problems.slice(0, 4).join('; ')}`);
    return { id: spec.id, name: spec.name, landmass: m.id, ...track };
  });
}
