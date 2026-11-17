# The water: depth shading

Written for: the owner and developers. Built 2026-11-16 (option 1 of the plan for "volume" in the water; the other options are listed at the end).

The sea was one flat, translucent navy plane over open ocean with nothing beneath it, so it had no depth to show. It now **looks deep where it is far from land and shallow where it is near**: pale turquoise and clear in the shallows (you see the sand under it), blue further out, deep blue and nearly opaque in the open sea, with a **foam line** where it meets every coast. It is a shader on the existing plane: no new geometry or draw call, and the sea level and every height are unchanged ([datum.md](datum.md)).

## How it works

- **A raster of the signed distance to the coast** (`lib/world/seaDepth.js`, `shoreField`): from the four landmasses' coast outlines in the manifest, one byte a cell (24 units a cell, 263 x 112 cells over the whole ocean, 128 at the coast, up to 255 at 510 units out at sea and down to 0 inland), made once at load in about 0.4 s (a `setTimeout` after the first chunks are mounted). Signed, so a linear filter across the coast is smooth and the coast is exactly where the byte crosses 127.5.
- **The sea material reads it** (`applySeaDepth`, from `StreamedWorld.jsx`): the fragment shader turns the distance into a colour (turquoise to blue to deep blue), an opacity (0.62 in the shallows to 0.93 far out) and a foam line (3.2 units wide, wobbling with the foam clock `uTime` so it moves). Land that no chunk is drawing yet (a chunk not loaded) is drawn as deep water, as the sea always was, instead of showing a pale plane.
- **Off switch:** `?seashade=0` on the game or the development page turns it off, for comparison (`gallery/sea_b.webp` is the old sea).
- **Tested** by `tests/sea-depth.test.mjs`: the raster of a square island (distances out to sea within a cell, a corner, far away, monotone), the shading (deeper and more opaque away from the coast, foam only at the shore), the real world (made in under 3 s, 29,456 cells, the middle of the first causeway is out at sea and its ends at a coast), and the shader patch.

## Honest limits

- The depth is **a look, not a measurement**: open ocean has no seabed (the baked ground only slopes to -1.5 beyond a coast: [datum.md](datum.md)), so the shading follows the distance from the coast, not a real depth. Boats, the bridge piers and the tunnel do not read it.
- The shallows are translucent (0.62), so the baked seabed shows through; where it is a grey beach colour the water looks a little greyish. A seabed colour pass (sand under the shallows) is the next step.
- The raster is made on the main thread at load (0.4 s): a worker would hide it.
- Checked on the development page only (day and night, the coast at the causeway and from above).

## What else "volume" could mean (not built)

1. **A visible seabed and water column:** draw the shallows' seabed and an ocean floor so the sea reads as a volume you can look down into (about 2 days).
2. **Waves and swell:** vertex waves, with boats and piers moving through them; this needs the water's height as a function of position and time (about 2 to 3 days).
3. **An underwater view:** a camera below the surface sees a fogged volume (a few more days); the tunnel spike's finding that the sea plane is seen from below applies.
