# Land prices: an analysis of a whole city at full occupancy

Written for: you, to settle the price of land before the real world is laid out. The generated city is only a stand-in for the hand-authored one ([study_world_streaming.md](../world/study_world_streaming.md) section 7), so this document gives **rules** that depend on a few attributes of a plot, plus the numbers they produce on the live city (seed 20260101, all 855 lots taken). The tool that made the pictures is `/pricing` in the development server (not in release builds): it has every number below on a slider.

## The decisions it follows (the real price levels, 2026-10-18)
- **Every plot is priced by what it is worth**, ordinary ones too. A basic plot with no advantage costs **$5 a year**; one on a main road, a corner, near the centre, by a park or on the water costs more (on the live city $5 to $10.60, the middle one $5.90).
- **Prime, luxury and grand lots cost more**, in proportion to what they are worth.
- **The basic outside is free; an elaborate one costs a share of the plot's land price** (`lib/content/exteriorPrices.js`): see [The outside](#the-outside-basic-is-free-elaborate-is-priced) below.
- **A lease is 3, 6 or 12 months** (`lib/game/leases.js`): see [Lease terms](#lease-terms).
- You have **three minutes to claim and pay** once you start setting a plot up (a "held for you" countdown on the claim form).

## How a lot's worth is worked out (real-estate grounds)
Commercial real estate values a site on a handful of well-known grounds. Each one is an attribute of the plot (`lib/game/landPrice.js`):

| Ground | In real estate | Attribute here | Adds to the worth |
| :--- | :--- | :--- | :--- |
| Visibility and traffic | "Location, location, location": a main-road frontage | `frontage` 0 to 3: a main road in front, a main cross street beside it, a ring road | 12% for each point |
| Corner | A corner lot has two frontages and sells at a premium | `corner` | 15% |
| Centrality | Class A locations are in the core | `centrality` 0 to 1 | up to 25% |
| Amenity | A park or a water view is the biggest amenity premium | `park`, `waterfront` | 30% and 50% |
| Co-tenancy | An anchor tenant lifts its neighbours | `anchor`: next to another big lot | 10% |
| Plottage | An assembled parcel is worth more than the same area in small lots | `cells` (area in standard plots) | 4% per extra cell, up to 25% |
| Highest and best use | The tier of the lot | `tier`: premium per cell of 1 (ordinary), 3.5 (prime), 8 (luxury), 12 (grand), the generator's own value ratios | multiplies the area |

    worth = cells x tier premium x (1 + location bonuses) x (1 + plottage)
    land price (a year) = $5 x worth, to the cent below $20 and rounded to $5 from $20 up;
                          never below $5 for an ordinary plot, never below $6 for the others

A **location grade** is also worked out for every site, whatever is built on it, the way agents grade retail sites: **A** is the best tenth of the city by location bonus, **B** the next quarter, **C** the rest.

## The result: all 855 lots taken
![Land prices](../img/pricing-heatmap-price.png)

What the live city's plots cost a year (seed 20260101; `tests/land-price.test.mjs` checks these figures):

| Tier | Lots | Lowest | Middle | Highest | All together |
| :--- | :-: | :-: | :-: | :-: | :-: |
| Ordinary | 752 | $5 | $5.90 | $10.60 | $4,737 |
| Prime | 70 | $45 | $55 | $140 | $4,570 |
| Luxury | 25 | $290 | $420 | $555 | $10,410 |
| Grand | 8 | $990 | $1,220 | $1,410 | $9,565 |
| **The whole city** | **855** | | | | **$29,282** |

That is the land alone, for 12-month leases. A luxury estate is worth about 70 basic plots and a grand estate about 200. Prime lots are 2 to 4 plots of land with a modest premium, so they start at $45.

The **worth index** view shows the same thing for every plot: a basic plot with no advantages is 1x, and the best ordinary sites reach about 2x, so they cost about $10:

![Worth index](../img/pricing-heatmap-worth.png)

(The pictures are from the first city, before the tier mix was updated; the tool draws today's.)

Until 2026-10-18 the generator worked out every plot's centrality without the city's centre, so the game and the server priced every plot as if it stood at the edge of the city. It now passes the centre and the land (`lib/city/cityGenerator.js`), so the live prices are the figures above; the server brings the stored plots up to date when it starts.

## Is the prime and luxury labelling right? (the location grades)
![Location grades](../img/pricing-heatmap-grade.png)

| Label | Grade A | Grade B | Grade C |
| :--- | :-: | :-: | :-: |
| Ordinary (770) | 73 | 189 | 508 |
| Prime (8) | 2 | 2 | 4 |
| Luxury (9) | 3 | 6 | 0 |
| Grand (3) | 1 | 1 | 1 |

- **Luxury estates are well placed**: all nine are on grade A or B sites.
- **73 basic plots are on grade A sites.** 49 of them are riverside and lakeside plots, 23 are on the outskirts' ring roads and 10 are on the main strip. A real-estate agent would call every waterfront plot a prime site: consider making all of them prime lots (or giving the waterfront a location surcharge on a basic plot).
- **Five special lots are on grade C sites**: prime lots 237, 243, 254 and 255 (in The Bazaar and Arcade Alley, away from main roads) and the grand estate 315 in the countryside. Their size and tier carry the price; a better site would justify it. These are the lots to look at when you place the real ones.

## What I would do with it
1. Price **every plot by its worth, from $5**, and let the real world's plots carry the attributes above (`tier`, `cells`, `frontage`, `corner`, `centrality`, `park`, `anchor`, `waterfront`). The price then comes from the rules, or you type a `price` on a plot to override.
2. Use the **location grade** to decide which plots become prime when the real world is laid out: every grade A site that is not already prime or luxury is a candidate. (Real-estate practice often defines luxury as the top 5 to 10% by price, which is about what this gives.)
3. The **luxury and grand prices** ($420 and $1,220 in the middle) are what the generator's own value ratios imply when a basic plot is $5. They are set in `LAND_PRICING`; `/pricing` still has every weight on a slider for a later review.
4. The **outside prices** are shares of the land price (below). Change a share in `lib/content/exteriorPrices.js` and the claim form, the owner's editor and the server all follow.

## The outside: basic is free, elaborate is priced
The outside of a building is part of what the plot is worth, so its price is a **share of the plot's land price for a year** (`lib/content/exteriorPrices.js`, priced by `outsideCost` in `lib/game/claimPrice.js`, to the cent). The same choice costs more on a better plot.

| | Choice | A year |
| :--- | :--- | :-: |
| **Free** (the basic outside) | the plot's usual number of floors, or fewer | free |
| | every colour style, your own wall colour (also from inside the building) | free |
| | any building shape, what stands behind the building | free |
| | no roof feature, a beacon or a dish | free |
| **Priced** (the elaborate outside) | each floor above the usual number | 10% of the land |
| | each floor from the tenth up (a skyscraper) | another 15% |
| | a roof garden | 10% |
| | a glass dome | 20% |
| | a spire | 25% |

On the live city:

| Plot | Land a year | One extra floor | Roof garden | Glass dome | Spire |
| :--- | :-: | :-: | :-: | :-: | :-: |
| Ordinary (the middle one) | $5.90 | $0.59 | $0.59 | $1.18 | $1.48 |
| Prime (the middle one) | $55 | $5.50 | $5.50 | $11 | $13.75 |
| Luxury (the middle one) | $420 | $42 | $42 | $84 | $105 |
| Grand (the middle one) | $1,220 | $122 | $122 | $244 | $305 |

The claim form and the outside editor say "free" beside each free choice and "+$1.48 a year" beside a priced one, from the same function the server charges with, and the claim form itemises each priced choice above the total. A claim's year price (the plot's value) is the land plus the outside.

### Changing the outside later
Without a rule, an owner could claim with the basic outside and add a spire for nothing afterwards. So (`exteriorChangeQuote` in `lib/game/claimPrice.js`, `services/api/core.mjs`):
- A change that costs **the same or less** a year (colours, the shape, fewer floors, taking a feature off) applies at once. The plot's value (its year price) goes down by the difference, never below the land.
- A change that costs **more** is paid for the rest of the lease: the yearly difference, at the lease term's price, times the share of the lease still to run, and at least **$0.50** (Stripe's smallest charge, which also stops a run of small upgrades each rounding to nothing). The plot's value goes up by the yearly difference. `PATCH /plots/:id` refuses it with 402 `exterior_payment_required` and the quote; `POST /plots/:id/exterior` pays it (through Stripe when payments are on). The owner's editor shows "These changes cost $X for the rest of your lease" with **Pay $X and apply** and **Undo**.
- Once the lease has ended (the grace week, or open to a buyout) the outside can't be built onto until the lease is renewed, like the inside.
- A renewal is priced from the plot with the outside it has, so an upgrade is in every renewal after it.

