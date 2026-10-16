// Writes a spreadsheet of every piece of furniture in the editor's catalogue, to fill in with prices.
//
//   node scripts/fixture-price-sheet.mjs [fixture-prices.csv]
//
// Columns: id, name, group, suited_for (the kinds of business whose menu shows it), price (the current price, or blank to use the group's default),
// and group_default. Fill in `price` (a number, or leave it blank), save as CSV, and run  node scripts/import-fixture-prices.mjs <file>.
import fs from 'node:fs';
import path from 'node:path';
import { imp, root } from './lib-loader.mjs';

const { groupOf, FURNITURE_GROUPS, OTHER_GROUP } = await imp('content/furnitureGroups.js');
const { suitedFor } = await imp('content/businessFixtures.js');
const { FIXTURE_PRICES } = await imp('content/fixturePrices.js');

const file = path.join(root, 'node_modules', '@pascal-app', 'editor', 'src', 'components', 'ui', 'item-catalog', 'catalog-items.tsx');
const src = fs.readFileSync(file, 'utf8');
const items = [...src.matchAll(/^ {4}id: '([^']+)',\n {4}category: '([^']+)',\n {4}name: '([^']+)'/gm)].map((m) => ({ id: m[1], category: m[2], name: m[3] }));
if (items.length < 90) {
  console.error(`Only ${items.length} items found in the catalogue: its file format may have changed (${file}).`);
  process.exit(1);
}
const groupLabel = Object.fromEntries([...FURNITURE_GROUPS, OTHER_GROUP].map((g) => [g.id, g.label]));
const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
const rows = [['id', 'name', 'group', 'suited_for', 'price', 'group_default'].map(cell).join(',')];
for (const it of items.sort((a, b) => groupOf(a).localeCompare(groupOf(b)) || a.name.localeCompare(b.name))) {
  const g = groupOf(it);
  const own = FIXTURE_PRICES.items?.[it.id];
  rows.push([it.id, it.name, groupLabel[g], suitedFor(it).join(' '), own ?? '', FIXTURE_PRICES.defaults?.[g] ?? ''].map(cell).join(','));
}
const out = path.resolve(process.argv[2] || 'fixture-prices.csv');
fs.writeFileSync(out, rows.join('\r\n'));
console.log(`${items.length} items written to ${out}`);
console.log('Fill in the price column, then:  node scripts/import-fixture-prices.mjs ' + path.basename(out));
