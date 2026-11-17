# The arch bridge: the North Causeway

Written for: the owner and developers. Built 2026-11-16 at the owner's request (a Golden Gate or a Sydney bridge for the North Causeway; the Australian one chosen). It is an homage in shape: no assets or names of the real bridge are used.

The North Causeway's water section (606 units) is drawn after the great steel through-arch bridge of Sydney harbour: **two latticed steel arch ribs** rising over the deck, the **deck hung from the arch by vertical hangers** in the middle and **carried on posts** near the ends where the arch is below it, **cross struts** between the ribs at the top, **four stone pylons** at the ends, a girder deck, and **no piers under the arch**. Harbor Causeway keeps its suspension bridge ([suspension_bridge.md](suspension_bridge.md)).

## Shape

| | Real bridge | Here |
| :--- | :--- | :--- |
| Arch span / the whole | 503 m of 1149 m | 80% of the bridge: the approaches are 10% each (485 of 606 units) |
| Ribs | two, each a lattice of top and bottom chords with a web, deeper at the springing | two, 4.9 to each side of the centre line (outside the 8-wide deck); depth 4.8 at the springing, 1.6 at the crown; a Warren zigzag web in 7-unit panels and an upright at every joint |
| Deck | hung from the arch in the middle, on posts near the ends | hangers where the bottom chord is over the deck, posts where the arch is below it (69 hangers, 4 posts) |
| Cross bracing | overhead struts between the ribs | 35 struts at the top chord, only where there is room under them (4.5 over the deck at least) |
| Pylons | four granite pylons, decorative | four, 3.4 square tapering to 2.4, 12 over the deck with a cap, 7.6 to each side |
| Crown | 134 m over the water, 85 m over the deck | 45 over the water, 36 over the deck: drawn taller than the real 1.7 times the deck height, so that it reads as an arch over a span this long |
| Colour | steel grey, sandstone pylons | `#8a8f99` steel, `#b8a98a` stone |

## What it is made of

- **`lib/world/archSpec.js`**: the numbers and the rule `inMainSpan` (no piers under the arch). **`lib/world/archBridge.js`**: `archBridge(bridge)` gives the ribs (chords, web, uprights), the hangers and posts, the struts, the pylons and the night lights as lists of points in the bridge's own coordinates. **`lib/world/bridgeStyles.js`**: which causeway has which style (`bridgeKind`), its deck numbers (`deckOf`) and the pier rule (`noPiersAt`), read by `chunkMesh.js`.
- **`apps/web/components/world/ArchBridge.jsx`** draws it, with the shared **`BridgeKit.jsx`** (the girder deck, instanced boxes and rods, the night lights; the suspension bridge uses the same): about 700 rods and a few dozen boxes, a handful of draw calls.
- **The deck is its own girder** (`lib/world/bridgeDeckSpec.js`: 1.4 deep, 8 wide, an asphalt road, a kerb on each edge and a lane line), the same as the suspension bridge's: the kit's deck tile has pier sockets that would hang under it as stray pieces. The tiles of both causeways are flagged `styled` and skipped by `chunkObject.js`; the lamps stand on the kerb in line with the deck.
- **Tests:** `tests/arch-bridge.test.mjs` (the arch, ribs, web, hangers and posts, struts and their clearance, pylons, deck, no piers under the arch, lamps on the kerb, the lights), and the chunk tests follow.

## Night

A red beacon on each rib at the crown, a warm light every 8 units along each top chord and one on each pylon's cap: small glowing spheres that follow the game's dusk (`registerGlow` in `nightLights.js`): faint by day, bright at night. The bridge's street lamps and their pools are as on the other bridge.

## Not done

- Lighting the arch's steel or the pylons by real lights; the pylon's flags.
- A rail deck: the real bridge carries trains; this deck is a road (the train line is on Harbor Causeway).
- The tunnel and the datum: see [tunnel_evaluation.md](tunnel_evaluation.md).
