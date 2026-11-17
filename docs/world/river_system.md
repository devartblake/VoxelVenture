# The town's river and the sea: what a river system needs

Written for: the owner and developers. Written 2026-11-17, after the owner pointed out that the town's river is not connected to the ocean.

**The facts (measured).** Willow Run is a rectangle of inland water, 13 units wide, running north to south down the west of Voxel Town (x about -67), from the land's north edge (z = -187) to its south edge (z = 205). It is a plate of water at the town water (0.026) over the town's slab, with sandy banks at 0.012, five bridges and the boats' sailing area (`layout.rivers`, `lib/sim/vehicles.js`). It **stops at the land's edge**. The coast is **152 units past its south end** (z = 357) and 544 units past its north end, over flat baked ground (the baked chunks round the town are flat at the datum), and the sea is 0.326 lower (-0.3) than the river. So a boat cannot leave the town, and the datum lists "the town water against the sea" as unsettled.

**Why it is a system and not a height.** Joining them means building a river that goes from the town to the sea:

1. **A path:** from the river's south end (-67, 205) to the coast (-67, 357), or to a coast of the owner's choosing; a curve with a mouth, so it is not a straight cut.
2. **A channel in the ground:** the baked ground there is flat at 0, the sea is at -0.3, so the river has to be carved: a bed, banks and a mouth in the chunks along the path (the bake, `scripts/bake-world.mjs`, writes the heights; the chunks along it need a heights grid, and the join with the town's slab and its underlay).
3. **A water surface that falls:** from 0.026 at the town to -0.3 at the mouth (a gentle slope, about 0.2%); its colour and its edge at the shore (the sea's foam and depth shading in `lib/world/seaDepth.js` stop at the mouth and the river takes over).
4. **Boats and collision:** the town's boats sail in rectangles of the layout; the baked world's boats sail where the sea is (`lib/world/terrain.js`, `canStand` in 'boat' mode). The river needs its own water in the terrain, and the boat's height must change along it (`waterLevel`, `lib/world/datum.js`), with a hand-over at the town's edge.
5. **The datum:** the river's surface becomes a layer that falls (a function of the distance along it), and the guard test checks it meets the town water at one end and the sea level at the other.
6. **Other rivers and lakes** (the generator makes one river and lakes for each town; Harbor Town's too) would use the same system.

**What is done now (step 5).** The 0.004 town slab is settled: the baked ground under a joined chunk is lowered under the slab only and eases out over 24 units (`underlayAt`, `lib/world/townJoin.js`), so there is no lip where a joined chunk meets another (before, the whole chunk was lowered 0.08, with its highways). The datum names the two kinds of water (`waterLevel`) and still lists the river against the sea as open, with its real size.

**The plan for all the mainland rivers is in [river_plan.md](river_plan.md)** (14 rivers, the ports, the bridges and the order of work); this page keeps the background and the real data.

## The owner's direction (2026-11-17)

Start from the **mainland**, which already has a town: either from the south end of the existing river, or from real data for the mainland, and plan the whole design with tweaks. Harbor Isle's rivers can reach the sea too **if the data shows that pattern**. The mouth's size is decided once there is a design. There must be a **harbour for boats** and a **shipping port on both large landmasses**.

## The real data (from Wikipedia, read 2026-11-17; "approx." is a calculation, not a page value)

The mainland is Jamaica's shape on its real longitude and latitude, and Voxel Town stands at lon -77.28, lat 18.02: **Clarendon, at May Pen** (`lib/world/worldRecipe.js`).

| River | Coast | Source | Mouth | Length | What it gives the design |
|---|---|---|---|---|---|
| **Rio Minho** | south | Mocho Mountains (706 m) | Portland Point in Clarendon, by Carlisle Bay (no exact coordinates) | 92.8 km (the longest) | **flows SSW through May Pen**: the game's river, and it reaches the south coast |
| Black River | south | Cockpit Country, 18.190, -77.683 | 18.022, -77.847 | 53.4 km | a karst source, an upper and a lower **morass** (marsh and mangrove), a shallow estuary; the one with boat trips; a marsh-delta mouth |
| Rio Cobre | south | Rose Hall Mountain, 17.590, -76.523 | Hunts Bay, Kingston Harbour, 17.984, -76.860 | 51 km | a **gorge**, a dam, old bridges; **enters a harbour** |
| Great River | north | near Pisgah, 18.207, -77.884 | Great River Bay, west of Montego Bay, 18.450, -77.992 | 92 km (some sources 74) | rafting; the Montego Bay side |
| White River | north | n/a | Ocho Rios, 18.416, -77.072 | n/a | a short river with a bridge near its mouth |
| Hope, Yallahs, Rio Grande, Martha Brae, Rio Bueno, Milk, Wag Water, Cabarita, Plantain Garden | various | one coordinate each | not given | not given | only a position each; the Plantain Garden River is the only major one that does not run north or south |

**The ports.** **Kingston Harbour** (17.95, -76.80): an almost landlocked natural harbour about 16 km by 3.2 km, closed by the **Palisadoes** (a sand spit that carries the airport and Port Royal), with the Rio Cobre entering at its inner end; the Kingston Container Terminal is the country's largest port. Port Royal (17.94, -76.84) sits at the harbour mouth. **Not read** (the pages could not be found): the Port of Kingston page, Montego Bay, Ocho Rios, Port Antonio and the bauxite ports.

**Grand Cayman (Harbor Isle): the data does not show a river pattern.** It has **no permanent surface rivers** (it is listed among the places without them); it is flat (18 m at most) with a large central mangrove wetland (about 17.8%). The pages read do not describe its North Sound or canals. The port of George Town (19.296, -81.382 is the town; no port coordinate was found) takes cruise ships at anchor, tendered ashore, and cargo ships at the Port Authority's quay. So **Harbor Isle gets no river by default**: its water should be the North Sound lagoon and mangrove channels (and perhaps canals), unless the owner chooses otherwise.

## The design (proposed; to be confirmed by the owner)

1. **The first river is Willow Run as the Rio Minho:** it keeps its place down the west of the town and continues south over the flat ground to the coast (152 units), widening into a river mouth on the south coast, as the real one reaches Carlisle Bay. Its length in the game is short, so the rest of the river (north of the town, towards the Mocho Mountains in the hills) can run up into the central hills as a stream, so it has a source.
2. **The system:** the mainland gets a small set of rivers from the real pattern: the Rio Minho (the south one, through the town); a **Black River** (west, with a marsh delta: a morass with shallows) as the boating river; a **Rio Cobre** (east, a gorge into the **harbour**); and a north-coast river or two (Great River, White River: short, steep, rafting). Each is a path (a centreline, a width and a fall), carved into the baked ground, with a mouth.
3. **The harbour and the ports:** **the mainland's shipping port** at the big south-coast harbour (the Kingston model: a bay closed by a spit, with a river entering at its end and a container quay), with a boat harbour for the small boats (the Port Royal/fishing role). **Harbor Isle's shipping port** at George Town on the west coast (the cargo quay and the cruise anchorage), beside the harbour the island already has.
4. **Water levels:** a river's surface falls from the town water (0.026) at the town to the sea (-0.3) at the mouth, so every river's height is a function of its distance along it (`waterLevel`, the datum).
5. **Order of work:** (a) the river path and the channel carved in the ground (the bake), (b) the water surface and its mouth, (c) boats and collision through the mouth (`terrain.js`), (d) the harbour and the shipping port (quays, a container yard, cranes from the Kenney kits where they fit), (e) the other rivers and Harbor Isle's port.

**Still to decide with the owner:** the mouth's width (after the design is in place), whether the Black River's marsh delta is built (a morass is a big wet area, not a channel), whether Harbor Isle gets canals, and whether the baked world is re-baked for it (it changes chunk data, so it needs the freeze exception and a new bake).
