# The plot economy's data

[Monetization](README.md) | [Plot pricing: the real price levels](plot_pricing_scenarios.md) | [Billing](billing.md) | [Conversions](conversions.md) | [The pilot](pilot.md)

Status: **recording (2026-10-18).** Written for: the owner, and whoever fits the demand index after the pilot.

The plan is for a plot's price to follow real demand, like a property market: **price = land worth × a demand index**, where the index is 1 for an average plot (the sales funnel proposal, section 5). An index can only be fitted on data, and four kinds of data were missing:
- the claim hold and what happens on the way to a claim (claim intent);
- foot traffic past a plot;
- take-over attempts;
- who would like a plot that is taken ("watch this plot").

All four are now recorded, by `services/api/economy.mjs`, with the shared rules in `lib/game/economy.js`. Nothing here sets a price: the prices stay those of `lib/game/claimPrice.js`, which the server only reads to record the price a player was shown.

## What is recorded

| Data | Table | Recorded when | Why |
| :--- | :--- | :--- | :--- |
| The server's claim hold | `plot_holds` | A signed-in player starts setting an empty plot up | One player at a time can set a plot up. Before, the 3-minute hold was in the browser only, so two players could each think they held the same plot. |
| Steps towards a plot (claim intent) | `plot_intents` | Each step (below) | Demand that didn't convert, and price sensitivity |
| Foot traffic | `street_traffic` (and `traffic_seen`) | Each presence ping, written once a minute | Demand for an empty plot, which has no visits of its own |
| Take-over attempts | `plot_intents` (`kind = 'takeover'`) | The take-over form is opened, priced, paid, completed or refused | Competition for a location |
| Watches | `plot_watches` | A player presses **Watch this plot** on an occupied plot | Excess demand for a location |

The data that was already recorded is read from where it is: verified visits (`events`), store entries (`business_events`), occupancy (`plots` and `ledger`), checkouts (`orders`) and renewals (`ledger`).

### The claim hold

- **`POST /plots/:id/hold`** (signed in), with the setup the claim form shows (`leaseDays`, `buildingType`, `exterior`): holds an empty plot for **3 minutes** for that account.
  - The same account refreshes it: 3 minutes from now again, but never more than **15 minutes** from the start, so nobody can sit on a plot by refreshing.
  - Another account gets **409 `held`** with `secondsLeft`. It can't hold, claim or take the plot over until the hold ends.
  - Holding another plot lets the first one go.
  - Someone paying for the plot (a pending checkout, `billing.mjs`) also blocks a hold.
- **`DELETE /plots/:id/hold`** lets it go (the card was closed or another plot picked).
- **`GET /plots/:id/hold`** says whether it is held and for how long: `{ held, mine, secondsLeft }`. It never says who.
- A hold ends by itself: the minute's sweep deletes run-out holds. A player who wants a run-out hold doesn't have to wait for the sweep.
- **Sign in first:** with a game server, a player who isn't signed in sees **Sign in to claim this plot** (or **to take this business over**) in place of the setup form. After signing in, the form shows by itself. So every setup goes through the server hold, and every abandoned claim is recorded. The offline demo (no server) is unchanged: it keeps the browser's own 3-minute hold.
- **The claim form:** the card takes the server hold 0.8 seconds after the player starts setting the plot up, and again each time the term, the kind of business or the outside changes. It counts down the time the server gives. If someone else holds the plot, it says so, with the time left.

### Steps towards a plot

Each row of `plot_intents` is one step. Its fields:
- `kind`: `claim` (an empty plot), `takeover` (a business open to a buyout) or `occupied` (a business its lease protects: only its card is recorded);
- the account, or the visitor number hashed;
- the network, hashed;
- the price in cents and the lease term, where there is one;
- the time;
- `verified`.

| Step | Who records it | When |
| :--- | :--- | :--- |
| `card_open` | the game (`POST /plots/:id/intent`), signed in or not | A plot's card is opened |
| `open` | the game, signed in | The take-over form is opened (its price is written as a `quote` too) |
| `hold` | the server hold | The player starts setting an empty plot up |
| `quote` | the server, from the setup sent with the hold | The price the claim form shows, and its term. Written when it changes, at most once per price and term in half an hour. **The price is always worked out by the server from the setup; a client never sends a number.** |
| `checkout` | the server | A payment is started (with payments on), at the order's price and term; a claim or take-over in a cart writes it for its own line when the cart's checkout opens (`cart.mjs`), and `failed` when the cart's checkout refuses that line |
| `claimed` / `taken_over` | the server | It happened: at once without payments, or when the payment arrives. At the price in the ledger. |
| `failed` | the server | The claim or take-over was refused with a 409: somebody was first, the price changed, the lease protects it, or someone else holds it |
| `abandoned` | the server | A server hold ended without a claim or a checkout: it ran out, was let go, or the player held another plot. A hold that ended in a checkout isn't abandoned: how the checkout ended is in `orders`. |

