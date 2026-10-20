# Documentation index

Start with [overview.md](product/overview.md). For current delivery status, use [tasks.md](roadmap/tasks.md) and [alignment_status.md](roadmap/alignment_status.md); [project_status.md](roadmap/project_status.md) supplies the detailed implementation record. Reviews, idea documents and estimates are historical context, not launch certification.

## Browse by topic

| Category | Responsibility |
| --- | --- |
| [Product](product/README.md) | Vision, user journeys and feature requirements. Feature notes describe implemented or proposed behavior; consult the roadmap for delivery status. |
| [Architecture](architecture/README.md) | System boundaries, authoritative data, presence, messaging, the migration and adoption plans, and the ADRs. The existing Node API and Python messaging service remain distinct. |
| [World](world/README.md) | The 3D city's systems: roads and land, street names, day and night, sound, models, the city editor and the streaming study. |
| [Monetization](monetization/README.md) | Billing behavior, attribution, pricing and policy decisions. Draft policies require the review described in the policy checklist. |
| [Competitive research](competitive-research/README.md) | Strategy, comparison and historical idea snapshots. These are research inputs, not current completion reports. |
| [Roadmap](roadmap/README.md) | Current status, remaining work, historical estimates and deferred scope. tasks.md and alignment_status.md are the primary delivery references. |
| [Operations](operations/README.md) | Hosting and running the live service, with the deploy, staging and payments runbooks in `deploy/`. |
| [Brand](brand/README.md) | The Voxel Venture logos, their usage guide and the asset files. |

Phase A of the [migration plan](architecture/modular_monorepo_migration_plan.md) organized the documents into topic folders; on 2026-10-18 the city and world write-ups moved to `world/`, the idea documents to `competitive-research/ideas/`, and the brand guide to `brand/`. The [path map and reference audit](architecture/documentation_path_map.md) lists each document's original and current path. Phase B started the shared packages: [ADR 0001](architecture/adr/0001-shared-package-boundaries.md) records the decision, and [`packages/README.md`](../packages/README.md) describes them. The applications stay where they are until Phase C.

## Every document, by topic

### Product

What VoxelVenture is and does: the concept, the funnel, the features.

| Document | Read it for |
| :--- | :--- |
| [overview.md](product/overview.md) | **Start here.** What the project is, how to run and test it, how the city, game and multiplayer work, and what is next |
| [sales_funnel_proposal.md](product/sales_funnel_proposal.md) | The sales funnel (free profile, then a 3D storefront, then the next business options), the 7, 14 and 30-day leases, the Pro plot discount, the cart and the plot economy: decided 2026-10-18 |
| [business_funnel.md](product/business_funnel.md) | Phase 2: free business profiles, the public pages (`/discover`, `/business/[slug]`, categories, districts), calls to action, referral links, owner onboarding and upgrade prompts |
| [voxelventure_blueprint.md](product/voxelventure_blueprint.md) | The product concept and the ClaimAvenue analysis |
| [market.md](product/market.md) | The pop-up market: spots, tiers, weekly layouts, booking, shops, notices |
| [community.md](product/community.md) | The five strategy features built: proof-of-human traffic, leaseholds, skyline, Building of the Week, The Bazaar |
| [interiors_fixtures.md](product/interiors_fixtures.md) | Interiors by business type: the furniture menu, brand colours, hotspots and the fixture price list |
| [boats_piers_riverwalk.md](product/boats_piers_riverwalk.md) | Boats that sail themselves to a pier, piers and fishing from them, the riverwalk, river estates |
| [behind_the_building.md](product/behind_the_building.md) | The "Behind the building" option in the plot menu: car park, garden, patio, storage, pool |
| [world_map.md](product/world_map.md) | The world map (M): controls, waypoints and routes, and how it stays fast |
| [pilot_tour.md](product/pilot_tour.md) | The guided sales demo for prospective pilot businesses: `/?tour=pilot` (ten stops, read-only), its keys, recording it with `scripts/tour-record.mjs`, and how to edit or add a tour |

### Roadmap

