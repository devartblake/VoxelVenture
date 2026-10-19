// The outside of a building: floors, shape, colours, rooftop feature. Validation, what it does to a plot, and how it is claimed.
import { imp, problemTally } from './helpers.mjs';
const e = await imp('game/exterior.js');
const { modelFor, modelOptions, modelName, EXTERIOR_CHOICES } = await imp('content/models.js');
const { generateCity, floorsForHeight } = await imp('city/cityGenerator.js');
const { useCityStore } = await imp('state/store.js');
const { bad, total } = problemTally();
const HEX = /^#[0-9a-f]{6}$/;

// palettes and crowns
for (const p of e.PALETTES) {
  if (p.wall !== null && !HEX.test(p.wall)) bad('a palette wall colour is #rrggbb', p.id);
  if (!HEX.test(p.accent)) bad('a palette accent is #rrggbb', p.id);
}
if (new Set(e.PALETTE_IDS).size !== e.PALETTES.length || new Set(e.CROWN_IDS).size !== e.CROWNS.length || e.CROWN_IDS[0] !== 'none') bad('ids are unique, and a crown can be none', '');
if (e.paletteById('nope').id !== 'brand') bad('an unknown palette is the brand colour', '');

// floors by tier: bigger tiers allow taller buildings, every business type has a sane range, the usual number is inside it
const ordinary = { w: 3, d: 3 };
for (const type of ['shop', 'restaurant', 'office', 'house']) {
  const a = e.floorRange(ordinary, type);
  const p = e.floorRange({ ...ordinary, prime: true }, type);
  const l = e.floorRange({ ...ordinary, luxury: true }, type);
  const g = e.floorRange({ ...ordinary, grand: true }, type);
  if (!(a.min === 1 && a.min <= a.typical && a.typical <= a.max && a.max >= 6 && a.max <= 20)) bad('a floor range is sane', `${type}: ${JSON.stringify(a)}`);
  if (!(p.max >= a.max && l.max >= p.max && g.max >= l.max)) bad('a bigger tier allows at least as many floors', `${type}: ${a.max} ${p.max} ${l.max} ${g.max}`);
  if (!(g.typical >= a.typical)) bad('a grand estate starts taller', type);
}
if (e.floorRange(ordinary, 'office').typical <= e.floorRange(ordinary, 'shop').typical - 1 && e.floorRange(ordinary, 'office').max < e.floorRange(ordinary, 'shop').max) bad('an office can go as tall as a shop', '');
if (e.heightFor(3) !== 3.6 || floorsForHeight(e.heightFor(4)) !== 4) bad('height and floors are each other\'s inverse', `${e.heightFor(3)}`);
if (e.tierName(1) !== 'Low-rise' || e.tierName(2) !== 'Low-rise' || e.tierName(4) !== 'Mid-rise' || e.tierName(7) !== 'High-rise' || e.tierName(10) !== 'Skyscraper' || !/Domestic/.test(e.tierNote(1)) || !/skyscraper/.test(e.tierNote(12))) bad('the skyline tiers', '');

// skyscrapers: an ordinary plot can carry a tall tower, an estate a taller one, and the shapes on offer can really stand that high
{
  const ord = e.floorRange(ordinary, 'shop');
  if (ord.max < 9) bad('an ordinary plot can go to about ten floors (a skyscraper), not four', JSON.stringify(ord));
  const est = e.floorRange({ ...ordinary, w: 9.4, d: 6.4, luxury: true }, 'office');
  if (est.max < 14 || est.max > 16) bad('a luxury estate allows up to sixteen floors', JSON.stringify(est));
  const grandR = e.floorRange({ ...ordinary, w: 13.6, d: 7.6, grand: true }, 'office');
  if (grandR.max < 16 || grandR.max > 20) bad('a grand estate allows up to twenty floors', JSON.stringify(grandR));
  if (!(est.max > ord.max && grandR.max >= est.max)) bad('bigger plots allow taller buildings', `${ord.max} ${est.max} ${grandR.max}`);
}

