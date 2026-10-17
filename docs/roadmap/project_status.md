# VoxelVenture — Project Status

Everything added to the project so far, on top of the original Next.js + React Three Fiber city (`CityCanvas`, `GroundGrid`, `PlotMesh`, `Header`, `PlotCard`, `InteriorModal`, zustand store). See `../product/voxelventure_blueprint.md` for the product concept.

> **Verification note:** every change passes `npm run lint`, `npm run build` and the test suites (`npm run test:all`: generator, topology, estates, parks, landscape, flight, walking, traffic, stress, multiplayer, and a real-browser test). Visuals are spot-checked with screenshots from headless Edge. New to the project? Start with [overview.md](../product/overview.md).

---

## 1. Routes

| Route | What it is |
| :--- | :--- |
| `/` | The voxel city: roads, districts, park, plots, legend |
| `/editor` | The city editor (`components/dev/CityEditor.jsx`, see [city_editor.md](../architecture/city_editor.md)). It was the Pascal building editor at first; the Pascal editor now opens inside a building (*Redesign inside*) |
| `/viewer` | Pascal 3D viewer (`<Viewer selectionManager="custom">` + drei `CameraControls`). Shows whatever scene is in the Pascal store; a fresh store is empty |
| `/admin` | Client monitor (5i) |
| `/b/[id]` | Link to one building in the city (see tasks.md, links and badges). A building linked to a business page shares that page instead |
| `/discover` | Public discovery page: search, categories, districts, sponsored and new-this-week rows ([business_funnel.md](../product/business_funnel.md)) |
| `/business/[slug]` | A business's public page: one call to action, an offer, a share image and structured data; works without WebGL |
| `/business/new`, `/business/manage` | Listing a business for free, and the owner's dashboard: funnel, results, plans and checkout ([conversions.md](../monetization/conversions.md), [billing.md](../monetization/billing.md)) |
| `/category/[slug]`, `/district/[slug]` | Category and district pages, each with its own share image |
| `/legal`, `/legal/[slug]` | The draft policies: `terms`, `privacy`, `refunds`, `advertising`, `retention`, `merchants` ([policy_review.md](../monetization/policy_review.md)) |
| `/sitemap.xml`, `/robots.txt` | The public pages for search engines |
| `/curves` | Curved-road sandbox (5d) |
| `/reference` | Road design reference (5e) |
| `/pricing` | Land price heatmap tool (`docs/monetization/pricing_analysis.md`) |
| `/models` | Preview of the imported models (`docs/architecture/kenney_assets.md`) |
| `/land` | Free-land and new-streets designer (development tool, `components/dev/LandMap.jsx`) |

---

### Interior viewer (inside the city page)
Clicking a claimed plot, then **Enter Interior**, opens `InteriorModal` with the Pascal `<Viewer>` showing a themed room:
- `lib/content/interiorScenes.js` builds a Pascal scene graph per building from its **type, variant and height**:
  - **Floors:** one per ~1.2 units of building height (`floorsForHeight`): offices 2-4, restaurants and shops 1-2. Each floor is a Pascal level (2.5 m storey) with a slab, 4 walls and windows; the ground floor also has the front door. Floors are joined by a **spiral staircase** in the north-east corner (a 2.7 m square is kept clear of furniture on every floor of a multi-floor building).
  - **Room size** scales with type: office 12x8 m, restaurant 10x7, shop 8x6 (market 10x7, arcade 9x6). Layouts are functions of the room size, so a bigger room gets more desks / tables / shelves.
  - **Ground-floor layouts:** office `openplan` (reception, desk rows with chairs, bookshelves) or `meetings` (conference table, wall TV, storage); restaurant `diner` (table grid, kitchen line) or `cafe` (service bar with stools and coffee machine, small tables); shop `boutique` (closets, racks, display tables, checkout), `market` (shelf aisles, coolers, checkout) or `arcade` (pool table, hoops, TV, sofa).
  - **Upper floors:** offices alternate between their two layouts; restaurants get a `lounge` (more tables plus a piano); shops get a `showroom` (sofa, carpet, display furniture).
  - Plots without a type (e.g. older data) fall back to the first layout of their type, or the open-plan office.
  - **Floor switcher:** the modal shows a floor selector (up/down arrows and a G/1/2/3 column) for multi-floor buildings. It uses the viewer's `solo` level mode so only the chosen floor is shown, and the camera glides to that floor's height. The footer shows layout, floor count and room size.
- Furniture comes from Pascal's own catalog (`@pascal-app/editor/catalog`), so those models load from the catalog's CDN; doors and windows use the local `/items` models.
- `components/interior/InteriorViewer.jsx` loads the scene with `applySceneGraphToEditor`, shows `<Viewer>` with drei `CameraControls` (orbit/zoom), and clears the shared scene store again on close. The modal loads it lazily (`next/dynamic`, no SSR).
- Validated in Node for all 7 layouts at 1, 2 and 4 floors: every node (including levels and stairs) passes Pascal's `AnyNode` schema, stairs link consecutive levels, every catalog item resolves, and no furniture overlaps, leaves the room, blocks the front door or sits in the stairwell. Not checked: how the rooms and the spiral staircase look in a browser (door/window facing, furniture rotation and stair geometry were not seen).

## 2. Build, config and dependencies

### Fixes to get the build working
- **`jsconfig.json`** added: maps the `@/*` import alias to the project root. Without it, every `@/components/...` import failed.
- **Tailwind** moved to **v4** because the Pascal editor UI requires it:
  - `postcss.config.mjs` uses `@tailwindcss/postcss`. The old empty `postcss.config.js` and the v3 `tailwind.config.js` are deleted.
  - `app/globals.css` starts with `@import "tailwindcss"` and `tw-animate-css`, then `styles/elevation.css`, `@source` lines for the Pascal packages, the editor's theme tokens, and the original body styles.
  - `bg-background` in `app/page.jsx` became `bg-[#090d16]`, because the editor's theme defines its own `background` color.
- **`next.config.mjs`**: `transpilePackages` for three, fiber, drei and the Pascal packages (they ship TypeScript source), plus Turbopack aliases so React, three, fiber and drei resolve to a single copy.

### Packages added
`@pascal-app/core`, `@pascal-app/viewer`, `@pascal-app/editor`, `@pascal-app/nodes` (all 1.0.3), `@tailwindcss/postcss`, `tailwindcss@4`, `tw-animate-css`, `zod`. `autoprefixer` was removed.

### Vendored / copied from upstream (`pascalorg/editor`)
- `vendor/typescript-config/`: the editor's `tsconfig.json` extends `@pascal/typescript-config`, a workspace-only package that isn't on npm. Installed as a local file dependency so Turbopack can parse it.
- `styles/elevation.css`: shared shadow/elevation utilities used by the editor.
- `public/` (about 28 MB): `icons`, `audios`, `items`, `hdri`, `material`, `cursor.svg`.
- `lib/content/pascalBootstrap.js`: registers the built-in node kinds (`builtinPlugin.nodes`) once, before the first `<Editor>` or `<Viewer>` renders.

Upstream's optional plugins (trees, pool, streetscape, WebXR and similar) were **not** added.

---

## 3. The procedural city

All of this is driven by one seeded generator, so the same seed always produces the same city (server and client agree). The default seed is `20260101`, and the **Regenerate city** button picks a new random one.

### Generator — `lib/city/cityGenerator.js`
`generateCity(seed)` returns `{ plots, layout }`, where `layout` holds `roads`, `parks`, `intersections`, `districts`, `center` and `seed`.

- **Grid and plot size:** plots are **3 x 3** (buildings 2.55, up from 2 / 1.7), 0.4 apart, in 21 columns (−10..10). Roads keep a fixed 2.8 corridor (1.6 asphalt + two 0.6 sidewalks) and a plot's edge always sits on the corridor edge, so the avenues are 9.2 apart and the plot columns around a cross street are spaced to stay flush with it. Every plot stores its own world position (`x`, `z`); nothing else assumes a fixed grid spacing.
- **Districts and avenues:** six east–west avenues, 3 grid rows apart, each flanked by a plot row on each side. The four districts are shuffled and then repeat (never back to back), so two districts have two avenues:
  - SaaS Silicon Strip (blue)
  - Arcade Alley (pink)
  - Creator Commons (violet)
  - Agency Boulevard (teal)
- **Cross streets:** 3–5 north–south streets at random columns (at least 3 apart, never the outermost columns), with random names from a pool (Byte St, Pixel Ln, Voxel Way and so on).
- **Floors:** `interiorData.floors` comes from the building height. Over 100 generated cities: offices 2 floors (24%), 3 (49%), 4 (28%); restaurants 1 (41%) or 2 (59%); shops 1 (46%) or 2 (54%). Claimed plots get the typical height of their type. Facades show one dark line per floor boundary.
- **Building types:** each claimed plot is an **office**, **restaurant** or **shop**, chosen by district odds (`typeWeights`: SaaS Silicon Strip and Agency Boulevard lean office, Arcade Alley leans shop, Creator Commons mixes shops and restaurants). The type sets the name suffix (HQ, Diner, Boutique...), category (Food & Dining, Retail, or the district sector for offices), height range, an interior `variant`, and the exterior cues below. Plots also store `facing` (+1/-1: which way the front door looks, toward the avenue they sit on).
- **Plots:** fill the remaining cells (about 560 per city, between 508 and 612: the main grid, Old Town, about 134 Outskirts lots along the ring roads, about 100 Countryside lots, about 46 Lakeside and 54 Riverside waterfront lots).
- **Prime plots:** 10 per city take up several cells and sell for a premium: 3 **flagships** (2 x 2 cells, 6.4 x 6.4), 3 **double-deep** (the two back-to-back cells between two avenues, 3 x 6.4, with a door and awning on each avenue) and 4 **double-wide** (two side by side, 6.4 x 3). They are chosen by frontage: candidates are ranked by how much arterial, arterial-street or ring-road frontage they have (ties random), so they end up on the best roads. A merged plot's footprint is exactly its cells plus the gaps between them, so nothing overlaps. Empty prime lots cost 3.5x per cell (about 400-1,400 against 50-100 for a normal lot); built ones are worth 3-6x a normal business and have 1.35x taller buildings (so more floors). 35% of them start built, the rest are for sale. Their buildings have a gold-rimmed foundation and a roof pennant (empty ones a gold wireframe); the mini-map outlines them in gold; the plot card says "Prime plot"; their interiors are 4 wider and 2 deeper (an office floor grows to 16 x 10). Claiming or taking one over keeps it prime. Only about 25% are claimed (`CLAIMED_RATIO`), so most of the city starts as empty lots; the claimed ones are random, with district-themed titles, categories, colors, heights, owners, values and visits. The rest are unclaimed lots. Each plot carries `districtId` and `district`.
- **Park:** replaces the 2-row block of plots between two adjacent avenues, 2–4 columns wide, never overlapping a cross street (it prefers wider). It has a random name, a seeded tree layout, a monument corner, a visitor count, and a list of neighboring plots.
- **Park boost:** plots across the avenues from the park, and beside it, get `parkBoost` (+25%, `PARK_BOOST_PERCENT`) and their `visits` increased by 25%.
- **Road hierarchy:** 2 of the 6 avenues (positions 1 and 4, spaced three apart) and 1–2 cross streets (one near the middle, two spread apart when there are four or more) are **arterials**; the rest are **local**. Arterials are drawn with a solid double center line, locals with dashes.
- **Mid-block crossings:** every avenue block at least 9.6 units long (4+ cells between cross streets or the city edge) gets a zebra crossing at its midpoint with 80% probability (0–17 per city; 4 on the default seed). Street lamps keep clear of them.
- **Billboards:** up to 3 large roadside billboards, one at the start of each arterial avenue (facing east, down the road) and one at the north end of the first arterial cross street. All but the last advertise a business from the city (its name, a tagline by building type, its colour and link); the last starts empty so there is always a slot to take. Each has a price (`value`), views, clicks and a Hall of Fame list.
- **Ring roads (closing the loops):** four arterial ring roads (North, South, East, West Ring) run round the whole city, 6 units outside the outer plots. Every avenue and street meets its rings at a junction (a T), and the arterials carry on to the county road (section 5f). Previously the roads dead-ended at the city edge, and later ran 3.4 units past the rings as open stubs; those stubs are gone. The rings are arterials, so they get signals where they meet other arterials and the ring has priority over local roads. Intersections are now found generally (every horizontal road crossing every vertical one): about 57 per city.
- **Billboards:** moved off the road ends into the band between the city and the ring (beside the west end of each arterial avenue and the north end of the first arterial street), so they never sit on a road.
- **Intersection control** follows the road classes that meet (`planIntersection`):
  - arterial × arterial → **signal** on all four approaches
  - arterial × local → **two-way stop**: only the local street's approaches stop, the arterial flows freely
  - local × local → **all-way stop**, except up to two (`MAX_ROUNDABOUTS`, and only when there are enough to spare) that become **roundabouts** with yield on entry
  - Each intersection stores per-approach states (`west`/`east` on avenues, `north`/`south` on streets: `stop`, `signal`, `yield` or `free`) and a random signal timing `phase`.

