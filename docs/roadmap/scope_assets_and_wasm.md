# Scope: real 3D assets, avatar, physics, and a real WASM game demo

Written for: you, deciding how far to take the look of the game and the interactive storefronts. Estimates are working days for one developer, on top of what exists. When this was written, every building, prop and the avatar was built in code from boxes (most now use models: see Status at the end) (see `apps/web/components/city/Plots.jsx`, `Avatar.jsx`); that is why the city loads fast (about 480 draw calls) and also why it looks plainer than ClaimAvenue.

## 1. Where the tools fit

| Tool | What it is for | Decision |
| :--- | :--- | :--- |
| **Kenney packs** (CC0) | Ready-made modular buildings, roads, trees, props, cars. Free, no attribution needed | **Yes, first.** Fastest way to a better-looking city. |
| **MagicaVoxel** | Authoring your own voxel models (landmarks, the airport, signature buildings, mall) | **Yes, for the few things that need to be yours.** Exports `.vox` / `.obj`; convert to `.glb`. |
| **Blockbench** | Modelling and animating the avatar (and NPCs) | **Yes, after buildings.** |
| **Rapier physics** | Real collisions, slopes, vehicles that bump and tumble | **Not now.** Only worth it with terrain (task 17) or physical props. |
| **PartyKit / Colyseus** | Multiplayer servers | **No.** Our own server (`services/multiplayer/server.mjs`) already does presence, push and chat. |

## 2. The asset pipeline (shared by everything below), 3 days
- A loader for `.glb` models (`useGLTF` from drei), a registry (`lib/content/models.js`: id, file, footprint, anchor, tint slots), and a build script `scripts/optimise-models.mjs` (merge meshes, quantise, compress with Draco or Meshopt; target under 2 MB for the first load).
- **Instancing**: one `InstancedMesh` per model kind per material, exactly as `Plots.jsx` does for boxes today, so 700 buildings stay a handful of draw calls. Per-instance colour for the owner's building colour.
- **One look**: a shared palette texture (a 256 × 1 colour strip, as voxel exports use) so every model uses one material and the batches stay merged.
- Levels of detail: the existing boxes stay as the far view; models load within a radius (the same idea as the world-streaming study).
- Fallback: if a model fails to load, the box is drawn, so nothing is ever missing.

## 3. Buildings and props, 4-6 days after the pipeline
1. **Kenney first pass (2 days):** commercial and suburban building kits mapped to our three building types and tiers (shop, restaurant, office; prime; luxury; grand), trees, lamps, benches, signs, the vehicle kit for cars. Heights and footprints already come from the generator, so each plot picks a model whose footprint fits and stacks floors like the current boxes.
2. **MagicaVoxel landmarks (2-3 days of modelling, not code):** mall, international terminal, tower, the big monument circles, the shipping-yard cranes (when that exists), park fountain. Either you model them, or they are commissioned (voxel landmarks are cheap and quick to commission).
3. **Roofs and the banner** stay procedural so the owner's logo still shows.
- Risks: licence (Kenney is CC0; check every extra pack), file size, and keeping 700 unique-looking buildings from looking cloned (use 6-10 variants per type and per-instance colour).

## 4. The avatar, 3-4 days
- Model in Blockbench (a blocky humanoid, about 600 triangles) with clips: idle, walk, run, wave, dance, jump, sit (for vehicles), cast (fishing).
- Clothes and hats: separate meshes attached to named bones, swapped by the Wardrobe (the cosmetics list in `lib/game/cosmetics.js` already says which item is which); colours by material tint.
- Replace the box avatar in `Avatar.jsx` and `RemotePlayers.jsx` (instanced skinned meshes if there are many remote players; plain skinned meshes up to about 20).
- Risk: skinned meshes cannot use the simple instancing the box avatars use, so remote players are capped (the server already limits who is sent within 120 units).

## 5. Physics (Rapier): not recommended yet
Today: axis-aligned boxes, circles and a collision map (`lib/sim/collision.js`) with sliding, and arcade driving (`lib/sim/vehicles.js`). It is fast and tested (a car driven randomly for 20,000 steps never enters a building). Rapier (WebAssembly, about 2 MB) adds slopes, stacking and rigid bodies. Worth it **only if** we add terrain or props you can knock over. If we do: 4-5 days to replace the collision map with static colliders per chunk and the vehicles with raycast vehicle controllers, and about 1 day to re-prove the walking and driving tests.

## 6. A real WASM game demo: what it would be like

**What the visitor sees.** In a business's storefront (beside the 3D room) there is a *Play the demo* tile, like the video tile now. Pressing it loads a small game inside the panel: a 4:3 or 16:9 window with the game's own graphics, running at full frame rate, with keyboard, mouse or touch controls and a *Full screen* button. When the visitor leaves, it stops. The owner of a game studio can let people try their game without leaving the city.