Examples, on a fresh 12-month lease: a spire on the middle ordinary plot costs **$1.48** ($0.74 half way through the lease, $0.50 near its end); two extra floors and a spire **$2.66**. On the middle prime plot a spire costs **$13.75** ($6.88 half way through); two extra floors and a spire **$24.75**.

## Lease terms
A plot is leased for **3, 6 or 12 months** (90, 182 or 365 days; 12 months if the claim does not say). The price is the year's price (land and outside) times the term's factor: **3 months 0.5, 6 months 0.75, 12 months 1**, so a shorter lease costs more per day. A renewal costs half of a new lease of the same plot and term. The 30-day term is gone: a lease made with it renews for 3 months unless the tenant picks another term.

| Plot (the middle one) | 3 months | 6 months | 12 months |
| :--- | :-: | :-: | :-: |
| Ordinary, $5.90 | $2.95 | $4.43 | $5.90 |
| Prime, $55 | $27.50 | $41.25 | $55 |
| Luxury, $420 | $210 | $315 | $420 |
| Grand, $1,220 | $610 | $915 | $1,220 |

## Floors and skyscrapers (the question about the four-floor limit)
The first version capped buildings at four floors, which was too low: a skyscraper shape can stand about 12 units (ten floors) even on an ordinary plot and 25 or more on an estate. The limit is now set by the plot's tier, and by what the shapes can reach on that footprint, whichever is lower:

