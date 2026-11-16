# The suspension bridge: Harbor Causeway

Written for: the owner and developers. Built 2026-11-16 at the owner's request ("update the bridge to mimic the Golden Gate Bridge in San Francisco"). It is an homage in shape and colour: no assets or names of the real bridge are used.

Harbor Causeway's water section (392 units) is now a suspension bridge: two tall towers with cross struts, a main cable over each tower on each side, back-stays to the shores, vertical suspenders from the cables to the deck, a girder deck, all in International Orange, and **no piers under the main span**. The North Causeway keeps the plain deck (`SUSPENSION.ids` in `lib/world/suspensionSpec.js` lists the bridges drawn this way).

## Proportions kept from the real bridge

| | Real bridge | Here |
| :--- | :--- | :--- |
| Side spans / main span | 343 m + 1280 m + 343 m | towers at 17% and 83%: 67 + 258 + 67 units |
| Tower height above the deck | 160 m over a deck 67 m high (2.4 times) | 22 units over a deck 9 high (2.4 times), 30.6 over the water |
| Cable at mid-span | within about 5 m of the deck | 2.2 units over the deck |
| Under the main span | no piers | no piers; the side spans keep 6 |
| Colour | International Orange | `#d9472b` (a little brighter than the paint: the game's light darkens it) |

## What it is made of

- **`lib/world/suspensionSpec.js`**: the numbers and the rule `inMainSpan` (no piers between the towers). No imports, so `chunkMesh.js` can use it without a circular import.
- **`lib/world/suspension.js`**: `suspension(bridge)` gives the towers (each leg a stack of eight boxes tapering toward the head, and five cross struts, the lowest more than 4 units over the deck so a train passes under it), the cables (a main parabola per side and two back-stays hanging a little below the straight line) and the suspenders (every 5.5 units, 136 in all); `deckSegments(bridge)` cuts the deck into 4-unit pieces laid along the slope.
- **`apps/web/components/world/Suspension.jsx`**: draws them in four instanced meshes (the towers' boxes, the cables' and suspenders' rods, the orange girder, and the road with its kerbs and lane line): about 450 instances, four draw calls, always drawn. Mounted with the baked world (`?world=baked`) and on the dev page.
- **The deck is its own girder, not the kit's tiles.** The City Kit (Roads) deck tile has four corner sockets (footplates and collars a pier attaches to) that hang under the deck as stray pieces when no pier is there. The suspension deck is a plain girder 1.4 deep (the kit's is 2.6) with an asphalt road, a kerb on each edge and a lane line; the tiles of this causeway are flagged `suspension` and skipped by `chunkObject.js`. The road surface is still the game's (`deckHeight`), so cars, the avatar and the train are on it. The side spans' piers meet the thinner girder.
- **Tests:** `tests/suspension.test.mjs` (the towers, cables, suspenders, deck, no piers under the main span, the train fits), and the chunk tests (`world-chunk-mesh`, `world-chunk-object`) follow the change.

## Also fixed here

The train's rail tiles were placed by the rail model's origin, not its middle (the model runs 0 to 4 along z and lies 1 below y 0), so they sat 3 units off along the line and 1.6 under the deck. They are now shifted by the catalogue's offsets (`RAIL_SHIFT` in `Train.jsx`) and lie on the deck on the train's own lane.

## Not done

- The North Causeway, and any other bridge, as a second suspension or arch bridge.
- Lights on the towers at night (the aircraft lights of the real towers), and the deck's lamps match the old deck's.
- The deck's side rails; the real bridge has a railing and a sidewalk: the kerbs are the only edge.
- Real-scale length: the main span is 258 units against the real 1280 m; the tower is lower relative to the span than the real one.
