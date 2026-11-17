# The roads' asphalt and lines

Written for: the owner and developers. Built 2026-11-17.

The baked roads were a flat slate colour (the streets) and a flat amber (the highways), nothing like the old town's streets, which are dark asphalt with a white dashed line down the middle ([Road.jsx](../../apps/web/components/city/Road.jsx)). They now look like roads: dark asphalt with a real grain, a dashed centre line and, on a wide road, two edge lines.

## What it is

- **The asphalt:** ambientCG's **Asphalt031** (CC0: [provenance](../licences/ambientcg/README.md), [credits](../../CREDITS.md)), `apps/web/public/world/ground/asphalt.jpg` (512 x 512, 78 KB). It is laid over the road colour as *detail*: each texel is divided by the texture's own average, so it only adds grain and the road colour (`#313a49` a street, `#3a4352` a highway, a little lighter than the town's `#1f2937` so the grain shows) decides the shade, as the ground's texture does ([streaming_runtime.md](streaming_runtime.md)). It tiles every 5 units, twice (a second, larger sampling) so it does not repeat in rows, and fades out between 260 and 640 units from the camera (a far road is a plain colour: no shimmer).
- **The lines:** drawn in the shader from a per-vertex attribute, **`roadUv`** (3 floats a vertex, made by `lib/world/chunkMesh.js` for every ribbon: the distance from the centre line, the distance along the road, the road's half width). So they are the same on a road of any width and need no texture. **A dashed centre line** (7 units a dash and a gap, 3.6 on, 0.26 wide): **white on a street** (the town's line colour) and **amber on a highway** (the highways' old colour, kept as their line). **Two white edge lines** (0.42 in from each edge) on a road whose half width is 2.9 or more: the ring and spur highways and the causeways, not a street, an arterial or a link. The lines fade out between 170 and 380 units.
- **Where:** `lib/world/roadTexture.js` (the settings, `ribbonRoadUv`, `lineAt`, the shader patch `applyRoadTexture`), `lib/world/chunkMesh.js` (the coordinates), `lib/world/chunkObject.js` (the attribute and the colours), `apps/web/components/world/StreamedWorld.jsx` (loads the texture and applies it).
- **Off switch:** `?roadtex=0` keeps the old flat colours (the textured and plain highway are in `gallery/road_a.webp` and `road_b.webp`).
- **Tested** by `tests/road-texture.test.mjs`: the settings, a ribbon's coordinates, the lines, the real chunks' meshes (every vertex has its coordinates, each ribbon is `[+h, -h, +h, -h]` going along), the materials' new colours and the shader.

## Honest limits

- A dash restarts at each baked road segment (a segment is one straight road between two points), so where two segments join the pattern can have a short or a long gap; it is not carried round a corner. A junction has no special markings (two roads just overlap).
- The bridges drawn from the Kenney, suspension and arch models keep their own surface; only the baked ribbon roads (the roads, the highways, and a causeway's ribbon where no bridge model is drawn) get the lines.
- The racing circuit has its own paint (`track.js`) and is not changed. The old town's roads are not changed either (they are meshes of their own).
- Checked on the development page by day. The grain is subtle by design (a tarmac, not a pattern); at the roads' real width (2 to 8 units) the lines are the part you see.
