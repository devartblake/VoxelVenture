// Where every shipped asset comes from, under which licence, and the budget its files must keep: the admission register of
// docs/operations/asset_admission.md. tests/asset-admission.test.mjs checks it against the files themselves: every file under
// apps/web/public/ must belong to exactly one source here (by `files`), be what its extension says, and stay within its class's budget,
// and every outside source must have an allowed licence, a stored copy of that licence, provenance and an entry in both credits lists.
//
// Adding an outside asset? Add (or extend) its source here, store its licence and evidence under docs/licences/, credit it in
// lib/content/credits.js and CREDITS.md, then run `node tests/run.mjs asset-admission`. A new source may not have `gaps`: those record
// what was missing for the assets admitted before this process existed (2026-10-21), so that nothing in this file is guessed.

// The licences an asset may be admitted under, by the kinds of asset each one may cover. `credit` is how the credits lists name it.
// Anything else (GPL, AGPL, LGPL for assets, any NonCommercial, NoDerivatives or ShareAlike variant, "unknown", a custom licence) is
// refused; adding a licence to this list is a decision for the code owners (docs/operations/asset_admission.md, section 2).
const MEDIA = ['model', 'texture', 'image', 'icon', 'sound', 'music'];
export const ASSET_LICENSES = {
  'CC0-1.0': { credit: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: false, kinds: [...MEDIA, 'font', 'data', 'code'] },
  'CC-BY-4.0': { credit: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', attribution: true, kinds: [...MEDIA, 'data'] },
  'CC-BY-3.0': { credit: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/', attribution: true, kinds: [...MEDIA, 'data'] },
  // permissive software licences: code, and assets that ship inside a code repository under its licence (the Pascal editor's)
  MIT: { credit: 'MIT', url: 'https://opensource.org/license/mit', attribution: true, kinds: [...MEDIA, 'code'] },
  'BSD-2-Clause': { credit: 'BSD', url: 'https://opensource.org/license/bsd-2-clause', attribution: true, kinds: [...MEDIA, 'code'] },
  'BSD-3-Clause': { credit: 'BSD', url: 'https://opensource.org/license/bsd-3-clause', attribution: true, kinds: [...MEDIA, 'code'] },
  'Apache-2.0': { credit: 'Apache 2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0', attribution: true, kinds: [...MEDIA, 'code'] },
  ISC: { credit: 'ISC', url: 'https://opensource.org/license/isc-license-txt', attribution: true, kinds: ['code'] },
  'OFL-1.1': { credit: 'OFL 1.1', url: 'https://openfontlicense.org', attribution: true, kinds: ['font'] },
  // map data only: the street maps and street names drawn from OpenStreetMap (attribution required, the database stays ODbL)
  'ODbL-1.0': { credit: 'ODbL 1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: true, kinds: ['data'] },
  // made for VoxelVenture (by the team, a script in this repository, or supplied by the owner): not a third-party asset
  'LicenseRef-VoxelVenture': { credit: null, url: null, attribution: false, kinds: [...MEDIA, 'data', 'code'], own: true },
};

// Refused outright, with this reason, even if someone adds the identifier above by mistake.
export const REFUSED_LICENSES = [
  [/AGPL/i, 'AGPL: network copyleft would oblige publishing the whole service (Tiny World Builder is AGPL-3.0: reference only)'],
  [/(^|[^L])GPL/i, 'GPL: copyleft is incompatible with the closed commercial product'],
  [/LGPL/i, 'LGPL: not for assets or copied code (an unmodified npm package is handled by the dependency check)'],
  [/(^|-)NC(-|$)|NonCommercial/i, 'NonCommercial: VoxelVenture is a commercial product'],
  [/(^|-)ND(-|$)|NoDerivatives/i, 'NoDerivatives: assets are scaled, recoloured, re-encoded and combined'],
  [/(^|-)SA(-|$)|ShareAlike/i, 'ShareAlike: would bind the derived scenes to the same licence (needs an explicit decision)'],
  [/^(unknown|none|NOASSERTION|UNLICENSED|proprietary|)$/i, 'no identified licence: an asset with an unknown licence is never admitted'],
];

// Budgets by class of file: the formats it may be in (checked against the file's bytes, not only its name), and its largest size,
// triangles (a .glb's meshes) and texture edge (an image, or the textures embedded in a .glb). They follow the performance policy's
// tiers (docs/architecture/performance_policy.md, section 5): a scene on the low tier has 1.0 M triangles for everything, so a model
// that is placed hundreds of times (a building, a tree, a car) gets a few thousand, and an interior prop, seen a few at a time, more.
const KB = 1024;
const MB = 1024 * KB;
export const ASSET_BUDGETS = {
  building: { formats: ['glb'], maxBytes: 512 * KB, maxTriangles: 6000, maxTexture: 1024, about: 'a city building (placed hundreds of times)' },
  prop: { formats: ['glb'], maxBytes: 256 * KB, maxTriangles: 3000, maxTexture: 1024, about: 'a tree, car, boat, pier or park piece (placed many times)' },
  avatar: { formats: ['glb'], maxBytes: 256 * KB, maxTriangles: 5000, maxTexture: 1024, about: 'the player character (one per visible player)' },
  voxel: { formats: ['vox'], maxBytes: 256 * KB, about: 'a MagicaVoxel model' },
  'kit-texture': { formats: ['png'], maxBytes: 64 * KB, maxTexture: 1024, about: 'a model kit\'s shared colour map' },
  'interior-prop': { formats: ['glb'], maxBytes: 1 * MB, maxTriangles: 25000, maxTexture: 2048, about: 'a piece of furniture or fitting inside a building' },
  thumbnail: { formats: ['webp'], maxBytes: 64 * KB, maxTexture: 1024, about: 'a catalogue thumbnail' },
  'floor-plan': { formats: ['svg'], maxBytes: 16 * KB, about: 'a prop\'s floor-plan symbol' },
  material: { formats: ['jpg', 'png', 'webp', 'ktx2'], maxBytes: 512 * KB, maxTexture: 1024, about: 'a surface material map' },
  environment: { formats: ['hdr'], maxBytes: 2 * MB, maxTexture: 1024, about: 'an environment light map' },
  icon: { formats: ['webp', 'svg', 'png'], maxBytes: 160 * KB, maxTexture: 1280, about: 'an interface icon' },
  sound: { formats: ['mp3', 'ogg'], maxBytes: 128 * KB, about: 'a short interface sound' },
  music: { formats: ['mp3', 'ogg', 'wav'], maxBytes: 10 * MB, about: 'a recorded music track (downloaded on demand)' },
  map: { formats: ['svg'], maxBytes: 256 * KB, about: 'a reference street map' },
  brand: { formats: ['png', 'svg'], maxBytes: 2 * MB, maxTexture: 2048, about: 'a logo master or export' },
  metadata: { formats: ['json', 'text'], maxBytes: 512 * KB, about: 'a manifest, credits note or README beside the assets' },
  font: { formats: ['woff2', 'woff'], maxBytes: 256 * KB, about: 'a web font' },
};

// Files allowed past their class's rule, each with the reason. Keep this list short; a new asset gets no exception without a code
// owner's approval in its pull request.
export const ASSET_EXCEPTIONS = {
  'apps/web/public/audio/music/sideways-city.wav': {
    allow: { maxBytes: 40 * MB },
    reason: 'Uncompressed WAV as released (39.7 MB). Downloaded only when the city-overview playlist picks it; re-encode to OGG or MP3 to bring it within 10 MB.',
  },
  'apps/web/public/audios/sfx/grid_snap.mamd': {
    allow: { format: 'aiff' },
    reason: 'An AIFF file (a Logic Pro export) with a non-standard extension, copied with the Pascal editor\'s sounds. Nothing requests it (the editor plays grid_snap_0, _1 and _2.mp3), so it can be deleted.',
  },
};

// Interior prop ids that have been retired, each with the id that now stands in for it. A saved interior that names a retired id
// still loads (docs/operations/asset_admission.md, section 9): the replacement must be in the props manifest.
export const RETIRED_ASSETS = {};

// Pascal catalogue items the API accepts that have no files here: the editor loads them from the catalogue's own address (Pascal's
// storage, byrpxoiotywskoojsrzd.supabase.co), so they are not in the props manifest and their files are not checked against the budgets.
// A new id appearing here (after a Pascal update) fails the admission check until it is either copied in (npm run props:manifest) or
// added to this list by a code owner.
export const REMOTE_CATALOG_ITEMS = {
  reason: 'Loaded at run time from the Pascal catalogue’s storage; copy them into apps/web/public/items/ (with a review) to serve them from our own storage.',
  ids: ['dining-table-mo9ms5yh', 'cabinet', 'my-leather-couch-modp80ha', 'ikea-kallax-1x4-moa2y49n', 'herman-miller-aeron-mo8x36k9', 'standing-desk-mo8wgz95', 'power-outlet-moa09g0o', 'wooden-kitchen-bar-moa2hhh4', '1967-chevrolet-camaro-moa24wsf', 'dishwasher-movn72ls', 'fireplace-movn1fnn'],
};

const ADMITTED_BEFORE = 'Admitted before the admission process (2026-10-21); review and approve it, then remove this gap.';

// One entry per source. `files`: repository paths (globs: * within a folder, ** across folders, {a,b} for either) with the budget
// class their files belong to; under apps/web/public/ every file must match exactly one of them. `credit`: the `by` of its entry in
// lib/content/credits.js. `licenseText`: the stored copy of the licence; `evidence`: the stored page or notice that shows the source
// released it under that licence. `obtained`: when it was downloaded (or, failing that, first committed, as `obtainedNote` says).
export const ASSET_SOURCES = [
  {
    id: 'kenney',
    kind: 'model',
    name: 'City Kit (Commercial), City Kit (Suburban), Nature Kit, Car Kit, Watercraft Kit, Pirate Kit and Coaster Kit',
    by: 'Kenney',
    url: 'https://www.kenney.nl',
    license: 'CC0-1.0',
    licenseText: 'docs/licences/texts/CC0-1.0.txt',
    evidence: null,
    version: null,
    obtained: '2026-10-16',
    obtainedNote: 'first committed (the repository\'s initial commit); the download date was not recorded',
    credit: 'Kenney',
    files: [
      { glob: 'apps/web/public/models/kenney/{commercial,suburban}/*.glb', budget: 'building' },
      { glob: 'apps/web/public/models/kenney/{nature,cars,watercraft,pirate,coaster}/*.glb', budget: 'prop' },
      { glob: 'apps/web/public/models/kenney/*/Textures/colormap.png', budget: 'kit-texture' },
    ],
    gaps: {
      evidence: 'No copy of the kits\' own licence file (License.txt) or download pages was kept. Download the kits again from kenney.nl and store their License.txt under docs/licences/kenney/.',
      version: 'The kit versions were not recorded.',
      approvedBy: ADMITTED_BEFORE,
    },
  },
  {
    id: 'pascal-editor',
    kind: 'model',
    name: 'Interior items, materials, editor icons, sounds, environment map and cursor',
    by: 'Pascal Editor (Pascal Group Inc.)',
    url: 'https://github.com/pascalorg/editor',
    license: 'MIT',
    licenseText: 'docs/licences/pascal-editor/LICENSE',
    evidence: 'docs/licences/pascal-editor/README.md',
    version: '@pascal-app/editor 1.0.3 (files copied); catalogue 1.0.4',
    obtained: '2026-10-16',
    obtainedNote: 'first committed (the repository\'s initial commit), copied from the upstream repository\'s public/ folder',
    credit: 'Pascal Editor (Pascal Group Inc.)',
    files: [
      { glob: 'apps/web/public/items/*/model.glb', budget: 'interior-prop' },
      { glob: 'apps/web/public/items/*/thumbnail.webp', budget: 'thumbnail' },
      { glob: 'apps/web/public/items/*/floor-plan.svg', budget: 'floor-plan' },
      { glob: 'apps/web/public/items/piano/Fireplace_13.glb', budget: 'interior-prop' },
      { glob: 'apps/web/public/material/**', budget: 'material' },
      { glob: 'apps/web/public/icons/**.{webp,svg}', budget: 'icon' },
      { glob: 'apps/web/public/icons/fittings/README.md', budget: 'metadata' },
      { glob: 'apps/web/public/audios/sfx/*', budget: 'sound' },
      { glob: 'apps/web/public/hdri/*.hdr', budget: 'environment' },
      { glob: 'apps/web/public/cursor.svg', budget: 'icon' },
    ],
    gaps: {
      approvedBy: `${ADMITTED_BEFORE} The props manifest's commercialUseApproved, reviewedBy and reviewedAt are null for every prop.`,
    },
    // what the repository does not say about these files: reported by the test, not a failure
    notes: [
      'hdri/venice_sunset_1k.hdr: copied from the Pascal repository; its original author and licence (the name suggests Poly Haven\'s "Venice Sunset") are not recorded.',
      'audios/sfx/*: copied from the Pascal repository; who made the sounds is not recorded.',
      'items/piano/Fireplace_13.glb and items/*/floor-plan.svg: copied with the props but not used (scripts/props/catalog.mjs).',
      'icons/fittings/*: generated by Pascal upstream with an image-generation tool (icons/fittings/README.md).',
    ],
  },
  {
    id: 'pascal-editor-code',
    kind: 'code',
    name: 'Shared TypeScript configuration and elevation styles',
    by: 'Pascal Editor (Pascal Group Inc.)',
    url: 'https://github.com/pascalorg/editor',
    license: 'MIT',
    licenseText: 'docs/licences/pascal-editor/LICENSE',
    evidence: 'docs/licences/pascal-editor/README.md',
    version: '@pascal-app/editor 1.0.3',
    obtained: '2026-10-16',
    obtainedNote: 'first committed (the repository\'s initial commit)',
    credit: 'Pascal Editor (Pascal Group Inc.)',
    files: [
      { glob: 'vendor/typescript-config/*', budget: null },
      { glob: 'styles/elevation.css', budget: null },
    ],
    gaps: { approvedBy: ADMITTED_BEFORE },
  },
  {
    id: 'recorded-music',
    kind: 'music',
    name: 'Recorded music (eight releases, one entry each in the music manifest)',
    by: 'OpenGameArt creators (see the music manifest)',
    url: 'https://opengameart.org',
    license: 'CC0-1.0',
    licenseText: 'docs/licences/music/cc0-1.0.txt',
    evidence: 'docs/licences/music/README.md',
    version: 'per release: apps/web/public/audio/music/manifest.json (download address and SHA-256)',
    obtained: '2026-10-16',
    obtainedNote: 'downloaded',
    credit: null, // one credit per release, checked from the manifest
    manifest: 'apps/web/public/audio/music/manifest.json',
    approvedBy: 'the owner (the addition was explicitly requested; docs/licences/music/README.md)',
    files: [
      { glob: 'apps/web/public/audio/music/**.{mp3,ogg,wav}', budget: 'music' },
      { glob: 'apps/web/public/audio/music/manifest.json', budget: 'metadata' },
    ],
  },
  {
    id: 'openstreetmap',
    kind: 'data',
    name: 'Reference street maps of Midtown Manhattan, Market Street and downtown Washington',
    by: 'OpenStreetMap contributors',
    url: 'https://www.openstreetmap.org/copyright',
    license: 'ODbL-1.0',
    licenseText: null,
    evidence: 'apps/web/public/reference/nyc.svg',
    version: 'roads fetched through the Overpass API',
    obtained: '2026-10-12',
    obtainedNote: 'fetched (the date each map states)',
    credit: 'OpenStreetMap contributors',
    files: [{ glob: 'apps/web/public/reference/{nyc,sf,dc}.svg', budget: 'map' }],
    gaps: {
      licenseText: 'The ODbL 1.0 text is not stored. Save it from opendatacommons.org as docs/licences/texts/ODbL-1.0.txt.',
      approvedBy: ADMITTED_BEFORE,
    },
  },
  {
    id: 'voxelventure',
    kind: 'model',
    name: 'Made for VoxelVenture: voxel landmarks, animals and buildings, the sample avatar, the logos, the city\'s own reference map and the manifests',
    by: 'VoxelVenture',
    license: 'LicenseRef-VoxelVenture',
    credit: 'VoxelVenture',
    files: [
      { glob: 'apps/web/public/models/vox/**.vox', budget: 'voxel' },
      { glob: 'apps/web/public/models/avatar/player.glb', budget: 'avatar' },
      { glob: 'apps/web/public/models/CREDITS.md', budget: 'metadata' },
      { glob: 'apps/web/public/brand/*', budget: 'brand' },
      { glob: 'apps/web/public/reference/voxelventure.svg', budget: 'map' },
      { glob: 'apps/web/public/props/manifest.json', budget: 'metadata' },
    ],
    notes: [
      'brand/*: supplied by the owner on 2026-10-18 as generated artwork; the generation tool and the ownership record are still to be written down (docs/brand/README.md).',
    ],
  },
];
