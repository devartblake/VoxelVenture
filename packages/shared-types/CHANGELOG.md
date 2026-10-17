# Changelog: @voxelventure/shared-types

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
