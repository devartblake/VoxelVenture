# The world datum

Written for: the owner and developers. Started 2026-11-16 (steps 1, 3 and 4 of the plan below; step 2 for the world's own systems; the town's surfaces moved 2026-11-17).

**The question:** is there one ground plane and one water plane for the whole world, so that every prop, bridge, road and tunnel lines up from a single reference? **The answer today:** one sea plane for the baked world, but no single ground, and two water levels. This work names the heights in one place, makes the world's systems read them, keeps the sources from growing numbers of their own, and draws every layer so the mismatches can be seen.

## The datum (`lib/world/datum.js`)

| Name | Height | What |
| :--- | ---: | :--- |
| `SEA_LEVEL` | -0.3 | the baked world's sea plane (one plane over the whole ocean) |
| `SEA_FLOOR` | -1.5 | the seabed of the shallows: pier feet, bridge foundations; open ocean has no ground |
| `TOWN_GROUND` | 0 | the old town's flat ground |
| `TOWN_WATER` | 0.026 | the old town's river and boats |
| `BOAT_FLOAT` | 0.04 | a boat floats this far over the baked sea |
| `SHORE_GROUND` | 0.2 | the shore where the tunnel's portals are cut (the ground there is 0 to 0.5) |
| `DECK_BASE` | 0 | what a bridge deck's height is measured from (the causeways' 9 is over this, not over the sea) |
| `LIFT` | road 0.06, highway 0.1, prop 0.03, rail 0.16, deckRail 0.04, plot 0.1, yard 0.14, paint {gravel 0.03, asphalt 0.05, mark 0.08, top 0.1} | how far over the surface each kind of thing is laid, against z-fighting |

No value changed: they are what the game already used. `layers()` lists every absolute height with a colour, for the overlay and the guards.

## What reads it now

`lib/world/terrain.js` (the sea level and the seabed of the shallows), `StreamedWorld.jsx` (the sea plane), `lib/city/surfaceHeight.js` and `River.jsx` (the town water), `Vehicles.jsx` (a boat's float), `lib/world/chunkMesh.js` (the lifts, the seabed, the piers' floor), `chunkObject.js` (a prop's lift), `suspensionSpec.js` and `archSpec.js` (their foundations), `train.js` (the rail's lift, over the shore and over a bridge deck), `tunnel.js` (the sea level and the shore), `track.js` (the circuit's paint layers: `LIFT.paint`), `modularBuild.js` and `backyards.js` (what owners build on a plot: `LIFT.plot`, `LIFT.yard`), `Land.jsx` (the town slab's top). Before, `StreamedWorld.jsx` declared its own copy of the sea level next to `terrain.js`'s, `River.jsx` its own town water, and the seabed was a `-1.5` in five places.

## The guard (`tests/datum.test.mjs`)

- the datum is ordered and consistent (the seabed under the sea under the town ground, the lifts in order, the tunnel under the sea, a causeway deck over the water with room for a boat);
- every system above uses the datum's value (each is compared with it);
- the **sources do not grow a number of their own**: for 38 files of `lib/world`, the town and the world's components, no declaration of the sea level or the water height outside the datum, and no literal `0.026`, `-1.5` or `-0.3` (comments stripped). A new copy fails the test; I checked that it does.
- the disagreements the datum has **not** settled are listed (`DATUM_ISSUES`) and the test names them: when one is fixed, remove it and the test says so.

## Not settled yet

1. **The town water and the sea differ by 0.326** (0.026 against -0.3): a boat or a river on the town and one on the baked world are at different heights. Settling it means moving the town's water (or the sea) and checking every interior and boat on it.
2. **A deck's height is measured from 0**, so a causeway's clearance over the water is 0.3 more than its number (9.3, not 9). Harmless, but a bridge built "9 over the water" must say so (`overSea`).
3. **The animals swim at 0.035**, not at the town water (0.026). (Fixed in step 2: they swim on the town water.)

