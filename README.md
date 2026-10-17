# VoxelVenture

VoxelVenture is a 3D voxel city where businesses claim a building, and a business directory with fast public pages that work without 3D. Owners list a business for free and get:

- a public page with one clear call to action
- verified visitor figures
- paid upgrades through Stripe (a Launch Pack, Pro, and sponsored placements)

In the city, plots are leased (paid through Stripe when it is set up), a business whose lease has ended can be taken over under the game's 1.25x rule, and a pop-up market rents stalls.

## Where it stands (2026-10-17)

Phases 1 to 5 of the [competitive alignment review](docs/competitive-research/claimavenue_competitive_alignment_review.md) are done in code. They are, in order:

1. The world-expansion freeze.
2. The business-first funnel.
3. Authoritative server data.
4. Stripe payments.
5. Conversion measurement.

Since then:

- per-business conversion keys, and outcomes reported by family;
- a reworked Building of the Week vote;
- draft policies at `/legal` (not yet approved);
- `CODEOWNERS`;
- the documentation sorted by topic;
- the shared packages (`packages/`): prices, plans, profile rules and the conversion funnel, with versioned contracts the API is tested against;
- the pilot dashboard (`/admin/pilot`) and a weekly check-in for pilot businesses;
- network addresses kept only scrambled, and take-over emails that say the payout is game value;
- click-to-walk that finds its way round buildings;
- a SimCity-style soundtrack of 16 CC0 recordings that the camera's zoom no longer interrupts;
- district street names for the Meadow Quarter's streets.

Still to do:

- going live: host and domain, the Stripe account, policy approval, a mail service;
- then the pilot with 10 to 20 businesses (phase 6), measured on the pilot dashboard. The item-by-item status is in [docs/roadmap/alignment_status.md](docs/roadmap/alignment_status.md), and the full list in [docs/roadmap/tasks.md](docs/roadmap/tasks.md).

## Run it

```sh
npm install
npm run dev          # the city and the public pages on http://localhost:3000 (single player, everything local)
npm run api          # the API server on :3002; set NEXT_PUBLIC_LIVE_API_URL=http://localhost:3002 for the live, shared game
npm run mp           # the presence server (avatars, chat, instant updates) on :3001
npm test             # the test suites (npm run test:browser for the real-browser test, which needs a GPU)
npm run lint
```

Payments switch on with Stripe keys: see [docs/monetization/billing.md](docs/monetization/billing.md). Deployment is described in [deploy/README.md](deploy/README.md).

## Layout

| Folder | What is in it |
| --- | --- |
| `app/`, `components/` | The Next.js app: the 3D city (`/`) and the public business pages (`app/(public)`: Discover, business, category and district pages, `/legal`) |
| `lib/` | Rules shared by the game, the pages and the server, loaded by the server through `scripts/lib-loader.mjs` |
| `packages/` | Pure shared packages with versioned contracts ([packages/README.md](packages/README.md)) |
| `server/` | The Node API (`server/api/`, SQLite) and the presence server (`server/multiplayer.mjs`) |
| `services/messaging/` | The Python (FastAPI) messaging service, not switched on yet |
| `tests/` | `node tests/run.mjs`; CI picks the suites a change needs (`scripts/select-checks.mjs`) |
| `deploy/` | Caddy, systemd units, settings templates, setup and backup scripts, the runbook |

## Documentation

Start with [docs/product/overview.md](docs/product/overview.md). Every document is listed in [docs/README.md](docs/README.md).
