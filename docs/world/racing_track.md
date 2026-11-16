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

The Racing Kit (2.0, CC0) is registered in `lib/content/assetSources.js` and `docs/licences/kenney/` (the page, the licence): fifteen models are shipped in `apps/web/public/models/kenney/racing/` (`roadStart`, `barrierRed`, `barrierWhite`, `grandStand`, `grandStandAwning`, `tent`, `pitsOffice`, `lightPostModern`, `treeLarge`, `treeSmall` and the four race cars, about 520 KB). The circuit's shape is OpenStreetMap data (ODbL): credited in CREDITS.md and the credits page, as the street names are. The kit's road tiles are not used (a first version built the circuit from them on a grid; it looked like a toy), so they are not shipped.

## Tests

`tests/world-track.test.mjs`: the three real shapes; for each, a closed evenly spaced loop of a sensible length with no stretches closer than a road's width and a margin; the Voxel Speedway's start on a gentle stretch, seven checkpoints in order, the surface layers and counts, the models and their distances (barriers 7.7 or more, buildings 9 or more, trees 19 or more from the road), the grandstands facing the track, the placement on flat land and the refusal of a bad site, the link road, the bake, the mesh, and the instanced meshes with their disposal.

## Lap timing and the leaderboard (built 2026-11-16)

**The server times the laps.** This follows the game's rule for value (a player never creates their own): the page never sends a time. It says "I am at the start line" or "I am at checkpoint 3" with where the avatar is, and the server's clock times the lap between the passes (`services/api/race.mjs`). A pass counts only when it is within 16 units of that point, is the next point in order (start line, checkpoints 1 to 7, start line), and is no further from the last pass than a car could have driven in the time between (the presence tracker's car speed and lag allowance). A lap quicker than 90% of the circuit at the car's top speed is refused (the speed bound between checkpoints already holds a forger to a car's pace). Positions are the page's own report, as for the daily stars, so the next check is the presence tracker's recorded positions.

| Route | What |
| :-- | :-- |
| `POST /race/pass` `{ track, index, x, z }` | a pass; answers `start`, `checkpoint`, `lap` (with the server's `ms`, the account's `best`, its `rank`, and `record`) or `ignored` (out of order, or the run expired after five minutes) |
| `GET /race/leaderboard?track=speedway&limit=10` | public: each account's best lap, quickest first, with ranks; a banned account is left out |
| `GET /race/me?track=speedway` | the signed-in player's best, rank and last ten laps |

Laps are rows in `race_laps` (an additive table). **A lap pays no Gold** (nothing in a request or an answer is an amount): it earns a place on the board. On the page (`RaceHud.jsx`, with `?world=baked`): a panel appears near the circuit with the lap clock, seven checkpoint marks, last and best lap and the top five (`lib/world/lapTimer.js` does the local timing; guests see the clock, and a game without a server says laps are not recorded). Tested by `tests/race.test.mjs` (the server) and `tests/lap-timer.test.mjs` (the page's timer).

## Race cars and night lighting (built 2026-11-16)

- **Race cars:** six Kenney Racing Kit race cars (`raceCarRed`, `raceCarGreen`, `raceCarOrange`, `raceCarWhite`, 1,430 triangles each) stand on the grid behind the start line, pointing along the lap, scaled to the city cars' size (4 units). They are scenery for now: a car the player drives is a separate piece (a faster vehicle kind with its own speed cap, which the server's bounds would then follow).
- **Night:** the lamp heads and the pit windows glow at night, and **every lamp throws a pool of light on the road** (an additive disc, dark by day): the track's lamps at the start, and a pair of **lamps along both edges of each causeway bridge** every 32 units, at the height of the deck. The glow is the game's own: `registerGlow` in `components/city/nightLights.js`, driven by `DayNight`, so the track follows the game's dusk (on `/world/stream` a Day/Night button does it).

## Stadium lights (2026-11-16)

Eight tall light masts (the Racing Kit's `lightPostLarge` scaled up to 22 units) stand round the circuit, 21 units outside the road and clear of the buildings. They are chosen one at a time: each new mast is the one that lights the most of the road not yet lit, until **every point of the road is within 52 units of a mast** (361 of 361 points; the test checks it), and no two stand side by side. Each throws a wide pool of light (a 56-unit disc, additive, dark by day) over the road, and its lamp bank glows at night; the overlap is kept dim so the circuit reads as evenly lit, not as bright spots. The small lamps at the start and the bridge lamps are separate.

## The drivable race car and its gauges (2026-11-15)

A race car waits at the pole position of the circuit (a parked car, `race-pole`, put by the streaming layer when `?world=baked` is mounted; walk up and press the prompt "Drive the race car"). It is a normal `kind: 'car'` vehicle with `spec: 'racecar'`, so every place that treats cars still works; the spec changes the numbers (`VEHICLES.racecar` in `lib/sim/vehicles.js`): top speed 15 (a city car's is 7), quicker acceleration and brakes (0 to top in about 2 s, a stop in under 1 s), and it turns less sharply the faster it goes (`highSpeedTurn`). It is drawn with the Kenney race car model (`RaceCarModel`, colour picks red, green, orange or white) and seen by other players the same way (the presence `veh` carries `spec`, which the server keeps only for `'racecar'`; `SPEED_CAP.racecar` and `modeOf` give it its own speed cap for the anti-cheat).

**Gauges** (`apps/web/components/ui/Gauges.jsx`, numbers in `lib/sim/gauges.js`, tested by `tests/gauges.test.mjs`): an analogue speedometer (needle, ticks every 20, redline), a digital readout, the gear (R, N, 1 to 6) and a rev bar. The speed is shown in km/h as map units a second times 14, so a race car's top speed reads 210 and a city car's 98; the map is scaled down, so this is a display scale, not real kilometres. The gearbox is for show: the gear and the revs follow the speed.

**Laps by vehicle:** the page says which vehicle it drives in `POST /race/pass` (`vehicle: 'car' | 'racecar'`); the server uses that vehicle's speed cap for the checkpoint bound and the quickest possible lap, and each vehicle has its own leaderboard (`race_laps.vehicle`, `GET /race/leaderboard?vehicle=`, `GET /race/me?vehicle=`). Changing vehicle mid-lap restarts it. Positions are still self-reported: the presence tracker's verification of laps is the next step.

## Not done

- **Checking laps against the presence tracker's positions** (the server's bounds are in place; this adds a record of where the car really was), and a **drivable race car** (a faster vehicle kind: its own speed cap in `movement.js` and the lap bounds).
- **A pit lane**, skid marks and tyre wear on the surface.
- **A second circuit** on a smaller island (a road and a heli-pad would be needed first; see the roadmap).
