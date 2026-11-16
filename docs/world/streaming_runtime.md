# The streaming runtime (roadmap task 11)

The game today loads one town and builds all of it at once. The streaming runtime mounts only the baked chunks ([world_bake.md](world_bake.md)) near the player, so a world of four landmasses, two towns and about 270 chunks costs what a 5 x 5 square of them costs. Task 11 is built in slices; each is tested before the next starts.

| # | Slice | State |
| :-: | :-- | :-- |
| 1 | **The chunk manager** ([lib/world/chunkManager.js](../../lib/world/chunkManager.js)): which chunks are wanted around the player, loaded nearest first one per frame, let go of with hysteresis, capped, with a look-ahead in the direction of travel | done (2026-11-15), `tests/world-streaming.test.mjs` |
| 2 | **Merged chunk geometry** ([lib/world/chunkMesh.js](../../lib/world/chunkMesh.js)): each chunk becomes three meshes, however much is in it: the ground, the town roads and the highways (rings, spurs, links, causeways and the bridges' raised decks). Done (2026-11-15), `tests/world-chunk-mesh.test.mjs` | done |
| 3 | **A React layer** (`apps/web/components/world/StreamedWorld.jsx`, `lib/world/chunkObject.js`) that mounts and disposes what the manager says: a dev page `/world/stream` and, in the game, `?world=baked` (the game is unchanged without it). Done (2026-11-15), `tests/world-chunk-object.test.mjs` and a browser check | done |
| 3b | **A smooth coast, water and the ground under things**: the shore cut from a baked signed distance, a sea plane, and `lib/world/terrain.js` (height, surface, slope and where a person, car or boat can be), used by the avatar, cars and boats outside the town with `?world=baked`. Done (2026-11-15), `tests/world-terrain.test.mjs` | done |
| 4 | **Overview pictures**: a baked flat picture of each chunk, for the Overview and Top-down cameras and the mini-map | |
| 5 | **A spatial collision index** in place of one list for the whole town | |
| 6 | **Shadows and far planes that follow the camera** (the shadow box is 300 x 300 today) | |
| 7 | **Region-aware** traffic, planes, daily features, search and multiplayer rooms (roadmap task 16) | |

## The chunk manager

`createChunkManager(baked, { profile, onMount, onUnmount })` is pure logic: no rendering, no files. The game's components do the drawing in `onMount` and `onUnmount`.

- `focus(x, z, vx, vz)` says where the player is and which way they are moving. Nothing loads; it works out the wanted set.
- `step()` unmounts what is too far, then mounts the nearest wanted chunks, `perStep` of them (1 on desktop and phone), so a chunk never hitches a frame. Call it once a frame.
- `settle()` loads everything wanted (a teleport or a loading screen).

**Profiles.** Desktop: a 5 x 5 ring (640 units across), let go beyond 3 chunks, cap 36. Phone: 3 x 3 (9 chunks), let go beyond 2, cap 16. Overview: a 13 x 13 ring, 4 a step, cap 200, for a high camera.

**What the tests show** (on the real baked world): walking 1,200 units east keeps the mounted set under the cap and lets go of what was left behind; stepping back and forth over a chunk edge 40 times unmounts nothing; a teleport from the mainland to Harbor Isle unmounts the 25 mainland chunks and mounts the island's; open sea mounts nothing; a chunk that finishes loading after the player has left is not mounted late.

## Plots and what stands on them

A chunk records where a plot is, not what is on it. What stands on a plot (the generated building, the city's own business, or a player's) comes from the town's seed and the database, as it does today. See [world_bake.md](world_bake.md) for what that means for letting players claim plots that now have builds.

## Merged chunk geometry (slice 2)

`chunkMeshes(chunk)` returns `{ ground, roads, highways }`, each a set of typed arrays (positions, indices, and colours for the ground) with no three.js in it: the React layer will make a `BufferGeometry` from each. The geometry is **built from the baked data when a chunk mounts**, not stored as binary files beside it: the bake stays small and readable (about 0.6 MB for the whole world), building a chunk's three meshes is a few milliseconds of arithmetic, and the same function makes the same geometry on every machine. If profiling on phones shows the build is a hitch, it can move into the bake without changing the data the runtime reads.

- **Ground.** The bake writes each land chunk a 32 x 32 grid of 4-unit cells (sea, land or beach) and the height at each corner and one ring beyond, in centimetres (left out when the chunk is flat). With relief the mesh is every land and beach cell, sharing corner vertices, with the baked heights and normals worked out from the slope (the ring beyond the chunk makes the shading the same either side of a chunk edge, so there is no seam); a flat chunk merges runs of cells into quads (a few dozen triangles instead of two thousand). The Blue Mountains rise to 18. Colours by vertex: grass that gets lusher and then bare with height, rock on steep ground whatever its height, pale on the peaks, sand on the beach, and a little noise by place on the map so shared vertices agree.
- **Town roads and highways.** Ribbons cut every 6 units and laid a hair above the ground where each piece is, so a road over a slope lies on it (an arterial 3.2 wide, a local street 2.2; highways 6, causeways 8). A causeway's bridge deck rises from the shore to its 9 units of clearance over 60 units and comes down at the other end (the baked bridge pieces say how far along the bridge they are, so a deck cut across several chunks is one smooth curve).
- **Cost.** A chunk is at most 3 draw calls. The busiest is a mountain chunk of about 2,000 triangles; the ring of 25 chunks round Voxel Town (flat) is 48 draw calls and about 2,000 triangles, and a ring entirely in the mountains would be about 50,000 (the low tier's budget is a million for everything).

What these meshes do not draw: plots and buildings (still made from the town's seed by the generator), the lamps, trees and water. The game's own roads keep their drawing until the React layer (slice 3) mounts these.

## The React layer (slice 3)

`lib/world/chunkObject.js` turns a chunk into one `THREE.Group` of up to three meshes (the THREE namespace is passed in, so it is tested in Node with the real three.js: `tests/world-chunk-object.test.mjs`), with three materials shared by every chunk and geometries freed when a chunk is let go. `StreamedWorld.jsx` is the R3F component: it loads the manifest, runs the chunk manager from the camera (or a point it is given) each frame, mounts one chunk a frame and disposes the ones left behind. `window.__vvStreamedWorld` holds the counts (mounted, mounts, unmounts, triangles, draw calls).

- **`/world/stream`** (development page): the baked world with an orbit camera and jump buttons (Voxel Town, Harbor Town, Blue Mountains). Checked in a real browser: it mounts 25 chunks at the start and keeps swapping as the camera moves (49 mounts and 20 unmounts after one jump).
- **`?world=baked` in the game:** mounts the chunks round the player that are not on the first town's land (the town is still drawn by the generator's code), so the coast, mountains, coastal roads and causeways appear beyond it. `?profile=phone|desktop|overview` picks the ring. Without the flag nothing is mounted (the browser test checks both).

## A smooth coast and the sea (slice 3b)

The staircase of 4-unit cells at the coast is gone. The bake writes, for each chunk with a coast near it, the **signed distance to the coast** at every corner (decimetres, positive on land, clamped to 40 units). The mesh cuts the ground along that field with marching squares: the edge of the ground follows the true coast to within 0.05 of a unit (a test measures it on 158 cut vertices), the beach is a band of sand that fades into the land colour (all sand within 10 units of the shore, gone by 16), and beyond the coast the ground slopes down to 1.5 under the sea over 6 units (the shallows). One **sea plane** at -0.3 (`StreamedWorld.jsx`) covers the whole ocean, so the shore appears where the slope meets it. The shore chunks cost up to about 2,100 triangles (the ring round the town is now about 14,000).

## Collision and the ground under things (slice 3c)

`lib/world/terrain.js` reads the mounted chunks and answers, at any point: the **height** (the baked ground, or a bridge deck), the **surface** (`land`, `beach`, `sea`, `bridge`, or `town` where the caller draws the ground itself), and the **slope**. From that: `canStand(x, z, mode)`, `move(x, z, dx, dz, mode)` (one axis at a time, so a body slides along a coast or a slope instead of sticking) and `constrain(...)` for the game, which leaves the first town to its own rules.

| Mode | Where it can be |
| :-- | :-- |
| walk | land, beach and bridges, on ground up to 45 degrees (slope 1.0); a body needs its whole footprint (a 0.3 radius) on the ground, so the coast stops you 0.3 units short of the water |
| car | land, beach and bridges, on ground up to about 24 degrees (0.45); a 0.5 radius |
| boat | the sea at least 2.5 units out from the shore, and under a bridge (the deck is overhead) |

A chunk that exists but has not loaded yet is `known: false` and nothing may move into it, so a fast walker waits a moment for the ground instead of falling into the void; open sea has no chunk and is sea. Tested on the real bake: walking west from the town across the land and the beach to the sea (1,383 steps) stops on the beach, a car drives the whole 392-unit bridge without being refused once, the deck is a smooth climb to 9 and back (no step over 0.22), a boat sails the gap and cannot land, and 100,000 samples take 15 ms.

**In the game** (`?world=baked`): `StreamedWorld` registers the terrain (`setActiveTerrain`); the avatar (`Avatar.jsx`), cars and boats (`Vehicles.jsx`) ask it outside the town. The avatar may now leave the town's land (the bounds widen to the world's), walks onto the beach and stops at the sea, stands on mountains and bridge decks at their height, and the town's own collision still applies inside it. Not yet: click-to-walk routes across the baked ground (the path-finder knows only the town), and traffic.

## The causeway bridge from Kenney models

The bridge decks were flat ribbons. They are now **Kenney City Kit (Roads) 2.2** models (CC0, `apps/web/public/models/kenney/roads/`; registered in `lib/content/assetSources.js`, saved page and licence in `docs/licences/kenney/`): `road-bridge.glb` (a deck with side rails, 240 triangles, 24 KB) and `bridge-pillar-wide.glb` (a column, 38 triangles, 5 KB), the kit the City Kit (Commercial) and (Suburban) buildings are made to match.

- **Placements** (`bridgePlacements` in `lib/world/chunkMesh.js`, plain data): a deck tile for every 8 units of the span (the last one shorter), turned to the road, **tilted to the slope of the deck** there (so the ramp is a row of slopes) and scaled 8 across, 5 deep and its length along; and a pair of pillars every 32 units wherever the road surface is above 3.5, from the shallows (-1.5) up into the deck. The Harbor Causeway and the North Causeway together are 125 tiles and 58 pillars.
- **Drawing** (`chunkObject.js`): two **instanced meshes** a chunk (the decks, the pillars) that share the model's geometry and material, so a bridge chunk is a few draw calls and the shared geometry is never freed with a chunk. `StreamedWorld` loads the two models once; if they cannot be loaded the bridge is the flat ribbon it was, so nothing breaks.
- **Collision is unchanged:** a body on the bridge stands at the deck height (`terrain.js` and the tiles read the same `deckHeight`), and the kit's road surface is at the tile's top, so the model and the walkable height agree.
- **Not done:** the road markings and the rails are the kit's, so they do not yet match the ribbon's colour; the bridge is not lit at night; the corner and ramp pieces of the kit (`road-bridge` is straight only) are not needed for straight causeways.

## Night lighting and the lap clock

The React layer registers the lamps and the pit windows with the game's `registerGlow` (components/city/nightLights.js, driven by `DayNight`) and draws a pool of light under every lamp of the track and of the causeway bridges (an instanced additive disc whose brightness is a glow). The racing track's lap clock (`RaceHud.jsx`) is a DOM overlay shown with `?world=baked` near the circuit. See [racing_track.md](racing_track.md).
