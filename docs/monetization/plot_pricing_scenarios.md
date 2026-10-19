# Plot pricing: the real price levels

[Monetization](README.md) | [Land prices: the analysis](pricing_analysis.md) | [Billing](billing.md) | [Sales funnel proposal (the decision record)](../product/sales_funnel_proposal.md)

Written for: the owner and anyone setting or reviewing Voxel Venture's prices. The prices on the server before this document were demo figures. The levels below are the real ones, decided on 2026-10-18 ([the proposal](../product/sales_funnel_proposal.md)) and built in `lib/game/landPrice.js`, `lib/game/leases.js`, `lib/content/exteriorPrices.js`, `lib/game/claimPrice.js` and `packages/business-core/src/plans.js` (the Pro discount). They replace the 3/6/12-month terms of #51, which never went live.

The figures cover every plot of the live city (seed 20260101) that can be leased: 805 lots (not Old Town's houses, not the admin headquarters). They were computed with the project's own pricing code, not by hand.

## The decisions

- **Every plot is priced by its value, ordinary plots too.** A plot's worth comes from its tier, its size and its location (frontage, corner, centrality, park, anchor, waterfront).
- **The price is per 30 days, and compressed:** $5 × worth^0.7, never less than $5. A grand lot is worth about 240 plain plots but costs about 46 times as much. Under $20 a price is rounded to the nearest $0.25, from $20 to the nearest dollar (`LAND_PRICING` in `lib/game/landPrice.js`).
- **Leases run 7, 14 or 30 days.** They cost 0.3, 0.55 and 1 × the 30-day price, so a shorter lease costs a little more per day. A lease of an old term (90, 182 or 365 days) renews for 30 days.
- **A take-over costs 1.25 × the business's worth** (its 30-day value), at the term's factor, plus the new tenant's outside.
- **A renewal costs 10% less** than a new lease for the same term (`RENEWAL_DISCOUNT` 0.1, so a renewal pays `RENEWAL_SHARE` 0.9).
- **Renewal window and grace:** only the tenant can renew in the last 7 days of a 14- or 30-day lease (the last 3 days of a 7-day one) and in the 3 grace days after it ends. After that, the plot is open to a take-over.
- **Pro: 15% off plots.** An account with at least one business profile on Pro pays 15% less for a claim, a take-over and a renewal. Outside upgrades and the other products are not discounted.
- **Basic outside items are free; elaborate ones cost a share of the plot's 30-day land price.** Their cost is part of the plot's value, so it counts in renewals and take-overs.
- **Changing the outside after claiming costs the difference for the time left** (minimum $0.50). Changes that cost the same or less apply at once.
- **No charge is below $0.50,** Stripe's minimum.

## The plots

| Tier | Plots | Size (cells) | Area (map units²) | Worth (× a plain ordinary plot) | Location grade A / B / C |
| :--- | ---: | :---: | :---: | :---: | :---: |
| Ordinary | 704 | 1 | 9 (a 3 × 3 lot) | 1.0 – 2.1 (median 1.18) | 56 / 152 / 496 |
| Prime | 70 | 2 – 4 | 19 – 41 | 8.6 – 27.5 (median 11) | 19 / 35 / 16 |
| Luxury | 23 | 6 | 63 | 58 – 111 (median 83) | 6 / 7 / 10 |
| Grand | 8 | 10 | 106 | 198 – 282 (median 239) | 3 / 4 / 1 |

The location grades rank each plot's location among all the city's plots.

## The 30-day price (the land)

| Tier | Range | Median | Share of the city's revenue |
| :--- | :--- | ---: | ---: |
| Ordinary | $5 – $8.50 | $5.50 | 39% |
| Prime | $23 – $51 | $27 | 20% |
| Luxury | $85 – $135 | $110 | 24% |
| Grand | $202 – $260 | $231 | 18% |
| **Whole city** | | | **$10,551.75 every 30 days** |

The median of an even count is the lower of the two middle prices (`summarize` in `lib/game/landPrice.js`), so it is always a real plot's price.

## Lease and take-over prices

Each cell gives the range, with the median in brackets.

| Tier | 7 days | 14 days | 30 days |
| :--- | :--- | :--- | :--- |
| Ordinary | $1.50 – $2.55 ($1.65) | $2.75 – $4.68 ($3.03) | $5 – $8.50 ($5.50) |
| Prime | $6.90 – $15.30 ($8.10) | $12.65 – $28.05 ($14.85) | $23 – $51 ($27) |
| Luxury | $25.50 – $40.50 ($33) | $46.75 – $74.25 ($60.50) | $85 – $135 ($110) |
| Grand | $60.60 – $78 ($69.30) | $111.10 – $143 ($127.05) | $202 – $260 ($231) |

**With Pro (15% off):**

| Tier | 7 days | 14 days | 30 days |
| :--- | :--- | :--- | :--- |
| Ordinary | $1.27 – $2.17 ($1.40) | $2.34 – $3.98 ($2.58) | $4.25 – $7.22 ($4.67) |
| Prime | $5.86 – $13 ($6.88) | $10.75 – $23.84 ($12.62) | $19.55 – $43.35 ($22.95) |
| Luxury | $21.67 – $34.42 ($28.05) | $39.74 – $63.11 ($51.42) | $72.25 – $114.75 ($93.50) |
| Grand | $51.51 – $66.30 ($58.90) | $94.43 – $121.55 ($107.99) | $171.70 – $221 ($196.35) |

**Take-overs** (1.25 × the worth, at the term's factor):

| Tier | 7-day take-over | 14-day take-over | 30-day take-over |
| :--- | :--- | :--- | :--- |
| Ordinary | $1.88 – $3.19 ($2.06) | $3.44 – $5.85 ($3.78) | $6.25 – $10.63 ($6.88) |
| Prime | $8.63 – $19.13 ($10.13) | $15.81 – $35.06 ($18.56) | $28.75 – $63.75 ($33.75) |
| Luxury | $31.88 – $50.63 ($41.25) | $58.44 – $92.81 ($75.63) | $106.25 – $168.75 ($137.50) |
| Grand | $75.75 – $97.50 ($86.63) | $138.88 – $178.75 ($158.81) | $252.50 – $325 ($288.75) |

With Pro, a take-over is 15% less, for example a median prime business for 30 days is $28.69 in place of $33.75. These take-over figures are for a business worth its land. A business whose owner added elaborate outside items is worth more, because that outside is part of its value.

**Cost per day at the median:**

| Tier | 7 days | 14 days | 30 days |
| :--- | ---: | ---: | ---: |
| Ordinary | $0.24 | $0.22 | $0.18 |
| Prime | $1.16 | $1.06 | $0.90 |
| Luxury | $4.71 | $4.32 | $3.67 |
| Grand | $9.90 | $9.07 | $7.70 |

## Renewals

- **Price:** 90% of a new lease of the same term, from the plot with the outside it has now. A lease made under older prices renews at today's.
- **When:** in the last 7 days of a 14- or 30-day lease, the last 3 days of a 7-day lease, and in the 3 grace days after the end. Until the grace days have passed nobody else can take the business over. After that the tenant can still renew, until somebody takes it over.
- **Emails:** one when the renewal window opens (with the renewal price), one when the lease ends (the grace days start) and one when the plot opens to a take-over (`services/api/community.mjs` `sendLeaseNotices`).
- **Once the lease has ended,** the building's inside and outside can't be changed until it's renewed; visitors still see them.

| Tier (median) | 7 days | 14 days | 30 days | 30 days with Pro |
| :--- | ---: | ---: | ---: | ---: |
| Ordinary | $1.49 | $2.73 | $4.95 | $4.21 |
| Prime | $7.29 | $13.37 | $24.30 | $20.65 |
| Luxury | $29.70 | $54.45 | $99 | $84.15 |
| Grand | $62.37 | $114.35 | $207.90 | $176.71 |

## The Pro discount

- **Who:** an account with at least one published business profile on an active Pro entitlement (`planOf` in `@voxelventure/business-core`). The server works this out itself (`services/api/core.mjs` `hasPro`). The browser only shows it, from `pro` on the signed-in account (`GET /me`).
- **What:** 15% off a claim, a take-over and a renewal (`PRO_PLOT_DISCOUNT` in `packages/business-core/src/plans.js`). It is taken off after the term and the renewal discount, to the cent, so a 30-day renewal with Pro is 0.9 × 0.85 = 76.5% of a new lease.
- **Not:** outside upgrades and the other products (Launch Pack, sponsored weeks, market stalls).
- **On screen:** the claim, take-over and renewal forms show the discount as its own line, "Pro: 15% off". Without Pro they show "Pro members get 15% off plots", linking to the upgrade on the business page.
- **Value to the business:** Pro is $19 a month. On 30-day leases the discount alone pays for it only on a grand plot (15% of a $231 lease is $34.65 every 30 days; of a $110 luxury lease, $16.50). For a smaller business it's a reason to choose Pro, not a saving.

## The outside

**Free (basic):**
- the plot's usual number of floors;
- every colour style;
- the owner's own wall colour;
- any building shape;
- no crown, a beacon or a dish.

**Priced (elaborate):** a share of the plot's land price, for 30 days.

| Item | Share of the land price | Ordinary (median $5.50) | Prime ($27) | Luxury ($110) | Grand ($231) |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Each floor above the usual number | 10% | $0.55 | $2.70 | $11 | $23.10 |
| Each floor from the tenth up (extra) | 15% | $0.83 | $4.05 | $16.50 | $34.65 |
| Roof garden | 10% | $0.55 | $2.70 | $11 | $23.10 |
| Glass dome | 20% | $1.10 | $5.40 | $22 | $46.20 |
| Spire | 25% | $1.38 | $6.75 | $27.50 | $57.75 |

**Examples:**
- **Prime plot (median), 3 extra floors and a spire, 30 days:** $27 + $8.10 + $6.75 = **$41.85**.
- **The same plot, 7 days:** 0.3 × that, **$12.56**; 14 days, **$23.02**.
- **With Pro, 30 days:** **$35.57**. The discount is on the whole lease, outside included, because it is part of the lease price.

**A mid-lease upgrade:**
- **What's charged:** the extra 30-day cost × the term's factor × the share of the lease that's left. There is no Pro discount on an upgrade.
- **Example:** two more floors on a median prime plot ($5.40 more per 30 days), halfway through a 30-day lease, costs $5.40 × 1 × 0.5 = **$2.70**. Halfway through a 14-day lease it's **$1.49**, through a 7-day lease **$0.81**.
- **Minimum charge:** $0.50, Stripe's own minimum. A spire on a median ordinary plot with 3 days left of a 7-day lease works out at about $0.18 and is charged **$0.50**. This also stops a large upgrade from being split into many small free steps.
- **Time left:** the whole time still to run is charged, including the extra days of a lease renewed early.
- **Never set up:** a building whose owner never changed the outside starts from the building as it stands, so floors the owner never chose are not charged.

## Revenue if every plot is leased all the time

| Tier | On 7-day leases (per 30 days / per year) | On 14-day leases | On 30-day leases |
| :--- | ---: | ---: | ---: |
| Ordinary | $5,297 / $64,441 | $4,851 / $59,015 | $4,114 / $50,051 |
| Prime | $2,692 / $32,756 | $2,468 / $30,026 | $2,094 / $25,477 |
| Luxury | $3,210 / $39,060 | $2,943 / $35,805 | $2,497 / $30,380 |
| Grand | $2,375 / $28,892 | $2,177 / $26,485 | $1,847 / $22,472 |
| **Whole city** | **$13,574 / ≈ $165,000** | **$12,438 / ≈ $151,000** | **$10,552 / ≈ $128,000** |

These figures are land only, at new-lease prices. Renewals at 10% off lower them: on 30-day leases renewed all year by the same tenants, the city brings in about $116,000. If every tenant had Pro, 30-day leases would bring in about $109,000. Outside upgrades and take-overs raise them. For comparison, the 3/6/12-month levels of #51 brought in about $28,000 a year on 12-month leases.

## What the numbers say

1. **Ordinary plots are 87% of the city and now about 39% of the land revenue.** On the 12-month levels they were 16%: the compressed price lifts the bottom and brings the top down.
2. **The $5 base and the 0.7 exponent are the levers.** Every price scales with the base. The exponent sets how far the top tiers are above an ordinary plot: 1 would price a grand lot at about 240 × $5, 0.7 at about 46 ×. Both are one number in `LAND_PRICING` (`lib/game/landPrice.js`).
3. **Stripe's fee takes a big share of short ordinary leases.** The fee is 30¢ + 2.9%:

   | Tier (median) | 7 days | 14 days | 30 days |
   | :--- | ---: | ---: | ---: |
   | Ordinary | 21% (24% with Pro) | 13% (15%) | 8% (9%) |
   | Prime | 7% | 5% | 4% |
   | Luxury and grand | 3 – 4% | 3% | 3% |

   **The cart is the fix** ([the proposal, section 4](../product/sales_funnel_proposal.md)): one payment covers several items, and a **$4 minimum** for the cart total keeps the fee at about 10% or less. It's being built next.
4. **No plot charge comes near Stripe's $0.50 minimum.** The cheapest is a 7-day renewal of a $5 plot with Pro, $1.15. The $0.50 floor is still in the code for every lease, take-over and renewal, as it is for outside upgrades (`MIN_LEASE_CHARGE` in `lib/game/leases.js`).
5. **Short terms earn more.** A 7-day lease costs 0.3 of 30 days, so a tenant who keeps renewing every 7 days pays about 29% more than a 30-day tenant. That's the price of trying a storefront for a week.

## Next: a market valuation

Today a plot's worth comes only from where it is and how big it is. A market valuation could also count the **verified traffic** the city already records: qualified visits, website presses and store entries near the plot. The price would then follow real demand:
- busy streets get dearer;
- quiet ones get cheaper, so it's easier to start there;
- a business pays more only when its location demonstrably brings more customers.

It needs pilot data to be calibrated, so it comes after the pilot ([pilot.md](pilot.md)). The data it needs, and what is recorded already, is in [the proposal, section 5](../product/sales_funnel_proposal.md).
