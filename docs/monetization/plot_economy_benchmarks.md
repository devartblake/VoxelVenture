# Plot economy: outside benchmarks

[Monetization](README.md) | [Land prices: the analysis](pricing_analysis.md) | [Plot pricing: the real price levels](plot_pricing_scenarios.md) | [Billing](billing.md)

Written for: the owner, deciding the plot economy.

This document compares the proposed plot economy with real markets: real shop rents, virtual land, the listing and visibility products local businesses already pay for, dynamic pricing that people accept as fair, and card fees. Research date: 2026-10-18. Every figure has a source. Figures marked **(estimate)** come from one blog or vendor and are not audited data. Where a figure could not be found, the document says so.

The proposal being checked (from the sales funnel proposal, not built yet):

| Item | Proposed |
| :--- | :--- |
| Lease terms | 7, 14 and 30 days, at 0.3, 0.55 and 1 × the 30-day price |
| 30-day price | $5 × worth^0.7, where worth = tier × area × location bonuses (`lib/game/landPrice.js`) |
| 30-day prices by tier (median) | ordinary $5 – $8.50 ($5.50), prime $23 – $51 ($27), luxury $85 – $135 ($110), grand $202 – $260 ($231) |
| Renewal | 10% off |
| Take-over | 1.25 × worth |
| Demand index (later) | from verified visits, foot traffic, claim intent, vacancy and watchers; moves prices by at most ±10% per 30 days |
| Plans and extras | Launch Pack $9 once, Pro $19 a month (15% off plots), sponsored placement $29 – $99 a week, market stall $2 – $5 a day |

## Summary: what the benchmarks say for Voxel Venture

1. **The tier ratios (1 : 5 : 20 : 42 by median store) are sane.** Real rent per square foot varies about 2 to 3 times between ordinary and good locations inside one city (Denver: power centres $11.79, malls $35.00; submarkets $15.87 to $31.33), about 10 to 16 times between a country's top street and its regional prime streets (New Bond Street £2,750 Zone A against £175 to £300 in UK regional cities), and about 90 times between the world's top street and the US national average ($2,231 against $25.53). Our ratios are for a whole store, area included. Per unit of worth they are much flatter than real rent, because of the ^0.7 compression. **Keep them.**
2. **The ^0.7 compression has a direct precedent.** Second Life's mainland fees, a fixed price list running since the 2000s, charge $4 a month for 512 m² and $166 for a whole region (65,536 m²). That is 128 times the area for 41.5 times the price, an exponent of about 0.77. Our 0.7 is a little more generous to big plots. **Keep 0.7, or move to 0.75 if grand plots sell out and ordinary ones do not.**
3. **The short-term premiums are mild, and that is fine for a trial.** Our 7-day term costs 1.29 times the 30-day rate per day, and the 14-day term 1.18 times. Real pop-up space is said to cost 2 to 4 times the pro-rated long-lease rent (estimate, one source), and a 2019 London figure (£300 a day or £1,500 a week) prices a week at 5 days. Our premiums are well below the real ones. That suits a trial whose aim is to get businesses in. **Keep 0.3 and 0.55. If short terms take most of the sales, 0.35 and 0.6 would still be well below real pop-up premiums.**
4. **±10% per 30 days is too loose as the only cap.** Compounded, it allows +214% in a year. Real markets move far more slowly: global prime high-street rents rose 4.2% in the year to 2025, US average asking rent 0.27% in a quarter, and California caps residential rent rises at 5% + inflation, 10% at most, a year. **Keep ±10% as the step, add a yearly cap (for example ±25% a year), and change the price only for new leases and renewals, never during a lease.** Publish the change in advance, the way Singapore's road-pricing authority announces each quarterly change.
5. **Real markets price on vacancy, absorption, comparable deals and footfall, and footfall alone is a poor guide.** Brokers report availability rate, net absorption (space taken minus space given up) and asking rent, and indices use repeat sales of the same property. A MyTraffic study of seven prime European streets found rent and footfall mostly moved in opposite directions. **Weight vacancy and claim intent (watchers, waitlist, failed claims) above raw visits, and use verified visits for the anchor and location bonuses, not for monthly price moves.**
6. **Pro at $19 and the plots sit in the right places on the local-business ladder.** Linktree Pro is $15 a month (estimate, secondary source), Etsy Plus $10, Shopify Basic $29 to $39, Yelp's Upgrade Package $180, and Yelp Ads start at $150 a month. An ordinary plot ($5.50 for 30 days) costs a little less than Linktree Starter ($8) or Etsy Plus ($10). Sponsored placement ($29 to $99 a week, about $125 to $430 a month) is in Yelp and Nextdoor ad territory. **No change needed.** The grand plot ($231 for 30 days) costs about as much as the Yelp Ads plus Upgrade bundle ($270 a month), so it has to show results the way an ad does.
7. **Small charges lose a large share to card fees: bundle them.** On Stripe's US rate (2.9% + 30¢), a $1.65 7-day ordinary lease loses 21% to the fee, a $2 market stall 18%, and a $5.50 plot 8.4%. **Sell plot leases in the same checkout as the plan, or as a credit balance.** Adding the $1.65 lease to a $19 Pro payment saves the 30¢ fixed fee. Stripe's minimum charge is $0.50.
8. **Virtual land priced as an investment collapsed. Rent priced as a service did not.** Sandbox and Decentraland land fell 89% to 95% from their peaks, while Second Life's fixed monthly fees have changed only slowly (the 1,024 m² parcel is $7 now, against about $5 in 2017). **Keep plots as leases with published prices. Take-over at 1.25 × worth, and never allow resale for profit.**

