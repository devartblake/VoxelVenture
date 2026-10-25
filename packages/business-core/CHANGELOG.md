# Changelog: @voxelventure/business-core

## 0.6.0 (2026-10-25)

- `PRO_FIELDS` adds `surfaces`: the owner's breakdown by screen is Pro, like sources, campaigns and the daily chart.
- `isRefCode` also accepts the new random referral codes (`r` and 12 hex characters), which do not show the account. The old `<id>.<signature>` codes are still accepted.
- Three more calls to action, each with a `field`: `call` (a phone number, kept as a `tel:` link), `email` (an address, kept as `mailto:`) and `directions` (a street address, kept as a Google Maps directions link). `ctaLink(field, typed)` makes the link, or returns null when the input is not valid. `ctaInputOf(cta)` gives back what was typed, for the edit form.

## 0.5.0 (2026-10-19)

Promo codes (`src/promo.js`, [billing.md](../../docs/monetization/billing.md#promo-codes)), shared by the server and the pages:

- `PROMO_GROUPS` (`plots`, `outside`, `launch`, `pro`, `sponsored`, `market`, each with the purchase kinds in it), `PROMO_GROUP_IDS`, `promoGroupOf(kindOrProduct, action?)`, `groupsOf(appliesTo)`.
- `promoDiscount(promo, lines)`: what a code takes off a checkout's lines, on the eligible lines only (after the Pro and renewal discounts), never leaving less than `STRIPE_MIN_CENTS` (50) to pay except nothing.
- `normalizeCode`, `PROMO_CODE_RE`, `PROMO_ALPHABET` (generated codes), `PROMO_KINDS`, `promoLabel`.

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
