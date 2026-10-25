# Credits

Everything in VoxelVenture that was not made for it, who made it, and the licence it is used under. The game shows the same list in its **Credits** panel (open the city guide, then *Credits & licences*); both come from `lib/content/credits.js`, and `npm test` checks this file names everything listed there.

## Music & sound

**City music and soundscape**: original procedural ambience and fallback tunes by VoxelVenture, generated live by the browser. Recorded music is listed below, all released under **CC0** (public-domain dedication): https://creativecommons.org/publicdomain/zero/1.0/.

| Release / source | Artist | License | Used for |
| --- | --- | --- | --- |
| [Happy Chiptunes (Collection)](https://opengameart.org/content/happy-chiptunes-collection) | Holizna | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Arcades |
| [Sideways City](https://opengameart.org/content/sideways-city) | Zane Little Music | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | City overview |
| [Wednesday Night](https://opengameart.org/content/wednesday-night-funk-fusion) | Zane Little Music | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | City overview |
| [Barriers](https://opengameart.org/content/barriers) | Zane Little Music | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Driving / vehicle radio |
| [Funked Up](https://opengameart.org/content/funked-up) | Joth | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Driving / vehicle radio |
| [Moil](https://opengameart.org/content/moil) | Ruskerdax | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Nighttime city overview |
| [(Basically not) Fusion Jazz](https://opengameart.org/content/basically-not-fusion-jazz) | Spring Spring | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Cafes |
| [Funk (Collection)](https://opengameart.org/content/funk-collection) | Holizna | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Driving / vehicle radio |

**Included collection tracks:**

- **Happy Chiptunes (Collection)** by Holizna: Adventure Begins Loop; Sunny Afternoon; Where It's Safe; NPC Theme.
- **Funk (Collection)** by Holizna: Eat; Sleep; Breath; Make Money; Make Love; Make Funk.

These eight releases contain 16 recordings. The CC0 declarations allow commercial use, modification, redistribution and public performance without a fee or required attribution; credit is given here voluntarily.

The recordings are served locally from `apps/web/public/audio/music/`; Sideways City, released as a 40 MB WAV, is served re-encoded as Ogg Vorbis (the music provenance record says how). See the [music provenance record](docs/licences/music/README.md) for preserved creator-upload pages and the CC0 legal text, captured on 2026-10-16. The [asset manifest](apps/web/public/audio/music/manifest.json) records download addresses, individual file paths and SHA-256 hashes.

## 3D models

**Kenney**, https://www.kenney.nl: City Kit (Commercial), City Kit (Suburban), Nature Kit, Car Kit, Watercraft Kit, Pirate Kit and Coaster Kit. Released under **CC0** (public domain), https://creativecommons.org/publicdomain/zero/1.0/. Credit is not required but is given gladly. Which kit each model comes from: `apps/web/public/models/CREDITS.md`. The furniture editor's car is the Car Kit's SUV. Kit versions (City Kit (Commercial) 2.1, City Kit (Suburban) 2.0, Nature Kit 2.1, Car Kit 3.1, Watercraft Kit 2.1, Pirate Kit 2.1, Coaster Kit 1.0), each kit's saved page and its `License.txt`: [docs/licences/kenney/](docs/licences/kenney/README.md).

**Pascal Editor (Pascal Group Inc.)**, https://github.com/pascalorg/editor: the interior items (doors, windows, furniture) and materials in `apps/web/public/items/` and `apps/web/public/material/`, the editor’s icons, sounds and cursor (`apps/web/public/icons/`, `audios/`, `cursor.svg`), the shared TypeScript configuration (`vendor/typescript-config/`) and elevation styles (`styles/elevation.css`), and the `@pascal-app/*` packages behind them: the building interiors, the furniture editor (*Redesign inside*) and the `/viewer` page. **MIT** licence, https://opensource.org/license/mit; the licence file and what was copied: [docs/licences/pascal-editor/](docs/licences/pascal-editor/README.md).

**Venice Sunset** by **Greg Zaal (Poly Haven)**, https://polyhaven.com/a/venice_sunset: the environment light map of the building interiors and the furniture editor (`apps/web/public/hdri/venice_sunset_1k.hdr`, the 1k HDR, which came with the Pascal editor's files). Released under **CC0** (public domain), https://creativecommons.org/publicdomain/zero/1.0/. The saved page and how the file was matched: [docs/licences/polyhaven/](docs/licences/polyhaven/README.md).

**Voxel landmarks** in `apps/web/public/models/vox/`: made for this game.

## Map data

**Real street names** (off unless the game is built with `NEXT_PUBLIC_STREET_NAMES`): © OpenStreetMap contributors, **ODbL 1.0**, https://www.openstreetmap.org/copyright. The `/reference` page's street maps are drawn from the same data.

## Built with

Next.js, React, three.js, React Three Fiber and drei, Tailwind CSS, zustand and Lucide icons, by their open-source contributors, under the **MIT** or **ISC** licence. The full list of packages and licences is in `package-lock.json` (`npx license-checker --summary` prints it).

## Adding something from outside

Nothing from outside ships until it has passed the [asset admission process](docs/operations/asset_admission.md). In short:

1. Only licences on the allow-list: CC0, CC BY (with attribution), and MIT, BSD or Apache 2.0 for code (and for assets shipped inside such a repository). Never GPL, AGPL, NC (NonCommercial), ND (NoDerivatives), ShareAlike without a decision, or an unknown licence. Tiny World Builder is AGPL: reference only.
2. Save the page you downloaded it from and the licence as it read that day under `docs/licences/<source>/`. Sites close and terms change: FreePD.com, once a source of public-domain music, shut down in 2025.
3. Register it in `lib/content/assetSources.js`, add it to `lib/content/credits.js` (the in-game panel) and to this file, and run `npm run check:assets`.
