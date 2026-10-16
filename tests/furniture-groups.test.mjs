// The editor's furniture menu: every item of Pascal's catalogue lands in a sensible group, and no group is left bloated or empty.
import fs from 'node:fs';
import path from 'node:path';
import { imp, problemTally, root } from './helpers.mjs';
const { groupOf, groupItems, FURNITURE_GROUPS } = await imp('content/furnitureGroups.js');
const { bad, total } = problemTally();

// read the catalogue the editor ships (a .tsx file, so it is read as text)
const file = path.join(root, 'node_modules', '@pascal-app', 'editor', 'src', 'components', 'ui', 'item-catalog', 'catalog-items.tsx');
const src = fs.readFileSync(file, 'utf8');
const items = [...src.matchAll(/^ {4}id: '([^']+)',\n {4}category: '([^']+)',\n {4}name: '([^']+)'/gm)].map((m) => ({ id: m[1], category: m[2], name: m[3] }));
if (items.length < 90) bad('the catalogue is read', String(items.length));

const groups = groupItems(items, { featured: false });
const other = groups.find((g) => g.id === 'other');
if (other && other.items.length > items.length * 0.08) bad('few items are left in "More"', `${other.items.length}: ${other.items.map((i) => i.name).join(', ')}`);
for (const g of groups) if (g.items.length > 22) bad('no group is too long to scan', `${g.label} ${g.items.length}`);
if (groups.reduce((n, g) => n + g.items.length, 0) !== items.length) bad('every item is in exactly one group', '');
const spot = { Sofa: 'seating', 'Office Chair': 'seating', Shelf: 'shop', Bookshelf: 'shop', 'Table Lamp': 'lighting', Toilet: 'bathroom', Fridge: 'kitchen', 'Single Bed': 'bedroom', Palm: 'plants', Television: 'tech', 'Smoke Detector': 'safety', 'Coffee Table': 'tables', Piano: 'fun', 'Tesla Model Y': 'outdoor' };
for (const [name, want] of Object.entries(spot)) {
  const it = items.find((i) => i.name === name);
  if (it && groupOf(it) !== want) bad('an item is in the group people expect', `${name}: ${groupOf(it)} (wanted ${want})`);
}
const withFeatured = groupItems(items);
if (withFeatured[0].id !== 'popular' || withFeatured[0].items.length < 8 || withFeatured[0].items.length > 24) bad('a short "Popular for shops" list comes first', String(withFeatured[0].items.length));
if (FURNITURE_GROUPS.length < 8) bad('there are enough groups', '');
console.log(`${items.length} items in ${groups.length} groups: ${groups.map((g) => `${g.label} ${g.items.length}`).join(', ')}`);
console.log(total() === 0 ? 'ALL OK' : `${total()} problems`);
if (total()) process.exitCode = 1;
