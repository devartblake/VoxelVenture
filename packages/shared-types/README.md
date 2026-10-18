# @voxelventure/shared-types

Versioned contracts for the shapes that cross a boundary: the browser, the Node API, the presence server and the Python messaging service. It also holds the enums they share and a small validator. It depends on nothing.

```js
import { check, PURCHASE_REPORT, TRAFFIC_SOURCES } from '../../packages/shared-types/src/index.js';
check(PURCHASE_REPORT, body); // { ok, errors: ['$.value: below 0', ...] }
```

## Contracts

Each contract is `{ id, version, schema }`. The schema is plain JSON in a JSON-Schema subset: `type` (one or a list), `enum`, `pattern`, `minLength`/`maxLength`, `minimum`/`maximum`, `required`, `properties`, `additionalProperties` (`false`, or a schema for every other key's value), `propertyNames`, `maxProperties`, `items`, `prefixItems`, `minItems`/`maxItems`, `anyOf`. Another language can read the same schema with a standard JSON-Schema library.

| Id | Version | What | Made by | File |
| --- | --- | --- | --- | --- |
| `business.profile-event` | 1 | A page's report about a visitor: `view`, `engaged`, `store`, `cta` (with a click id) | Browser → `POST /businesses/<slug>/events` | [`contracts/business.js`](src/contracts/business.js) |
| `business.profile-event.result` | 1 | `{ counted, verified }` | API | same |
| `business.purchase-report` | 1 | `{ business, click?, value?, order? }` from the business's own server. The key goes in `Authorization: Bearer`, never in the body. | Business server → `POST /conversions` | same |
| `business.purchase-report.result` | 1 | `{ recorded, attributed?, duplicate?, reconciled? }` | API | same |
| `business.owner-figures` | 1 | The verified funnel (impressions → views → qualified → store entries → button presses), the four outcome families with their own cost, revenue (verified, unattributed, pixel-only), spend, return on spend, and on Pro the breakdowns by source and campaign | `GET /me/businesses` → `profiles[].stats` | same |
| `business.inquiry` | 1 | A meeting or quote request from a profile's form. `website` is the hidden field for robots and must be empty. | Browser → `POST /businesses/<slug>/inquiries` | [`contracts/business.js`](src/contracts/business.js) |
| `business.inquiry.result` | 1 | `{ sent, id? }` | API | same |
| `pilot.feedback` | 1 | `{ rating (1-5), wouldPay (yes, maybe or no), result?, missing? }` | Owner → `POST /businesses/<slug>/pilot-feedback` | [`contracts/pilot.js`](src/contracts/pilot.js) |
| `pilot.summary` | 1 | The pilot dashboard: weeks, totals, the verdict on the five criteria, and each business week by week | `GET /admin/pilot` | same |
| `business.coupon-claim` | 1 | `{ visitor? }`: a visitor claims a 3D storefront's coupon | Browser → `POST /plots/<id>/coupon` | [`contracts/business.js`](src/contracts/business.js) |
| `business.coupon-claim.result` | 1 | `{ code, ticket, already, left }` | API | same |
| `business.coupon-redeem` | 1 | `{ ticket }`: the owner marks a claim used | Owner → `POST /plots/<id>/coupon/redeem` | same |
| `business.coupon-redeem.result` | 1 | `{ redeemed, ticket, claimedAt }` | API | same |
| `business.purchase-pixel` | 1 | The pixel's query `{ business, click?, value?, order? }`, as strings. It never carries a key | A business's thank-you page → `GET /conversions/pixel.gif` | same |
| `community.weekly-vote` | 1 | Building of the Week: the player's votes (one a week, a second for finding the gold stars), the top five, last week's winner, when voting closes | `GET /votes`, `POST /vote` | [`contracts/community.js`](src/contracts/community.js) |
| `interior.design` | 1 | An owner's redesigned interior: the scene graph (`nodes` by id, one building in `rootNodeIds`), only the node types an interior uses, furniture by catalogue id (`asset: { id }`) and never by file URL | Stored by the API, inside `interior.state` and `interior.save` | [`contracts/interior.js`](src/contracts/interior.js) |
| `interior.state` | 1 | `{ plotId, version, design, revision, updatedAt }`: the design every visitor sees, or `design: null` for the generated interior | `GET /plots/<id>/interior`, and the answer to `PUT` and `DELETE` | same |
| `interior.save` | 1 | `{ design, revision }`: the owner publishes a design based on the revision they loaded; an older one gets 409 | Owner → `PUT /plots/<id>/interior` | same |

[`tests/contracts.test.mjs`](../../tests/contracts.test.mjs) starts the API and checks its real requests and answers against these contracts.

## The presence protocol

The WebSocket messages between the game (`lib/net/multiplayer.js`) and the presence server (`services/multiplayer/server.mjs`), protocol 2 ([ADR 0004](../../docs/architecture/adr/0004-presence-protocol-contracts.md)):

| Export | What |
| --- | --- |
| `PRESENCE_CLIENT` | What a game sends: `hello`, `auth`, `auth.clear`, `state`, `parked`, `profile`, `chat.send`, `chat` (the old form), `perf`, `error` |
| `PRESENCE_SERVER` | What the server sends: `welcome`, `snapshot`, `online`, `parked`, `profile`, `world`, `chat`, `chat.accepted`, `chat.rejected`, `inbox.changed`, `auth.ok`, `auth.failed`, `auth.revoked`, `invalid`, `protocol.unsupported` |
| `PRESENCE_PROTOCOL` | 2, the protocol's version: the server's `PROTOCOL` comes from here |
| `presenceContract(from, message)` | The contract of a message (`from` is `'client'` or `'server'`), or `null` if its type is not in the protocol |

- **Checked strictly:** `hello`, `auth` and `auth.clear` (`strict: true`) are checked by the server as they arrive.
- **Clamped:** the other client messages keep the server's field-by-field clamping.
- **Tested:** the golden examples are in `tests/fixtures/presence-v2.json`. `tests/presence-contracts.test.mjs` and `tests/messaging.test.mjs` hold the real traffic to the contracts.

## Test scenarios

`TEST_SCENARIO` (`test.scenario`, version 1, [`contracts/test-scenario.js`](src/contracts/test-scenario.js)) is the shape of a business journey's scenario: the seed, the device, the participants, the starting accounts and businesses, the milestones in order, the timeout, the allowed links and the budgets. The scenarios are in [`tests/fixtures/deterministic-pilot-city.mjs`](../../tests/fixtures/deterministic-pilot-city.mjs), and [`tests/journeys/`](../../tests/journeys/README.md) runs them. A scenario has no place for a password or a token, and its links must use the example domains. `TEST_SCENARIO` is in `CONTRACTS` but not in `API_CONTRACTS`, because it never travels over the wire.

## Enums

| Name | Values | Must equal |
| --- | --- | --- |
| `TRAFFIC_SOURCES` | `direct search social referral city x` | `SOURCES` in `services/api/business.mjs` |
| `PROFILE_EVENT_KINDS` | `view engaged store cta` | `EVENT_KINDS` in `services/api/business.mjs` |
| `OUTCOME_FAMILIES` | `leads claims redemptions purchases` | the ids of `OUTCOMES` in `@voxelventure/analytics` |
| `PURCHASE_REPORTS` | `server browser` | the `report` column of `business_events` |

The contract test fails if any of these drift apart.

## Versioning

| Change | Version |
| --- | --- |
| Add an optional field, or allow more values | Stays the same |
| Remove, rename or narrow a field | New version; keep the old one until no client sends or reads it |

Every version change goes in [CHANGELOG.md](CHANGELOG.md).
