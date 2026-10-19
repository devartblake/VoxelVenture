# Plot pricing: the real price levels

[Monetization](README.md) | [Land prices: the analysis](pricing_analysis.md) | [Billing](billing.md)

Written for: the owner and anyone setting or reviewing Voxel Venture's prices. The prices on the server before this document were demo figures. The levels below are the real ones, built in `lib/game/landPrice.js`, `lib/game/leases.js`, `lib/content/exteriorPrices.js` and `lib/game/claimPrice.js`.

The figures cover every plot in the live city (seed 20260101): 805 lots, computed with the project's own pricing code.

## The decisions

- **Every plot is priced by its value, ordinary plots too.** A plot's worth comes from its tier, its size and its location (frontage, corner, centrality, park, anchor, waterfront). The year's price is the $5 base × that worth, and never less than $5.
- **Leases run 3, 6 or 12 months.** They cost 0.5, 0.75 and 1 × the year's price. The 30-day term is gone.
- **A take-over costs 1.25 × the business's worth**, plus the new tenant's outside.
- **A renewal costs half of a new lease** for the same term.
- **Basic outside items are free; elaborate ones cost a share of the plot's land price.** Their cost is part of the plot's value, so it counts in renewals and take-overs.
- **Changing the outside after claiming is no longer free when it costs more.** The owner pays the difference for the rest of the lease (minimum $0.50). Changes that cost the same or less apply at once.

## The plots

| Tier | Plots | Size (cells) | Area (map units²) | Worth (× a plain ordinary plot) | Location grade A / B / C |
| :--- | ---: | :---: | :---: | :---: | :---: |
| Ordinary | 704 | 1 | 9 (a 3 × 3 lot) | 1.0 – 2.1 (median 1.18) | 54 / 154 / 496 |
| Prime | 70 | 2 – 4 | 19 – 41 | 8.6 – 27.5 (median 11) | 18 / 36 / 16 |
| Luxury | 23 | 6 | 63 | 58 – 111 (median 83) | 6 / 7 / 10 |
| Grand | 8 | 10 | 106 | 198 – 282 (median 239) | 3 / 4 / 1 |

## The year's price (the land)

| Tier | Range | Median |
| :--- | :--- | ---: |
| Ordinary | $5 – $10.60 | $5.90 |
| Prime | $45 – $140 | $55 |
| Luxury | $290 – $555 | $415 |
| Grand | $990 – $1,410 | $1,195 |

The demo prices charged every ordinary plot a flat $5. Pricing ordinary plots by value lifts their revenue by about 26%; the other tiers are unchanged.

## Lease and take-over prices

Each cell gives the range, with the median in brackets.

| Tier | 3 months | 6 months | 12 months |
| :--- | :--- | :--- | :--- |
| Ordinary | $2.50 – $5.30 ($2.95) | $3.75 – $7.95 ($4.43) | $5 – $10.60 ($5.90) |
| Prime | $22.50 – $70 ($27.50) | $33.75 – $105 ($41.25) | $45 – $140 ($55) |
| Luxury | $145 – $278 ($208) | $218 – $416 ($311) | $290 – $555 ($415) |
| Grand | $495 – $705 ($598) | $743 – $1,058 ($896) | $990 – $1,410 ($1,195) |

| Tier | 3-month take-over | 6-month take-over | 12-month take-over |
| :--- | :--- | :--- | :--- |
| Ordinary | $3.13 – $6.63 | $4.69 – $9.94 | $6.25 – $13.25 |
| Prime | $28 – $88 | $42 – $131 | $56 – $175 |
| Luxury | $181 – $347 | $272 – $520 | $363 – $694 |
| Grand | $619 – $881 | $928 – $1,322 | $1,238 – $1,763 |

These take-over figures are for a business worth its land. A business whose owner added elaborate outside items is worth more, because that outside is part of its value.

**Cost per month at the median:**

