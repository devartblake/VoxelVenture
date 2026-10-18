# Feasibility study: a big, authored world with cities, an island, an ocean and a shipping yard

Written for: you, deciding whether to build one large hand-designed world map out of several cities, with an island, an ocean and a shipping yard, streamed in as you move. Everything here was measured on the current code unless it says "estimate". The scripts that produced the numbers are in `scripts/study/`; the prototype is in `apps/web/components/city/StreamedNetwork.jsx` (open the game with `?stream=64` to try it).

## 1. Short answers

| Question | Answer |
| :--- | :--- |
| Can the map be bigger? | **Yes, up to about 2× the area today without changes**; about 4× loads but is too heavy (487 MB of JS heap, 14–18 s to the first frame). Beyond that it needs streaming. |
| Can different sections be streamed in on one world map? | **Yes, and it is the right way to build it.** A prototype that mounts only the road network near you cut the objects in memory from 40,463 to 12,935 (3×3 chunks) and to ~900 after walking to a quiet corner. A finished version would be much cheaper because chunks would be baked offline. |
| Does the world have to be generated? | **No, and it should not be.** The generator becomes a tool that produces a starting point; the shipped world is a fixed, authored data set. A side benefit: a saved game can never be invalidated by a generator change again (it has been, several times). |
| Can there be an island with an ocean and a shipping yard? | **Yes.** All three are feasible with the current renderer, collision and sailing code; none is a blocker. About 6–8 working days for the island, ocean and port together, on top of the world-format work. |
| Biggest world? | With streaming, about **10 cities of today's size** (each ~500 × 450 units, ~5,000 plots) plus ocean is a realistic target; the limits are then the size of the data files and floating-point precision (keep coordinates within about ±8,000 units, or re-base the origin), not memory. |

## 2. What was measured

### 2.1 The generator, collision map and traffic (Node, `scripts/study/scale.mjs`)

A scale `k` gives k times as many avenues and as many columns of plots. (The real generator now has this switch: `NEXT_PUBLIC_MAP_SCALE`.)

| k | avenues | land (units) | plots | roads | junctions | generate | heap | **save (plots + ads)** | collision rects | traffic build | traffic step |
| :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| 1 | 8 | 297 × 287 | 709 | 40 | 119 | 60 ms | 6 MB | 255 KB | 1,185 | 6 ms | 0.14 ms |
| 2 | 16 | 415 × 288 | 1,902 | 63 | 283 | 164 ms | 17 MB | 696 KB | 1,658 | 13 ms | 0.13 ms |
| 4 | 32 | 561 × 476 | 6,235 | 88 | 783 | 737 ms | 39 MB | 2.2 MB | 3,494 | 27 ms | 0.11 ms |
| 6 | 48 | 724 × 582 | 13,009 | 113 | 1,575 | 2.1 s | 53 MB | 4.7 MB | 5,403 | 48 ms | 0.14 ms |
| 8 | 64 | 824 × 812 | 21,702 | 142 | 2,917 | 4.3 s | 94 MB | 7.8 MB | 8,717 | 82 ms | 0.13 ms |
| 12 | 96 | 1,184 × 1,024 | 47,927 | 190 | 5,871 | 13.7 s | 243 MB | **17 MB** | 15,726 | 212 ms | 0.13 ms |

Findings:
- The generator itself scales well (about n^1.5) and produced a valid network at every size (every road ended at a junction). It stays under half a second up to 3×.
- The **traffic simulation costs the same at any size** (it only simulates its 60 cars). Collision lookups grow from 1.9 µs to 27 µs per call: fine.
- **The save is the first wall.** The game saves all plots in the browser's storage (about 5 MB): that fails above ~6× and must change anyway (save only what the player changed).
- A real bug showed up: with more than 8 streets the generator ran out of street names and the road labels crashed the page. Fixed (extra streets are numbered: "Byte St 2").

### 2.2 In the browser (headless Edge, software rendering, `scripts/study/render.mjs`)

| k | plots | first frame | draw calls | triangles | JS heap | scene objects |
| :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| 1 | 722 | 6.9 s | 776 | 252 k | 91 MB | 6,000 |
| 2 | 1,922 | 7.8 s | 581 | 432 k | 177 MB | 13,344 |
| 4 | 6,193 | 14.3–18 s | 227–318 | 1.03 M | 463–487 MB | **40,463** |

