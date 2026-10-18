# World-expansion freeze

Status: **in force from 2026-10-16.** Phase 1 of the [competitive alignment review](../competitive-research/claimavenue_competitive_alignment_review.md#recommended-implementation-sequence).

When the freeze began, the 3D city was far ahead of the business it is meant to support: there was no working payment, no subscription, no referral attribution and no public business page. (All of these now exist: phases 2 to 5, [alignment_status.md](alignment_status.md).) Until the commercial loop is proven, the world stops growing. The world is kept healthy, but nothing new is added to it.

## What is frozen

No new:

- Roads, road classes, districts, landmarks, terrain, water or land (coast, island, ocean, port, mountains, more infill).
- Vehicles, boats, planes, animals, walkers or other simulation systems.
- Environmental and visual effects (lighting, weather, sound zones, decorative props).
- Large visual features and asset pipelines (new Kenney/MagicaVoxel/Blockbench imports, model scripts).
- Game-economy mechanics built on scarcity: new takeover rules, Gold sinks, virtual-currency features.
- Multiplayer scale-out beyond the current single presence server.

These tasks in [tasks.md](tasks.md) are **deferred** until the freeze lifts: 9-12, 14-17 (the bigger authored world), 22 and priority 13 (curved sites), 31 (more 3D assets), 34 (scene streaming), priority 7's "left" items (multi-server presence, guestbooks), priority 9 (creator marketplace) and the open "To do" notes on day and night, sound, boats, piers and the amusement park.

Outside music (task 39) was explicitly requested by the user on 2026-10-16 and added within the existing sound zones. This is a scoped exception; the broader world-expansion freeze remains in force. See the [music provenance record](../licences/music/README.md).

**Walking inside a storefront** was explicitly requested by the user on 2026-10-17. The visitor's own avatar is shown in the interior viewer, and a tap walks it round the furniture. It is a scoped exception, kept to the storefront:
- **Commercial tie-in:** walking up to an offer (the offer desk, video wall, game cabinet or visit reward) lights it in the storefront panel.
- **What it reuses:** it adds no new models and no simulation beyond the visitor's own avatar. It uses the city's avatar model, its Wardrobe colours and its walk planner.
- **Where it lives:** `lib/content/interiorWalk.js` and `apps/web/components/interior/RoomWalker.jsx`, tested by `tests/interior-walk.test.mjs` and the browser test.

## What continues

- **Stability:** crash fixes, saved-game and data-loss fixes, console errors (tasks 29, 30, 32, 37).
- **Performance:** frame rate, draw calls and memory on real phones (tasks 25, 35).
- **Accessibility:** keyboard and touch control, contrast, reduced motion, screen-reader labels, and the non-WebGL fallback.
- **Security, privacy and moderation**, including chat launch checks (tasks 40-42).
- **Commercial surfaces that happen to live in the world:** sponsored-placement labels on billboards and banners, the "Sponsored" marker on a featured building, lease rules, conversion kiosks inside storefronts, market-stall booking. These serve the funnel, not the world.
- **Dependency upgrades** (task 38).

When in doubt: if the change helps a business get found, convert a visitor, measure a result or pay, it continues. If it makes the world bigger or prettier, it waits.

## The check

`npm run check:freeze` compares the branch with `origin/main` (or `--base <ref>`) and fails when a **new file** is added under a frozen folder:

`lib/city/`, `lib/sim/`, `apps/web/components/city/`, `scripts/models/`, `scripts/streets/`, `scripts/study/`, `apps/web/public/models/`

Edits to existing files in those folders pass, so fixes and tuning are never blocked.

A file **moved** (renamed) from a world folder is the same world file in a new place, so it is not flagged either. That includes moves from where the folders were before Phase C, `components/city/` and `public/models/` ([ADR 0003](../architecture/adr/0003-apps-and-services.md)). A copy is flagged.

The folder list lives in `lib/dev/worldFreeze.js`; the check is tested by `tests/world-freeze.test.mjs`.

**Exceptions.** Work from the "continues" list sometimes needs a new file in a frozen folder (a sponsored-label mesh in `apps/web/components/city/`, a performance split of a large component). Add this line to one of the branch's commit messages:

```
World-freeze-exception: sponsored label on billboards (phase 2 funnel)
```

The reason is printed by the check, so it shows in CI and in review. For a local run, `WORLD_FREEZE_EXCEPTION="<why>" npm run check:freeze` does the same.

CI runs it on every pull request that changes more than documentation (`.github/workflows/ci.yml`). The check is a reminder, not a gate on judgement: a frozen feature written into an existing file still breaks the freeze. Reviewers should ask the question in the pull-request template.

## When it lifts

The freeze ends when the constrained pilot (phase 6 of the review) meets its success criteria:

- At least 30% of participating businesses return weekly.
- At least 20% receive a meaningful CTA interaction.
- At least three businesses pay.
- At least two renew or request another campaign.
- No simulated advertiser metrics are shown.

The pilot dashboard checks these criteria on verified figures: `/admin/pilot`, or `npm run moderate -- pilot` ([pilot.md](../monetization/pilot.md)).

At that point the deferred tasks above return to the backlog in the review's P2 order (authored world content, then vehicles and environmental systems, the creator marketplace, multiplayer scale, and advanced resale or takeover mechanics after legal review). Remove the folder list from `lib/dev/worldFreeze.js` (or delete the check) in the same change that records the decision here.

## What comes next

Update, 2026-10-17: phases 2 to 5 are done in code ([alignment_status.md](alignment_status.md)). Next is the phase 6 pilot, whose results decide when the freeze lifts (see above). The original plan for phase 2 follows.

Phase 2 builds the business-first funnel on top of what already exists (directory, dashboard, deep links, leases): free business profiles, public indexable pages (`/discover`, `/business/[slug]`, `/district/[slug]`, `/category/[slug]`), CTA selection, referral attribution, owner onboarding and value-linked upgrade prompts. The engineering backlog (P0, P1) is in the [review](../competitive-research/claimavenue_competitive_alignment_review.md#immediate-engineering-backlog).
