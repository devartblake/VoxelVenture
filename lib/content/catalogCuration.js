// What VoxelVenture changes in Pascal's furniture catalogue (CATALOG_ITEMS in @pascal-app/editor/catalog) before anything reads it: the
// editor's menu, placing an item, the generated rooms, the API's list of accepted ids (scripts/interior-asset-ids.mjs) and the props
// manifest (scripts/props/build-manifest.mjs) all see the same curated catalogue. On its own (no imports), so plain Node can read it.
//
//   - RETIRED_ASSETS: catalogue ids we no longer offer, each with the id that now stands in for it (`to`), or `to: null` when nothing does.
//     The 11 items Pascal served only from its own storage (a Supabase bucket we do not control, with no licence
//     or budget check, several under a brand name) are retired here, and so is "tesla" (renamed). A saved design that names a retired id
//     still loads: the API rewrites it to its replacement or leaves the item out (lib/content/interiorDesign.js), and so does the client
//     when it fills in the assets (withCatalogAssets in lib/content/interiorScenes.js). docs/operations/asset_admission.md, section 9.
//   - CATALOG_RENAMES: catalogue items we keep (their files are ours, in apps/web/public/items/) under a new id and name, because the
//     catalogue's names a brand. The folder in apps/web/public/items/ has the new id.
//   - every entry loses floorPlanUrl: Pascal's floor-plan pictures are on its own storage too (the 2D plan draws the footprint without one).
//
// Never ship a brand name in an id, a label or a file name (tests/asset-admission.test.mjs keeps a list of brand words).

export const RETIRED_ASSETS = {
  // loaded at run time from Pascal's storage: replaced by the nearest prop we ship ourselves, or removed
  'dining-table-mo9ms5yh': { to: 'dining-table', why: 'remote copy of a dining table; our own dining table stands in' },
  cabinet: { to: 'kitchen-cabinet', why: 'remote copy of the kitchen cabinet (the same model, from Pascal\'s storage)' },
  'my-leather-couch-modp80ha': { to: 'sofa', why: 'remote user upload; our own sofa stands in' },
  'ikea-kallax-1x4-moa2y49n': { to: 'bookshelf', why: 'remote, and named after a brand; our own bookshelf stands in' },
  'herman-miller-aeron-mo8x36k9': { to: 'office-chair', why: 'remote, and named after a brand; our own office chair stands in' },
  'standing-desk-mo8wgz95': { to: 'office-table', why: 'remote; our own office table stands in' },
  'wooden-kitchen-bar-moa2hhh4': { to: 'kitchen-counter', why: 'remote; our own kitchen counter stands in' },
  'power-outlet-moa09g0o': { to: null, why: 'remote; we ship no power outlet, so it is removed' },
  '1967-chevrolet-camaro-moa24wsf': { to: null, why: 'remote, and a branded car; we ship no classic car, so it is removed' },
  'dishwasher-movn72ls': { to: null, why: 'remote user upload; we ship no dishwasher, so it is removed' },
  'fireplace-movn1fnn': { to: null, why: 'remote user upload; the catalogue has no other fireplace, so it is removed' },
  // our own files, renamed (CATALOG_RENAMES)
  tesla: { to: 'electric-car', why: 'named after a brand; the same model, renamed' },
};

export const CATALOG_RENAMES = {
  tesla: { id: 'electric-car', name: 'Electric Car', dropTags: ['tesla'] },
};

// The id a saved design's item stands for now: itself, its replacement, or null when it was removed. Follows a chain of retirements.
export function currentAssetId(id) {
  let seen = 0;
  while (typeof id === 'string' && Object.hasOwn(RETIRED_ASSETS, id) && seen++ < 8) id = RETIRED_ASSETS[id].to;
  return id ?? null;
}

const curated = new WeakSet();
// Curates a catalogue array in place (Pascal's CATALOG_ITEMS is one array every part of the editor reads) and returns it. Safe to run
// again (HMR, or the bootstrap and the scene builder both running it). `keep(id)`, when given, also drops any entry it returns false for:
// the pages pass "has local files", so an item a Pascal update adds on its own storage never reaches the menu.
export function curateCatalog(items, { keep } = {}) {
  if (!Array.isArray(items)) return items;
  if (curated.has(items) && !keep) return items;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const rename = Object.hasOwn(CATALOG_RENAMES, item?.id) ? CATALOG_RENAMES[item.id] : null;
    if (rename) {
      item.id = rename.id;
      item.name = rename.name;
      item.renamedFrom = true; // the props manifest then records no upstream path (it carries the old name)
      if (Array.isArray(item.tags)) item.tags = item.tags.filter((t) => !rename.dropTags.includes(t));
    }
    if (!item || Object.hasOwn(RETIRED_ASSETS, item.id) || (keep && !keep(item.id))) {
      items.splice(i, 1);
      continue;
    }
    delete item.floorPlanUrl;
  }
  curated.add(items);
  return items;
}
