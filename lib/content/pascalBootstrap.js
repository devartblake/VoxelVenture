import { nodeRegistry, registerNode } from '@pascal-app/core';
import { CATALOG_ITEMS } from '@pascal-app/editor/catalog';
import { builtinPlugin } from '@pascal-app/nodes';
import { preconnect } from 'react-dom';
import { curateCatalog } from './catalogCuration';
import { PROPS_BASE_URL, applyPropUrls, hasPropFiles } from './interiorProps';

// Register the built-in node kinds before the first <Editor>/<Viewer> renders.
// The has() check keeps this idempotent under HMR, when the module runs again (registerNode throws on duplicates).
for (const def of builtinPlugin.nodes ?? []) {
  if (!nodeRegistry.has(def.kind)) registerNode(def);
}

// The furniture's models and thumbnails load from object storage, or the site's own /items, by id (lib/content/interiorProps.js). Rewriting
// Pascal's catalogue here covers the editor's menu, placing an item and the generated rooms at once. Each model is still fetched only when an
// item that uses it is shown (Pascal's item renderer loads it then, behind a placeholder box); the bucket's connection is opened early.
// First the catalogue is curated (lib/content/catalogCuration.js): retired and renamed items, no floor-plan pictures from Pascal's storage,
// and nothing without a local copy, so no address on Pascal's own storage is ever requested.
curateCatalog(CATALOG_ITEMS, { keep: hasPropFiles });
applyPropUrls(CATALOG_ITEMS, { warn: typeof window !== 'undefined' });
if (PROPS_BASE_URL && typeof document !== 'undefined') preconnect(PROPS_BASE_URL, { crossOrigin: 'anonymous' });
