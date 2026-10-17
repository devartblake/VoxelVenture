# Pop-up market

The last reserved site (Site 4, ID **SD-0004**, 34 x 30 beside Glass River Drive in the default city) is a pop-up market. People rent a stall or a
pop-up booth for **24, 48 or 72 hours** at one **flat price of $2 to $5**, set by how busy the spot is.

## Site IDs
Every reserved site has a number and an ID code: `SD-0001`, `SD-0002` ... (`layout.reserved[i].number` / `.code`). The ID shows on the site tabs, in
Places, and on the 3D label. One site has `market: true`.

## How many spots fit
On a 34 x 30 site (stall 2.2 x 1.7, booth 1.5 x 1.5, aisles 2.6 wide, a fence 1 in), depending on the layout and the number of gates:

| Layout | Gates | Spots |
| --- | --- | --- |
| Rows along the road | 1 / 2 / 3 | 108 / 90 / 72 |
| Aisles from the gates | (the aisles are the gates) | 112 |
| Plaza | 1 / 2 / 3 | 95 / 72 / 68 |

About a quarter are booths. Wider stalls or aisles mean fewer. Every spot is checked to be reachable on foot from a gate.

## Pricing
Each spot gets a footfall score: how far it is to walk from the gates along the aisles, how near a gate, whether it faces a main aisle, and how central it is.
The spots are ranked and cut into tiers: Prime (15%, $5), Busy (25%, $4), Standard (35%, $3), Quiet (25%, $2). An admin can set a different price for
each tier each week, always between $2 and $5. The price is flat: the same for 24, 48 or 72 hours.

## The weekly layout (admin)
A market week is Monday 00:00 to the next Monday, UTC. For each of the next six weeks an admin chooses the layout style (rows, aisles, plaza), gates, stall and
aisle width, share of booths, a shuffle seed, the four prices and a note, then **Save draft** or **Publish**. A draft is not open for booking. A week nobody set up
shows an automatic layout (the style turns with the week) that can be booked. Once a stall in a week is booked its arrangement is locked (the stall IDs would move); prices
and the note can still change.

In the game: Places > Reserved land > the market, or click the market site. With a game server, the **Set up weeks** tab asks for the admin token (`ADMIN_TOKEN`);
without a server the browser is its own admin and keeps its own market (`lib/market/local.js`).

## Booking
Pick a spot on the plan (or click a stall in 3D), choose 24, 48 or 72 hours and a start (every 12 hours, inside the week), name the stall and book. Sign-in is asked for only
at that point. One account can hold four stalls a week. Bookings can be cancelled until they start. With payments on, booking sends the player to Stripe. The stall is held while they pay, and it is
booked once the payment is confirmed. Cancelling a paid booking before it opens refunds it in full. Without payments, a booking is recorded at its price (`cents`) and nothing is charged. See [billing.md](../monetization/billing.md#in-the-game-leases-and-market-stalls).

## Code
- `lib/market/layout.js`: the plan (`planMarket`), tiers, prices. `lib/market/weeks.js`: weeks and booking rules. `lib/market/local.js`: the same rules in the browser.
- `server/api/market.mjs` and the `/market`, `/admin/market` routes in `server/api/server.mjs`; tables `market_layouts`, `market_bookings`, `market_visits` (`server/api/schema.sql`).
- `lib/state/marketStore.js`, `components/ui/panel/{SitesView,MarketPanel}.jsx`, `components/city/MarketStalls.jsx`.
- Tests: `tests/market-layout.test.mjs`, `tests/market-api.test.mjs`, and the market checks in `tests/browser.test.mjs`.

## What happens after someone books (the whole life of a stall)

1. **Booking.** The stallholder picks a spot, 24/48/72 hours and a start, names the stall and books (sign-in is asked for only then). They get a confirmation email
   (if they have a verified email and notices on).
2. **Setting up.** In *Your stalls* they press **set up shop**: up to eight goods with prices, a one-line offer and a website. It can be done before the stall opens
   and changed while it is open.
3. **An hour before opening** the server emails them ("Your stall A1 opens in 60 minutes"), once. If they are in the game when it opens they see "Your stall is open for
   visitors now" (checked every 30 seconds).
4. **Open.** From its start time until its end time the stall is *open*: its awning shows the owner's colour, goods sit on the counter, and visitors can browse it.
   Publishing a week only opens it for *booking*; a stall is shoppable only while a booking is running on it.
5. **Visiting.** A visitor walks in through a gate (the prompt "Pop-up market: 69 stalls open", press E, or click the market). The stalls are solid, so you walk the
   aisles. Standing at an open stall shows "Browse Sourdough & Sons"; E opens its shop: name, what it sells and prices, the offer and a **Visit website** button.
   Each visitor is counted once an hour (the owner is not counted). Buying happens at the stall or on the stallholder's website: the game does not take payments for goods.
6. **When the time is up** the stall closes by itself: the awning goes back to its price-tier colour, the shop card stops showing, and the spot is free to rent again
   (if nothing else is booked after it). The holder gets a closing email with the number of visitors, and the booking stays in *Your stalls* for two weeks marked "closed".
7. **Next week** the layout may be different (an admin sets it, or the automatic layout turns the style), so stall IDs are only meaningful inside one week.

## Trying it
Without a game server, open the market (Places > Reserved land > the market) and press **Fill with demo stallholders**: about nine in ten spots are let and open now, with
goods, offers and brand colours. Walk to the gate to enter. **Clear demo** removes them.
