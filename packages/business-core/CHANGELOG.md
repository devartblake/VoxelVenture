# Changelog: @voxelventure/business-core

## 0.4.0 (2026-10-18)

- `PRO_PLOT_DISCOUNT` (0.15): an account with Pro on any of its business profiles pays 15% less for a plot lease in the 3D city (a claim, a take-over and a renewal). `lib/game/leases.js` applies it; the server decides who has Pro.
- Pro's pitch says so.

## 0.3.0 (2026-10-17)

- A workspace of the root `package.json`: import it by name (`@voxelventure/business-core`).
- The old `lib/business/` adapters are removed.

## 0.2.0 (2026-10-17)

- Moved `lib/business/profile.js` here with `git mv`. The only change is the explicit `./plans.js` import.
- The old path is now an adapter that re-exports this package.

## 0.1.0 (2026-10-16)

- Moved here from `lib/business/plans.js` with `git mv`, unchanged.
- The old path is now an adapter that re-exports this package.
