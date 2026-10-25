# Pascal Editor provenance

**Source:** Pascal Editor by Pascal Group Inc., https://github.com/pascalorg/editor, published on npm as `@pascal-app/core`, `@pascal-app/editor`, `@pascal-app/nodes` and `@pascal-app/viewer`.

**Licence:** MIT. [`LICENSE`](LICENSE) is the licence file shipped in `@pascal-app/editor` 1.0.4 (identical in `@pascal-app/core` 1.0.4), copied from `node_modules/@pascal-app/editor/LICENSE` on 2026-10-21. Every `@pascal-app/*` package's `package.json` declares `"license": "MIT"`.

## What came from it

Recorded in [project_status.md](../../roadmap/project_status.md) ("Vendored / copied from upstream"): when the editor was integrated (packages at 1.0.3), these were copied from the upstream repository's `public/` folder. They are in the repository's first commit (2026-10-16).

| Path | What it is |
| --- | --- |
| `apps/web/public/items/` | Interior props: `model.glb` and `thumbnail.webp` per prop. The [props manifest](../../../apps/web/public/props/manifest.json) records each prop's path in Pascal's catalogue storage (`upstream`, without the host), hashes and licence. The catalogue is curated before use (`lib/content/catalogCuration.js`): `tesla` was renamed `electric-car` (folder included), and the 11 items Pascal kept only on its own storage are retired. The unused `items/piano/Fireplace_13.glb`, two `floor-plan.svg` and `audios/sfx/grid_snap.mamd` were deleted on 2026-10-24 |
| `apps/web/public/material/` | Surface materials (colour, normal, roughness and occlusion maps; JPEG, PNG, WebP and KTX2) |
| `apps/web/public/icons/` | The editor's interface icons. `icons/fittings/` were generated upstream with an image-generation tool, as `icons/fittings/README.md` says |
| `apps/web/public/audios/sfx/` | The editor's interface sounds |
| `apps/web/public/hdri/venice_sunset_1k.hdr` | The environment light map: Poly Haven's "Venice Sunset" by Greg Zaal, CC0, confirmed on 2026-10-24 ([polyhaven/](../polyhaven/README.md)); registered as its own source |
| `apps/web/public/cursor.svg` | The editor's cursor |
| `vendor/typescript-config/` | The workspace's shared TypeScript configuration (not on npm) |
| `styles/elevation.css` | Shared shadow and elevation styles |

## Not recorded

- Who made the sounds in `audios/sfx/`.
- A saved copy of the upstream repository page on the day the files were copied, and the upstream commit they came from.
- A commercial-use review of the props: `commercialUseApproved`, `reviewedBy` and `reviewedAt` are null in the props manifest.

These gaps are listed in the asset register (`lib/content/assetSources.js`) and reported by `npm run check:assets`.