Draw calls do **not** grow (the roads and plots are merged and instanced). What grows is the number of **objects in memory**: each lamp, dash and crossing stripe is still a React node and a three.js object, kept even after it is merged into a batch. That is 40 thousand objects and half a gigabyte at 4×, and it is what makes the first frame slow. Frame rates in headless Edge are software-rendered and only good for comparing the rows (3.6, 2.8, 1.6 fps).

Practical limit without streaming: **2×** on a desktop (about 1,900 plots, 180 MB). A phone should stay at 1×.

### 2.3 The streaming prototype (`scripts/study/stream.mjs`, at 4×)

The road network (about nine tenths of the objects) is cut into 64-unit chunks, each its own baked batch; chunks near the camera or avatar are mounted, the rest are not.

| | first frame | objects | triangles | JS heap |
| :--- | :-: | :-: | :-: | :-: |
| whole network | 18.0 s | 40,463 | 1.03 M | 463 MB |
| 5 × 5 chunks (320 units) | 10.7 s | 30,739 | 749 k | 406 MB |
| 3 × 3 chunks (192 units) | 9.2 s | 12,935 | 651 k | 210 MB |
| ...after walking to a quiet corner | | 876–2,899 | | |

Teleporting across the map swapped the chunks (20 unmounted, 4 mounted) with no errors. The prototype is crude: it still builds every lamp as an object inside each chunk, and the first frame still pays for the plots and everything that is not the road network. It shows the direction works, not the final numbers.

## 3. How a streamed, authored world would work

**The world is data, not code.** Today `generateCity(seed)` runs in the browser. In the new design a build step (`scripts/bake-world.mjs`) produces the files the game ships:

```
apps/web/public/world/manifest.json       regions (cities) with names, borders, a land mask, the ocean, ids
apps/web/public/world/chunks/<cx>_<cz>.bin  baked chunk: merged geometry, plot / road / junction records
apps/web/public/world/overview/<cx>_<cz>.png  a flat picture of each chunk, for the far views and the map
```

- **Authoring.** Each city starts as a generated city (seed + scale + hand-picked options), is placed on the world grid, then edited by hand; the reserved-site designer already shows how edits go into the data. Highways, bridges and railways between cities are drawn on the world grid. The editor can start as scripts and JSON and become a visual tool later (the largest open-ended cost: 1–3 weeks).
- **Chunks.** A 64–128 unit square holds its own roads (cut at its edges), junctions, plots, lots, trees and ground patches. The runtime keeps a ring of them loaded (smaller on phones), fetches the next ring ahead of you, and disposes the ones left behind. Because chunks are **baked to merged geometry offline**, a chunk is about ten meshes, not fifteen hundred objects: that is what makes the objects-in-memory problem go away. A chunk is roughly 11 k triangles and under 1 MB raw (about 100 KB compressed).
- **Far views.** The Overview and Top-down cameras and the mini-map show the baked picture of unloaded chunks, so you can see the whole world without loading it.
- **State.** Plot ids become global and permanent; the save holds only what the player changed (owned plots, Gold, vehicles), which also fixes the save-size wall. Today a saved game is thrown away whenever the generator changes; with a fixed world that cannot happen.
- **What must become region-aware** (each is a contained change): collision (a spatial index instead of one list), traffic and walkers (a network per region, simulated near you; cars stay in their city, highways need their own lanes), planes (flights between airports in different cities), the daily chest, scavenger hunt and Plot of the Day (per city), search and Places (a world index), multiplayer (a room per region or chunk; the view radius already limits what is sent), the camera's far planes and shadow area (the shadow box is fixed at 300 × 300 today and must follow the camera), the mini-map.
- **Precision.** Float32 positions are exact to about 0.002 units at ±8,000; the ground's thin layers sit 0.003 apart. Beyond that, re-base the origin on the chunk you stand in.

## 4. The island, the ocean and the shipping yard

All three build on things that exist.

