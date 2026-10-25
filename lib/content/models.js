import { MODEL_CATALOG } from './modelCatalog';
import { VOX_BUILDING_CATALOG } from './voxBuildingCatalog';
import { buildingSize } from '../city/cityGenerator';

// Which 3D model stands on a plot. Pure (no three.js), so it is tested in Node.
//
// A plot has a footprint (the building's width and depth) and a height from the generator; a model has its own size. The model is scaled to
// the footprint and then stretched or squashed a little in height to match the plot's height, so everything that depends on that height
// (the roof banner, the planes' flight level, the interior's floors) still lines up. The model is chosen by the kind of building:
//   house (Old Town) -> the suburban kit;  grand / luxury / wide estates -> the wide models;
//   everything else by height: tall (3.4 and up), mid (1.9 and up) or low.
// Among the models of that kind it takes the ones that fit best and picks between them by the plot's number, so a street is varied
// but the same plot always gets the same building.
// Every building model: the Kenney ones (.glb) and the voxel ones (.vox, made in MagicaVoxel style). They are chosen between by the same rules.
export const ALL_MODELS = [...MODEL_CATALOG, ...VOX_BUILDING_CATALOG];

const HEIGHT_RANGE = [0.55, 1.5]; // how far a model's height may be stretched from its own proportions
const WIDE_RATIO = 1.6; // how unevenly a model's width and depth may be scaled to fill a plot

const hash = (n) => (Math.imul((Number(n) || 0) * 2654435761 + 40503, 2246822519) >>> 0) / 4294967296;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Some built plots keep a car park behind the building: the building takes the front part of its plot, on the street, and the rest is the lot.
export const PARKING_SHARE = 0.4; // how much of the building area's depth the lot takes
export function hasParking(plot) {
  if (plot.exterior) return false; // a building its owner designed takes the whole plot (and can be as tall as the shapes allow)
  if (!plot.owner || plot.prime || plot.luxury || plot.grand || plot.buildingType === 'house') return false;
  return (plot.d ?? 3) >= 3 && hash(plot.id + 17) < 0.3;
}

export function modelClass(plot) {
  if (plot.hqModel) return 'hq'; // an admin headquarters has a building of its own
  if (plot.buildingType === 'house') return 'house';
  if (plot.grand || plot.luxury || (plot.w ?? 3) >= 5.5 || (plot.d ?? 3) >= 5.5) return 'wide';
  if (plot.height >= 3.4) return 'tall';
  return plot.height >= 1.9 ? 'mid' : 'low';
}

// How a model would stand on this plot.
function place(model, bw, bd, h, facing, fullBd = bd) {
  const fit = Math.min(bw / model.w, bd / model.d);
  // fill the plot a little more evenly on wide models (but never more than WIDE_RATIO out of proportion)
  let sx = clamp(bw / model.w, fit, fit * WIDE_RATIO);
  let sz = clamp(bd / model.d, fit, fit * WIDE_RATIO);
  sx = Math.min(sx, bw / model.w);
  sz = Math.min(sz, bd / model.d);
  const own = model.h * Math.min(sx, sz);
  const sy = clamp(h / own, HEIGHT_RANGE[0], HEIGHT_RANGE[1]) * Math.min(sx, sz);
  const height = model.h * sy;
  const rotY = facing < 0 ? Math.PI : 0;
  // the model's centre goes to the middle of the plot, its floor to the ground: p' = R * S * (p - c0)
  const c = [-model.cx * sx, -model.y0 * sy, -model.cz * sz];
  const offset = [c[0] * Math.cos(rotY) + c[2] * Math.sin(rotY), c[1], -c[0] * Math.sin(rotY) + c[2] * Math.cos(rotY)];
  // the building's front face stands on the street side of its plot, whatever its depth, so the facades of a street line up
  offset[2] += (facing * (fullBd - model.d * sz)) / 2;
  return { scale: [sx, sy, sz], rotY, offset, height, error: Math.abs(height - h) / h + 0.15 * (1 - (model.w * sx * model.d * sz) / (bw * bd)) };
}

