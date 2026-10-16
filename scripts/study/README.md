# Feasibility-study scripts

Run from the project root. They measure; they change nothing in the project (the build ones overwrite `.next`: run `npm run build` afterwards).

| Script | What it measures |
| :--- | :--- |
| `node --expose-gc scripts/study/scale.mjs 1,2,4,8` | The generator, the collision map and the traffic simulation at map scales k (k times as many avenues and columns), on scratch copies of `lib/`. Time, plots, roads, junctions, memory, save size. See the note below: today this needs `NEXT_PUBLIC_MAP_SCALE` set |
| `node scripts/study/render.mjs 1,2,4` | Builds the app at each scale (`NEXT_PUBLIC_MAP_SCALE`), loads it in headless Edge and reports the time to the first frame, draw calls, triangles, geometries, JS heap, scene objects and frame rate |
| `node scripts/study/stream.mjs 4` | At one scale: the whole road network against the streamed one (`?stream=64&radius=2` and `radius=1`), and what a teleport across the map does |
| `node scripts/study/infill.mjs` | The cost of the new streets and the amusement park ([infill_and_land.md](../../docs/infill_and_land.md)): the old city, with the new streets, and with the streets and the park, in Node (about a minute). Add `--browser` to also build each variant (`NEXT_PUBLIC_INFILL`, `NEXT_PUBLIC_AMUSEMENT`) and measure it in headless Edge |

Headless Edge renders in software, so frame rates are only good for comparing runs with each other.

**`scale.mjs` and `NEXT_PUBLIC_MAP_SCALE`.** The script scales its copy of the generator by editing constants in `cityGenerator.js`. Since the study, the generator reads the scale from `NEXT_PUBLIC_MAP_SCALE` itself (1 to 12), so those edits no longer match and every k measures the default map. Until the script is updated, run it once per scale with the variable set to the same k, then clear it so a later build is not scaled:

```powershell
$env:NEXT_PUBLIC_MAP_SCALE = '4'; node --expose-gc scripts/study/scale.mjs 4; Remove-Item Env:NEXT_PUBLIC_MAP_SCALE
```