- **Island.** The land is a rectangle today (`layout.land`). Make it a coastline: a rounded outline around the content, bumped outwards by noise (never inwards, so nothing built can fall in the sea). Rendering: an extruded land shape and a beach strip instead of the box. Collision: a point-in-polygon test next to the existing rectangle list. A rounded rectangle of radius up to 3.4× the margin keeps every corner of the city inside it. The river already runs wall to wall, so it simply reaches the coast as a river mouth. ~2 days.
- **Ocean.** One very large water plane at the river's height (so rivers and lakes join it with no seam), a gentle animated colour, fog to blend the horizon, and the far planes raised. The sailing code already works on any water you describe: extend `waterRects` to "the ocean polygon", and the boats, fishing and the fish table work at sea. Ocean-only fish and a harbour for the boats are cheap additions. ~1–2 days.
- **Shipping yard.** A port site flush to the coast with a road in (the airports' loop-and-spur code is the model): a quay, a few gantry cranes, container stacks (instanced coloured boxes: thousands for one draw call), warehouses, and cargo ships, some moored and some sailing a loop in the ocean (a small "ships" module like the planes' flight module). Ships cross the water on timed paths and can be seen from the follow cameras. Because the coast is a mask, the port is one more authored block. The yard is also where a player could one day sail to other cities by sea. ~3–4 days for the yard, 1–2 more for moving ships.
- **Cities on one map.** Each is a region in the manifest with its own districts and name; a harbour city, an inland city and an island city differ by their data, not their code.

## 5. Risks and unknowns

- **Real devices.** All timings are software-rendered or Node timings. Phones need a smaller chunk ring and need testing on hardware (the client monitor reports real frame rates).
- **The streaming window is the new hot spot**: loading a chunk must not hitch the frame (decode in a worker, mount one chunk per frame).
- **Traffic across regions** is the least defined part: cars that leave a city, highways, and what happens when you drive a car across the border.
- **Authoring effort** is the biggest unknown. A visual world editor is a product in itself; a scripted pipeline is cheap but needs patience.
- **The interior and Pascal viewer** is per building and is not affected by world size.

## 6. Recommendation and plan

1. **Keep the generator as a tool; make the shipped world fixed data.** (decision)
2. **Phase 1, world format and bake (3–4 days):** manifest, chunk files, a loader that gives the existing components the same shapes they use now; global plot ids; save only the player's changes.
3. **Phase 2, streaming runtime (4–5 days):** chunk manager, offline-merged chunk geometry, overview pictures, spatial collision index, shadow and far-plane following, mini-map from the overview, region-aware traffic, planes and daily features.
4. **Phase 3, coast and ocean (3 days).**
5. **Phase 4, port and ships (4–5 days).**
6. **Phase 5, world editor:** start scripted; decide later whether to build a visual editor.

Already done in this study and kept: `NEXT_PUBLIC_MAP_SCALE` (the generator can make larger maps), numbered street names, the `?stream=` prototype, the study scripts.

## 7. Revision: the world will be one fixed design, with the database holding ownership

Decisions since the study: ownership and statistics go to a database (so the browser's save-size limit stops mattering), the generator is used to **create each city once** (roads, streets, plots) and place them on one authored map, street names come from real cities through an **offline** script, and highways and the shipping yard are generated too.

| Item | Study estimate | Now | Why |
| :--- | :-: | :-: | :--- |
| Save-size rework | ~1 day | 0 | the database holds ownership; it must deliver it per chunk (inside the streaming work) |
| World editor | 1-3 weeks, open-ended | ~2-3 days | a world *recipe* (cities with position, size and seed; coast; highways; port) plus a preview page |
| Street names from OpenStreetMap | not planned | ~1 day, off the critical path | an offline Python script (Overpass or a downloaded extract; the Nominatim public API forbids bulk use); keep the ODbL attribution and check share-alike for a names-only dataset. **Done since:** `scripts/streets/road_generator.py`, see [street_names.md](street_names.md) |
| Several cities on one map | in the editor | ~2 days | the generator already makes a city per seed and size |
| Highways between cities | hand-drawn | 3-4 days | generate gateways, connect them over land, bridge rivers, add a fast-road class to traffic |
| Streaming runtime, coast and ocean, port and ships | 4-5 + 3 + 4-5 days | unchanged | |

Total about **20-24 days** (was 20-30 with an editor); a vertical slice (one island, two cities, a highway, a port, streaming) is about 10-12 days. Real mountains (a non-flat world) would be a separate 4-6 day project; start with decorative hills (done since: the north-east hills, `lib/city/hills.js` and `apps/web/components/city/Hills.jsx`).
