# Land prices: an analysis of a whole city at full occupancy

Written for: you, to settle the price of land before the real world is laid out. The generated city is only a stand-in for the hand-authored one ([study_world_streaming.md](../architecture/study_world_streaming.md) section 7), so this document gives **rules** that depend on a few attributes of a plot, plus the numbers they produce on the test city (seed 20260101, all 790 plots taken). The tool that made the pictures is `/pricing` in the development server (not in release builds): it has every number below on a slider.

## The decisions it follows
- A **basic plot costs $5**, wherever it is.
- **Prime and luxury lots cost more**, in proportion to what they are worth.
- **Customising adds to the price**: floors, shape, colours, a roof feature (prices are yours to set: `lib/content/exteriorPrices.js`, all 0 for now).
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
    land price = $5 for an ordinary plot; $5 x worth for the rest, rounded to $5 from $20 up

A **location grade** is also worked out for every site, whatever is built on it, the way agents grade retail sites: **A** is the best tenth of the city by location bonus, **B** the next quarter, **C** the rest.

## The result: all 790 plots taken
![Land prices](../img/pricing-heatmap-price.png)

| Tier | Plots | Lowest | Middle | Highest | All together |
| :--- | :-: | :-: | :-: | :-: | :-: |
| Ordinary | 770 | $5 | $5 | $5 | $3,850 |
| Prime | 8 | $50 | $60 | $125 | $560 |
| Luxury | 9 | $455 | $470 | $505 | $4,300 |
| Grand | 3 | $1,065 | $1,145 | $1,300 | $3,510 |
| **The whole city** | **790** | | | | **$12,220** |

That is the land alone. A luxury estate is worth about 95 basic plots and a grand estate about 230. Prime lots are 2 to 4 plots of land with a modest premium, so they start at $50 to $125.

The **worth index** view shows the same thing for every plot, ordinary ones too (a basic plot with no advantages is 1x; the best ordinary sites reach about 2x, but they still cost $5 by your rule):

![Worth index](../img/pricing-heatmap-worth.png)

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
1. Keep **$5 for every basic plot**, and let the real world's plots carry the attributes above (`tier`, `cells`, `frontage`, `corner`, `centrality`, `park`, `anchor`, `waterfront`). The price then comes from the rules, or you type a `price` on a plot to override.
2. Use the **location grade** to decide which plots become prime when the real world is laid out: every grade A site that is not already prime or luxury is a candidate. (Real-estate practice often defines luxury as the top 5 to 10% by price, which is about what this gives.)
3. Treat the **luxury and grand prices as a starting point**: $470 and $1,145 are what the generator's own value ratios imply when a basic plot is $5. Move the sliders on `/pricing` until the ratios feel right, then freeze them in `LAND_PRICING`.
4. Set the **customising prices** (`lib/content/exteriorPrices.js`): a price per extra floor, per skyscraper floor, per shape, per colour style and per roof feature. The claim form already adds each choice to the total and lists it.

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
- A plot's price is the land price plus each customising choice, itemised above a **Total**.
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
