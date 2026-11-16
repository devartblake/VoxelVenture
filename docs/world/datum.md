# The world datum

Written for: the owner and developers. Started 2026-11-16 (steps 1, 3 and 4 of the plan below; step 2 for the world's own systems).

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
| `LIFT` | road 0.06, highway 0.1, prop 0.03, rail 0.16 | how far over the surface each kind of thing is laid, against z-fighting |

No value changed: they are what the game already used. `layers()` lists every absolute height with a colour, for the overlay and the guards.

## What reads it now

`lib/world/terrain.js` (the sea level and the seabed of the shallows), `StreamedWorld.jsx` (the sea plane), `lib/city/surfaceHeight.js` and `River.jsx` (the town water), `Vehicles.jsx` (a boat's float), `lib/world/chunkMesh.js` (the lifts, the seabed, the piers' floor), `chunkObject.js` (a prop's lift), `suspensionSpec.js` and `archSpec.js` (their foundations), `train.js` (the rail's lift), `tunnel.js` (the sea level and the shore). Before, `StreamedWorld.jsx` declared its own copy of the sea level next to `terrain.js`'s, `River.jsx` its own town water, and the seabed was a `-1.5` in five places.

## The guard (`tests/datum.test.mjs`)

- the datum is ordered and consistent (the seabed under the sea under the town ground, the lifts in order, the tunnel under the sea, a causeway deck over the water with room for a boat);
- every system above uses the datum's value (each is compared with it);
- the **sources do not grow a number of their own**: for 38 files of `lib/world`, the town and the world's components, no declaration of the sea level or the water height outside the datum, and no literal `0.026`, `-1.5` or `-0.3` (comments stripped). A new copy fails the test; I checked that it does.
- the disagreements the datum has **not** settled are listed (`DATUM_ISSUES`) and the test names them: when one is fixed, remove it and the test says so.

## Not settled yet

1. **The town water and the sea differ by 0.326** (0.026 against -0.3): a boat or a river on the town and one on the baked world are at different heights. Settling it means moving the town's water (or the sea) and checking every interior and boat on it.
2. **A deck's height is measured from 0**, so a causeway's clearance over the water is 0.3 more than its number (9.3, not 9). Harmless, but a bridge built "9 over the water" must say so (`overSea`).
3. **The animals swim at 0.035**, not at the town water (0.026).

And the biggest one, step 5 of the plan: where the town's flat ground meets the baked terrain at the town border, the two ground models are checked against each other only by the town skip (chunks the game draws itself); there is no test that the heights agree at the join.

## The overlay: `/world/stream?datum=1`

A grid and a faint sheet at every named height, centred on where you are looking (follow it with the orbit or the free camera: `&cam=free`), with a legend: each layer's height, name and note, a checkbox for each, the camera's height, and the unsettled disagreements. A **Datum** button on the page toggles it. It is a development tool and nothing in the game uses it (`apps/web/components/dev/DatumOverlay.jsx`).

## Next steps

- **Step 2, the rest of the systems:** the avatar and cars on the town and the join, interiors, the plots' `y`, the lamp pools and kerb heights (`lib/world/bridgeDeckSpec.js`), the track's paint layers (`PALETTE` in `track.js`): move them onto the datum and widen the guard's file list as each moves.
- **Step 5:** reconcile the town's water with the sea, and add a test of the heights where the town meets the baked terrain.
