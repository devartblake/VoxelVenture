// Writes lib/content/interiorAssetIds.js: the ids of every item in the Pascal furniture catalogue (CATALOG_ITEMS in
// @pascal-app/editor/catalog), so the API can check a saved interior's furniture without loading the catalogue. The catalogue is a TypeScript
// file only the bundler loads; here its types are stripped and it is read as plain data. Run it again after updating @pascal-app/editor:
//
//   node scripts/interior-asset-ids.mjs
//
// tests/interior-api.test.mjs fails while the committed list and the installed package disagree.
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { imp } from './lib-loader.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(root, 'lib', 'content', 'interiorAssetIds.js');

// The curated catalogue's ids (lib/content/catalogCuration.js: retired items out, renamed ones under their new id), in the package's order.
export async function catalogIdsFromPackage() {
  const { curateCatalog } = await imp('content/catalogCuration.js');
  const file = path.join(root, 'node_modules', '@pascal-app', 'editor', 'src', 'components', 'ui', 'item-catalog', 'catalog-items.tsx');
  const code = stripTypeScriptTypes(fs.readFileSync(file, 'utf8'));
  const { CATALOG_ITEMS } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  return curateCatalog(CATALOG_ITEMS.map((item) => ({ ...item }))).map((item) => item.id);
}

export const render = (ids) => `// The ids of the Pascal furniture catalogue (CATALOG_ITEMS in @pascal-app/editor/catalog) as curated by lib/content/catalogCuration.js,
// for code that cannot load the catalogue itself: the API checks a saved interior's furniture against them (lib/content/interiorDesign.js). Written by scripts/interior-asset-ids.mjs; do not edit.
export const CATALOG_ITEM_IDS = [
${ids.map((id) => `  '${id}',`).join('\n')}
];
`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ids = await catalogIdsFromPackage();
  fs.writeFileSync(OUT, render(ids));
  console.log(`${path.relative(root, OUT)}: ${ids.length} catalogue ids`);
}
