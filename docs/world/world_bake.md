# The world bake (roadmap task 10)

`node scripts/bake-world.mjs` (or `npm run bake:world`) takes the world recipe ([world_recipe.md](world_recipe.md)), builds it, cuts the map into 128-unit chunks and writes plain data to `apps/web/public/world/`:

```
manifest.json            the world: landmasses (coast, harbour, airstrip, ranges), towns (origin, land, plot id range), highways, causeways, links, ocean, the chunk index, a hash
chunks/<cx>_<cz>.json    one square of the map: plots (id, place, size, facing, district), roads and highways cut at the chunk's edges, the land share, and the ground heights on a 5 x 5 grid
```

The first run baked 273 chunks and 274 files, 473 KB, for the mainland, Harbor Isle and the two Lesser Caymans (open sea is not baked). The code is `lib/world/bake.js` (pure) and `lib/world/bakedWorld.js` (a loader: `loadBakedWorld(load)` gives `chunk(cx, cz)`, `near(x, z, radius)` and `plot(id)`).

**What is in a chunk, and what is not.** A chunk says where things are: each plot's global id and place, every road piece, the bridges (with their clearance), the land and the heights (the real mountain heights, read from `elevationAt`). It does not hold what a plot *is* (its building, owner, brand): that is still made from the town's seed by the generator, which the game and the server both run, so the bake cannot disagree with either. Merged geometry for the streaming runtime (task 11) is added beside this data, not in its place.

**It is checked, not trusted.** `tests/world-bake.test.mjs` checks that every plot is in exactly one chunk, that every road's length survives the cutting, that the baked heights are the height function's own numbers, that two bakes give the same bytes, and that the files on disk are a fresh bake (it runs `bake-world.mjs --check`). So after any change to the recipe or the generators, run the bake and commit the files; CI fails if you forget.

## Growing the world after the bake

Adding roads, towns or landmasses is **not a problem**, because the bake is regenerated from the recipe, not edited by hand, and the things that must never move are fixed by construction:

| Change | What happens | Safe? |
| :-- | :-- | :-- |
| **A new road** (a highway, a causeway, a link) | Only `highways` records in the chunks it passes through change. Plots, town roads and the ground are untouched (a test bakes with and without the causeways and compares). | Yes, any time |
| **A new town on a new landmass** | It gets the next town index, so its plot ids start at index x 1,000,000 and cannot meet an old id. A test adds a third town and checks every existing chunk's plots and roads are byte for byte the same. | Yes, any time |
| **A new town on an existing landmass** | Same ids; it needs room on that landmass, and the coast is re-drawn if it was drawn round the old town only. | Yes, with a re-bake |
| **More plots or roads inside a town** | That changes the generator's output for that seed, so it moves plot ids and places in a town people may own. The first town is frozen by the live database (and by [world_freeze.md](../roadmap/world_freeze.md)). Harbor Isle is not live yet, so it can still change. | First town: no. Harbor Isle: yes, until it opens |
| **Moving or reshaping a landmass** | The first town never moves (origin 0, 0). Any other landmass moves its town's plots. | Free for Harbor Isle until it opens; after that, no |

So the rule is: **append, never renumber, never move what is live.** Re-bake after every change and commit the files. The staging database's island lots (ids from 1,000,000) were seeded from an older shape and must be re-seeded once, before Harbor Isle opens.

Not yet there: a **world hash check** between the client and the server (the manifest carries one), the **merged chunk geometry** and the **streaming runtime** (task 11), and a **save that holds only the player's changes**.

## Plots that have builds on them, and letting players claim them

The bake holds where a plot is, not what stands on it, so there is nothing in the bake to remove. What stands on a plot comes from the generator (a seeded building and a made-up owner such as "ChefLuigi") and from the server's `plots` table. Today, of Voxel Town's 1,010 plots, 489 are built by the generator (the city's own businesses, with no player account behind them) and 521 are empty lots; Harbor Town has 566 built and 504 empty. A player claims an empty lot directly, and can already take over a city business for 1.25 times its land price (`takeOverPlot`), so a build is not a block, only an extra cost.

Making them claimable as empty lots is two changes that must agree: the **generator** has to stop drawing the building, and the **server** has to clear the owner (`owner_name` null, `claimable` 1) for plots with no player account, which never touches a plot a player holds. It affects the daily features that name the city's businesses (the 2,061 catalogue tasks, Plot of the Day, the chest): tasks whose target no longer exists are already dropped by the server's `finishable()` filter, but the numbers change. So: do it for **Harbor Isle first** (a recipe option, since it is not live and has no owners), and for Voxel Town decide how many city businesses to keep as the city's own landmarks.
