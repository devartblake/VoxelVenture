# VoxelVenture — Overview

Written for: anyone picking up the project (you, a new developer, or a collaborator). It pulls together the product idea, how the code is organised, how to run and test it, and what is left. The detail behind each point is in [project_status.md](project_status.md) (section numbers like 5l are given in brackets).

## 1. What it is

A playable, browser-based isometric city in the spirit of ClaimAvenue (the "Million Dollar Homepage" as a virtual boulevard). Players walk a voxel avatar around a procedurally generated commercial city (or drive a car, or sail a boat and fish), claim plots, put up a business (title, link, building type, interior), and advertise on billboards and on **banners towed by planes**. Anyone can take over a business for **1.25×** its value; the old owner is paid out and moves to the Old Town suburb. The idea, the market read on ClaimAvenue and the product pillars are in [voxelventure_blueprint.md](voxelventure_blueprint.md).

Today it is a complete single-player game with local saves, plus LAN multiplayer for avatars and nearby chat. There is a **backend** (accounts, claiming, events, statistics, leases, voting, market, chat and private messages; see [backend.md](backend.md)) that the game uses when `NEXT_PUBLIC_LIVE_API_URL` is set; payments and real mail delivery are not connected (section 7, [tasks.md](tasks.md)). Press **M** for the world map ([world_map.md](world_map.md)).

## 2. Run it

**Setup.** `npm ci` installs the packages; its `postinstall` runs `patch-package`, which applies the fixes in `patches/` (drei, fiber and the Pascal packages). The development machine runs Node.js 24 LTS (24.20.0, npm 12.2.0) on Windows. If PowerShell refuses to run `npm` (an `AllSigned` execution policy blocks `npm.ps1`), run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or type `npm.cmd` instead of `npm`. Next 16's `next dev` writes an `AGENTS.md` at the repo root when it starts (Next's `agentRules` setting controls this).

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Next dev server on port 3000 |
| `npm run dev:lan` | The same, open to the LAN |
| `npm run dev:all` | Web app (open to the LAN) + the multiplayer server; prints the address for a phone |
| `npm run mp` | Multiplayer server only (port 3001) |
| `npm run api` | The API server (port 3002; see [backend.md](backend.md)) |
| `npm run messaging:setup` / `npm run messaging` | The Python messaging service (port 3003; Python 3.11+): set up its environment once, then run it. Not used unless the API has `MESSAGING_SERVICE_URL` ([../services/messaging/README.md](../services/messaging/README.md)) |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint (clean) |
| `npm test` | Every suite except the browser test (a few minutes: `live-browser` rebuilds the production app, so run `npm run build` after it) |
| `npm run test:browser` | Real-browser test (needs a build and Edge or Chrome) |
| `npm run test:all` | Both |

