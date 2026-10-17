# Changelog: @voxelventure/shared-types

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