// anything in, a valid configuration out
const junk = [null, undefined, 5, 'x', [], {}, { floors: 'lots', model: 12, palette: 'zzz', wallColor: 'red', crown: 'laser', crownColor: '#12' }, { floors: -4 }, { floors: 9999 }, { floors: 2.6, wallColor: '#ABCDEF', crown: 'dome', crownColor: '#FF00FF', palette: 'tokyo', model: 'commercial/building-skyscraper-a' }];
for (const input of junk) {
  const c = e.cleanExterior(input, ordinary, 'shop');
  const r = e.floorRange(ordinary, 'shop');
  if (!Number.isInteger(c.floors) || c.floors < r.min || c.floors > r.max) bad('floors end up in the allowed range', JSON.stringify([input, c.floors]));
  if (!HEX.test(c.crownColor) || (c.wallColor !== null && !HEX.test(c.wallColor)) || !e.CROWN_IDS.includes(c.crown) || !e.PALETTE_IDS.includes(c.palette)) bad('a cleaned config is valid', JSON.stringify(c));
  if (c.model !== null && !/^[\w/.-]+$/.test(c.model)) bad('a model id is a plain path', String(c.model));
}
const good = e.cleanExterior(junk[junk.length - 1], ordinary, 'shop');
if (good.floors !== Math.min(3, e.floorRange(ordinary, 'shop').max) || good.crown !== 'dome' || good.wallColor !== '#abcdef' || good.crownColor !== '#ff00ff' || good.palette !== 'tokyo') bad('a good config is kept (colours lower-cased)', JSON.stringify(good));
if (e.wallColorOf({ wallColor: '#112233', palette: 'tokyo' }) !== '#112233' || e.wallColorOf({ wallColor: null, palette: 'tokyo' }) !== '#2a2552' || e.wallColorOf({ wallColor: null, palette: 'brand' }) !== null) bad('the wall colour: own pick, else palette, else the brand colour', '');

// what it does to a plot
const city = generateCity(6);
const lot = city.plots.find((p) => !p.owner && p.districtId !== 'suburb' && !p.designSite);
const plot = { ...lot, owner: 'x', buildingType: 'office', height: 3, interiorData: { rooms: 1, theme: 'office', variant: 'openplan', floors: 2 } };
const patch = e.applyExterior(plot, { floors: 4, palette: 'nordic', crown: 'beacon' }, 'office');
if (patch.height !== 4.8 || patch.interiorData.floors !== 4 || patch.wallColor !== '#e8dcc6' || patch.exterior.crown !== 'beacon' || patch.interiorData.theme !== 'office') bad('the outside changes the height, the interior floors and the colour', JSON.stringify(patch));
if (e.applyExterior(plot, { floors: 4 }, 'office').wallColor !== undefined) bad('the brand palette leaves the wall colour to the brand', '');
if (e.hasCustomExterior(plot) || !e.hasCustomExterior({ ...plot, ...patch })) bad('a custom outside is noticed', '');

// shapes: a choice among the good fits, and the game honours it
const built = { ...plot, ...patch };
const options = modelOptions(built);
if (options.some((o) => !(o.minFloors >= 1 && o.maxFloors >= o.minFloors))) bad('a shape says how many floors it can have', JSON.stringify(options[0]));
if (options.length < 3 || options.length > EXTERIOR_CHOICES || new Set(options.map((o) => o.id)).size !== options.length) bad('a plot has a few shapes to choose from', String(options.length));
if (options.some((o) => !o.name || /^\s|\/|-/.test(o.name))) bad('shapes have readable names', options.map((o) => o.name).join());
if (modelName('commercial/building-skyscraper-a') !== 'Skyscraper A') bad('a model name is readable', modelName('commercial/building-skyscraper-a'));
const auto = modelFor(built);
const other = options.find((o) => o.id !== auto.id);
const picked = modelFor({ ...built, exterior: { ...built.exterior, model: other.id } });
if (picked.id !== other.id) bad('the owner\'s shape is the one drawn', `${picked.id} vs ${other.id}`);
if (modelFor({ ...built, exterior: { ...built.exterior, model: 'commercial/not-a-building' } }).id !== auto.id) bad('an unknown shape falls back to the game\'s choice', '');
if (Math.abs(picked.height - 4.8) > 4.8 * 0.5) bad('a chosen shape still stands near the height asked for', String(picked.height));