// null for a plot with no building. Otherwise { id, kit, url, scale: [sx, sy, sz], rotY, offset: [x, y, z], height, class }.
export function modelFor(plot, catalog = ALL_MODELS) {
  if (!plot.owner || !(plot.height > 0.2)) return null;
  const { bw, bd: fullBd } = buildingSize(plot);
  // An admin headquarters: its own model, stretched to fill the whole footprint at exactly the plot's height (it was drawn in the proportions of a luxury estate).
  const hqEntry = plot.hqModel ? catalog.find((x) => x.id === plot.hqModel) : null;
  if (hqEntry) {
    const sx = bw / hqEntry.w;
    const sz = fullBd / hqEntry.d;
    const sy = plot.height / hqEntry.h;
    const rotY = (plot.facing ?? 1) < 0 ? Math.PI : 0;
    const c = [-hqEntry.cx * sx, -hqEntry.y0 * sy, -hqEntry.cz * sz];
    const offset = [c[0] * Math.cos(rotY) + c[2] * Math.sin(rotY), c[1], -c[0] * Math.sin(rotY) + c[2] * Math.cos(rotY)];
    return { id: hqEntry.id, kit: hqEntry.kit, url: hqEntry.url, scale: [sx, sy, sz], rotY, offset, height: plot.height, class: 'hq', parking: false };
  }
  const parking = hasParking(plot);
  const bd = parking ? fullBd * (1 - PARKING_SHARE) : fullBd; // with a car park behind, the building takes the front part
  const cls = modelClass(plot);
  // a wide plot (an estate, a double plot) takes the wide models, the low ones, and the tall ones when the building is tall
  const wanted = cls === 'wide' ? ['wide', 'low', ...(plot.height >= 3.4 ? ['tall'] : [])] : [cls];
  const pool = catalog.filter((m) => m.classes.some((c) => wanted.includes(c)));
  if (!pool.length) return null;
  const options = pool.map((m) => ({ m, ...place(m, bw, bd, plot.height, plot.facing ?? 1, fullBd) })).sort((a, b) => a.error - b.error);
  // the models that fit nearly as well as the best are all fine: the plot's number chooses (or the owner did, from the shapes that suit the height)
  const good = options.filter((o) => o.error <= options[0].error + 0.18).slice(0, 4);
  const chosen = plot.exterior?.model ? options.slice(0, EXTERIOR_CHOICES).find((o) => o.m.id === plot.exterior.model) : null;
  const o = chosen ?? good[Math.floor(hash(plot.id) * good.length)];
  return { id: o.m.id, kit: o.m.kit, url: o.m.url, scale: o.scale, rotY: o.rotY, offset: o.offset, height: o.height, class: cls, parking };
}

// The shapes an owner can choose for a building (the best fits for its height, in order): [{ id, name, kit, minFloors, maxFloors }]. A shape can only be made
// so tall or so short for a footprint (HEIGHT_RANGE), so `minFloors` and `maxFloors` say how many floors it can have on this plot; only shapes that can stand at
// the building's height are listed, and the game's own choice is one of them.
export const EXTERIOR_CHOICES = 8;
const FLOOR = 1.2; // the height of a floor (lib/game/exterior.js FLOOR_HEIGHT)
export const modelName = (id) => String(id).split('/').pop().replace(/^building-?/, '').replace(/-/g, ' ').replace(/(^|\s)([a-z])/g, (m, a, c) => a + c.toUpperCase()).trim() || 'Building';

// Every model that can be a business's building (not an Old Town house, not a headquarters), standing on this plot's footprint: its lowest and highest height.
function placed(plot, catalog) {
  const { bw, bd: fullBd } = buildingSize(plot);
  const parking = hasParking({ ...plot, owner: plot.owner ?? 'x' });
  const bd = parking ? fullBd * (1 - PARKING_SHARE) : fullBd;
  return { bw, bd, fullBd, list: catalog.filter((m) => m.classes.length && !m.classes.includes('house')) };
}
export function heightReach(plot, catalog = ALL_MODELS) {
  const { bw, bd, list } = placed(plot, catalog);
  let min = Infinity;
  let max = 0;
  for (const m of list) {
    const own = m.h * Math.min(bw / m.w, bd / m.d);
    min = Math.min(min, own * HEIGHT_RANGE[0]);
    max = Math.max(max, own * HEIGHT_RANGE[1]);
  }
  return { min: Number.isFinite(min) ? min : 0, max };
}
export function modelOptions(plot, catalog = ALL_MODELS) {
  if (!plot || !(plot.height > 0.2)) return [];
  const { bw, bd, fullBd } = placed(plot, catalog);
  const cls = modelClass({ ...plot, owner: plot.owner ?? 'x' });
  const wanted = cls === 'wide' ? ['wide', 'low', ...(plot.height >= 3.4 ? ['tall'] : [])] : [cls];
  const all = catalog
    .filter((m) => m.classes.some((c) => wanted.includes(c)))
    .map((m) => {
      const o = place(m, bw, bd, plot.height, plot.facing ?? 1, fullBd);
      const own = m.h * Math.min(bw / m.w, bd / m.d);
      return { m, ...o, minFloors: Math.max(1, Math.ceil((own * HEIGHT_RANGE[0]) / FLOOR - 1e-9)), maxFloors: Math.floor((own * HEIGHT_RANGE[1]) / FLOOR + 1e-9) };
    })
    .sort((a, b) => a.error - b.error);
  const floors = Math.round(plot.height / FLOOR);
  const fitting = all.filter((o) => floors >= o.minFloors && floors <= o.maxFloors);
  return (fitting.length ? fitting : all)
    .slice(0, EXTERIOR_CHOICES)
    .map((o) => ({ id: o.m.id, name: modelName(o.m.id), kit: o.m.kit, minFloors: o.minFloors, maxFloors: o.maxFloors }));
}

