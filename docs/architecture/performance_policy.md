# Performance and capability policy

**Date:** 2026-10-19  
**Status:** Implemented (Track C of the [adoption plan](external_voxel_repositories_adoption_plan.md), section 8; PR 5 of section 13). The budgets below are proposed; they become the pilot's agreed budgets once they are checked on a real phone and a mid-range laptop ("Measuring on a real device").  
**Freeze status:** allowed. This is performance and accessibility work ([world_freeze.md](../roadmap/world_freeze.md)): nothing new is added to the city, and no new file is added in a frozen folder.

The city decides how much to draw in one place, from what the device can do and how fast it actually runs, instead of checking for a touch screen in several components. The decision is deterministic, can be forced with `?quality=`, and shows in the diagnostics.

| Piece | File | What it does |
| --- | --- | --- |
| Capability profile | [`lib/performance/capabilityProfile.js`](../../lib/performance/capabilityProfile.js) | Reads the pointer (coarse or fine), pixel ratio, viewport, `prefers-reduced-motion`, the memory and core hints, and the GPU's WebGL renderer string. Also holds the frame-time window and its percentiles. Pure apart from the reader |
| Quality policy | [`lib/performance/qualityPolicy.js`](../../lib/performance/qualityPolicy.js) | Pure. Profile in, tier out: `high`, `medium` or `low`, each with declarative settings. Steps the tier down and back up from the measured frame rate, with hysteresis. Also holds the budgets |
| Visibility policy | [`lib/performance/visibilityPolicy.js`](../../lib/performance/visibilityPolicy.js) | Pure. Says when each class of frame loop runs: every frame, every Nth frame, or not at all |
| Runtime | [`lib/performance/runtime.js`](../../lib/performance/runtime.js) | Wires the policies to the page. The `useQuality` store; `useGatedFrame` (a `useFrame` for one class of loop); the quality director; the gate that draws the world; and the fixed-spot measurement |
| Measurement spots | [`lib/performance/measureSpots.js`](../../lib/performance/measureSpots.js) | Pure. The fixed camera spots, from the city's layout |
| Tests | [`tests/performance-policy.test.mjs`](../../tests/performance-policy.test.mjs), [`tests/browser-touch.test.mjs`](../../tests/browser-touch.test.mjs) | The rules in Node; touch, keyboard and the policy in a real browser |
| Measurement | [`scripts/perf-measure.mjs`](../../scripts/perf-measure.mjs) | Frame times, draw calls and triangles at fixed spots, for each tier, written as JSON and Markdown |

What it never touches: selecting a plot, its card and call to action, attribution, and the no-WebGL page (section 8.4 of the plan). Those do not read the tier. The lowest tier still draws every plot, billboard, banner and label. It only animates decoration less often, draws at a lower pixel ratio, without shadows, and with fewer countryside trees.

## 1. Inventory of the frame loops

Every `useFrame` callback in the app, and its class. Each class has its own rule in `visibilityPolicy.js`:

- **continuous-visible:** what the visitor controls or watches now. Runs every frame.
- **continuous-pausable:** decoration and ambient simulation. Paused while the world is covered, and throttled by the tier and by zooming out. A decorative animation (an ornament) is also held still for reduced motion.
- **event-driven:** a poll that only acts when something changed. Cheap; runs every frame.
- **diagnostics-only:** the renderer counters. Run at the tier's sampling rate.

All of them stop while the tab is hidden; the browser stops frames then anyway. In the city, each callback goes through `useGatedFrame(LOOPS.<class>, …)`. The policy test fails if a city component calls `useFrame` directly.

