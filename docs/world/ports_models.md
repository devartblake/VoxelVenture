# The ports' Kenney models, and what a phone draws

Written for: the owner and developers. Built 2026-11-17, after the owner asked for the Kenney kits at the ports and harbours and said the triangle budget is not a hard limit on desktop but **mobile must still run well**.

## What is used (all CC0; [credits](../../apps/web/public/models/CREDITS.md))

| Model | Kit | Triangles | Where | Scale |
|---|---|---|---|---|
| shipping-container a, b, c | City Kit (Industrial) | 402 each | the **front row** of each container yard (the one you see from the quay), three kinds in turn | 4.4 (a container is 3.6 long) |
| detail-tank-large | City Kit (Industrial) | 566 | the tank farm at an end of the Kingston quay | 2.7 |
| boat-row-small and -large, boat-fishing-small, boat-sail-a, boat-speed-a | Watercraft Kit | 156 to 386 | moored on both sides of the Port Royal finger piers, and at the quays | the town's boat scales (0.8 to 0.95) |
| boat-tow-a (a tug) | Watercraft Kit | 576 | alongside the shipping quays | 1.0 |
| buoy | Watercraft Kit | 118 | the channel out from each port | 1.0 |
| ramp-wide | Watercraft Kit | 128 | Port Royal's slipway | 1.4 |
| barrel, crate | Pirate Kit | 148, 76 | on the quay decks | 0.5 |
| tree_palm | Nature Kit | 186 | along the shore behind the promenades and terminals | 2.2 |

**Not used:** the Car Kit's trucks (2,082 to 2,476 triangles each: too heavy for the effect), the Commercial buildings (1,250 to 1,500: a terminal is a box for now), the Train Kit (1,261 for the train). **Not in any kit we have:** gantry cranes, large ships, lighthouses, warehouses, quay walls: the cranes, the quay and the warehouses stay boxes. The models' origins are at the middle of their base and they face +Z (measured from the files), so a model is placed at its point and turned about its middle: `yaw = atan2(dx, dz)` of the direction its long axis should lie along.

## How they are drawn

- The ports (lib/world/ports.js) make `props` for the models, besides the boxes: `{ m, x, y, z, yaw, s, d: 1 }`, baked into the chunk's `props` with their own height `y` (a boat on the water at -0.34, a crate on the deck at 0.5, a container on another). The chunk builder instances each kind from the loaded model (sharing its geometry and material; the loader keeps the colour map's uv for these kits).
- A box that a model replaces carries a tag (`replaced`, the 11th number of the box). **When the models are drawn the box is left out; when they are not, it is what is drawn.**
- `d: 1` marks decoration that has no box: the boats, buoys, cargo and palms.

## The three tiers and the mobile rule

`buildChunkObject(..., { detail })`: **`'full'`** (a desktop, the overview) draws the Kenney models; **`'mid'`** (the **phone profile**) draws their small copies: made models for the containers (72 triangles) and the tanks (64: `lib/world/portMid.js`) and simplified Kenney copies of the boats, buoy, ramp and palm (`scripts/world/make-lods.mjs`, in `public/world/lod`, flat shaded, up to 65 per cent fewer triangles); **`'low'`** draws no model: the replaced boxes stay and the decoration is left out (a device whose models did not load). A tier whose models are missing falls to `'low'`, never up. The phone also cuts the coast in whole cells (`fineEdge: false`). So (before the ground was merged and the mid tier existed, in the first version of this page):

| | Triangles |
|---|---|
| the Kingston chunk with the container yard, on a **phone** | **3,200** (the boxes alone) |
| the same chunk on a **desktop** | about 10,200 (7,200 of them models) |
| the worst port chunk on a phone | under 1,800 |
| a port's models, desktop | under 20,000 (tested), about 7,000 to 8,000 in practice |

**With the mid tier** the Kingston chunk is about 6,300 triangles on a phone (the boxes alone 3,900, the small models 2,400) against about 13,000 on a desktop (9,300 of them models); and the whole phone view at Kingston is **15,300 triangles** (it was 22,200), see [performance.md](performance.md). The ground, not the models, was most of the cost: a chunk's flat ground is now merged into long quads.

The phone profile mounts a ring of one chunk (3 x 3, at most 16), so a phone near a port draws a few thousand port triangles on top of the ordinary ground; the desktop ring (5 x 5) near a port is the heavy case, and the owner has said that is allowed. Checked by `tests/ports-models.test.mjs` (a phone draws exactly what a world without the models draws; the desktop replaces the boxes; the instances share the model's geometry; a boat is at the sea level and a container on the deck) and `tests/ports.test.mjs` (every model is on the water or the land it should be, none in a river, under 20,000 triangles a port).

## Placement

A port searches the coast from its planned point for the nearest place where no box stands in a river channel or on a road and no other port is near ([river_plan.md](river_plan.md)). The Kingston tank farm is an end-of-quay choice: both ends, or one where the other would stand in the Rio Cobre's channel (the first try with both ends moved Kingston 150 units away; one end keeps it where the plan has it).
