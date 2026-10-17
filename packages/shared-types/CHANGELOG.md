# Changelog: @voxelventure/shared-types

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
