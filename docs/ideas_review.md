# The idea documents, reviewed: what is built, what is next

A reading of `voxelventure_idea_01.md` to `_06.md` against the game as it is now (status last checked 2026-10-15). For each idea: what it proposes, whether it exists, how big it is, and how much it sets VoxelVenture apart from ClaimAvenue (a static directory of buildings bought at 1.25x). Sizes are working days for one developer, including tests and docs.

## What each document says, and where it stands

**Idea 01: strategic differentiation.** Leaseholds, in-app conversion kiosks, activity-based skyline, districts, proof-of-human traffic, pop-up stalls, UGC marketplace, billboard ads, daily quests.
Built: leaseholds, skyline, districts (The Bazaar), proof-of-human, pop-up market, billboards with rotation, daily hunt and Building of the Week (`community.md`, `market.md`). Left: checkout / scheduling kiosks (need Stripe, Cal.com), the UGC marketplace.

**Idea 02: growth and reach.**
1. *Programmatic SEO pages* for every claimed building: not built.
2. *Time-lapse city history*: not built (the server's ledger already records every claim and take-over).
3. *Embeddable "Shop window" badge with a deep link that glides the camera to the building*: built (`/?plot=ID` and `/b/ID` links, a share box with a copy-paste badge: `lib/game/shareLink.js`, `components/ui/ShareBox.jsx`).
4. *AI clerk NPCs* grounded on the owner's own docs: not built.
5. *Automated social posts on every claim*: built as opt-in welcome posts on X with an admin review queue ([social_posts.md](social_posts.md)); a manual "Create image" and a copy-link share box exist too.
6. *Soundscapes and spatial audio*: built, all synthesised with no sound files: ambience by the hour and place-based sound and music near the ground ([day_night_sound.md](day_night_sound.md)).

**Idea 03: Python or .NET, OSM street names.** Answered: stay on Node ([hosting_stack_payments.md](hosting_stack_payments.md)). The one useful piece is the offline OpenStreetMap street-name script (a Python job; tasks.md item 13, ODbL attribution needed). Postgres/PostGIS is only worth it if the API ever needs a second machine.

**Idea 04: a better building builder.** A teardown of ClaimAvenue's builder (floor stepper with tiers, shape presets, facade patterns, a rooftop slot, flat colours, a checkout timer) and a redesign: podium + body + crown modules, glass and visible interiors, live LED ticker, street kiosk, drag-to-extrude height, curated palettes, a day/night preview.
Built: heights by plot tier, Kenney and voxel building models, brand-coloured interiors, roof banners with logos, claim forms, and an outside builder in the claim form (floors, shape, curated colour styles, wall colour and a rooftop crown: `lib/game/exterior.js`), with a three-minute hold while you set a plot up (client side: `lib/game/claimHold.js`). Not built: the modular builder, facade patterns, LED ticker, height gizmo, the hold on the server.

**Idea 05: a shared day/night cycle.** An authoritative server clock with the sun, moon, lamps and neon following it. Built, without a server: a 24-minute day from the UTC clock, with the sun, moonlight, street lamps and windows following it (`lib/game/dayCycle.js`, `components/city/DayNight.jsx`, [day_night_sound.md](day_night_sound.md)); neon trims are not built. Note: no server is needed for this. A clock computed from UTC time (`now % cycle`) is identical for everyone on Earth, and the server's time offset can correct a wrong device clock.

**Idea 06: from billboards to a simulation.** SimCity-style synergy between neighbours, live apps and playable facades on buildings, the "window shopper" peek through walls, weather tied to internet events, scheduled plaza drops, zoning boards and mayors, heatmaps and a graffiti wall.
Built (partly): a weekly pop-up market, verified-traffic data, Building of the Week, feedback boards (a guestbook in all but name). Everything else not built.

## The plan: quick wins first
Ranked by how much each adds for the work. "Needs" lists anything outside the code.

### Quick wins (a day or two each)
| # | What | From | Days | Why it matters | Needs | Status (2026-10-15) |
| :-: | :--- | :-: | :-: | :--- | :--- | :--- |
| 1 | **Deep links and the "visit our building" badge.** `?plot=12` (and a clean `/b/12`) opens the city and glides the camera to that building with its card open. The owner's dashboard gets a copy-paste badge snippet and a share link. | 02-3 | 1 to 1.5 | Every tenant starts sending their own audience into the city: the viral loop ClaimAvenue lacks. Also what every later item (SEO pages, social posts) links to. | nothing | Done: `lib/game/shareLink.js`, `app/b/[id]/page.jsx`, `components/ui/ShareBox.jsx` (on the building card and the dashboard) |
| 2 | **Shared day/night.** A UTC-based clock (a 24-minute day), sun and ambient light and sky colour following it, lamps and windows lighting up at dusk, a "time" slider in the interior viewer later. | 05, 04 | 1.5 to 2 | The biggest mood change for the least work; makes the city feel alive and shared. | nothing | Done: `lib/game/dayCycle.js`, `components/city/DayNight.jsx`, `components/city/nightLights.js`. The interior time slider is not built ([day_night_sound.md](day_night_sound.md)) |
| 3 | **Ambient sound with a mute button.** City hum and weather made from the Web Audio API (no files), louder near roads and quieter indoors; district music zones added later when you pick tracks. | 02-6 | 1 (ambience) | Dwell time; sound also sells the world in a screen recording. | audio files for music zones (royalty-free or yours) | Done: `lib/game/soundscape.js`, `components/SoundEngine.jsx`. The music zones are built too, synthesised with no music files, so no tracks were needed. No weather sound yet |
| 4 | **Share buttons.** "Share on X / LinkedIn" next to "Create image", with the deep link from #1 and a ready caption. | 02-5 | 0.5 | Cheap first step to the social loop; no posting accounts needed. | #1 | Partly: a copy-link box and "Create image" (the device's share sheet where there is one); no X / LinkedIn buttons |
| 5 | **Style presets for buildings.** Curated palettes (Tokyo Cyberpunk, Nordic, High-Tech Solar, ...) applied to the exterior and the inside in one click. | 04 | 1.5 | Looks premium; builds on the brand palette. | #2 helps | Partly: colour styles for the outside (`PALETTES` in `lib/game/exterior.js`); not applied to the inside |
| 6 | **Crown props.** Pick a rooftop feature: beacon, dish, rooftop garden, dome, rotating logo. | 04 | 2 | Visible from the whole map: owners stand out. | models (simple voxel ones) | Done: beacon, dish, roof garden, dome and spire (`CROWNS` in `lib/game/exterior.js`, `lib/content/crowns.js`, `components/city/Crowns.jsx`); no rotating logo |
| 7 | **Facade LED ticker.** A scrolling headline strip on the building, from the owner's text (reuses the banner texture code). | 04 | 2 | Makes buildings look live, not like boxes. | nothing | Not built |
| 8 | **"Held for you" checkout timer.** The claim flow holds the plot for a few minutes and shows the countdown. | 04 | 1 (local), 2 (server hold) | Urgency, and it stops two people claiming at once. | the server for the real hold | Partly: a three-minute hold on the client (`lib/game/claimHold.js`, `lib/state/claimHoldStore.js`); not on the server |
| 9 | **Guestbook and District Mayor.** Relabel the feedback board a guestbook; each month the top building of a district (verified visitors, votes) becomes its Mayor with a rooftop spire. | 06 | 2.5 | A reason to visit and to compete beyond buying. | the server | Not built |
| 10 | **OpenStreetMap street names.** The offline script that gives districts real street names. | 03 | 1 | Character, and removes the generic names. | OSM data, ODbL credit | Done as a script (`scripts/streets/`, [street_names.md](street_names.md)); off by default in the game |
| 11 | **Saturday plaza drop.** A scheduled event that unlocks free blank stalls for two hours (the market already books stalls by the week). | 06 | 2 | A weekly reason to return. | the server | Not built |

### Take time (a week or so)
None of these is built yet (2026-10-15). The `/pricing` heatmap is a land-price tool, not #16.

| # | What | From | Days | Notes |
| :-: | :--- | :-: | :-: | :--- |
| 12 | **Programmatic SEO pages**: a static page per claimed building (`/district/.../name`) with its description, screenshots, owner links and a button into the 3D world; sitemap and share images. | 02-1 | 3 to 4 | Real search backlinks for tenants, a concrete reason to pay. Needs the live server for the data. |
| 13 | **Window-shopper peek**: hover a building and see into it (the cut interior fades in over the facade). | 06 | 3 to 4 | Uses the interior scenes already built. |
| 14 | **Neighbour synergy**: complementary businesses side by side earn a "synergy" badge and a shared visit quest; anchor tenants lift the foot traffic of small neighbours. | 06 | 4 to 5 | The SimCity idea; the district and building-type data already exist. |
| 15 | **City time-lapse**: a scrubber that replays ownership and skyline growth from the server's ledger. | 02-2 | 5 to 6 | Shareable and sticky. Needs the live server and some history. |
| 16 | **Sidewalk heatmap** from verified visits, plus guestbook stickers. | 06 | 3 (+3 with moderation) | Visible proof of real traffic. |
| 17 | **Playable facades**: a small canvas game or visualiser on a building's front, run by the owner's embed. | 06 | 4 to 5 | Pairs with hosted demos. |

### Long projects
None of these is built yet (2026-10-15).

| What | From | Estimate | Needs |
| :--- | :-: | :-: | :--- |
| Modular builder: podium + body + crown with a drag-to-extrude height handle | 04 | 2 to 3 weeks | a procedural building generator in place of the fixed models |
| AI clerk NPCs per storefront | 02-4 | 1 to 2 weeks | an LLM service and its cost, moderation, a per-building knowledge box |
| Automatic social posting on every claim | 02-5 | 1 to 2 weeks | X / LinkedIn accounts and approval; a headless screenshot worker |
| Creator asset marketplace (UGC) | 01 | 3 to 4 weeks | payments, review, storage |
| Weather and events tied to the real internet (outages, launches) | 06 | 1 to 2 weeks | data feeds and a policy for them |
| Zoning boards and district charters (voting on themes and rules) | 06 | 2 to 3 weeks | accounts at scale, moderation |
| Live on-street prototypes (a terminal that runs a tenant's API) | 06 | per tenant | sandboxing, cost control |

## Recommended order
1. **#1 deep links and badges** first (everything social and SEO points at them), then **#2 day/night** and **#3 sound**: together about four days that change how the city feels. *Done (see the table above).*
2. **#4 share buttons**, **#5 style presets**, **#7 ticker**: another four or five days of visible polish. *Partly done: the outside colour styles and the copy-link box; the X / LinkedIn buttons, presets for the inside and the ticker are left.*
3. With the live server running: **#12 SEO pages**, **#9 mayor and guestbook**, **#11 plaza drop**, **#8 the hold timer**: the retention and reach features.
4. **#14 synergy** and **#13 peek** as the first big gameplay additions; **#15 time-lapse** once there is history to show.
5. Leave the long projects until payments and hosting are live; the AI clerks and the social bot are the two I would try first.
