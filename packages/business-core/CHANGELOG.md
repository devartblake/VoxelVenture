# Changelog: @voxelventure/business-core

## 0.7.0 (2026-10-24)

Refunds of unused time, pro rata (`src/refunds.js`, [billing.md](../../docs/monetization/billing.md#refunds-of-unused-time)):

- `prorataLine(line, { at, closedForRules })`: what one paid order line gives back (a lease or renewal: unused days ÷ term; an ad space or sponsored week: ÷ 7; Pro: the period paid now; a stall not opened: all; nothing for the Launch Pack, upgrades, free, refunded, disputed or charged-back lines, or a rule-breaking closure), rounded down, nothing under `PRORATA.minCents` (100).
- `prorataPlan(lines, opts)`, `monthPeriod(end, startedAt)`, `PRORATA` (`minCents`, `weekDays`, `adDays`, `stripeFeeDeducted: false`), `PRORATA_KINDS`.

## 0.6.0 (2026-10-21)

Ad spaces are paid, with the Pro discount ([billing.md](../../docs/monetization/billing.md#ad-spaces)):

- `AD_SPACES`: a billboard $12 and an aerial banner $29, each for 7 days; `adPriceOf(kind, { pro })`.
- `PRO_DISCOUNT` (0.15): the one Pro discount, on plot leases and ad spaces. `PRO_PLOT_DISCOUNT` is the same constant, kept for the lease code.
- The promo group `ads` (the cart kind `ad`). Pro's pitch names ad spaces.

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
