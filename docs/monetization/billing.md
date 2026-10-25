# Billing: phase 4, low-risk monetisation

Phase 4 of the [competitive alignment review](../competitive-research/claimavenue_competitive_alignment_review.md#recommended-implementation-sequence). Everything is paid through Stripe Checkout:

- **Business profiles:** the Launch Pack, Pro and sponsored placements.
- **The game:** leases (claiming, taking over or renewing a plot), building onto a plot's outside, and market stalls ([below](#in-the-game-leases-and-market-stalls)); and the city's ad spaces, billboards and aerial banners ([below](#ad-spaces)).
- **The cart:** any of these together, in one payment ([below](#the-cart)).
- **Promo codes:** discount codes the owner makes in `/admin/promos`, applied at any of these checkouts ([below](#promo-codes)).
- **Disputes and partial refunds:** what a disputed payment bought is paused until the dispute closes; a part refund made in the Stripe dashboard is allocated to what the payment bought ([below](#disputes-and-partial-refunds)).
- **Refunds of unused time:** pro rata, when an account is deleted or an admin refunds it ([below](#refunds-of-unused-time)).

The code is in `services/api/billing.mjs`. The catalogue is in `packages/business-core/src/plans.js`, imported everywhere as `@voxelventure/business-core` ([ADR 0001](../architecture/adr/0001-shared-package-boundaries.md)). The tests are `tests/billing.test.mjs`, `tests/billing-game.test.mjs`, `tests/ads-billing.test.mjs`, `tests/disputes.test.mjs` and `tests/prorata.test.mjs`, which run against a fake Stripe server.

## What is sold

| Product | Price | What the owner gets |
| --- | --- | --- |
| Launch Pack | $9 once | A week in **New this week** at the top of Discover, a highlighted card, a **New this week** badge on the profile page, a share image with a gold frame and a "New this week" label for that week, and a summary of the week on `/business/manage` |
| Pro | $19 a month | Where visitors came from, campaign results, the 30-day chart, CSV export of the figures, and an **offer**: one line at the top of the public page, optionally until a date up to 90 days ahead. When Pro ends the offer is hidden; it is kept, and comes back with Pro. Cancelling stops renewal at the end of the paid month. |
| Sponsored placement | A week: $99 top of Discover, $49 a district page, $29 a category page | A card labelled **Sponsored** at the top of that page. Each spot has three slots, so sponsored cards never fill the page. |
| Ad space in the 3D city | 7 days: $12 a billboard, $29 an aerial banner; 15% off with Pro ($10.20, $24.65) | The whole screen of one billboard or banner for 7 days; nobody else can book it meanwhile, and the holder can add weeks ([below](#ad-spaces)) |

The prices are only ever read from the catalogue. The server charges the catalogue price whatever a browser sends. `tests/packages.test.mjs` checks two things:

- the server and the pages get the very same catalogue object;
- `billing.mjs` holds no prices of its own.

**Not sold, on purpose:**

- **Gold.** The game's currency stays a game reward; nobody can buy it with money.
- **Real-money take-over payouts** (the 1.25x rule). The rule stays a Gold-only game mechanic; [takeover_payouts.md](takeover_payouts.md) explains why.
- **Payouts to a replaced tenant.** A take-over is charged like any new lease, and the tenant it replaces is paid nothing.

## How a payment works

1. **Checkout.** `POST /businesses/<slug>/checkout` with `{ product, placement? }`. The server creates a pending order at the catalogue price and a Checkout session for exactly that amount. The session is created with the idempotency key `vv-order-<id>`. The owner is then sent to Stripe's page. A sponsored slot is held for the 30 minutes the session lives, so two owners cannot pay for the last slot. If it is sold out, the answer is 409.
2. **Webhook.** `POST /billing/webhook`. The server checks the `Stripe-Signature` (HMAC-SHA256, at most 5 minutes old) on the raw body. Each event id is stored in `stripe_events`, so an event is applied once however often Stripe delivers it. Only a webhook, or reconciliation, marks an order paid. The success page only shows the order's status.
3. **Entitlement.** A paid order creates a row in `entitlements`. The Launch Pack and a placement run for 7 days; a second week stacks after the first. Pro runs until the end of the paid period, and each `invoice.paid` extends it.
4. **Reconciliation.** Every hour, and on `POST /admin/billing/reconcile`, the server asks Stripe about orders pending for over two minutes and about Pro plans still active. A lost webhook therefore cannot leave a customer who paid without what they bought, or keep a cancelled plan running.

The webhook handles these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `invoice.paid`
- `customer.subscription.deleted`
- `charge.refunded` (in full or in part: [below](#disputes-and-partial-refunds))
- `charge.dispute.created`, `charge.dispute.updated` and `charge.dispute.closed`

If a slot was oversold anyway (two payments land at the same moment), the later payment is refunded automatically.

## In the game: leases and market stalls

With payments on, these game actions return `{ checkout: { orderId, url, cents } }` instead of happening at once:

| Action | Endpoint | Price |
| --- | --- | --- |
| Claim an empty plot | `POST /plots/<id>/claim` | The lease price for the chosen term: 7, 14 or 30 days (`lib/game/leases.js`), for the land and the outside chosen |
| Take over an ended lease | `POST /plots/<id>/takeover` | The take-over price: 1.25 × the business's 30-day worth, at the term's factor |
| Renew a lease | `POST /plots/<id>/renew` | The renewal price: 10% off a new lease of the same term |
| Build onto the outside (more floors, a roof garden, a dome, a spire) | `POST /plots/<id>/exterior` | The 30-day difference for the rest of the lease, at least $0.50 (`exteriorChangeQuote` in `lib/game/claimPrice.js`). Its order is labelled "Building upgrade: <title> (plot N)" |
| Book a market stall | `POST /market/book` | The stall's price for its slot ($2 to $5) |

Plot prices are in dollars, and the order charges them in cents. A claim, take-over or renewal by an account with Pro on any of its business profiles is 15% less (`PRO_PLOT_DISCOUNT` in `@voxelventure/business-core`; the server checks the entitlements itself, `hasPro` in `services/api/core.mjs`). An outside upgrade has no Pro discount. No lease, take-over, renewal or upgrade is charged under $0.50, Stripe's minimum. The levels: [plot pricing](plot_pricing_scenarios.md). The game sends the player to Stripe and back to `/?paid=<order>`, then tells them how it went.

The outside follows the [price rules](pricing_analysis.md#the-outside-basic-is-free-elaborate-is-priced): a change to the outside that costs no more for 30 days is free and applies at once (`PATCH /plots/<id>`, or `POST /plots/<id>/exterior`, which then opens no checkout). A dearer one through `PATCH` is refused with 402 `exterior_payment_required` and the quote (`{ before, after, diff, charge, lines }`), and the owner's editor offers to pay it.

- **Checked before paying.** Everything the action checks is checked before the player pays: the server runs the action and then undoes it. The price charged is the one the action would write in the ledger.
- **Held while paying.** The plot or stall is held for the player for the 30 minutes the checkout lives:
  - For a plot, the pending order is the hold. Nobody else can claim it or take it over, and they get 409 `held`.
  - For a stall, a pending booking holds it. That booking shows up nowhere until it is paid.
- **Carried out once paid.** The action runs only when the payment is confirmed, by the webhook or by reconciliation. It is written to the ledger and the audit trail as before. The other players are told, and a take-over still emails the tenant it replaced.
- **Too late.** The hold can run out while the player is still paying, and somebody else may claim the plot or book the stall in the meantime. Then the later payment is refunded automatically and the player is told so.
- **Abandoned.** An abandoned or failed checkout frees the plot or stall.

Refunding a game order takes back what it bought:

- **Claim or take-over.** The lease ends at once and the plot opens to others.
- **Renewal.** The lease loses the days the renewal added.
- **Building upgrade.** The outside it replaced comes back, and the plot's value goes down by what the upgrade added.
- **Stall.** The booking is cancelled.
- **Cancelling a paid stall.** A stallholder can cancel before the stall opens, and gets a full refund.

Without Stripe settings, all of these work as before: at once, and free.

## Ad spaces

The city's billboards (one beside the west end of each arterial avenue and one at the north end of the first arterial street, in the band between the plots and the perimeter road) and the two banners the Voxel Air and Skyline Ads planes tow over the whole city. The live city (seed 20260101) has 4 billboards and 2 banners. **Decided** (policy review decision 9): ad spaces are paid, and discounted with Pro.

| Space | 7 days | With Pro | Per 30 days, for comparison |
| --- | --- | --- | --- |
| Billboard | $12 | $10.20 | about $51 |
| Aerial banner | $29 | $24.65 | about $124 |

The prices are `AD_SPACES` in `@voxelventure/business-core` (`adPriceOf(kind, { pro })`), read by the server and the pages. The Pro discount is `PRO_DISCOUNT`, **the same 15% and the same constant as plot leases** (`PRO_PLOT_DISCOUNT` is that constant under its older name): nothing in the existing structure argued for a different rate, and one rule is easier to explain on the Pro pitch ("15% off plot leases and ad spaces").

**Why these levels.**

- **What a space is today.** One advertiser holds a space's whole screen (the server keeps one ad a space; sharing the screen in rotation is only in the local game), and a buy lasted until someone took it over at 1.25 times its game value, however soon. That cannot carry real money: a paid ad must not vanish an hour later. So a booking is **exclusive for a fixed term**, and the term is **7 days**, as for a sponsored week and the Launch Pack.
- **A billboard ($12)** stands at the city's edge where an arterial avenue starts: drivers and walkers coming in see it, but it is not on the web pages. That is like a busy frontage: $12 a week is about $51 for 30 days, the top of a prime plot ($23 to $51 for 30 days, [plot pricing](plot_pricing_scenarios.md)). It is less than a sponsored week on a category page ($29), which everyone browsing the directory sees, including people without a 3D-capable device.
- **An aerial banner ($29)** is seen over the whole city and there are only two: about $124 for 30 days, in the range of a luxury plot ($85 to $135, median $110) and the same as a sponsored week on a category page.
- **Fees and minimums.** Both are well above Stripe's $0.50 minimum, and either alone meets the cart's $4 minimum. Stripe's 30¢ + 2.9% is $0.65 (5.4%) of a billboard week, and less in a cart with other things.
- **To revisit after the pilot,** with the verified views and clicks each space gets (`ad_events`, shown on the billboard card) next to the plots' foot traffic ([plot economy data](plot_economy_data.md)).

**How booking works** (with payments on; `billing.mjs` `payAd`, the bookings in `core.mjs`):

- **Buy.** `POST /ads/<id>/buy` with the ad (`advertiser`, `headline`, `tagline`, `url`, `color`; screened as before) and an optional `promoCode` returns `{ checkout: { orderId, url, cents } }`, Stripe's page for that amount. The order is `product = 'ad'`, `target = 'ad:<id>'`, labelled "Ad space: <road> (7 days)". The billboard card shows the price (the Pro price for a Pro account), **Book for $12 (7 days)**, "Have a code?" and **Add to cart**.
- **Held while paying.** The pending order holds the space for the 30 minutes the checkout lives: anyone else gets `409 held`.
- **Carried out once paid** (the webhook or reconciliation): a booking (`ad_terms`) starts now, the ad goes up, the old advertiser's figures are cleared (the new one starts from zero), and the ledger and the audit trail (`ad.buy`) record it. A payment that arrives after someone else booked the space (the hold ran out) is refunded automatically.
- **While it runs** nobody else can book the space (`409 ad_taken`, with the date it ends). Its holder can book again: the new week starts when the last one ends, and the newest ad shows. When the last week ends the space is empty and anyone can book it. Each slot says what a booking costs and until when it is booked (`sale`: `{ cents, proCents, days, paidUntil, bookedUntil, bookedBy }`).
- **The cart:** `{ kind: 'ad', slotId, input: <the ad> }`. With Pro in the cart the ad line already gets the Pro price, as plot lines do.
- **Promo codes:** the group `ads`.
- **A refund** takes the ad down; a later week of the same holder moves forward by the days given back. A moderator removing the ad ends its booking too.
- **Without payments** (no Stripe settings) ad spaces stay the game's free take-over at 1.25 times the game value, as before, alone or in the cart.

## The cart

Several purchases in one payment (`services/api/cart.mjs`; decided in the [sales funnel proposal](../product/sales_funnel_proposal.md#4-a-cart-in-the-sales-flow)). Stripe charges 30¢ + 2.9% a payment, so **one payment saves 30¢ for every item after the first**: a 7-day ordinary lease, a spire and the Launch Pack paid together cost 60¢ less in fees than paid one by one. Tests: `tests/cart.test.mjs`.

**What can go in it**, one cart per account, kept on the server:

| Line | Counts as a plot | Added with |
| --- | --- | --- |
| Plot lease (claim), take-over, renewal, outside upgrade | yes (at most 3 a cart, each plot once) | `{ kind: 'claim' \| 'takeover' \| 'renew' \| 'exterior', plotId, input }`: `input` is what the plot's own route takes |
| Launch Pack, sponsored week | no | `{ kind: 'launch' \| 'sponsored', business: <slug>, placement? }` |
| Pro (the only subscription) | no (at most once) | `{ kind: 'pro', business: <slug> }` |
| Market stall | no | `{ kind: 'stall', input }`: the booking, as `POST /market/book` takes it |
| Ad space (a billboard or banner, 7 days) | no | `{ kind: 'ad', slotId, input }`: the ad, as `POST /ads/<id>/buy` takes it |

At most 10 lines, and a checkout of at least **$4** (`CART` in `@voxelventure/business-core`). The cart shows what is missing. **Buy now** on a single item works as before, outside the cart, with no minimum.

**Prices are the server's.** The browser never sends one. Each line is priced from the catalogue and the game's pricing code when it is added (to show it), and again at checkout (what is charged). The plot lines are priced by doing the action and undoing it, as a single purchase is. If a price changed in between (a plot's worth moved, the account got Pro some other way), the checkout stops once with `409 price_changed`: the cart now shows the new price beside the old one, and the next checkout charges it.

**Pro in the cart.** The checkout is then one Stripe session in `mode: subscription`: Pro is the recurring line (inline `price_data` with `recurring[interval]=month`, as Pro's own checkout makes it), and every other line is a one-time `price_data` item, which Stripe adds to the first invoice. Without Pro it is a `mode: payment` session with one line per item. The plot lines already get Pro's 15% off, because the same payment buys Pro; the cart shows it as a "Pro discount" line. **Decided:** the discount is applied at checkout, and if the Pro line then fails or is refunded, the plot discount is not clawed back (the lease runs at the price paid).

**Holds.** Adding a line holds nothing. Checking out checks every line again and holds them all at once for the 30 minutes the session lives:

- a plot: its line's order is the hold, as for a single purchase (nobody else can claim it, take it over or start setting it up). A plot another account is setting up (the plot economy's server hold) cannot be checked out;
- a stall: a pending booking;
- a sponsored week: its slot, counted like a single checkout's.

If any line cannot be had, nothing is held, no session is opened, and the answer is `409 cart_unavailable` with `problems`: which lines and why. Checking out again while a cart checkout is open replaces it: the old one's holds are let go and its Stripe page is closed. An expired or failed checkout lets every hold go and keeps the cart.

**Orders.** A checkout makes one **parent order** (`product = 'cart'`: the whole amount, the Stripe session) and a **child order per line** (`orders.parent_id`), each the same order a single purchase makes (`lease`, `market`, `launch`, `pro`, `sponsored`). Each child has its own label, amount, status and audit entries, so the order lists, `/business/manage`, the admin views and the reports work line by line; the per-business sums count the children, never the parent. The tables `carts` and `cart_items` hold the cart itself.

**Fulfilment** happens line by line when the payment arrives (the webhook or reconciliation), with the existing actions. A line that can no longer be done (a plot someone else got after the hold ran out, a stall booked meanwhile, a full spot, a profile that already has Pro) is **refunded on its own**: a partial Stripe refund of that line's amount from the cart's one payment (`amount` on the refund, idempotency key `vv-refund-<line>`). The rest goes through. The lines that were paid leave the cart; lines added after the checkout started stay in it. Webhooks stay idempotent: each event once, and a second event for a paid cart only moves Pro's paid period on.

**Refunds afterwards.** An admin refunds one line with `POST /admin/billing/orders/<line>/refund` (that line's amount), or the whole cart with the parent's id (each line still paid). A Pro line refunded cancels its subscription and refunds Pro's amount from its latest invoice. In subscription mode the session has no payment intent of its own, so the server finds it through the session's first invoice. A full refund made in the Stripe dashboard takes back every line; a partial one is allocated to the lines ([below](#disputes-and-partial-refunds)).

**Without payments** (no Stripe settings): the game's lines (plots, stalls) are done at once when the cart is checked out, all or nothing, as their own routes do without payments. The Launch Pack, Pro and sponsored weeks cannot go in the cart (`503 billing_off`, as their own checkout).

**Where it shows:** a cart button with a count in the game's header and in the business pages' menu, `/cart` (the lines with their prices, the Pro discount, the total, the $4 note, remove buttons and Checkout), and **Add to cart** beside the existing buy buttons: the claim form, a take-over, a renewal, a paid outside upgrade, the market stall form, and the Launch Pack, Pro and sponsored buttons on `/business/manage`.

## Promo codes

Discount codes for **VoxelVenture's own services**, made by the owner in `/admin/promos` (`services/api/promo.mjs`; the pricing rule is `promoDiscount` in `@voxelventure/business-core`, the same function the pages use to show it). Not the merchants' coupons: a business giving its own customers a coupon (`coupon_claims`, [conversions.md](conversions.md)) is a different feature, and nothing here touches it. Tests: `tests/promo.test.mjs`.

**A code** (`promo_codes`): its text (unique whatever the case; stored upper case), **percent** (1 to 100) or an **amount** (cents), the **product groups** it covers, a **minimum total**, **uses in all** (none: unlimited) and **per account** (default 1), a **start** and an **end** (none: no end), **new customers only**, active or not, a campaign and a note, who made it and when.

| Group | Covers |
| --- | --- |
| `plots` | A claim, a take-over and a renewal |
| `outside` | A building upgrade (the outside) |
| `launch` | The Launch Pack |
| `pro` | Pro, **the first month only** |
| `sponsored` | Sponsored weeks |
| `market` | Market stalls |
| `ads` | Ad spaces (billboards and banners) |
| `all` | Everything above |

The groups and which purchase is in which are `PROMO_GROUPS` in `@voxelventure/business-core`, the one place the server and the pages read.

**Applying one.** One code per checkout: "Have a code?" under the price on the claim form, a take-over, a renewal, a paid outside upgrade, the market stall form, a profile's plans on `/business/manage` (the Launch Pack, Pro and sponsored weeks), and the cart. A single checkout sends it as `promoCode` beside what it already sends; the cart keeps it on the server (`POST /cart/promo`). `POST /promo/check` lets a page check a code before paying. The browser never sends an amount.

**The price.** The server prices the code at checkout, every time:

- only on the lines the code covers, and **after** the Pro plot discount and the renewal discount (the code comes last);
- percent: each covered line loses that share, to the cent; amount: the amount, at most what the covered lines cost, shared over them in proportion to their price;
- the minimum total is compared with the whole checkout before the code;
- if what is left to pay is above $0 but under **$0.50** (Stripe's minimum), the discount is made smaller so the payment is exactly $0.50;
- shown as its own line: "Code SPRING25: −$X" on the forms, and its own line in the cart (with each line's share).

**What Stripe is sent.**

| Purchase | How the code is charged |
| --- | --- |
| A one-time line (a lease, take-over, renewal, outside upgrade, stall, the Launch Pack, a sponsored week) | Its `unit_amount` is its price less its share of the code. The order's `cents` is what is charged, `promo_cents` what the code took off |
| Pro (a subscription) | The recurring price stays the catalogue's ($19 a month). The code takes the **first month** down with a Stripe coupon made for that order alone (`POST /v1/coupons`: `amount_off` in cents, `duration: once`, `max_redemptions: 1`, idempotency key `vv-promo-coupon-<order>`) passed in the session's `discounts`. Every month after is charged in full |
| A cart with Pro | Subscription mode as before: the one-time lines at their price less their share; Pro at its full price, its share as the same one-off coupon on the first invoice |

**Free orders.** A checkout the code makes free (a total of $0) opens **no Stripe session**: the order is paid at 0 cents and carried out at once, exactly as a payment would carry it out (`billing.mjs` `comp`), audited as `billing.free_order`, and the player is sent to the same "paid" page (`?paid=<order>`). A cart that is free does every line at once the same way (`mode: 'free'`). **Decided: Pro still goes through Stripe** even when its first month is free: the session completes with nothing to pay (`payment_status: no_payment_required`) and saves a card, so the plan can renew. A free order is not a "customer" for new-customers-only codes, and has no Stripe receipt.

**The cart's $4 minimum** is on the total before the code. A cart that meets it may then cost less than $4, or nothing.

**Uses** (`promo_redemptions`, one per checkout, on the order it made: a single purchase, or a cart's parent order):

| Status | When |
| --- | --- |
| `reserved` | The checkout started. It counts toward the limits at once, so a code with one use left cannot be used in two checkouts at the same time |
| `redeemed` | The payment arrived (the webhook or reconciliation), or a free order was done |
| `released` | The checkout expired, failed or was replaced. The use is free again |
| `voided` | The order was refunded in full. The use is free again |

- Using the same code again while an earlier checkout of yours still holds it **replaces** that checkout: its holds are let go and its Stripe page is closed (as checking out a cart again does).
- A **cart line refunded** on its own takes that line's share off what the code is counted as having given (`cents_off`); the last line refunded voids the use.
- A payment that arrives for a checkout that was given up still counts: the use is redeemed.

**Errors.** **Decided:** one generic answer, `400 promo_invalid` "That code isn't valid.", for every reason a guesser could learn something from: an unknown code, one switched off, not started, ended, used up, or new customers only. A clear reason only where the player already knows the code or can act on it:

- `409 promo_used`: "You have already used this code." (only ever about your own uses);
- `400 promo_not_applicable`: "This code doesn't apply to what you're buying.";
- `400 promo_minimum`: "This code needs a total of at least $X before the discount."

The admin sees the real state of each code in `/admin/promos`.

**Guessing.** Failed tries that get the generic answer are counted **per account and per network** (the network only as a hash, in memory). After `PROMO_TRIES` (default 10) in `PROMO_TRY_MINUTES` (default 15), every code check from that account or network is refused with `429 promo_rate_limited` (and `retryAfterMs`) until the window ends, a right code too. A restart forgets the counts.

**The admin side** (`/admin/promos`, linked from the other admin pages; the API's admin check, the same one as every `/admin` route):

- **Make** one code (one you choose, or generated) or a batch of up to 500 generated codes for a campaign. A generated code is `VV-XXXX-XXXX` (the prefix can change) from letters and digits nobody misreads (no 0, O, 1, I or L), never one that exists. The form's defaults: percent off, everything, one use per account, no total limit, no end.
- **List** with filters (status, group, text, campaign) and each code's usage: uses paid and in checkout, what was taken off, what those orders brought in. **One code** with every use of it.
- **Deactivate and reactivate**; change the **limits, dates, minimum, new-customers flag and note**. What a code takes off and what it covers cannot change once made (every use is priced by the same rule): make a new code instead.
- **Export** the list as CSV. **Copy** a code, or a whole batch.
- Every change is in the audit trail (`promo.create`, `promo.update`, `promo.deactivate`, `promo.reactivate`), and every checkout, payment and refund records the code it used.

**Terms.** The refund policy and the terms say it: one code per checkout, no cash value, it cannot be combined with another code, Pro codes cover the first month only, a code can be withdrawn or changed, and a refund is of what was paid ([`lib/legal/policies.js`](../../lib/legal/policies.js)).

**For the owner to decide:** the defaults above (10 failed tries in 15 minutes; the generic error), whether a code may ever cover more than Pro's first month (a `duration: repeating` coupon), and whether a refunded customer should count as a customer for new-customers-only codes (today they do).

## Disputes and partial refunds

**Disputes (chargebacks).** When a buyer asks their bank to take a payment back, Stripe sends `charge.dispute.created`. The server finds the order the charge paid (a single purchase, or a cart's order and its lines), and for each line still paid **pauses what it bought** while the dispute is open:

| Line | While the dispute is open | Won (or an inquiry closed without a chargeback) | Lost |
| --- | --- | --- | --- |
| Lease (claim, take-over, renewal, outside upgrade) | **Frozen:** the building stays in the city and open to visitors (a dispute is not yet a verdict, and taking a business out of the city would hurt its visitors too), but its owner cannot change it, upgrade the outside, redesign the inside or renew it (`409 disputed`) | Unfrozen | Ended as a refund ends it: a claim or take-over opens the plot, a renewal loses its days, an upgrade is undone |
| Launch Pack, sponsored week | Stops showing (the entitlement is `paused`; a sponsored slot stays counted, so it can come back) | Shows again, to its original end (the paused days are not added) | Ended |
| Pro | Its features stop, and its plan's billing is paused at Stripe (`pause_collection` with `behavior: void`) | Back, and billing resumes | Ended, and the plan is cancelled |
| Market stall | A stall that has not opened yet is cancelled (one that has opened or is over has nothing left to pause) | Booked again if it is still free and still to come | Ended |
| Ad space | The ad is taken down; the space stays booked for its advertiser, so nobody else can book it meanwhile | Up again | Ended; the space is free |

- **The admins are told:** an email to every admin with a confirmed address (set on the Account page) when a dispute opens and when it closes, with the order and what was paused; and **Admin > Disputes** (`/admin/disputes`) lists every dispute, open ones first. Answer a dispute in the Stripe dashboard, before its deadline: this server only records and pauses.
- **Recorded:** a row in `disputes` (the Stripe dispute, the order, the amount, the reason, Stripe's status, what was paused and what became of it), `orders.dispute_id` on the order and its lines, and the audit trail (`billing.dispute_opened`, `billing.dispute_won`, `billing.dispute_lost`). A lost dispute leaves the orders `charged_back`: not counted as paid anywhere, and they cannot be refunded again. A dispute of a payment the server does not know is recorded and the admins are told.
- **Once:** each Stripe event is applied once, and a dispute is opened once and closed once whatever events arrive. `charge.dispute.updated` only records Stripe's status. A `closed` event for a dispute whose `created` event never came opens it and closes it.

**Partial refunds made in the Stripe dashboard.** `charge.refunded` carries `amount_refunded`, everything refunded of the charge so far. What is new (beyond the refunds already recorded: our own refunds are recorded before Stripe reports them, so they are not counted twice) is allocated to the payment's lines:

1. **All of it:** every line still paid is refunded and ended (and the cart's order).
2. **Exactly one line's rest:** a refund of exactly what one line still has paid goes to that line (the latest such), which is ended. A refund of "the stall in that cart" made by hand comes out right this way.
3. **Otherwise, latest line first:** each line it covers in full is ended; the line it covers in part is **partly refunded** and goes on (`orders.refunded_cents`, and a note "$X of $Y refunded"). Pro is allocated last, because ending it cancels the plan. **Decided:** latest first rather than in proportion, so a part refund ends whole things (which is what a refund made by hand usually means) instead of leaving every line a little refunded and nothing ended.
4. **Anything left over** (more than the lines had paid) is recorded on the order and in the audit trail (`billing.refund_unallocated`).

A promo code's counted discount follows: a line refunded in full takes its share (what is left of it) off what the code is counted as having given; one refunded in part takes off the same share of its promo cents; a whole order refunded voids the use. Revenue figures (a business's spend, a code's revenue) count what was paid less what was refunded. An admin refund of an order already refunded in part refunds only what is left. Pro refunded in full from the dashboard has its plan cancelled.

Every refund, in full or in part and by whoever (an admin, the server, the Stripe dashboard), is a row in `order_refunds`. `GET /admin/billing/disputes` lists the disputes and the refunds; `GET /admin/billing/orders/<id>` shows one order, its lines, its refunds and the disputes of its payment (both on `/admin/disputes`). Owners see `refundedCents` on their own orders.

## Refunds of unused time

**Decided (2026-10-24): unused time is refunded, pro rata,** when an account is deleted and when an admin chooses to (`services/api/prorata.mjs`). The rule is one pure function, `prorataLine` in `@voxelventure/business-core` (`packages/business-core/src/refunds.js`), shared by the server, the policy (`lib/legal/facts.js` `MONEY.prorata`) and the tests.

For each order line **actually paid** (a cart's lines one by one), from what was charged for the line (after a promo code and the Pro price) less what was refunded of it already, never more than is left:

| Line | Refund |
| --- | --- |
| Plot lease (claim, take-over, renewal; 7, 14 or 30 days) | unused full days ÷ the term's days × paid. A renewal not started yet (it extends a running lease) counts its whole term as unused |
| Ad space week, sponsored week | unused full days ÷ 7 × paid; a booking not started yet: all of it |
| Pro (monthly) | unused full days of the period paid now ÷ the days in that period × what was paid for it. The period is the calendar month back from the plan's end (not before it started); the first month is the order's amount (a code covers it), later months the full price, less what was refunded in that period |
| Market stall not opened yet | all of it |
| Nothing | the Launch Pack and building upgrades (delivered at once); a stall that has opened; a free or complimentary order; anything refunded in full, or already refunded for its unused time; an order whose payment is disputed (open) or was charged back; every line of an account closed for breaking the rules |

Rounded down to the cent; a line that would give back less than **$1.00** gives nothing. **Stripe keeps its fee** and nothing is taken off the customer's refund for it (the refund policy says so).

**Which time a lease line paid for.** A plot's lease is the chain of its tenant's paid orders since the last claim or take-over, walked back from the lease's end: the latest renewal holds the last days, the one before it the days before, down to the claim. A plot no longer the tenant's has nothing left. (A renewal fully refunded already gave its days back, so it is not in the chain.)

**Where it applies:**

1. **Deleting an account** (`POST /me/delete`, and the admin's `POST /admin/accounts/:id/delete`): before anything is deleted, every eligible line is refunded in Stripe, a partial refund of the payment it was paid with (Pro: its latest invoice; a cart line: the cart's payment), idempotency key `vv-prorata-<order line>`. This is part of the "outside calls first" rule: if Stripe refuses, the answer is 502 and nothing is deleted. A refund Stripe already made before a later one failed is recorded at once (the money went back) and is never made again; the deletion, retried, goes on with the rest. Then the deletion runs as before: leases are released, ad bookings removed, stalls cancelled, Pro cancelled in Stripe at once (`cancelProNow`, which never refunds: no double refund). The confirmation screen (`PrivacyControls`) shows the estimate first ("You'll get back about $X for unused time", line by line, from `GET /me/prorata`), and the answer (`privacy.delete.result` v2) has `refunds`. Each refund is on its order (`refunded_cents`, an `order_refunds` row noted "pro-rata refund of unused time (account deleted)") and in the audit log (`billing.prorata_refunded`; `account.delete` records the total).
   - **Closed for breaking the rules:** the admin's delete form has the box "Closed for breaking the rules" (`rules: true`, contract `privacy.admin-delete` v2): nothing is refunded, and the audit entry says `closedForRules`.
2. **Deleting a business page** (`DELETE /businesses/:slug`, the owner's "Delete page…"; there is no admin page deletion): the same, for the page's own orders (`orders.business_id`: its Pro month and sponsored weeks; the Launch Pack gets nothing by the rule), before the page is erased and its Pro cancelled, with the same guarantees (Stripe first, 502 and nothing deleted on a failure, recorded refunds never repeated, idempotency keys, the $1 minimum, nothing while disputed). **Leases are not refunded:** they belong to the account, and deleting the page only unlinks its plot (the building stays the owner's); ad spaces are the account's too. A page moderation removed for breaking the rules (`status = 'removed'`) gets nothing. The confirmation (`ManageProfiles` `DeletePage`) shows the estimate from `GET /businesses/:slug/prorata` (the owner only), and the answer (`business.delete.result` v2) has `refunds`. Orders are noted "pro-rata refund of unused time (business page deleted)"; `business.delete` in the audit log records the total.
3. **An admin's "Refund unused time"**, for one order (Admin > Disputes, "One order") or every line of an account (Admin > Privacy requests): a preview (`GET /admin/billing/orders/:id/prorata`, `GET /admin/accounts/:id/prorata`; each line, its days unused and amount, or why nothing comes back), then a required reason and the refund (`POST` the same path `{ reason }`). What is refunded **ends at once**: a lease whose time was running is released (the plot goes back to the city; a running lease line takes its later renewals with it), a renewal still to come gives its days back, an ad booking is revoked (a later one moves forward), a sponsored week and Pro stop (Pro's plan is cancelled in Stripe; if that call fails the admin is told to cancel it in the dashboard). Admin-only, audited as a whole (`billing.prorata`, with the reason) and line by line, and idempotent: a second call refunds nothing more, because each refunded line is marked done (its `order_refunds` note starts with "pro-rata").

A refund that leaves a line nothing paid makes it `refunded` (and a cart whose every line is refunded); one that leaves something keeps it `paid` with `refunded_cents`. Stripe's `charge.refunded` for these refunds changes nothing (they are recorded before Stripe reports them). Contracts: `prorata.preview`, `prorata.refund`, `prorata.result` (`@voxelventure/shared-types` 0.17.0). Tests: `tests/prorata.test.mjs` (the rule for each kind of line, deletion, a Stripe failure, the admin's preview and refund, idempotency, what ends, the audit), `tests/privacy.test.mjs`, `tests/legal.test.mjs`, `tests/live-browser.test.mjs` (the estimate on the confirmation screen).

## Refunds and support

- An admin refunds with `POST /admin/billing/orders/<id>/refund`, which uses the idempotency key `vv-refund-<id>`. For Pro, the server cancels the subscription and then refunds the latest invoice. The entitlement is revoked straight away.
- A refund made in the Stripe dashboard arrives as `charge.refunded` and has the same effect.
- `POST /admin/billing/grant/<slug>` with `{ product, placement?, days? }` gives a complimentary entitlement. It creates a zero-cent order that is audited like everything else, for support cases and pilots.
- `GET /admin/billing/orders` lists every order.
- Owners see their own orders, game orders included, with `GET /me/orders` and on `/business/manage`.
- The same from the command line: `npm run moderate -- orders [status]`, `refund <order>`, `grant <slug> <product> [days] [placement] [reason]` and `reconcile`.

Every checkout, payment, refund, grant and revocation is written to the hash-chained `audit_log` ([authoritative_data.md](../architecture/authoritative_data.md)).

## Receipts

Stripe sends the receipts, so VoxelVenture keeps no receipt numbering or tax records of its own.

- Checkout fills in the owner's address when it is verified, and Stripe asks for one otherwise.
- Stripe only emails receipts when they are switched on. In the dashboard, under **Settings > Customer emails**, turn on **Successful payments** and **Refunds**. For Pro, also turn on the emails for paid invoices under **Settings > Billing > Subscriptions and emails**.
- Test mode never emails receipts. Look at the payment in the dashboard instead.

## Settings (`deploy/env/api.env.example`)

| Setting | Meaning |
| --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_…` for trying it out, `sk_live_…` for real money. Without it, payments are off and the upgrade prompts only record interest, as in phase 2. |
| `STRIPE_WEBHOOK_SECRET` | The `whsec_…` of the webhook endpoint. Required with a key. |
| `PUBLIC_SITE_URL` | The site's `https://` address, where Stripe sends the owner back to. |
| `TERMS_URL`, `REFUND_POLICY_URL` | Shown on Stripe's page before paying. Both are required with a live key. |

The API refuses to start in production with an unsafe combination; `npm run check:env` reports it before a deploy.

## Setting it up (needs you)

1. Create the Stripe account and finish its business verification.
2. In **Developers > Webhooks**, add the endpoint `https://<api host>/billing/webhook` and select the events listed above (the three `charge.dispute.*` events too). Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Write the terms, the refund policy, and the advertising and placement terms (the review's P0 list). Publish them and set `TERMS_URL` and `REFUND_POLICY_URL`. *Drafted at `/legal/terms`, `/legal/refunds` and `/legal/advertising`; see `docs/monetization/policy_review.md` for what is left before they can be approved.*
4. Turn on customer emails for receipts (see [Receipts](#receipts)).
5. Try the whole loop with a test key and Stripe's test cards (`4242 4242 4242 4242`): buy, check `/business/manage`, refund, and check that the entitlement goes away. Then switch to the live key.
