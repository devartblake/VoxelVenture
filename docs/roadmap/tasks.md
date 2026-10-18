# Tasks: what is done and what is left

Written for: you, to plan the next stage. Status on 2026-10-17:

- `npm test` passes all 82 of its suites, including:
  - `live-browser`, which does a production build and follows a visitor from Discover into the 3D storefront;
  - `packages`, `contracts`, `pilot`, `pathfind` and `music-director`, the newest.
- The 83rd, the real-browser test (`npm run test:browser`), needs a machine with a GPU. In a software-rendered container its fixed waits time out.
- Lint is clean. Details of each item are in [project_status.md](project_status.md) (section numbers in brackets).

> **World-expansion freeze (from 2026-10-16).** New world content and simulation systems are on hold until the commercial pilot is validated; fixes, performance, accessibility and commercial work continue. Items marked ⏸ are deferred. See [world_freeze.md](world_freeze.md) and the [competitive alignment review](../competitive-research/claimavenue_competitive_alignment_review.md); `npm run check:freeze` flags new files in the world's folders.

## Done

### City and world
- [x] Seeded city: 8 avenues, 5-7 streets, signals / stops / circles by road class, diagonal avenue with two circles, about 720 plots [5, 5f, 5h, 5q]
- [x] Districts, Old Town suburb for bought-out owners, river with bridges (11-14 wide), 1-3 lakes with loop roads [5e, 5f, 5p]
- [x] Plot tiers: ordinary, prime, luxury (grid and waterfront), grand estates; four reserved sites flush to busy roads [5l, 5q]
- [x] Two parks (block park and a large one that fills its block), flush edges, landscaping, ground textures and patches [5n, 5r]
- [x] Two airports, one **international** (116 runway, four hangars, parked airliners), with two banner planes [5m, 5v]
- [x] Two mega malls at the ends of the streets, ten stores each with their own interiors [5u]
- [x] Boats on the lakes and river [5t]
- [x] Bigger-map switch `NEXT_PUBLIC_MAP_SCALE` and numbered street names [5v]

### Gameplay
- [x] Avatar, saves, daily chest, Plot of the Day, scavenger hunt, Gold, Wardrobe [5b, 5l]
- [x] Cars and walkers with signals, circles and contact tests; take-over (1.25x) and Hall of Fame [5c, 5l]
- [x] **Drive any car; sail a boat and fish** (rare fish, 120 Gold a day cap) [5t]
- [x] Billboards and **aerial banners you can buy** [5m]
- [x] Roof banners with a logo: generated from the business, an icon, or an uploaded picture [5s]
- [x] Interiors with offers, coupons, visit rewards, embeds [5b]

### Interface
- [x] One movable side panel with a toolbar (back, expand, close) [5o]; wider panel, SynaptixPlay palette [5w]
- [x] **Directory** of every building, numbered 1 to N, the opening view [5x]
- [x] **Building card**: Step inside, figures, address, rank and exposure, 30-day site visits, history, claim / take over / manage [5w]
- [x] Camera menu: Action, Third-person, Tactical, Overview, Top-down and the **original isometric view** [5s]
- [x] Statistics, Search, Places, Today, Online, Wardrobe, city guide, mini-map [5o]
- [x] Reserved-site designer (development only), with compass controls and linking to neighbouring streets [5r]
- [x] **Credits panel** (City map & guide > Credits & licences) from `lib/content/credits.js`, with `CREDITS.md` at the root and a test that they agree [5z]

### Later additions (see [project_status.md](project_status.md) 5y)
- [x] **World map (M):** overlay with pan, zoom, waypoints, labels, road-following routes, culled and cached for stable frame rate; never pauses the world [world_map.md]
- [x] Pop-up market with weekly layouts and booking [market.md]; admin headquarters; hills; animals; statistics with real presence; compass; Pascal interior editor with grouped furniture [scope_assets_and_wasm.md]
- [x] Strategy features: proof-of-human traffic, leaseholds, activity skyline, Building of the Week, The Bazaar [community.md]

- [x] Mall hall and renting, shared vehicles, ad rotation with contrast check, interior hotspots (tasks 18-21)
- [x] **First-person view** (camera menu or V): eye height, right-drag or one finger to look, Q / E turn, R / F look up and down; the avatar is hidden [project_status.md 5y]

