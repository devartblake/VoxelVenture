# Changelog: @voxelventure/shared-types

## 0.8.0 (2026-10-18)

Plot leases are short and priced per 30 days (`lib/game/leases.js`, `lib/game/landPrice.js`; [plot pricing](../../docs/monetization/plot_pricing_scenarios.md)):

- `LEASE_TERMS` (enum): the lease terms in days are now `7 14 30`. The 90-, 182- and 365-day terms are gone; a stored lease of one of them renews for 30 days.
- `plot.exterior-quote`: same shape (version 1), but `before`, `after` and `diff` are now the outside's price for 30 days, not for a year.
- A plot's `value` is now its price for 30 days. The lease quotes of `lib/game/claimPrice.js` call that figure `period` (it was `year`) and carry the Pro discount as its own line (`discount`). These quotes are worked out on both sides from the same module and are not a contract.
- `GET /me` (and the account in the sign-in answers) carries `pro`: one of the account's business profiles has Pro, so its plot leases cost 15% less.

## 0.7.0 (2026-10-18)

A building's outside has real prices: the basic outside is free, a more elaborate one is paid for the rest of the lease (`services/api/core.mjs` `upgradeExterior`, `lib/game/claimPrice.js` `exteriorChangeQuote`). New contracts, all version 1:

- `plot.exterior-quote`: what changing the outside costs: `{ before, after, diff, charge, lines }`. The 402 `exterior_payment_required` answer to `PATCH /plots/:id` carries it as `quote`.
- `plot.exterior-upgrade`: the body of `POST /plots/:id/exterior`: `{ exterior }`.
- `plot.exterior-upgrade.result`: its answer: `{ plot, paid }`, or `{ checkout }` with payments on.
- `API_CONTRACTS` now holds 21.
- `LEASE_TERMS` (enum): the lease terms in days, `90 182 365` (3, 6 and 12 months). The 30-day term is gone.

No existing contract changed.

## 0.6.0 (2026-10-18)

Redesigned interiors are kept on the server (`services/api/interiors.mjs`). New contracts, all version 1:

- `interior.design`: an owner's design as the server stores and serves it: the Pascal scene graph of the building's inside (`nodes` by id, one building in `rootNodeIds`), with only the node types an interior uses and each item's furniture by catalogue id (`asset: { id }`), never by file URL.
- `interior.state`: `GET /plots/:id/interior`, and the answer to `PUT` and `DELETE`: the design (or `null` for the generated interior), its `revision` and when it was saved.
- `interior.save`: the body of `PUT /plots/:id/interior`: the design and the revision it was based on.
- `API_CONTRACTS` now holds 18.
- The validator gained `additionalProperties` as a schema (what every other key's value must fit), `propertyNames` and `maxProperties`, all standard JSON Schema.

No existing contract changed.

## 0.5.0 (2026-10-17)

- `TEST_SCENARIO` (`test.scenario`, version 1): a journey scenario, as the business journeys in `tests/journeys/` use it (Track A of the [adoption plan](../../docs/architecture/external_voxel_repositories_adoption_plan.md)). It records the seed, the device, the participants, the starting accounts and businesses, the milestones in order, the timeout, the allowed links and the budgets. It has no place for a password or a token, and its links must use the example domains (RFC 2606). It is in `CONTRACTS`, but not in `API_CONTRACTS`: nothing travels over the wire in this shape.

## 0.4.0 (2026-10-17)

The presence protocol, protocol 2, as contracts ([ADR 0004](../../docs/architecture/adr/0004-presence-protocol-contracts.md)):

- `PRESENCE_CLIENT`: 10 message types a game sends, `presence.client.<type>`. `hello`, `auth` and `auth.clear` are marked `strict`: the server checks them on arrival.
- `PRESENCE_SERVER`: 15 message types the server sends, `presence.server.<type>`. Two are new: `invalid` (a `hello` that does not fit) and `protocol.unsupported` (a `hello` in another version).
- `PRESENCE_PROTOCOL` (2): the server's protocol number now comes from here.
- `presenceContract(from, message)`: finds the contract of a message.
- `API_CONTRACTS`: the 15 API contracts. `CONTRACTS` now holds those and the presence ones.
- The validator gained `prefixItems` (fixed-position arrays) and `anyOf`, both JSON Schema 2020-12.

No existing message changed shape, so protocol-2 clients keep working.

## 0.3.0 (2026-10-17)

New contracts, all version 1:

- `business.coupon-claim` and `business.coupon-claim.result`;
- `business.coupon-redeem` and `business.coupon-redeem.result`;
- `business.purchase-pixel`: the pixel's query, with no key.

## 0.2.0 (2026-10-17)

New contracts, all version 1, written from what the API accepts and answers today:

- `business.inquiry` and `business.inquiry.result`: a meeting or quote request;
- `pilot.feedback`: the merchant's weekly check-in;
- `pilot.summary`: the admin's pilot dashboard.

## 0.1.0 (2026-10-16)

The first contracts, written from what the API sends and accepts today; no behaviour changed. All six are version 1:

- `business.profile-event`
- `business.profile-event.result`
- `business.purchase-report`
- `business.purchase-report.result`
- `business.owner-figures`
- `community.weekly-vote`

Also added:

- enums: `TRAFFIC_SOURCES`, `PROFILE_EVENT_KINDS`, `OUTCOME_FAMILIES`, `PURCHASE_REPORTS`;
- the validator: `validate(schema, value)` and `check(contract, value)`.
