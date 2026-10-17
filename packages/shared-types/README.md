# @voxelventure/shared-types

Versioned contracts for the shapes that cross a boundary: the browser, the Node API, the presence server and the Python messaging service. It also holds the enums they share and a small validator. It depends on nothing.

```js
import { check, PURCHASE_REPORT, TRAFFIC_SOURCES } from '../../packages/shared-types/src/index.js';
check(PURCHASE_REPORT, body); // { ok, errors: ['$.value: below 0', ...] }
```

## Contracts

Each contract is `{ id, version, schema }`. The schema is plain JSON in a JSON-Schema subset: `type` (one or a list), `enum`, `pattern`, `minLength`/`maxLength`, `minimum`/`maximum`, `required`, `properties`, `additionalProperties: false`, `items`, `minItems`/`maxItems`. Another language can read the same schema with a standard JSON-Schema library.

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

[`tests/contracts.test.mjs`](../../tests/contracts.test.mjs) starts the API and checks its real requests and answers against these contracts.

## Enums

| Name | Values | Must equal |
| --- | --- | --- |
| `TRAFFIC_SOURCES` | `direct search social referral city x` | `SOURCES` in `server/api/business.mjs` |
| `PROFILE_EVENT_KINDS` | `view engaged store cta` | `EVENT_KINDS` in `server/api/business.mjs` |
| `OUTCOME_FAMILIES` | `leads claims redemptions purchases` | the ids of `OUTCOMES` in `@voxelventure/analytics` |
| `PURCHASE_REPORTS` | `server browser` | the `report` column of `business_events` |

The contract test fails if any of these drift apart.

## Versioning

| Change | Version |
| --- | --- |
| Add an optional field, or allow more values | Stays the same |
| Remove, rename or narrow a field | New version; keep the old one until no client sends or reads it |

Every version change goes in [CHANGELOG.md](CHANGELOG.md).