### Engineering
- [x] Rendering: about 480 draw calls on desktop, 170 on a phone [5j]
- [x] LAN multiplayer with a view radius, back-pressure, a client monitor and an error log [5i, 5p]
- [x] `lib/` in folders; tests in the repo; lint clean [5k, 5s]
- [x] **The game uses the server** (when `NEXT_PUBLIC_LIVE_API_URL` is set): sign-in appears only when claiming, taking over or buying an ad space [`docs/architecture/backend.md`]
- [x] **Social presence, lead capture, interactive storefronts, quests, email notices**: instant push of changes and spatial chat; double opt-in sign-ups; coupons, feedback board, quests paid from a business's Gold budget; email outbox and newsletter [`docs/architecture/backend.md`]
- [x] **Moderation, owner sign-ups screen, Credits** (the server's quest money is separate from the game's Gold) [`docs/architecture/backend.md`]
- [x] Deprecated `maxLeafSize` -> `targetLeafSize` in the Pascal packages and `three-bvh-csg`: the warning is filtered in `lib/dev/quietWarnings.js` (three-mesh-bvh maps the old name itself); the version-pinned patches that did it broke every Pascal update and were removed with the move to Pascal 1.0.4. The one patch left (`patches/@pascal-app+nodes+1.0.4.patch`) computes missing normals for some furniture models
- [x] **Backend API** (Node + SQLite, Postgres-portable): accounts, directory, atomic claim and take-over, ledger, events and real statistics, 34 tests [`docs/architecture/backend.md`]
- [x] Live-data layer with one provider switch and `docs/architecture/live_data.md` [5x]
- [x] Feasibility study for a bigger authored world, with a streaming prototype [5v, study doc]
- [x] Fixes: refCleanup crash, Play-view crash, bridge flicker, white water, unreachable park gates, stale road batch, the `<Html>` double-root warning
- [x] `npm run dev:all` runs both servers with the same Node binary, no shell (no DEP0190 warning on Windows) [5z]
- [x] **Reassessment (2026-10-17) fixes:** each business has its own random conversion key (hash stored, shown once, rotatable, audited), sent only in the `Authorization` header; the pixel needs no key and counts only as browser-reported; revenue is split into verified, unattributed and browser-reported; outcomes are reported as separate families (leads, claims, redemptions, purchases) each with its own cost, with return on spend from verified revenue only; `.github/CODEOWNERS` for billing, auth, attribution, schema, messaging and deployment [`docs/monetization/conversions.md`]
- [x] **Building of the Week, the weekly vote** made visible and easier: one vote a week for everyone, a bonus for the three gold stars, a panel in the game, a section on Discover, badges and a Vote button on business pages, and a demo that works without the server [`docs/product/community.md`]
- [x] **ESLint 10** (10.12.0, from the unsupported 9.39): `eslint-plugin-react` removed (it does not support ESLint 10, and ESLint now sees names used in JSX itself); the 8 places the new `no-useless-assignment` rule found are fixed
- [x] **Python messaging service** (steps 1-5 of `../architecture/node_fastapi_architecture_plan.md`): `services/messaging` (FastAPI) passes the same messaging contract as the Node API, Node's identity and ownership endpoints for it, the data copy with reconciliation, a read-only pause, the systemd unit and backups; not switched on yet [`services/messaging/README.md`]
- [x] **Chat and private messages** (phases 0-3 of `../architecture/chat_messaging_plan.md`): a Chat panel with Nearby and Inbox; signed-in identity on the presence server; sent / failed / Retry; blocks, reports, bans; requests, read positions, mute; "Message the owner" on a building's card [`docs/architecture/backend.md`, `services/multiplayer/README.md`]
- [x] **Business pages' menu on phones:** Discover, 3D city and My profiles become a full-width row of 44 px tabs under the name and *List your business*; the current page is marked [`docs/product/business_funnel.md`]
- [x] **Draft policies at `/legal`:**
  - terms, privacy, refunds, advertising and placements, retention, and merchant responsibilities;
  - numbers drawn from the code (`lib/legal/facts.js`, `lib/legal/retention.js`), checked by `tests/legal.test.mjs`;
  - consent lines at sign-up and on request forms, and footer links;
  - marked *draft* until approved (task 45) [`docs/monetization/policy_review.md`]
- [x] **Documentation by topic** (Phase A of the [migration plan](../architecture/modular_monorepo_migration_plan.md)): `docs/` split into `product`, `architecture`, `monetization`, `competitive-research`, `roadmap` and `operations`, each with an index, plus a [path map](../architecture/documentation_path_map.md) from the old paths
- [x] **Shared packages, first slices** (Phase B, [ADR 0001](../architecture/adr/0001-shared-package-boundaries.md)) [`packages/README.md`]:
  - prices and plans moved to `packages/business-core`, and the conversion funnel and attribution to `packages/analytics`, each behind an adapter at its old `lib/` path;
  - six versioned contracts in `packages/shared-types` (profile events, purchase reports, owner figures, the weekly vote), with a validator;
  - `tests/packages.test.mjs` checks boundaries, purity and parity; `tests/contracts.test.mjs` checks the contracts against the live API;
  - the CI selector and the lib-loader know about `packages/`
- [x] **Policy gaps 1 and 3** ([policy_review.md](../monetization/policy_review.md)):
  - the presence server keeps network addresses only as the same salted hash as the API, and honours `TRUST_PROXY` behind Caddy;
  - take-over emails call the payout game value, with no `$`.
