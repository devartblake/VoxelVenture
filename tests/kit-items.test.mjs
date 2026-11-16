// The Food Kit and City Kit (Industrial) items in the interior catalogue (lib/content/kitItems.js, docs/product/kit_items.md): real sizes, real files, in the right menus, nothing clashing with Pascal's items.
import fs from 'node:fs';
import path from 'node:path';
import { imp, root } from '../scripts/lib-loader.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const { KIT_ITEMS } = await imp('content/kitItems.js');
const { curateCatalog, KIT_PROPS, KIT_GROUP } = await imp('content/catalogCuration.js');
const { kitFor, menuFor } = await imp('content/businessFixtures.js');
const { groupOf } = await imp('content/furnitureGroups.js');
const { CATALOG_ITEM_IDS } = await imp('content/interiorAssetIds.js');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/public/props/manifest.json'), 'utf8')).props;
const pub = (f) => path.join(root, 'apps/web/public', f);

check('there are 60 to 80 kit items, from both kits, in three groups', KIT_ITEMS.length >= 60 && KIT_ITEMS.length <= 80 && new Set(KIT_ITEMS.map((i) => i.kit)).size === 2 && new Set(KIT_ITEMS.map((i) => i.group)).size === 3, String(KIT_ITEMS.length));
check('every id is unique and none is one of Pascal\'s props', new Set(KIT_ITEMS.map((i) => i.id)).size === KIT_ITEMS.length && KIT_ITEMS.every((i) => !manifest[i.id]));
check('every item has its model, its kit\'s colour map and a thumbnail, shipped', KIT_ITEMS.every((i) => fs.existsSync(pub(`models/kenney/${i.file}`)) && fs.existsSync(pub(`models/kenney/${i.file.split('/')[0]}/Textures/colormap.png`)) && fs.existsSync(pub(`props/thumbnails/${i.id}.webp`))));
const dish = KIT_ITEMS.filter((i) => i.group === 'food' || i.group === 'produce');
check('food is real size: nothing on a plate is over 0.6 m, nothing is under 3 cm', dish.every((i) => Math.max(...i.dimensions) <= 0.6 && Math.max(...i.dimensions) >= 0.03), dish.filter((i) => Math.max(...i.dimensions) > 0.6).map((i) => i.id).join());
check('a shipping container is 6 m long, a storage tank bigger than a person', Math.abs(Math.max(...KIT_ITEMS.find((i) => i.id === 'shipping-container-a').dimensions) - 6.1) < 0.1 && Math.max(...KIT_ITEMS.find((i) => i.id === 'detail-tank').dimensions) > 1.5);
check('placement follows the catalogue\'s rule: the offset lifts the lowest point to the floor (never below, never more than the model\'s own base)', KIT_ITEMS.every((i) => i.offset[1] >= -0.02 && i.offset[1] < i.dimensions[1] + 1e-6));
check('every group is one the menu knows, and the item is in it', KIT_ITEMS.every((i) => ['food', 'produce', 'storage'].includes(i.group) && KIT_GROUP[i.id] === i.group && groupOf({ id: i.id, name: i.name }) === i.group));
const cur = curateCatalog([{ id: 'sofa', category: 'furniture', name: 'Sofa', tags: [] }]);
check('curating the catalogue adds them once (a second curation adds nothing)', cur.filter((i) => KIT_PROPS[i.id] && i.id !== 'car').length === KIT_ITEMS.length && curateCatalog(cur, { keep: () => true }).length === cur.length);
check('the API accepts every one of them (the committed id list has them)', KIT_ITEMS.every((i) => CATALOG_ITEM_IDS.includes(i.id)));
check('every item is cheap: a model of 1400 triangles at the most, shipped file under 256 KB (the prop budget)', KIT_ITEMS.every((i) => i.tris === undefined || i.tris <= 1400) && KIT_ITEMS.every((i) => fs.statSync(pub(`models/kenney/${i.file}`)).size < 256 * 1024));

// the menus: a restaurant sees food first, a market stall produce, a shop storage, an office storage last
const { readCatalog } = await import('../scripts/props/catalog.mjs');
const items = readCatalog(); // Pascal's furniture, curated, with the kit items
const groupsOf = (type, variant) => menuFor(items, kitFor(type, variant)).map((g) => g.id);
const idx = (list, id) => (list.includes(id) ? list.indexOf(id) : 99);
const r = groupsOf('restaurant', 'diner'), c = groupsOf('restaurant', 'cafe'), m = groupsOf('shop', 'market'), s = groupsOf('shop', 'boutique'), o = groupsOf('office', 'openplan');
check('a restaurant\'s menu has food, near the top; a cafe leads with tables then food', idx(r, 'food') <= 3 && c.filter((g) => g !== 'essentials')[1] === 'food');
check('a market stall leads with produce; a shop has produce and storage; an office has storage but not produce first', m.filter((g) => g !== 'essentials')[0] === 'produce' && s.includes('produce') && s.includes('storage') && o.includes('storage') && idx(o, 'storage') > idx(o, 'tables'));
check('a restaurant\'s essentials include a plate, a burger and a drink', (() => { const e = menuFor(items, kitFor('restaurant', 'diner')).find((g) => g.id === 'essentials')?.items.map((i) => i.id) ?? []; return ['plate-dinner', 'burger', 'soda-can'].every((x) => e.includes(x)); })());

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
