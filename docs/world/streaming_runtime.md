# The streaming runtime (roadmap task 11)

The game today loads one town and builds all of it at once. The streaming runtime mounts only the baked chunks ([world_bake.md](world_bake.md)) near the player, so a world of four landmasses, two towns and about 270 chunks costs what a 5 x 5 square of them costs. Task 11 is built in slices; each is tested before the next starts.

| # | Slice | State |
| :-: | :-- | :-- |
| 1 | **The chunk manager** ([lib/world/chunkManager.js](../../lib/world/chunkManager.js)): which chunks are wanted around the player, loaded nearest first one per frame, let go of with hysteresis, capped, with a look-ahead in the direction of travel | done (2026-11-15), `tests/world-streaming.test.mjs` |
| 2 | **Merged chunk geometry** ([lib/world/chunkMesh.js](../../lib/world/chunkMesh.js)): each chunk becomes three meshes, however much is in it: the ground, the town roads and the highways (rings, spurs, links, causeways and the bridges' raised decks). Done (2026-11-15), `tests/world-chunk-mesh.test.mjs` | done |
| 3 | **A React layer** that mounts and disposes what the manager says, behind a flag (`?world=baked`) so the game is unchanged until it works | |
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

- **Ground.** The bake now writes each land chunk a 16 x 16 grid of 8-unit cells (sea, land or beach) and the height at each corner in centimetres (left out when flat). The mesh is the land and beach cells, sharing corner vertices, with the baked heights: the Blue Mountains rise to 12 in the mesh, and neighbouring chunks meet exactly (3,404 shared edge points agree). Colours by vertex: sand on the beach, grass, rock above 3, peak above 10.
- **Town roads and highways.** Flat ribbons a hair above the ground (an arterial 3.2 wide, a local street 2.2; highways 6, causeways 8). A causeway's bridge deck rises from the shore to its 9 units of clearance over 60 units and comes down at the other end (the baked bridge pieces say how far along the bridge they are, so a deck cut across several chunks is one smooth curve).
- **Cost.** A chunk is at most 3 draw calls; the busiest has 584 triangles. The whole desktop ring round Voxel Town (25 chunks) is 48 draw calls and about 12,000 triangles, mounted through the chunk manager.

What these meshes do not draw: plots and buildings (still made from the town's seed by the generator), the lamps, trees and water. The game's own roads keep their drawing until the React layer (slice 3) mounts these.
