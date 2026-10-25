# Asset admission

[All documentation](../README.md) | [Operations](README.md) | [Credits](../../CREDITS.md) | [Licence evidence](../licences/README.md)

The rules for admitting anything VoxelVenture did not make before it is added to the repository: 3D models, textures and materials, sounds and music, images and icons, fonts, map data, and copied code. It is the asset admission process of the [adoption plan](../architecture/external_voxel_repositories_adoption_plan.md) (sections 9.4 and 15, and item 5 of section 18).

**The register** is [`lib/content/assetSources.js`](../../lib/content/assetSources.js): every source, its licence, provenance, approval and the budget classes of its files. **The check** is `npm run check:assets` ([`scripts/assets/admission.mjs`](../../scripts/assets/admission.mjs)), run by `npm test` as `tests/asset-admission.test.mjs`. A pull request that adds a file under `apps/web/public/` without registering it fails.

The world-expansion freeze still applies ([world_freeze.md](../roadmap/world_freeze.md)): new world content waits for the pilot, so admitting an asset does not by itself allow adding it to the city.

## 1. The checklist

Every item must be done before the asset is merged. **A** means the check enforces it; **M** means a person does it and ticks it in the pull request.

| # | Step | How | |
| :-: | --- | --- | :-: |
| 1 | The licence is identified and on the allow-list (section 2) | `license` in the register; the check refuses anything else | A |
| 2 | Provenance is recorded: source address, author, version or release, download date, and a stored copy of the licence and of the page it came from | Section 3; the check requires every field and that the stored files exist | A |
| 3 | It is credited in **both** `CREDITS.md` and the in-product credits (`lib/content/credits.js`) | Section 4; the check looks for the author and licence in both | A |
| 4 | The files are what they say and are safe to serve | Section 5; the check reads every file's signature, its size and SVG content. Scanning the download is manual | A + M |
| 5 | Within the geometry and texture budget of its class | Section 6; the check counts triangles and reads texture sizes | A |
| 6 | Visual-style review | Section 7.1 | M |
| 7 | Mobile check | Section 7.2 | M |
| 8 | Collision and placement validation | Section 7.3; partly by the existing model tests | A + M |
| 9 | Accessibility of the controls that use it | Section 7.4 | M |
| 10 | Approved by a code owner, recorded in the register | Section 8; `approvedBy` is required | A + M |

## 2. Licences

### Allowed

