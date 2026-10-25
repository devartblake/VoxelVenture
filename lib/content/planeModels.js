// The planes' 3D models: which model each airport's planes use, and how each is fitted. Pure (no three.js), so it is tested in Node.
//
// The models are outside assets (CC BY 4.0, not Kenney), added as .glb files later (docs/world/kenney_assets.md#plane-models). Until a model's
// id is in the prop catalog (lib/content/propCatalog.js) and its file has loaded, or if it fails to load, or with ?models=0, the primitive plane
// that was there before is drawn (Airports.jsx `Airliner`, Planes.jsx), so nothing is ever missing.
//
// PLANE_MODELS: the models, with who made them (for CREDITS.md and lib/content/credits.js when the files are added).
// PLANE_ROLES:  which plane uses which model. A row:
//   airport  'international' | 'regional' | '*'     which airport (the international one is layout.airports[i].international)
//   role     'parked' | 'flying'                     a parked plane on the apron (airport.airliners) or a banner plane in the air
//   slot     a number or '*'                         which parked plane (its index in airport.airliners) or which banner plane
//   model    a key of PLANE_MODELS
//   length   the plane's length nose to tail, in world units, as drawn (the primitive planes: airliner 8.6, banner plane 3.1)
//   span     optional: the most its wingspan may be (it is shrunk to fit, keeping its proportions)
//   yaw      radians: the turn that points the model's nose along +Z (every plane in the game faces +Z); a model whose nose points
//            along +X needs -Math.PI / 2, along -Z Math.PI
//   recolor  optional: [{ from: '#rrggbb', to: '#rrggbb' | 'body' | 'trim' | 'tail' }]: vertex colours close to `from` (models with plain
//            material colours, which the loader bakes into vertex colours) are drawn in `to`; 'body', 'trim' and 'tail' are the colours
//            the caller gives (the banner planes' livery, the parked airliners' tail colour)
// The first row that matches wins.
export const PLANE_MODELS = {
  airliner: { id: 'airport/airliner', title: 'Low Poly Passenger Aircraft', by: 'Crimexix', license: 'CC BY 4.0', tris: 2700 },
  'small-plane': { id: 'airport/small-plane', title: 'Low-poly Stylized Aircraft', by: 'mithgarden.studio', license: 'CC BY 4.0', tris: 1000 },
  'cargo-plane': { id: 'airport/cargo-plane', title: 'Cargo plane (voxel)', by: 'StarlyRD', license: 'CC BY 4.0', tris: 2500 },
};

export const PLANE_ROLES = [
  { airport: 'international', role: 'parked', slot: 0, model: 'airliner', length: 8.6, span: 7.2, yaw: 0, recolor: [] },
  { airport: 'international', role: 'parked', slot: 1, model: 'cargo-plane', length: 8.6, span: 7.2, yaw: 0, recolor: [] },
  { airport: '*', role: 'parked', slot: '*', model: 'airliner', length: 8.6, span: 7.2, yaw: 0, recolor: [] },
  { airport: '*', role: 'flying', slot: '*', model: 'small-plane', length: 3.1, span: 4.4, yaw: 0, recolor: [] },
];

const HEX = /^#[0-9a-f]{6}$/i;
const TOKENS = ['body', 'trim', 'tail'];

// The row for a plane, or null: { international, role: 'parked' | 'flying', slot }.
export function planeRole({ international = false, role, slot = 0 }, roles = PLANE_ROLES) {
  const airport = international ? 'international' : 'regional';
  return roles.find((r) => (r.airport === '*' || r.airport === airport) && r.role === role && (r.slot === '*' || r.slot === slot)) ?? null;
}

// The catalog entry a row draws, or null when the model is not in the catalog (not added yet): the caller draws its primitive plane.
export function planeModelEntry(row, catalog) {
  const id = row && PLANE_MODELS[row.model]?.id;
  return (id && catalog.find((m) => m.id === id)) || null;
}