| # | File | Callback: what it does | Class | Loop description |
| --- | --- | --- | --- | --- |
| 1 | `city/Avatar.jsx` | Walks the avatar: keys, joystick, click target, collisions, vehicle seat, the camera follows a driven car; updates the interact prompt | continuous-visible | `visible` |
| 2 | `city/FollowCamera.jsx` | The follow and first-person cameras: position, look, near plane | continuous-visible | `visible` |
| 3 | `city/Vehicles.jsx` | The driven car or boat, the fishing rod and line, moored boats rocking | continuous-visible | `visible` |
| 4 | `city/RouteFollower.jsx` | Walks the avatar along a world-map route; pulses the waypoint beam | continuous-visible | `visible` |
| 5 | `city/RemotePlayers.jsx` (one per player) | Smooths other players between server updates; walk cycle and emotes | continuous-visible | `visible` |
| 6 | `interior/RoomWalker.jsx` | The avatar walking inside a storefront (the interior's own canvas, mounted only while it is open) | continuous-visible | plain `useFrame` (not in the city canvas) |
| 7 | `city/CameraFocus.jsx` | Glides the map camera to a search result; applies the +/- zoom buttons | event-driven | `event` |
| 8 | `city/CameraHeading.jsx` | Tells the compass the camera's heading when it changes | event-driven | `event` |
| 9 | `city/SoundListener.jsx` | Tells the sound where the listener is and how far out the view is | event-driven | `event` |
| 10 | `city/Malls.jsx` (one per mall) | Swaps the shell for the hall when the avatar walks in | event-driven | `event` |
| 11 | `city/StreamedNetwork.jsx` | (`?stream=` prototype) mounts the road chunks near the view | event-driven | `event` |
| 12 | `city/DayNight.jsx` | The sky: light colours and intensities, the sun's position and shadow, the street lamps | continuous-pausable (simulation) | `simulation` |
| 13 | `city/Traffic.jsx` | The traffic simulation (cars, walkers, curved streets) and its instanced meshes | continuous-pausable (simulation, distant) | `distantSimulation` |
| 14 | `city/Animals.jsx` | The countryside animals' simulation and instanced meshes | continuous-pausable (simulation, distant) | `distantSimulation` |
| 15 | `city/Planes.jsx` (one per plane) | A plane's flight, propeller and towed banner | continuous-pausable (simulation, distant) | `distantSimulation` |
| 16 | `city/IntersectionControl.jsx` (one per signalled junction) | The traffic-light lamps (the traffic reads the same signal clock itself) | continuous-pausable (simulation) | `simulation` |
| 17-20 | `city/AmusementPark.jsx` | Ferris wheel, carousel, swings, coaster train | continuous-pausable (ornament, distant) | `distantOrnament` |
| 21 | `city/DailyChest.jsx` | The chest's spinning, bobbing gem and glow | continuous-pausable (ornament) | `ornament` |
| 22 | `city/ScavengerStars.jsx` (one per star) | A star's spin and bob | continuous-pausable (ornament) | `ornament` |
| 23 | `city/River.jsx` (one per river) | The water's shimmer | continuous-pausable (ornament) | `ornament` |
| 24 | `city/Lake.jsx` (one per lake) | The water's shimmer | continuous-pausable (ornament) | `ornament` |
| 25-26 | `city/Plots.jsx` | A prime plot's pennant; the Plot of the Day beacon | continuous-pausable (ornament) | `ornament` |
| 27-28 | `city/PlotMesh.jsx` | The same pennant and beacon for the single-plot mesh | continuous-pausable (ornament) | `ornament` |
| 29 | `city/PerfProbe.jsx` | Copies the renderer's draw calls, triangles, geometries and textures into the diagnostics and telemetry | diagnostics-only | `diagnostics` |

**Counts: 29 callbacks.** 6 continuous-visible, 5 event-driven, 17 continuous-pausable (12 ornament, 5 simulation; 8 of them distant), 1 diagnostics-only. Several components mount once per item, so a city runs more callbacks than this. There is one per signalled junction, star, plane, remote player, mall, river and lake.

The runtime adds two callbacks of its own, both mounted by `PerfProbe`:

- the **quality director**, which runs first (priority -10). It keeps the frame counter and the visibility state, measures the frame rate and steps the tier;
- the **world render gate** (priority 1), which draws the scene. A callback with a positive priority makes React Three Fiber leave the drawing to it.

Outside the canvas, these loops are already throttled and are not in the policy: the mini-map (`ui/MiniMap.jsx`, redraws on its own interval), the compass (`ui/Compass.jsx`, writes to the DOM only on change), the world map (`ui/WorldMap.jsx`, a 2D canvas with its own frame budget) and the telemetry's frame counter (`lib/net/multiplayer.js`). Library loops: drei's `MapControls` updates its damping every frame (continuous-visible).

## 2. Tiers and their settings

| Setting | high | medium | low |
| --- | --- | --- | --- |
| Pixel ratio range | 1 to 1.5 | 1 to 1.25 | 1 |
| Sun shadows (map size) | on (4096) | off | off |
| Decorative animation (ornaments) | every frame | every frame | every 3rd frame |
| Ambient simulation | every frame | every frame | every 2nd frame |
| Distant systems while zoomed out (iso zoom < 9) | every frame | every 2nd frame | every 4th frame |
| Countryside trees and shrubs | all | all | half (a fixed, evenly spread half; nothing collides with them) |
| Ground texture filtering (anisotropy) | 8 | 4 | 2 |
| Diagnostics sampling | every frame | every 2nd frame | every 4th frame |

`high` is exactly what a desktop drew before the policy. `medium` is exactly what a touch device drew: no shadows and a pixel ratio up to 1.25. The one difference is the distant-system rule, which only applies when zoomed out. A desktop with a GPU therefore draws as before by default.

The settings that rebuild things are fixed for the visit once the GPU is known: the canvas's shadow map, the shadow-map size, the tree density and the ground textures. Rebuilding them mid-visit would stutter. A later tier change applies everything else at once: the pixel ratio, the sun's shadow (switched off on the light, as at night), the animation rates and the sampling.

## 3. The rules

### 3.1 The ceiling, from the device

Each rule that applies caps the tier, and the lowest cap wins. Every rule that set it is a reason, shown in the diagnostics.

| Rule | Cap | Reason shown |
| --- | --- | --- |
| WebGL context unavailable | low | `no-webgl` (the city's no-WebGL page normally shows first) |
| The renderer string names a software rasterizer (SwiftShader, llvmpipe, Microsoft Basic Render) | low | `software-renderer` |
| `navigator.deviceMemory` ≤ 2 GB | low | `memory<=2GB` |
| `navigator.hardwareConcurrency` ≤ 2 | low | `cores<=2` |
| `(pointer: coarse)` | medium | `coarse-pointer` |
| Shortest side of the viewport < 600 CSS px | medium | `small-screen` |
| Data saver on (`navigator.connection.saveData`) | medium | `save-data` |
| `deviceMemory` ≤ 4 GB | medium | `memory<=4GB` |
| none of these | high | `capable-device` |

The user-agent string is not read; the policy test fails if it ever is. A phone is recognized by its pointer and screen, and a weak machine by its hints, its renderer and, above all, its measured frame rate.

The profile is read twice. First after the page mounts, without the GPU (the server render cannot know the device). Then when the renderer exists, with the GPU's renderer string (`WEBGL_debug_renderer_info`; Firefox gives a sanitized string).

### 3.2 The measured frame rate, with hysteresis

`?quality=auto` is the default. In auto, the quality director measures windows of about two seconds. A frame counts only while the page is visible, nothing covers the city, it is past a 10-second warm-up, and no tier change happened in the last 3 seconds. Each window gives a typical frame rate: 1000 / the median frame time. The median is used, not the mean, so a few long frames while a model loads do not count as a slow device.

| Step | When |
| --- | --- |
| high → medium | 3 windows in a row below 40 fps (on a 60 Hz display, a median of 33 ms) |
| medium → low | 3 windows in a row below 22 fps |
| low → medium, medium → high | 5 windows in a row above 45 or 52 fps, and never above the ceiling |
| after any change | 2 windows are not counted |
| back to a tier it was dropped from | twice as many windows per earlier drop; after 2 drops, not again this visit |

The floors and the raise thresholds are far apart, so a device near a boundary stays where it is. A device that is fast on medium but slow on high settles on medium after at most two tries. The policy test plays exactly that case. The same readings always give the same tiers.

### 3.3 `?quality=`

`?quality=low`, `medium` or `high` fixes the tier for the visit, with no frame-rate steps. The reason shown is `quality=<tier>`, and the device's ceiling is still reported. `?quality=auto`, the default, uses the rules above. Any other value means auto.

### 3.4 Visibility: pause and throttle

| State | How it is detected | Pausable loops | World drawn |
| --- | --- | --- | --- |
| Tab hidden | `document.hidden` | stopped (every class) | no (the browser stops frames) |
| City covered | the storefront interior is open (`activeInteriorPlot`, a full-screen modal) | stopped | **every 15th frame** (about 4 a second, enough for the blurred city behind the modal) |
| City partly covered | the world map's veil is open; the side panel is open on a small screen | at half their rate | every frame |
| Reduced motion | `prefers-reduced-motion: reduce` (followed live) | ornaments held still; simulations keep moving | every frame |
| Zoomed out | map camera zoom < 9 | distant systems at the tier's distant rate | every frame |
| Low tier | §3.1 and §3.2 | ornaments every 3rd frame, simulations every 2nd | every frame |

A throttled loop gets the time of the skipped frames added together, so the traffic moves at the same speed. A paused loop drops the time and resumes where it stopped. The instances of one component are spread across frames: the 3rd-frame lamps of a hundred junctions do not all run on the same frame.

The world map says that "the world, the traffic and the server clock keep running behind it". They still do, at half rate under the veil. The avatar, its route and the cameras are continuous-visible, and they never slow down.

## 4. Diagnostics and telemetry

- **On screen, with `?diag=1`:** a one-line badge, top left, reads "Quality: low (auto, up to medium)". Tap it to see the reasons, the measured frame rate (fps, p50, p95), the draw calls, triangles, geometries and textures, the pixel ratio, the shadows, the animation level and what is pausing it, the GPU's renderer string, and any tier changes. **Measure** runs the fixed-spot measurement on the device and **Copy** copies the result as JSON. The badge is not shown without `?diag=1`.
- **In the console, with `?diag=1`** (or in development):
  - `window.__vvQuality.getState()` is the whole decision: tier, source, ceiling, reasons, settings, load settings, profile, measured frame rate and changes;
  - `window.__vvFrameGate` is the per-frame state;
  - `window.__vvMeasure()` is the measurement;
  - `window.__vvPerf` now also carries `quality`, `qualityReasons` and `frameP95`.
- **Telemetry:** the `perf` message to the presence server carries `quality`, `qualityReasons` and `frameP95`. These are optional fields of `presence.client.perf`; see the `shared-types` CHANGELOG. The `/admin` monitor shows them in a **Quality** column, with the reasons on hover. The renderer string is not sent: it is shown on the device only.

## 5. Budgets

Proposed, for every measurement spot. The ceiling is the 95th-percentile frame time, and the counts are the mean per frame. They are in `PERF_BUDGETS` (`qualityPolicy.js`), and the measurement marks anything over them.

| Tier | Target device | Frame time p95 | Draw calls | Triangles | Geometries | Textures |
| --- | --- | --- | --- | --- | --- | --- |
| high | a desktop, or a laptop with a good GPU | ≤ 16.7 ms (60 fps) | ≤ 1,200 | ≤ 3.0 M (the shadow pass included) | ≤ 2,500 | ≤ 120 |
| medium | a mid-range laptop; a recent phone | ≤ 25 ms (40 fps) | ≤ 900 | ≤ 1.5 M | ≤ 2,500 | ≤ 120 |
| low | an older or low-memory phone | ≤ 33.3 ms (30 fps) | ≤ 600 | ≤ 1.0 M | ≤ 2,500 | ≤ 120 |

The draw-call limits continue the browser test's limits: fewer than 1,200 on a desktop and fewer than 400 on a phone, both at the default view. The triangle limits on medium and low are targets, not today's figures. Today's frame times are within budget on the desktop below. The zoomed-out spots are over the draw-call budget on every tier. Low is over its triangle budget everywhere, because the triangles come from the building and prop models, which no tier reduces yet (§6, §10 item 2).

## 6. Measured on this machine

**Machine:** AMD Ryzen 9 7950X (32 threads), 31 GB, Windows 11. **GPU (WebGL renderer string):** `ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Ti (0x00001B06) Direct3D11 vs_5_0 ps_5_0, D3D11)`.

**Setup:** headless Edge, 1600x900, device pixel ratio 1, the default city (seed of a fresh visit), a local production build. Each spot had 2 s to settle, then 6 s of frames. Run on 2026-10-20 with `node scripts/perf-measure.mjs`, then with `--uncapped`, which lifts the 60 Hz limit to show the cost of a frame.

Each frame-time cell is p50 / p95 in ms.

| `?quality=` → tier | Spot | 60 Hz | Uncapped | Draw calls | Triangles | Geometries | Textures |
| --- | --- | --- | --- | --- | --- | --- | --- |
| auto → high (`capable-device`) | center | 16.7 / 16.8 | 10.2 / 15.0 | 935 | 2.84 M | 660 | 51 |
| | downtown | 16.7 / 16.8 | 8.6 / 12.7 | 676 | 2.82 M | 674 | 53 |
| | whole-city | 16.7 / 33.3 | 13.0 / 15.8 | 1,381 | 2.90 M | 910 | 84 |
| | airport | 16.7 / 16.8 | 7.4 / 9.9 | 662 | 2.82 M | 910 | 84 |
| | airport-far | 16.7 / 16.8 | 10.2 / 13.3 | 1,129 | 2.89 M | 912 | 86 |
| high | center | 16.7 / 16.8 | 13.8 / 17.7 | 935 | 2.84 M | 660 | 51 |
| | downtown | 16.7 / 16.7 | 12.8 / 16.2 | 675 | 2.82 M | 674 | 53 |
| | whole-city | 16.7 / 16.8 | 21.9 / 34.6 | 1,381 | 2.90 M | 910 | 84 |
| | airport | 16.7 / 16.7 | 15.7 / 34.1 | 662 | 2.82 M | 910 | 84 |
| | airport-far | 16.7 / 16.8 | 22.0 / 34.8 | 1,129 | 2.89 M | 912 | 86 |
| medium | center | 16.8 / 66.7 | 16.3 / 70.4 | 555 | 1.49 M | 528 | 49 |
| | downtown | 16.7 / 50.1 | 11.8 / 168.7 | 292 | 1.47 M | 547 | 51 |
| | whole-city | 16.7 / 16.8 | 21.7 / 207.9 | 1,001 | 1.54 M | 910 | 82 |
| | airport | 16.7 / 16.8 | 14.4 / 138.2 | 282 | 1.47 M | 910 | 82 |
| | airport-far | 16.7 / 16.8 | 31.5 / 226.8 | 752 | 1.53 M | 912 | 84 |
| low | center | 16.7 / 16.7 | 7.7 / 10.8 | 555 | 1.42 M | 528 | 49 |
| | downtown | 16.7 / 16.7 | 4.9 / 7.4 | 296 | 1.40 M | 547 | 51 |
| | whole-city | 16.7 / 16.8 | 8.9 / 12.3 | 1,001 | 1.47 M | 910 | 82 |
| | airport | 16.7 / 16.7 | 5.7 / 9.1 | 282 | 1.39 M | 910 | 82 |
| | airport-far | 16.7 / 16.7 | 9.4 / 11.8 | 751 | 1.46 M | 912 | 84 |

How to read it:

- **At 60 Hz this desktop holds 60 fps on every tier.** The medians are 16.7 ms. The occasional long frames, such as medium's p95 of 50 to 67 ms at the first two spots, came when models and textures were still streaming in. A second high run measured 16.7 ms or better at every spot.
- **Uncapped, the cost of a frame:** high takes 13 to 22 ms per frame at the median, and low 5 to 9 ms. Low's lower pixel ratio, lack of shadows and throttled decoration halve the frame cost. Going from high to medium removes the shadow pass, which halves the triangles (2.8 M to 1.5 M) and cuts the draw calls by a third or more. The uncapped medium run was disturbed by other work on the machine (its p95 of 138 to 227 ms is not repeatable); its medians are the useful figures.
- **Fixed per tier:** the draw calls, triangles, geometries and textures are deterministic. Low draws about 70 k fewer triangles than medium, which is the countryside trees thinned to half. Most of the 1.4 M triangles left are building and prop models.
- **Over budget:** the zoomed-out spots are over their draw-call budgets on every tier: 1,381 against 1,200 on high, 1,001 against 900 on medium, and 1,001 and 751 against 600 on low. Low is over its 1.0 M triangle budget at every spot.
- **`auto` chose high,** with reason `capable-device`, and made no tier changes during the run.

**Depth and the zoomed-out airport.** The measurement also records the depth of the ground on screen against the map camera's planes, `near = -100` and `far = 300`. At 1600x900 the zoomed-out spots stay inside them: the ground spans -75 to 179 at `whole-city` and -54 to 154 at `airport-far`. **At 2560x1440 they do not:**

- at `whole-city` (zoom 5) the ground on screen spans -147.7 to 255.6;
- at `airport-far` (zoom 6, Voxel International) it spans -117.7 to 186.1.

So the ground nearest the viewer, at the bottom of the screen, lies before the near plane and is clipped. The clipped part of the frame shows whatever is behind it, or the clear colour. On large or high-resolution screens zoomed out, that looks like broken or missing ground at the bottom edge.

Depth precision is not the problem. An orthographic depth buffer is linear, so 400 units over 24 bits gives about 0.00002 units, far finer than any layer offset in the city. Two other things are worth checking for the airport artifacts:

- the sun's shadow camera covers ±150 around the scene's origin, with a 4096 map (about 0.07 units per texel), and the light sets no `shadow-bias` or `normalBias`. Thin, flat surfaces such as runways and aprons are prone to shadow acne, and on high the shadow pass is drawn at every zoom;
- an airport near the shadow camera's ±150 edge gets cut-off shadows.

"Voxel International" is 107 units from the origin. "Pixel Heights Airport" is the other airport. Measure it with `?quality=medium` (no shadows) against `?quality=high`: if the artifacts disappear on medium, the cause is the shadow map; if they remain only when zoomed out on a large screen, it is the near plane. Nothing in the airport or the camera was changed here.

## 7. Measuring on a real device

The pilot's budgets are agreed on real devices: a phone (task 25) and a mid-range laptop.

**On a laptop or desktop** (Chrome or Edge installed):

```text
npm ci
npm run build
node scripts/perf-measure.mjs                       # every tier, this machine's GPU, 6 s per spot
node scripts/perf-measure.mjs --uncapped            # also lift the 60 Hz limit, to see the headroom
node scripts/perf-measure.mjs --url https://<staging host>   # the staging site instead of a local build
```

Each run writes `artifacts/perf/<time>/perf.json` and `perf.md`; `artifacts/` is not committed. The GPU's renderer string is in the first lines of `perf.md`. Close other heavy tabs and apps first, and keep the laptop on mains power, then run it again on battery: power saving often halves the GPU clock. `--mobile` emulates a phone's viewport and touch on the same machine. It is not a phone measurement.

**On a phone** (no console needed):

1. Open `https://<staging host>/?diag=1` (add `&quality=low`, `medium` or `high` to force a tier; `auto` is the default).
2. Wait about 20 s for the city and its models to load, without touching the screen.
3. Tap the **Quality** badge (top left). Note the tier, the reasons and the GPU line.
4. Tap **Measure**. The camera visits the five spots, for about 35 s; don't touch the screen. The table shows p50 and p95 per spot, with draw calls.
5. Tap **Copy** and paste the JSON into the pilot notes (or the task 25 issue). Repeat with `&quality=low` and `&quality=medium`.
6. The `/admin` monitor shows the same device's tier, reasons and p95 while it is connected.

On Android, `chrome://inspect` with USB debugging shows the console of the phone's page. `JSON.stringify(await window.__vvMeasure())` there gives the same result.

**What to record:** the device and browser, its tier in auto and its reasons, then p50 and p95 at each spot for each tier. Note whether it was plugged in, and whether it got warm. A tier meets its budget when every spot's p95 is within it. If auto picks a tier whose budget the device misses, lower that tier's ceiling rule or its frame-rate floor, both in `qualityPolicy.js`. A unit test covers each case.

## 8. Navigation gestures (as built and tested)

Section 8.1 of the plan asks for an interaction-state model. This is what navigation does today. `tests/browser-touch.test.mjs` tests each row on an emulated phone, and the keyboard rows on a desktop.

| Input | Map view (isometric) | Tested |
| --- | --- | --- |
| Tap a plot, park or billboard | selects it; its card opens in the panel | yes |
| One-finger drag | pans the map (MapControls `ONE: PAN`); selects nothing | yes |
| Pinch | zooms (`TWO: DOLLY_PAN`), within zoom 5 to 90 | yes |
| Two-finger drag | pans while zooming | (part of the pinch) |
| Long press | nothing is bound to it; the map stays where it was | yes |
| Joystick (phones and narrow windows) | walks the avatar while held; stops when released | yes |
| Tap with reduced motion on | still selects (the policy never affects selection) | yes |
| W A S D / arrows | walk | yes (D) |
| Escape | clears a selection, or closes the panel or the world map | yes |
| M | opens the world map | yes |

Long press is reserved for "context details", and customization gestures wait for the customizer (plan 8.1), so neither is built. The test now pins down that a long press is harmless. Making a long press do something, such as opening a plot's details, is the next navigation step.

## 9. Demand rendering

The main canvas stays on `frameloop="always"`, and the policy test fails if it is changed. The city runs 17 continuous-pausable loops, plus continuous traffic and other players. On demand rendering, each of them would have to call `invalidate()` every frame, which is the same as always rendering, only with more code. What the policy does instead is cheaper and safe:

- it stops the decoration while the interior covers the city, and draws the city 4 times a second behind it;
- it throttles the decoration on the low tier;
- it stops everything while the tab is hidden.

Demand rendering was tried on a bounded route only, as section 8.2 step 5 asks. That route is the model preview, `/models`, a development tool with only static models and orbit controls. `?frameloop=demand` switches it to demand rendering, and `window.__vvPreview.frames()` counts the frames drawn.

Measured on 2026-10-20: `next dev`, `/models?kit=coaster`, the GTX 1080 Ti above, headless at 60 Hz, after the models had loaded:

| | Frames drawn in 5 s idle | During a 1.5 s orbit drag | 5 s idle after the drag |
| --- | --- | --- | --- |
| `frameloop="always"` (default) | 300 | 99 | 300 |
| `frameloop="demand"` | **0** | 98 | 42 (the orbit's damping settling, then none) |

The screenshots after loading were identical: the models that load asynchronously still appear, because a React update invalidates the frame. The orbit is as smooth as before.

**Finding:** on a static preview, demand rendering removes every idle frame at no visible cost. It is the right default for any bounded, static 3D view: the model preview, a future customization preview (plan 10.6) or a single building's preview. The preview opts in with `?frameloop=demand` and is otherwise unchanged; making demand its default is a one-line change once a designer has used it. It does not carry over to the city: there the frame loop is never idle, so the measured saving comes from pausing and throttling (§3.4).

## 10. What's next

1. **Real devices.** Run §7 on the pilot phones and a mid-range laptop. Record the numbers here, then confirm or adjust the budgets and the ceiling rules (adoption plan section 19, item 6; task 25).
2. **The zoomed-out view.** Zoomed all the way out (zoom 5), the city is over budget on every tier. The triangles come mostly from the building and prop models, not from the trees. A distance level of detail for the models below zoom 9 on medium and low would bring it within budget. It changes only how the models are drawn, so it is performance work and not frozen. Also see the depth finding in §6.
3. **The map camera's near plane.** See §6. The isometric camera's depth range (`near = -100`, `far = 300` round a camera 52 units from its target) clips the ground nearest the viewer on a large screen zoomed out. Widening it costs no depth precision worth speaking of, because an orthographic depth buffer is linear. The near plane is the airport investigation's to change, so it is not changed here.
4. **Reduced motion for the camera.** Camera glides (search results, the compass's turns) could jump instead of gliding when reduced motion is on.
5. **Long press.** If a long press should open a plot's details (plan 8.1), add it with a test in `browser-touch.test.mjs`.
6. **More covered states.** Pause the decoration under any future full-screen modal by adding it to the director's `covered` check in `runtime.js`.
