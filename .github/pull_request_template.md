## What changed

## Why

## World-expansion freeze ([docs/roadmap/world_freeze.md](../docs/roadmap/world_freeze.md))
- [ ] This change does not add world content or simulation systems (roads, vehicles, landmarks, terrain, effects, new assets), **or**
- [ ] It is a fix, performance, accessibility or commercial change to the world, and `npm run check:freeze` passes (with a `World-freeze-exception:` line in a commit message if it adds files to a frozen folder)

## Checks
- [ ] `npm run lint`
- [ ] `npm test` (or the relevant suites: `node tests/run.mjs <name>`)
- [ ] No simulated statistics shown to advertisers as real figures
- [ ] If it changes something another part relies on (a price, an event, a postback, the owner's figures, the vote): the contract in `packages/shared-types` and its `CHANGELOG.md` are updated, and `node tests/run.mjs contracts packages` passes ([ADR 0001](../docs/architecture/adr/0001-shared-package-boundaries.md))

## New or changed assets ([docs/operations/asset_admission.md](../docs/operations/asset_admission.md))
- [ ] No outside asset, font, map data or copied code is added or changed, **or**:
- [ ] Licence on the allow-list (never GPL/AGPL, NC, ND or unknown; Tiny World Builder is reference only)
- [ ] Provenance in `lib/content/assetSources.js`; licence and source page saved under `docs/licences/<source>/`
- [ ] Credited in `CREDITS.md` and `lib/content/credits.js`
- [ ] Download scanned; only allowed formats; `npm run check:assets` passes (formats, sizes, triangles, textures)
- [ ] Visual style, mobile (`?quality=low&diag=1`), placement and accessibility checked
- [ ] Code owner approval recorded in `approvedBy`
