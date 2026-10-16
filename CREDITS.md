# Credits

Everything in VoxelVenture that was not made for it, who made it, and the licence it is used under. The game shows the same list in its **Credits** panel (open the city guide, then *Credits & licences*); both come from `lib/content/credits.js`, and `npm test` checks this file names everything listed there.

## Music & sound

**City music and soundscape**: original, by VoxelVenture. There are no recordings: every tune (the city's day, dusk and night moods, the arcade, the café jazz, the fun-park waltz, the mall) and every sound is made live by the browser's audio. See `lib/game/musicRules.js` and `docs/day_night_sound.md`.

## 3D models

**Kenney**, https://www.kenney.nl: City Kit (Commercial), City Kit (Suburban), Nature Kit, Car Kit, Watercraft Kit, Pirate Kit and Coaster Kit. Released under **CC0** (public domain), https://creativecommons.org/publicdomain/zero/1.0/. Credit is not required but is given gladly. Which kit each model comes from: `public/models/CREDITS.md`.

**Pascal Editor (Pascal Group Inc.)**, https://github.com/pascalorg/editor: the interior items (doors, windows, furniture) and materials in `public/items/` and `public/material/`, and the `@pascal-app/*` packages behind them: the building interiors, the furniture editor (*Redesign inside*) and the `/viewer` page. **MIT** licence, https://opensource.org/license/mit.

**Voxel landmarks** in `public/models/vox/`: made for this game.

## Map data

**Real street names** (off unless the game is built with `NEXT_PUBLIC_STREET_NAMES`): © OpenStreetMap contributors, **ODbL 1.0**, https://www.openstreetmap.org/copyright. The `/reference` page's street maps are drawn from the same data.

## Built with

Next.js, React, three.js, React Three Fiber and drei, Tailwind CSS, zustand and Lucide icons, by their open-source contributors, under the **MIT** or **ISC** licence. The full list of packages and licences is in `package-lock.json` (`npx license-checker --summary` prints it).

## Adding something from outside

Before any outside music, sound, model or image ships:

1. Use only licences that allow commercial use: CC0, CC BY, CC BY-SA, MIT, or a paid licence you hold. Never NC (NonCommercial) or ND (NoDerivatives).
2. Save the page you downloaded it from and the licence as it read that day (for example in `docs/licences/`). Sites close and terms change: FreePD.com, once a source of public-domain music, shut down in 2025.
3. Add it to `lib/content/credits.js` (the in-game panel) and to this file.
