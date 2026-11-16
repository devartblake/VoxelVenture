# An undersea tunnel between the two large islands: evaluation

Written for: the owner, to decide whether and when to build it. Evaluated 2026-11-16; nothing is built. The owner asked whether it is possible, to be looked at again after roadmap tasks 17 (real terrain) and 18 (the player's plane).

**What I took the question to mean.** A tunnel under the sea between **the Mainland and Harbor Isle** (the two large landmasses; Harbor Causeway is 456 units between them and North Causeway 676). If you meant a tunnel *through* an island (under the Blue Mountains, for example), see "Through a mountain" at the end: the same machinery, simpler, and it wants task 17's real terrain first.

## Short answer

**Yes, it is possible, and it can be done in two stages of very different cost.**

1. **A rail tunnel you ride through (cheap, about 2 to 3 days).** The train already carries the rider, so no walking or driving below the sea has to be collision-checked. What it needs: a drawn tube under the sea, two portals, a second train line, a camera that stays inside the tube, and the presence check allowing the corridor. No change to the ground model.
2. **A tunnel you can walk or drive in (expensive, about 1 to 2 weeks, real risk).** This needs the ground model to answer "which level are you on?" at a point, because the road above and the tunnel below share the same ground position on land. That is the same change real mountains and any overpass would need, so it should be built once, after task 17.

I recommend stage 1 first (it answers the question for players at low cost) and stage 2 only if players want to drive it.

## What the game has today, and what a tunnel needs from it

| Part | Today | A tunnel needs |
| :--- | :--- | :--- |
| **The sea** | One translucent plane at `SEA_LEVEL = -0.3` (opacity 0.88) over open ocean with no chunk data under it (`StreamedWorld.jsx`, `terrain.js`). Nothing is drawn below it. | A tube mesh below the plane: visible dimly through the water from above (a nice effect, to be checked), opaque from inside. A spike must check the plane's underside and the fog from inside the tube. |
| **The ground model** | A height field: one height for each `(x, z)` (`terrain.sample`), plus a **deck overlay** for bridges (`deckAt`): a bridge is "an extra surface at a height where a deck piece passes". Chunk grids store heights above 0 only. | Stage 1: nothing (the train carries you). Stage 2: a second overlay, `tunnelAt(x, z)`, plus a **layer** held by the mover (`on foot or in a car: surface or tunnel`). On the sea section there is no ambiguity (nobody stands on the sea); on the land ramps the road above and the tunnel below overlap, so the mover must carry which one it is on, set when it passes a portal. |
| **Collision and sliding** | `terrain.move/constrain` slide along a coast or a steep slope. | Stage 2: inside the tube, a corridor (6 units wide) replaces the coast rule; stepping out is only possible at a portal. |
| **Camera** | The orbit camera follows the avatar at a distance (`Avatar.jsx`). | Both stages: clamp the camera inside the tube (below the roof and between the walls), otherwise it pops out through the roof and looks at the outside of a closed tube. Third-person at 5 to 8 units from the rider in a 6-wide, 4.5-high tube needs a first-person or "pulled in" mode there. |
| **Presence and anti-cheat** | `inBounds` is the land's bounding box plus a 30 margin (`placeGeometry.js`); `movement.js` checks the speed of a mode. | The corridor lies inside the world's rectangle (the two islands are 456 apart inside it), so it passes; a rider's cruise speed (6) is under a car's (7). The tracker's other checks (teleport, speed) are unchanged. Worth one test with a tube route. |
| **The train** | `lib/world/train.js`: one line, a function of the clock; rail on the Harbor Causeway deck. | Generalise it from one line to a list of lines (a `route` of points with a height profile `y(s)`), keep the timetable. The tunnel line would be the second. |
| **Streaming** | Chunks stream around the camera; open sea has none. | The tube is not a chunk: draw it as one instanced set (about 70 segments of 8 units, the bridge deck's tile length) always, or by distance. It costs a few thousand triangles and about 3 draw calls. |
| **Bake and the freeze** | `npm run bake:world` makes 299 chunks; a changed world needs a fresh bake and the freeze exception. | Stage 1 needs no bake (the tube and the line are code and the manifest's causeway/route data). Stage 2 may add a `tunnels` entry to the manifest (route, depth profile, portals) so the bake and the tests agree. |

## A design that fits

- **Route.** Straight between the two islands. The cheapest is the Harbor Causeway's own two ends (456 units: the shortest gap), a little to one side of the road so the two never cross. A second tunnel along the North Causeway (676) is possible later.
- **Depth.** The tube's floor at about **-5.5** and roof at about **-1.0** (the sea plane is at -0.3, so the roof is just under the water: visible from above), 6 units wide inside, 4.5 high: a train (3.2 high at the scale used on the causeway) and, in stage 2, a road lane beside it.
- **Portals.** On each shore, a ramp that goes down at a grade of 0.12 (the road's own `maxGrade`) from the ground (about 0 to 0.5) to the floor: 5.8 units of drop, so **about 48 units of ramp** at each end; the ramp is a cut with walls and a cover, with a portal arch at the surface. Total length about 456 + 2 x 48 = **550 units**: a **90-second ride** at the train's 6 units a second (more with the stops).
- **Look.** The Kenney kits have no tunnel tube; the Minigolf Kit's tunnel pieces are far too small. Build it from primitives (floor, walls, roof, a lit strip, ribs every 8 units, a portal arch) or from the Roads kit's bridge deck pieces turned over; a few emissive strips give light at night (the existing `registerGlow`).
- **The ride.** A station on each side where the rail meets the tunnel; the rider boards as for the causeway train. Inside, a clamped, slightly pulled-in camera and a tunnel hum; windows to the sea are not needed.

## Cost and risk

| | Stage 1: rail tunnel | Stage 2: walk and drive |
| :--- | :--- | :--- |
| Code | `lib/world/tunnel.js` (route, profile, portals), `Tunnel.jsx` (the tube), `train.js` generalised to two lines, camera clamp | `tunnelAt` and the layer in `terrain.js`, `Avatar.jsx`, `Vehicles.jsx`, the presence verifier, a corridor rule, lighting, ventilation props |
| Tests | the profile and the ride; the tracker accepts the ride; the tube stays under the sea and above nothing | all of stage 1, plus layer changes at the portals, a car through the tunnel, nobody can fall through or stay in the wall |
| Time | about 2 to 3 days | about 1 to 2 weeks |
| Main risk | the camera inside the tube; seeing the sea plane from below; sorting of a transparent plane over a tube | the layer rule: every system that reads `groundY` (the avatar, cars, boats, the tracker, the camera) must agree, and a missed one drops someone through the floor or traps them |
| Performance | a few thousand triangles, 3 draw calls | same; the traffic simulation and the interior systems must ignore the tube |

Two things stay true on both stages: it is **not** a gameplay or income feature (no fare, no Gold: it adds travel and a place to see), and it is a **world feature**, so it needs the freeze exception the owner gave for the train, with a trailer on each commit.

## What the spike showed (2026-11-16)

A plain tube (floor -5.5, roof -1.0, 6.4 wide, boxes and light strips) was placed under the sea beside the Harbor Causeway, behind the dev page's `?tunnel=1` (`apps/web/components/dev/TunnelSpike.jsx`, `/world/stream?tunnel=1&look=1448,284,10,14,26`).

- **From above: it works.** The tube shows through the sea as a long lighter band under the water, with the bridge's pillars standing beside it. That is the "you can see it is there" effect, with no change to the sea.
- **From inside: not settled.** The dev page's orbit camera cannot go below the horizon, so the inside of the tube could not be looked at; the one low shot showed the sea plane lit from the camera's side with a bright sun reflection. That is a warning, not a result: a camera in or near the tube must see only the tube (opaque, double-sided, lit from inside), and portals must be covered so the sea plane is never seen from below. A spike with a free camera is the next step.
- **Boxes are one-sided:** a tube made of boxes is invisible from inside unless its material is double-sided (the spike's first version was).

## Why after tasks 17 and 18

- **Task 17 (real terrain).** The layered ground query that stage 2 needs is the same one a real mountain needs (a road in a cutting, a tunnel under the Blue Mountains, a bridge over a valley). Build it once there, and the sea tunnel is a use of it, not a second change to every system that reads the ground.
- **Task 18 (the player's plane).** Flights to Harbor Isle give a third way across; whether a tunnel is wanted as well is easier to judge once players can fly. The two do not conflict (a plane flies far above, the tunnel is below the sea), and the flight code does not touch the ground model below the surface.

## Through a mountain

A tunnel under the Blue Mountains (a ridge about 18 units high) is stage 2's mechanism on land: a portal on each side, a tube whose roof must stay under the ground over the whole length (the real heights in `jamaicaDem.js` decide), a road or rail inside. It does not touch the sea or the presence bounds, and it is where the real terrain of task 17 pays off. I would evaluate the exact route with the heights once task 17 is done.

## Recommended next steps

1. **Finish the spike** (the first half is done, above): a free camera inside the tube, with the portals covered, to learn what the sea plane and fog do from below. It answers the second visual unknown.
2. If it looks right, **stage 1** as its own pull request after tasks 17 and 18.
3. Decide on **stage 2** after stage 1 has been played.