`dev:all` does not start the API. To try accounts, the inbox and signed-in chat locally, also run `npm run api` and set `NEXT_PUBLIC_LIVE_API_URL` (the API's address) for the web app, `MP_API_URL` for the multiplayer server, `MP_NOTIFY_URL` for the API, and the same `MP_NOTIFY_SECRET` on both servers ([../server/README.md](../server/README.md)).

Pages: `/` the city, `/b/<id>` a short link that opens the city on one building, `/admin` the client monitor, `/editor` the city editor ([city_editor.md](city_editor.md)), `/viewer` (the Pascal scene viewer used for interiors), `/land`, `/pricing` and `/models` (development tools: free land and new streets, land prices, the model preview), `/curves` and `/reference` (road research). Add `?diag=1` to the city address to enable the `window.__vv*` debugging hooks (they are always on in development).

## 3. The city (how it is generated)

A seed gives the same city every time (`lib/city/cityGenerator.js`, a seeded random generator). Typical result: about 800 to 1,050 plots, about 145 intersections, 4 reserved sites, land about 300 × 255 units. [5, 5e, 5f]

- **Roads.** Eight avenues cross 5–7 streets in a closed network (every road ends at a junction), with a ring road, a county road round the outside and arterials that run out to it. Road classes drive traffic control: arterial × arterial = signals, arterial × local = two-way stop, local × local = all-way stop. A **diagonal avenue** joins at most **two circles** (with monuments), and up to two compact roundabouts are kept 52 units apart so drivers face one at a time. [5c, 5h, 5p; reasoning in [road_design_reference.md](road_design_reference.md)]
- **Districts.** SaaS Silicon Strip, Arcade Alley, Creator Commons and Agency Boulevard on the grid; Outskirts and Countryside by the ring and county roads; Lakeside and Riverside by the water; Old Town (grey houses, past the east ring) for displaced owners. [3, 5e]
- **Water.** A river 11–14 wide with a bridge wherever a road crosses it, and one to three lakes each ringed by a road. [5f, 5p]
- **Plots by tier.** Ordinary lots; **prime** (double-deep) plots; **luxury** estates (3 × 2 cells, grid and waterfront); **grand** estates (14 × 7.6, built at the start); and **reserved** sites (four per city, 34 × 30, the amber areas) beside busy arterials for a player's own road. Roadside buildings are flush with the pavement. [5l]
- **Mega malls.** Two, at the west and east ends of the streets: one big building each with ten stores that you go inside from a directory (each with its own interior, offers and logo). [5u]
- **Parks.** A block park with a fountain and a monument, and a **big park** (28 × 20) beside a busy road that grows to meet the next street. Plots beside a park share its foot traffic. [5n]
- **Airports.** Two: a regional one and a larger **international** one (116-long runway, big terminal, four hangars, parked airliners), each with a runway, terminal, tower and hangars; **two planes** tow banner ads between them. [5m]
- **Landscape.** Street trees, shrubs on the banks and shores, woods and fields in the country. [5n]
- **Daily loop.** A chest, the Plot of the Day and a three-star scavenger hunt, all derived from the date. [5b, 5l]

## 4. How the game runs

- **Rendering** (React Three Fiber): roads and junctions are merged into a few meshes (`StaticBatch`), plots, trees and shrubs are instanced. About **470 draw calls on desktop and 177 on a phone** (was 5,617). Touch devices get no shadows and a capped pixel ratio. [5j, 5p]
- **Traffic** (`lib/sim/traffic.js`): cars follow lanes with stop lines and signals, treat a circle as one shared space, and are tested for contacts (none at 120 cars). About 44 walkers use the sidewalks and crossings. [5c, 5l]
- **Planes** (`lib/sim/flight.js`): timed circuits sampled with Hermite curves; the banner trails on the plane's own path. Click a plane or banner to open its ad. [5m]
- **Vehicles and fishing** (`lib/sim/vehicles.js`, `components/city/Vehicles.jsx`): take any car off the road and drive it, or sail a boat from its mooring on a lake or the river and fish from it for Gold (capped at 120 a day). [5t]
- **Camera** (`lib/state/viewStore.js`, `components/ui/panel/CameraMenu.jsx`): a menu of views (Action, Third-person, Tactical, Overview, Top-down, and the original isometric map), with zoom, tilt and turn. [5s]
- **Avatar and collisions** (`lib/sim/collision.js`): WASD / click-to-walk / on-screen joystick; buildings, hedges, fountains, tree trunks, circle islands and airport buildings are solid. [5b, 5g]
- **State** (`lib/state/store.js`, zustand, saved in the browser, version 3): plots, Gold, outfit, daily progress, billboards. [5b]
- **Building card** (`components/ui/PlotCard.jsx`): step inside, logo and description, figures, address, exposure and rank, the owner's forms, 30-day site visits and the building's history. [5w]
- **UI** (`components/ui/panel/`): one movable side panel that every toolbar icon and every selection opens into, with back, expand and close. [5o] The **Credits** view (who made the models, data and code, and their licences; from `lib/content/credits.js`) opens from *Credits & licences* at the bottom of the City map & guide view; `CREDITS.md` at the repo root says the same in long form. [5z]
- **Chat** (`components/ui/chat/`, state in `lib/state/chatStore.js`, API calls in `lib/data/messaging.js`): the toolbar's *Chat and messages* button (with a badge for unread messages) opens **Nearby** and **Inbox** tabs. The Online view lists players with a verified mark and a Message button, and a player-owned building's card has *Message the owner*. [5za; [chat_messaging_plan.md](chat_messaging_plan.md)]
- **Music** (`lib/game/musicRules.js`): all made live by the browser (WebAudio); there are no music files.

## 5. Multiplayer and the monitor

`server/multiplayer.mjs` (WebSocket, port 3001) gives presence: players in the same city (same seed) see each other's avatars and talk in nearby chat; each city is a room. With the API set up, a signed-in game hands the server a one-use ticket and then speaks as that account, and the API's "inbox changed" notices go to that account only ([backend.md](backend.md)). Each client also reports its device, frame rate, draw calls and errors; `/admin` shows them live and errors are appended to a rotating log. Details and settings are in [../server/README.md](../server/README.md). [5i, 5k, 5p, 5za]

Concurrency measures: view-radius filtering (120 units), duplicate snapshots skipped, slow-socket backpressure, 60 msg/s and 16 KB limits, per-address and total connection caps, heartbeats. Presence does not carry plot claims or ad slots: with a game server those are the API's ([backend.md](backend.md)), which tells the presence server to push each change to every player. **Not shared:** the game's own Gold (it stays in the browser), and the simulated cars and walkers.

## 6. Testing

`tests/` holds the suites (all pass): `topology` (roads, junctions, river, lakes over many seeds), `lots-and-walking` (lots, reachability on foot, hunt and park access), `diagonal`, `estates`, `parks`, `landscape`, `flight` (planes, banners), `malls` (the two mega malls and their stores), `logos` (roof banner logos), `plotinfo` (the building card's figures), `vehicles` (cars, boats and fishing), `traffic` and `traffic-stress`, `multiplayer`, and `browser` (console errors, draw calls, clicking plots, regenerating and claiming, the joystick, every panel view and dragging it, the monitor). The browser test caught the crash behind a player's `refCleanup` report and the Play-view crash. There are 61 test files now; the newer ones include the server suites (`api`, `engage`, `community`, `market-api`, `stats`, `live`), `messaging` (chat and private messages against both servers) and `credits` (the Credits panel and `CREDITS.md` agree). `live-browser` also runs chat between two signed-in browsers.

## 6b. Development tools

The **reserved-site designer** (click an amber "Reserved: your road & plot" area in development) lays a street and lots into a reserved site and adapts the land around it; it is compiled out of production builds. See project_status.md section 5r.

## 7. What is next

The full list of what is done and what is left, with sizes and dependencies, is in **[tasks.md](tasks.md)**. In short: the game is feature-rich and fully tested as a single-player (plus LAN presence) experience; the backend is built ([backend.md](backend.md)); what remains is going live (payments, real mail delivery, chat's launch checks in [chat_messaging_plan.md](chat_messaging_plan.md), hosting: see [hosting_stack_payments.md](hosting_stack_payments.md) and [live_data.md](live_data.md)), the bigger authored world with an island, ocean and shipping yard ([study_world_streaming.md](study_world_streaming.md)), and real-device checks.

## 8. Where things are

`lib/` is split into `city/`, `sim/`, `state/`, `game/`, `net/`, `content/`, `data/`, `market/` and `dev/` (see project_status.md 5s).

| Area | Files |
| :--- | :--- |
| City generation | `lib/city/cityGenerator.js`, `lib/city/parkGeometry.js` |
| Walking and collisions | `lib/sim/collision.js`, `lib/sim/avatarState.js`, `components/city/Avatar.jsx` |
| Traffic | `lib/sim/traffic.js`, `components/city/Traffic.jsx`, `IntersectionControl.jsx` |
| Malls | `lib/city/cityGenerator.js` (`planMalls`), `components/city/Malls.jsx`, `components/ui/panel/MallView.jsx` |
| Vehicles, boats, fishing | `lib/sim/vehicles.js`, `lib/state/fleetStore.js`, `components/city/Vehicles.jsx`, `components/ui/VehicleHud.jsx` |
| Roof banner logos | `lib/game/logos.js`, `components/city/bannerAtlas.js`, `components/ui/imageLogo.js` |
| Camera | `lib/state/viewStore.js`, `components/city/FollowCamera.jsx`, `components/ui/panel/CameraMenu.jsx` |
| Planes and airports | `lib/sim/flight.js`, `components/city/Planes.jsx`, `Airports.jsx` |
| Store, daily loop | `lib/state/store.js`, `lib/game/daily.js` |
| Side panel | `lib/state/panelStore.js`, `lib/state/worldStore.js`, `components/ui/panel/`, `components/city/CameraFocus.jsx` |
| Cards | `components/ui/PlotCard.jsx`, `ParkCard.jsx`, `BillboardCard.jsx`, `Wardrobe.jsx`, `Legend.jsx` |
| Multiplayer | `server/multiplayer.mjs`, `lib/net/multiplayer.js`, `app/admin` |
| Interiors | `components/interior/`, the Pascal packages (patched drei, see project_status section 7) |
| Mall hall, ad rotation, hotspots | `lib/city/mallHall.js`, `components/city/Malls.jsx`; `lib/game/adRotation.js`, `components/city/useRotatingAd.js`; `lib/content/interiorHotspots.js`, `components/interior/InteriorViewer.jsx` |
| Presence at scale | `server/multiplayer.mjs`, `lib/net/multiplayer.js`, `scripts/load-test-presence.mjs` |
| Interiors by business type | `lib/content/businessFixtures.js`, `brandPalette.js`, `fixturePricing.js`, `components/interior/editor/FurniturePanel.jsx` |
| Curved site traffic | `lib/sim/curveTraffic.js` (the street is made by `designCurvedSite` in `lib/city/cityGenerator.js`) |
| World map | `components/ui/WorldMap.jsx`, `components/ui/worldMap/`, `lib/state/mapStore.js`, `lib/city/routing.js`, `lib/city/spatialGrid.js`, `components/city/RouteFollower.jsx` |
| Chat and messages | `components/ui/chat/`, `lib/state/chatStore.js`, `lib/data/messaging.js`, `server/api/messaging.mjs`, `server/api/textcheck.mjs`, `tests/messaging.test.mjs` |
| Credits | `lib/content/credits.js`, `components/ui/panel/CreditsView.jsx`, `../CREDITS.md`, `tests/credits.test.mjs` |
| Music | `lib/game/musicRules.js` (procedural, no music files) |
| Tests | `tests/*.test.mjs`, `tests/run.mjs`, `tests/browser-driver.mjs` |
