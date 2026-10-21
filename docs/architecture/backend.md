# Backend (tasks 2-4): database, accounts and claiming, events and statistics

Written for: whoever runs or extends the server. The stack is deliberately plain (Node + SQLite, no accounts to create) so it runs now; the schema is portable to Postgres/Supabase, and only `services/api/db.mjs` and the SQL in `core.mjs` would change.

```
npm run api          node --experimental-sqlite --no-warnings services/api/server.mjs  (port 3002)
```
The database is Node's built-in `node:sqlite`. On Node 24 (the development machine) it works without `--experimental-sqlite`; the flag is kept for older Node 22 releases and does no harm.

`API_PORT`, `API_HOST` (default every interface; `127.0.0.1` behind a reverse proxy), `API_DB` (file or `:memory:`; default `services/api/data/voxelventure.db`, git-ignored), `API_SEED` (the world's seed), `API_ORIGIN` (CORS: set it in production).

## What it does
- **Seeds the world from the game's own generator** (`generateCity`, loaded through `scripts/lib-loader.mjs`), so plot ids, prices and starting businesses match the client exactly: 855 plots, 401 built, for the default seed (20260101).
- **Accounts:** `POST /auth/signup`, `/auth/login`, `/auth/logout`, `GET /me` (the account carries `pro`: one of its business profiles has Pro, so its plot leases cost 15% less). Passwords are hashed with scrypt and a salt; sessions are random tokens (only their hash is stored), valid 30 days. Names are 3-20 letters/numbers/-/_, unique ignoring case. Login attempts are rate limited.
- **Directory:** `GET /plots?sort=value|visits|plot|name&q=&limit=&offset=` (numbered 1 to N, plus rank), `GET /plots/{id}`.
- **Claim and take over, atomic:** `POST /plots/{id}/claim` and `/takeover` run in one `BEGIN IMMEDIATE` transaction. Ten players racing for one lot: exactly one wins, the rest get `409 already_owned`. A lease is 7, 14 or 30 days, priced from the plot's 30-day price ([plot pricing](../monetization/plot_pricing_scenarios.md)); an account with Pro pays 15% less (`hasPro` in `services/api/core.mjs`). A take-over costs 1.25x, pays out and logs the old owner, counts, and refuses a stale price (`expectedPrice`). Titles, websites (`http(s)` only), types and logos are validated with the same rules as the game (`lib/game/logos.js`).
- **Edit your business:** `PATCH /plots/{id}` (logo, description and the outside; owner only; the price and owner cannot be changed). An outside that costs more for 30 days than the one the building has is refused with `402 exterior_payment_required` and its quote (`{ before, after, diff, charge, lines }`); a cheaper or equal one applies at once and moves the plot's value by the difference.
- **Build onto the outside:** `POST /plots/{id}/exterior { exterior }` (owner only, while the lease runs or can be renewed, else `403 lease_ended`): pays for a more elaborate outside for the rest of the lease (a ledger row of kind `exterior`, audit `plot.exterior`), and the plot's value (its price for 30 days) goes up by the 30-day difference. With payments on it answers with a Stripe checkout ([billing.md](../monetization/billing.md)). Prices: [pricing_analysis.md](../monetization/pricing_analysis.md#the-outside-basic-is-free-elaborate-is-priced).
- **History:** `GET /plots/{id}/history`, from the ledger (every opening, claim and take-over, with who was paid out; renewals and outside upgrades are the same tenant paying again, so they are not listed or counted as owners).
- **Events and statistics:** `POST /events { plotId, kind: visit|click, source: street|billboard|banner|search|friends, seconds }` (a visitor's repeat within a minute is not counted again) and `GET /plots/{id}/stats` with thirty real days: visits, visitors, clicks, click rate, average time inside, busiest hour and day, sources. Same shape as the game's simulated figures, with `simulated: false`.
- **Presence and site statistics** (`services/api/stats.mjs`): the game pings `POST /presence/ping` every 15 seconds while the tab is visible; `GET /stats/overview` (the Statistics panel: online now, arrivals, countries) and `GET /world/stats` read from it. Tested in `tests/stats.test.mjs`.
- **Audit trail and production settings** (`services/api/audit.mjs`, `config.mjs`): every claim, take-over, edit, renewal, ad purchase, booking, report, moderation decision, ban and newsletter is recorded in an append-only, hash-chained `audit_log`, in the same transaction as the change; `GET /admin/audit?target_kind=&target_id=&action=&actor=&before=` and `GET /admin/audit/verify` (admin). In production the API refuses to start with unsafe settings. See [authoritative_data.md](authoritative_data.md). Tested in `tests/authoritative.test.mjs`.
- **Free business profiles and referral links** (`services/api/business.mjs`): `POST /businesses`, `GET /businesses?category=&district=&q=`, `GET|PATCH /businesses/{slug}`, `PUT /businesses/{slug}/plot`, `POST /businesses/{slug}/events`, `POST /businesses/{slug}/interest`, `GET /businesses/{slug}/leads`, `GET /me/businesses`, `GET /me/referrals`, and `ref` on `POST /auth/signup`. See [business_funnel.md](../product/business_funnel.md). Tested in `tests/business-api.test.mjs`.
- **Leases, voting, the hunt and the market** (`services/api/community.mjs`, `market.mjs`): see [community.md](../product/community.md) and [market.md](../product/market.md).
- Limits: 150 KB bodies, 240 requests a minute per address, 20 auth calls a minute.

## Ad slots (billboards and aerial banners)
Tables `ad_slots`, `ad_ledger`, `ad_events`, seeded from the game's billboards and banners (6 slots in the default city: four billboards and two banners). `GET /ads`, `GET /ads/{id}`, `GET /ads/{id}/history`, `POST /ads/{id}/buy` (an open slot at its price, or a take-over at 1.25x: atomic, validated, refuses a stale `expectedPrice`, pays out and logs the old advertiser, and the new advertiser's numbers start from zero) and `POST /ad-events { slotId, kind: view|click }`. Tested, including ten players racing for one slot.

## How the game uses it (task 5)
Set `NEXT_PUBLIC_LIVE_API_URL=http://localhost:3002` and build. Then:
- the game fetches `GET /plots/state` (every plot and ad slot) at once and every 15 seconds, so owners and ads are the server's (`lib/data/sync.js`);
- **nobody has to sign in to look around**. The sign-in form (`apps/web/components/ui/AuthDialog.jsx`) opens only when someone presses **Claim**, **Take over** or **buy an ad space**; after signing up or in, the action carries on by itself. The username field disappears from the forms: the account is the name. The header shows the signed-in name with *sign out*;
- claims, take-overs and ad purchases go through the server; losing a race shows the winner at once;
- visits, website clicks and ad views are sent to the server.
Without the variable the game is single-player exactly as before. `tests/live.test.mjs` drives the client against a real server; `node tests/live-browser.test.mjs` does the whole thing in a real browser (it rebuilds the app with the server address: run `npm run build` afterwards).

## Engagement: offers, leads, feedback, quests and email

All in `services/api/engage.mjs`; screens in `apps/web/components/interior/LiveStorefront.jsx`, `apps/web/components/ui/panel/AccountView.jsx` and the Online view. Tests: `tests/engage.test.mjs` (52 checks, starts the API, the presence server and a mail receiver) and the browser test.

- **Storefronts** (`GET/PUT /plots/{id}/storefront`): a business's coupon, visit quest, video and game demo, stored on the plot. The city's own businesses get the offers the generator made for them; a new owner starts with none. Videos and games go through the same embed rules as the game. A coupon's code is hidden until the visitor claims it.
- **Coupons** (`POST /plots/{id}/coupon`): limited stock, one per visitor (account or anonymous), atomic: eight visitors racing for the last two coupons give exactly two winners. The owner cannot claim their own.
- **Quests with budgets:** the owner moves Gold from their wallet into the business's quest budget (`quest/fund`); a visitor with an account starts the visit (the server keeps the clock), then completes it after the time the quest asks for, and is paid out of the budget (`quest/start`, `quest/complete`). Too early is refused, once per visitor per business, nothing is paid when the budget is empty (the quest then shows as stopped), and the owner cannot earn from their own. A take-over returns what is left in the budget to the old owner. New accounts start with 100 Gold; every movement is in `gold_ledger` (`GET /me/wallet`). **This wallet is the server's; the game's own Gold (daily chest, clothes) is still local.**
- **Feedback board** (`POST /plots/{id}/feedback`): signed-in visitors, 3-280 characters, one every 20 seconds and 10 a day; the owner can hide a message (hidden ones vanish for visitors).
- **Lead capture** (`POST /leads`): email sign-ups for a business, an ad space or the world newsletter, with **double opt-in**: a confirmation email goes out first and only confirmed addresses are ever used or shown to an owner (`GET /plots/{id}/leads`, `/ads/{id}/leads`; owners only). Links in the email confirm (`/leads/confirm`) and unsubscribe (`/leads/unsubscribe`).
- **Email** (`outbox` table, delivery worker every 5 seconds, 3 tries): confirmation of a sign-up, verification of an account's email, a **take-over notice** to the old owner of a plot or an ad space (only to a verified address with notices on), and the **Plot of the Day newsletter** to confirmed world readers and to accounts with notices on (`POST /admin/newsletter` with `ADMIN_TOKEN`, or `npm run newsletter` from a scheduler; sent once a day). Transport: `MAIL_WEBHOOK_URL` (+ `MAIL_WEBHOOK_TOKEN`, `MAIL_FROM`) posts JSON to any mail API or relay; without it messages are written to `services/api/data/outbox/`. `PUBLIC_API_URL` is the address used in the links.
- **Social presence:** the API tells the presence server about every claim, take-over, ad purchase and storefront change (`MP_NOTIFY_URL`, `MP_NOTIFY_SECRET`) and it **pushes it to every connected game at once** (the game refreshes immediately; the 15-second poll remains as a fallback). A signed-in player's avatar name is their account name. **Spatial chat:** `chat` messages are heard by players within 60 units (`MP_CHAT_RADIUS`), one a second, in the Online view.
- The game: signing up takes an optional email; the header shows your name and Gold and opens the **Account** view (email and its confirmation, notices on/off, wallet history).

## Moderation, owner sign-ups and Credits (`services/api/moderation.mjs`)
- **Content filter:** everything a player writes is checked before it is saved: a word list (a starter list; add more with `MODERATION_WORDS_FILE`, one per line; disguised words like `v1agra` and `v.i.a.g.r.a` are caught), limits on links (one in a feedback message or description, none in names and headlines), no all-capitals shouting and no long runs of one character. A refusal is a 422 with a message for that field. For pictures and harder cases, set `MODERATION_WEBHOOK_URL` and every text and uploaded logo image is also sent to an outside moderation service (`{ kind, text | image }` -> `{ allowed, reason }`); if it cannot be reached the content is allowed and left to reports.
- **Reports:** a signed-in player reports a feedback message, a business or an ad space (spam, offensive, misleading, other), once each; you cannot report your own. (Chat messages are reported through `/messaging/reports`: see below.) Three different players reporting a message **hide it at once**; the owner cannot bring back a message a moderator hid.
- **Admin queue:** `GET /admin/reports` (grouped, most reported first, with the text and author) and `POST /admin/reports/{id}/resolve` with `dismiss`, `remove` (a message hidden, a business's name, logo, description and offers reset, an ad space emptied for sale again) or `ban`. A **banned account** is signed out everywhere and cannot sign in. Use `npm run moderate` (`list`, `resolve <kind> <id> <action>`, `ban <account id>`, `unban`) with `ADMIN_TOKEN`. In the game there is a **Report** button on feedback messages, on a business's card and on ads.
- **Your sign-ups screen:** the Account view lists every sign-up for everything you own (businesses and ad spaces): confirmed addresses with dates, how many are waiting to confirm and how many left, and a **Download as CSV** (cells that could run as spreadsheet formulas are neutralised). `GET /me/leads`.
- **Credits:** the server's money for visit quests is now called **Credits** everywhere (quest wallet, budgets, rewards) so it is never confused with the **Gold** the game itself earns and spends (chest, hunt, clothes), which stays local. The two are separate currencies by design.
- Tests: `tests/engage.test.mjs` (about 80 checks including the filter, reports, the auto-hide, the queue, a ban and the sign-ups list), `tests/csv.test.mjs`, and the browser test.

## The pilot (`services/api/pilot.mjs`)

The pilot dashboard for phase 6 ([pilot.md](../monetization/pilot.md)).

| Route | Who | What |
| --- | --- | --- |
| `GET /admin/pilot?weeks=4&all=0` | Admin | Each pilot business week by week: activation, the owner's weekly return, verified views, qualified visits, presses, leads, coupon claims and redemptions, purchases, verified revenue, payments and renewals, and the merchant's feedback. Also the verdict on the five criteria that lift the world freeze. |
| `GET /admin/pilot.csv` | Admin | The same, as a spreadsheet |
| `POST /admin/pilot/members`, `DELETE /admin/pilot/members/<slug>` | Admin | Who takes part. Recorded in the audit trail. |
| `POST /businesses/<slug>/pilot-feedback` | The owner of a pilot business | The weekly check-in. One per week; sending again replaces it. |

- **Owner activity:** loading `GET /me/businesses` or changing a profile records the owner's visit for that week (`owner_activity`).
- **The pilot box:** each profile there has `pilot` (`null` unless it is in the pilot).
- **Tables:** `pilot_members`, `owner_activity`, `pilot_feedback`.
- **Command line:** `npm run moderate -- pilot [weeks | add <slug> [note] | remove <slug> | csv]`.
- **Tests:** `tests/pilot.test.mjs`.

## The plot economy's data (`services/api/economy.mjs`)

What a demand index will be fitted on after the pilot ([plot_economy_data.md](../monetization/plot_economy_data.md)). Nothing here sets a price.

| Route | Who | What |
| --- | --- | --- |
| `POST /plots/<id>/hold` | Signed in | Hold an empty plot for 3 minutes while setting it up, or refresh the hold (at most 15 minutes from its start). Body: the setup (`leaseDays`, `buildingType`, `exterior`), which the server quotes. Another account's hold: `409 held` with `secondsLeft`. |
| `GET /plots/<id>/hold`, `DELETE /plots/<id>/hold` | Anyone / the holder | Whether it is held and for how long (never by whom); let it go |
| `POST /plots/<id>/intent` | Anyone (`open`: signed in) | A step only the game sees: `card_open`, and `open` (the take-over form). Verified like a visit. Setting a plot up is the hold, which needs an account, so a visitor's setup step or quote is refused. A price is never taken from the client. |
| `GET`, `POST`, `DELETE /plots/<id>/watch` | Signed in | Watch an occupied plot: an email when its lease ends, when it opens to a buyout and when it is taken over, once each. For the tenant, `GET` gives how many watch (never who). |
| `GET /admin/plots/<id>/watchers` | Admin | Who watches a plot: account id, username, since when |
| `GET /admin/economy?from=&to=` | Admin | Per tier and per district: plots, vacancy, verified visits and store entries, foot traffic, the claim funnel with its conversion rates, the median quote, take-over attempts and completions, renewals and lapses, watchers |

- **Hooks elsewhere:**
  - `POST /plots/<id>/claim` and `/takeover` are refused while another account holds the plot. Their outcome (checkout, claimed or taken over, refused) is recorded through `economy.tracked`.
  - A paid one is recorded when the payment arrives (`afterPaid`).
  - `POST /presence/ping` takes the optional `areas` the game passed through outdoors. They are counted in memory and written once a minute.
- **Jobs:** every minute, run-out holds are let go and watchers' emails are queued. Every hour, raw intents older than 180 days and traffic's "already counted" rows older than 2 days are deleted.
- **Tables:** `plot_holds`, `plot_intents`, `street_traffic`, `traffic_seen`, `plot_watches`.
- **Tests:** `tests/economy.test.mjs`.

## The cart (`services/api/cart.mjs`)
Several purchases in one Stripe payment ([billing.md](../monetization/billing.md#the-cart)). One cart per account; every line is priced on the server when it is added and again at checkout. Contracts: `cart.*` in `@voxelventure/shared-types`.

| Route | Who | What |
| --- | --- | --- |
| `GET /cart` | Signed in | The lines (each with its price, the Pro discount on it, and the old price if checkout found it changed), the subtotal, the Pro discount, the total, `missingCents` to the $4 minimum, `ready`, and a checkout still open (`pending`) |
| `POST /cart/items` | Signed in | Add a line: `{ kind, plotId?, business?, placement?, input? }` (kinds: `claim`, `takeover`, `renew`, `exterior`, `launch`, `pro`, `sponsored`, `stall`). Checked and priced now; holds nothing. `409 plot_in_cart`, `too_many_plots` (3), `pro_in_cart`, `already_in_cart`, `cart_full` (10), or the purchase's own refusal. The business products need payments on (`503 billing_off`). |
| `DELETE /cart/items/<id>`, `DELETE /cart` | Signed in | Remove a line; empty the cart |
| `POST /cart/checkout` | Signed in | Payments on: every line checked and held at once, one parent order (`product = 'cart'`) with a child order per line (`orders.parent_id`), and `{ checkout: { orderId, url, cents, mode } }` (`subscription` with Pro, else `payment`). Payments off: the lines done at once, `{ done, cart }`. Refused with `409 cart_unavailable` (`problems`: which lines and why; nothing held), `price_changed` (the cart now shows the new prices) or `below_minimum` (`missingCents`). |

- **Hooks elsewhere:** the webhook and reconciliation fulfil a paid cart line by line and refund a line that can no longer be done on its own (`billing.mjs` `markCartPaid`, `refundOrder`); a claim or take-over line writes the plot economy's `checkout` step when the session opens, and `failed` when checkout refuses it (`economy.onCartLine`).
- **Tables:** `carts`, `cart_items`; `orders.parent_id`.
- **Tests:** `tests/cart.test.mjs`.

## Promo codes (`services/api/promo.mjs`)
Discount codes the owner makes for VoxelVenture's own services, applied at any checkout ([billing.md](../monetization/billing.md#promo-codes)). Not the merchants' coupons. Contracts: `promo.*` in `@voxelventure/shared-types`; the pricing rule and the product groups are in `@voxelventure/business-core` (`promoDiscount`, `PROMO_GROUPS`).

| Route | Who | What |
| --- | --- | --- |
| `POST /promo/check` | Signed in | `{ code, kind?, cents? }`: does the code work for this purchase (`kind`: a cart kind; none: anything)? `{ code, kind, value, label, appliesTo, groups, minSubtotalCents, expiresAt }`, never its limits. Refused with `400 promo_invalid` (generic), `409 promo_used`, `400 promo_not_applicable`, `400 promo_minimum`, or `429 promo_rate_limited` |
| `promoCode` on `POST /plots/<id>/claim`, `/takeover`, `/renew`, `/exterior`, `POST /market/book`, `POST /businesses/<slug>/checkout` | Signed in | The code for that checkout: priced and its use reserved with the order. The answer's `checkout` (or, for a business product, the answer itself) carries `promo: { code, cents }`; a checkout the code made free has `cents: 0`, `free: true` and `url` the paid page (no Stripe session) |
| `POST /cart/promo`, `DELETE /cart/promo` | Signed in | `{ code }`: put one code on the cart (checked on its lines now; another replaces it), or take it off. Answers with the cart (`cart.view` v2: `promo`, and each line's `promoCents`). `POST /cart/checkout` checks it again and refuses with the code's reason and the cart; a free cart answers `mode: 'free'` |
| `GET /admin/promos` | Admin | The codes with their usage; filters `status`, `q`, `group`, `campaign` |
| `POST /admin/promos` | Admin | Make one code (`code`, or generated) or `count` generated ones (up to 500): `{ kind, value, appliesTo, minSubtotalCents, maxRedemptions, perAccountLimit, startsAt, expiresAt, newCustomersOnly, campaign, note, prefix }`. `409 promo_exists` |
| `GET /admin/promos/<id>` | Admin | One code and every use of it |
| `PATCH /admin/promos/<id>` | Admin | Its limits, dates, minimum, new-customers flag, note or `active`. `400 promo_fixed` for what it takes off or covers |
| `POST /admin/promos/<id>/deactivate`, `/reactivate` | Admin | Switch it off or on |
| `GET /admin/promos.csv` | Admin | The list (same filters) as a spreadsheet |

- **Hooks elsewhere:** `billing.mjs` reserves a use with the order (`applyPromo`, `insertOrder`; a cart's parent order in `cart.mjs`), redeems it when the order is paid (`markPaid`, `markCartPaid`), releases it when the checkout expires or fails (`expire`), and voids it on a full refund or lowers it on a cart line's refund (`revoke`). A free checkout is carried out at once by `billing.comp`. Pro's first month is a one-off Stripe coupon (`openSession` `couponCents`).
- **Settings:** `PROMO_TRIES` and `PROMO_TRY_MINUTES`: failed tries allowed per account and per network, and the window (10 in 15 minutes).
- **Tables:** `promo_codes`, `promo_redemptions`; `orders.promo_code`, `orders.promo_cents`, `carts.promo_code`.
- **Tests:** `tests/promo.test.mjs`.

## Chat and private messages (`services/api/messaging.mjs`)
Built from [chat_messaging_plan.md](chat_messaging_plan.md) (phases 0 to 3). The API keeps everything that lasts or needs an account; the presence server only passes nearby lines on.
- **Signed-in chat:** `POST /messaging/ticket` gives a signed-in game a one-use ticket (a minute); the presence server redeems it (`/internal/messaging/redeem`, with `MP_NOTIFY_SECRET`) and from then on that connection speaks as the account. Every half minute it asks which bindings are still good (`/internal/messaging/bindings`): signing out or a ban ends them.
- **Nearby lines:** before a signed-in player's line goes out, the presence server asks `/internal/messaging/nearby`: the word filter (and no links), 20 lines a minute per account across all their tabs, blocks both ways among the players in range, and a copy kept 7 days so a report can be checked. No endpoint lists these.
- **Inbox:** `GET /conversations?box=inbox|requests&cursor=`, `POST /conversations` (`{ accountId | username, text, clientMessageId }`), `GET /conversations/{id}`, `GET /conversations/{id}/messages?before=|after=&limit=` (one or the other), `POST /conversations/{id}/messages`, `POST /conversations/{id}/request` (`accept` | `decline`), `POST /conversations/{id}/read` (`upTo`: never backwards, never past the newest), `PATCH /conversations/{id}/preferences` (`muted`), `GET /messaging/summary` (unread and requests). Plain text up to 1,000 characters, line breaks kept, one link at most.
  - A first message is a **request**: it waits in the recipient's Requests; the sender can send nothing more until it is accepted (or answered). A decline, a block and "no requests" all get the same refusal, so a sender cannot tell which it was.
  - **Retries:** every message carries a `clientMessageId`; sending it again returns the first copy (`duplicate: true`), and reusing it for other words is refused.
  - **Limits:** 20 messages a minute, and 5 new conversations a day for an account without a confirmed email (both settable).
  - **Notices:** each message writes an "inbox changed" event per member in the same transaction (`messaging_outbox`); they go to the presence server's `/notify-accounts` at once and are retried with back-off. They never carry the text. Without a presence server the game polls every half minute.
- **Business inquiries:** `POST /plots/{id}/inquiries` writes to whoever owns the building now (read again inside the transaction). The conversation belongs to the two people in it: after a take-over the new owner gets only new inquiries, and the old thread stays with the old owner and the customer.
- **Blocks and settings:** `POST /messaging/blocks` (`{ accountId | username }`), `DELETE /messaging/blocks/{accountId}`, `GET` / `PATCH /messaging/settings` (`requests`: whether new people may send requests; inquiries about your buildings still come in).
- **Reports:** `POST /messaging/reports` (`{ messageId: "m12" | "n34", category }`) by someone who received it; the server copies what it said into the report. They join the admin queue as kinds `message` and `nearby` (`remove` blanks the message for everyone, `ban` bans the sender).
- **Retention** (hourly): nearby copies after 7 days, private messages after 90, report evidence 180 days after a decision; anything under an open report is kept until it is decided. Set with `MESSAGING_*_DAYS`. Private messages are access-controlled and encrypted in transit (HTTPS), not end to end.
- **Switches:** `MESSAGING_NEARBY=0`, `MESSAGING_INBOX=0`, `MESSAGING_INQUIRIES=0` stop sending; reading still works.
- Tests: `tests/messaging.test.mjs` (about 70 checks across both servers) and the chat steps of `tests/live-browser.test.mjs`.
- **The Python messaging service** (`services/messaging`, [node_fastapi_architecture_plan.md](node_fastapi_architecture_plan.md)) implements the same routes. With `MESSAGING_SERVICE_URL` set this API forwards them there (answering `503 unavailable` if it is down) and stops its own messaging jobs; tickets stay here. The service asks this API about accounts and plots through `POST /internal/identity/session`, `/internal/identity/binding`, `/internal/identity/accounts`, `/internal/identity/accounts/{id}/ban` and `GET /internal/plots/{id}/owner` (with `INTERNAL_SECRET`). Not switched on yet.
- **`MESSAGING_READONLY=1`** pauses every messaging write (sending, read positions, requests, blocks, reports, nearby lines) with `503`, while reading and the rest of the game carry on: used while moving messages.

## Admin sign-in (`services/api/admin.mjs`)

The admin pages (`apps/web/app/admin/`) sign in with accounts of their own, not players' accounts and not settings: the `admin_accounts` table (username unique whatever its case, a salted scrypt hash `scrypt$N$r$p$salt$hash` with N = 2^15, r = 8, p = 1, compared in constant time, `created_at`, `last_login_at`, `disabled`). Operating steps: [deploy/README.md](../../deploy/README.md#admin-sign-in). Contracts: `admin.*` in `@voxelventure/shared-types`.

| Route | Who | What |
| --- | --- | --- |
| `GET /admin/setup` | Anyone | `{ needed }`: true while there is no admin account (the login page then points to `/admin/setup`) |
| `POST /admin/setup` | `Authorization: Bearer ADMIN_TOKEN` | `{ username, password }`: the first admin account. 409 `already_set_up` once any exists |
| `POST /admin/session` | Anyone | `{ username, password }`: signs in and sets the session cookie. Every failure is the same 401 `login_failed`, after a fixed delay |
| `GET /admin/session` | The session | Who is signed in, and when the session ends; 401 `not_signed_in` |
| `DELETE /admin/session` | The session | Signs out (the session is deleted, the cookie cleared) |
| `POST /admin/password` | The session (not the token) | `{ currentPassword, newPassword }`: every other session of that admin ends |
| `GET /admin/email`, `POST /admin/email` | The session (not the token) | The signed-in admin's email for password resets, `{ email, emailVerified }`. `POST { email }` sets it (unconfirmed until its emailed link is opened; 3 confirmation emails an hour per admin; 409 `email_taken`), `{ email: "" }` removes it; a confirmed address that is replaced or removed is told |
| `POST /admin/email/verify` | Anyone with the link | `{ token }`: confirms the address (no session needed). 400 `verify_invalid` |
| `POST /admin/password-reset/request` | Anyone | `{ login }` (a username or a confirmed email): always the same 200 answer after the fixed delay; emails a one-use reset link only to an enabled admin with a confirmed email. 429 after 10 an hour from one network |
| `POST /admin/password-reset/check` | Anyone with the link | `{ token }`: `{ valid, username, expiresAt }` (looking does not use it up) |
| `POST /admin/password-reset/confirm` | Anyone with the link | `{ token, password }`: the new password. 400 `reset_invalid` (expired, used or voided), 409 `disabled` |
| `POST /admin/password-reset/token` | `Authorization: Bearer ADMIN_TOKEN` | `{ username, password }`: the fallback when there is no confirmed email. 401 `reset_failed` for a wrong token or a locked network |
| `GET /admin/admins`, `POST /admin/admins` | Admin | The accounts (never a hash), each with its reset email and whether it is confirmed; add one |
| `PATCH /admin/admins/<id>` | Admin | `{ disabled }`: disabling ends their sessions. Not yourself, not the last admin who can sign in |
| `GET /admin/presence` | Admin | The presence server's `/status` (`MP_STATUS_URL`, default `MP_NOTIFY_URL` with `/status`), for the monitor page; 503 if it cannot be reached |

- **Every admin route** (these and the older ones: reports, bans, audit, social, newsletter, leases, market, pilot, billing, economy) goes through one check, `requireAdmin(req)` in `server.mjs` (`adminOnly()` inside `route()`): `Authorization: Bearer ADMIN_TOKEN` (scripts, `verify:live`, `npm run moderate`), or a valid session cookie. The answer is the audit trail's actor: `admin` with id null for the token, the admin's id for a session.
- **The session cookie:** `__Host-vv_admin`, `HttpOnly; Secure; SameSite=Strict; Path=/`, no `Domain` (the API's host only), `Max-Age` 12 hours. Its value is 32 random bytes; `admin_sessions` keeps only their SHA-256. A session ends 12 hours after signing in, or after 2 hours without a request; ended ones are deleted on sight and hourly. A disabled admin's sessions are deleted.
- **CORS and CSRF:** for `/admin/*`, a request from an allowed origin (`API_ORIGIN`; in development with no `API_ORIGIN`, `http://localhost:<port>` and `127.0.0.1`, never in production) is answered with that exact origin and `Access-Control-Allow-Credentials: true`, and `Vary: Origin`; any other origin is not named and gets no credentials, and nothing is ever answered `*` with credentials. A change made with the cookie must be `Content-Type: application/json` and carry an allowed `Origin` (403 `csrf` otherwise); `POST /admin/session` must be JSON, and an `Origin`, if sent, must be allowed. With the token neither applies.
- **Brute force:** 5 failed sign-ins within 15 minutes for one username, or from one network, lock it for 15 minutes (in memory). Failures wait 400 ms. A wrong current password on `POST /admin/password` counts too. The global limit for sign-in routes (20 a minute per network) applies as well.
- **Audit:** `admin.setup`, `admin.login`, `admin.login_failed` (with the reason), `admin.lockout`, `admin.logout`, `admin.create`, `admin.disable`, `admin.enable`, `admin.password_change`, `admin.password_change_failed`, `admin.password_reset` (command line, email link or admin token; see below for the reset's own entries). Each records the admin's username only if it is one (a password typed into the username box is never written) and the network as a salted hash. No password, hash or cookie is ever written to the audit trail or the log.
- **Password reset ("Forgot your password?" on `/admin/login`, the page `/admin/forgot`):** <a id="admin-password-reset"></a>
  - **The email:** `admin_accounts.email` (lowercase, unique among admins) and `email_verified_at`, set on the Account page (`/admin/password`). It is confirmed by a link sent to it; only a confirmed address gets reset links. Other admins see each address in full on the Admins page (they are all staff; it is how they know whose recovery works).
  - **The links:** `/admin/reset#token=…` and `/admin/verify-email#token=…`. The value is 32 random bytes after `#`, so a browser never sends it to a server (no access log, no `Referer`), and the page takes it out of the address at once. `admin_tokens` keeps only its SHA-256, with its purpose, the admin and the expiry: 30 minutes, one use, a new link voids the older one of the same purpose, any new password voids the reset links, and expired rows are deleted hourly. Once the email is sent (or has failed for good) the outbox row's text is replaced (`engage.mjs` `ONE_USE_KINDS`), so neither the database nor the outbox keeps a working link.
  - **Asking:** the answer is identical for an unknown account, one without a confirmed email, a disabled one, and one asked for too often (3 links an hour per admin); only the audit trail says which (`outcome`). 10 requests an hour per network, then 429. The email is plain text: the account, the time of the request (UTC), that the link works once for 30 minutes and signs the account out everywhere, and to ignore it if it was not you. Nothing about the network is in it.
  - **Resetting** (by link or by token): the shared password rule; every session of that admin ends; the lockout of their username and of the network that reset it is cleared, so they can sign in at once; a disabled admin is refused (409) and stays disabled.
  - **The token fallback:** `ADMIN_TOKEN` typed on `/admin/forgot` and sent once as `Authorization: Bearer` (never stored, as on `/admin/setup`). A wrong token counts as a failed sign-in of that network: 5 within 15 minutes lock the network for 15 minutes (the sign-in too).
  - **Audit:** `admin.password_reset_request` (`outcome`: sent, unknown, no_verified_email, disabled, admin_limit, no_site), `admin.password_reset` (`via`: email link, admin token, command line), `admin.password_reset_failed` (`reason`: bad_link, disabled, bad_token), `admin.email_set`, `admin.email_verified`, `admin.email_removed`. Never a link, the token, a password or an email address.
  - **The link's site:** `PUBLIC_SITE_URL`, else the first `API_ORIGIN`; in development, the page's own allowed origin.
  - Tests: `tests/admin-reset.test.mjs`; the pages in `tests/browser.test.mjs`; the whole flow (email confirmed, link asked for, read from the outbox, new password, signed in) in `tests/live-browser.test.mjs`.
- **Command line:** `npm run admin:create -- <username>` and `npm run admin:reset-password -- <username>` (`scripts/admin-accounts.mjs`) work on the database directly (`API_DB`), ask for the password twice without echo (or read stdin), and print only `created` or `password changed`. A reset ends that admin's sessions and enables the account. It is the last resort: the pages' own reset (above) needs no shell.
- **Start-up:** the API needs no admin settings and starts with no admin account; `ADMIN_TOKEN` is still required in production (config.mjs).
- Tests: `tests/admin-login.test.mjs` (setup, hash, sign-in, cookie flags, CORS, CSRF, expiry, sign-out, lockouts, password change, admins, the presence proxy, the command line, no password anywhere); the sign-in page in `tests/browser.test.mjs`; setting up, signing in and out in a real browser against a real API in `tests/live-browser.test.mjs`.
- **The pages' look:** a sidebar (a drawer on phones), a top bar with the live indicator and Sign out, and shared components (`components/admin/ui.jsx`) in the SynaptixPlay palette. See [docs/brand/admin_dashboard.md](../brand/admin_dashboard.md).

## What it does not do yet
- **Payments and Gold on the server** (task 6): with Stripe set up, claims, take-overs, renewals and market stalls are paid through Stripe Checkout ([billing.md](../monetization/billing.md)), one by one or together through the cart. Without Stripe, a claim records its price in the ledger but charges nothing. The server's Credits move only through visit quests and their budgets; nothing is bought with money, and the game's own Gold stays local.
- **Realtime:** done for ownership and ad changes (push from the API through the presence server). With a server, the building card's statistics and history come from `/plots/<id>/stats` and `/plots/<id>/history` (`lib/data/liveStats.js`); the simulated provider is used only without one.
- Automatic image moderation needs an outside service (the hook is there); until one is set up, pictures are caught by reports. Production needs HTTPS, a real `API_ORIGIN`, backups of the database file (or Postgres), and a longer-lived session store.

Tests: `tests/api.test.mjs` starts its own server and runs about 50 checks (seeding, directory, sign-up and login rules, claim validation, the 10-way race, take-over, edit rights, events and statistics, body and rate limits).
