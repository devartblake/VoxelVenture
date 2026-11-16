# The racing track (Voxel Speedway)

[All documentation](../README.md) | [World](README.md) | 2026-11-16

A closed racing circuit on the mainland, built from the **shape of a real circuit in OpenStreetMap** and the **Kenney Racing Kit 2.0**. It is data in the world recipe, baked with the rest of the world and drawn with `?world=baked` (and on `/world/stream`), like the bridges. Lap timing and results are not built yet (see the end).

## Where it is, and why there

The recipe's `tracks` has one entry: **Voxel Speedway**, on the mainland, its middle at (-120, -580): site **D** of the candidate map (the user chose D or E from the picture of the five flat sites), the flat plain north-north-west of Voxel Town, **about 600 units from the town (85 seconds by car)**, beside the north coast road, on flat land (the height function is 0 there), 40 or more units from the coast and from the town's land, and 24 or more from every highway. `buildWorld` checks all of that and refuses a recipe that puts a track anywhere else: it is an error that says why, not a track in the sea or on a mountain. The circuit is a little wider than the candidate footprint (its scenery and run-off add 40 units), and the foothills of Cockpit Country start 150 units to the west, so of the sites round D only (-120, -580) fits; E (-491, -629, 814 units out) is the other flat site and needs a bigger check. To move the track, change `site` and re-bake. A short link road joins it to the north spur of the coast road.

## The shape comes from OpenStreetMap

OpenStreetMap maps race circuits as `highway=raceway`. Querying Jamaica (the Overpass API, through a public mirror, on 2026-11-16) found three: **Dover Raceway** (St Ann, way 247345542, 2.35 km), **Jamwest Speedway** (Westmoreland) and **Palisadoes International Raceway** (Kingston). Their outlines are in `lib/world/data/raceways.js` (only the shape: points and the way id; (c) OpenStreetMap contributors, ODbL 1.0). The track uses Dover Raceway.

`generateTrack` (lib/world/track.js) turns an outline into a circuit: projects it flat, smooths its corners, **turns it every 5 degrees to the angle that fits the site best and scales it** (Dover is 0.39 of its real size, a lap of about 900 units, which is 2 minutes at the car's top speed of 7), spaces it every 2.5 units, **pushes apart any two stretches that pass nearer than 16 units** (shrunk to a site, a real circuit's parallel stretches come too close for a 10-unit road) and keeps the shape otherwise.

## What is built

- **Surface** (`surface`, painted quads, one mesh a chunk): asphalt 10 wide, white edge lines, red and white kerbs on the bends, **gravel run-off** on the outside of every bend, a **chequered start line** and a **painted grid** of 8 boxes. The layers are 0.03 apart and the material is pulled toward the camera, so they do not flicker. On the inside of a tight hairpin the offsets are kept to a share of the radius, so no quad folds over (a handful of triangles still do).
- **Scenery** (Kenney Racing Kit models, `props`): the **start gantry** (`roadStart`) across the road, **red and white barriers** (`barrierRed`, `barrierWhite`) on both sides all the way round, beyond the run-off, **a few grandstands** (2 to 3, `grandStand` and `grandStandAwning`) and **pits and tents** (2 to 3, `pitsOffice`, `tent`) round the start, **lamp posts** (`lightPostModern`) and **trees** (`treeLarge`, `treeSmall`) in the open ground.
- **Nothing is built across the track.** The circuit doubles back close to itself, so every building and barrier is checked against the WHOLE circuit, not only the stretch it stands beside: a barrier that would lie across the road (on the inside of a tight bend, or across another part that passes close) is left out, and a grandstand or pit is put only where the full run-off and a building's depth are clear on that side. The start is the straightest stretch of the lap that also has room both sides.
- **For lap timing** (not drawn): the centreline as a closed road (`kind: track`, 361 points), seven checkpoints round the lap, and the start line with its heading.

## How it is drawn

Each baked chunk holds the quads (`surface`) and models (`props`) that lie in it. `chunkMesh.js` makes the quads one **track mesh** (two triangles a quad, a colour a vertex); `chunkObject.js` makes one **instanced mesh for each kind of model** in the chunk, sharing the model's geometry and material (the loader in `StreamedWorld.jsx` merges each model's parts, and leaves out a road tile's grass, which would flicker against ours). A circuit that cannot load its models still has its surface.

## Admission and credits

The Racing Kit (2.0, CC0) is registered in `lib/content/assetSources.js` and `docs/licences/kenney/` (the page, the licence): ten models are shipped in `apps/web/public/models/kenney/racing/` (`roadStart`, `barrierRed`, `barrierWhite`, `grandStand`, `grandStandAwning`, `tent`, `pitsOffice`, `lightPostModern`, `treeLarge`, `treeSmall`, about 100 KB). The circuit's shape is OpenStreetMap data (ODbL): credited in CREDITS.md and the credits page, as the street names are. The kit's road tiles are not used (a first version built the circuit from them on a grid; it looked like a toy), so they are not shipped.

## Tests

`tests/world-track.test.mjs`: the three real shapes; for each, a closed evenly spaced loop of a sensible length with no stretches closer than a road's width and a margin; the Voxel Speedway's start on a gentle stretch, seven checkpoints in order, the surface layers and counts, the models and their distances (barriers 7.7 or more, buildings 9 or more, trees 19 or more from the road), the grandstands facing the track, the placement on flat land and the refusal of a bad site, the link road, the bake, the mesh, and the instanced meshes with their disposal.

## Not done

- **Lap timing, a leaderboard and results.** The data is there (a closed centreline, checkpoints, the start line); a timer needs the player's position near the line and the checkpoints in order, and results must be kept by the server like the other rewards (the game's rule: a player never creates their own value). A first slice: a client lap timer on `?world=baked`, then a server-side check against the presence tracker's positions.
- **Race cars** (the kit has four) and a pit lane; the grid has no cars on it.
- **The track is not lit at night**, and the surface has no skid marks or wear.
- **A second circuit** on a smaller island (a road and a heli-pad would be needed first; see the roadmap).
