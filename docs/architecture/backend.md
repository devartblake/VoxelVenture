# Backend (tasks 2-4): database, accounts and claiming, events and statistics

Written for: whoever runs or extends the server. The stack is deliberately plain (Node + SQLite, no accounts to create) so it runs now; the schema is portable to Postgres/Supabase, and only `services/api/db.mjs` and the SQL in `core.mjs` would change.

```
npm run api          node --experimental-sqlite --no-warnings services/api/server.mjs  (port 3002)
```
The database is Node's built-in `node:sqlite`. On Node 24 (the development machine) it works without `--experimental-sqlite`; the flag is kept for older Node 22 releases and does no harm.

`API_PORT`, `API_HOST` (default every interface; `127.0.0.1` behind a reverse proxy), `API_DB` (file or `:memory:`; default `services/api/data/voxelventure.db`, git-ignored), `API_SEED` (the world's seed), `API_ORIGIN` (CORS: set it in production).

## What it does
- **Seeds the world from the game's own generator** (`generateCity`, loaded through `scripts/lib-loader.mjs`), so plot ids, prices and starting businesses match the client exactly: 855 plots, 401 built, for the default seed (20260101).
- **Accounts:** `POST /auth/signup`, `/auth/login`, `/auth/logout`, `GET /me`. Passwords are hashed with scrypt and a salt; sessions are random tokens (only their hash is stored), valid 30 days. Names are 3-20 letters/numbers/-/_, unique ignoring case. Login attempts are rate limited.
- **Directory:** `GET /plots?sort=value|visits|plot|name&q=&limit=&offset=` (numbered 1 to N, plus rank), `GET /plots/{id}`.
- **Claim and take over, atomic:** `POST /plots/{id}/claim` and `/takeover` run in one `BEGIN IMMEDIATE` transaction. Ten players racing for one lot: exactly one wins, the rest get `409 already_owned`. A take-over costs 1.25x, pays out and logs the old owner, counts, and refuses a stale price (`expectedPrice`). Titles, websites (`http(s)` only), types and logos are validated with the same rules as the game (`lib/game/logos.js`).
- **Edit your business:** `PATCH /plots/{id}` (logo, description and the outside; owner only; the price and owner cannot be changed). An outside that costs more a year than the one the building has is refused with `402 exterior_payment_required` and its quote (`{ before, after, diff, charge, lines }`); a cheaper or equal one applies at once and moves the plot's value by the difference.
- **Build onto the outside:** `POST /plots/{id}/exterior { exterior }` (owner only, while the lease runs or can be renewed, else `403 lease_ended`): pays for a more elaborate outside for the rest of the lease (a ledger row of kind `exterior`, audit `plot.exterior`), and the plot's value goes up by the yearly difference. With payments on it answers with a Stripe checkout ([billing.md](../monetization/billing.md)). Prices: [pricing_analysis.md](../monetization/pricing_analysis.md#the-outside-basic-is-free-elaborate-is-priced).
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
| `POST /plots/<id>/intent` | Anyone | A step only the game sees: `card_open`, `open` (the take-over form), and for a player not signed in `hold` and `quote`. Verified like a visit. A price is never taken from the client. |
| `GET`, `POST`, `DELETE /plots/<id>/watch` | Signed in | Watch an occupied plot: an email when its lease enters its grace week and when it opens to a buyout, once each |
| `GET /admin/economy?from=&to=` | Admin | Per tier and per district: plots, vacancy, verified visits and store entries, foot traffic, the claim funnel with its conversion rates, the median quote, take-over attempts and completions, renewals and lapses, watchers |

- **Hooks elsewhere:**
  - `POST /plots/<id>/claim` and `/takeover` are refused while another account holds the plot. Their outcome (checkout, claimed or taken over, refused) is recorded through `economy.tracked`.
  - A paid one is recorded when the payment arrives (`afterPaid`).
  - `POST /presence/ping` takes the optional `areas` the game passed through outdoors. They are counted in memory and written once a minute.
- **Jobs:** every minute, run-out holds are let go and watchers' emails are queued. Every hour, raw intents older than 180 days and traffic's "already counted" rows older than 2 days are deleted.
- **Tables:** `plot_holds`, `plot_intents`, `street_traffic`, `traffic_seen`, `plot_watches`.
- **Tests:** `tests/economy.test.mjs`.

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

## What it does not do yet
- **Payments and Gold on the server** (task 6): with Stripe set up, claims, take-overs, renewals and market stalls are paid through Stripe Checkout ([billing.md](../monetization/billing.md)). Without Stripe, a claim records its price in the ledger but charges nothing. The server's Credits move only through visit quests and their budgets; nothing is bought with money, and the game's own Gold stays local.
- **Realtime:** done for ownership and ad changes (push from the API through the presence server). With a server, the building card's statistics and history come from `/plots/<id>/stats` and `/plots/<id>/history` (`lib/data/liveStats.js`); the simulated provider is used only without one.
- Automatic image moderation needs an outside service (the hook is there); until one is set up, pictures are caught by reports. Production needs HTTPS, a real `API_ORIGIN`, backups of the database file (or Postgres), and a longer-lived session store.

Tests: `tests/api.test.mjs` starts its own server and runs about 50 checks (seeding, directory, sign-up and login rules, claim validation, the 10-way race, take-over, edit rights, events and statistics, body and rate limits).