## 1. Real commercial retail rent

### 1a. Rent by location class

| Location | Rent | Source |
| :--- | :--- | :--- |
| New Bond Street, London (world's most expensive, 2025) | $2,231 / sq ft / year | Cushman & Wakefield, *Main Streets Across the World 2025*, press release, 19 Nov 2025 |
| Via Montenapoleone, Milan | $2,179 / sq ft / year | same |
| Upper Fifth Avenue, New York | $2,000 / sq ft / year | same |
| Tsim Sha Tsui, Hong Kong | $1,515 / sq ft / year (down 6%) | same |
| Champs-Élysées, Paris | $1,364 / sq ft / year | same |
| Kohlmarkt, Vienna (10th) | $601 / sq ft / year | same |
| Madison Avenue and SoHo, New York (secondary to Fifth Avenue) | "30-50% lower rents" than prime New York | same |
| Global average rent growth, 141 locations | +4.2% a year; 58% of markets up | same |
| New Bond Street, Zone A | £2,750 / sq ft (Zone A, see 1c) | Cushman & Wakefield 2025 (via search summary of the C&W Belgium release, Nov 2025) |
| UK regional prime high streets, Zone A | £175 (Bath, Birmingham, Newcastle) to £300 (Glasgow, Buchanan St, 30 ft zone) / sq ft | CBRE, *UK Retail at a Glance Q4 2025* |
| UK prime rent growth, Q4 2025 | Central London +11%, UK high streets +4% a year | same |
| UK prime shopping centres | +10.2% a year, still below 2019 | same |
| US national average asking rent | $25.53 / sq ft / year, vacancy 4.3% | Colliers, *U.S. Retail Q3 2025* |
| US by centre type: mall / power / neighbourhood / strip | $36.06 / $28.51 / $25.87 / $24.37 per sq ft (overall $26.21) | MMCG Invest, *U.S. Retail Market Report 2026* (Q3 2026 series, calibrated to CoStar data; secondary) |
| Denver by centre type: lifestyle and mall / neighbourhood, community and strip / power | $35.00 / $21.42 / $11.79 per sq ft (NNN), overall $20.85 | CBRE, *Denver Retail Figures Q4 2025* |
| Denver by submarket | $15.87 (Northeast) to $31.33 (Colorado Blvd) | same |
| Manhattan, Broadway in SoHo | median asking $726 / sq ft (peak $824 in 2016) | REBNY, *Manhattan Retail Report H2 2025*, press coverage, Feb 2026 |
| Manhattan, all 16 corridors | average rent 32% below the 10-year peak | REBNY press release, 4 Feb 2026 |

**The ratios, worked out:**

| Comparison | Ratio | Our nearest equivalent |
| :--- | :-: | :--- |
| Ordinary to good inside one metro (Denver centre types, submarkets) | 2 – 3× | ordinary $5 to best ordinary $8.50 (1.7×) |
| Neighbourhood strip to mall (US) | 1.5× | — |
| A country's regional prime street to its top street (UK Zone A) | 9 – 16× | ordinary to luxury (20×) |
| Global top street to US national average | 87× | ordinary to grand (42×) |
| Secondary to prime corridor in one city (New York) | rents 30 – 50% lower, so prime is 1.4 – 2× | — |

Real ratios are per square foot. Ours are per store, and a luxury or grand lot is also 6 or more plots in area. Per unit of worth our prices are much flatter than real rent (a grand plot is worth about 240 ordinary plots and costs 42 times as much). That is deliberate: the top must not run away.

### 1b. Location premiums

| Premium | Figure | Source | Ours |
| :--- | :--- | :--- | :--- |
| Corner unit | "up to 30%" more rent (estimate, broker commentary) | StarProperty (Malaysia), "Is store frontage worth the extra ringgit?" (undated) | +15% |
| Frontage depth | Zone B valued at ½ of Zone A, Zone C at ¼, remainder at ⅛; Zone A is the first 20 ft (6.1 m) from the shop front (30 ft on Oxford Street and in Scotland) | UK Valuation Office Agency, "How we value small shops" (blog, 9 May 2025); RICS firms glossary, "Zoning" | frontage +12% a point |
| Anchor co-tenancy | Anchors get a rent subsidy per square foot of "no less than 72 percent" of what non-anchor stores pay, so smaller stores near anchors pay much more per sq ft | Pashigian & Gould, "Internalizing Externalities: The Pricing of Space in Shopping Malls", *Journal of Law and Economics* 41(1), 1998 | +10% |
| Anchor goes dark | In-line leases with co-tenancy clauses let tenants cut rent, switch to percentage rent or leave if a named anchor closes | Benesch (ABA real estate journal article, 2020); growthfactor.ai glossary | — |
| Pedestrian precinct vs high street | prime precinct rents averaged 45% above high-street equivalents (1988, dated) | Edward Erdman survey, cited in RICS library record | — |
| Footfall vs rent | on seven prime European streets, rent and footfall were "predominantly inverse", with two exceptions | MyTraffic, *European prime retail streets study* (undated) | — |
| Park or waterfront for retail | **not found** for retail rents (the commonly quoted amenity premiums are for homes) | — | +30% / +50% |

Our corner (+15%) and anchor (+10%) weights are modest against these. The park (+30%) and waterfront (+50%) weights have no retail benchmark. They are the largest bonuses in the model, so they should be the first ones checked against real demand once the demand index runs.

### 1c. How rent is set: percentage rent, short terms, lease length, reviews

| Practice | Figure | Source |
| :--- | :--- | :--- |
| Percentage rent rate | 4% – 8% of gross sales above a breakpoint, 6% common; apparel 5 – 7%, restaurants 6 – 10%, jewellery over 10% (estimate, broker sources) | PropertyMetrics, "Percentage Rent: How it Works"; growthfactor.ai, citing Northmarq and Austin Tenant Advisors |
| Natural breakpoint | annual base rent ÷ percentage rate (e.g. $100,000 at 6% gives about $1.67 million of sales) | same; Wikipedia, "Percentage rent" |
| Pop-up premium | "Licensed-space rent on a 30-day deal usually runs 2x to 4x the prorated long-term rate" (estimate, one blog) | ShopAppy, "Pop-up retail economics: 30 day", Elena Rossi, 2026 |
| Pop-up day vs week | central London "as much as £300 a day or £1500 a week"; Birmingham £650 – £750 a week | Paymentsense, "How to set up a pop-up shop", 16 Sep 2019 |
| Central London pop-up | "about £1,000 a day or more" | Square UK, "How to open a pop-up shop" (undated) |
| Appear Here commission | 10% – 30% of rent, or 15% (sources differ; dated) | Harvard Digital Initiative case note; PYMNTS, 2017 |
| Appear Here per-day rates | **not found** (no published price list) | — |
| UK retail lease length | 7.2 years on average in prime shopping centres (F&B 10, leisure 12) | CBRE, *UK Prime Shopping Centre Leasing* (2025) |
| UK average lease length, all property | 7.1 years (2018) | MSCI press release, 2018 |
| US national-tenant leases | 10 years or more (examples: AutoZone, Dunkin; a 20-year Chick-fil-A lease) | MMCG Invest, 2026 |
| Fixed yearly escalation | 2% – 3% a year, 3% common (office and general commercial; estimate) | malakaisparks.com; rets.ai (broker blogs) |
| CPI-linked escalation | often with a floor (e.g. 2%) and a cap (3% – 6%) | same |
| UK market rent review | every 3 to 5 years is common | Simply-Docs, "How rent review works" |
| UK upward-only reviews | banned in new commercial leases by the English Devolution and Community Empowerment Act 2026 (royal assent 29 Apr 2026), from a date to be set, not before 2027 | Penningtons Manches Cooper; DWF, May 2026; Reed Smith, Jul 2025 |
| UK leasing code | review clauses must state the frequency and method clearly | RICS, *Code for Leasing Business Premises*, 1st ed., 2020 |

What this means for us: real rent changes on a review date or a lease event, at 2 – 3% a year or to a market level every 3 – 5 years, and the UK is now banning reviews that can only go up. Our 30-day leases make every renewal a review. That is already far more responsive than any real lease, so the demand index needs a cap that works over a year, not only per step, and it should be able to move prices down as well as up.

## 2. Virtual land and virtual storefronts

| Platform | Pricing | Source |
| :--- | :--- | :--- |
| Second Life, mainland land fee (monthly, beyond the membership bonus) | 512 m² $4; 1,024 m² $7; 2,048 m² $13; 4,096 m² $22; 8,192 m² $31; 16,384 m² $60; 32,768 m² $103; 49,152 m² $142; full region 65,536 m² $166 | Linden Lab, secondlife.com/land/pricing (read 2026-10-18) |
| Second Life, billing rule | billed on the peak amount of land held in the previous 30-day cycle | same |
| Second Life, land included with membership | Plus 512 m², Premium 1,024 m², Premium Plus 2,048 m² | same |
| Second Life, Premium membership | $11.99 a month, rising to $12.99 from 8 Jul 2026 | Linden Lab announcement, reported by Modem World, 8 Jun 2026 |
| Second Life, private full region | $239 → $209 a month (with land-capacity bonus); 20K region $199, from 15 Jun 2026 | same |
| Second Life, 1,024 m² parcel in 2017 | about $5 a month (forum post) | Second Life community forum, 2017 |
| Decentraland, land rentals | owners set a price per day in MANA and a term; the tenant pays the whole term up front; the land does not return automatically | The Block, 8 Dec 2022; Decentraland announcement, 5 Dec 2022 |
| Decentraland, typical rents | **not found** in a reliable source | — |
| Decentraland, average parcel sale price | about $2,380 (Dec 2022); about $14,000 average sale at the Dec 2021 peak | The Block, 8 Dec 2022; Motley Fool, 13 Oct 2022 |
| The Sandbox, land rentals | owner-set; no published typical rent **found** | Influencer Marketing Hub, 2024 |
| The Sandbox, 2021 land sale prices | regular LAND about $3,215; premium LAND about $14,892 (premium is about 4.6×) | DappRadar (c. 2021) |
| Metaverse land floor prices | Sandbox −95% (2.86 ETH in 2021 to 0.13 ETH in 2024), Decentraland −89%, Otherdeed −85%; average −72% | CoinGecko study, via CryptoSlate (2024) |
| Same, earlier | Jan 2022 to May 2023: Sandbox −89.8%, Decentraland −87.8%, Otherdeeds −85.5% | CoinGecko, "How Much is Land in the Metaverse?" (May 2023) |
| Roblox, branded experience build | $60,000 – $120,000+ for an activation (estimate, agency guide); $400K – $1.5M for a mid-range world (estimate, vendor) | 8ration (2026); rolearn.dev (2026) |
| Fortnite (UEFN), mid-range world build | $650K – $2.5M (estimate, vendor) | rolearn.dev (2026) |
| Roblox, platform fee on brand deals from 1 Jan 2027 | $1.50 per 1,000 visits with an ad impression in the US; $0.75 UK/CA/AU/NZ/Nordics; $0.20 W. Europe/JP/KR; $0.05 rest of world; $0.10 flat after 28 days; creators can lock a maximum fee in advance | GamesBeat; PocketGamer.biz (Jun 2026) |
| Spatial | Free; Personal $20 a month (non-commercial use only); Enterprise custom (aggregator listing; Spatial publishes no business price) | Toolradar; G2 (2026) |
| Habbo and other virtual hotels | **not researched**: no current room or furni price list was found | — |

What this means for us:

- **Second Life is the closest model, and it has lasted.** It charges a fixed monthly fee by area, published in a table, billed in 30-day cycles, and the fees have changed only slowly (the 1,024 m² parcel went from about $5 to $7 a month between 2017 and 2026). Its price per m² falls with size (exponent about 0.77, close to our 0.7). Its full region costs 41.5 times the smallest parcel. Our grand plot costs 42 times the median ordinary one.
- **Brand worlds on Roblox and Fortnite cost five to seven figures to build**, and Roblox's own fee is per impression. A Voxel Venture storefront is a different product: a small business pays dollars, not tens of thousands. The useful idea to borrow is Roblox's **lock-in**: the creator knows the maximum fee before the campaign starts.

## 3. Listing and visibility products local businesses already pay for

| Product | Price | Source |
| :--- | :--- | :--- |
| Google Business Profile | free | Google, google.com/business ("Stand out on Google with a free Business Profile") |
| Google Local Services Ads | pay per lead; Google's own help page gives no price range. Industry figures: about $23 average (one expert), $53 blended for home services (888 contractors, Feb 2026), $30 (dog training) to $249 (personal injury) | Google LSA help; SearchLight benchmark via Enrich Labs (2026); The Media Captain (undated) (all estimates) |
| Google Ads (search), cost per lead | $70.11 average; $28.50 (auto repair) to $131.63 (legal); restaurants $30.27 | LocaliQ benchmark of 16,446 campaigns, via Search Engine Land (2025) |
| Yelp Ads | from $150 a month (pay per click) | WebFX, "Yelp advertising costs", 13 Aug 2026 |
| Yelp Upgrade Package | $180 a month; Ads + Upgrade bundle $270 | same |
| Nextdoor self-serve ads | from about $5 a day; recurring ads charged up front for 31 days at a time (estimate, third-party) | Browser Media; Nextdoor pricing guides (2026, secondary) |
| Etsy | $0.20 a listing (renews every 4 months), 6.5% transaction fee, 3% + $0.25 payment processing (US); Etsy Plus $10 a month | FitSmallBusiness; Craftybase (secondary; Etsy's fee page blocked automated reading) |
| Shopify | Basic $39 a month ($29 billed yearly); Grow $105 ($79); Advanced $399 ($299); Plus from $2,300; online card rate 2.9% + 30¢ on Basic | Shopify, shopify.com/pricing (read 2026-10-18) |
| Linktree | Free; Starter $8 a month; Pro $15; Premium $35 (lower when billed yearly) | u2l.ai, "Linktree Pricing 2026" (secondary; Linktree's page shows prices only by region) |
| Carrd | Pro Lite $9 a year; Pro Standard $19 a year; Pro Plus $49 a year (larger site counts up to $999 a year) | Carrd, carrd.com/pro (read 2026-10-18) |

**Where we sit on the ladder (per month):**

| Monthly cost | Outside | Voxel Venture |
| :--- | :--- | :--- |
| $0 | Google Business Profile, Linktree Free | free profile |
| about $1 – $4 | Carrd Pro (per year, ÷ 12) | — |
| $5 – $10 | Linktree Starter, Etsy Plus | ordinary plot, 30 days ($5 – $8.50) |
| $15 – $40 | Linktree Pro and Premium, Shopify Basic | **Pro $19**; prime plot ($23 – $51) |
| $100 – $300 | Yelp Ads, Yelp Upgrade, Nextdoor at $5 a day | luxury plot ($85 – $135), grand plot ($202 – $260), sponsored placement ($125 – $430 a month) |

Pro at $19 sits between Linktree Pro and Shopify Basic. That is right for a profile-plus-storefront tool that does not run a whole shop. A grand plot and a sponsored placement cost as much as Yelp advertising, so their pages need to report results the way an ad platform does (visits, clicks to the business, claims of interest).

## 4. Dynamic and market pricing that is fair to both sides

| Pattern | How it works | Source |
| :--- | :--- | :--- |
| Airbnb Smart Pricing | Airbnb sets the nightly price from demand signals; the host sets a minimum and a maximum it never crosses, and can switch it off for any date; turning it off never changes what booked guests pay. Hosts often report it prices too low | Airbnb Resource Center, "What is Smart Pricing" (2026); Touchstay blog |
| Google Ads auction | you pay "only the least needed" to clear the Ad Rank thresholds and beat the advertiser below you, usually below your maximum bid; the reserve price if nobody is below | Google Ads Help, "Actual cost-per-click (CPC)" |
| Second Life fees | fixed, published table; no auction; billed on peak holdings in the last 30 days | Linden Lab (see section 2) |
| Singapore Electronic Road Pricing | rates reviewed every quarter (and in the June and December school holidays) against a target speed band (45 – 65 km/h on expressways, 20 – 30 km/h on arterial roads); changes are in S$1 steps, announced ahead (e.g. +S$1 at four expressway points from 23 Mar 2026); a road whose speeds stay below target can be left unpriced (Orchard since Apr 2020) | Land Transport Authority, news release, Mar 2026; Torque (trade press) |
| Case-Shiller home price index | repeat sales of the same homes (so the mix of what sold does not move the index); a three-month moving average; published with a two-month lag; excludes new builds and homes resold within six months | S&P CoreLogic Case-Shiller, via secondary explainers (WallStreetMojo, Wolf Street, 2020) |
| California rent cap (AB 1482) | at most 5% + local CPI a year, never more than 10% | CalMatters, Sep 2019 |
| Oregon rent cap (SB 608, 2019) | 7% + CPI a year (14.6% allowed in 2023) | Newsweek; KATU |
| Commercial CPI clauses | often a floor (about 2%) and a cap (3% – 6%) | broker blogs (see 1c) |
| Waitlists | **no benchmark figures gathered**. Common practice (Second Life's Linden Homes, popular pop-up venues) is a queue for a fixed price rather than a price rise | — |

What a fair index looks like, from these examples:

- **Measure what you price.** Singapore prices on speed, the thing it wants to control. Our equivalent is vacancy (how many plots of a kind are free) and claim intent (watchers, waitlist joins, failed claims). Visits measure the plot's value to the business, which the location bonuses already capture.
- **Smooth and lag it.** Case-Shiller uses a three-month moving average of repeat sales. A plot index should average at least 30 to 90 days, so one viral day does not move the price.
- **Bound it both ways, and over a year.** Rent caps are yearly (5% to 10% + CPI). Airbnb lets the host set the bounds. A ±10% step every 30 days compounds to +214% or −72% a year; a yearly cap stops that.
- **Never change a running lease, and announce changes.** Airbnb never re-prices a booking; Singapore publishes changes before they apply; the UK is banning upward-only reviews.
- **The same price for everyone.** Price by the plot, never by the buyer (see section 6).

## 5. Payment economics

| Item | Figure | Source |
| :--- | :--- | :--- |
| Stripe, US domestic card | 2.9% + 30¢ per successful charge; +0.5% if keyed manually | Stripe, stripe.com/pricing (US page, read 2026-10-18) |
| Stripe, international card / currency conversion | +1.5% / +1% | same |
| Stripe Billing (subscriptions) | 0.7% of billing volume, pay as you go | same |
| Stripe, disputes | $15 per dispute received; $15 to counter (refunded if won) | same |
| Stripe, minimum charge | $0.50 (USD), €0.50, £0.30 | Stripe Docs, "Supported currencies: minimum and maximum charge amounts" |
| PayPal micropayments | 4.99% + $0.09, on application; replaces the standard rate on **all** payments into the account, so it only pays when most payments are under about $5 | PayPal merchant fees page; checkoutpage.com (2026) |
| Shopify Basic online card rate | 2.9% + 30¢ (falls to 2.25% + 30¢ on Plus) | Shopify pricing |
| Stripe micropayment pricing | **not published**; Stripe gives custom pricing on request only | — |

Stripe's fee on our own prices (2.9% + 30¢, US card, worked out here):

| Charge | Price | Fee | Share lost |
| :--- | ---: | ---: | ---: |
| 7-day ordinary lease (median) | $1.65 | $0.35 | 21% |
| Market stall, cheapest day | $2.00 | $0.36 | 18% |
| 30-day ordinary lease (median) | $5.50 | $0.46 | 8.4% |
| Launch Pack | $9.00 | $0.56 | 6.2% |
| Pro, one month | $19.00 | $0.85 | 4.5% |
| 30-day prime lease (median) | $27.00 | $1.08 | 4.0% |
| Pro + 7-day ordinary lease, one charge | $20.65 | $0.90 | 4.4% (saves $0.30 against two charges) |
| 30-day grand lease (median) | $231.00 | $7.00 | 3.0% |

International cards add 1.5% and subscriptions through Stripe Billing add 0.7%. A 7-day ordinary lease on a foreign card loses about 23%.

What this means for us: one checkout for everything (the cart in the proposal), or a prepaid credit balance topped up in $10 or $20 steps, keeps the fixed 30¢ to one charge. A lone 7-day ordinary lease is the worst case. Offer it, but show the 30-day price next to it, and add it to a Pro or Launch Pack payment where possible.

## 6. What to watch out for

- **Speculation kills virtual land.** Sandbox, Decentraland and Otherside land lost 85% to 95% of its value once buyers saw land as an investment and the visitors never came. Second Life, which rents land at fixed fees, is still running two decades on. Keep plots as leases, not assets. Do not let a business resell a lease for profit. Take-over at 1.25 × worth with a payout to the sitting tenant is a fixed rule, not a market, and should stay one.
- **Footfall is not rent.** The MyTraffic study found rent and footfall mostly moving in opposite directions on prime European streets. Visits in a 3D city can be faked or bunched (one event, one streamer). Count only verified visits, average them, and cap their effect.
- **Fairness to the sitting tenant.** Real leases change rent only at review dates, and the UK is outlawing reviews that can only go up. Lock the price for the term, give the 10% renewal discount against the price at renewal, and show the next term's price before the renewal date, as Roblox lets creators lock a maximum fee in advance.
- **Fairness to newcomers.** If the demand index pushes prime plots up, small businesses are priced out of the best streets. Keep the ordinary tier out of the index at first, or let it only fall.
- **Regulation of dynamic and personalised pricing:**
  - **New York's Algorithmic Pricing Disclosure Act** (N.Y. Gen. Bus. Law § 349-a, in force 10 Nov 2025) requires the notice "THIS PRICE WAS SET BY AN ALGORITHM USING YOUR PERSONAL DATA" next to any price set by an algorithm from a consumer's personal data. Penalties are up to $1,000 a violation (Olshan; Kelley Drye; Duane Morris, Mar 2026). A plot index based on plot-level data, with the same price for every buyer, should fall outside it. Do not feed the buyer's own data (history, location, spend) into the price.
  - **The US FTC** published preliminary findings on "surveillance pricing" on 17 Jan 2025: intermediaries setting individual prices from location, browsing and shopping history for at least 250 retailers (FTC staff research summaries; McCarter & English).
  - **The UK CMA** accepted undertakings from Ticketmaster on 15 Sep 2025 after the Oasis sale. It found no real-time algorithmic pricing, but objected to unclear tiers ("Platinum" tickets at nearly 2.5 times standard). Ticketmaster must now say 24 hours ahead when tiered pricing is used, and must not use misleading labels (CMA case page). For us: say clearly what "prime", "luxury" and "grand" mean, and announce index changes ahead.
  - Our buyers are businesses, so most consumer rules apply only in part. A sole trader can count as a consumer in some places, and the safest course is to treat buyers as consumers.
- **Small charges and disputes.** A $15 Stripe dispute fee wipes out about nine 7-day ordinary leases. Clear receipts and an easy refund path cost less than disputes.

## Sources

Real estate:
- Cushman & Wakefield, "New Bond Street in London named world's most expensive retail destination for first time" (Main Streets Across the World 2025), 19 Nov 2025: https://www.cushmanwakefield.com/en/united-kingdom/news/2025/11/new-bond-street-in-london-named-worlds-most-expensive-retail-destination-for-first-time
- Cushman & Wakefield Belgium release, Nov 2025: https://www.cushmanwakefield.com/en/belgium/news/2025/11/londons-new-bond-street-most-expensive-retail-destination-in-the-world
- CBRE, UK Retail at a Glance Q4 2025: https://mktgdocs.cbre.com/2299/f4b4efbe-6fa5-45dc-a303-e21986c99310-1600742479/UK_Retail_At_a_Glance_Q4_2025.pdf
- CBRE, Denver Retail Figures Q4 2025: https://mktgdocs.cbre.com/2299/6f940b4b-eb06-47b7-b5f9-be61eb67776b-444351134/Denver_Retail_Figures_Q4_2025.pdf
- CBRE, UK Prime Shopping Centre Leasing (2025): https://mktgdocs.cbre.com/2299/e4361d0b-68a2-4316-ab61-8d0ff7ede05f-1501152462/UK_Prime_Shopping_Centre_Leasi.pdf
- Colliers, Retail remains stable as holiday season nears: U.S. Retail Q3 2025: https://knowledge-leader.colliers.com/nicole-larson/retail-remains-stable-as-holiday-season-nears-u-s-retail-q3-2025/
- MMCG Invest, U.S. Retail Market Report 2026: https://www.mmcginvest.com/post/u-s-retail-market-report-2026-vacancy-rents-cap-rates-and-the-store-closure-ledger
- REBNY, H2 2025 Manhattan Retail Report press release, 4 Feb 2026: https://www.rebny.com/press-release/h2-2025-manhattan-retail-report-broad-based-demand-in-many-corridors/
- Commercial Observer on REBNY (SoHo $726): https://commercialobserver.com/2026/02/manhattan-soho-retail-h1-2025-rebny/
- MSCI UK lease events press release (2018): https://www.msci.com/documents/10199/299d871f-e393-e942-f1e6-03803d6b0811
- StarProperty, "Is store frontage worth the extra ringgit?": https://www.starproperty.my/news/is-store-frontage-worth-the-extra-ringgit-/133659
- MyTraffic, European prime retail streets study: https://www.mytraffic.io/en/market-studies/european-prime-retail-streets-study
- RICS library record (Erdman 1988 survey): https://rics.koha.openfifth.net/bib/21502
- Valuation Office Agency, "How we value small shops", 9 May 2025: https://valuationoffice.blog.gov.uk/2025/05/09/how-we-value-small-shops-2/
- RICS firms glossary, Zoning: https://www.ricsfirms.com/glossary/zoning/
- Pashigian & Gould (1998), Journal of Law and Economics 41(1): https://ideas.repec.org/a/ucp/jlawec/v41y1998i1p115-42.html
- Benesch, "Thinking Outside the Box for Anchor Retailer Closings": https://www.beneschlaw.com/images/content/1/9/v3/19741/Thinking%20Outside%20the%20Box%20for%20Anchor%20Retailer%20Closings%20Is%20There%20A.pdf
- growthfactor.ai, Percentage rent: https://www.growthfactor.ai/resources/blog/percentage-rent
- PropertyMetrics, Percentage Rent: How it Works: https://propertymetrics.com/blog/percentage-rent/
- Wikipedia, Percentage rent: https://en.wikipedia.org/wiki/Percentage_rent
- ShopAppy, Pop-up retail economics (30 day), 2026: https://shopappy.com/retail/pop-up-experience/pop-up-retail-economics-30-day
- Paymentsense, How to set up a pop-up shop, 16 Sep 2019: https://paymentsense.com/uk/blog/how-to-set-up-pop-up-shop
- Square UK, Open a pop-up: https://squareup.com/gb/en/townsquare/open-a-pop-up
- Harvard Digital Initiative, Appear Here: "Airbnb of Retail": https://d3.harvard.edu/platform-digit/submission/appear-here-airbnb-of-retail/index.html
- PYMNTS, Appear Here monetizes pop-up store market (2017): https://www.pymnts.com/news/retail/2017/appear-here-monetizes-pop-up-store-market-marketplace-etsy-new-york-city-soho-west-village/
- Malakai Sparks, CPI rent escalation clause: https://www.malakaisparks.com/the-cpi-rent-escalation-clause-protecting-your-commercial-cash-flow-from-inflation/
- rets.ai, Rent escalation: fixed bumps vs CPI: https://rets.ai/blog/rent-escalation-clause-fixed-bumps-vs-cpi-ten-year-cost
- Simply-Docs, How rent review works: https://simply-docs.co.uk/Review-of-Rent-in-Commercial-Leases/How-Rent-Review-Works
- Penningtons, A new direction for rent review clauses: https://www.penningtonslaw.com/insights/a-new-direction-for-rent-review-clauses/
- DWF, Ban on upwards only rent reviews, May 2026: https://dwfgroup.com/it-it/news-and-insights/insights/2026/5/ban-on-upwards-only-rent-reviews-in-commercial-business-leases
- Reed Smith, Potential prohibition on upwards only rent reviews, Jul 2025: https://www.reedsmith.com/en/perspectives/2025/07/potential-prohibition-on-upwards-only-rent-reviews
- RICS, Bill proposes banning upwards only rent reviews: https://www.rics.org/news-insights/bill-proposes-banning-upwards-only-rent-reviews

Virtual worlds:
- Linden Lab, Mainland Pricing and Fees: https://secondlife.com/land/pricing
- Modem World, LL announces Second Life fee changes, 8 Jun 2026: https://modemworld.me/2026/06/08/ll-announces-second-life-fee-changes-reductions-increases/
- Second Life forum, land (2017): https://community.secondlife.com/forums/topic/405018-land/
- The Block, Decentraland will now let you become a virtual landlord, 8 Dec 2022: https://www.theblock.co/post/193353/decentraland-will-now-let-you-become-a-virtual-landlord
- Motley Fool, metaverse land rentals (Dec 2022) and passive income (13 Oct 2022): https://www.fool.com/investing/2022/12/10/metaverse-land-rentals-earn-passive-crypto-income ; https://www.fool.com/investing/2022/10/13/want-thousands-in-monthly-passive-income-consider
- CoinGecko, How Much is Land in the Metaverse? (May 2023): https://coingecko.com/research/publications/metaverse-land-prices
- CryptoSlate, Metaverse land prices down 72% on average from highs (2024): https://cryptoslate.com/metaverse-land-prices-down-72-on-average-from-highs/
- Influencer Marketing Hub, The Sandbox real estate 2024: https://influencermarketinghub.com/sandbox-real-estates
- DappRadar (Sandbox LAND prices, c. 2021): https://dappradar.com/?p=4474
- 8ration, Roblox game development in 2026: https://www.8ration.com/blogs/roblox-game-development-guide/
- rolearn.dev, Roblox vs Fortnite brand activations 2026: https://rolearn.dev/insights/roblox-vs-fortnite-brand-activations-2026
- GamesBeat, Roblox sets CPM-based fees for creator brand deals in 2027: https://gamesbeat.com/roblox-sets-cpm-based-fees-for-creator-brand-deals-starting-in-2027/
- PocketGamer.biz, Roblox creator fee structure from 2027: https://www.pocketgamer.biz/roblox-reveals-creator-fee-structure-for-brand-integrations-from-2027/
- Toolradar, Spatial pricing: https://toolradar.com/tools/spatial/pricing ; G2, Spatial pricing: https://www.g2.com/products/spatial/pricing

Local-business products:
- Google Business Profile: https://www.google.ca/business
- Google Local Services Ads help: https://support.google.com/localservices/answer/6224841?hl=en
- Enrich Labs, Google Local Service Ads guide 2026: https://www.enrichlabs.ai/blog/google-local-service-ads-complete-guide-2026
- The Media Captain, Google Local Service Ad statistics: https://themediacaptain.com/google-local-service-ad-statistics/
- Search Engine Land, Google Ads costs rise again (LocaliQ benchmark): https://searchengineland.com/google-ads-costs-rise-again-but-conversions-improve-report-455663
- WebFX, Yelp advertising costs, 13 Aug 2026: https://www.webfx.com/blog/ppc/yelp-advertising-costs/
- Browser Media, Nextdoor self-serve ads manager: https://browsermedia.agency/blog/nextdoor-self-serve-ads/
- FitSmallBusiness, Etsy seller fees: https://fitsmallbusiness.com/etsy-seller-fees/ ; Craftybase, Etsy fees: https://app.craftybase.com/blog/the-complete-guide-to-etsy-fees
- Shopify pricing: https://www.shopify.com/pricing
- u2l.ai, Linktree pricing 2026: https://u2l.ai/blog/linktree-pricing ; Linktree pricing: https://linktr.ee/s/pricing
- Carrd Pro: https://carrd.com/pro

Pricing patterns and regulation:
- Airbnb, What is Smart Pricing: https://www.airbnb.com/resources/hosting-homes/a/what-is-smart-pricing-594 ; Touchstay, Airbnb smart pricing: https://touchstay.com/blog/airbnb-smart-pricing
- Google Ads Help, Actual cost-per-click: https://support.google.com/google-ads/answer/6297
- Land Transport Authority, Revised ERP rates from 23 March 2026: https://www.lta.gov.sg/content/ltagov/en/newsroom/2026/3/news-releases/revised-erp-rates-23mar26.html
- Torque, ERP rate changes: https://www.torque.com.sg/news/two-erp-charges-gantries-will-rise-may-6/
- WallStreetMojo, Case Shiller Index: https://www.wallstreetmojo.com/case-shiller-index/ ; Wolf Street, 30 Jun 2020: https://wolfstreet.com/2020/06/30/there-sures-a-lot-of-brain-dead-misreporting-about-the-case-shiller-home-price-index-this-morning/
- CalMatters, Big rent hikes illegal in California, Sep 2019: https://calmatters.org/housing/2019/09/big-rent-hikes-illegal-in-california-heres-what-to-know/
- Newsweek, California statewide rent cap and other states: https://www.newsweek.com/california-statewide-rent-cap-other-states-12280904 ; KATU, Oregon rent control bill: https://katu.com/news/local/oregon-renters-landlords-testify-on-bill-that-would-increase-rent-control
- Olshan Frome Wolosky, New York's Algorithmic Pricing Disclosure Act is now in effect: https://www.olshanlaw.com/Advertising-Law-Blog/new-yorks-algorithmic-pricing-disclosure-act-is-now-in-effect
- Kelley Drye, New York's algorithmic pricing disclosure law takes effect: https://www.kelleydrye.com/viewpoints/blogs/ad-law-access/new-yorks-algorithmic-pricing-disclosure-law-takes-effect
- Duane Morris, New York's Algorithmic Pricing Disclosure Act is in effect, Mar 2026: https://www.duanemorris.com/alerts/new_yorks_algorithmic_pricing_disclosure_act_is_in_effect_0326.html
- FTC, Surveillance pricing 6(b) study research summaries, Jan 2025: https://ftc.gov/system/files/ftc_gov/pdf/p246202_surveillancepricing6bstudy_researchsummaries_redacted.pdf ; McCarter & English summary: https://www.mccarter.com/insights/ftc-surveillance-pricing-study-finds-personal-data-is-used-to-set-individualized-consumer-prices-and-generate-higher-profits-for-companies/
- CMA, Ticketmaster: consumer protection case: https://www.gov.uk/cma-cases/ticketmaster-consumer-protection-case ; Lewis Silkin, Jul 2025: https://www.lewissilkin.com/insights/2025/07/09/cmas-probe-into-ticketmasters-pricing-practices-rumbles-on-102krx1

Payments:
- Stripe pricing (US): https://stripe.com/pricing
- Stripe Docs, Supported currencies (minimum charge amounts): https://docs.stripe.com/currencies
- PayPal merchant fees: https://www.paypal.com/c2/webapps/mpp/merchant-fees ; Checkout Page, PayPal fees 2026: https://checkoutpage.com/blog/paypal-fees