**What it is technically.** The game is built with an engine that can export to the web (Godot 4 "Web" export, Unity WebGL, Rust with Bevy, or C/C++ through Emscripten). The export is a folder of static files: `index.html`, a `.wasm` file (the compiled game), a `.js` loader and a data pack. Typical size is 5-40 MB, so it must never load until the visitor asks (as embeds already do).

**Two ways to host it**
1. **Embed from a site that already hosts it (done today):** itch.io and similar give an embed address, and the game runs in a sandboxed `<iframe>`. Nothing for us to host or secure, and the owner already has this. We only allow known services (`lib/content/embeds.js`).
2. **Host the owner's own upload (the "real" version, 6-8 days):**
   - The owner uploads a `.zip` of their web export. The server checks it: size cap (for example 50 MB), only allowed file types (`.html .js .wasm .pck .png .ogg ...`), no server-side files, a required `index.html`, and a malware scan.
   - Files go to object storage on a **separate origin** (for example `games.voxelventure.example`), never our own origin, so a game can never read the player's session or save. The iframe uses `sandbox="allow-scripts allow-pointer-lock"` and not `allow-same-origin`.
   - Some engines need `SharedArrayBuffer`, which needs the headers `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` on that origin; the game host sets them.
   - A small **SDK over `postMessage`** lets the game talk to the platform, only through the parent page: `ready`, `score`, `playTime`, `finished`. This is how a game can become a quest ("play for 60 seconds" or "reach level 3" pays Credits): the server cannot trust the browser, so the parent page signs the report, the server checks the clock (as for the visit quests today) and caps what one game can pay.
   - Moderation: the same reports, admin queue and ban as everything else; a reported game is switched off at once.

**What it costs in practice:** the owner's build (their cost), our upload, check and storage work above, a mobile story (many web games are desktop-only: show *Best on a computer*), and bandwidth (a CDN). A first proof, a tiny sample game exported from Godot and hosted this way, is about 2-3 days and shows the whole pipeline.

## 7. Suggested order and total
1. Asset pipeline and Kenney buildings (7-9 days) for the biggest change in how the city looks.
2. Avatar (3-4 days).
3. MagicaVoxel landmarks (modelling time, plus 1 day to place them).
4. Hosted WASM games (6-8 days) when there are studios who want it; embeds cover them until then.
5. Rapier only with terrain.

Total for the visual upgrade: about 11-14 days of code plus the modelling. None of it needs the backend; it can run in parallel with it.

## Status