- [x] **Pilot dashboard** and the merchants' weekly check-in (task 47) [`docs/monetization/pilot.md`]
- [x] **Click-to-walk round buildings** (`lib/sim/pathfind.js`):
  - **The bug:** a click on the ground walked the avatar in a straight line, into anything in the way.
  - **The fix:** it now plans a route round buildings and every other solid. It uses a grid search near the two points, and for long walks the roads and their bridges. Then it walks the route corner to corner, and plans again once if something blocks it.
  - **Clicks on a building:** a click on a building walks to the free spot beside it, and the marker shows where the avatar will stop.
  - **Speed:** about 1 ms a click.
  - **Tests:** `tests/pathfind.test.mjs` walks 180 clicks on three cities with the game's own movement.
  - **CI:** a world-freeze fix; the commit that adds the file needs a `World-freeze-exception:` line.
- [x] **Live on a real server** (2026-10-17 and 18; [deploy/README.md](../../deploy/README.md)):
  - **Production:** voxelventure.app on a Shared CPU 4 GB Linode. `verify:live` passes all 17 checks, and the admin token is passed in `VERIFY_ADMIN_TOKEN` so it is never printed.
  - **Staging** beside it ([deploy/STAGING.md](../../deploy/STAGING.md)): its own ports, database and secrets, with a release-and-switch deploy that switches back by itself if a release does not start.
    - Rehearsals: a rollback took 2.2 s, and production's first backup restored into staging.
    - The four journeys pass against it, 41 of 41.
  - **Deploying from Windows:** `deploy/push.ps1` (git archive, scp and ssh, always LF).
  - **Building:** `deploy/build-web.sh` builds with `web.env` and checks the API address is in the build. `sudo -E` is ignored by sudo-rs, so the site would have built as a demo.
  - **Fixed on the way:** the API's rate limits counted every visitor behind Caddy as one (PR #30).
- [x] **Presence protocol contracts** (Track B of the [adoption plan](../architecture/external_voxel_repositories_adoption_plan.md), [ADR 0004](../architecture/adr/0004-presence-protocol-contracts.md)):
  - every protocol-2 message, in both directions, is a versioned contract in `packages/shared-types`;
  - the presence server checks `hello` and `auth` against them, and answers a game speaking another protocol version, which then asks the player to reload;
  - the tests hold the golden examples and the real traffic (with and without signed-in players) to the contracts;
  - the load test shows no regression.
- [x] **Business journeys** (Track A of the [adoption plan](../architecture/external_voxel_repositories_adoption_plan.md), section 6.6; [the journeys](../../tests/journeys/README.md)):
  - **Agents:** shared browser, merchant, operator and presence agents in `tests/agents/`.
  - **Scenarios:** seeded scenarios in the `test.scenario` contract (`shared-types` 0.5.0), with no credentials and example-domain links only.
  - **Journeys:** four, with 41 business milestones:
    - a visitor from Discover to the 3D storefront;
    - merchant onboarding to the pilot check-in;
    - reconnect and resilience;
    - attribution deduplication.
  - **Failures:** each names its milestone and its kind (product, rendering or environment). CI sets `JOURNEY_STRICT=1` and uploads the sanitized logs and screenshots of a failed run.
  - **Staging:** `JOURNEY_*_URL` and `JOURNEY_ALLOW_WRITES=1` point the suite at a running stack.
  - **Defect found:** a chat line retried after a reconnect was said twice. The presence server now remembers answers per account too.