| Plot | Most floors | Tallest |
| :--- | :-: | :-: |
| Ordinary | 10 | about 12 units |
| Prime | 12 | about 14 units |
| Luxury | 16 | about 19 units |
| Grand | 20 | about 24 units |

Each shape in the picker says how many floors it can have ("Skyscraper C (commercial, 5 to 10 floors)"), and only shapes that can stand at the chosen height are listed. From ten floors the shapes are skyscrapers. A building the owner designs takes the whole plot (the car park some generated buildings keep behind is dropped), so a skyscraper can use its full footprint.

## The claim form
- A plot's price is the land price plus each priced outside choice, itemised above a **Total** for the chosen lease term. The builder marks each free choice "free" and each priced one with what it adds a year.
- **Plot held for you: 3:00** starts when the player starts setting the plot up (a name, or any choice) and counts down; in the last 30 seconds it turns red. When it ends, the form is cleared, the draft building leaves the lot and a message says the plot is open again.
- With a game server the hold has to be kept on the server as well, or two players could each think they hold the same plot: that is still to do (see `../roadmap/tasks.md`).

## Using the tool
Open `http://localhost:3000/pricing` in development. Buttons switch between the price, the worth index, the location grade and the tier; the city can be changed (any number is a city); every weight is a slider; **Download all plots as CSV** gives every plot's attributes, grade, worth and price. The numbers that finally matter are in `LAND_PRICING` at the top of `lib/game/landPrice.js`; `tests/land-price.test.mjs` checks the rules and runs them over eight cities.

## The mix of tiers (update)
The first city had too few special lots (8 prime, 9 luxury, 3 grand: 2.5% together). The target is set as **shares of all lots**, so it holds as the city grows past 1000 lots (`TIER_SHARES` and `tierTargets()` in `lib/game/landPrice.js`):

| Tier | Share | 677 lots (the test city now) | 1,000 lots | 1,500 lots |
| :--- | :-: | :-: | :-: | :-: |
| Prime | 8% | 60 | 80 | 120 |
| Luxury | 2.5% | 19 | 25 | 38 |
| Grand | 0.8% | 6 | 8 | 12 |

The generated test city now reaches these (60, 19 and 6; the lots are merged, so the count of lots is lower than the old 790 plots). `tests/land-price.test.mjs` checks the shares on eight cities and the 1,000-lot arithmetic. In the hand-made world, pick the lots by location grade up to these counts, and re-check the shares after each new road. `/pricing` shows each tier's share beside its target.
