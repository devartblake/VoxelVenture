# The water: depth shading, the seabed and the water column

Written for: the owner and developers. Built 2026-11-16 (option 1 of the plan for "volume" in the water; the other options are listed at the end).

The sea was one flat, translucent navy plane over open ocean with nothing beneath it, so it had no depth to show. It now **looks deep where it is far from land and shallow where it is near**: pale turquoise and clear in the shallows (you see the sand under it), blue further out, deep blue and nearly opaque in the open sea, with a **foam line** where it meets every coast. It is a shader on the existing plane: no new geometry or draw call, and the sea level and every height are unchanged ([datum.md](datum.md)).

## How it works

- **A raster of the signed distance to the coast** (`lib/world/seaDepth.js`, `shoreField`): from the four landmasses' coast outlines in the manifest, one byte a cell (24 units a cell, 263 x 112 cells over the whole ocean, 128 at the coast, up to 255 at 510 units out at sea and down to 0 inland), made once at load in about 0.4 s (a `setTimeout` after the first chunks are mounted). Signed, so a linear filter across the coast is smooth and the coast is exactly where the byte crosses 127.5.
- **The sea material reads it** (`applySeaDepth`, from `StreamedWorld.jsx`): the fragment shader turns the distance into a colour (turquoise to blue to deep blue), an opacity (0.62 in the shallows to 0.93 far out) and a foam line (3.2 units wide, wobbling with the foam clock `uTime` so it moves). Land that no chunk is drawing yet (a chunk not loaded) is drawn as deep water, as the sea always was, instead of showing a pale plane.
- **Off switch:** `?seashade=0` on the game or the development page turns it off, for comparison (`gallery/sea_b.webp` is the old sea).
- **Tested** by `tests/sea-depth.test.mjs`: the raster of a square island (distances out to sea within a cell, a corner, far away, monotone), the shading (deeper and more opaque away from the coast, foam only at the shore), the real world (made in under 3 s, 29,456 cells, the middle of the first causeway is out at sea and its ends at a coast), and the shader patch.

## Honest limits

- The depth is **a look, not a measurement**: the seabed is drawn from a profile of the distance to the coast (option 2 below), not baked, and the game's ground does not read it. Boats, the bridge piers and the tunnel do not.
- The shallows are translucent (0.62), so the baked seabed shows through; where it is a grey beach colour the water looks a little greyish. A seabed colour pass (sand under the shallows) is the next step.
- The raster is made on the main thread at load (0.4 s): a worker would hide it.
- Checked on the development page only (day and night, the coast at the causeway and from above).

## Option 2: the seabed and the water column (built 2026-11-16)

The sea now has a **floor you can see through it**, and the water over it has a thickness.

- **The profile** (`lib/world/seabed.js`): from a coast the seabed stays on the shallows' floor (`SEA_FLOOR - 0.05`, a hair under the baked seabed so they never z-fight) out to 140 units, then falls smoothly to the **ocean floor** (`OCEAN_FLOOR`, -14 in [the datum](datum.md)) by 500 units. It never rises and has no cliff (tested).
- **The mesh** (`seabedMesh`): one vertex for each cell of the coast raster (58,000 triangles for the whole world, made with the raster in about 0.4 s), coloured sand on the shelf, grey-blue and then dark in the deep. A plane at the ocean floor reaches past the raster to the sea's own edge.
- **The water column** (`applySeaDepth`, the same shader): the depth over the seabed at each point and the thickness along the view ray (`depth / cos(view)`) give the light the water takes (Beer-Lambert, `1 - exp(-thickness * 0.20)`): the shallows are clear, so you see the sand; looking across the open sea, or at a low angle, is nearly opaque. The colour goes from turquoise to deep blue by `1 - exp(-depth * 0.16)`. The foam line and undrawn-land rule of option 1 are kept.
- **Off switch:** `?seabed=0` keeps option 1's distance shading alone.
- **Tested** by `tests/seabed.test.mjs` (the profile, the light, the colours, the mesh's size and winding, the shader's uniforms, and the real world).

**Limits:** it is **drawn only**: the game's ground and collision still say the sea is the shallows' floor (`lib/world/terrain.js`), so boats, piers and the tunnel do not read it. The tunnel tube (floor -5.5) pokes through the seabed on the shelf's edge like an immersed tube. The sea is still flat (no waves). Checked on the development page by day.

## What else "volume" could mean (not built)

1. **Waves and swell:** vertex waves, with boats and piers moving through them; this needs the water's height as a function of position and time (about 2 to 3 days).
2. **An underwater view:** a camera below the surface sees a fogged volume (a few more days); the tunnel spike's finding that the sea plane is seen from below applies.