(The join between the town's flat ground and the baked terrain is now tested: see "The town border" below.)

## The overlay: `/world/stream?datum=1`

A grid and a faint sheet at every named height, centred on where you are looking (follow it with the orbit or the free camera: `&cam=free`), with a legend: each layer's height, name and note, a checkbox for each, the camera's height, and the unsettled disagreements. A **Datum** button on the page toggles it. It is a development tool and nothing in the game uses it (`apps/web/components/dev/DatumOverlay.jsx`).

## The town border (step 5, 2026-11-16)

Checking the join between the first town and the baked world found a real gap, and it is fixed.

- **Heights agree.** The baked ground in the 16 chunks that overlap the town's land, and for 60 units beyond them, is exactly the town ground (0): no step at the join. The first hills rise about 80 units further out (4 to 7 units high).
- **There was a frame of ground that nothing drew.** The game left out every baked chunk that overlapped the town's land and drew the town's own land slab instead. But a chunk is 128 units square and the land is not a whole number of chunks, so round the town there was a frame of ground 97 units wide on the west, 69 on the east and north and 51 on the south (126,000 square units) that neither the town nor a chunk drew: **the sea showed through round the town, and the roads from the ring to the town's gates stopped short** (the spurs inside the left-out chunks were not drawn). Seen on the development page with the game's arrangement (`/world/stream?skiptown=1`): `gallery/join_a.webp`.
- **The join** (`lib/world/townJoin.js`): a chunk wholly inside the town's land is still left out (the town covers it, 4 chunks); a chunk that only overlaps it is **drawn with its ground, lowered 0.08 so the town's slab (0.004 over the ground) wins where they lie together, and with its highways cut to the part outside the land** (the baked streets, plots and props are the town's own and are dropped; a bridge is never cut). `terrain.js` still treats every overlapping chunk as the town's, so collision there is unchanged. `StreamedWorld` takes the town's land as `town` and `CityCanvas` passes `layout.land`.
- **Tested** by `tests/town-join.test.mjs`: the manifest's land is the game's; heights; **126,512 square units undrawn before the join, 0 after**; the clipping of a segment outside, crossing, inside and through the land; and on the real chunks no highway piece is left inside the land and the spurs that reach the town are kept (10) and cut at its edge (4).
- **New datum entry:** the town's land slab is 0.004 over the ground (`TOWN_GROUND_TOP`, used by `Land.jsx`), another small disagreement, listed in `DATUM_ISSUES`.

Not checked in a full game session: only the development page's arrangement (a plain slab for the town) was looked at, from above and at a grazing angle (the stripes in `join_d` are the dev page's depth precision at a near plane of 0.05; from above the join is clean, `join_f`).

## The sea looks deep now

The sea plane (the datum's -0.3) has depth shading by distance from the coast: [water.md](water.md). It changes colour and opacity only, no height.

## Next steps

- **Step 2, moved (2026-11-17):** `SURFACE` in the datum is now what a person or a car stands on in the old town (the land, the built-up ground, a lawn, a street, the kerb, a roundabout's island, an airport's apron and runway, a pier and its plaza, a promenade, a park and its paths, a mall and its hall, where an animal walks); `lib/city/surfaceHeight.js` and the street meshes (`lib/city/curves.js`) read it. `LIFT` gained the unclaimed plot's pad (0.175), the bridge kerb (0.12: `DECK.kerb.height`), the street lamps' pool of light (0.12) and the stadium pools (0.16), and a claimed plot's lift (0.1) is now what the plot's building, the draft, a model's floor (`lib/content/models.js`) and a person on the plot all read. The animals swim on the town water, so that disagreement is closed. The avatar and the cars already read `surfaceHeight`, `WATER_Y` and the terrain, so they follow. The guard's file list widened with each, and `tests/datum.test.mjs` checks the stack of surfaces, the kerb, the plot lifts and a walker on a lawn.
- **Step 2, not moved:** small cosmetic offsets on top of a datum height (the target marker's 0.01, a boat's bob, a car's wheel contact), the interior scenes' own coordinates (an interior is its own room, not a place in the world), and some one-off lifts in the town's components (`Farmland`, `GroundPatches`, `Hills` keep their local layer numbers between the land and the roads).
- **Step 5, the rest:** reconcile the town's water with the sea (0.326) and the town slab's 0.004.
