// The airports' models: the terminal's wings never share a face (the flickering seam) and their joints close every gap; the plane table
// (lib/content/planeModels.js) is valid, and while its models are not in the prop catalog every plane falls back to the primitive one.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';

const { generateCity } = await imp('city/cityGenerator.js');
const { terminalWings, ALL_MODELS, WING_GAP, JOINT_OVERLAP } = await imp('content/models.js');
const pm = await imp('content/planeModels.js');
const { PROP_CATALOG } = await imp('content/propCatalog.js');
const { bad, total } = problemTally();
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ---- the terminals ----
const byId = new Map(ALL_MODELS.map((m) => [m.id, m]));
let terminals = 0;
for (const seed of [1, 7, 42]) {
  const { layout } = generateCity(seed);
  for (const a of layout.airports) {
    terminals++;
    const t = a.terminal;
    const { plots, model, joints } = terminalWings(t, { name: a.name, height: a.international ? 3.6 : 2.4 });
    if (!model) { bad('a terminal has a model', a.name); continue; }
    const e = byId.get(model.id);
    const alongX = t.w >= t.d;
    const ax = alongX ? 0 : 2;
    // each wing's box along the row (the model is centred on its plot: offset = -centre * scale)
    const half = ((alongX ? e.w : e.d) * model.scale[ax]) / 2;
    const boxes = plots.map((p) => {
      const c = (alongX ? p.x : p.z) + model.offset[ax] + (alongX ? e.cx ?? 0 : e.cz ?? 0) * model.scale[ax];
      return [c - half, c + half];
    });
    const lo = alongX ? t.x - t.w / 2 : t.z - t.d / 2;
    const hi = alongX ? t.x + t.w / 2 : t.z + t.d / 2;
    if (boxes[0][0] < lo - 1e-6 || boxes.at(-1)[1] > hi + 1e-6) bad('the wings stay inside the footprint', a.name);
    if (joints.length !== plots.length - 1) bad('a joint between every two wings', `${a.name}: ${joints.length} for ${plots.length}`);
    for (let k = 0; k + 1 < boxes.length; k++) {
      const gap = boxes[k + 1][0] - boxes[k][1];
      if (gap < WING_GAP - 1e-6) bad('neighbouring wings stand apart, so their end walls never coincide', `${a.name}: ${gap.toFixed(3)}`);
      const j = joints[k];
      if (!j) continue;
      const jc = alongX ? j.x : j.z;
      const jl = alongX ? j.w : j.d;
      if (!(jc - jl / 2 <= boxes[k][1] - JOINT_OVERLAP + 1e-6 && jc + jl / 2 >= boxes[k + 1][0] + JOINT_OVERLAP - 1e-6)) bad('the joint fills the gap and reaches into both wings', a.name);
      // the joint's sides and top are inside the wings' (never in the same plane)
      const across = alongX ? j.d : j.w;
      const wingAcross = alongX ? e.d * model.scale[2] : e.w * model.scale[0];
      if (!(across < wingAcross - 0.05)) bad('the joint is narrower than the wings', a.name);
      if (!(j.y + j.h < 0.1 + e.h * model.scale[1] - 0.05)) bad('the joint is lower than the wings', a.name);
    }
  }
}
if (terminals < 6) bad('the cities have airports', String(terminals));

// ---- the plane table ----
const problems = pm.planeTableProblems();
for (const p of problems) bad('the plane table is valid', p);
if (!pm.planeTableProblems([{ airport: 'mars', role: 'parked', slot: 0, model: 'nope', length: 0 }]).length) bad('an invalid table is caught', '');
for (const k of ['airliner', 'small-plane', 'cargo-plane']) if (!pm.PLANE_MODELS[k]) bad('the three chosen models are in the table', k);
for (const m of Object.values(pm.PLANE_MODELS)) if (m.license !== 'CC BY 4.0') bad('the plane models are CC BY 4.0 (credited when added)', m.id);
if (pm.planeRole({ international: true, role: 'parked', slot: 0 })?.model !== 'airliner') bad('the international airport parks an airliner first', '');
if (pm.planeRole({ international: true, role: 'parked', slot: 1 })?.model !== 'cargo-plane') bad('and a cargo plane second', '');
if (pm.planeRole({ role: 'flying', slot: 1 })?.model !== 'small-plane') bad('the banner planes are the small plane', '');

