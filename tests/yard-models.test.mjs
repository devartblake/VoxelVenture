// The yards made of Kenney models (lib/content/yardModels.js, docs/product/yard_items.md): valid models, fitted to the free ground, never on a neighbour, offered to the businesses they suit.
import { imp, problemTally } from './helpers.mjs';
const y = await imp('content/yardModels.js');
const b = await imp('content/backyards.js');
const { PROP_CATALOG } = await imp('content/propCatalog.js');
const { cleanExterior } = await imp('game/exterior.js');
const { generateCity } = await imp('city/cityGenerator.js');
const { bad, total } = problemTally();
const ids = new Set(PROP_CATALOG.map((m) => m.id));

if (y.YARD_PRESETS.length < 5) bad('there are at least five yards of models', String(y.YARD_PRESETS.length));
for (const p of y.YARD_PRESETS) {
  if (!b.BACK_IDS.includes(p.id)) bad('a yard of models is a back an owner can pick', p.id);
  if (p.models.length < 4 || p.models.length > 12) bad('a yard has a handful of models', `${p.id}: ${p.models.length}`);
  for (const m of p.models) {
    if (!ids.has(m.id)) bad('every model is in the prop catalogue (and so shipped)', `${p.id}: ${m.id}`);
    if (m.at && (Math.abs(m.at[0]) > 0.5 || m.at[1] < 0 || m.at[1] > 1)) bad('a model stands inside the lot\'s width and room', `${p.id}: ${m.id} ${m.at}`);
    if (m.row && (m.row[0] < -0.5 || m.row[1] > 0.5 || m.row[2] < 1)) bad('a row stays inside the lot\'s width', `${p.id}: ${m.id}`);
  }
  if (!p.suits?.length || !/^#[0-9a-f]{6}$/.test(p.ground)) bad('a yard says who it suits and has a ground colour', p.id);
}
if (!y.YARD_PRESETS.every((p) => (p.suits ?? []).every((t) => ['house', 'restaurant', 'shop', 'office'].includes(t)))) bad('a yard suits only kinds of business that exist', '');
if (!y.YARD_PRESETS.some((p) => p.suits.includes('restaurant')) || !y.YARD_PRESETS.some((p) => p.suits.includes('office')) || !y.YARD_PRESETS.some((p) => p.suits.includes('house')) || !y.YARD_PRESETS.some((p) => p.suits.includes('shop'))) bad('every kind of business has a yard that suits it', '');

// offered by business: the suited ones first
for (const type of ['restaurant', 'shop', 'office', 'house']) {
  const list = b.backsFor(type);
  const firstUnsuited = list.findIndex((x) => !x.suited);
  if (!list.slice(0, firstUnsuited < 0 ? list.length : firstUnsuited).every((x) => x.suited) || list.slice(Math.max(0, firstUnsuited)).some((x) => x.suited)) bad('the yards that suit a business come first', type);
  if (list.length !== b.BACKS.length) bad('nothing is hidden: every back is offered to every business', type);
}
if (!b.backsFor('restaurant')[0].suited || b.backsFor('restaurant').filter((x) => x.suited).length < 2) bad('a restaurant has more than one yard that suits it', '');

// an owner's choice is kept, and a made-up one is not
const plot = { id: 1, owner: 'x', x: 10, z: 0, w: 3, d: 3, facing: 1, yaw: 0, exterior: { back: 'tropical' } };
for (const p of y.YARD_PRESETS) if (cleanExterior({ back: p.id }, plot, 'shop').back !== p.id) bad('a yard of models is kept by the exterior check', p.id);
if (cleanExterior({ back: 'tropic' }, plot, 'shop').back !== 'none') bad('an unknown yard becomes none', '');

// the items
const items = b.backModelItems([plot, { ...plot, id: 2, owner: null }, { ...plot, id: 3, exterior: { back: 'garden' } }, { ...plot, id: 4, exterior: { back: 'none' } }], [plot], PROP_CATALOG);
const tropical = y.yardPreset('tropical');
if (items.length !== tropical.models.length) bad('one item for each model of a built lot\'s yard, and none for the rest', `${items.length} of ${tropical.models.length}`);
if (items.some((i) => i.z > plot.z - 1.5 + 1e-6)) bad('the models stand behind the building (a lot facing +z)', '');
if (items.some((i) => !(i.model.scale > 0) || !i.model.offset.every(Number.isFinite))) bad('every item has a size and an offset', '');
const palm = items.find((i) => i.model.id === 'nature/tree_palm');
if (!palm || Math.abs(palm.model.height - 1.35) > 0.05) bad('a palm is drawn at its height (1.35, give or take)', String(palm?.model.height));
// a small lot shrinks them; a lot with no room has none
const tinyRoom = { ...plot, id: 9, z: -3.2 }; // 0.2 gap behind
if (b.backModelItems([plot], [plot, tinyRoom], PROP_CATALOG).length) bad('a gap too small for a yard has no models', '');
const small = b.backModelItems([{ ...plot, w: 1.5 }], [plot], PROP_CATALOG).find((i) => i.model.id === 'nature/tree_palm');
if (!small || small.model.scale >= palm.model.scale) bad('a narrow lot shrinks the models', '');
// the fenced garden's fence is a row across the back, pieces side by side
const fence = b.backModelItems([{ ...plot, exterior: { back: 'fenced' } }], [plot], PROP_CATALOG).filter((i) => i.model.id === 'nature/fence_simple');
if (fence.length !== 6 || new Set(fence.map((f) => Math.round(f.x * 100))).size !== 6) bad('the fence is six pieces side by side', String(fence.length));
// a lot turned a quarter puts them behind it, toward -x
const turned = b.backModelItems([{ ...plot, yaw: Math.PI / 2 }], [plot], PROP_CATALOG);
if (turned.some((i) => i.x > plot.x - 1.5 + 1e-6)) bad('a lot turned a quarter has its yard toward -x', '');

// in the real city nothing of any yard reaches another lot
const city = generateCity(20260101);
for (const p of y.YARD_PRESETS) {
  const built = city.plots.filter((q) => !q.owner).slice(0, 200).map((q) => ({ ...q, owner: 'x', exterior: { back: p.id } }));
  let overlaps = 0, drawn = 0;
  for (const q of built) {
    const list = b.backModelItems([q], city.plots, PROP_CATALOG);
    drawn += list.length;
    for (const i of list) for (const o of city.plots) {
      if (o.id === q.id) continue;
      if (Math.abs(i.x - o.x) < (o.w ?? 3) / 2 - 0.05 && Math.abs(i.z - o.z) < (o.d ?? 3) / 2 - 0.05 && !(Math.abs(Math.sin(o.yaw ?? 0)) > 0.7)) overlaps++;
    }
  }
  if (overlaps) bad('no model of a yard stands inside another lot', `${p.id}: ${overlaps}`);
  if (!drawn) bad('a yard is drawn on some lots of the real city', p.id);
}
console.log('yard-models: 5 yards, 200 lots each');
total();
