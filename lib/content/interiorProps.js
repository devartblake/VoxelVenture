import { KIT_PROPS } from './catalogCuration';
import { PROP_KEYS } from './interiorPropKeys';

// Where the interior props (Pascal's furniture, doors and windows) load from, by catalogue id. One place for the viewer and the editor:
// pascalBootstrap.js rewrites Pascal's catalogue with it, and interiorScenes.js its own door and window.
//   - NEXT_PUBLIC_PROPS_BASE_URL set (the object-storage bucket's public address, fixed into the build): the model and the thumbnail come
//     from there, by the content-addressed keys in the manifest (apps/web/public/props/manifest.json, scripts/props/build-manifest.mjs), so
//     a changed file has a new address and is never served stale from a cache.
//   - unset (development, the tests, and a site whose bucket is not ready): the copies in apps/web/public/items/<id>/ on the site itself.
// Every catalogue item the pages offer has a local copy: lib/content/catalogCuration.js drops the rest (Pascal's own storage is never used).
// A prop that is not in the manifest keeps the address it was given, with one warning.
//
// The model's address is made absolute: Pascal sends a relative one to its own CDN (resolveCdnUrl in @pascal-app/viewer). The thumbnail stays
// relative on the site itself, which both an <img> and next/image take as it is.

export const PROPS_BASE_URL = (process.env.NEXT_PUBLIC_PROPS_BASE_URL ?? '').trim().replace(/\/+$/, '');
const here = () => (typeof window !== 'undefined' && window.location ? window.location.origin : '');

// Whether we serve files for this id: a prop of the props manifest, or an item whose model is one of the city's (KIT_PROPS).
export const hasPropFiles = (id) => typeof id === 'string' && (Object.hasOwn(PROP_KEYS, id) || Object.hasOwn(KIT_PROPS, id));

// The model and thumbnail addresses for a prop id, or null when the manifest has no such prop. A KIT_PROPS item always comes from the site
// itself (its model is a city model, which the site serves; it is not in the bucket).
export function propUrls(id, { base = PROPS_BASE_URL, origin = here() } = {}) {
  if (typeof id === 'string' && Object.hasOwn(KIT_PROPS, id)) return { src: `${origin}${KIT_PROPS[id].model}`, thumbnail: KIT_PROPS[id].thumbnail };
  const keys = Object.hasOwn(PROP_KEYS, id) ? PROP_KEYS[id] : null;
  if (!keys) return null;
  const [model, thumbnail] = keys;
  base = (base ?? '').replace(/\/+$/, '');
  if (base) return { src: `${base}/${model}`, thumbnail: thumbnail ? `${base}/${thumbnail}` : null };
  return { src: `${origin}/items/${id}/model.glb`, thumbnail: thumbnail ? `/items/${id}/thumbnail.webp` : null };
}

// An asset (a catalogue entry, or a node's `asset`) with its addresses resolved by id; the same object when its id is not in the manifest.
export function resolvePropAsset(asset, options) {
  const urls = asset?.id ? propUrls(asset.id, options) : null;
  if (!urls) return asset;
  return { ...asset, src: urls.src, thumbnail: urls.thumbnail ?? asset.thumbnail };
}

const warned = new Set();
// Rewrites a list of catalogue entries in place (Pascal's CATALOG_ITEMS: the editor's menu, placing an item and the generated rooms all
// read it). Safe to run again (by id, not from the current address). Returns the ids it left alone.
export function applyPropUrls(items, options) {
  const missing = [];
  for (const item of items) {
    const resolved = resolvePropAsset(item, options);
    if (resolved === item) missing.push(item.id);
    else Object.assign(item, { src: resolved.src, thumbnail: resolved.thumbnail });
  }
  const fresh = missing.filter((id) => !warned.has(id));
  if (fresh.length && options?.warn !== false) {
    fresh.forEach((id) => warned.add(id));
    console.warn(`[props] not in the props manifest, so loaded from the catalogue's own address: ${fresh.join(', ')}`);
  }
  return missing;
}