### Components
| File | Role |
| :--- | :--- |
| `components/city/RoadMarkings.jsx` / `MidBlockCrossing.jsx` | Shared zebra-crossing texture/mesh; mid-block crossing = zebra + a blue pedestrian sign on each sidewalk facing oncoming traffic |
| `components/city/Road.jsx` | One road (avenue or street): asphalt, center dashes (district color on avenues, white on streets), sidewalks cut at intersections, **corner blocks** that close the sidewalk loop at each intersection, street lamps every 4.8 units alternating sides (emissive heads, no real light sources), and a floating name label |
| `components/city/Billboard.jsx` | Large billboard on two posts (5.2 x 2.4 screen, catwalk, spotlights). The screen is a canvas texture painted from the current ad (brand-colour wash, badge, headline, tagline, link, "sponsored") or a "YOUR AD HERE / take this slot for $X" placeholder. Clickable; frame lights up on hover and amber when selected |
| `components/city/Park.jsx` | Lawn, hedge border with a gate at each path entrance (trees are clamped so their whole canopy stays inside it), cross paths, fountain (basin, tier, jet), monument, 4 benches, seeded trees, floating name label. Clickable; hover and selected states lighten the lawn |
| `components/city/IntersectionControl.jsx` | Per approach: a zebra crosswalk (shared canvas texture) on every approach, and for controlled approaches a white stop bar in the right-hand lane plus a pole on the matching corner block (red octagon stop sign or animated traffic light, 12 s cycle: avenue green 0–5 s, yellow 5–6 s, red 6–12 s; the street is the mirror image so cross traffic is never green together). Roundabouts get a circulating lane, a raised island (kerb, grass, tree), yield signs on the corner poles and a dashed give-way line |
| `components/city/CityCanvas.jsx` | Renders roads, park, intersections and plots inside a group recentered on the city. Camera zoom 20 (min 8), shadow map 4096 covering ±70 units |
| `components/city/PlotMesh.jsx` | Plots next to the park get a dark-green foundation tile. Claimed buildings get a door on the front and a dark line per floor boundary; restaurants a red awning, shops an amber awning, offices a blue glass band and a rooftop unit |
| `components/ui/Legend.jsx` | Bottom-left panel: districts with claimed/total counts, the park, street names, stop/signal counts, a key, and the **Regenerate city** button with the current seed |
| `components/ui/BillboardCard.jsx` | Card for a clicked billboard: views / clicks / CTR; **micro-card CTAs** (email signup, reveal offer code, visit link; each counts as a click); a **look-at-the-ad quest** (10 s open = +25 Gold, once per billboard); a **take-over form** (price 1.25x, previous advertiser paid out +25%); and the slot's **Hall of Fame** |
| `components/ui/ParkCard.jsx` | Bottom-right card when the park is clicked: daily visitors, +25% neighbor boost, landmarks, and a list of neighboring plots (clicking one selects that plot) |
| `components/ui/PlotCard.jsx` | Now shows the plot's district and building type; the claim form has a Shop / Restaurant / Office picker (it sets the interior layout); and an emerald "Next to the park: +25% foot traffic" badge on boosted plots |

### Store — `lib/state/store.js`
State: `plots`, `layout`, `selectedPlot`, `selectedPark`, `activeInteriorPlot`.
State also holds `billboards`, `selectedBillboardId`, `gold` and `completedQuests`. Actions: `setSelectedPlot`, `setSelectedPark` and `setSelectedBillboard` (selecting one clears the others), `clearSelectedPlot` (clears all), `recordBillboardView` / `recordBillboardClick`, `completeBillboardQuest`, `buyBillboard` (1.25x), `openInterior`, `closeInterior`, `regenerateCity(seed?)`, `claimPlot`.

`lib/mockData.js` (the original 5 hand-written plots) is no longer used; it was removed in 5k.

---

## 4. How to read the city (indicators)
- **Avenue** = colored label at its west end + center dashes in that district's color.
- **Cross street** = dark name tag at its north end + white dashes.
- **Park** = green name label, green legend entry, clickable.
- **Green-tinted foundation** = plot sharing the park's foot traffic.
- **Double solid center line** = arterial; **dashed** = local street.
- **Red octagon** = stop sign (only on the approaches that must yield). **Traffic light** = arterial × arterial. **Zebra stripes + white stop bar** = crossing and stop line. **Glowing lamps** = street lights. **Red inverted triangle + dashed line + central island** = roundabout. **Blue square sign + zebra mid-block** = pedestrian crossing. **Big screen on two posts** = billboard ("YOUR AD HERE" = open slot). **Red awning** = restaurant, **amber awning** = shop, **glass band + roof unit** = office.
- **Solid block** = claimed plot. **Wireframe** = unclaimed.

---

## 5. Known issues and open items

*(Rewritten after the 5l–5p work; the old list was stale: mobile, lint, traffic, the 520-plot size and the missing diagonal are all done.)*