What is done and what is left; the freeze; historical estimates.

| Document | Read it for |
| :--- | :--- |
| [tasks.md](roadmap/tasks.md) | **What is done and what is left**, with sizes and dependencies |
| [project_status.md](roadmap/project_status.md) | The detailed record: everything built, section by section (5 to 5z), known issues, progress against the blueprint |
| [phase_5_ai_agent_delivery_estimate.md](roadmap/phase_5_ai_agent_delivery_estimate.md) | A historical estimate (2026-10-16) of how long phases 1 to 5 would take; they were done in code by 2026-10-17 |
| [alignment_status.md](roadmap/alignment_status.md) | **Where phases 1 to 5 stand** against the review (and its public-discoverability gap), item by item, and what still needs you |
| [world_freeze.md](roadmap/world_freeze.md) | Phase 1: what world work is frozen, what continues, the `npm run check:freeze` check and its exceptions, and when the freeze lifts |
| [scope_assets_and_wasm.md](roadmap/scope_assets_and_wasm.md) | Scope and estimates for real 3D assets (Kenney, MagicaVoxel, Blockbench), physics, and what a real WASM game demo would be |
| [ideas_review.md](roadmap/ideas_review.md) | The idea documents (01 to 06) reviewed: what is built, and the quick wins and longer projects in priority order |

### Monetization

Payments, attribution, prices, the pilot, and the policies to approve.

| Document | Read it for |
| :--- | :--- |
| [conversions.md](monetization/conversions.md) | Phase 5: the funnel from impression to result, meeting and quote requests, purchases credited by click id (per-business conversion keys, the pixel), coupon redemptions, outcome families each with its own cost, verified revenue and return on spend, renewals |
| [plot_economy_data.md](monetization/plot_economy_data.md) | The plot economy's data: the server's claim hold, claim intent, foot traffic per area, take-over attempts, "watch this plot", and the report at `/admin/economy` that a demand index will be fitted on |
| [pilot.md](monetization/pilot.md) | Phase 6: the pilot dashboard at `/admin/pilot` (and `npm run moderate -- pilot`), each pilot business week by week, the merchants' weekly check-in, and the criteria that lift the world freeze |
| [takeover_payouts.md](monetization/takeover_payouts.md) | Why the 1.25x take-over rule stays in Gold and real-money take-overs are conventional leases: the legal, tax, fraud and economic reasons |
| [billing.md](monetization/billing.md) | Phase 4 payments through Stripe Checkout: the Launch Pack, Pro and sponsored placements, and in the game paid leases (claim, take-over, renewal) and market stalls; webhooks, reconciliation, refunds, receipts |
| [policy_review.md](monetization/policy_review.md) | The draft policies at `/legal`: what to fill in, what to decide, and where the product does not yet match them, before a lawyer's review and approval |
| [plot_pricing_scenarios.md](monetization/plot_pricing_scenarios.md) | **The real price levels**: every tier at 7, 14 and 30 days (lease, take-over, renewal), with and without Pro, the outside prices and a full city's revenue |
| [plot_economy_benchmarks.md](monetization/plot_economy_benchmarks.md) | Outside benchmarks for the plot economy, with sources: real shop rents, virtual land, what local businesses pay for listings, fair dynamic pricing and card fees |
| [pricing_analysis.md](monetization/pricing_analysis.md) | Land prices: the rules (real-estate grounds, location grades), the numbers on a whole city at full occupancy, heatmaps, floors and the claim form |

### Architecture

How the system is built: the API, data, presence, messaging, the migration plans and the ADRs.

