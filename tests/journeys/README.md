# Business journeys

These tests walk through what a pilot business and its visitors actually do, from start to finish, as a series of business milestones. They are Track A of the [adoption plan](../../docs/architecture/external_voxel_repositories_adoption_plan.md) (section 6.6).

| Journey | Milestones | What it walks through |
| --- | --- | --- |
| [`visitor-discovery-to-storefront`](visitor-discovery-to-storefront.test.mjs) | 9 | A visitor finds a business on Discover, opens its profile and becomes a qualified visit. They press its call to action, follow the deep link into the 3D city and step into its storefront. Each step is counted once |
| [`merchant-onboarding`](merchant-onboarding.test.mjs) | 10 | A merchant signs up, creates a free profile, claims a lot and links the building. They change the call to action and set a coupon; an offer on the free plan asks for Pro. Then they see the dashboard and its figures and answer the pilot check-in |
| [`reconnect-and-recovery`](reconnect-and-recovery.test.mjs) | 15 | Two signed-in players meet, chat, drop their connection and come back, and no player or line is duplicated. The presence server is also sent stale protocols, spent tickets, malformed input, floods and a slow receiver |
| [`attribution-deduplication`](attribution-deduplication.test.mjs) | 7 | One visitor's view, press and purchase are each counted once. This holds however often the page, the pixel and the business's server report them |

## Running them

```sh
npm run test:journeys                                  # all four
node tests/journeys/merchant-onboarding.test.mjs      # one
```

By default, a journey starts its own API, presence server and web app on free ports, with an in-memory database. It builds the production app the first time, then reuses the build while nothing that goes into it changes. `npm test` runs the journeys too.

**Against staging (or any running stack):**

```sh
JOURNEY_WEB_URL=https://staging.example.com JOURNEY_API_URL=https://api.staging.example.com \
JOURNEY_MP_URL=wss://mp.staging.example.com JOURNEY_ALLOW_WRITES=1 npm run test:journeys
```

- **`JOURNEY_ALLOW_WRITES=1`** is required because the journeys create accounts and businesses there.
- **`JOURNEY_ADMIN_TOKEN`** enables the operator's pilot milestones. Without it, they are reported as skipped.

## Reading a result

A journey ends in one of four ways:

| Result | Meaning | Exit |
| --- | --- | --- |
| `passed` | Every milestone was reached | 0 |
| `PRODUCT REGRESSION at "<milestone>"` | The product did something wrong: a figure, a page or an answer | 1 |
| `RENDERING FAILURE at "<milestone>"` | The 3D city did not draw (for example, no WebGL or no first frame in time). This is not a product bug | 1 |
| `SKIPPED (environment)` | This machine cannot run the journey: no browser, no stack, or a port in use | 0, or 1 with `JOURNEY_STRICT=1` (CI sets it) |

Each run writes `artifacts/journeys/<journey>/`:

- `report.json`: each milestone with its status and time, and the verdict;
- `run.log`;
- each page's console;
- a screenshot of each open page, when the journey fails.

Session tokens, tickets, conversion keys, emails and passwords are redacted before anything is written. CI uploads the folder when a check fails.

## Writing one

- **The scenario** goes in [`tests/fixtures/deterministic-pilot-city.mjs`](../fixtures/deterministic-pilot-city.mjs), in the shape of the `test.scenario` contract (`packages/shared-types`). It holds the seed, the participants, the accounts and businesses, the milestones in order and the budgets. There are no passwords in it: the agents derive test passwords from the seed. Links use the example domains.
- **The journey** goes in this folder, named after the scenario's `id`. It calls `runJourney(scenario, { needs }, async (j) => { ... })` and wraps each milestone in `j.step('<milestone id>', ...)`. Use the agents in [`tests/agents/`](../agents/):
  - `openBrowser` for a page;
  - `merchantAgent` and `operatorAgent` for the API;
  - `presenceAgent` for the presence server.
- **Check what a person would see.** Production pages have no diagnostic handles unless they are opened with `?diag=1`, so check the visible page, the API's answers or the protocol's messages.

[`tests/journey-runner.test.mjs`](../journey-runner.test.mjs) checks three things: that the scenarios fit their contract, that every scenario has a journey, and that failures are reported by milestone and kind.