**Verified**, as visits are (`core.mjs recordEvent`):
- the page must have pinged presence for a few seconds first (`HUMAN_MIN_AGE_MS`, 3 seconds by default);
- not a known robot;
- not the plot's own tenant;
- at most so many verified steps per network, per plot, per step, per day: card opens 3, take-over forms 3, holds 5, quotes 10.

The same step by the same person within a minute is written once. A step that is not verified is kept but not counted. The steps the server records from what really happened (`checkout`, `claimed`, `taken_over`, `failed`) are always verified. An `abandoned` hold is verified when its `hold` was.

**Signed out:** a visitor who isn't signed in can only send `card_open`. The API refuses a setup step or a quote from them (400, and 401 for `open`), because the setup form asks them to sign in first. So the whole funnel after the card is of signed-in players, and every hold that is given up is recorded as `abandoned`.

### Foot traffic

**The area.** Traffic is counted per **area: a 24 × 24-unit square of the city map**, numbered by its column and row (`'-2:3'`, `lib/game/economy.js areaOf`).
- **A plot's area** is the square its centre is in.
- **The size:** 24 units is about a block. In the default city it makes 99 areas with plots, with a median of 7 plots each.
- **Why a grid and not the streets:** the grid needs no street data. The game, the API and the report all work it out the same way from a position, and it doesn't change when the street plan does. A street runs through several areas, and an area holds the plots on both sides of its streets, so an area's traffic is the traffic in front of its plots.
- **What a group counts:** in the report, a group's traffic (a tier, a district) is that of the areas its plots stand in. An area with plots of two districts counts for both.

**How it is counted:**
1. **The game samples** the player's position every 2 seconds while they are outdoors (not inside a building: going in is a visit, not a pass) and the tab is visible (`lib/data/presence.js`).
2. **The areas passed** go with the next presence ping, every 15 seconds: at most 16, the latest kept.
3. **The server keeps them in memory** and writes them once a minute, and when it shuts down. Nothing is written per frame or per ping.
4. **`street_traffic(day, area_id, passes, players)`:**
   - **players:** the distinct players in the area that day;
   - **passes:** a player counted once an hour per area.
   - So a player who walks up and down a street all afternoon is 1 player and 4 passes, not hundreds.
5. **`traffic_seen`** remembers who was already counted in an area that day. That way a player is counted once however often they pass and however often the server restarts. "Who" is a salted hash of the presence id. It is deleted after 2 days.

**Verified:**
- the presence ping turns robots away;
- the player must have been present for a few seconds first;
- at most 3 players per network per area per day;
- a player is never counted in an area where their own building stands.

### Watch this plot

- **`POST`, `DELETE` and `GET /plots/:id/watch`** (signed in): `{ watching }`. For the plot's tenant, `GET` also gives `watchers`: how many watch.
- **What can be watched:** a business can be watched by anyone but its tenant, up to 20 plots per account. An empty plot can't be watched: it can be claimed.
- **On the card:** an occupied plot's card has a **Watch this plot** button, which turns to **Watching** once pressed.
- **The emails:** a watcher is emailed:
  - when the plot's lease ends (its grace days begin: `GRACE_DAYS` in `lib/game/leases.js`, and the email quotes that number);
  - when it opens to a buyout;
  - when someone takes it over.
  - The lease emails are sent **once per lease end:** a renewed lease that lapses again is a new event. The take-over email is sent once per take-over.
  - They go through the same outbox and address rules as the lease notices: only to a confirmed address with notices on (`engage.mjs noticeAddress`).
- **After a take-over:** the new tenant's own watch ends. **The other watchers keep watching:** the plot has a new lease, and its end is their next chance. The email says so and how to stop.
- **Who sees what:**
  - **Other players:** nothing.
  - **The tenant:** how many players watch their plot, on their own building's card. Never who.
  - **Admins:** who watches. `GET /admin/plots/:id/watchers` gives each watcher's account id, username and since when, and the report's most-watched list names them.

## The report: `GET /admin/economy`

- **The request:** `GET /admin/economy?from=YYYY-MM-DD&to=YYYY-MM-DD`, with the admin token.
  - The days are UTC, both included.
  - Without dates, it covers the last 30 days. At most 366 days at a time.
