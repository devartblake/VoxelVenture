# Keeping the look and the frame rate: what was researched, what was built, what was measured

Written for: the owner and developers. Made 2026-11-17, after the owner asked whether the models' medium-to-high look can be kept without sacrificing performance on mobile and desktop, and said to look at what is already out (the web and GitHub) and start on what would help, in order. **The triangle budget is not a hard limit on desktop; mobile must stay smooth.**

## The measurement that decided the order

`scripts/world/measure-ports.mjs` (the development page, desktop and phone profiles, at each port and in the open plain) reported, before any of this:

| | chunks | draw calls | triangles |
|---|---|---|---|
| Kingston, desktop | 19 | 51 | **54,270** |
| Kingston, phone | 8 | 36 | **22,170** |
| the plain, desktop | 25 | 51 | 30,848 |
| the plain, phone | 9 | 22 | 14,750 |

And for the 5 x 5 chunks round Kingston, the ground mesh alone was **36,400 of the 54,000 triangles**; the port's boxes were 4,000 and the models about 9,000. **The ground was the cost, not the models**: a chunk's ground was cut in 4-unit cells (two triangles each), so a flat field was thousands of triangles, and the natural waterline had added more at every coast. 59 per cent of the world's ground cells are flat land far from the coast.

## The measurement after

The same script after the ground merge, the coarse coast on a phone and the mid tier:

| | before (triangles) | after | change | draw calls |
|---|---|---|---|---|
| Kingston, desktop | 54,270 | **41,504** | -24% | 51 |
| Kingston, phone | 22,170 | **15,288** | -31% | 36 |
| Port Royal, desktop | 46,410 | **34,008** | -27% | 54 |
| Port Royal, phone | 22,350 | **12,920** | -42% | 36 |
| George Town, desktop | 19,167 | **13,689** | -29% | 59 |
| George Town, phone | 8,487 | **5,355** | -37% | 26 |
| the plain, desktop | 30,848 | **16,196** | -48% | 51 |
| the plain, phone | 14,750 | **6,028** | -59% | 22 |

(The frame rates the script prints come from a headless browser's software renderer, about 10 to 15 frames a second before and after: they are not a phone's and are not used. Measure on a real phone before judging the smoothness.) Kingston on a desktop is still over 40,000 because the Kingston ring has the port, a river mouth, a bridge and the harbour inlet; the owner has said that is allowed on a desktop. The next saving there is the coast's own cells (partly-kept cells at the cut), not the models.

## What the research found, and what each step did

| Idea (source) | What it is | Status |
|---|---|---|
| **Merge what is flat** (not from the search: from the measurement) | a run of flat land cells far from the coast is one quad | **Built.** Ground triangles fell by 35 per cent at Kingston, 55 per cent on the plain, 13 per cent in the mountains; the 25-chunk ring round the town went from **39,200 to 19,600** triangles and the busiest chunk from 4,930 to 3,400. No change to the look (tested: the same area, nothing facing the wrong way). |
| **A coarser coast on a phone** | the waterline's finer cells (the smooth edge) are only for the desktop (`fineEdge: false` for a phone) | **Built.** A further 20 to 35 per cent of the ground on a phone. |
| **Simplified copies of the models: [meshoptimizer / gltfpack / glTF Transform](https://github.com/flexcompute/meshoptimizer/blob/master/gltf/README.md)** | an offline simplifier makes a lower-triangle copy | **Built, hybrid.** `scripts/world/make-lods.mjs` simplifies the boats, buoy, ramp and palm (up to 65 per cent fewer); but the Kenney models' colour-map seams are borders the simplifier will not collapse (the container only 402 to 308), so the containers and the tanks have **small made models** (72 and 64 triangles: `lib/world/portMid.js`). A phone draws these (`detail: 'mid'`); the boxes are the fallback. |
| **A tier that falls down, never up** | a device whose models did not load draws the boxes, never the heavy ones | **Built, tested.** |
| **[BatchedMesh](https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221) / [batched-mesh-extensions](https://github.com/agargaro/batched-mesh-extensions/)** | many different models in one draw call | **Not built: the measurement says it would buy little now.** A port chunk has about ten model draw calls (the desktop total at Kingston is 51 of the 50 to 100 rule of thumb); a BatchedMesh needs one material and one attribute set, the kits' colour maps differ, and the palm has two materials: about 10 calls would become 4. Revisit if the town's props are baked into chunks. |
| **[InstancedMesh2](https://discourse.threejs.org/t/three-ez-instancedmesh2-enhanced-instancedmesh-with-frustum-culling-fast-raycasting-bvh-sorting-visibility-management-lod-skinning-and-more/69344)** (per-instance culling and a BVH) | culls instances inside a mesh | **Not built.** A chunk already culls as a whole and holds a few dozen instances; it pays at hundreds of thousands (its LOD was marked work in progress). |
| **[Octahedral impostors](https://github.com/agargaro/octahedral-impostor)** | far objects as a billboard baked from many views | **Not built: no object needs it yet.** The baked world has no thousands of trees or buildings (the town's are drawn by the town's components, not chunks). It is the right tool if the countryside gets trees or the town's buildings go through the chunks; the library's demo uses a simplified mesh from 15 to 100 units and an impostor beyond 100. |
| **KTX2 / Basis textures** | compressed textures | **Not needed**: the Kenney colour maps are tiny, and a forum report found KTX2 slow to load on mobile. |

## What a phone draws now

The phone profile mounts 3 x 3 chunks; each chunk's ground is merged and its coast cut in whole cells; a port's models are the small copies. `detail`: `'full'` (a desktop), `'mid'` (a phone), `'low'` (the boxes alone: a device whose models did not load).

## How to check

`node scripts/world/measure-ports.mjs` (with `npm run dev`): the mounted chunks, draw calls, triangles and frame time at each port for both profiles. The tests: `tests/world-chunk-mesh.test.mjs` (the merge and the coarse edge), `tests/ports-models.test.mjs` (the tiers).
