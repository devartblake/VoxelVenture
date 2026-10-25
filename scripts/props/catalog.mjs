// The interior props on disk and in Pascal's furniture catalogue, read in plain Node (shared by build-manifest.mjs, upload.mjs and the tests).
//   - the prop folders: apps/web/public/items/<id>/ with model.glb and (for most) thumbnail.webp, copied from Pascal's editor (CREDITS.md)
//   - the catalogue: CATALOG_ITEMS from @pascal-app/editor/catalog. It ships as a .tsx file, so its array is read as text and evaluated as
//     a plain JavaScript literal (it is data only: strings, numbers, arrays and objects), then curated as the pages curate it
//     (lib/content/catalogCuration.js: retired items out, renamed ones under their new id, no floor-plan addresses).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imp } from '../lib-loader.mjs';

const { curateCatalog, KIT_PROPS } = await imp('content/catalogCuration.js');
export { KIT_PROPS }; // catalogue items whose model is a city model (served by the site, not a prop folder)

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ITEMS_DIR = path.join(root, 'apps', 'web', 'public', 'items');
export const MANIFEST_FILE = path.join(root, 'apps', 'web', 'public', 'props', 'manifest.json');
export const KEYS_FILE = path.join(root, 'lib', 'content', 'interiorPropKeys.js');
export const CATALOG_FILE = path.join(root, 'node_modules', '@pascal-app', 'editor', 'src', 'components', 'ui', 'item-catalog', 'catalog-items.tsx');

// The two files a prop has, by their name in its folder.
export const PROP_FILES = {
  model: { file: 'model.glb', contentType: 'model/gltf-binary', required: true },
  thumbnail: { file: 'thumbnail.webp', contentType: 'image/webp', required: false },
};

export function readCatalog(file = CATALOG_FILE, { raw = false } = {}) {
  const src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf('[', src.indexOf('export const CATALOG_ITEMS'));
  const close = start < 0 ? null : /\r?\n\]\r?\n/.exec(src.slice(start));
  if (start < 0 || !close) throw new Error(`Cannot find CATALOG_ITEMS in ${file}: its format may have changed.`);
  const items = new Function(`return ${src.slice(start, start + close.index)}\n]`)();
  if (!Array.isArray(items) || items.length < 90) throw new Error(`Only ${items?.length} items read from ${file}: its format may have changed.`);
  return raw ? items : curateCatalog(items);
}

export const editorVersion = () => JSON.parse(fs.readFileSync(path.join(root, 'node_modules', '@pascal-app', 'editor', 'package.json'), 'utf8'));

// The prop folders that have a model, sorted by id.
export const propFolders = (dir = ITEMS_DIR) =>
  fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, PROP_FILES.model.file))).map((e) => e.name).sort();