| Document | Read it for |
| :--- | :--- |
| [external_voxel_repositories_adoption_plan.md](architecture/external_voxel_repositories_adoption_plan.md) | Selective adoption plan for Mykonos Island Voxels, Voxelize, and Tiny World Builder, including implementation tracks, folder changes, licensing boundaries, and GAP analysis |
| [authoritative_data.md](architecture/authoritative_data.md) | Phase 3: verified figures only (nothing simulated with a server), the building's outside kept by the server, the audit trail, the production settings check and `npm run verify:live` |
| [backend.md](architecture/backend.md) | The API server: accounts, claiming, events and statistics (how to run it, endpoints, what is left) |
| [live_data.md](architecture/live_data.md) | Every figure that needs a server, its endpoint and what it needs (the live-data switch) |
| [presence_scale.md](architecture/presence_scale.md) | The presence server at scale: protocol 2, what a crowd costs (measured), and how to grow past one server |
| [chat_messaging_plan.md](architecture/chat_messaging_plan.md) | Nearby chat and private messages: the plan, what is built (phases 0-3) and the launch checks and decisions still open |
| [node_fastapi_architecture_plan.md](architecture/node_fastapi_architecture_plan.md) | Moving messaging into a Python (FastAPI) service beside Node: who owns what, the internal boundaries, and what is built (steps 1-5) and left (the switch-over) |
| [modular_monorepo_migration_plan.md](architecture/modular_monorepo_migration_plan.md) | The modular monorepo: documentation (A), shared packages (B), apps and services (C) and integration certification (D), all done; status at the top |
| [ADR 0001: Shared package boundaries](architecture/adr/0001-shared-package-boundaries.md) | the three packages, what each may import, the adapters, contract versioning, and CI. |
| [ADR 0002: Workspaces](architecture/adr/0002-workspaces.md) | Phase C step 1, the packages as npm workspaces imported by name, and the adapters retired. |
| [ADR 0003: The web app in apps/web, the Node servers in services/](architecture/adr/0003-apps-and-services.md) | Phase C steps 2 to 5, the new layout, and what to move on a machine that ran the old one. |
| [ADR 0004: Executable contracts for the presence protocol](architecture/adr/0004-presence-protocol-contracts.md) | Track B of the adoption plan, every protocol-2 message as a contract, the strict hello, version answers. |
| [performance_policy.md](architecture/performance_policy.md) | Track C of the adoption plan: the frame-loop inventory, the quality tiers (`?quality=`), the pause and throttle rules, the budgets, the measured numbers, and how to measure on a phone or laptop |
| [documentation_path_map.md](architecture/documentation_path_map.md) | Where each document was and is now: the 2026-10-16 topic folders and the 2026-10-18 moves |

### World

The 3D city's systems: roads and land, street names, sound and light, models, the editor, and the streaming study.

| Document | Read it for |
| :--- | :--- |
| [road_design_reference.md](world/road_design_reference.md) | Road-network research (New York, San Francisco, Washington DC) behind the diagonal avenue and circles |
| [kenney_assets.md](world/kenney_assets.md) | The Kenney (CC0) boats, pier decks and amusement-park pieces: what was found, what is used, what is still built in code |
| [infill_and_land.md](world/infill_and_land.md) | Free land, new streets (inside the county road and outer blocks), the amusement park, how many lots and what it costs |
| [city_editor.md](world/city_editor.md) | The `/editor` page: add, move and remove roads, streets, lots and parks, validate, save and open in the game |
| [street_names.md](world/street_names.md) | The offline OpenStreetMap street-name script, the city name sets, and each district's own list (the Meadow Quarter's streets use theirs; the editor suggests by district) |
| [day_night_sound.md](world/day_night_sound.md) | The shared day and night, street and window lights, the ambience of the places round you, and the soundtrack (the music director: playlists by driving, place and time of day, never by the zoom) |
| [study_world_streaming.md](world/study_world_streaming.md) | Feasibility study: how big the map can get, streaming a world of several cities, an island with an ocean and a shipping yard (measurements, prototype, plan) |

### Operations

Running the live service. The deploy runbooks are in `deploy/`, listed below.

| Document | Read it for |
| :--- | :--- |
| [social_posts.md](operations/social_posts.md) | Welcome posts on VoxelVenture's X account for owners who opt in: the text, the review queue, the settings and how visits from a post are counted |
| [hosting_stack_payments.md](operations/hosting_stack_payments.md) | Going live: why the server stays on Node, the Linode setup, why Stripe was chosen (now built: [billing.md](monetization/billing.md)), and the owner dashboard |