| Licence (SPDX id) | For | Conditions |
| --- | --- | --- |
| `CC0-1.0` | Any asset, data or code | None; credit is given anyway |
| `CC-BY-4.0`, `CC-BY-3.0` | Models, textures, images, icons, sounds, music, data | Attribution in both credits lists, with the author, title, source link and licence link |
| `MIT`, `BSD-2-Clause`, `BSD-3-Clause`, `Apache-2.0` | Code, and assets shipped inside a code repository under that licence (the Pascal editor's items) | Keep the copyright and licence notice: store the `LICENSE` file; Apache 2.0 also keeps any `NOTICE` file |
| `ISC` | Code | As MIT |
| `OFL-1.1` | Fonts | Keep the licence with the font; never sell the font on its own |
| `ODbL-1.0` | Map data only (OpenStreetMap) | "© OpenStreetMap contributors" on the map and in the credits; the database stays ODbL |

### Never

- **GPL and AGPL**, in any version, for assets or copied code. **Tiny World Builder is AGPL-3.0: reference only.** Study its behaviour and design, keep an independent implementation record, and copy no code or assets without an explicit licensing decision and legal review (adoption plan section 15).
- **NonCommercial (NC)** and **NoDerivatives (ND)** variants of any licence: VoxelVenture is commercial, and assets are scaled, recoloured, re-encoded and combined.
- **ShareAlike (SA)**, including CC BY-SA, unless the code owners decide otherwise for a named asset.
- **An unknown licence**: no licence file, "free to use" without terms, a licence only stated on a forum post or a third-party mirror, or a file found in another project without its own record. "It was in the Pascal repository" is how the current Pascal assets came in; it is not enough for a new one (section 10).
- LGPL for assets or copied code. An unmodified npm package under LGPL or MPL is handled by the dependency check below.

Adding a licence to the allow-list (`ASSET_LICENSES` in the register), such as a purchased asset-store licence, is a decision for the code owners in its own pull request, with the licence terms stored under `docs/licences/texts/`.

### npm packages

The check also reads `package-lock.json`: every package must be under `MIT`, `ISC`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `0BSD`, `Unlicense`, `BlueOak-1.0.0`, `CC0-1.0`, `CC-BY-4.0`, `Python-2.0` or `Zlib`, or, unmodified, under `MPL-2.0` (lightningcss and web-ifc) or `LGPL-3.0-or-later` (sharp's prebuilt libvips binaries, loaded as a separate library). GPL and AGPL packages fail, as does a package with no licence that is not explained in `DEPENDENCY_LICENSE_NOTES` (`scripts/assets/admission.mjs`).

## 3. Provenance

Record, in the asset's source entry in the register:

| Field | What |
| --- | --- |
| `id`, `kind`, `name` | A short id (also the folder name under `docs/licences/`), the kind (`model`, `texture`, `image`, `icon`, `sound`, `music`, `font`, `data`, `code`) and what it is |
| `by` | The author, exactly as the credits name them |
| `url` | The https page the asset was downloaded from (the creator's own page, not a mirror) |
| `license` | The SPDX identifier from section 2 |
| `licenseText` | The stored licence, in `docs/licences/<id>/` or the shared copy in `docs/licences/texts/` |
| `evidence` | The saved download page (HTML or PDF, on the day), or the licence file that came in the download |
| `version` | The release, version or upstream commit |
| `obtained` | The download date (`YYYY-MM-DD`) |
| `approvedBy` | The code owner who approved it, and when (section 8) |
| `files` | The paths it covers, each with its budget class (section 6) |

Also keep, where it applies: the download address and its SHA-256 (the music manifest does this for each release), and for an archive, how it was extracted (with path-containment checks) and what was left out. Write a `README.md` in `docs/licences/<id>/` with all of this and anything not known.

Music has its own manifest, `apps/web/public/audio/music/manifest.json`, with one entry per release; its saved pages are in `docs/licences/music/`. Interior props have theirs, `apps/web/public/props/manifest.json`, with each prop's provenance (generated by `npm run props:manifest`).

## 4. Attribution

Add the asset to **both**:

- `CREDITS.md`, under the section of its kind, with the author, title, link and licence;
- `lib/content/credits.js`, the in-game **Credits** panel (city guide, then *Credits & licences*), with `name`, `by` (the register's `credit`), `url`, `license` and `licenseUrl`.

`tests/credits.test.mjs` checks the two lists agree; the admission check checks every source is in both. A CC BY asset's credit needs the author, the title, the source link and the licence link, and says if the asset was modified.

## 5. File validation

- **Download from the creator's own page** over https. Extract archives into a new, empty folder, with path-containment checks; never run anything that came in the download (scripts, installers, `.blend` with auto-run scripts).
- **Scan the download** with an up-to-date malware scanner before it is copied into the repository (manual; note it in the pull request).
- **Only these formats ship:** `.glb` (models; textures embedded or beside the model in the same folder, never fetched from another site), `.vox`, `.png`, `.jpg`, `.webp`, `.ktx2`, `.hdr`, `.svg`, `.mp3`, `.ogg`, `.wav` (music only), `.woff2` and `.woff`. The check reads each file's signature and refuses a file whose bytes do not match its name (an `.exe` renamed `.png`) or that is not a recognised format.
- **SVG** must be plain drawing: no `<script>`, no event attributes (`onload=`), no `javascript:` links, no `<foreignObject>`, no `@import`, no references to other sites. The check refuses them.
- **No source files**: `.blend`, `.psd`, `.fbx`, `.aiff`, project files and archives stay out of `apps/web/public/`.
- **Size limits** are per class (section 6).

## 6. Geometry and texture budgets

The classes and limits are `ASSET_BUDGETS` in the register; the check enforces them on every file. They follow the [performance policy](../architecture/performance_policy.md)'s tiers (section 5): on the low tier the whole scene has 1.0 M triangles and 600 draw calls (medium 1.5 M and 900, high 3.0 M and 1,200), so a model placed hundreds of times gets a few thousand triangles, and an interior prop, seen a few at a time, more.

| Class | Formats | Size | Triangles | Texture edge |
| --- | --- | ---: | ---: | ---: |
| `building` (city buildings) | glb | 512 KB | 6,000 | 1024 px |
| `prop` (trees, cars, boats, piers, park pieces) | glb | 256 KB | 3,000 | 1024 px |
| `avatar` | glb | 256 KB | 5,000 | 1024 px |
| `voxel` | vox | 256 KB | | |
| `kit-texture` (a kit's shared colour map) | png | 64 KB | | 1024 px |
| `interior-prop` | glb | 1 MB | 25,000 | 2048 px |
| `thumbnail` | webp | 64 KB | | 1024 px |
| `floor-plan` | svg | 16 KB | | |
| `material` | jpg, png, webp, ktx2 | 512 KB | | 1024 px |
| `environment` | hdr | 2 MB | | 1024 px |
| `icon` | webp, svg, png | 160 KB | | 1280 px |
| `sound` (interface) | mp3, ogg | 128 KB | | |
| `music` | mp3, ogg, wav | 10 MB | | |
| `map` | svg | 256 KB | | |
| `brand` | png, svg | 2 MB | | 2048 px |
| `font` | woff2, woff | 256 KB | | |

Beyond the per-file limit, check what it adds to the scene: run `node scripts/perf-measure.mjs` (or `?diag=1`, then **Measure**) before and after, and stay within every tier's budget at every spot. A model placed many times should share its kit's texture (one draw call per material) and be instanced. A file allowed past its class's limit is listed in `ASSET_EXCEPTIONS` with the reason; that needs a code owner's approval.

## 7. Reviews done by a person

### 7.1 Visual style

- It fits the city: low-poly or voxel, flat or kit-coloured materials, the scale of the Kenney kits (a building about 1 unit wide), and the [brand palette](../brand/logo_usage_guide.md) where it carries brand colour.
- It reads at the default camera distance and at the zoomed-out level of detail, by day and at night.
- No third-party logos, trademarks or real brands on it, no text that needs translating, nothing that would fail moderation.

### 7.2 Mobile

- Open the scene that uses it with `?quality=low&diag=1` on a phone (or the emulated phone of `tests/browser-touch.test.mjs`): it loads, the frame time stays within the low tier's 33.3 ms p95, and the draw calls and triangles stay within budget.
- It is still selectable and readable on a small screen; nothing that matters depends on a texture only the high tier loads.

### 7.3 Collision and placement

- Its catalogue entry has the right dimensions, centre and floor (`y0` is 0 for a model that stands on the ground; `tests/kenney-models.test.mjs` checks the placed ones), and its scale matches what it stands for (a car the length of the box car, `tests/props.test.mjs`).
- An interior prop has its footprint, attachment (`attachTo`: wall, ceiling or floor) and offsets in the catalogue; place it in the furniture editor and check it does not sink through the floor or clip the walls, and that walking past it works (`tests/interior-walk.test.mjs`).
- It does not block a doorway, a road, a pier or the player's path.

### 7.4 Accessibility of related controls

- Any control that places, selects or plays it has a text label, works with the keyboard, and shows focus.
- Sound is never the only signal; music and effects follow the master volume and the music mute.
- Animation respects reduced motion; text on it meets 4.5:1 contrast.

## 8. Who approves

The code owners (`.github/CODEOWNERS`; today @devartblake) approve every pull request that touches `apps/web/public/`, `CREDITS.md`, `docs/licences/`, the register, the credits source or the check. With branch protection's "Require review from Code Owners" on (task 44), it cannot merge without them. The approver writes their name and the date in the source's `approvedBy` (for example `'@devartblake, 2026-10-21'`).

## 9. Retiring or replacing an asset

Saved interiors and the props manifest name assets by id, so an id must keep resolving after its asset changes.

- **Replacing the file but keeping the id** (a lighter model, a fixed texture): replace it, run `npm run props:manifest` (a changed file gets a new content-addressed key; old keys stay in object storage) and the admission check, and update the register's provenance if the source changed.
- **Retiring an id:** add it to `RETIRED_ASSETS` (kept with the catalogue's curation in [`lib/content/catalogCuration.js`](../../lib/content/catalogCuration.js) and re-exported by the register) as `{ to, why }`: `to` is the id that stands in for it, or `null` when nothing does. The curation then takes it out of the editor's menu, the generated rooms and the API's list of ids (`node scripts/interior-asset-ids.mjs`, `npm run props:manifest`); a saved design that names it still loads, because the API stores the replacement (or leaves the item, and anything resting on it, out) and the client does the same when it fills in the assets. Then remove the folder. The check fails if an id the API accepts is in neither the props manifest nor `REMOTE_CATALOG_ITEMS`, if a retired id is still offered, or if a replacement is not in the manifest.
- **Renaming an id** (its name carries a brand, for example): rename the folder, add the old id to `CATALOG_RENAMES` and to `RETIRED_ASSETS` with the new id, regenerate as above, and upload the props again (`scripts/props/upload.mjs`): the new id has new object-storage keys.
- **Removing a source:** delete its files, its register entry and both credits, but keep its `docs/licences/` folder as the record of what shipped and when.

## 10. Where things stand (2026-10-24)

Every shipped file is registered and within budget (no exceptions), and every licence is on the allow-list. These are recorded as gaps (reported by `npm run check:assets`, not failures) because nothing here may be guessed:

- **Pascal Editor (MIT):** the licence file is stored, but the maker of the sounds in `audios/sfx/` is not recorded. All 144 props have `commercialUseApproved: null`.
- **OpenStreetMap (ODbL):** the ODbL text is not stored.
- **Owner-supplied logos:** generation tool and ownership record not written down ([brand README](../brand/README.md)).
- **Approval:** every source admitted before 2026-10-21 has no `approvedBy`.

Closed on 2026-10-24:

- **Kenney kits:** each kit's page and `License.txt` are stored in [`docs/licences/kenney/`](../licences/kenney/README.md) with its version; every shipped Kenney file is byte-identical with the kit's current download.
- **The sky, `hdri/venice_sunset_1k.hdr`:** Poly Haven's "Venice Sunset" by Greg Zaal, CC0, re-saved in Photoshop (same 1024 x 512 picture, pixel for pixel within rounding); its own source `polyhaven` in the register, credited in both lists, page saved in [`docs/licences/polyhaven/`](../licences/polyhaven/README.md).
- **The 11 catalogue items on Pascal's own storage:** retired (`RETIRED_ASSETS`): seven map to the nearest prop we ship (dining table, kitchen cabinet, sofa, bookshelf, office chair, office table, kitchen counter), four are removed (power outlet, classic car, dishwasher, fireplace), and the branded "tesla" is renamed "electric-car". The pages drop any catalogue item without local files and every floor-plan picture address, and next.config no longer allows that host, so nothing is fetched from it. `REMOTE_CATALOG_ITEMS` is empty.
- **Exceptions:** `sideways-city.wav` (39.7 MB) is now `sideways-city.ogg` (Ogg Vorbis, 2.1 MB; [music README](../licences/music/README.md)); `audios/sfx/grid_snap.mamd`, `items/piano/Fireplace_13.glb` and the two unused `floor-plan.svg` are deleted.

## 11. Pull request checklist

The [pull request template](../../.github/pull_request_template.md) carries these lines:

```markdown
## New or changed assets (docs/operations/asset_admission.md)
- [ ] No outside asset, font, map data or copied code is added or changed, **or**:
- [ ] Licence on the allow-list (never GPL/AGPL, NC, ND or unknown; Tiny World Builder is reference only)
- [ ] Provenance in `lib/content/assetSources.js`; licence and source page saved under `docs/licences/<source>/`
- [ ] Credited in `CREDITS.md` and `lib/content/credits.js`
- [ ] Download scanned; only allowed formats; `npm run check:assets` passes (formats, sizes, triangles, textures)
- [ ] Visual style, mobile (`?quality=low&diag=1`), placement and accessibility checked
- [ ] Code owner approval recorded in `approvedBy`
```