- [x] **Recorded music:** 16 CC0 OpenGameArt recordings, with the procedural tunes as fallback (task 39)
- [x] **Walking inside a storefront** (a freeze exception, [world_freeze.md](world_freeze.md)):
  - **The avatar:** the visitor's own avatar, in its Wardrobe colours, comes in at the door of the interior viewer. A tap or click on the floor walks it there, round the furniture of the floor shown (a redesign too), and never through the walls or the stairwell.
  - **Unreachable floor:** a tap there walks it as near as it can get.
  - **Storefront tie-in:** choosing a spot in "Look at" walks it there too, and walking up to an offer lights that part of the storefront panel.
  - **Walk:** the "Walk" switch beside the wall views hides it.
  - **Code:** `lib/content/interiorWalk.js` (the floor plan, the arrival spot, routes through the city's walk planner) and `apps/web/components/interior/RoomWalker.jsx`.
  - **Tests:** `tests/interior-walk.test.mjs` (48 seeded rooms, 480 routes) and the browser test (the real rooms).
- [x] **"Look at" on phones:** the interior's "Look at" menu sits in the storefront panel, above the feedback board, instead of covering half the room (`apps/web/components/interior/LookAt.jsx`). Wider screens keep it over the room.
- [x] **Music director, a SimCity-style soundtrack** (`lib/game/musicDirector.js`):
  - **What changed:** the music no longer changes with the zoom. Zooming used to cut the track, swap playlists and change the volume.
  - **How it plays:** each track plays to its end, then a short quiet, then the next. Day and night change at the end of a track. Getting into a car switches to the radio at once with a crossfade, and so does staying at the arcade or a cafe for a few seconds; walking past changes nothing.
  - **Label:** it shows the track.
  - **Tests:** `tests/music-director.test.mjs` [`docs/architecture/day_night_sound.md`]
- [x] **District street names:** the Meadow Quarter's infill streets take garden-suburb names (Harrogate). The /editor suggests names from the list of the road's district. The avenues, cross streets and puns keep theirs [`docs/architecture/street_names.md`]

## To do

Sizes are working-day estimates. "Needs you" means a decision or an account is required first.

### 1. Backend and live data (the next big piece)
| # | Task | Size | Depends on |
| :-: | :--- | :-: | :--- |
| 1 | ✅ Choose the host and domain: voxelventure.app on a Linode, live since 2026-10-17 ([deploy/README.md](../../deploy/README.md)). The stack is settled: the Node API with SQLite, its own accounts and Stripe ([hosting_stack_payments.md](../operations/hosting_stack_payments.md)) | 0.5 | **Needs you** |
| 2 | ✅ Database: plots, owners, ledger, events and ad slots (`docs/architecture/backend.md`) | 3 | 1 |
| 3 | ✅ Accounts and atomic claim / take-over (Gold on the server still to do: it comes before the Gold-only 1.25x take-over, [takeover_payouts.md](../monetization/takeover_payouts.md)) | 4 | 2 |
| 4 | ✅ Event logging (visits, clicks with a source) and the stats, history and directory endpoints | 3 | 2 |
| 5 | ✅ The game claims, takes over, buys ad spaces and sends events through the server; sign-in only on claim; 15-second sync. Changes are pushed at once through the presence server, and the card's statistics and history come from the server | 2 | 3, 4 |
| 6 | ✅ Payments (Stripe): Launch Pack, Pro (with offers), sponsored placements, leases (claim, take-over, renewal) and market stalls; webhooks, reconciliation, refunds ([billing.md](../monetization/billing.md)). Not planned: buying Gold, and the real-money 1.25x payout until legal, tax and fraud review | 4 | 3, **needs you** (Stripe account, terms) |
| 7 | ✅ Moderation: word filter, optional outside service for images, reports with auto-hide, admin queue, bans (`npm run moderate`) | 2 | 3 |
| 8 | ✅ Email: confirmations, take-over notices, Plot of the Day newsletter (outbox, webhook or file transport; needs a real mail service key to deliver to the world) | 2 | 3 |

### 2. A bigger, authored world (island, ocean, shipping yard) ⏸ deferred by the freeze
| # | Task | Size | Depends on |
| :-: | :--- | :-: | :--- |
| 9 | ⏸ World recipe (cities, coast, highways, port) and a preview page | 3 | **Needs you** (layout) |
| 10 | ⏸ World format and bake step; global plot ids | 3-4 | 9 |
| 11 | ⏸ Streaming runtime: chunk manager, baked chunk geometry, overview pictures, spatial collision, shadows following the camera | 4-5 | 10 |
| 12 | ⏸ Several cities placed on one map; highways between them (and a fast-road class for traffic) | 5-6 | 9 |
| 13 | Street-name script (offline, OpenStreetMap; check the licence) — **script done** (`scripts/streets/road_generator.py`, see [street_names.md](../architecture/street_names.md)); names load in the generator and /editor | 1 | |
| 14 | ⏸ Coastline, island and ocean (boats and fishing work at sea) | 3 | 11 |
| 15 | ⏸ Shipping yard: quay, cranes, containers, moving ships | 4-5 | 14 |
| 16 | ⏸ Region-aware traffic, planes, daily features, search, multiplayer rooms | 4 | 11 |
| 17 | ⏸ (Optional) real terrain and mountains | 4-6 | 11 |

### 3. Content and polish
| # | Task | Size |
| :-: | :--- | :-: |
| 18 | ✅ **Walk-through hall:** the malls are hollow (`lib/city/mallHall.js`): four walls with a doorway, a concourse with a fountain, planters and benches, and a door for each store on the two long sides (press E at a door to go in). The roof and shell are hidden while you are inside. **Rent a store:** the directory has a Rent this store form (the store keeps its kind and interior; you name it and it is saved with the game; local game only, the stores are not on the server). Rented stores can be redesigned with Redesign inside | 3 |
| 19 | ✅ Other players see your car or boat (kind, colour, and a sailboat or rowboat) instead of your avatar: `veh` in the presence `state` message, checked and cleaned by the server | 2 |
| 20 | ✅ **Rotation:** others can share a billboard or banner (up to two extra ads at 0.4 of the slot value); the screen rotates every 10 s from the wall clock, so everyone sees the same ad (the owner gets two turns in every four). **Contrast:** ad text is white or black by WCAG contrast (at least 4.5:1 on any colour), a preview shows the ratio, colours are cleaned to #rrggbb. Local game only (a server slot holds one ad) | 2 |
| 21 | 🟡 **Done:** interior hotspots: a Look at list (Whole room, Entrance, Back wall, Left, Right, and for each offer an Offer desk, Video wall, Game cabinet, Visit reward) that glides the camera there and lights up that part of the storefront panel. **Left:** brand-specific interiors (looks, colours, props), mini-games, hosted WASM demos | 5+ (see `scope_assets_and_wasm.md`) |
| 31 | ⏸ Real 3D assets: model pipeline, Kenney buildings, MagicaVoxel landmarks, Blockbench avatar. **Done:** Kenney commercial and suburban buildings (31 models, instanced, box fallback, `?models=0`), `.vox` loader and the park monument. Also done: Kenney trees, bushes and cars (instanced, box fallback; park trees are leafy only), voxel mall, airport terminals as joined Kenney wings, Blockbench-layout avatar (`apps/web/public/models/avatar/player.glb`, sample made by `scripts/models/make-sample-avatar.mjs`). **Left:** your own Blockbench/MagicaVoxel art, Kenney ground tiles (Nature Kit `ground_*`, path pieces), the player-driven cars and remote players still use boxes | 11-14 plus modelling (`scope_assets_and_wasm.md`) |
| 22 | ⏸ 🟡 Started (the crescent: see priority 13). Original note: curved or diagonal reserved sites need curved lanes in the traffic model (`lib/sim/traffic.js` is built on straight, axis-aligned roads, with junction boxes, signals and a lane-based car-following), plus the site designer and the walkers' graph. It is a refactor of the simulation, not an add-on, so it was left | 5 |
| 23 | ✅ Traffic queues behind a car the player leaves in a lane and tows it after about 9 s; parked cars are saved with the city seed (`voxelventure-parked`). Walkers now walk round parked cars too | 1 |
| 24 | ✅ "Create image" on the building card (1200 x 630 PNG drawn in the browser, shared or downloaded; `lib/game/shareImage.js`); "Report" was already there (needs the server) | 1 |

### 4. Verification (no code, needs devices)
| # | Task |
| :-: | :--- |
| 25 | Frame rate on real phones and tablets (the monitor reports it); the Action camera and joystick on touch |
| 26 | Try the logo upload from a phone; storefront embeds (YouTube, Vimeo, itch.io) for real |
| 27 | Playtest the third-person, Action and **First person** cameras (distance, turn speed, feel). Automated now: the browser test checks that no follow camera ends up inside a building beside tall plots |
| 28 | Restart the dev server to pick up the `<Html>` patch (no warning when opening interiors in development) |

### 5. Housekeeping
| # | Task |
| :-: | :--- |
| 29 | Clear the `THREE.Clock` console warning |
| 30 | A saved game from before the latest generator changes gets a fresh city; after the world is fixed (task 10) this stops happening |

### 6. Open items found since
| # | Task | Notes |
| :-: | :--- | :--- |
| 32 | Interior viewer blank on one machine (Brave): check `brave://gpu`, Shields, or use Chrome/Edge; if it persists, get the first console error | Cannot reproduce in Chrome/Edge; framing was tightened but the dev screenshot did not change, so confirm after clearing `.next` |
| 33 | ✅ Draw the waypoint route on the corner mini-map | done (`apps/web/components/ui/MiniMap.jsx`) |
| 34 | ⏸ Stream the 3D scene by area (only the map is culled today) | see `../architecture/study_world_streaming.md` |
| 35 | Run `live-browser` and a docs/test pass for the world map on phones (pinch, touch) | needs a device |
| 36 | 🟡 From `../competitive-research/voxelventure_idea_01.md`: meeting and quote requests, newsletter sign-ups and purchase tracking are done ([conversions.md](../monetization/conversions.md)). Still to do: an in-store checkout, a calendar booking service (Cal.com) and the creator asset marketplace | needs outside services |
| 37 | Pascal viewer backdrop is grey and the cut view shows dither dots; no setting found, may need a patch | polish |
| 38 | Next 16.4.2 is out; the project stays on 16.4.0 for now | your choice when to upgrade |
| 40 | Chat launch checks (plan phase 4): load test with chat traffic, backup / restore of the new tables, metrics, a rollback run; then phone keyboards on real devices, timed chat restrictions, a moderator audit trail | 2-3 days, then a device |
| 41 | Chat decisions before going public (plan section 12): sign-in-only chat, request limits, retention, audience and age rules, who moderates, the 140-character limit | needs you |
| 42 | Messaging on the Python service, the switch-over (`../architecture/node_fastapi_architecture_plan.md` steps 6-7, runbook in `deploy/README.md`); before it: the presence load benchmark with the messaging calls on, a copy back from the service to Node for rollback, a restore rehearsal of both databases, metrics | 2-3 days, then your go-ahead |
| 43 | Close the inquiry/take-over race fully (a reservation held by the Node API), if a strict guarantee is wanted | 1 day, your choice |
| 44 | Reassessment: repository settings on GitHub: protect `main` (passing CI, a review, Code Owners review, no force pushes or deletion), secret scanning with push protection, Dependabot security alerts and updates (`CODEOWNERS` is in place) | needs you (GitHub settings) |
| 45 | Reassessment: published policies. **Drafted** at `/legal` (terms, privacy, refunds, advertising, retention, merchant responsibilities; consent lines at sign-up and on request forms; footer links). Left: fill in the placeholders, make the decisions and fix the product gaps in `docs/monetization/policy_review.md`, legal review, then approve (`POLICY_STATUS`) | needs you and a lawyer |
| 46 | 🟡 Reassessment: staging with Stripe test mode, mail, migrations, backups with a restore test, error reporting, uptime and alerts; certify checkout, webhooks, refunds and reconciliation end to end. **Done:** staging at staging.voxelventure.app ([deploy/STAGING.md](../../deploy/STAGING.md)), nightly backups with a restore test (production's first backup restored in 2.3 s), a rehearsed rollback (2.2 s), the four journeys against staging, off-site backups to Linode Object Storage, SSH keys only, Stripe test mode on staging (a paid building lease, one webhook, the plot handed over, and its refund), Sentry on both stacks, a mail service on production, and uptime checks in the owner's UptimeRobot account. Error reporting (Sentry), uptime checks (UptimeRobot) and the backup heartbeat (Healthchecks.io) are built ([deploy/MONITORING.md](../../deploy/MONITORING.md)). **Left:** a Pro renewal in test mode, the live key ([deploy/STRIPE_LIVE.md](../../deploy/STRIPE_LIVE.md)), and the backup heartbeat (`HEALTHCHECK_URL`) | needs the policies approved for the live key |
| 47 | 🟡 Reassessment: the pilot. **Done:**

- the pilot dashboard (`/admin/pilot`, `npm run moderate -- pilot`), with activation, qualified visits, leads, redemptions, purchases, verified revenue, payments, renewals and weekly retention per business;
- the criteria that lift the freeze;
- a weekly merchant check-in on the owner's dashboard ([pilot.md](../monetization/pilot.md)).

**Left:** recruit 10-20 businesses in two districts and run it for four weeks | the pilot (needs you) |
| 48 | ✅ Phase B ([ADR 0001](../architecture/adr/0001-shared-package-boundaries.md)), complete. **Done:**

- 15 contracts, including coupon claims, redemptions and the pixel;

- the profile rules moved into `business-core`, so the form and the server share one validation;
- the pilot criteria in `analytics`;
- contracts for meeting and quote requests, the pilot check-in and the pilot dashboard.

**Phase C step 1** (npm workspaces, imports by `@voxelventure/*` name, the `lib/business/` adapters retired) is merged. **Steps 2 to 5** are merged ([ADR 0003](../architecture/adr/0003-apps-and-services.md)): the app in `apps/web/`, and the API and the presence server in `services/`. Production and staging run this layout. **Phase D** (integration certification) is under way: see its progress in the [plan](../architecture/modular_monorepo_migration_plan.md#phase-d--integration-certification) | Phase D: Stripe test mode (needs the account) |
| 39 | ✅ Outside music: 16 CC0 recordings from OpenGameArt (city, night, arcade, cafe and driving playlists), with the procedural tunes as fallback ([day_night_sound.md](../architecture/day_night_sound.md), `docs/licences/music/`). Left: a listening check on real speakers, loop points for the tracks that have none | listening check needs you |

## Priorities: by impact and by what sets VoxelVenture apart from ClaimAvenue

ClaimAvenue is a static, single-player directory of buildings bought at 1.25x. VoxelVenture's edge is that it is a place: people walk, drive, meet, and a business can convert visitors inside its building. The list is ordered by how much each item widens that gap, then by how much it blocks everything after it. "You" means it needs your decision or an account.

**A. Make the differences real for outside users (do first)**
1. Go live (the deployment kit is ready in `deploy/`: Caddyfile, systemd units, settings templates, setup and backup scripts and a runbook, untested on a real server; you still choose the host and domain): choose the stack and host (task 1, you), deploy the API and presence server. Claims are already authoritative, and the building card's figures already come from the server (`../architecture/live_data.md`); what is left is the deployment itself.
2. ✅ Payments (task 6): Stripe Checkout for claims, take-overs, leases, market stalls and the business plans, with receipts and refunds ([billing.md](../monetization/billing.md)). The 1.25x payout to the old owner stays a Gold-only game rule ([takeover_payouts.md](../monetization/takeover_payouts.md)). Still needs you: the Stripe account and the terms.
3. 🟡 In-app conversion (`../competitive-research/voxelventure_idea_01.md` 1.2): newsletter sign-ups, meeting and quote requests, coupons with redemption, and purchase tracking are done ([conversions.md](../monetization/conversions.md)). Still to do: single-product checkout inside the storefront, and a calendar booking service (Cal.com).
4. Real mail delivery (a mail service key) for confirmations, lease notices and the newsletter.
5. Put the last local-only features on the server, so they count for everyone: rented mall stores, shared billboard slots, and Gold. Market bookings are already on the server, and paid.

**B. Deepen what only a game can do**
6. 🟡 **Brand-specific interiors: started.** Done: the furniture menu follows the business type (essentials first, "show all" for the rest), brand-coloured walls with an accent back wall, hotspots, and a price list with a business-worth formula that stays at zero until you set prices ([interiors_fixtures.md](../product/interiors_fixtures.md)). **Left:** your prices and rules for what items cost and how they change a business's worth, brand logo signs and props, mini-games, hosted WASM game demos.
7. 🟡 **Presence at scale: done** (protocol 2: interest management, short messages, load test; about 600 players in a packed crowd on one ordinary core, see [presence_scale.md](../architecture/presence_scale.md)). **Left:** one world split across several servers if it ever passes about a thousand at once, binary messages, guestbooks.
8. ✅ **My businesses dashboard** (toolbar icon; it opens by itself after you claim, take over or rent): every building you own with views, visitors, clicks, click rate, time inside, offers, lease state, a six-step set-up checklist (description, design the inside, coupon, visit reward, video or game, website) and actions (open card, design inside, show on map), totals, and a CSV export. Figures are verified-human with a server and simulated without. Also lists the ad spaces you hold or share and draws a 14-day chart per building. (Ad spaces are listed in the local game; with a server the slot owner is not yet shown.)
9. ⏸ Creator asset marketplace (idea 2.3): voxel facades, signs and furniture, with a revenue share.
10. ✅ (done) Free-look for the follow cameras (G or the camera menu: drag to pan, walking or G brings it back) and click-to-open from the world map (click a building or a mall for an Open / Waypoint card). Today, in Action, Third-person and First-person views the camera is tied to your avatar, so a building near the East mall can only be clicked once you have walked there (or switched to the original view). The world map can pan anywhere but cannot open a building from it except plots by shift-click; stores cannot be opened from it at all.

**C. Scale and spectacle** ⏸ deferred by the freeze ([world_freeze.md](world_freeze.md))
11. The bigger authored world: island, ocean, port, several cities, streaming runtime (tasks 9-17, 34).
12. Your own Blockbench/MagicaVoxel art and Kenney ground tiles; replace the remaining boxes (other players' avatars, walkers, driven cars) (task 31).
13. 🟡 **Curved reserved sites: started.** The designer has a **Curved crescent** style (dev tool): a curved street leaves the front road, sweeps round and returns, with turned lots on both sides, cars and walkers on it, drawn on the maps; it fits all 90 sites tested. **Left:** a curved street joined into the main junctions and signals (it is a self-contained street beside the main traffic), diagonal sites, routes across a curved street, and a shipped (non-dev) design for the market site.
14. ✅ Walkers walk round parked cars, and parked cars are shared between players (done).

**D. Verification and polish (cheap, but they gate a public launch)**
15. Frame rate and touch on real phones and tablets, first-person with one finger, phone logo upload, real embeds (tasks 25-27).
16. The interior viewer blank on one Brave setup (task 32), the Pascal backdrop and dither (task 37), the `THREE.Clock` warning (task 29).
17. Old saves get a fresh city after generator changes (task 30): stops once the world is fixed (task 10).

## Recently done: the outside of a building, pricing and links
- ✅ **Outside builder** (claim form and owner editor): floors (up to 10 on an ordinary plot, 12, 16 and 20 on bigger tiers, limited by what the shape can reach), shape (each lists its floor range), colour styles, wall colour, rooftop crown; the building shows on the lot while you choose; the owner can change it later. Saved in the browser's game; with a game server the settings are not stored yet.
- ✅ **Land price rules** and the `/pricing` heatmap tool ([pricing_analysis.md](../monetization/pricing_analysis.md)); the claim form shows the land price and each customising choice; a plot is claimed for that price and is then worth it. **To do:** your prices for customising (`lib/content/exteriorPrices.js`), the server using the same rules, the real world's plots carrying their attributes.
- ✅ **Three-minute hold** while setting a plot up (client side). **To do:** the same hold on the server.
- ✅ **Links and badges** (`/?plot=ID`, `/b/ID`, a share box with a copy-paste badge).
- ✅ **Shared day and night** (`lib/game/dayCycle.js`, `apps/web/components/city/DayNight.jsx`): a 24-minute day from the UTC clock, the same for everyone; sun, ambient and moonlight follow it; street lamps and windows light up at dusk (`apps/web/components/city/nightLights.js`). Bottom right: a time button (Live / Dawn / Day / Dusk / Night); `?time=night` or `?time=14.5` in the address. **To do:** car headlights, light pools on the road, window lights that differ from building to building (see [day_night_sound.md](../architecture/day_night_sound.md)).
- ✅ **Ambient sound** (`lib/game/soundscape.js`, `apps/web/components/SoundEngine.jsx`): hum, traffic by the hour, birds by day, crickets at night, water by a lake, muffled indoors; speaker button with volume; `?sound=0` / `?sound=1`.
- ✅ **Free-land finder, infill planner and amusement park** ([infill_and_land.md](../architecture/infill_and_land.md)): new streets across the free ground (inside the county road, and outer blocks in the country), lots with room for parking and visible roofs, about 800 to 1,100 lots a city, and an amusement park with a ferris wheel, carousel, swings and a roller coaster. **To do:** more capacity (tighter spacing as a setting, an outer ring, planes flying higher near airports), the rides as things to do, edit the street plan by hand.
- ✅ **Boats, piers and the riverwalk** ([boats_piers_riverwalk.md](../product/boats_piers_riverwalk.md)): getting out of a boat far from the shore sends it to the nearest pier and docks; piers by every lake and the river, fishing from them on foot; the fishing line fixed; a riverwalk with benches and lamps; luxury and grand estates along the river. **To do:** boat and pier sounds, ferries, renting boats, a promenade round the lakes.
- ✅ **Kenney models for boats, piers and the park** ([kenney_assets.md](../architecture/kenney_assets.md)): Watercraft, Pirate and Coaster kits (CC0) imported (57 models, 1.8 MB); boats, pier decks, the park gate, stalls, train, benches and trees use them, with the box versions as fallback; a `/models` preview page. **To do:** a ferris wheel and carousel (model them in MagicaVoxel, or credit the CC BY ferris wheel on Poly Pizza), a coaster track from Kenney pieces.
- ✅ **Presence-based sound** ([day_night_sound.md](../architecture/day_night_sound.md)): near the ground you hear the places round you (arcade bleeps, cafe jazz, offices, market, parks, water, mall, airport, the fun park's organ, countryside, busy streets); high above the map you hear the city's music; a music button and a "what you hear" label. **To do:** owners choosing their district's tracks, footsteps, weather.
- ✅ **Bigger Riverside Commons and lawns**: the big park grows over the free ground beside it (33 x 45 in the default city, was 20 x 31), the leftover free ground inside the built-up area is drawn as lawn instead of bare slate, and new streets may join lake loop roads ([infill_and_land.md](../architecture/infill_and_land.md)).
- ✅ **Tier mix**: prime about 8%, luxury 2.5%, grand 0.8% of the lots (`TIER_SHARES`, `tierTargets` in `lib/game/landPrice.js`); the generated test city now has about 60 prime, 19 luxury and 6 grand lots, and the shares hold for 1000+ lots.

## From the idea documents
Ideas 02 to 06 are reviewed in [ideas_review.md](ideas_review.md), with quick wins (deep links and badges, a shared day/night cycle, ambient sound, style presets, crown props, facade ticker) ahead of the longer projects.

## Suggested order
Re-ordered on 2026-10-16 to follow the [competitive alignment review](../competitive-research/claimavenue_competitive_alignment_review.md#recommended-implementation-sequence): the commercial loop first, the world after it is validated.
1. ✅ **Phase 1, freeze world expansion** ([world_freeze.md](world_freeze.md)): deferred items marked ⏸; stability, performance and accessibility work continues (tasks 25, 29, 30, 32, 35, 37).
2. ✅ **Phase 2, business-first funnel** ([business_funnel.md](../product/business_funnel.md); built, not yet tried with real businesses): free business profile, public indexable pages (`/discover`, `/business/[slug]`, `/district/[slug]`, `/category/[slug]`) with Open Graph images and structured data, CTA selection, share and referral attribution, owner onboarding, value-linked upgrade prompts. The 3D building becomes an optional destination linked from the profile.
3. ✅ **Phase 3, authoritative production data** ([authoritative_data.md](../architecture/authoritative_data.md); deployed 2026-10-17 to voxelventure.app on a Linode, `verify:live` passes all 17 checks): task 1 (stack, host, sign-in), deploy the API (priority A1), server-owned claims and leases, verified statistics only (no simulated figures in owner dashboards), ads, market bookings, moderation and audit records.
4. ✅ **Phase 4, low-risk monetisation** ([billing.md](../monetization/billing.md); done in code; the Stripe account and terms need you): Stripe Checkout with webhook idempotency for a $9 Launch Pack, $19/month Pro, fixed-term sponsored placements, market bookings and leases (task 6, without the real-money 1.25x payout until legal, tax and fraud review).
5. ✅ **Phase 5, conversion measurement** ([conversions.md](../monetization/conversions.md)): meeting and quote requests on the profile, impressions, qualified visits, store entries, coupon redemptions and purchases credited by click id, the funnel with cost per result on the dashboard, and the renewal rate.
6. 🟡 **Phase 6, constrained pilot** (the dashboard and check-in are built: [pilot.md](../monetization/pilot.md)): 10-20 businesses in two districts for four weeks; the freeze lifts if it meets the criteria in [world_freeze.md](world_freeze.md#when-it-lifts).
7. Alongside all of these (the review's P0 list): ✅ CI (`.github/workflows/ci.yml`: build, lint, tests, `check:freeze`) and Dependabot; **needs you:** a protected `main` with the CI check required, secret scanning, and privacy, refund, advertising and placement terms. Item-by-item status: [alignment_status.md](alignment_status.md).