// tall shapes: at ten floors on an ordinary plot the shapes are skyscrapers that can really stand that tall
{
  const tall = { ...plot, ...e.applyExterior(plot, { floors: 10 }, 'office') };
  const tallOptions = modelOptions(tall);
  if (!tallOptions.length || tallOptions.some((o) => o.maxFloors < 10 || o.minFloors > 10)) bad('every shape offered at ten floors can stand ten floors', JSON.stringify(tallOptions));
  if (!tallOptions.some((o) => /skyscraper|tower/i.test(o.id))) bad('the shapes at ten floors are skyscrapers', tallOptions.map((o) => o.id).join());
  const m = modelFor(tall);
  if (!(m.height >= 9 && m.height <= 14)) bad('a ten-floor building stands about twelve units tall', String(m.height));
  const chosen = modelFor({ ...tall, exterior: { ...tall.exterior, model: tallOptions[tallOptions.length - 1].id } });
  if (chosen.id !== tallOptions[tallOptions.length - 1].id) bad('a skyscraper shape can be chosen at its floors', chosen.id);
}

// claiming with an outside
useCityStore.setState({ plots: city.plots, layout: city.layout, billboards: city.billboards });
const claimed = useCityStore.getState().claimPlot(lot.id, 'Tester', 'Tall Test', 'https://x.example', 'office', null, { kind: 'generated' }, '', { floors: 5, palette: 'solar', crown: 'dish', model: null });
const mine = useCityStore.getState().plots.find((p) => p.id === lot.id);
const r = e.floorRange(lot, 'office');
if (!claimed || mine.height !== e.heightFor(Math.min(5, r.max)) || mine.interiorData.floors !== Math.min(5, r.max) || mine.wallColor !== '#334155' || mine.exterior.crown !== 'dish') bad('claiming with an outside builds that building', JSON.stringify([mine.height, mine.interiorData?.floors, mine.wallColor, mine.exterior?.crown]));
// five floors is more than an office's usual number, so the extra floors are priced (a dish is free): the land plus their share of it
const extra = Math.max(0, Math.min(5, r.max) - r.typical);
if (Math.abs(mine.value - (lot.price + Math.round(lot.price * 0.1 * extra * 100) / 100)) > 0.011 || !mine.userClaimed) bad('the building is worth what was paid: the land and the extra floors (a dish and a colour style are free)', `${mine.value} vs ${lot.price} + ${extra} floors`);
const edited = useCityStore.getState().setPlotExterior(lot.id, { floors: 2, palette: 'brand', crown: 'spire', wallColor: '#ff8800' });
const after = useCityStore.getState().plots.find((p) => p.id === lot.id);
if (!edited || after.height !== 2.4 || after.wallColor !== '#ff8800' || after.exterior.crown !== 'spire' || after.interiorData.floors !== 2) bad('an owner can change the outside later', JSON.stringify([after.height, after.wallColor, after.exterior?.crown]));
const notMine = city.plots.find((p) => p.owner && !p.userClaimed);
if (useCityStore.getState().setPlotExterior(notMine.id, { floors: 1 }) !== false) bad('nobody changes a building that is not theirs', '');
// a claim with no outside is unchanged
const lot2 = city.plots.find((p) => !p.owner && p.districtId !== 'suburb' && !p.designSite && p.id !== lot.id);
useCityStore.getState().claimPlot(lot2.id, 'Tester', 'Plain', 'https://x.example', 'shop', null, { kind: 'generated' }, '');
const plain = useCityStore.getState().plots.find((p) => p.id === lot2.id);
if (plain.exterior !== undefined) bad('a claim with no outside has no exterior settings', '');

console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
