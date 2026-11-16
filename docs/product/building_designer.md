# Build it from kit pieces: the building designer

Written for: owners (what they can do) and developers (how it is built and where it is going). Started 2026-11-15.

An owner who claims a plot can already pick a building shape, colours, a roof feature and what stands behind it ([exterior options](behind_the_building.md)). The designer adds a way to **assemble the building's outside from real wall pieces** (Kenney's Building Kit, CC0): they choose what each side of the building looks like and the game builds it from walls, windows, doorways, corner columns and a roof edge.

## What an owner picks (phase 1, built)

In the plot card's *Customize the outside* section, a **Build it from pieces** switch turns the designer on. Then:

| Choice | Options |
| :--- | :--- |
| **Front** | shopfront (a doorway in the middle with a window in every cell beside it, windows above), home front (a doorway with a window each side on the ground floor, windows above), doorway only (a plain wall with a doorway) |
| **Back** | windows, plain |
| **Sides** | windows, plain |
| **Windows** | square, round, wide |
| **Corners** | plain, columns, rounded |
| **Roof edge** | none, low border, high parapet |

The business type picks a sensible start (a restaurant starts with a shopfront, round windows and corner columns, a shop with a shopfront and wide windows on the sides, an office with windows all round and a parapet, a home with a home front, square windows and a low border), which the owner can change. The preview in the claim card and the plot card shows the pieces as they are chosen; it costs nothing for now (no price).

## How it works

- **The building keeps its box.** The plot's footprint, height and collision do not change, so nothing else in the game (walking, the interior, plots next to it) is touched. The pieces are a skin laid on the box's faces, a hair outside, and the box behind shows through the windows and doorways in its wall colour. A building with a designed skin has no catalogue model (the two are exclusive: `lib/game/exterior.js`).
- **A grid of cells.** Each wall is cut into cells half a unit wide (`CELL` in `lib/content/modularBuild.js`; an odd number, at least five along a side: the two ends are the corner pieces, and the middle cell takes the door) and each floor is 1.2 units high (the game's `FLOOR_HEIGHT`); the kit's pieces are 2 wide and 2.4 high, so they are scaled to fit the cell exactly (non-uniformly, to keep the wall thin).
- **Pure and validated.** `lib/content/modularBuild.js` holds the options, `cleanBuild` (the only way a design enters a plot: anything unknown falls back to the default, so a saved game or a hostile request can only produce a building the game can draw), the start for each kind of business and `buildPieces` (the list of pieces to draw). The server runs the same check as the client.
- **Shadows and light.** The pieces stand a hair outside the box, so they do not cast or receive shadows (they would fight the box's shadow and come out dark and speckled), and the kit's grey-blue walls are brightened by a tint (2.2 times; an instance colour may be over 1) so they read in daylight.
- **Cheap to draw.** Pieces are instanced, one draw call for each kind of piece however many buildings use it (`apps/web/components/city/Crowns.jsx` through `PropInstances`), loaded only when a built plot uses the designer. A small two-floor building is about 45 pieces and a big eight-floor one on a prime plot about 360; the number of pieces in the scene is capped (`MAX_PIECES`), so a city of designed buildings cannot exceed the performance tiers (`docs/architecture/performance_policy.md`).
- **Models:** 13 of the Building Kit's 79 pieces are shipped (`apps/web/public/models/kenney/building/`), imported by `scripts/models/import-props.mjs --only building`.
- **Tests:** `tests/modular-build.test.mjs` (validation, the pieces of every option are in the catalogue, they stay inside the box, counts, the business starts), `tests/props.test.mjs`, `tests/asset-admission.test.mjs`.
- **Look at it:** `/dev/yards` has the yards; `/dev/buildings` shows every option on mock lots.

## Phase 2: free-form assembly (not built)

The same pieces on a grid the owner edits cell by cell, the way the furniture editor works inside:

1. **A 2D grid editor** over the plot's footprint (a row of cells for each floor): click a cell to cycle the piece (wall, window, doorway, column, open), with floors stacked and a 3D preview. The saved design is `exterior.build.cells`: `[floor][side][cell] -> piece id`, validated cell by cell against the footprint and the plot tier (a bigger plot tier allows more floors and cells).
2. **Real openings.** Doorways and windows that are real holes (the building's box replaced by the pieces entirely, with a floor and a roof), so the inside shows through; this needs the interior viewer to match the walls.
3. **The business starts the palette:** restaurants get shopfronts, awnings and counters' windows; shops a wide shopfront; offices curtain-wall windows; homes porches. The same grouping as the furniture menu (`lib/content/businessFixtures.js`).
4. **Stairs, balconies, gutters and floors** from the same kit for upper floors the owner can enter.
5. **Prices and Gold:** each piece priced like a fixture (`lib/content/fixturePrices.js`), counting towards the business's worth, with the server holding the design (today an exterior is saved with the plot, validated, and drawn by every client).

Open questions for phase 2: whether designed buildings need their own collision (today the box is the collision), how interiors line up with a free-form shell, and how many designed buildings the low performance tier can draw at once (to be measured with `scripts/perf-measure.mjs`).
