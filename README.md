# VoxelVenture

VoxelVenture is a 3D voxel city where businesses claim a building, and a business directory with fast public pages that work without 3D. Owners list a business for free and get:

- a public page with one clear call to action
- verified visitor figures
- paid upgrades through Stripe (a Launch Pack, Pro, and sponsored placements)

In the city, plots are leased (paid through Stripe when it is set up), a business whose lease has ended can be taken over under the game's 1.25x rule, and a pop-up market rents stalls.

## Where it stands (2026-10-17)

Phases 1 to 5 of the [competitive alignment review](docs/claimavenue_competitive_alignment_review.md) are done in code. They are, in order:

1. The world-expansion freeze.
2. The business-first funnel.
3. Authoritative server data.
4. Stripe payments.
5. Conversion measurement.

Still to do: going live (host and domain, the Stripe account, the terms, a mail service), then a pilot with 10 to 20 businesses (phase 6). The item-by-item status is in [docs/alignment_status.md](docs/alignment_status.md), and the full list in [docs/tasks.md](docs/tasks.md).

## Run it

```sh
npm install
npm run dev          # the city and the public pages on http://localhost:3000 (single player, everything local)
npm run api          # the API server on :3002; set NEXT_PUBLIC_LIVE_API_URL=http://localhost:3002 for the live, shared game
npm run mp           # the presence server (avatars, chat, instant updates) on :3001
npm test             # the test suites (npm run test:browser for the real-browser test, which needs a GPU)
npm run lint
```

Payments switch on with Stripe keys: see [docs/billing.md](docs/billing.md). Deployment is described in [deploy/README.md](deploy/README.md).

## Documentation

Start with [docs/overview.md](docs/overview.md). Every document is listed in [docs/README.md](docs/README.md).