- **Kenney buildings: done.** `scripts/models/import-kenney.mjs` imports 31 models (City Kit Commercial and Suburban, CC0) into `apps/web/public/models/kenney/` and writes `lib/content/modelCatalog.js`. `lib/content/models.js` picks a model per plot by class (tall, mid, low, wide, house), fits it to the footprint and height; `apps/web/components/city/ModelBuildings.jsx` draws them as instanced meshes. Boxes stay while models load or if they fail; `?models=0` turns them off. Credits: `apps/web/public/models/CREDITS.md`, the root `CREDITS.md` and the in-game Credits panel (`lib/content/credits.js`). Tests: `tests/models.test.mjs`.
- **MagicaVoxel landmarks: loader done.** `lib/content/vox.js` parses `.vox` and builds a face-culled, vertex-coloured mesh; `apps/web/components/city/VoxLandmark.jsx` loads `apps/web/public/models/vox/<name>.vox` with a procedural fallback. The park monument uses it (`node scripts/models/make-sample-vox.mjs` writes the sample; replace `monument.vox` with your own export). Tests: `tests/vox.test.mjs`.
- **Not yet (at the time):** Kenney Nature (trees) and Car kits, mall and terminal landmarks, Blockbench avatar. All done since: see the next line.
- **Trees, cars, mall, terminals, avatar: done.** `scripts/models/import-props.mjs` imports the Nature Kit trees/bushes and Car Kit cars (`lib/content/propCatalog.js`, picking in `lib/content/props.js`, drawing in `apps/web/components/city/PropModels.jsx`); traffic cars, woods, park, lot trees and bushes use them. The mall uses `mall.vox`; airport terminals are rows of Kenney building wings (`TerminalModels` in `Airports.jsx`). The avatar loads `player.glb` when it has groups `leg_l, leg_r, arm_l, arm_r` (see `make-sample-avatar.mjs` for the exact layout to export from Blockbench). All fall back to the old box versions.
- **Boats, piers and the amusement park:** the Kenney Watercraft, Pirate and Coaster kits (CC0) are imported too; see [kenney_assets.md](../architecture/kenney_assets.md). The Kenney kits in use are now City Commercial, Suburban, Nature, Car, Watercraft, Pirate and Coaster.
- **Still boxes:** the cars the player drives (`Vehicles.jsx`), other players' avatars, the walkers in traffic.
- **Street alignment and car parks:** every building model now stands with its front flush to the street side of its plot (`place()` in `lib/content/models.js`). About 3 in 10 ordinary (not house, estate or prime) buildings take the front 60% of their plot and keep a car park behind (`hasParking`, `apps/web/components/city/ParkingLots.jsx`): asphalt, bay lines and a few parked Kenney cars. Lots show only where a building model is drawn.
- **Interior editor:** stepping inside a building you own shows a larger window with **Redesign inside**, which opens the Pascal editor (the same one as `/editor`) over the whole screen with its Furniture catalogue, Building and Settings tabs (`apps/web/components/interior/InteriorEditor.jsx`). Designs are saved per plot in the browser (`lib/state/designStore.js`) and shown the next time you step in; **Original** goes back to the generated interior. The outside wall colour is the **Outside walls** picker in the window header, or the exterior colour you give the walls in the editor (`exteriorColorOf`); it tints the building in the city (`plot.wallColor`). The furniture library is Pascal's online catalogue, so it needs a connection.
- **Voxel buildings:** `scripts/models/make-voxel-buildings.mjs` writes nine original `.vox` buildings (towers, offices, apartments, shops, cafe, warehouse, hall, market) to `apps/web/public/models/vox/buildings/` and `lib/content/voxBuildingCatalog.js`. They are chosen between with the Kenney models by the same class rules (`ALL_MODELS` in `lib/content/models.js`) and drawn by `ModelBuildings.jsx`. To use your own MagicaVoxel export, save it over the same file name and run the script with `--catalog-only`. The voxel mesher merges same-colour faces (greedy meshing), so a building is a few thousand triangles.
- **Hills (north-east):** `planHighlands` in `lib/city/cityGenerator.js` places a range of low hills outside the county road, in the north-east (north of the county if the north-east is taken by an airport or the river), with a loop road ("Ridge Loop") round a level meadow and a spur ("Ridge Rd") running between the hills to the county road. The height comes from `lib/city/hills.js` (`hillHeight`, at most 2.2, level along every road and the meadow, falling to the ground at the edge), drawn by `apps/web/components/city/Hills.jsx`; the avatar cannot walk up them (`hillBlocked` in `lib/sim/collision.js`). 38 of 40 test cities have hills. This heightfield is also where Rapier's heightfield collider would go. Tests: `tests/hills.test.mjs`.
- **Interior editor layout:** the editor's side tabs are now Start (a five-step guide), Furniture (the catalogue sorted into dropdown groups: Popular for shops, Shop & display, Seating, Lighting & decor, Tables & desks, Bedroom, Kitchen & dining, Bathroom & laundry, Plants & trees, Screens & technology, Safety & building, Play music & fitness, Outdoor & vehicles; with search), Colours (inside walls, outside walls and floor in one click) and Floors/Settings. The grouping is `lib/content/furnitureGroups.js`; the panels are in `apps/web/components/interior/editor/`.
- **Pop-up market:** see `docs/product/market.md`.
- **Admin headquarters:** `ADMIN_HQS` in `lib/city/cityGenerator.js` (Synaptix Play, Theoretical Minds Technology) turns the two luxury estates that are built at the start into landmark buildings with their own voxel models (`synaptix-hq`, `theoretical-minds-hq`, made by `scripts/models/make-voxel-buildings.mjs`). They are `admin: true`: not for sale, not open to a take-over (`PlotCard`, `store.takeOverPlot`, and `claimable = 0` in the server's `seedWorld`). Luxury estates for players went up by two (`LUXURY_COUNT` 6) and `COUNTRY_LOT_SHARE` to 0.73 for about 10% more plots. The websites are placeholders.
- **Statistics, presence and compass:** the Statistics panel now starts with Online now, Latest arrivals (country only) and Recorded activity (yesterday / last 7 days / total) in the style of ClaimAvenue, and a pill at the top of the screen links to it. With a game server the figures come from the database: `services/api/stats.mjs`, `POST /presence/ping` (every 15 s while the tab is visible) and `GET /stats/overview`; tables `presence` and `arrivals`. Without one they are this browser's own (`lib/data/localStats.js`). The compass (top right, `apps/web/components/ui/Compass.jsx`) turns with the camera, swings it to face N/E/S/W, shows the avatar's heading with a yellow arrow, and can put the camera behind the avatar.
- **Animals:** `lib/sim/animals.js` puts cows, sheep, horses and pigs in the meadow fields, deer, foxes and rabbits in the woods, goats on the hills, ducks on the lakes and river, and birds over the woods and hills (about 150 a city), drawn from voxel models (`scripts/models/make-voxel-animals.mjs`) by `apps/web/components/city/Animals.jsx`. `?animals=0` turns them off.
- **World map (M):** see `docs/product/world_map.md`.
