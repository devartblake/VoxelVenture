# An undersea tunnel between the two large islands: evaluation

Written for: the owner, to decide whether and when to build it. Evaluated 2026-11-16; nothing is built. The owner asked whether it is possible, to be looked at again after roadmap tasks 17 (real terrain) and 18 (the player's plane).

**What I took the question to mean.** A tunnel under the sea between **the Mainland and Harbor Isle** (the two large landmasses; Harbor Causeway is 456 units between them and North Causeway 676). If you meant a tunnel *through* an island (under the Blue Mountains, for example), see "Through a mountain" at the end: the same machinery, simpler, and it wants task 17's real terrain first.

## Short answer

**Yes, it is possible, and it can be done in two stages of very different cost.**

1. **A rail tunnel you ride through (cheap, about 3 to 4 days).** The train already carries the rider, so no walking or driving below the sea has to be collision-checked. What it needs: a drawn tube under the sea, two portals cut into the ground (a bake change), a second train line, a camera that stays inside the tube, and the presence check allowing the corridor. No change to the ground model's heights.
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
| **Bake and the freeze** | `npm run bake:world` makes 299 chunks; a changed world needs a fresh bake and the freeze exception. | **Both stages need a bake for the portal cuts** (a hole in the ground over each ramp, see the spike's finding); the tube and the line stay code. A `tunnels` entry in the manifest (route, depth profile, portals, cuts) keeps the bake, the terrain query and the tests in agreement. |

## A design that fits

- **Route.** Straight between the two islands, beside the Harbor Causeway (456 units: the shortest gap), 9 units to the side so the two never cross. **It has its own road entrance, which starts before the bridge's road** (the owner's requirement): the tunnel's road begins 110 units before the causeway's first point and its portal is 70 before it. A second tunnel along the North Causeway (676) is possible later.
- **Depth.** The tube's floor at about **-5.5** and roof at about **-1.0** (the sea plane is at -0.3, so the roof is just under the water: visible from above), 6 units wide inside, 4.5 high: a train (3.2 high at the scale used on the causeway) and, in stage 2, a road lane beside it.
- **Portals.** On each shore, a ramp that goes down at a grade of 0.12 (the road's own `maxGrade`) from the ground (about 0 to 0.5) to the floor: 5.8 units of drop, so **about 48 units of ramp** at each end; the ramp is a cut (a trench in the ground, see the spike's finding) with walls, then a cover, with a portal arch at the surface. With the portals 70 units inland of each end, the length is **596 units** (456 + 2 x 70): a **100-second ride** at the train's 6 units a second (more with the stops).
- **Look.** The Kenney kits have no tunnel tube; the Minigolf Kit's tunnel pieces are far too small. Build it from primitives (floor, walls, roof, a lit strip, ribs every 8 units, a portal arch) or from the Roads kit's bridge deck pieces turned over; a few emissive strips give light at night (the existing `registerGlow`).
- **The ride.** A station on each side where the rail meets the tunnel; the rider boards as for the causeway train. Inside, a clamped, slightly pulled-in camera and a tunnel hum; windows to the sea are not needed.

## Cost and risk

| | Stage 1: rail tunnel | Stage 2: walk and drive |
| :--- | :--- | :--- |
| Code | `lib/world/tunnel.js` (route, profile, portals), `Tunnel.jsx` (the tube), `train.js` generalised to two lines, camera clamp | `tunnelAt` and the layer in `terrain.js`, `Avatar.jsx`, `Vehicles.jsx`, the presence verifier, a corridor rule, lighting, ventilation props |
| Tests | the profile and the ride; the tracker accepts the ride; the tube stays under the sea and above nothing | all of stage 1, plus layer changes at the portals, a car through the tunnel, nobody can fall through or stay in the wall |
| Time | about 3 to 4 days | about 1 to 2 weeks |
| Main risk | the camera inside the tube; seeing the sea plane from below; sorting of a transparent plane over a tube | the layer rule: every system that reads `groundY` (the avatar, cars, boats, the tracker, the camera) must agree, and a missed one drops someone through the floor or traps them |
| Performance | a few thousand triangles, 3 draw calls | same; the traffic simulation and the interior systems must ignore the tube |

Two things stay true on both stages: it is **not** a gameplay or income feature (no fare, no Gold: it adds travel and a place to see), and it is a **world feature**, so it needs the freeze exception the owner gave for the train, with a trailer on each commit.

## What the spike showed (2026-11-16)

The spike is a development page, not part of the game: `/world/stream?tunnel=1&cam=free` (fly with the mouse drag to look, W A S D to move, Q and E down and up, shift for speed; `&at=x,y,z&yaw=degrees&pitch=degrees` start somewhere). It draws the tube from `lib/world/tunnel.js` (tested by `tests/tunnel.test.mjs`) beside the Harbor Causeway, with its own road entrance, ramps, lamps and a free camera: `apps/web/components/dev/TunnelSpike.jsx`.

- **From above the sea: it works.** The tube shows through the water as a long lighter band beside the bridge's pillars.
- **From inside, under the sea and under the shore: it works.** A free camera inside sees only the tube: walls, a roof with two lamp strips, a road with a lane line, converging to a point. No water, sea plane or void shows, no glare. The feared problem (the sea plane seen from below) does not arise while the tube is closed all round (walls, roof and a slab under the road, all double-sided). Boxes are one-sided: the tube's materials must be double-sided.
- **The tunnel has its own road entrance, before the bridge's.** The tunnel's road starts at `approach0` = 110 units before the causeway's first point (the bridge's road starts at 0, an orange marker in the spike), runs 40 units on the flat to the portal at 70 units before the causeway, goes down at 0.12 for 48 units, and is at the full depth (-5.5) 22 units before the shore. It is 9 units to the side of the causeway (the deck is 8 wide) on the side opposite the train's rail. It is **596 units portal to portal**, and the two roads never meet.
- **The one real problem: the ground covers the ramp.** The baked ground is a solid surface, so where the ramp is still above or near ground level (the first 40 units of each ramp) the road lies under the grass: from a camera standing on the ramp the floor is the ground's own surface. A portal therefore needs a **cut** (a trench) in the ground: a hole in the terrain mesh over the ramp's footprint with walls down to the road (the ground grid already has a land/sea mask per cell; a "cut" list in the bake, or a trench drawn over a hole in `chunkMesh.js`), or the ramp has to start where the ground is at the waterline. This is a bake change (a fresh bake and the freeze exception), and `terrain.sample` must know the cut too (the ground height there is the ramp's, not the grass's). It is the main new cost: about one extra day for stage 1 (the train carries the rider but the camera still sees the ground), more for stage 2.

## Why after tasks 17 and 18

- **Task 17 (real terrain).** The layered ground query that stage 2 needs is the same one a real mountain needs (a road in a cutting, a tunnel under the Blue Mountains, a bridge over a valley). Build it once there, and the sea tunnel is a use of it, not a second change to every system that reads the ground.
- **Task 18 (the player's plane).** Flights to Harbor Isle give a third way across; whether a tunnel is wanted as well is easier to judge once players can fly. The two do not conflict (a plane flies far above, the tunnel is below the sea), and the flight code does not touch the ground model below the surface.

## Through a mountain

A tunnel under the Blue Mountains (a ridge about 18 units high) is stage 2's mechanism on land: a portal on each side, a tube whose roof must stay under the ground over the whole length (the real heights in `jamaicaDem.js` decide), a road or rail inside. It does not touch the sea or the presence bounds, and it is where the real terrain of task 17 pays off. I would evaluate the exact route with the heights once task 17 is done.

## Recommended next steps

1. **The spike is finished** (above): it answers both visual unknowns. What it adds to stage 1 is the terrain cut at the portals.
2. If it looks right, **stage 1** as its own pull request after tasks 17 and 18.
3. Decide on **stage 2** after stage 1 has been played.
