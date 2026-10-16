// What furniture suits which business, and what the fixtures in a building are worth.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const { BUSINESS_KITS, kitFor, menuFor, suitedFor } = await imp('content/businessFixtures.js');
const { groupOf } = await imp('content/furnitureGroups.js');
const pricing = await imp('content/fixturePricing.js');
const { FIXTURE_PRICES } = await imp('content/fixturePrices.js');
const { generateCity, BUILDING_TYPES } = await imp('city/cityGenerator.js');
const { bad, total } = problemTally();

const file = path.join(root, 'node_modules', '@pascal-app', 'editor', 'src', 'components', 'ui', 'item-catalog', 'catalog-items.tsx');
const src = fs.readFileSync(file, 'utf8');
const items = [...src.matchAll(/^ {4}id: '([^']+)',\n {4}category: '([^']+)',\n {4}name: '([^']+)'/gm)].map((m) => ({ id: m[1], category: m[2], name: m[3] }));
if (items.length < 90) bad('the catalogue is read', String(items.length));

// every kind of business the game makes has a kit, and every layout of it works
for (const [type, def] of Object.entries(BUILDING_TYPES)) {
  for (const variant of def.variants) {
    const kit = kitFor(type, variant);
    if (!kit.label || !kit.groups.length) bad('a kit for every business type and layout', `${type}/${variant}`);
    const menu = menuFor(items, kit);
    if (!menu.length || menu[0].id !== 'essentials') bad('the menu starts with the essentials', `${type}/${variant}: ${menu[0]?.id}`);
    const essentials = menu[0].items.length;
    if (essentials < 6 || essentials > 26) bad('the essentials are a short, useful list', `${type}/${variant}: ${essentials}`);
    if (new Set(menu.map((g) => g.id)).size !== menu.length) bad('menu groups are not repeated', `${type}/${variant}`);
    // nothing outside the kit unless asked for, and everything when asked
    const shown = new Set(menu.filter((g) => g.id !== 'essentials').flatMap((g) => g.items.map((i) => i.id)));
    if (menu.some((g) => g.more)) bad('"show all" groups are hidden by default', `${type}/${variant}`);
    const all = menuFor(items, kit, { showAll: true });
    const allIds = new Set(all.filter((g) => g.id !== 'essentials').flatMap((g) => g.items.map((i) => i.id)));
    if (allIds.size !== items.length) bad('"show all" reaches every item', `${type}/${variant}: ${allIds.size} of ${items.length}`);
    if (shown.size >= items.length) bad('a business is not shown the whole catalogue by default', `${type}/${variant}`);
  }
}

// the kits differ in what matters: a restaurant leads with kitchen gear, a shop with display, an office with desks, a home with seating and beds
const first = (t, v) => menuFor(items, kitFor(t, v)).filter((g) => g.id !== 'essentials')[0]?.id;
if (first('restaurant', 'diner') !== 'seating' || first('restaurant', 'cafe') !== 'tables') bad('restaurant layouts lead with what they lean on', `${first('restaurant', 'diner')} ${first('restaurant', 'cafe')}`);
if (first('shop', 'boutique') !== 'shop' || first('shop', 'market') !== 'outdoor') bad('a boutique leads with display, a market with its stalls', `${first('shop', 'boutique')} ${first('shop', 'market')}`);
if (first('office', 'openplan') !== 'tables') bad('an office leads with desks', first('office', 'openplan'));
if (first('house', 'cottage') !== 'seating') bad('a home leads with seating', first('house', 'cottage'));
const names = (t, v) => menuFor(items, kitFor(t, v))[0].items.map((i) => i.name.toLowerCase());
if (!names('restaurant', 'diner').some((n) => /fridge|stove|counter/.test(n))) bad('a restaurant has kitchen gear among its essentials', names('restaurant', 'diner').join());
if (!names('office', 'openplan').some((n) => /chair/.test(n)) || !names('office', 'openplan').some((n) => /desk|table/.test(n))) bad('an office has desks and chairs among its essentials', names('office', 'openplan').join());
if (!names('house', 'cottage').some((n) => /bed/.test(n))) bad('a home has a bed among its essentials', names('house', 'cottage').join());
const suited = items.map((i) => suitedFor(i).length);
if (Math.min(...suited) < 0 || !items.some((i) => suitedFor(i).length === Object.keys(BUSINESS_KITS).length)) bad('some items suit every kind of business', '');

// pricing: all zero until set
if (pricing.pricesConfigured()) bad('the shipped price list starts empty (set your prices with the import script)', JSON.stringify(FIXTURE_PRICES).slice(0, 80));
const prices = { currency: '$', worthFactor: 0.5, defaults: { seating: 40 }, items: { shelf: 100, 'office-chair': 0 } };
const chair = items.find((i) => groupOf(i) === 'seating' && i.id !== 'office-chair');
const shelf = items.find((i) => i.id === 'shelf');
if (chair && pricing.priceOf(chair, prices) !== 40) bad('an item takes its group default price', chair?.id);
if (shelf && pricing.priceOf(shelf, prices) !== 100) bad('an item takes its own price over the default', '');
if (pricing.priceOf({ id: 'office-chair', name: 'Office Chair' }, prices) !== 0) bad('an item priced 0 is free, not the default', '');
if (pricing.priceOf({ id: 'nothing', name: 'Mystery' }, prices) !== 0) bad('an unpriced item is 0', '');
if (pricing.priceOf({ id: 'shelf' }, { items: { shelf: -5 }, defaults: {} }) !== 0 || pricing.priceOf({ id: 'shelf' }, { items: { shelf: 'abc' }, defaults: {} }) !== 0) bad('a bad price is ignored', '');
if (!pricing.pricesConfigured(prices)) bad('prices count as set once any is above 0', '');

const graph = { nodes: { a: { type: 'item', asset: { id: 'shelf', name: 'Shelf' } }, b: { type: 'item', asset: { id: 'shelf', name: 'Shelf' } }, c: { type: 'item', asset: { id: 'door', name: 'Door' } }, d: { type: 'wall' }, e: { type: 'item', asset: { id: 'cactus', name: 'Cactus' } } } };
const list = pricing.fixtureList(graph);
if (list.length !== 2 || list.find((r) => r.id === 'shelf').count !== 2) bad('fixtures are counted, doors and walls are not', JSON.stringify(list));
const fv = pricing.fixturesValue(graph, prices);
if (fv.count !== 3 || fv.kinds !== 2 || fv.value !== 200 + (items.some((i) => i.id === 'cactus') ? pricing.priceOf({ id: 'cactus', name: 'Cactus' }, prices) : 0)) bad('fixtures add up', JSON.stringify(fv));
const w = pricing.businessWorth({ value: 1000 }, graph, prices);
if (w.base !== 1000 || w.total !== Math.round(1000 + fv.value * 0.5)) bad('a business is worth its place plus its fixtures scaled by the factor', JSON.stringify(w));
if (pricing.businessWorth({ value: 500 }, null).total !== 500 || pricing.businessWorth({ value: 500 }, { nodes: {} }).count !== 0) bad('no design: the place alone', '');
// with the shipped (empty) prices, fixtures add nothing
const gen = generateCity(1).plots.find((p) => p.owner);
if (pricing.businessWorth(gen, graph).total !== gen.value) bad('with no prices set, worth is unchanged', '');

console.log(`${items.length} items, ${Object.keys(BUSINESS_KITS).length} kits`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