**Needs a decision or a backend**
- **With an API server, the server owns the shared world** ([backend.md](../architecture/backend.md), [authoritative_data.md](../architecture/authoritative_data.md)): claims, take-overs, leases, ad spaces, market bookings, leads and the verified statistics. Two players see each other's claims, and they are pushed at once. Without a server, everything is still local to the browser, as before. **Gold** (and outfits, the hunt) is still kept in the browser, and moving it to the server is on the list ([tasks.md](tasks.md)).
- **Payments** run through Stripe Checkout when it is set up ([billing.md](../monetization/billing.md)). Email sign-ups (double opt-in), coupon tickets with redemption, and meeting and quote requests are on the server ([conversions.md](../monetization/conversions.md)). Email delivery needs a mail service key.
- **Banner and billboard ad spaces** are bought through the server when there is one (paid in the game's money, not real money); without one, they are a local simulation.

**Visual and play checks still worth doing by hand**
- The look of cars and walkers, the planes and banners, the landscaping and the gardens have been checked in screenshots but not played at length on a real phone. Real-device frame rates are still to be confirmed (software-rendered headless runs are only a rough guide; the monitor reports real ones).
- Interior scenes are hand-laid-out; check door/window orientation and spacing. Every claimed plot gets an interior, and the Pascal scene store is shared with `/editor` and `/viewer`.
- The `/viewer` page is empty by default and uses a WebGPU renderer.
- Storefront embeds (YouTube, Vimeo, itch.io) are validated and sandboxed but have not been loaded for real; itch.io only embeds pages whose owner allows it.
- Prime plots have two fronts but one door prompt. (Brand offers now have interior hotspots, 5y.)

**Known limits**
- Ad rotation and the contrast check (5y) are in the local game only: a server ad slot holds one ad.
- Other players see your car or boat, and parked cars are saved and shared (5y). Moved boats are not saved.
- Cars vanish at the end of a road next to the billboards (no U-turn).
- Console warnings that are harmless: `THREE.Clock` is deprecated; `PCFSoftShadowMap` was removed.
- Blueprint items not started: Rapier physics, PartyKit/Colyseus-style authoritative multiplayer and the interior mini-games. (Stripe Checkout is done, and brand budgets for quests are paid from the owner's Credits.) See section 6.

**Done since the old list** (so it is not re-opened): moderation, the owner's sign-ups screen and Credits (backend.md), the directory and the live-data layer (5x), the building card and wider side panel (5w), mega malls (5u), driving, sailing and fishing (5t), roof banners, camera views and the `lib/` layout (5s), mobile controls (5g), lint (5k), traffic and pedestrians (5c), a mixed city with water and a closed road network (5f), diagonal avenue and circles (5h), multiplayer and monitor (5i), performance (5j), luxury/grand estates and reserved land (5l), airports and banners (5m), a second park and landscaping (5n), the side panel (5o).

---

## 5b. Playing the city (avatar, saving, daily loop, Gold)

**Avatar and movement** (`components/city/Avatar.jsx`, `lib/sim/avatarState.js`)
- A voxel character (about 1 unit tall) with walk animation. **WASD / arrow keys** move it relative to the screen, **Shift** runs, **click the ground** to walk there (it gives up on a target it can't reach). The camera follows while it walks and can still be panned when it stands still. Typing in a form, an open interior or the Wardrobe pauses the keys.
- Its live position is plain mutable data (`avatarState`), not React state, because it changes every frame. The mini-map and the interaction check read it.
- It starts on the first arterial avenue and respawns when the city is regenerated.

**Collisions** (`lib/sim/collision.js`, `lib/city/parkGeometry.js`)
- Solid: claimed buildings, the park's hedge (gates are open), fountain, monument, benches and tree trunks, billboard posts, roundabout islands. Walkable: roads, sidewalks, crossings, empty lots, park paths.
- Simple axis-aligned boxes with sliding along walls, not Rapier.js: this world is all boxes, and it avoids a physics dependency. The park mesh and the collision map share one geometry module, so what you see is what you bump into.
- Claiming the lot you stand on pushes the avatar out of the new building.
- Checked in Node over 40 seeds: every claimed building's door, all four park gates, every billboard front and the daily chest spots are reachable from the spawn point.

**Enter buildings** (`InteractPrompt.jsx`)
- Stand at a claimed building's front door and press **E** (or click the prompt) to enter its interior. Other prompts: Look at an empty lot, View a billboard (stand in front), Visit the park (stand inside), Open the daily chest.

**Mini-map** (`components/ui/MiniMap.jsx`, in the City Map panel)
- A round top-down map of the whole city, turned 45 degrees to match the isometric view: roads (district-coloured avenues, brighter arterials), plots (claimed in their colour), park, roundabouts, billboards (indigo = taken, amber = open), your avatar (arrow and pulsing ring), today's Plot of the Day (gold ring) and the daily chest (gold dot). Redrawn about 9 times a second.
- Below the map, the notes are split into three tabs so the panel never grows tall: **Places** (districts with claimed counts, the park, building types and what their awnings mean, Old Town), **Roads** (street names, arterial vs local, how many signals / stops / roundabouts / crossings) and **Play** (controls, today's rewards, billboards, taking over, Gold). The tab pane is a fixed height and scrolls inside, and the open tab is remembered per browser.
- The panel **collapses to a compact 76 px round map** with the chevron (and expands again by clicking it). The choice is remembered per browser.

**Saving progress** (`lib/state/store.js`, zustand `persist`)
- Saved in the browser: Gold, claimed plots, billboard ads / prices / stats / Hall of Fame, finished quests, owned and worn cosmetics, daily-reward dates, and the city's seed. The city itself is regenerated from the seed. A save that no longer matches what the generator produces (after a code change) is ignored for the city but Gold and cosmetics are kept.
- Loaded after mount (`skipHydration`) so the first render matches the server's.

**Daily loop** (`lib/game/daily.js`)
- Everything is picked from the local date and the city seed, so it's the same all day with no server.
- **Plot of the Day:** one of the city's own businesses (never one the player claimed, so it can't change mid-day). It has a spinning gold gem over it; walking inside pays **+20 Gold** once a day.
- **Daily chest:** one chest per day on a different sidewalk spot; press E next to it for 10-50 Gold, once a day. It reappears the next day (the date is re-checked every minute).

**Spending Gold** (`components/ui/Wardrobe.jsx`, `lib/game/cosmetics.js`)
- **Wardrobe** (header button): tops, pants and hats change how the avatar looks; emotes (Wave 30, Jump 40, Dance 60 Gold) are played with the **1 / 2 / 3** keys.
- **Sponsored raffle:** 15 Gold a ticket; prizes 0 / 10 / 25 / 60 / 250 Gold at 55 / 25 / 15 / 4 / 1 %. The expected payout is 11.15 Gold, so it is a Gold sink.
- Rewards and purchases show a short toast.

## 5c. Traffic, pedestrians and taking over businesses

**Cars and pedestrians** (`lib/sim/traffic.js` simulation + `components/city/Traffic.jsx` renderer)
- About 46 cars and 56 people at a time. The simulation is pure JavaScript with no rendering in it, so it can be run for hours of simulated time in a test; the renderer draws every car and person with instanced meshes (one draw call per body part for all of them).
- **Cars** drive on the right in lanes, follow the car ahead, and enter at the city's road ends (leaving at the far end). They obey the intersection control: stop at red (and at yellow when they can), stop fully at stop signs and wait their turn (all-way) or for a gap (two-way), yield and go around the roundabout island, and give way to anyone on a zebra crossing, including your avatar. They go straight or turn at random; unprotected left turns happen only at stop signs and roundabouts. They don't enter an intersection with no room beyond it (they lose patience after 5 s).
- **Pedestrians** walk the sidewalks and cross only at the zebras: at a signal, only while their direction is red with 3 s or more left, and never in front of a moving car or one still driving over the crossing. They wander the whole sidewalk network, including mid-block crossings.
- Signal timing is one shared module (`lib/sim/signals.js`), so a car stops exactly when its light shows red.
- Checked headlessly (also re-run on the ring-road layout, with 46 cars and 56 people, over 6 cities x 10 simulated minutes, about 3,500 cars and 9,800 pedestrian crossings): 0 car-car overlaps, 0 cars hitting walkers, 0 cars or walkers inside buildings, 0 stuck cars, longest wait 23 s. The simulation costs about 0.05 ms per frame.
- Bugs this found and fixed: westbound / northbound cars ignored every intersection but the last; pedestrians checking a stale list of cars after one had just left an intersection; no right-of-way for cars already crossing in front of priority traffic; cars blocking the intersection.

**Old Town and taking over businesses** (`lib/state/store.js`, `components/ui/PlotCard.jsx`)
- **Old Town** is a neighbourhood past the East Ring: the first arterial avenue and the avenue either side of it carry on east, crossed by two local streets (Old Town Lane, Chapel St) and closed off by Old Town Rd on the east side, so the roads form blocks and loops. It has **48 house lots** (6 rows of 8). Its lots can't be claimed directly: they're for owners who get bought out.
- **Take over:** click a business that isn't yours and fill in the take-over form. You pay 1.25x its value (no real money yet; like claiming, the value is just a number). The building becomes yours, with your name, type and a new interior. The old owner is paid out at that price, recorded in the plot's **Hall of Fame** (name, old business, payout, where they moved), and moves into the next free Old Town house, which shows "Moved here after being bought out of ...". When Old Town is full they retire instead.
- Old Town houses have their own small interior (`house/cottage`). The Plot of the Day now keys off the originally generated businesses, so it can't change when plots change hands.
- Checked: price, Hall of Fame, relocation, refusal to take over your own business / a retiree's house / an empty lot, a full Old Town, a saved-and-reloaded game, and old (pre-Old Town) saves keeping Gold and cosmetics.

## 5d. Reserved land and curved roads

**Reserved land** (`layout.reserved`, drawn by `components/city/ReservedArea.jsx`)
- A **34 x 30** rectangle south of Old Town and just east of the East Ring is kept empty in every city: no plots, roads, billboards, park or intersection are ever generated there (checked over 100 cities). It's marked with a faint amber wash, a dashed border and a label in 3D, and with a dashed amber box on the mini-map. It's only a marker: you can walk and drive through it. It's reachable on foot and inside the walkable bounds (checked over 25 cities).
- It's meant for a hand-designed road and plot. Add the road to `layout.curvedRoads` (and its plots to the plot list) when the design arrives.

**Curved roads** (`lib/city/curves.js`, `components/city/CurvedRoad.jsx`)
- A curved road is described like a turtle walking: a start pose and segments. Headings: 0 = south, PI/2 = east, PI = north, -PI/2 = west; a positive arc angle turns right, a negative one left.
  `{ id, name, start: { x, z, heading }, segments: [ { line: 10 }, { arc: { radius: 16, angle: Math.PI / 2 } }, ... ] }`
- Arcs are exact circles, so a 90 degree turn of radius R ends exactly R east and R south of where it started. Radius must be at least 2.4 (`validateSpec` rejects tighter bends, which would fold the inside pavement over itself).
- **Drawn** like the straight roads: 1.6 asphalt, a 0.6 pavement with kerbs each side, a dashed centre line, and a street lamp every 4.8 alternating sides, as smooth ribbons following the curve. A road that starts and ends on an axis-aligned heading (a multiple of PI/2) at the end of an existing road joins it cleanly.
- **Plots beside a curve** (`plotsAlong`) are turned to follow it, each with its front door facing the road. On the inside of a bend the plots are moved out by exactly enough to keep their corners off the pavement, and each is placed where it clears the previous one by the full 0.4 gap, so they stay tidy on any bend (checked at radii 10, 14 and 30, both sides; the very tightest bends take no plots on the inside rather than cramming them in). Plots have a `yaw`.
- **Walking:** collision now supports turned boxes, so buildings along a curve block exactly their own footprint (not their bounding box); verified that the whole curve and both pavements are walkable end to end with the real movement code and that every door beside it can be reached.
- The mini-map draws curved roads as lines.
- **Sandbox:** open `/curves` to see a sample bend with plots on both sides, away from the city (the sample design is in `lib/city/curveDemo.js`; it also shows any layout problems it finds).
- **Used in the city now:** none. The oval ponds and their curved lake drives were replaced by rectangular lakes with straight loop roads (5f) so every road has proper junctions at both ends. **Not done yet:** cars and pedestrians don't use curved roads (they only know the straight road network), curved roads don't form intersections with other roads, and there is no editor: a design is written by hand as above.

## 5e. Filling the empty land, ponds, road references and storefronts

**Outskirts lots and ponds** (`frontageLots` in `lib/city/cityGenerator.js`; `components/city/Lake.jsx`). *The ponds and lake drives described below were replaced by rectangular lakes with loop roads in 5f; the Outskirts lots remain.*
- **Outskirts:** about 116 more purchasable lots now line **both sides of the four ring roads and Old Town Rd**, packed from the start of each stretch between crossings and touching the pavement like the main grid. A lot is only placed if it fits clear of every road, plot, billboard, the park and the reserved land. Lots along the east-west rings face north or south; along the north-south ones they are turned a quarter (`yaw` +/- PI/2) to face the road. They are ordinary lots (about a quarter start built, the rest are for sale), in a new "Outskirts" district. A city now has about 408 plots including the 60 waterfront lots.
- **Ponds:** three ponds or lakes (13-19 units across, oval, turned at random angles) go in the biggest empty gaps (at least 34 units clear all round, so there's room for a road and lots), at least 38 units apart. Each has a sandy shore, gently shimmering water, a ring of trees and a label. The avatar can't wade in (oval collision); they're drawn on the mini-map.
- **Lake drives (the city's curved roads):** every pond has a curved road. It leaves the open tip of the nearest suitable road (heading straight on, so it joins the road cleanly), follows a smooth Bezier that arrives along the line that just touches the loop (so no sharp turn is needed), then loops round the pond in a near-complete circle (6.5 units off the water's edge, leaving the end of the loop open). It's named after its pond ("Duck Pond Drive"). Each try picks the gentlest curve shape, never bends tighter than radius 5 (in practice 8 or more) and is rejected if it touches a road, plot, billboard, the reserved land or any water. Checked over 100 cities: all 300 ponds get a drive.
- **Waterfront lots:** up to 20 lots per pond line the *outside* of its loop, turned to face the road (60 per city). They clear everything, stay off the road and the approach, and are priced about 1.5x a normal lot (75-150 when empty): dearer than a normal lot, cheaper than a prime one. They're in a "Lakeside" district.
- Checked over 100 cities: each drive joins an exact road tip and heading, is centred on its pond, keeps clear of roads, plots, billboards, reserved land, other drives and the water; every lakeside lot is clear of everything, faces the road and is reachable on foot (the whole of every drive can be walked end to end in the 30 cities tested).
- Checked over 100 cities: nothing overlaps (lots, ponds, roads, billboards, park, reserved land), every Outskirts lot faces a ring road it touches, ponds are a proper size, the reserved zone is still empty and reachable, and every door (including Outskirts) can be reached on foot.

**The land** (`layout.land`, `components/city/Land.jsx`)
- The city now stands on an explicit, visible piece of land: a grass-green slab with a soil edge, sized to hold everything with **16 units of ground all the way round**: roads (including the county road), plots, billboards, the reserved site and the lakes. It now comes out about 243 x 196 units, with the built-up area on a darker paved base. The dark backdrop grid is now only visible beyond its edge, so ponds sit on land instead of out in the void.
- The whole land is walkable (ponds block themselves, one unit is kept at the very edge), so you can reach every pond and every corner on foot; the mini-map draws the land under everything and fits it in view. Checked over 100 cities: everything lies inside the land, every pond keeps at least 16 units round it, and the shore at both ends of both axes of each pond, and all four corners of the land, are reachable.

**Road design reference** (`/reference`, `docs/architecture/road_design_reference.md`, `public/reference/*.svg`)
- Road maps of Midtown Manhattan, Market Street (San Francisco) and downtown Washington DC, drawn at one scale from OpenStreetMap data (c) OpenStreetMap contributors, ODbL, next to this city drawn the same way. Street directions were measured from the data (Manhattan: one grid tilted ~28 degrees; San Francisco: two grids ~35 degrees apart; Washington: a plain grid with ~7% diagonal avenues), and the doc lists what each would add to our roads and what it would take.

**Storefronts (start of brand-specific interiors)** (`components/interior/StorefrontPanel.jsx`, `lib/content/embeds.js`)
- A **Storefront** panel sits beside the 3D room whenever an interior is open (it is a normal panel, not a hotspot in the 3D scene: the Pascal viewer only makes a handful of lamps and fans interactive, so panel-based offers are more dependable).
- **Coupon:** the city's businesses (60%) and any player business can offer a limited number of coupons. You claim one per business and keep its code; stock runs out; you can't claim your own.
- **Visit reward:** about half the businesses pay Gold for spending 20-40 seconds inside (a "tour"); once per business; not on your own business (that would just print Gold).
- **Video and game demo:** a player can embed a YouTube or Vimeo video and an itch.io game demo. Only those services are accepted, in their normal link shapes; the embed is rebuilt from the ID alone (no query strings, no credentials, https only), runs in a sandboxed iframe with no top-level navigation or forms, and **does not load until the visitor clicks** (so no third-party content loads automatically). 41 link tests cover accepted shapes and hostile ones (lookalike hosts, javascript:, data:, credentials, odd ports...).
- **Owner editor:** on your own business an Edit button opens a form for the video link, game link, coupon (text, code, quantity) and visit reward (10-120 s, 1-50 Gold), with a message per invalid field. A new owner (claiming or taking over) starts with nothing.
- Coupons you've claimed and visit rewards you've earned are saved with your progress; the plot card lists a business's offers.

## 5f. A mixed city: closed road network, countryside and water

The layout was redesigned (`lib/city/cityGenerator.js`) to read like a SimCity map rather than a grid in a field: a dense downtown, lower buildings and houses towards the edge, then farmland, woods, a river and lakes. The rule that drove the road design: **every road starts and ends at a junction.** Nothing dead-ends and nothing just stops.

**Roads and junctions**
- The old 3.4-unit stubs past the ring roads are gone. Roads end exactly on the centre line of the road they meet, so each end is a **T** (a road ending against another) or a **corner** (two roads ending at each other, a plain bend); crossings are still 4-way. Per city: about 91 junctions, roughly 41 four-way, 31 T and 19 corners.
- Each junction records which of its four arms exist (`arms`), and the controls follow: 4-way as before (signal / two-way stop / all-way stop / roundabout, roundabouts only ever at 4-ways); a T with two arterials gets a signal, an arterial through road gives its stem a stop sign, otherwise all-way stop; a corner is a free-flowing bend where cars take turns.
- Visually every junction has a road-surface pad in the middle (so a corner has no hole), and the pavement of the road that carries on runs straight across a missing arm's mouth (a T) or wraps the outside of a bend, so the sidewalk loop is closed everywhere. Crosswalks, stop lines and signs are only drawn on arms that exist.
- The network is **closed and connected**: from the North Ring you can reach every road (checked in 60 cities). Old Town is boxed in by the North Ring (carried east) on its north side, its own east road, and the avenue just south of it. Its two streets now run between those two, so they end at junctions too.
- Road hierarchy: arterials (the two arterial avenues and the one or two arterial cross streets) carry on out through the countryside to a **county road** that loops round everything, 44 units beyond the ring roads. The county road is a local road, so the country arterials meet it at T-junctions with a stop sign.

**Water**
- **A river** runs straight across one side of the country belt (west, east, north or south, picked by the seed), wall to wall across the land, 6-8 units wide with sandy banks and a drifting shimmer. **Every road that crosses it gets a bridge** (3 or 4 per city): the road carries on over the water with parapets, end posts and a pier slab below. No junction is ever on or beside a bridge (checked: at least 4 units clear), nothing is built on one, and the water blocks walking except along the bridges.
- **A riverside drive** (arterial) runs along the city side of the river for its whole length, joining the county road with a T at each end and crossing the arterials on the way, with "Riverside" lots on both sides (about 54 per city, priced like waterfront lots).
- **Rectangular lakes** replace the oval ponds: up to three per city (41 of 60 test cities got three; the rest got one or two for lack of room), each ringed by a **closed four-sided loop road** (all four corners are bend junctions) and joined to the rest of the network by a straight **spur** that meets another road at a T, at least 6 units from any other junction on it and from any bridge. Waterfront ("Lakeside") lots line the outside of each loop (up to 18 per lake).

**Countryside**
- **Farmland and woods:** every free 11 x 9 cell outside the built-up area becomes a field (wheat, corn, ploughed earth or meadow, with furrows) or, one time in five, a small wood (about 100 fields and 200 trees per city). Fields are one instanced mesh, woods two, so they cost almost nothing to draw. Trees have small collision trunks; fields are walkable.
- **Countryside lots:** about 100 per city (farm stands, creamery, cafes), thinly scattered along the county road, the country stretches of the arterials and the lake spurs.
- **Downtown to the edge:** the ground under the built-up area is a darker paved slab; building heights fall with distance from the centre (downtown towers average about 2.8 units, edge buildings about 1.2).

**Traffic and walking** (`lib/sim/traffic.js`)
- Cars now only turn into arms that exist: a bend forces a turn, a T has no straight on from its stem. Sidewalk graphs wrap round bends and run straight across T mouths; there are no "end" stations any more.
- The network is closed, so cars no longer drive in from the edge of the map. They are seeded across the roads (weighted towards city roads, with the long quiet country ones getting less) and, if the count drops, new ones appear on a clear stretch at least 30 units from the player.
- Checked: 3 cities x 5 simulated minutes, then 8 more x 10 minutes, with collision tracking: no car-car, car-walker or car-in-building events, nothing stuck (longest wait 9 s). A separate coverage run (3 cities x 15 minutes) saw cars drive through every junction in every city and always leave through an arm that exists: 1,477 passes through bends, 2,875 through T-junctions and 3,195 through four-ways.

**Checks run** (headless; `topology_check`, `mixed_check` in the scratch folder, not saved in the repo)
- 60 cities: every road end is a junction with an arm back along the road and none beyond it; every arm has a control and no missing arm has one; junctions on one road are at least 5.5 apart; overlapping roads always have a junction; all roads connected; plots clear of roads, each other, billboards, the park, the reserved site, the river and the lakes; every lake has its four-corner loop and a spur; fields and trees clear of everything and inside the land; the land holds everything; the river runs edge to edge.
- Walking, in 8 cities: every road reachable along its whole length; both banks of the river reachable (so the bridges can be walked); the water blocks walking, bridges are walkable end to end; every lake shore reachable; every door reachable; the four corners of the land and the reserved site reachable.
- A top-down map of the layout was rendered and looked at (it shows what the checks say); the 3D scene itself has still not been looked at in a browser.

**Research ideas still missing:** a second grid at an angle (San Francisco). The diagonal avenue and circles (Broadway / DC) are now in, see 5h. The curved-road code still exists (`lib/city/curves.js`, the `/curves` page, `layout.curvedRoads`, empty for now) but nothing generated uses it.

## 5g. Mobile

- **Controls:** on touch devices (or any screen under 640 px wide) an on-screen joystick (bottom-left) walks the avatar, with a Run toggle and an Interact button (bottom-right). They feed the same movement code as the keyboard (`avatarState.joy` / `run`) and hide while a card, the wardrobe or an interior is open. Tap the ground to walk there, drag to pan, pinch to zoom.
- **Layout:** the header is compact (title, gold, wardrobe, plots); the city map starts as the small round map at the top-left and opens as a sheet; plot, park and billboard cards become bottom sheets (max 62% of the screen height); the interior view stacks the 3D room above the storefront panel (which was previously hidden on narrow screens) and uses dynamic viewport height so browser toolbars don't cut it off.
- **Performance on touch:** pixel ratio capped at 1.5 and shadow maps at 2048 (4096 on desktop). Page gestures are disabled on the canvas.
- **Checked:** production build, and screenshots at 390 and 500 px wide in headless Edge (joystick, compact header and map, run button all show). **Not tested on a real phone**: touch dragging, pinch, and frame rate are unverified.
## 5h. Diagonal avenue and circles

- **Circles replace the old roundabouts.** Every roundabout is now a circle: a raised island (monument and trees on the big ones, one tree on the compact ones), an asphalt ring, sidewalk wrapped round the outside and cut open at each road, a zebra crossing and give-way line and sign on every leg. The old small roundabouts' ring did not meet the road edges; these do. Two **compact** circles per city sit on quiet local x local crossings, never within 32 units of any other circle (and not beside the park). The few plots they overlap are cleared.
- **The diagonal avenue** (named per city: Grand Diagonal, Union Avenue, Capitol Avenue or Broadway) is a chain of two or three **big circles** on neighbouring avenues, each about a block sideways of the last (so it runs at 40-50 degrees across the middle of one block and never crosses a grid road mid-block). A circle sits on a street where one is in the right place, otherwise on the avenue itself. The plots on its line are cleared and new lots (the "Grand Diagonal" district, priced 1.4x) fill the wedges beside it and round the circles. It generates in 149 of 150 test cities; the one that fails simply has no diagonal. Because it is circle to circle, each stretch is only about 12-14 units long, so it reads as a short link between circles rather than a long boulevard.
- **Traffic and walking** (`lib/sim/traffic.js`): junction arms are now "legs" (a road plus a direction), so cars, signs, crosswalks and the sidewalk graph work for diagonal legs too. Cars enter a circle at its give-way line, go round the ring and leave by any other leg; roads have a lane geometry for any heading. Pedestrians cross every leg and walk round the ring.
- **Checked:** 150 cities for the generator (clear zones, no plot on the diagonal or inside a circle, no grid road crossed, circle legs at least 34 degrees apart, spacing); 60 for topology and 40 (8 walked) for lots/walking; traffic over 8 cities x 10 simulated minutes: no car-car, car-walker or car-in-building events, nothing stuck, longest wait 13 s. Seen in the real 3D scene in headless Edge, with no console errors.
- **Known limits:** circles hold one car at a time (simple and safe, a little slow when busy); the diagonal is short; nothing generated uses the curved-road code.
## 5i. LAN multiplayer and client monitor

- **Run it:** `npm run dev:all` starts the web app (open to the LAN, port 3000) and the multiplayer server (port 3001) together and prints the phone address. `npm run mp` starts only the server. Phones open `http://<pc-ip>:3000` on the same Wi-Fi; the page finds the server on the same machine's port 3001 by itself (override with `NEXT_PUBLIC_MP_URL`). Without the server everything still works solo.
- **Multiplayer:** players in the **same city** (same seed; the default city is the same on every device) see each other's avatars with names, outfits and emotes, moving smoothly. Positions go out ten times a second when they change. Each city is its own room: regenerating your city moves you to another room. A chip under the header shows who is online and lets you rename yourself. **Not shared:** plots, Gold and quests are still saved per browser; only presence is shared.
- **Client monitor** (`/admin`, also JSON at `http://<pc>:3001/status`): every connected device with its address, browser and OS, screen size, touch or desktop, **frame rate** (measured on the device every 5 s), city, position and error count, plus the recent errors (window errors, unhandled promise rejections, `console.error`) with source and stack. Repeated identical errors are sent once with a count. The server prints joins, leaves and errors in its terminal and appends errors to `server/logs/client-errors.jsonl`.
- **Checked:** a 15-point protocol test (join/leave, rooms, movement, hostile input, error and fps reporting, status); two real headless browsers plus two real LAN devices (a phone and a tablet) connected to the same server at once; the Online chip and remote avatars render.
- **First real-device readings:** the phone reported about 11 fps and the tablet about 19 fps. The city is too heavy for them as it stands (see the instancing note below).
- **Limits:** no login, and `/status` is open to anyone who can reach the port, so this is for a trusted LAN only. Browsers on an `https` page cannot use `ws://`. A "Script error." from the phone has no details (the browser hides errors from other origins).
## 5j. Performance and Luxury plots

**Performance** (found by the client monitor on real devices: a phone at about 11 fps, a tablet at about 19 fps)
- **Measured the cause first:** the monitor now reports draw calls and triangles per device (also `window.__vvPerf` in the browser console). The city was **5,617 draw calls per frame** (5,779 meshes: roads 2,395, junctions 1,614, plots 1,369, 2,005 casting shadows). Phones struggle above roughly 500-1,000.
- **Roads, junctions and mid-block crossings are baked** (`components/city/StaticBatch.jsx`): once mounted, everything static inside is merged into one mesh per material and the originals are hidden (the traffic-light lamps are kept separate because they animate). Merged meshes receive shadows but no longer cast them.
- **Plots are instanced** (`components/city/Plots.jsx`): foundations, buildings, doors, awnings, floor lines, glass bands, roof units, empty-lot outlines and rims are one instanced mesh each, about a dozen draw calls for all plots instead of 1,369. Clicking and hovering work per instance (tested with real mouse events on an empty lot and a built plot). Pennants and the plot-of-the-day gem stay as small animated meshes.
- **Touch devices:** shadows off, pixel ratio capped at 1.25.
- **Result:** desktop, shadows on: **5,617 -> 531 draw calls**. Phone emulation (touch, shadows off): **149 draw calls**. Software-rendered headless frame rates are only a rough guide, so the real phone's frame rate is still to be confirmed.
- **Errors:** `Script error.` (hidden by the browser) now reports which other origins the page loaded from, and failed script/image loads are reported too. I found nothing in the app's own code that loads from another origin, so the cause of the earlier one is still unknown.

**Luxury estates** (`lib/city/cityGenerator.js`) *(the counts and the placement rules here are superseded by 5k and 5l)*
- Three per city (150 of 150 test cities), **3 x 2 cells (about 9.8 x 6.4 units)**: larger than any prime plot (the biggest prime plots are 2 x 2). They are chosen first, ahead of prime plots, on the best frontage: cells beside the park score highest, then arterial frontage and the ring roads, and they are spread apart.
- **They start for sale** (nobody owns one at the start), cost 2,400-4,800 empty (8x per cell, against 3.5x for prime plots), and a building on one is 1.8x taller than normal (a prime plot is 1.35x) with an interior 8 wider and 4 deeper (prime: 4 and 2).
- **Look:** violet glowing rim, pale pillars at the four corners, dark violet foundation, violet outline on the mini-map, a "Luxury estates" line in the legend, and a violet banner on the plot card. The diagonal avenue, circles and roundabouts are planned to stay off them.
- Checked: size, price, ownership, claiming (a luxury office comes out 6.5 high with 5 floors), the full topology, lots, walking and traffic suites, and the 3D view, empty and built.

**Joystick:** the thumb knob was centred twice (a CSS class and an inline transform), so it sat half its size up and to the left. Fixed; measured with the phone emulation: knob centre equals base centre, and the base is centred on the screen.
## 5k. Crash fix, a fuller city, and backend clean-up

- **Crash fixed** (reported by Player-2538 through the client monitor): `TypeError: _fiber.refCleanup is not a function`. When the plot count changed (regenerating the city), react-three-fiber rebuilt the instanced plot meshes and called the ref's cleanup; my callback refs returned the mesh (`(m) => (refs.current[k] = m)`), which React 19 stored as the "cleanup". They now return nothing (`Plots.jsx`, the traffic-light lamps). The browser test regenerates the city twice and **fails with the old code** (checked) and passes with the fix.
- **A fuller city:** about 650 plots per city (was about 520, 40 of them built). Countryside lots now fill half the roadside spots (about 240, was 100). **Ten more buildings stand at the start:** 5 ordinary and 3 prime plots built from empty ones, plus 2 luxury estates built by the city. Luxury estates are now 5 per city (4.7 on average; 3 for sale to players, 2 already built, also bigger and costlier when built). If the diagonal has no room it may run over the built estates, never the ones for sale.
- **Backend clean-up**
  - **Tests are in the repo** (`tests/`): `npm test` runs the generator, topology, lots-and-walking, diagonal, luxury, traffic, traffic-stress and multiplayer tests (about 30 s); `npm run test:browser` runs the browser test (needs `npm run build` and Edge or Chrome); `npm run test:all` runs both. The browser test starts its own servers and checks: no console errors, draw calls (about 600 desktop, about 160 phone), real clicks on empty and built plots, regenerating and claiming, the centred joystick, and that the server sees both clients with no errors. Nothing it does touches your real error log.
  - **Lint:** `npm run lint` works again (ESLint 9 with React and hooks rules, at the time; now ESLint 10, see 5zc). It is clean.
  - **Server** (`server/multiplayer.mjs`, `server/README.md`): connection limits (total and per address), a size-capped rotating error log, `/health`, a protocol version, a clear message if the port is taken, graceful shutdown on Ctrl+C, survives a bug in one message handler, and everything is configurable by environment variable.
  - **Diagnostics hooks** (`window.__vvStore` etc.) are now only on in development or with `?diag=1` in the address.
  - **Dead code removed:** the old small-roundabout code (now circles), an unused mock-data file, unused exports and constants. The save format is version 3 (older saves keep Gold, outfit and daily progress and get a fresh city).
  - `.gitignore` now covers `node_modules`, `.next`, env files and logs.
- **To pick up the server changes, restart `npm run dev:all`** (a server already running keeps the old code).
## 5l. Estates, reserved land, the scavenger hunt and the circle rules

- **Reserved sites (the amber areas).** Two per city, 34 × 30, flush to a through road with a clear frontage (no junction along it), on the busiest arterials nearest the centre, kept well apart. A site is set back 3 units from the pavement so a player's own road can be laid in front; lake spurs never attach in front of one.
- **Luxury estates.** 3 × 2 cells (about 9.8 × 6.4). Up to 4 on the grid, picked beside the large plots, the park and open arterials and spread apart (a second pass allows them closer when the extra streets leave no room), plus **3 waterfront estates** on the river/lake roads. On the grid the last two start built; waterfront ones all start for sale. 8× value per empty cell, buildings 1.8× taller.
- **Grand estates.** Three per city, **14 × 7.6**, always built at the start, 12× value per cell, buildings 2.4× taller (`GRAND_HEIGHT`), on the best arterial / lake frontage. They are the high end: the "few more luxury" request.
- **Tier in the store.** `tierHeight` and `asPlayerBusiness(owner, title, website, type, tier, variant)` keep a claimed estate's size; `interiorRoomSize(type, variant, prime, luxury, grand)` gives it a bigger interior. The plot card shows a gold (grand) or violet (luxury) banner and a layout picker (`variant`).
- **Fixed building margin.** `BUILDING_MARGIN = 0.225` and `buildingSize(p)` replace the old 85% scale, so a building's gap to the pavement is the same on every plot size.
- **Daily scavenger hunt** (`lib/game/daily.js`): three stars a day (park fountain, a circle ring, the bridge midpoint, a lake shore, a grand-estate door), 15 Gold each and a 40 Gold bonus for all three; clues are in the Today panel, found stars are saved with the day.
- **Circle throughput.** Cars treat a circle as one shared space (`circleConflict`), compact circles are 7.4 units from the nearest street junction (`CIRCLE_SPACING`) so a crosswalk never lands on a stop line; the traffic suite checks car-car and car-walker contacts at 120 cars with none.

## 5m. Airports, planes and aerial banners

- **Two airports, one of them international (5v)** (`planAirports`, `components/city/Airports.jsx`): on opposite or adjacent sides of the county road, each 72 × 46 with a 64-long runway, terminal, tower and two hangars, joined to the county road by a closed loop and a spur (like the lakes). Their buildings are solid for the avatar; runways and aprons are walkable.
- **Two banner planes** (`lib/sim/flight.js`, `components/city/Planes.jsx`): each flies a timed circuit (taxi, take-off, a loop across the city, landing) between the airports using cubic Hermite curves, cruising at 6.5 units/s. The plan is cached per city and the two planes are offset so they never come within 2 units. `window.__vvFlightTime` can override the clock for tests.
- **The banner** is a 24-column strip about **31 units long and 3.6 high** (it was 17 × 2.3), trailing the plane on its own flight path, with a rope from the tail and a little flutter. It is drawn on a canvas: the advertiser's headline and tagline, or "BUY THIS BANNER" with the airline.
- **Buying ad space.** Each banner is an ad slot (`kind: 'banner'` in the billboard list). Click the plane or the banner: the side panel shows the same ad card as a billboard (views, clicks, a visit link, and take-over for 1.25× with the old advertiser paid out). Banners are left out of the billboard counts, and the planes are drawn on the mini-map.

## 5n. The big park, flush edges and landscaping

- **Second park:** a large park (28 × 20, about 7× the first), flush to an arterial or the county road, nearest the centre with the most traffic. It has the same fountain, monument, benches and hedge with a gate on each side, and shares +35% foot traffic with plots within 8 units. The hedge gates are 1.1 wide (they were 0.7, which was hard to walk through) and the paths 0.8.
- **It fills its block.** If a street (a cross street at either end, or the next parallel street on the far side) is within 6.5 units of the park, the park grows to meet it, so there is no sliver of unused land beside it (2 of 60 test cities still have one where something is in the way). This fixed Memorial Gardens sitting 3.6 units short of its far street.
- **Flush buildings.** Roadside lots, estates and parks use `roadsideRect`, which places the road-facing edge exactly on the road's pavement edge. The parks test asserts "flush (no gap)" on 60 cities.
- **Landscaping** (`buildLandscape`, `Woods`, `Shrubs`): rows of street trees along arterials and the ring roads, shrubs by the river and lakes, and garden plantings beside estates. Trees have collision trunks; all of it is instanced (about 137 street trees and 137 bank/shore shrubs per city) and adds a handful of draw calls.

## 5o. The side panel and toolbar (ClaimAvenue-style)

- **One panel, many views** (`components/ui/panel/SidePanel.jsx`, state in `lib/state/panelStore.js`). It has a header with **back**, **expand/shrink** and **close**; on a computer the header is a handle: drag the panel anywhere (double-click to reset); on a phone it is a sheet along the bottom. Position and size are remembered.
- **Everything opens in it:** a toolbar down the right edge (`Toolbar.jsx`) opens Statistics, Search, Places, Today & quests, Online (with a head-count badge), Wardrobe and the City map & guide; selecting a plot, park or ad space opens that view in the same panel. Back returns to the view before; closing a selection view clears the selection; Esc closes. `+`/`−` zoom buttons (desktop) sit under the toolbar; places in Search/Places have a Show (the camera glides there, `CameraFocus`) and a Walk button.
- **The mini-map** is a compact round button in the corner that opens the city guide. The first visit on a computer opens the guide.
- **Bug found while testing:** the Play view crashed the whole page ("Maximum update depth", React #185) because a store selector returned a fresh `[]` on every call (zustand 5). It was in the old Play tab too. Fixed with a shared empty list; the browser test now opens every view.

## 5p. Water, roads, roundabouts, concurrency and performance review

- **River:** 11–14 units wide (was 6–8). The moving light ribbon on the water (a transparent plane sliding over the bridges, which flickered) is gone; the water now only pulses its glow. Water materials (river and lakes) use a rough, non-metal finish: the old shiny one blew out to white from the fixed isometric camera.
- **More streets, calmer circles.** 4–6 cross streets per city (was 3–5). The diagonal avenue has at most **two circles** (was a chain of up to four), and compact roundabouts keep **52 units** apart and away from the avenue's circles (was 32). Fewer circles close together means cars and walkers face one at a time. Plots per city: 548–631.
- **A bigger grid for more players (5q).** Eight avenues (was six; arterials at 1, 4 and 7) crossing a grid 25 columns wide (was 21), 5–7 cross streets at least 4 columns apart (so a 3-cell luxury block always fits), and mid-block crossings on 90% of blocks of 8 units or more (was 80% of 9.6). **Reserved sites go from 2 to 4**, each 34 × 30, on different busy roads at least 70 apart; lake and airport spurs both keep clear of their frontage. Averages over 40 cities: **729 plots (was about 600), 123 junctions, 42 roads, 42 mid-block crossings, land 304 × 255**. Draw calls stay low (427 desktop, 156 phone). The estates, parks, walking, traffic and browser tests all pass with the new sizes.
- **Multiplayer concurrency** (`server/multiplayer.mjs`): the position broadcast was O(players²) in bytes and in JSON work every tick. Now a player is only sent others within a view radius (120 units, `MP_VIEW_RADIUS`), identical snapshots are skipped (a keepalive every 1 s), and a client whose socket has more than 64 KB queued is skipped until it catches up. A per-client rate limit (60 msg/s), a 16 KB message cap, connection caps (total, per address) and heartbeats were already in place. Tests cover far players, quiet scenes and nearby players.
  - **Not solved (by design, needs the backend):** game state is not shared. Two players claiming the same plot do not see each other's claim, Gold is per browser, and each browser simulates its own cars and walkers. Making plots, Gold and ad slots authoritative means a database with atomic claims (Supabase/Postgres) behind the server, then broadcasting claim events to the room.
- **Does the level need optimising?** Not now. Measured by the browser test: **469 draw calls per frame on desktop (was 5,617) and 177 on a phone** (shadows off, pixel ratio 1.25), with roads, junctions and plots merged or instanced and woods, shrubs and trees instanced. The remaining risk is real phones; the client monitor reports their frame rate and draw calls. If a device is slow the next steps are: fewer shadow-casting lamps, a lower tree density on touch, and level-of-detail for interiors.

## 5r. The reserved-site designer (development only), ground textures, and a bridge fix

- **Site designer** (`designReservedSite` in `lib/city/cityGenerator.js`, `components/ui/panel/ReservedEditor.jsx`). In development, click a "Reserved: your road & plot" area in the city (or Places > Reserved land) and the side panel opens the designer: a plan of the site, sliders for the distance between the two entrances, cross streets inside (0–2) and sliding the entrance along the road, a lots-density choice, landscaping on/off, **Generate a design** (random) and **Reshuffle**, and **Apply to the city**. The design is a U-shaped street: two legs that meet the front road at T junctions, a far street, and rungs; every end is a junction (the traffic model needs that). Lots line both sides, start **empty and for sale**, and are a new district, *Private Estates*.
- **The surroundings adapt:** new junctions on the front road (kept 6 units from its others, and only where nothing stands in the way; the entrance slides to a clear spot or says why it can't), trees, shrubs, woods, fields and ground patches that are in the way are cleared, and the site is planted with shrubs and trees in the gaps. The editor says how many lots, junctions and plants this adds and how many it clears.
- **Keeps every build.** The design is applied at the very end of `generateCity()`, with its own seeded random stream, so a city with a design is identical to the one without it except for the design: tested by comparing every other plot, byte for byte. Design plots are numbered from 100000 (1000 per site) so no other id shifts. The store (`setReservedDesign`) rebuilds the layout from the same seed and keeps all your plots; designs are saved with the game (dev only) and restored by `merge()`, which keeps claimed design lots.
- **The plan shows the settings below it; the city shows what was last applied.** The editor says "not in the city yet" (with a Revert button) while they differ, and the Apply button reads "Applied" when they match. A test checks that the preview is exactly the lots and streets that get built, with other sites designed and with a design already in place.
- **Not in a release.** `devToolsOn()` (`lib/dev/devTools.js`) is `NODE_ENV !== 'production'`; Next replaces it at build time. In a production build the area is not clickable and its label is the old one, the panel renders nothing, `setReservedDesign` returns false, and `generateCity` and the saved-game restore ignore any design. The browser test (which runs a production build) checks this.
- **Ground textures:** the land is speckled grass and the built-up base rough slate (small canvas textures, nearest-filtered so they stay blocky, no image files), and the open country has **ground patches** of six kinds: dirt, gravel, sand, dry grass, flowery meadow and moss, clustered by a slow noise so they read as stretches of land (about 150 per city, six instanced draw calls, kept clear of roads, plots, water, fields and the city). They come from their own random stream, so no existing city changed.
- **Bridge artifact fixed:** the pier under each bridge had its top at the road's surface height (0.03), so the two fought and flickered as a jagged band along the deck; the pier now sits below the road and casts no shadow.
- **Compass controls and depth.** The editor names directions: a N/E/S/W pad slides the entrances along the road (east/west on an east–west road, north/south on a north–south one) or lengthens/shortens the streets into the site, and a *depth* slider (0–100%) sets how far the streets reach. Which way is which follows from the front road and the side the site is on; the panel says where the entrances open ("to the west onto Byte St").
- **Linking to neighbouring streets (on by default).** A design no longer stops at its own far street when there is a road to join: if a road parallel to the front road runs beyond the site, both legs carry straight on to it (T junctions); if a cross street runs past either end, the far street carries sideways to it. A link is made only when its whole stretch is clear (plots, billboards, parks, water, other roads) and the new junction keeps 6 from the others on that road; the greenery in its way is cleared. (An earlier version joined two small circles with a diagonal street; that was removed: connections now use the roads that are already there.) Curved or diagonal sites would need a new lane and junction model and are not done. Over 30 cities with every site designed: 240 through legs and 36 side links, every end a junction.
- **The grand diagonal's circles are further apart, and the buildings round them stand straight.** The diagonal now crosses its block 11.5–15.5 sideways (was 7.5–11.5): 31–38° to the avenues, 14.5–17 long (was 12–14.6), so the circles' edges are about 6–8 apart instead of 3–6. (It cannot be much longer without crossing another avenue, which the junction model does not support.) The lots round each circle are no longer turned to follow the ring: they stand square to the streets on the grid lattice in the corners the crossing leaves, and the turned lots along the diagonal start 4.6 beyond the circle's edge. The tests check the length, and that nothing within 9.5 of a circle is turned. The generated city differs from before for every seed, so a game saved before this change gets a fresh city.
- **Tests:** `tests/reserved-design.test.mjs` (30 cities, 120 sites): lots inside the site, clear of everything, empty; streets end at junctions; the new junctions keep their distance; nothing else in the city changes; a release ignores designs; cars and walkers drive a designed city with no contacts; the preview equals the build; ground patches are on the land, in the country and clear of everything.

## 5s. Roof banners, camera views and the `lib/` layout

- **Roof banners.** Every built building (not empty lots or Old Town houses) carries a big banner on its roof, on two posts at the front edge, with the logo and the business name on both faces. Size scales with the building: **3.5 × 1.45** for an ordinary building, 5.2 × 2.2 prime, 7.2 × 2.9 luxury, 9 × 3.8 grand (`bannerSize` in `lib/game/logos.js`), bigger than the roof so it reads from the map. All faces are drawn into one atlas texture (`components/city/bannerAtlas.js`: logo square on the left, name fitted beside it) and shown by one instanced mesh, so a banner costs no extra draw calls; the atlas is redrawn only when a banner's content changes.
- **Three kinds of logo**, chosen when a plot is claimed or taken over (the forms will not go through without a valid one; the default is *generated*) and changeable later by the owner: **generated** from the business (its letters in a hexagon for offices, a circle for restaurants, a tag for shops, in colours chosen from its name, stable and following the name), an **icon** from a set of 16 on a board colour, or an **uploaded picture** (PNG, JPEG, WebP, GIF or SVG, scaled to fit 128 × 128 and kept as a small `data:` URL in the saved game; nothing is uploaded or fetched). Buildings the city starts with get generated logos. The store refuses a claim, take-over or change without a valid logo; images must be `data:image/(png|jpeg|webp)` and under about 65 KB. Test: `tests/logos.test.mjs`.
- **Camera views** (`lib/state/viewStore.js`, `components/city/FollowCamera.jsx`, `components/ui/panel/CameraMenu.jsx`). The camera button in the toolbar opens a menu of views, like an action RPG's camera options: **Action** (the default: a fixed angle behind and above the avatar, 55°, narrow field of view, Diablo-style), **Third-person** (low and close), **Tactical** (a few blocks around you), **Overview** (high up, most of the city), **Top-down**, and the original **Isometric map**. Below them, for the follow views, are sliders for zoom (distance 6–180, a much wider range than the first version's 48 cap), tilt (15–87°) and turn round the avatar. Keys: wheel or pinch zoom, Q / E turn, R / F tilt, right-drag turns and tilts, V next view, Home reset. Walking and the joystick are relative to where the camera looks. The choice, turn, tilt and zoom are remembered; Search/Places "Show" switches to the map. `?view=<id>` (`diablo`, `third`, `tactical`, `overview`, `top`, `iso`) overrides the saved choice; to go back to the original for good set `DEFAULT_VIEW` to `'iso'`. The browser tests use `?view=iso`.
- **`lib/` is in folders:** `city/` (generator, curves, park geometry), `sim/` (traffic, flight, collision, avatar state, signals), `state/` (the stores: city, side panel, world, view), `game/` (daily rewards, cosmetics, logos), `net/` (multiplayer client), `content/` (embeds, interior scenes, Pascal setup) and `dev/` (dev tools flag, perf counters). Imports are `@/lib/<folder>/<file>`; the tests load a file as `imp('city/cityGenerator.js')` (the loader copies the whole tree).

## 5t. Driving, sailing and fishing, and a pass over the camera views

*(From a reference showing "walk anywhere, drive any car, sail a boat and fish".)*

- **Drive any car** (`lib/sim/vehicles.js`, `lib/state/fleetStore.js`, `components/city/Vehicles.jsx`). Walk up to a car on the road and the prompt says *Drive this car* (E): the traffic simulation drops it (it makes another later) and you are in it. W / S are gas and brake (reverse is slower), A / D steer (a car only turns while it moves), and the speed is shown in the panel at the top. A car goes anywhere the avatar could walk, so buildings, water and the other solids stop it and it slides along them; the traffic brakes for you as it does for a pedestrian in its lane. E or X (or the *Get out* button) leaves it: you step out beside it and it stays where you left it, and you can get back in. The car is drawn twice the size of the traffic cars so a person fits.
- **Sail a boat and fish.** Every city has boats moored just off the bank: one on each lake and two on the river, clear of the bridges (`layout.boats`, from their own random stream, about 3–4 a city). Walk to the bank and the prompt says *Sail this boat (and fish)*. A boat only moves on water (the lakes and the river), is slower and turns even when still. **Space** (or E) casts the line (the boat must be nearly still), a bobber floats out; after 3–9 seconds a fish bites (the bobber dips, the panel pulses); reel in within 1.3 seconds with Space or it gets away; moving off reels the line in. Catches: minnow 2, perch 4, trout 7, pike 12, eel 15, golden koi 40 (rare) Gold, and the odd old boot; **fishing pays at most 120 Gold a day**. Fish are counted in the Statistics panel. X (or *Leave*) gets out where the shore is within reach, else it says to steer closer. The boat you leave stays where you moored it.
- **Not done / known limits:** cars you leave parked are not saved and the traffic does not drive round them (it can pass through); only the lane in front is checked when the traffic brakes for you, so a car you drive can still be clipped from the side by an NPC; there is no horn, no damage and no passengers; boats cannot be sailed under the bridges' decks in any special way (they just pass); parked cars and moved boats are reset when the city is regenerated.
- **Tests:** `tests/vehicles.test.mjs` (40 cities: 3–4 boats each, afloat and clear of bridges; a car reaches but never exceeds its top speed, cannot turn on the spot, and over 20,000 random steps is never inside anything solid; a boat is never off the water; the fishing line's timing and escape; the fish table, and the daily cap and its reset), plus a browser test that takes a car, drives it, parks it, sails a boat, casts, hooks and reels in a fish and gets out.
- **Artifacts found and fixed across the views.** I looked at every view at close, medium and far range. (1) The new urban paving texture had pixel-sized dark and light specks that read as noise close up (the third-person and top-down views show the ground much nearer): it is now almost flat, and the grass less contrasty. (2) The ground textures used nearest filtering when far away and shimmered in the overview and top-down views: they now use mip-mapping when shrunk (still blocky close up). (3) A square grid showed through the river and lakes (they were 94% opaque over the ground): the water is now opaque. (4) With a perspective camera the layered ground (grass, paving, roads, lawns, a few thousandths apart) could flicker against each other when zoomed out: the camera's near plane now moves out with its distance (0.15 close up, up to 6 at the widest zoom). Also in 5r: the bridge piers z-fighting with the road. Left as they are: a building between the camera and the avatar in the low third-person view is clipped by the near plane (the camera passes through it), and shadows cover only the central 300 × 300.

## 5u. Mega malls

*(Requested with "do a test before building": the test came first.)*
- **The test.** Before building anything I opened interiors for made-up stores that were not plots (a boutique, a diner, an office) through the existing interior viewer in the browser: each rendered its own layout (and the Storefront panel, which looks a business up by id, was the one thing that needed extending). So a mall can be one big building whose stores are plot-shaped objects, each with a real interior, offers and logo.
- **Two malls**, `layout.malls`: *Westgate Mega Mall* and *Eastgate Mega Mall*, one at each end of the streets (the west and east of the land, at least 150 apart), each 36 × 24 and 3.6 high, flush to an arterial or the county road with a clear frontage (no junction along it), planned after the lakes and the airports have their room and before the estates and lots, so nothing else is built there (`planMalls`; planning them first took the room the airports and waterfront estates need). All 40 test cities get two, clear of roads, plots, water, parks, airports and reserved sites.
- **Ten stores each** (`makeMallStores`, from a stream of their own): six shops, three restaurants and an office, each with its own name, interior layout (boutique, market, diner, cafe, open-plan or meeting rooms), logo and, mostly, offers (coupon, visit reward, video, game demo). A store is plot-shaped but is not in `plots`: its id is `mall-1-s3`, and `businessById()` finds a plot or a store, so the interior, the Storefront panel, coupons and visit rewards all work for stores.
- **What you see and do.** A big building with a glass front, a canopy and door, a skylight, every store's sign (logo and name) along the front, and a large roof sign with the mall's name (`components/city/Malls.jsx`). Walk to the door ("Enter Westgate Mega Mall", E) or click the building: the side panel shows the directory (`components/ui/panel/MallView.jsx`) with every store, what it offers and a *Go inside* button that opens the store's interior like any business. Malls are on the mini-map and in Places. The building is solid; the door is reachable on foot (tested).
- **Not done:** stores cannot be claimed or owned by players yet (they belong to the mall); store offers' claimed counts are not saved (the claimed coupon codes are); no second floor or walk-through hall (you go in through the directory).
- **Fixed while testing:** opening any interior in development logged "createRoot() on a container that has already been passed to createRoot()" (it did this for ordinary plots too, and the client monitor would have reported it). The cause was in our drei patch: the `<Html>` effect reuses its container and the old root's unmount is queued. The patch now gives every run of the effect a fresh container (`patches/@react-three+drei+10.7.9.patch`, regenerated). **Restart the dev server to pick it up.** The camera menu now lists the **Original view** (the isometric map) first.
- **Tests:** `tests/malls.test.mjs` (40 cities, 800 stores: positions, flush frontage, clear of everything, solid building, store data and offers, store lookup and coupons) and the browser test (the directory lists the stores; real interiors of a shop, a restaurant and an office open from a mall; they differ).

## 5v. An international airport, and the world-size study

- **International airport.** One of the two airports (the first, so the one the first banner plane is based at) is now international (`AIRPORT_INTL` in `lib/city/cityGenerator.js`): a **116 × 7 runway** (the regional one is 64 × 4.6), a 24 × 6 terminal and a taller control tower, **four hangars**, a wider apron and **two parked airliners** (scenery: solid, drawn in `components/city/Airports.jsx`), and its own name ("Capital International", "Voxel International", ...) in amber on the map. It covers more than twice the ground, so it is placed first and may take another side of the county road if its own is full (all 60 test cities still get two airports). The flight paths scale with the runway automatically. Tests: `tests/flight.test.mjs` checks there is exactly one international airport, that its runway, ground, terminal and hangars are bigger, and that the airliners stand on the apron clear of the buildings and the banner planes' parking. Side effects: the bigger airport takes room, so a few cities now get two waterfront luxury estates instead of three and the malls may stand a little closer (the tests allow it).
- **World-size study** (`docs/architecture/study_world_streaming.md`). Measured the generator, collision and traffic in Node and the whole game in headless Edge at 1×, 2× and 4× the map, built a chunk-streaming prototype, and wrote up the design for an authored world of several cities with an island, ocean and shipping yard. Findings: the practical limit today is about **2× the area** (what grows is the number of objects in memory, 40,463 and 487 MB at 4×, not draw calls); a streamed prototype cut that to 12,935 objects (3 × 3 chunks of 64) and to ~900 after walking to a quiet corner; the save (all plots in the browser) hits the storage limit above 6×; the island, ocean and port are all feasible (about 6–8 days on top of the world format). What was added: `NEXT_PUBLIC_MAP_SCALE` (the grid, streets and avenues scale; default 1), numbered street names when a bigger map runs out of names (it crashed the road labels), the `?stream=<chunk size>[&radius=<chunks>]` prototype (`components/city/StreamedNetwork.jsx`) and the measuring scripts in `scripts/study/`. Nothing else changes at the default scale.

## 5w. A wider side panel and a fuller building card

*(Modelled on ClaimAvenue's building panel.)*
- **Wider panel:** 440 px (was 352) and 760 px expanded (was 600). The plot view is titled **Building**.
- **The building card** (`components/ui/PlotCard.jsx`, `PlotInfoCards.jsx`), top to bottom: a **Step inside** button ("22 people fit · 8,798 visits"; the capacity comes from the interior's floor area), the business's **logo, name and description**, a grid of **Height (floors), Visits, Buy from / Take over for / Value, and Owners**, chips (**#49 by value**, **COUNTRY · HIGH EXPOSURE**, district, Grand / Luxury / Prime, next to a park, Plot of the Day), a **Visit website** button (counted), **Show on the map** and **Walk to the door**, the **address** ("Arcade Alley, 17": the nearest road and a house number, odd on one side and even on the other), the plot's special notes, a folded **Buy this building from $X** (the take-over form) or **Claim this plot from $X** (open by default for an empty lot) or **Manage your business** (logo and description) for your own, then **Site visits** and **Building history**.
- **Site visits** (last 30 days): visits, visitors, website clicks and click rate, a 14-day bar chart, time inside, busiest hour and day, and where visitors come from (walking past, billboards, aerial banners, Places/search, shared by players). These figures are **simulated** from the building's visits and spot (the same every time; busier plots show clearly bigger numbers) and labelled so; **what the player really does is added on top**: entering a building counts a visit and pressing Visit website counts a click (`activity` in the saved game). Real counts need accounts and a server.
- **Building history:** the current owner, the owners taken over (real, saved: each paid 1.25× the one before), a short simulated past for the city's own businesses, and the plot opening, with prices and "N days ago", plus the total clicks and days open.
- **Descriptions:** the owner can write up to 160 characters when claiming or taking over, and change it later (Manage your business); otherwise the card shows a line made from the business's name, type and district. Everything lives in `lib/game/plotInfo.js` (pure and tested).
- **Look: the SynaptixPlay palette, and a layout of its own.** The first version copied ClaimAvenue's panel too closely (dark panel, lime accent, outlined "Step inside", ruled stats table, ruled history list). It now uses the SynaptixPlay colours from the Synaptix home theme (`lib/synaptix/...` in the Flutter app: `SynaptixHomeTheme`): page `#050816`, panel `#101529`, alt `#151B33`, stroke `#27314F`, cyan `#22D3EE`, blue `#3B82F6`, purple `#8B5CF6`, and the purple-to-blue gradient for primary buttons. They are Tailwind tokens (`sx-page`, `sx-panel`, `sx-alt`, `sx-stroke`, `sx-line`, `sx-cyan`, `sx-blue`, `sx-purple`, `sx-gold`) in `app/globals.css`, used by the whole game UI (side panel, toolbar, camera menu, cards, header, HUD, store panel). The card itself was redesigned: a filled gradient *Step inside* button, four tinted stat tiles with icons (instead of a table), pill chips with dots, a cyan-outlined *Visit website*, gradient bars and one stacked bar for the visitor sources, a vertical timeline for the history (instead of a ruled list), foldable forms with a purple edge, and a panel with an indigo gradient and a purple-blue-cyan top line.
- **Tests:** `tests/plotinfo.test.mjs` (20 cities, 3,491 businesses: addresses, descriptions, exposure, rank, history order and prices, site-visit figures and their limits, busier plots draw more visitors, the player's visits and clicks are counted, descriptions are trimmed and owner-only) and the browser test (the card shows each section; the panel is at least 420 px wide).

## 5x. The directory, and the live-data layer

- **Directory** (`components/ui/panel/DirectoryView.jsx`, `buildDirectory` in `lib/data/liveData.js`): every plot with a building (163 in the default city; not empty lots or Old Town houses) numbered **1 to the last** (001, 002, ...), as a list with the logo, name, a two-line description, "PLOT #id, $value value, N visits", a *Visit website* link and the value. Sort by value (default; rank 1 is the dearest), visits, plot number or name; search by name, owner, district or plot number (a search is numbered from 1 too). A row opens the building card and flies the map to it. **It is the first thing a visitor sees** (opened on a first visit on a computer, remembered after) and the first toolbar button.
- **Live data in one place** (`lib/data/liveData.js`, `docs/architecture/live_data.md`). Every figure that needs a server (visits, 30-day site statistics, ownership history and owner count, value and rank, the directory, players online, claiming) is listed in `LIVE_FIELDS` with its endpoint and what it needs, and the building card and directory now read them through one provider. Today the *simulated* provider answers (labelled as such); set `NEXT_PUBLIC_LIVE_API_URL` and the *remote* provider asks the server and falls back to the simulated figure if a call fails, so the UI needs no further change. Tests: `tests/directory.test.mjs` and a browser check that the directory lists every building from 01.

## 5y. Landmarks, hills, animals, market, statistics, interior editor, strategy and the world map

A summary of the later work; the detail is in the documents named.
- **Real 3D content:** Kenney buildings, trees and cars, voxel (`.vox`) landmarks and buildings, a Blockbench-layout avatar, hills in the north-east and animals in the countryside ([scope_assets_and_wasm.md](scope_assets_and_wasm.md) Status).
- **Pop-up market** with weekly admin layouts, booking, shops and notices ([market.md](../product/market.md)); two admin headquarters (Synaptix Play, Theoretical Minds Technology), two more luxury plots and about 10% more plots.
- **Statistics:** real presence, latest arrivals and recorded activity, a stats pill, and a compass tied to the real camera and avatar ([backend.md](../architecture/backend.md)).
- **Interior editor** (Pascal): a larger window, grouped furniture menu, colours, cut view, outside wall colour. Opening a building frames the room from `Rig` in `components/interior/InteriorViewer.jsx` (distance 0.9 times the room size, further back on a narrow canvas). Known issue: on one machine (Brave) the viewer area stayed blank white; it renders in Edge/Chrome, so it looks like a browser GPU setting (check `brave://gpu`, Shields, or try another browser). The console's `transformedNormalView` and `uv2` messages are harmless three.js warnings from Pascal's materials; doors and windows are local (`public/items`), but the furniture loads from Pascal's catalogue online (checked 2026-10-15: 18 of 21 models in four interiors came from its Supabase storage), so interiors need a connection. Two of those models, the Aeron chair and the standing desk, have no normals; a patch to `@pascal-app/nodes` (`patches/`) now makes them on load, which also ends the console's `Vertex attribute "normal" not found` warning.
- **Strategy (the five recommendations that need no outside service):** proof-of-human traffic, leaseholds, activity-based skyline, Building of the Week and The Bazaar district ([community.md](../product/community.md)).
- **World map (M):** a GTA-style overlay with pan, zoom, waypoints, labels and road-following routes that never pauses the world; only what is in view is drawn ([world_map.md](../product/world_map.md)). The corner mini-map follows the avatar closely and opens it.
- **First-person view:** preset `first` in `lib/state/viewStore.js` (`look` is the up/down angle); `components/city/FollowCamera.jsx` puts the camera at 1.3 above the ground (1.45 in a car) looking along the heading, and `Avatar.jsx` hides the avatar. Turning right is a negative change of azimuth there.
- **Parked cars:** `sim.obstacles` in `lib/sim/traffic.js` makes cars brake behind a parked car; one waiting over 9 s is towed. `lib/state/fleetStore.js` saves them per city seed. **Create image:** `lib/game/shareImage.js`, button on the building card.
- **Mall hall and rented stores:** `lib/city/mallHall.js` (the shared numbers: walls, doorway, store doors) is used by `lib/sim/collision.js` (hollow walls), `components/city/Malls.jsx` (the shell hides and the concourse shows while you are inside) and `components/city/Avatar.jsx` (the E prompt at each store door). `rentStore` in `lib/state/store.js` turns a store into the player's; rented stores are saved in `mallStores` and put back on load. `tests/malls.test.mjs` floods the floor from the door and checks every store door is reachable.
- **Shared vehicles:** the presence `state` message carries `veh` ({ kind, boatKind, color }); `server/multiplayer.mjs` cleans it (`cleanVeh`) and sends it in snapshots; `components/city/RemotePlayers.jsx` draws the car or boat (`CarModel`, `BoatModel` from `Vehicles.jsx`).
- **Ad rotation and contrast:** `lib/game/adRotation.js` (rotation from the clock, WCAG contrast, `textOn`), `components/city/useRotatingAd.js` (billboards and banner planes), `shareBillboard` in the store and a Share panel on the billboard card. `tests/ads.test.mjs`.
- **Interior hotspots:** `lib/content/interiorHotspots.js`, the Look at list in `components/interior/InteriorViewer.jsx`, and `components/interior/StorefrontPanel.jsx` (`Spot` lights up the section). `tests/hotspots.test.mjs`.
- **Look around (G):** `free` in `lib/state/viewStore.js` lets the follow cameras leave the avatar and pan over the city (`FollowCamera.jsx`, button in the camera menu); walking, G, Esc or Home end it. The world map's building card (`WorldMap.jsx`) opens any building or mall.
- **Dashboard:** `lib/game/dashboard.js` (owned businesses, set-up steps, rows, totals, CSV) and `components/ui/panel/DashboardView.jsx` (toolbar view `dashboard`); `PlotCard.jsx` opens it after a claim or take-over. The corner mini-map now draws the waypoint and its route. `sim.obstacles` in `traffic.js` also makes walkers walk round a parked car. `tests/dashboard.test.mjs`.
- **Deployment kit:** `deploy/` (see `deploy/README.md`): Caddy config (HTTPS, protected monitor), three systemd services, settings templates for the API, presence and web app, `setup.sh`, nightly `backup.sh`. The API now takes `API_HOST` and stops cleanly on SIGTERM. A `better-sqlite3` swap was tried and dropped (its native build crashed on the development machine). **Parked cars are shared:** `parked` messages over presence, drawn in `Vehicles.jsx`, and traffic stops for them.
- **Presence protocol 2:** `server/multiplayer.mjs` and `lib/net/multiplayer.js`: interest management (a grid, the nearest 40 within 120 units, `enter`/`exit`/changed arrays, distance-based rates), an `online` count and map dots, `/status` load figures. Measured with `scripts/load-test-presence.mjs` (`docs/architecture/presence_scale.md`). `NEXT_PUBLIC_MP_URLS` spreads cities over servers.
- **Interiors by business type:** `lib/content/businessFixtures.js` (kits and the menu), `brandPalette.js` (wall colours), `fixturePrices.js` / `fixturePricing.js` (the price list, zero until set; `scripts/fixture-price-sheet.mjs` and `import-fixture-prices.mjs`), `FurniturePanel.jsx`, the dashboard's worth line (`docs/product/interiors_fixtures.md`). The editor's Colours panel now paints walls with `side: 'double'` (with `'front'` a painted wall vanished).
- **Curved reserved site:** `designCurvedSite` in `lib/city/cityGenerator.js` (the designer's "Curved crescent", dev tool): one curved street and lots along it, mouths as curb cuts in the front road; `lib/sim/curveTraffic.js` drives cars and walkers on it (drawn by `Traffic.jsx`); the maps draw it. `tests/curved-site.test.mjs`, `tests/curve-traffic.test.mjs`.
- **Not done:** curved or diagonal reserved sites (task 22), brand-specific interior looks, mini-games and hosted WASM demos (task 21). (Walkers now walk round parked cars, see the dashboard item above.)
- **Tests:** 42 suites pass (lint clean, production build, browser and live-browser included). Run `npx next build` with `NODE_OPTIONS=` empty if it fails with EINVAL on a low-memory machine, and rebuild after `live-browser`, which leaves a build pointing at a test server.

## 5z. Credits panel, and the development machine

- **Credits panel.** Who made what, and under which licence, is listed once in `lib/content/credits.js` (sections: Music & sound, 3D models, Map data, Built with). `components/ui/panel/CreditsView.jsx` shows it as a side-panel view (`credits: 'Credits'` in `VIEWS`, `lib/state/panelStore.js`; rendered in `SidePanel.jsx`). It opens from a **Credits & licences** link at the bottom of the City map & guide view (`CityView` in `components/ui/Legend.jsx`). `CREDITS.md` at the repo root says the same in long form. Adding an outside asset means adding it to both.
- **Music.** The game plays 16 CC0 recordings from eight OpenGameArt releases (`lib/content/music.js`, `components/sound/recordedMusic.js`; evidence in `docs/licences/music/`). FreePD.com, the first source looked at, has closed. Which playlist plays:

  | Where | Playlist |
  | --- | --- |
  | Anywhere | the city playlist by day, a night playlist after dark |
  | On foot at the arcade, for a few seconds | chiptunes |
  | On foot at a coffee shop, for a few seconds | jazz |
  | In a car you drive | funk |

  The music director (`lib/game/musicDirector.js`) plays it as one soundtrack, like SimCity's:

  - each track plays to its end, then a short quiet, then the next;
  - day and night change at the end of a track, and a car or a place with a crossfade;
  - the camera's zoom does not change it (it used to, and every zoom cut the track).

  Only the active track downloads. The live WebAudio tunes (`lib/game/musicRules.js`) cover loading and failures. Details: [day_night_sound.md](../architecture/day_night_sound.md).
- **Tests:** `tests/credits.test.mjs` checks that `CREDITS.md` names every maker and licence in `credits.js` and that the Credits view exists. 60 test files in `tests/` now.
- **`npm run dev:all` without a shell.** `scripts/dev-all.mjs` starts both servers with `process.execPath` (the same Node binary) and finds Next's bin with `createRequire` (`next/dist/bin/next`), instead of spawning through a shell. This removed Node's DEP0190 warning on Windows.
- **Versions.** The development machine has Node.js 24.20.0 LTS and npm 12.2.0 (installed with winget). Next is 16.4.0; 16.4.2 is out but the project stays on 16.4.0 for now. Next 16's `next dev` writes an `AGENTS.md` at the repo root on start-up (`next.config.mjs` does not set `agentRules`, so it is on by default; set it to `false` to stop it).
- **PowerShell.** The machine's execution policy was AllSigned, which blocks `npm.ps1`. Fix: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or call `npm.cmd`.

## 5za. Chat and private messages

Phases 0 to 3 of [chat_messaging_plan.md](../architecture/chat_messaging_plan.md), with its proposed defaults; the plan's "Implementation status" lists what is left (launch checks, phones, the decisions).
- **A Chat panel** (toolbar button with a badge for unread messages and requests, a dot for new nearby lines): **Nearby** and **Inbox** tabs, in `components/ui/chat/`. State in `lib/state/chatStore.js`, apart from the game's; private messages and drafts are never written to the browser's storage and are cleared on sign-out. The Online view lists players with a verified mark and a Message button, and links to Chat (the chat box moved out of it).
- **Who is speaking** comes from the API: a signed-in game hands the presence server a one-use ticket, the presence server asks the API, and the connection then speaks as that account (its name too). Re-checked every 30 s. Guests can chat only where `MP_CHAT_GUESTS` allows (the default without an API, i.e. a LAN).
- **Nearby:** each line has a client id and gets an accepted / rejected answer; failed lines keep their text and offer Retry with the same id. A signed-in player's line goes through the API first (filter, budget, blocks both ways, a 7-day copy for reports). Lines carry a server id, so they can be reported; a line's menu has Message privately, Hide this player, Block and Report.
- **Inbox:** requests, history, read positions, mute, blocks and settings, idempotent sends, and an outbox of "inbox changed" nudges the presence server passes to that account only (`server/api/messaging.mjs`, `docs/architecture/backend.md`). **Message the owner** on a player-owned building's card starts an inquiry that stays with the two people in it if the building changes hands.
- **Tests:** `tests/messaging.test.mjs` (both servers, about 70 checks) and chat steps in `tests/live-browser.test.mjs` (two signed-in browsers: a nearby line with the verified mark, a private message and its request, the live badge, the reply, an inquiry). Checked at desktop and phone size in a headless browser; not yet on a physical phone.

## 5zb. A Python messaging service beside Node

Steps 1 to 5 of [node_fastapi_architecture_plan.md](../architecture/node_fastapi_architecture_plan.md) (its "Implementation status" has the detail). Messaging can now be served by a Python service, `services/messaging` (FastAPI, Python 3.13, its own SQLite database), instead of the Node API; **it is not switched on**: the Node API still serves messaging until `MESSAGING_SERVICE_URL` is set.
- **One contract, two implementations.** `tests/messaging.test.mjs` passes against both (`tests/messaging-fastapi.test.mjs` runs it on the service). The service is a port of `server/api/messaging.mjs` with the same routes, bodies and errors; its text checks are compared with the JavaScript ones.
- **Node stays the authority** on accounts, sign-ins, bans, tickets and plots, through new protected routes (`/internal/identity/*`, `/internal/plots/{id}/owner` with an ownership version), and forwards the messaging routes to the service when it is set up (one public address; `/internal/*` refused from outside by the Caddyfile).
- **Moving the data:** `python -m app.migrate_from_node` (ids kept, reconciled), with `MESSAGING_READONLY=1` to pause messaging writes meanwhile; rehearsed by `tests/messaging-migrate.test.mjs`. The switch-over runbook and rollback notes are in `deploy/README.md`.
- **Also:** `npm run messaging:setup` / `npm run messaging`; `deploy/systemd/voxelventure-messaging.service`, `deploy/env/messaging.env.example`; `setup.sh` installs Python and the pinned packages; `backup.sh` backs up the messaging database too; `npm run moderate` takes `MESSAGING_URL` for chat reports. Python 3.13.15 was installed on the development machine (winget, user scope); the packages are pinned at least two weeks old.
- **Tests:** the live-browser run also passes with `MESSAGING_IMPL=fastapi` (real browsers, messaging on the service). 63 test files.

## 5zc. Reassessment follow-ups, policies, phones and the repository's structure

The commercial phases 1 to 5 each have their own document:

| Phase | Document |
| --- | --- |
| 1, world freeze | [world_freeze.md](world_freeze.md) |
| 2, business funnel | [business_funnel.md](../product/business_funnel.md) |
| 3, authoritative data | [authoritative_data.md](../architecture/authoritative_data.md) |
| 4, billing | [billing.md](../monetization/billing.md) |
| 5, conversion measurement | [conversions.md](../monetization/conversions.md) |

Their item-by-item status is in [alignment_status.md](alignment_status.md). This section covers what came after, from the [core-concept reassessment](../competitive-research/voxelventure_core_concept_reassessment_2026-10-17.md) on.

- **Conversion keys** (`server/api/conversions.mjs`):
  - Each business makes its own random key in the dashboard. It looks like `vvck_...`, is shown once, and only its SHA-256 is stored.
  - A new key replaces the old one at once, and every change is in the audit trail.
  - The business's server sends the key only in `Authorization: Bearer` (or `X-Conversion-Key`). A key in the body is refused with `key_in_body`.
  - The pixel needs no key. Its reports are counted as browser-reported, capped at 30 a day per network, and replaced when the server reports the same order (`reconciled`).
- **Outcome families:**
  - The dashboard reports leads (newsletter, meeting and quote requests), coupon claims, redemptions and purchases separately, each with its own cost, never as one total (`OUTCOMES`, `outcomesOf`).
  - Revenue is split into verified (a credited press), unattributed (a server report without one) and browser-reported.
  - Return on spend uses verified revenue only.
- **Building of the Week** ([community.md](../product/community.md) section 4):
  - Every signed-in player gets one vote a week, plus a bonus vote for the three gold stars, each for a different building.
  - Voting has an in-game panel (`/?panel=week`), a Discover section, and badges and a Vote button on business pages.
  - Without a server it runs as a labelled demo.
  - The `votes` table is upgraded once at start-up, keeping its votes.
- **`CODEOWNERS`:** billing and prices, accounts and sessions, attribution and conversions, the schema and routing, messaging, deployment and CI, and since Phase B the three `packages/`.
- **Draft policies at `/legal`:**
  - The text is in `lib/legal/policies.js` and is shown by `components/legal/PolicyBody.jsx`.
  - Prices, periods and limits are read from `lib/legal/facts.js` (the catalogue, leases, the market, the vote) and `lib/legal/retention.js` (how long the servers keep each kind of data). `tests/legal.test.mjs` checks them against the code.
  - Consent lines appear at sign-up and on request forms, and every public page links to the policies.
  - They are marked *draft* (`POLICY_STATUS`) until a lawyer has reviewed them. What is left is in [policy_review.md](../monetization/policy_review.md).
- **Phones:** the business pages' menu becomes a row of three 44 px tabs (`components/business/PublicNav.jsx`, [business_funnel.md](../product/business_funnel.md)).
- **ESLint 10** (10.12.0):
  - `eslint-plugin-react` was removed: it does not support ESLint 10, and ESLint 10 sees names used in JSX itself.
  - The eight spots the new `no-useless-assignment` rule found were fixed.
- **Documentation by topic** (Phase A of the [migration plan](../architecture/modular_monorepo_migration_plan.md)): `docs/` is split into `product/`, `architecture/`, `monetization/`, `competitive-research/`, `roadmap/` and `operations/`, each with an index. The [path map](../architecture/documentation_path_map.md) lists each document's old and new path.
- **Shared packages** (Phase B, [ADR 0001](../architecture/adr/0001-shared-package-boundaries.md), [`packages/README.md`](../../packages/README.md)):

  | Package | What moved there |
  | --- | --- |
  | `packages/business-core` | `lib/business/plans.js`, with `git mv`; the old path is a one-line adapter |
  | `packages/analytics` | `lib/business/conversions.js`, the same way |
  | `packages/shared-types` | (new) six versioned JSON-Schema contracts, the shared enums and a validator |

  - **Loading:** `scripts/lib-loader.mjs` points imports that leave `lib/` at the real files, so the server and the bundler load the same module.
  - **CI:** `scripts/select-checks.mjs` treats a package change like a change to its adapters, and runs everything for a package's `package.json`.
  - **Tests:**
    - `tests/packages.test.mjs`: boundaries, purity, and that the adapter and the package export identical objects;
    - `tests/contracts.test.mjs`: real API answers checked against the contracts, and the server's lists against the enums.
- **Recorded music:** see 5z. Since then the **music director** (`lib/game/musicDirector.js`) plays it as one SimCity-style soundtrack:
  - tracks play to their end with a short quiet between;
  - day and night change at the end of a track, and a car or a stay at the arcade or a cafe with a crossfade;
  - the camera's zoom no longer changes the music (it used to cut the track);
  - the label shows the track.

  See [day_night_sound.md](../architecture/day_night_sound.md).
- **District street names** ([street_names.md](../architecture/street_names.md)): each district has a list of real names from a place with the same character (San Francisco for SaaS, the City of London for The Bazaar, Harrogate for the Meadow Quarter, …).
  - **In the generator:** the infill streets take the Meadow Quarter's, since their lots are in it. The avenues, the cross streets and the pun names keep theirs.
  - **In the editor:** it suggests names from the list of the road's district.
- **Phase B, second slices:** `lib/business/profile.js` moved to `packages/business-core`, so the web form and the server share one profile validation. The pilot's criteria are in `packages/analytics`. There are contracts for meeting and quote requests and the pilot ([ADR 0001](../architecture/adr/0001-shared-package-boundaries.md#the-second-slices-2026-10-17)).
- **The pilot dashboard** ([pilot.md](../monetization/pilot.md)) and the **policy gap fixes** 1 and 3 ([policy_review.md](../monetization/policy_review.md)): see tasks.md.
- **Click-to-walk finds its way** (`lib/sim/pathfind.js`, used by `components/city/Avatar.jsx`):
  - **Before:** a click on the ground sent the avatar straight at the point. It slid along the first wall in the way and gave up.
  - **Planning:** a click now plans a route over the same collision map the avatar moves against.
    - Near the two points it runs a grid search (A*, eight directions, never squeezing diagonally between two solids), leaving a little room from the walls. The corners a straight line can skip are dropped.
    - A walk longer than 30 units, or one the grid cannot solve within its budget (a lake or river in the way), follows the road graph of `lib/city/routing.js` with its bridges. Only the legs that are not straight (onto and off the road, round a circle's island) go on the grid.
  - **Clicks on a building:** the walk ends at the nearest free spot beside it, and the ground marker shows that spot.
  - **Walking the route:** the avatar walks corner to corner, reaching each corner within 0.06. A looser tolerance let the next leg clip a building. If something blocks it, it plans again once from where it stands, then gives up as before.
  - **World-map routes:** "Go there" (`RouteFollower`) hands it road corners one at a time, and each leg is planned the same way.
  - **Speed:** a bucket index over the solids, built when the collision map changes, keeps a click at about 1 ms (20 ms for a walk across the whole map).
  - **Tests:** `tests/pathfind.test.mjs` walks 180 random clicks on three cities with the game's own `moveAvatar`. Every one arrives without touching a wall. A headless-browser check in the running game also walked round six buildings.

## 6. Progress against `../product/voxelventure_blueprint.md`

Legend: ✅ done · 🟡 partly done · ❌ not started

### Phase 1 — Static Isometric Grid
| Item | Status | Notes |
| :--- | :--- | :--- |
| Three.js scene with isometric orthographic camera | ✅ | React Three Fiber, orthographic camera at (30,30,30), pan/zoom only (`MapControls`) |
| Static 20×20 tile grid | 🟡 | Replaced by a seeded generated city: 25 columns × 8 avenues (about 720 plots, 4 reserved sites, two malls, two airports); scalable with `NEXT_PUBLIC_MAP_SCALE` |
| Buildings from MagicaVoxel `.glb` models | 🟡 | Kenney `.glb` buildings and original `.vox` buildings and landmarks are loaded (instanced, with a box fallback); your own MagicaVoxel art is still to come |
| Raycasting so clicking a building opens a drawer | ✅ | R3F pointer events; a plot opens the Building card in the movable side panel (figures, address, site visits, history, claim / take-over forms); parks and ad spaces open there too |

### Phase 2 — Avatar & Movement
| Item | Status |
| :--- | :--- |
| Low-poly avatar from Blockbench | 🟡 | A voxel avatar built from boxes in code (no Blockbench model), with cosmetics and emotes; it can also drive cars and sail boats |
| Tap-to-move / WASD controls | ✅ | WASD / arrows + Shift, click the ground to walk, an on-screen joystick on phones, and camera-relative movement in the follow views |
| Rapier.js collisions around building perimeters | 🟡 | Collisions around buildings, park features and billboard posts with a simple box map instead of Rapier |

### Phase 3 — Multiplayer Presence & Economy
| Item | Status | Notes |
| :--- | :--- | :--- |
| PartyKit sync of visitor positions | ✅ (own server) | A WebSocket server (not PartyKit) shares avatars within a view radius, pushes world changes instantly, and carries spatial chat; names are account names (docs/architecture/backend.md) |
| Stripe checkout to claim/buy out a plot | ✅ | With Stripe set up, claims, take-overs and lease renewals go through Stripe Checkout, with the plot held while the player pays ([billing.md](../monetization/billing.md)) |
| Automatic 1.25× escalation | 🟡 | The game keeps the hot-potato buyout: take over for 1.25x, the displaced owner is paid +25% in the game and moved to Old Town, and is emailed. With real money a take-over is a conventional lease and nobody is paid out; the 1.25x rule stays a Gold-only game mechanic ([takeover_payouts.md](../monetization/takeover_payouts.md)). Gold itself is still in the browser |

### Core pillars (section 3.2)
| Pillar | Status | Notes |
| :--- | :--- | :--- |
| Interactive storefronts / interiors | 🟡 | A Storefront panel next to the room now carries a claimable coupon, a visit-for-Gold reward and an optional embedded video / game demo (YouTube, Vimeo, itch.io), editable by the owner. You walk to a building's door and press E; claimed plots open a 3D interior that matches the building type (office, restaurant or shop, 7 layouts). Still missing: brand-specific interiors, embeds (game demo, video, feedback board) and coupon dispensers |
| Quest & bounty economy (Gold, cosmetics, raffles) | 🟡 | Gold comes from billboard quests (+25), fishing from a boat (up to 120 a day), brand visit quests ("stay 30 s, earn Gold"), the daily chest and the Plot of the Day, and is spent in the Wardrobe (avatar clothes, hats, emotes) and a sponsored raffle. Brand-set quests exist (owners choose the time and reward) but are paid from nothing: there is no brand budget yet |
| Player-driven foot traffic / real-time multiplayer | 🟡 | Presence works across the internet once the presence server is deployed (5i, 5p): players see each other's avatars and chat, and plots and ad spaces are shared through the API. Visitor counts are verified. Still missing: shared Gold |

### Improvements table (section 2)
| Area | Status | Notes |
| :--- | :--- | :--- |
| Thematic districts | ✅ | SaaS Silicon Strip, Arcade Alley, Creator Commons, Agency Boulevard, with labeled, color-coded avenues |
| Daily discovery loops (chests, scavenger hunts, Plot of the Day) | ✅ | Daily chest, Plot of the Day and a three-star scavenger hunt (5l) are done, picked from the date and saved. The Plot of the Day newsletter is on the server ([backend.md](../architecture/backend.md)); it needs a mail service key to deliver |
| Live avatars on sidewalks | 🟡 | About 44 simulated walkers and cars fill the city, and players appear as avatars through the presence server (on a LAN now, and across the internet once deployed) |
| Displacement friction / Hall of Fame / suburb | ✅ | Taking over a business pays the owner 1.25x, logs them in the plot's Hall of Fame, and moves them to a house in the Old Town suburb. Billboards have a Hall of Fame too |
| Micro-cards with in-world CTAs (email signup, demos, codes) | ✅ | Billboard cards and storefronts have email sign-up (double opt-in), coupons with a ticket the owner marks redeemed, and embedded video and game demos, all on the server. Presses of a building's website link count for its business page ([conversions.md](../monetization/conversions.md)) |
| Spatial organization / world feels alive | ✅ | Road hierarchy, signals, circles, crossings, two parks, river, lakes, airports with banner planes, landscaping, moving cars and people |

### Tech stack (section 4)
| Item | Status |
| :--- | :--- |
| Three.js / React Three Fiber / Drei | ✅ |
| Runs instantly in a browser | ✅ (about 470 draw calls on desktop, 177 on a phone; see 5p) |
| Rapier.js | ❌ |
| PartyKit / Colyseus / LiveKit | ❌ |
| Supabase (Postgres, auth, realtime) | 🟡 | Own Node + SQLite API with a Postgres-portable schema (`docs/architecture/backend.md`) |
| Stripe / Stripe Connect | 🟡 | Stripe Checkout is built ([billing.md](../monetization/billing.md)). Stripe Connect is not used, on purpose: nobody is paid out ([takeover_payouts.md](../monetization/takeover_payouts.md)) |
| MagicaVoxel / Blockbench / Kenney assets / Blender | 🟡 | Kenney and `.vox` assets and a Blockbench-layout avatar are in; Blender not used |

---

## 7. Fix: drei `Html` unmount warning (patch)

Pascal's viewer and node renderers use drei's `<Html>` helper internally. On unmount it called `root.unmount()` synchronously, which React forbids while another render or commit is running ("Attempted to synchronously unmount a root while React was already rendering"), and it removed its DOM node without checking it was still there ("removeChild ... not a child"). The app can't change Pascal's code, so `node_modules/@react-three/drei/web/Html.js` is patched to unmount on the next microtask and to check the node first.

- The patch lives in `patches/@react-three+drei+10.7.9.patch` and is reapplied automatically by `patch-package` (the `postinstall` script), including on a fresh `npm install`.
- **Restart the dev server after pulling this change**, since it caches `node_modules`.
- If drei is upgraded, `patch-package` will warn that the patch no longer matches; regenerate it with `npx patch-package @react-three/drei` after re-making the edit.
