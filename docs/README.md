# Documentation index

| Document | Read it for |
| :--- | :--- |
| [tasks.md](tasks.md) | **What is done and what is left**, with sizes and dependencies |
| [overview.md](overview.md) | **Start here.** What the project is, how to run and test it, how the city, game and multiplayer work, and what is next |
| [project_status.md](project_status.md) | The detailed record: everything built, section by section (5 to 5z), known issues, progress against the blueprint |
| [claimavenue_competitive_alignment_review.md](claimavenue_competitive_alignment_review.md) | **The current plan.** How the project compares with the recommended commercial strategy, the critical gaps, and the six-phase implementation sequence |
| [phase_5_ai_agent_delivery_estimate.md](phase_5_ai_agent_delivery_estimate.md) | A historical estimate (2026-10-16) of how long phases 1 to 5 would take; they were done in code by 2026-10-17 |
| [alignment_status.md](alignment_status.md) | **Where phases 1 to 5 stand** against the review (and its public-discoverability gap), item by item, and what still needs you |
| [authoritative_data.md](authoritative_data.md) | Phase 3: verified figures only (nothing simulated with a server), the building's outside kept by the server, the audit trail, the production settings check and `npm run verify:live` |
| [social_posts.md](social_posts.md) | Welcome posts on VoxelVenture's X account for owners who opt in: the text, the review queue, the settings and how visits from a post are counted |
| [business_funnel.md](business_funnel.md) | Phase 2: free business profiles, the public pages (`/discover`, `/business/[slug]`, categories, districts), calls to action, referral links, owner onboarding and upgrade prompts |
| [world_freeze.md](world_freeze.md) | Phase 1: what world work is frozen, what continues, the `npm run check:freeze` check and its exceptions, and when the freeze lifts |
| [voxelventure_blueprint.md](voxelventure_blueprint.md) | The product concept and the ClaimAvenue analysis |
| [road_design_reference.md](road_design_reference.md) | Road-network research (New York, San Francisco, Washington DC) behind the diagonal avenue and circles |
| [backend.md](backend.md) | The API server: accounts, claiming, events and statistics (how to run it, endpoints, what is left) |
| [scope_assets_and_wasm.md](scope_assets_and_wasm.md) | Scope and estimates for real 3D assets (Kenney, MagicaVoxel, Blockbench), physics, and what a real WASM game demo would be |
| [live_data.md](live_data.md) | Every figure that needs a server, its endpoint and what it needs (the live-data switch) |
| [market.md](market.md) | The pop-up market: spots, tiers, weekly layouts, booking, shops, notices |
| [community.md](community.md) | The five strategy features built: proof-of-human traffic, leaseholds, skyline, Building of the Week, The Bazaar |
| [hosting_stack_payments.md](hosting_stack_payments.md) | Going live: why the server stays on Node, the Linode setup, why Stripe was chosen (now built: [billing.md](billing.md)), and the owner dashboard |
| [conversions.md](conversions.md) | Phase 5: the funnel from impression to result, meeting and quote requests, purchases credited by click id, coupon redemptions, cost per result and renewals |
| [takeover_payouts.md](takeover_payouts.md) | Why the 1.25x take-over rule stays in Gold and real-money take-overs are conventional leases: the legal, tax, fraud and economic reasons |
| [billing.md](billing.md) | Phase 4 payments through Stripe Checkout: the Launch Pack, Pro and sponsored placements, and in the game paid leases (claim, take-over, renewal) and market stalls; webhooks, reconciliation, refunds, receipts |
| [../deploy/README.md](../deploy/README.md) | The deployment runbook and files (Caddy, systemd, settings, backups) for a Linode |
| [presence_scale.md](presence_scale.md) | The presence server at scale: protocol 2, what a crowd costs (measured), and how to grow past one server |
| [interiors_fixtures.md](interiors_fixtures.md) | Interiors by business type: the furniture menu, brand colours, hotspots and the fixture price list |
| [ideas_review.md](ideas_review.md) | The idea documents (01 to 06) reviewed: what is built, and the quick wins and longer projects in priority order |
| [kenney_assets.md](kenney_assets.md) | The Kenney (CC0) boats, pier decks and amusement-park pieces: what was found, what is used, what is still built in code |
| [boats_piers_riverwalk.md](boats_piers_riverwalk.md) | Boats that sail themselves to a pier, piers and fishing from them, the riverwalk, river estates |
| [infill_and_land.md](infill_and_land.md) | Free land, new streets (inside the county road and outer blocks), the amusement park, how many lots and what it costs |
| [city_editor.md](city_editor.md) | The `/editor` page: add, move and remove roads, streets, lots and parks, validate, save and open in the game |
| [behind_the_building.md](behind_the_building.md) | The "Behind the building" option in the plot menu: car park, garden, patio, storage, pool |
| [street_names.md](street_names.md) | The offline OpenStreetMap street-name script and its output |
| [chat_messaging_plan.md](chat_messaging_plan.md) | Nearby chat and private messages: the plan, what is built (phases 0-3) and the launch checks and decisions still open |
| [legal/policy_review.md](legal/policy_review.md) | The draft policies at `/legal`: what to fill in, what to decide, and where the product does not yet match them, before a lawyer's review and approval |
| [node_fastapi_architecture_plan.md](node_fastapi_architecture_plan.md) | Moving messaging into a Python (FastAPI) service beside Node: who owns what, the internal boundaries, and what is built (steps 1-5) and left (the switch-over) |
| [../services/messaging/README.md](../services/messaging/README.md) | The Python messaging service: running it, its settings, how it talks to Node, moving the data, its tests |
| [day_night_sound.md](day_night_sound.md) | The shared day and night, street and window lights, ambient sound: what is built and what is next |
| [pricing_analysis.md](pricing_analysis.md) | Land prices: the rules (real-estate grounds, location grades), the numbers on a whole city at full occupancy, heatmaps, floors and the claim form |
| [world_map.md](world_map.md) | The world map (M): controls, waypoints and routes, and how it stays fast |
| [voxelventure_idea_01.md](voxelventure_idea_01.md) | The strategic differentiation plan (what is built is in community.md) |
| [02](voxelventure_idea_02.md), [03](voxelventure_idea_03.md), [04](voxelventure_idea_04.md), [05](voxelventure_idea_05.md), [06](voxelventure_idea_06.md) | The other idea documents: 02 search pages, city history, embeds and soundscapes; 03 Python vs .NET and OpenStreetMap street names; 04 ClaimAvenue's builder and a modern one; 05 a server-timed day and night; 06 a living city instead of ad space (each reviewed in ideas_review.md) |
| [study_world_streaming.md](study_world_streaming.md) | Feasibility study: how big the map can get, streaming a world of several cities, an island with an ocean and a shipping yard (measurements, prototype, plan) |
| [../scripts/study/README.md](../scripts/study/README.md) | The scripts that produced the study's numbers |
| [../server/README.md](../server/README.md) | The multiplayer / monitor server: settings, endpoints, the error log |
| [../CREDITS.md](../CREDITS.md) | Who made the models, map data and code the game uses, their licences, and the rules for adding anything from outside (the in-game Credits panel shows the same list) |