// How a catalog model is placed so it is `row.length` long nose to tail, its nose along +Z, centred on the origin across and along, and
// (`ground`) its wheels on y = 0 or (in the air) its middle at y = 0. `unit` is the scale of the group it is drawn in (the banner planes'
// group is 1.35), so the length is right in the world. Returns { scale, rotation: [0, yaw, 0], position: [x, y, z] } for one mesh.
export function planeFit(entry, row, { ground = true, unit = 1 } = {}) {
  const yaw = row.yaw ?? 0;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // the model's size once turned: along the world's Z (its length) and X (its span)
  const along = Math.abs(entry.d * c) + Math.abs(entry.w * s);
  const across = Math.abs(entry.w * c) + Math.abs(entry.d * s);
  let k = row.length / unit / along;
  if (row.span) k = Math.min(k, row.span / unit / across);
  // three.js turns (x, z) by yaw about Y as (x c + z s, -x s + z c); the box's centre goes to the origin
  const cx = entry.cx * k;
  const cz = entry.cz * k;
  const y = ground ? -entry.y0 * k : -(entry.y0 + entry.h / 2) * k;
  return { scale: k, rotation: [0, yaw, 0], position: [-(cx * c + cz * s), y, -(-cx * s + cz * c)] };
}

// The colours a row's recolour asks for, with the tokens filled in: [{ from, to }] of '#rrggbb' strings (rows naming a token the caller
// did not give are left out).
export function planeRecolor(row, palette = {}) {
  return (row?.recolor ?? []).map((r) => ({ from: r.from, to: TOKENS.includes(r.to) ? palette[r.to] : r.to })).filter((r) => HEX.test(r.from ?? '') && HEX.test(r.to ?? ''));
}

// Problems with the table (empty when it is valid): the tests run this.
export function planeTableProblems(roles = PLANE_ROLES, models = PLANE_MODELS) {
  const out = [];
  for (const [key, m] of Object.entries(models)) {
    if (!/^airport\/[a-z0-9-]+$/.test(m.id ?? '')) out.push(`${key}: the id is airport/<name>`);
    if (!m.title || !m.by || !m.license) out.push(`${key}: a title, a maker and a licence (for the credits)`);
    if (!(m.tris > 0 && m.tris < 3000)) out.push(`${key}: a small triangle count`);
  }
  const ids = Object.values(models).map((m) => m.id);
  if (new Set(ids).size !== ids.length) out.push('two models share an id');
  roles.forEach((r, i) => {
    const at = `row ${i}`;
    if (!['international', 'regional', '*'].includes(r.airport)) out.push(`${at}: airport`);
    if (!['parked', 'flying'].includes(r.role)) out.push(`${at}: role`);
    if (!(r.slot === '*' || (Number.isInteger(r.slot) && r.slot >= 0))) out.push(`${at}: slot`);
    if (!models[r.model]) out.push(`${at}: an unknown model ${r.model}`);
    if (!(r.length > 0.5 && r.length < 20)) out.push(`${at}: a length between 0.5 and 20`);
    if (r.span != null && !(r.span > 0.5 && r.span < 20)) out.push(`${at}: a span between 0.5 and 20`);
    if (!(Number.isFinite(r.yaw ?? 0) && Math.abs(r.yaw ?? 0) <= Math.PI * 2)) out.push(`${at}: a yaw in radians`);
    for (const c of r.recolor ?? []) if (!HEX.test(c.from ?? '') || !(HEX.test(c.to ?? '') || TOKENS.includes(c.to))) out.push(`${at}: a recolour is { from: '#rrggbb', to: '#rrggbb' | ${TOKENS.join(' | ')} }`);
  });
  // every plane the game draws finds a row
  for (const international of [true, false]) for (const role of ['parked', 'flying']) for (const slot of [0, 1]) if (!planeRole({ international, role, slot }, roles)) out.push(`no row for ${international ? 'international' : 'regional'} ${role} ${slot}`);
  return out;
}
