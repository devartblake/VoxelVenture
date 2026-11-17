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

**Decisions for the owner before it is built:** which coast the river reaches (the south one is 152 units away); whether Harbor Town's river should reach the sea too; how wide the mouth is and whether it is a harbour for the boats; and whether the baked world is re-baked for it (it changes chunk data, so it needs the freeze exception and a new bake).