### Competitive research

Strategy reviews and the idea documents (inputs, not status reports).

| Document | Read it for |
| :--- | :--- |
| [claimavenue_competitive_alignment_review.md](competitive-research/claimavenue_competitive_alignment_review.md) | **The current plan.** How the project compares with the recommended commercial strategy, the critical gaps, and the six-phase implementation sequence |
| [voxelventure_idea_01.md](competitive-research/ideas/voxelventure_idea_01.md) | The strategic differentiation plan (what is built is in community.md) |
| [02](competitive-research/ideas/voxelventure_idea_02.md), [03](competitive-research/ideas/voxelventure_idea_03.md), [04](competitive-research/ideas/voxelventure_idea_04.md), [05](competitive-research/ideas/voxelventure_idea_05.md), [06](competitive-research/ideas/voxelventure_idea_06.md) | The other idea documents: 02 search pages, city history, embeds and soundscapes; 03 Python vs .NET and OpenStreetMap street names; 04 ClaimAvenue's builder and a modern one; 05 a server-timed day and night; 06 a living city instead of ad space (each reviewed in ideas_review.md) |
| [VoxelVenture_Competitive_Strategy_Viral_Monetization.md](competitive-research/VoxelVenture_Competitive_Strategy_Viral_Monetization.md) |  |
| [competitive_strategy_implementation_audit_2026-10-16.md](competitive-research/competitive_strategy_implementation_audit_2026-10-16.md) |  |
| [voxelventure_core_concept_reassessment_2026-10-17.md](competitive-research/voxelventure_core_concept_reassessment_2026-10-17.md) |  |

### Brand

The Voxel Venture logos: which to use where, and the asset files.

| Document | Read it for |
| :--- | :--- |
| [logo_usage_guide.md](brand/logo_usage_guide.md) | **The logo family and how to use it:** the horizontal corporate lockup (official logo), the Double-V monogram (compact mark), the City Gateway badge (promotional), placement, sizes, colours, accessibility |
| [brand/README.md](brand/README.md) | The brand asset files in `apps/web/public/brand/`, what each one is for, and what is still to prepare (icons, vector masters) |

### Licences

Evidence for third-party material.

| Document | Read it for |
| :--- | :--- |
| [licences/music/README.md](licences/music/README.md) | The recorded music: sources and CC0 evidence |

### Runbooks and READMEs outside docs/

Kept beside the code or service they describe.

| Document | Read it for |
| :--- | :--- |
| [../deploy/README.md](../deploy/README.md) | The deployment runbook and files (Caddy, systemd, settings, backups) for a Linode. Production runs on it: voxelventure.app since 2026-10-17. From Windows: `deploy/push.ps1` |
| [../deploy/STRIPE_LIVE.md](../deploy/STRIPE_LIVE.md) | Going live with payments: the checklist from test mode on staging to the first real payment, the live key and webhook, and the emergency switch |
| [../deploy/STAGING.md](../deploy/STAGING.md) | Staging beside production: releases with a rollback, the business journeys against it, restoring a production backup, Stripe test mode, and the rehearsal log |
| [../services/messaging/README.md](../services/messaging/README.md) | The Python messaging service: running it, its settings, how it talks to Node, moving the data, its tests |
| [../scripts/study/README.md](../scripts/study/README.md) | The scripts that produced the study's numbers |
| [../services/multiplayer/README.md](../services/multiplayer/README.md) | The multiplayer / monitor server: settings, endpoints, the error log |
| [../CREDITS.md](../CREDITS.md) | Who made the models, map data and code the game uses, their licences, and the rules for adding anything from outside (the in-game Credits panel shows the same list) |
| [The business journeys](../tests/journeys/README.md) | Track A of the adoption plan, the four milestone journeys, how to run them (including against staging) and how to read a failure. |
| [../packages/README.md](../packages/README.md) | the shared packages, with [shared-types](../packages/shared-types/README.md) (the contracts), [analytics](../packages/analytics/README.md) and [business-core](../packages/business-core/README.md). |