// the fallback: the models are not in the catalog yet, so no plane finds an entry and every plane draws its primitive version
const added = Object.values(pm.PLANE_MODELS).filter((m) => PROP_CATALOG.some((c) => c.id === m.id));
const rows = [true, false].flatMap((international) => ['parked', 'flying'].flatMap((role) => [0, 1].map((slot) => pm.planeRole({ international, role, slot }))));
if (!added.length) for (const r of rows) if (pm.planeModelEntry(r, PROP_CATALOG) !== null) bad('without the model files every plane uses its primitive fallback', r.model);
if (pm.planeModelEntry(null, PROP_CATALOG) !== null) bad('no row: the fallback', '');
// a model that is on disk and catalogued is found
for (const m of added) if (!fs.existsSync(path.join(root, 'apps', 'web', 'public', PROP_CATALOG.find((c) => c.id === m.id).url))) bad('a catalogued plane model is on disk', m.id);

// with a (made-up) catalog entry the plane uses it, fitted to its length, nose along +Z, centred, wheels on the ground
const fake = { id: 'airport/airliner', w: 30, h: 9, d: 34, cx: 1, cz: -2, y0: -0.5 };
const row = pm.planeRole({ international: true, role: 'parked', slot: 0 });
if (pm.planeModelEntry(row, [fake]) !== fake) bad('a catalogued model is used', '');
{
  const f = pm.planeFit(fake, { ...row, span: null });
  if (!near(fake.d * f.scale, row.length)) bad('the model is fitted to its length', String(fake.d * f.scale));
  if (!near(f.position[0], -fake.cx * f.scale) || !near(f.position[2], -fake.cz * f.scale) || !near(f.position[1], 0.5 * f.scale)) bad('the model is centred, wheels on y = 0', JSON.stringify(f.position));
  const capped = pm.planeFit(fake, row);
  if (!(fake.w * capped.scale <= row.span + 1e-9)) bad('the wingspan is capped', String(fake.w * capped.scale));
  // a model whose nose points along +X: turned a quarter, its length is its width; its centre still goes to the origin
  const side = pm.planeFit(fake, { ...row, span: null, yaw: -Math.PI / 2 });
  if (!near(fake.w * side.scale, row.length)) bad('a turned model is fitted along its turned length', String(fake.w * side.scale));
  const [px, , pz] = side.position;
  const c = Math.cos(-Math.PI / 2);
  const s = Math.sin(-Math.PI / 2);
  const wx = px + side.scale * (fake.cx * c + fake.cz * s);
  const wz = pz + side.scale * (-fake.cx * s + fake.cz * c);
  if (!near(wx, 0) || !near(wz, 0)) bad('a turned model is centred', `${wx}, ${wz}`);
  // in the air: centred vertically, in a group drawn 1.35 times bigger
  const air = pm.planeFit(fake, { ...row, span: null }, { ground: false, unit: 1.35 });
  if (!near(fake.d * air.scale * 1.35, row.length) || !near(air.position[1], -(fake.y0 + fake.h / 2) * air.scale)) bad('a flying plane is centred and fitted in its group', JSON.stringify(air));
}
const rc = pm.planeRecolor({ recolor: [{ from: '#ffffff', to: 'tail' }, { from: '#000000', to: '#112233' }, { from: '#ff0000', to: 'trim' }] }, { tail: '#dc2626' });
if (JSON.stringify(rc) !== JSON.stringify([{ from: '#ffffff', to: '#dc2626' }, { from: '#000000', to: '#112233' }])) bad('a recolour fills in the palette and drops what it cannot', JSON.stringify(rc));

// the components use the table with their primitive planes as the fallback
const airports = fs.readFileSync(path.join(root, 'apps/web/components/city/Airports.jsx'), 'utf8');
const planes = fs.readFileSync(path.join(root, 'apps/web/components/city/Planes.jsx'), 'utf8');
if (!/<PlaneModel[^>]*fallback=\{<Airliner/.test(airports)) bad('a parked plane falls back to the primitive airliner', '');
if (!/<PlaneModel[^>]*fallback=\{<PrimitivePlane/.test(planes)) bad('a banner plane falls back to the box plane', '');
if (/<StaticBatch[^>]*>\s*[\s\S]*<TerminalModels[\s\S]*<\/StaticBatch>/.test(airports.slice(airports.indexOf('export default')))) bad('the terminal is drawn outside the baked batch', '');

console.log(`${terminals} terminals; ${Object.keys(pm.PLANE_MODELS).length} plane models (${added.length} added), ${pm.PLANE_ROLES.length} rows`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