export const modelsOfKit = (kit, catalog = ALL_MODELS) => catalog.filter((m) => m.kit === kit);

// An airport terminal as a row of building models ("wings", each about square, so none is stretched out of shape) filling its footprint.
// Wings placed edge to edge put their end walls (and roof trims) in the same plane, and the depth buffer cannot tell coincident faces
// apart: the seam flickered, dotted, along the facade. So the wings stand WING_GAP apart and a joint (a plain box, a little inside the
// wings' sides and top, reaching JOINT_OVERLAP into each wing) fills each gap: no two faces coincide and there is no hole to see through.
//   terminal: { x, z, w, d };  returns { plots, model, joints: [{ x, z, w, d, y, h }] } (model null when no model fits: draw the box terminal)
// Every wing uses the model the game chose for the first one (the same name always gets the same building), centred in its slot.
export const WING_GAP = 0.12;
export const JOINT_OVERLAP = 0.06;
export const JOINT_INSET = 0.06;
const FLOOR_Y = 0.1; // a model's floor (ModelBuildings.jsx modelMatrix)
export function terminalWings(terminal, { name, height }, catalog = ALL_MODELS) {
  const margin = -buildingSize({ w: 0, d: 0 }).bw / 2; // the gap a plot leaves round its building: the wings have none
  const alongX = terminal.w >= terminal.d;
  const n = Math.max(1, Math.round(Math.max(terminal.w, terminal.d) / Math.min(terminal.w, terminal.d)));
  const ww = alongX ? terminal.w / n : terminal.w;
  const wd = alongX ? terminal.d : terminal.d / n;
  const id = 9000 + [...String(name)].reduce((h, c) => h + c.charCodeAt(0), 0);
  const plots = Array.from({ length: n }, (_, k) => ({
    id: id + k * 100000, // distinct picking ids; the model is the first wing's, so every wing matches
    owner: 'airport',
    height,
    w: ww + 2 * margin,
    d: wd + 2 * margin,
    grand: true,
    facing: 1,
    yaw: 0,
    color: '#ffffff',
    x: terminal.x + (alongX ? (k - (n - 1) / 2) * ww : 0),
    z: terminal.z + (alongX ? 0 : (k - (n - 1) / 2) * wd),
  }));
  const first = modelFor(plots[0], catalog);
  const entry = first && catalog.find((m) => m.id === first.id);
  if (!entry) return { plots, model: null, joints: [] };
  // the wing's length along the row, shrunk (if it needs to be) to leave the gap; then centred on its slot (rotY is 0: facing +Z)
  const slot = alongX ? ww : wd;
  const ax = alongX ? 0 : 2;
  const scale = [...first.scale];
  const own = (alongX ? entry.w : entry.d) * scale[ax];
  scale[ax] *= Math.min(1, (slot - WING_GAP) / own);
  const model = { ...first, rotY: 0, scale, offset: [-(entry.cx ?? 0) * scale[0], -(entry.y0 ?? 0) * scale[1], -(entry.cz ?? 0) * scale[2]] };
  const along = (alongX ? entry.w : entry.d) * scale[ax];
  const across = (alongX ? entry.d * scale[2] : entry.w * scale[0]) - 2 * JOINT_INSET;
  const h = entry.h * scale[1] - JOINT_INSET;
  const joints = [];
  for (let k = 0; k < n - 1; k++) {
    const len = slot - along + 2 * JOINT_OVERLAP; // the gap between two wings, and a little into each
    const u = (k + 1 - n / 2) * slot; // the boundary between slot k and k + 1, from the terminal's centre
    joints.push({ x: terminal.x + (alongX ? u : 0), z: terminal.z + (alongX ? 0 : u), w: alongX ? len : across, d: alongX ? across : len, y: FLOOR_Y, h });
  }
  return { plots, model, joints };
}
