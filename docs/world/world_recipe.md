# The world recipe: more plots, and a second town on an island

[All documentation](../README.md) · 2026-11-14 · a first slice of roadmap tasks 9, 10 and 14 ([tasks.md](../roadmap/tasks.md), section 2)

Two things were asked for: **more plots in the current town**, and **the start of another town further out**, on an island, as the plan for a land-mass world had it. Both are done as far as they can be without the streaming runtime (roadmap task 11), which is what lets a player *walk or sail to* the island. Until that exists the main game loads the first town alone, exactly as before.

| | Before | Now |
| :--- | :--- | :--- |
| First town ("Voxel Town") | 855 plots, ids 1 to 880 | **1,010 plots**: the same 855, unchanged, plus 155 new ones, ids 881 to 1035 |
| Second town ("Harbor Town") | none | **1,070 plots** on Harbor Isle, ids 1,000,001 to 1,001,089, 990 units east, 380 units of open water between the coasts |
| In the game | the first town | the first town (with its 155 new plots). The island is on the map page, not in the game |

## 1. More plots in the first town

**The constraint.** The live database holds claims, leases and edits on plots 1 to 880. Not one of them may move, change or be renumbered. So the city generator ([lib/city/cityGenerator.js](../../lib/city/cityGenerator.js)) is left exactly as it was, and the plots are added *afterwards*, by a new layer, [lib/city/townExtension.js](../../lib/city/townExtension.js):

- `generateCity(seed)` is unchanged: the same 855 plots, field for field. A fingerprint of all of them, taken from the generator **before** any change in this work, is stored in `tests/town-extension.test.mjs` and `tests/world-recipe.test.mjs`. If a plot ever changed, they fail.
- `generateTown(seed)` is `generateCity(seed)` plus the extension. It is what the game, the server and the public business pages now load. `generateTown(seed, { extraPlots: false })`, or `NEXT_PUBLIC_EXTRA_PLOTS=0`, gives the plain generator.

**Why not simply ask the generator for more.** Its random numbers run in one stream, so changing its target shifts everything after it: other plots would change. The extension uses none of that stream.

**What it finds room for.** The ring road round the county is lined with lots, so a new street cannot branch off just anywhere. Where a lot was skipped there is a gap wider than a street (3.8 against 2.8), and one connector can pass through it. Beyond the ring is farmland. So the extension adds:

- **Loops**: one connector out through a gap, ending at a closed rectangle of four new streets (their corners are junctions, so no street ends in nothing), with lots on both sides of every street. The biggest loop that fits is tried first, round every road that has lots, on either side, until about 200 lots are planned. Two loops fit: **90 lots**.
- **Gap fill**: the single free places along roads that already have lots (where the generator skipped one), by each road's own rules (its country stretches only, its sides, and not the lake roads, which have a cap). **65 lots**.
- Where the geometry (airports, lakes, a mall, roads heading out of the ring) leaves no more room, it stops: asking for 400 gives the same 155. That is the real capacity of the current land.

Junctions, pavement gaps, lots and prices are made with the city editor's own functions ([cityEdit.js](../../lib/city/cityEdit.js)), which make them the way the generator does. The new lots are ordinary lots in the Meadow Quarter or on the country roads: no estates or prime sites are added. Trees, bushes, farmland and ground patches under the new streets and lots give way.

**Checks** (`tests/town-extension.test.mjs`, 27; `tests/world-recipe.test.mjs`, 33): the fingerprint, 150 to 250 new lots, ids from 881 with no repeat, determinism, the editor's own validation (no street ends in nothing, no lot on a road, every lot faces a road), no overlap with any lot, no tree or field under a lot, every new lot priced, the switches, another seed, and the server's top-up (below).

### The server tops up an existing database

A database seeded before this has 855 plots. When the server starts it now inserts the plots the generator has that the database lacks, **by id, new ids only**, with each plot's opening ledger entry, and touches no existing row ([services/api/core.mjs](../../services/api/core.mjs), `topUpPlots`). It returns `toppedUp` (155 once; 0 every time after). Only the first town's own plots, never a design or editor lot (ids 100,000 and up).