| Tier | 3 months | 6 months | 12 months |
| :--- | ---: | ---: | ---: |
| Ordinary | $1.00 | $0.74 | $0.49 |
| Prime | $9.29 | $6.89 | $4.58 |
| Luxury | $70 | $52 | $35 |
| Grand | $202 | $150 | $100 |

## The outside

**Free (basic):**
- the plot's usual number of floors;
- every colour style;
- the owner's own wall colour;
- any building shape;
- no crown, a beacon or a dish.

**Priced (elaborate):** a share of the plot's land price, a year.

| Item | Share of the land price | Ordinary (median $5.90) | Prime ($55) | Luxury ($415) | Grand ($1,195) |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Each floor above the usual number | 10% | $0.59 | $5.50 | $41.50 | $119.50 |
| Each floor from the tenth up (extra) | 15% | $0.89 | $8.25 | $62.25 | $179.25 |
| Roof garden | 10% | $0.59 | $5.50 | $41.50 | $119.50 |
| Glass dome | 20% | $1.18 | $11 | $83 | $239 |
| Spire | 25% | $1.48 | $13.75 | $103.75 | $298.75 |

**Examples, for 12 months:**
- **Prime plot (median), 3 extra floors and a spire:** $55 + $16.50 + $13.75 = **$85.25**.
- **The same plot, 3 months:** half that, **$42.63**.

**A mid-lease upgrade:**
- **What's charged:** the extra year's cost × the term's factor × the share of the lease that's left.
- **Example:** two more floors on a median prime plot, halfway through a 12-month lease, costs $11 × 1 × 0.5 = **$5.50**.
- **Minimum charge:** $0.50, Stripe's own minimum. This also stops a large upgrade from being split into many small free steps.
- **Time left:** the whole time still to run is charged, including the extra days of a lease renewed early.
- **Never set up:** a building whose owner never changed the outside starts from the building as it stands, so floors the owner never chose are not charged.

## A year of revenue if every plot is leased all year

| Tier | On 3-month leases (renewed 4×) | On 6-month leases (2×) | On 12-month leases |
| :--- | ---: | ---: | ---: |
| Ordinary | $8,973 | $6,656 | $4,425 |
| Prime | $9,267 | $6,874 | $4,570 |
| Luxury | $19,092 | $14,161 | $9,415 |
| Grand | $19,396 | $14,387 | $9,565 |
| **Whole city** | **≈ $56,700** | **≈ $42,100** | **≈ $28,000** |

These figures are land only, at new-lease prices. Renewals at half price lower them. Outside upgrades and take-overs raise them.

## What the numbers say

1. **Ordinary plots are 87% of the city but about 16% of the land revenue.** The money is in prime, luxury and grand lots.
2. **The $5 base price is the main lever.** Every price above scales with it: a $25 base multiplies them all by 5, which would put the whole city at about $140,000 a year on 12-month leases. It's one number, `LAND_PRICING.base` in `lib/game/landPrice.js`.
3. **Stripe's fee takes a big share of cheap ordinary leases.** The fee is 30¢ plus 2.9%, which is about 13–15% of a 3-month ordinary lease but only 3–4% for prime and above. Two ways to fix it: a minimum lease payment of about $5, or offering only 6- and 12-month terms on ordinary plots. Neither is set yet.
4. **Short terms earn more.** A 3-month lease costs half a year, so a tenant who keeps renewing every 3 months pays about twice what a 12-month tenant pays. That's good for Voxel Venture, but expensive for a business that stays.

## Next: a market valuation

Today a plot's worth comes only from where it is and how big it is. A market valuation could also count the **verified traffic** the city already records: qualified visits, website presses and store entries near the plot. The price would then follow real demand:
- busy streets get dearer;
- quiet ones get cheaper, so it's easier to start there;
- a business pays more only when its location demonstrably brings more customers.

It needs pilot data to be calibrated, so it comes after the pilot ([pilot.md](pilot.md)).
