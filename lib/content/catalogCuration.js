// What VoxelVenture changes in Pascal's furniture catalogue (CATALOG_ITEMS in @pascal-app/editor/catalog) before anything reads it: the
// editor's menu, placing an item, the generated rooms, the API's list of accepted ids (scripts/interior-asset-ids.mjs) and the props
// manifest (scripts/props/build-manifest.mjs) all see the same curated catalogue. On its own (no imports), so plain Node can read it.
//
//   - RETIRED_ASSETS: catalogue ids we no longer offer, each with the id that now stands in for it (`to`), or `to: null` when nothing does.
//     The 11 items Pascal served only from its own storage (a Supabase bucket we do not control, with no licence or budget check, several
//     under a brand name) are retired here, and so are "tesla" and "electric-car" (a branded car, replaced). A saved design that names a
//     retired id still loads: the API rewrites it to its replacement or leaves the item out (lib/content/interiorDesign.js), and so does the
//     client when it fills in the assets (withCatalogAssets in lib/content/interiorScenes.js). docs/operations/asset_admission.md, section 9.
//   - CATALOG_REPLACEMENTS: catalogue entries whose model we do not use, replaced in place (same menu position) by an entry of our own
//     whose model is one of the models the city already ships (KIT_PROPS).
//   - KIT_PROPS: interior items whose model is a city model in apps/web/public/models/ (a Kenney kit, CC0), served by the site itself rather
//     than from the props bucket (lib/content/interiorProps.js), with a thumbnail in apps/web/public/props/thumbnails/.
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
  // a branded car (its shape too, not only its name): the Kenney Car Kit's SUV stands in
  tesla: { to: 'car', why: 'a branded car model; the Kenney Car Kit SUV stands in' },
  'electric-car': { to: 'car', why: 'the same branded model under a neutral name (never released); the Kenney Car Kit SUV stands in' },
};

// Interior items whose model is one the city ships (served from the site itself, not the props bucket). `scale` turns the kit's units
// into metres (the SUV, 1.5 x 1.4 x 2.55 in the kit, becomes a 4.1 m car); `offset` stands it on the floor, centred.
export const KIT_PROPS = {
  car: { model: '/models/kenney/cars/suv.glb', thumbnail: '/props/thumbnails/car.webp', kit: 'Kenney Car Kit (suv)' },
};

export const CATALOG_REPLACEMENTS = {
  tesla: {
    id: 'car',
    name: 'Car',
    tags: ['car', 'vehicle', 'automobile', 'suv', 'transportation', 'parking', 'outdoor'],
    src: KIT_PROPS.car.model,
    thumbnail: KIT_PROPS.car.thumbnail,
    dimensions: [2.4, 2.24, 4.08],
    offset: [0, 0.48, -0.12],
    rotation: [0, 0, 0],
    scale: [1.6, 1.6, 1.6],
  },
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
    let item = items[i];
    if (item && Object.hasOwn(CATALOG_REPLACEMENTS, item.id)) {
      const { category } = item;
      item = { category, ...CATALOG_REPLACEMENTS[item.id], tags: [...CATALOG_REPLACEMENTS[item.id].tags] };
      items[i] = item;
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