**Rehearsed on a file database** (the repository's own server code, 2026-11-14): a database seeded by a server with the extension off (everything its start-up seeds: the world, ads and brands), one lot claimed and re-priced by a player. The new server was started on the same file:

| Step | Result |
| :--- | :--- |
| Start on the old file | 855 plots became 1,010: **155 rows added** |
| The 855 old rows, every column | **0 changed** |
| The claimed lot | still the player's, same title and value |
| `/health` | `plots: 1010` |
| Start again | `toppedUp: 0` |

The same steps for staging are in [deploy/STAGING.md](../../deploy/STAGING.md) ("More plots: the top-up"). They have **not** been run on the real staging or production servers: nothing in this work touches them.

**Deploy order.** The API first (it tops the database up), then the web app. The other way round, a player could see a new plot that the server does not know yet, and a claim on it would be refused until the API catches up.

## 2. The world recipe

[lib/world/worldRecipe.js](../../lib/world/worldRecipe.js) is the recipe, plain data: which landmasses there are, which towns stand on them (each is `generateTown(seed)`), where a landmass sits in relation to another, which features its coast has, and how plot ids are numbered. `validateRecipe` checks it. [lib/world/buildWorld.js](../../lib/world/buildWorld.js) turns it into the map.

| Landmass | Town | Seed | Placed | Coast | Features |
| :--- | :--- | ---: | :--- | :--- | :--- |
| The Mainland | Voxel Town (index 0, live) | 20260101 | the origin | **a variation of Jamaica** (section 4a), seed 1101, 70 of beach round the town | beaches, headlands, **ranges** |
| Harbor Isle | Harbor Town (index 1, **not live**) | 8675309 | east of the mainland, bearing 8 degrees, **380 units of open water** | seed 2202, 80 beyond the land | harbour, beaches, headlands, hills, **airstrip** |

- **The first town never moves.** Its origin is (0, 0), so its coordinates and ids are what the game has always used.
- **The island is placed by its gap, not by a guess.** Its land centre is moved out along the bearing until the open water between the two coasts is exactly the recipe's gap (found by bisection; the test allows 10 units either way). At 380 units and a boat speed of 3.6 a second, the crossing is about 100 seconds.
- **Why seed 8675309.** Seven other candidate seeds were tried; all made sound towns. This one has a compact land (443 by 470, near square, which suits an island), three lakes, and 1,070 plots once the extension has run.
- **`live: false`.** The game does not load the island and the server does not open its lots: see section 5.

### Global plot ids (roadmap task 10)

`id = town index * 1,000,000 + the id the town's generator gave it`. The first town is index 0, so its ids are unchanged; the second town's start at 1,000,000. A town's own ids stay far below the stride (the generator's design lots start at 100,000 and the editor's at 300,000), so two towns' ids can never meet. `toGlobalId` and `fromGlobalId` are in the recipe module; a test covers uniqueness across the world and that the island's ids are the town's own plus the stride.

## 3. Landmasses: the coast and its features (roadmap task 14, first slice)

[lib/world/island.js](../../lib/world/island.js) makes a coastline from a seed alone:

- A smooth closed shape round a town's land, star-shaped about its centre, so it can **never cross itself**. For 72 directions the radius is what the land rectangle needs plus a margin for the beach, made lumpy by four seeded waves and smoothed; a last pass guarantees the town is inside whatever the waves did. The test tries six seeds on three differently shaped lands.
- **Harbour**: the coast point that faces the nearest other landmass, with a quay and three piers that point out to sea.
- **Beaches**: stretches where the coast turns slowly. **Headlands**: the three farthest points (a lookout or a lighthouse could stand there). **Hills**: up to three places between the town's land and the coast, away from the harbour.
- **Airstrip** (2026-11-15): a short field for flights ([player_flight.md](player_flight.md)): a 92-unit runway (the mainland's international airport has 116) with an apron on the town's side, in the free band between the town's land and the coast, on the side farthest from the harbour, at least 14 units from the water and clear of the hills. For Harbor Isle it comes out on the east side, running north to south, called "Harbor Isle Airstrip". `features.airstrip` holds its position, heading, apron and a `frame` (origin, `t` along the runway, `n` towards the town, `runwayN`, `runwayHalf`) in the shape the city's airports use ([lib/sim/flight.js](../../lib/sim/flight.js)), so the flight code can use it as it is. A landmass that lists `airstrip` in its `features` gets one when it is generated, so Harbor Town has an airport whenever the island is rebuilt; if no side of the land has room, it gets none. The mainland lists none: it has its real airports. The island's plots, roads and coast are unchanged by it, and nothing draws it in the game yet.

These are *positions and data*. Nothing draws water, sand or hills in the game yet.

## 4. The preview page

`/world` (a development tool, like `/land` and `/curves`: it exists only outside release builds, and robots.txt keeps search engines away) draws both landmasses on one map: the sea, the coasts with their beach band, the harbour piers, hills and headlands, each town's roads and every plot as a dot in its district's colour (the lots added after the generator in lime), the land outline, and a table of towns, plot counts, id ranges, origins, and the open water between. [apps/web/components/dev/WorldMap.jsx](../../apps/web/components/dev/WorldMap.jsx).

## 4a. The mainland is a variation of Jamaica (2026-11-15)

The first landmass was a lumpy ring round the town's land, which on the map was a rounded square. It is now shaped like an island: [lib/world/shapes.js](../../lib/world/shapes.js) draws the mainland's coast from a hand-made outline of **Jamaica** (about 50 points: Negril's western tip, the long north coast past Montego Bay, Ocho Rios and Port Antonio, Morant Point in the east, the Kingston harbour inlet, the great bay of Portland Bight with Portland Ridge on its seaward side, the Black River bulge). It is a **variation**, not a copy:

| Setting (`coast` in the recipe) | Mainland | What it does |
| :--- | ---: | :--- |
| `shape` | `jamaica` | which template |
| `length` | 2000 | the island's reach east to west, in game units, before the town is fitted in (it is scaled up from the town until the land is inside; it ends at about 2,425 x 1,383) |
| `stretch` | 1.35 | widens it north to south: real Jamaica is thin, and the town's land is 346 x 392 |
| `rotate`, `variation` | 4 degrees, 0.06 | a small turn, and a few per cent of seeded change in the radius, so it is Jamaica's kind of shape and another seed gives another coast |
| `anchor` | -77.28, 18.02 | the place on the template where the town stands: the central plains. The town's land is put in the middle of that spot and the shape is scaled up from there until the land is inside with `margin` (70) units of beach |

The coast is made smooth by two rounds of corner-cutting, checked never to cross itself, and checked to leave the town's land inside it with the beach to spare (a land that cannot fit is an error, not a town in the sea). The result is about 2,425 x 1,383 units, 1.8 million square units (the old mainland was 0.3 million), and about 53% of its bounding box (a rounded square fills 85%).

**Mountains and hills.** Jamaica's are in the recipe as `features.ranges`: the **Blue Mountains** in the east (height 14), **Cockpit Country** in the north-west (8) and **Dolphin Head** at the western tip (7). The central hills are left out because they would touch the town. Each range is a line with a width at its foot and a height, and `elevationAt(ranges, x, z, seed)` is the ground's height anywhere: 0 away from every range, rising smoothly along its line, lumpy like real peaks, continuous, the same every time for a seed, and **0 over all of the first town's land** (it stays on the plains). The game's own hills near the first town are low (at most 2.2 units: a tall building is about 1.5); these are mountains, with a peak of about 13 units.

They are data and a height function, **not terrain in the game yet**: a terrain mesh, the ground height under a car or an avatar, and the collision for a slope all need the streaming runtime and real terrain (roadmap tasks 11 and 17). The function is there for them to read.

**Harbor Isle moved.** The island is placed by its gap from the mainland's coast (380 units), and the mainland is now much bigger, so the island's town is at (1922.9, 78.1) and not (977.5, 161.4). Its lots that a staging server may already hold (`WORLD_TOWNS=harbor`) have the old coordinates. They are empty, not for sale and not shown anywhere, so nothing is wrong, but when the island is made final they have to be **re-seeded**: delete the rows with ids from 1,000,000 up (none is owned) and restart the API with `WORLD_TOWNS=harbor`. The island's own design is still to be changed (it is still a rounded square), so that is best done once, after both landmasses are final.

## 4b. Harbor Isle is a variation of Grand Cayman, with the Lesser Caymans beside it (2026-11-15)

Harbor Isle and two new town-less islands are drawn from a **spine and a width profile** ([shapes.js](../../lib/world/shapes.js), `spineIsland`): a line along the island and, for each side, how far the coast is from it along the way. That gives broad ends, waists, bays and tapering tips that cannot cross themselves (the hand-placed corner lists looked wrong).

| Landmass | Template | Look | Placed |
|---|---|---|---|
| Harbor Isle | `grand-cayman` | broad west end where Harbor Town stands, the North Sound biting into the north side, a long arm tapering east; stretch 0.7, about 2.1 to 1; a low Eastern Bluff (height 4) | 380 units of water from the mainland (bearing 8) |
| Little Isle | `little-cayman` | stocky, about 4 to 1, pinched in the middle by Preston Bay | 260 from Harbor Isle (bearing -35) |
| The Brac | `cayman-brac` | slimmer and curved, about 4 to 1 overall but varying in width, bow-like east tip, with the Bluff (height 9) | 300 from Harbor Isle (bearing -85) |

The Lesser Caymans are about 275 units apart and have no town, no plots and no database rows. The harbour faces the landmass the island is placed from (the mainland).

## 4c. Roads round both landmasses, and where the heights come from (2026-11-15)

**Coastal ring roads** ([lib/world/highways.js](../../lib/world/highways.js), the recipe's `highways`): one on the mainland and one on Harbor Isle, about 6,100 units each. Each is walked round the coast at 28-unit steps and set about 30 units inland, so it clears the beach. Where the ground is above 2.5 (the ranges) the road moves nearer the coast; it keeps 34 units off the airstrip's runway; where an island is too thin for the road (the east tip of Harbor Isle) the road cuts across the tip; and any loop is cut out, so a ring never crosses itself. The Lesser Caymans have no town and no road.

**Spurs:** one from each side (north, south, east, west) of the town's county road out to the ring, 200 to 1,200 units long. A spur starts at a gap between lots along the county road, or goes on in line past a road's corner, and is used only if it clears every lot and the airstrip. Roads between landmasses (a causeway or ferry) are still to do.

**Heights (option 1 plus a correction from option 2).** The ranges stay hand-authored lines with a width and a height, read through `elevationAt` (0 over the first town). The **Blue Mountains** now follow the real main ridge, from Catherine's Peak above Kingston south-east through Blue Mountain Peak (18.045 N, 76.58 W) and Sir John Peak, with the **John Crow Mountains** beyond to the north-east. Those positions are the published peak coordinates, not a downloaded elevation grid: a real DEM (SRTM or Copernicus, credited in CREDITS.md, baked to a coarse grid) is the next step if the map should be surveyed rather than faithful.

## 5. What is not done, and why

- **The island is not in the game.** Walking or driving to it needs the streaming runtime (roadmap task 11): chunked geometry, collision and traffic that work on a map this size. The main game keeps loading the first town only and does not regress.
- **No water, sand or hills are drawn in the game**, and boats and fishing do not work at sea yet (the rest of task 14).
- **The island's lots are not for sale.** `WORLD_TOWNS=harbor` in `api.env` (the default is none) adds them to the server's database under their global ids, but as **empty land that is not claimable**: no owner, no business, so none of it appears in the directory, the market, the sitemap or the public pages. Opening them is a separate decision, once the game can show the island. The switch has been exercised on a file database: 1,070 rows added, none claimable, none owned, and a second start adds nothing.
- **No way across the water yet** except a boat once the sea is drawn. A plane the player flies, and flights to the island, are on the roadmap as task 18 ([player_flight.md](player_flight.md)).
- **The mountains are not terrain in the game**, and the mainland's Jamaica coast is not drawn in it: the game's mainland is still the rectangle it has always been (roadmap tasks 11, 14 and 17).
- **Harbor Isle is still a rounded square.** Its own shape is the next step.
- **No roads between landmasses** (roadmap task 12): each landmass has its coastal ring and spurs (section 4c), but nothing crosses the sea yet.
- **No streets or buildings are shared** between the towns, and the preview is 2D.
- **The land of the first town is still a rectangle** in the game; its coast in the recipe is drawn *round* it for the map.
- The island's other systems (traffic, daily finds, search, multiplayer rooms: task 16) do not know it exists.

## 6. Risks

- **A 2,080-plot world is one map in the preview only.** Nothing loads both towns together; the memory and frame-rate cost of that is the streaming runtime's problem to solve.
- **Public pages now include the 155 new lots** (business profiles for the ones the generator gave a business, in the sitemap) from the day the web app with the extension is deployed. The deploy order above keeps them consistent with the server.
- **`generateTown` for another seed** may add fewer lots (or none) because it depends on where the gaps and the free land are; the test checks that it is always sound.
- **Task ids and quests** that name plots by id are unaffected: no id below 881 changed.

## Files

| File | What it is |
| :--- | :--- |
| [lib/city/townExtension.js](../../lib/city/townExtension.js) | `generateTown`, `extendTown`, `checkExtension` |
| [lib/world/worldRecipe.js](../../lib/world/worldRecipe.js) | the recipe, global ids, `validateRecipe` |
| [lib/world/island.js](../../lib/world/island.js) | the coast and its features |
| [lib/world/buildWorld.js](../../lib/world/buildWorld.js) | the recipe turned into the map |
| [apps/web/components/dev/WorldMap.jsx](../../apps/web/components/dev/WorldMap.jsx), `apps/web/app/world/page.jsx` | the preview page |
| [services/api/core.mjs](../../services/api/core.mjs) | `topUpPlots`, `seedTowns` |
| [tests/town-extension.test.mjs](../../tests/town-extension.test.mjs), [tests/world-recipe.test.mjs](../../tests/world-recipe.test.mjs) | the checks |