- **On a page:** `/admin/economy`, linked from the pilot dashboard.
- **What it covers:** every plot that can be leased (not Old Town's houses, not the headquarters), per tier, per district and in all:

| Figure | Definition |
| :--- | :--- |
| `plots`, `occupied`, `vacant`, `vacancyRate` | Now |
| `meanDaysEmpty` | The days each plot was empty within the range, averaged over the group's plots. A plot is empty until its first claim in the ledger (a claim is only ever of an empty plot), or all along if it is empty now. A plot that started with the city's own business was never empty. No plot is emptied again: a lapsed lease waits for a take-over. The world's start is the seed time (the oldest `updated_at` of the plots). |
| `vacantForDays` | How long the vacant plots have been empty: since the world's start |
| `visits`, `storeEntries` | Verified building visits; verified store entries of the profiles linked to the plots |
| `traffic` | `passes` and `players` summed over the group's areas and days; `areas` is how many areas |
| `claim.steps` | The people who reached each step for each plot, summed over the plots. A person is an account, a hashed visitor number, or failing both a network. Verified steps only. |
| `claim.conversion` | `cardToHold`, `holdToQuote`, `quoteToCheckout`, `checkoutToClaim`, `quoteToClaim` (which works without payments, where there is no checkout) and `cardToClaim`; `null` when there is nothing to divide by |
| `claim.medianQuoteCents` | The median of the verified quotes in the range |
| `takeover` | `cardOpens` (of businesses open to a buyout or leased); `attempts` (take-over forms opened); `quotes`; `checkouts`; `completions` (take-overs in the ledger); `failed` (refused, plus take-over orders refunded because they could no longer be done); `abandoned` (attempts that neither completed nor failed) |
| `orders` | The claim and take-over checkouts started in the range: `started`, `paid`, `expired`, `refunded` |
| `renewals` | Renewals in the ledger |
| `lapses` | Players' leases that ended in the range and are still not renewed |
| `watchers`, `watchedPlots` | Now |

It also lists the 10 most watched plots, with who watches each (`watchedBy`: account id and username), and the 10 busiest areas, with how many plots each area holds.

## Retention

| Data | Kept |
| :--- | :--- |
| Raw steps (`plot_intents`) | **180 days**, then deleted by the hourly clean-up. That is long enough for the 4 to 8 pilot weeks and a fit, and to compare the same months a year apart via the report's totals. |
| Daily traffic counts (`street_traffic`) | Kept: numbers per area per day, nobody in them |
| Who was already counted in an area (`traffic_seen`) | **2 days** (hashed) |
| A claim hold (`plot_holds`) | Until it ends (3 minutes, at most 15) |
| Watches (`plot_watches`) | Until the player stops watching or takes the plot over |

No new personal data: the account id, or the visitor number and the network address hashed with `IP_SALT`, as the visit figures already keep them. The privacy policy and the retention table (`lib/legal/policies.js`, `lib/legal/retention.js`) say what is kept and for how long, and `tests/legal.test.mjs` checks the numbers against the code.

## How it feeds the demand index

After 4 to 8 weeks of the pilot at fixed prices:
1. **The demand signals for a plot:**
   - verified visits and store entries (an occupied plot);
   - foot traffic in its area (every plot, the one signal an empty plot has);
   - card opens, holds and quotes (interest);
   - watchers (interest in a taken plot);
   - take-over attempts;
   - how long it stayed empty;
   - renewals against lapses.
2. **Price sensitivity:** quotes against claims, by term and price (`quoteToClaim` and the median quote by tier). That shows whether the dear tiers lose people at the price.
3. **The fit:** the index is fitted per district and tier first (the report's groups), then per area where there is enough traffic. It is shown to the owner as a report before it sets any price, and moved at most ±10% every 30 days, as the proposal says.

## Code and tests

- **Server:** `services/api/economy.mjs`, with the tables in `services/api/schema.sql`, created in place on an existing database.
- **Server hooks:** small and separate.
  - `server.mjs`: the routes; claims and take-overs wrapped in `economy.tracked`; `afterPaid`; the presence ping; the minute and hour timers.
  - Nothing in the pricing code changed.
- **Shared:** `lib/game/economy.js`.
- **Game:** `lib/data/economy.js`, `lib/data/presence.js`, `apps/web/components/ui/PlotCard.jsx`, and `lib/state/claimHoldStore.js`.
- **Admin page:** `apps/web/app/admin/economy/page.jsx`.
- **Contracts** (`@voxelventure/shared-types` 0.8.0): `economy.plot-hold`, `economy.plot-hold.result`, `economy.plot-hold.state`, `economy.plot-intent`, `economy.plot-intent.result`, `economy.presence-ping`, `economy.plot-watch`, `economy.plot-watchers` and `economy.report`.
- **Tests:** `tests/economy.test.mjs`, which covers:
  - hold conflicts, refresh, the 15-minute ceiling and expiry;
  - steps verified and capped;
  - a quote never priced by the client;
  - take-overs and refusals;
  - a paid claim;
  - traffic aggregation, the flush and the caps;
  - a watch's emails (lease end, open to a buyout, take-over), each sent once, and who sees the watchers;
  - the report's figures on a seeded database.

  Also `tests/contracts.test.mjs`, `tests/migration.test.mjs`, `tests/legal.test.mjs`, and `tests/live-browser.test.mjs` (signing in before the setup, and the server hold).

## Decided (2026-10-18)

- **The hold ceiling:** 15 minutes.
- **Watchers are told about a take-over** too, and keep watching afterwards.
- **Who sees the watchers:** the tenant sees a count, admins see who.
- **Signing in first:** with a game server, a player signs in before setting a plot up.

## Still open

- **The area size** (24 units). A smaller square tells plots apart better, but needs more traffic before its figures mean anything.
- **Raw intents kept 180 days.**
- **Whether a watcher should also be told** when an empty plot near a watched one opens.
