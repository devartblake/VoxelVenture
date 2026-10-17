# Authoritative production data

Status: **phase 3 code done (2026-10-16); not yet deployed.** Phase 3 of the [competitive alignment review](../competitive-research/claimavenue_competitive_alignment_review.md#phase-3--make-production-data-authoritative).

The rule: **with a game server, the server is the only source of truth, and nothing simulated is ever shown as real.** The single-player game (no `NEXT_PUBLIC_LIVE_API_URL`) still makes up figures so the city feels alive, and it labels them "simulated".

## Where each item stands

| Review item | State | How |
| --- | --- | --- |
| Authentication | Server | Accounts, hashed passwords, 30-day sessions and bans (`services/api/core.mjs`). |
| Server-owned claims and leases | Server | Atomic claim and take-over, lease terms and renewal (`core.mjs`, `community.mjs`). Mall store renting and shared billboard slots exist only in the local game and are switched off when a server is set. |
| Business configuration | **Server (new)** | The building's outside (floors, shape, colours, rooftop feature, back of the lot) is stored with the plot. It is cleaned against the plot's limits and catalogue, sent to every player, and editable by the owner (`PATCH /plots/{id}` with `exterior`). The logo editor saves to the server too. Before this, both were dropped on the way to the server. |
| Verified statistics | **Server only (new)** | See [Verified figures only](#verified-figures-only) below. |
| Ad inventory | Server, **counts verified (new)** | Ad slots and purchases were already on the server. View and click counts now count only verified events: a running page, not a bot, not the advertiser, and within the per-network daily cap. The generator's starting views no longer count. |
| Market bookings | Server | Bookings, prices, visits and notices (`market.mjs`). Bookings and cancellations are now audited. |
| Moderation actions | Server, **audited (new)** | Reports, decisions and bans are recorded in the audit trail with who decided and what happened. |
| Audit records | **Server (new)** | See [The audit trail](#the-audit-trail) below. |
| Admin headquarters | **Real, live (new)** | The two headquarters (Synaptix Play, Theoretical Minds Technology) stay as they are: the same buildings and models, not for sale. Their own visit figures are verified like any building. Their card adds **The city, live**: players online now, visitors in the last 24 hours, city and building visits, website clicks, profile views and CTA presses this week, player businesses, profiles and accounts (`GET /world/live`, totals only, refreshed every 15 seconds while the card is open). Without a server the card shows no figures for them rather than invented ones. |
| Production settings | **New** | See [Deploying and verifying](#deploying-and-verifying) below. |

## Verified figures only

**What changed on the server:**

- **Every count is real events only.** A building's visits, the world total, an ad's views and clicks, and the newsletter's "busiest businesses" list count verified events and nothing else.
- **Owners and advertisers don't count themselves.** An owner's own visits to their building are not counted, and neither are an advertiser's own views of their ad.
- **Starting figures are kept but never shown.** The generated city's starting figures (`base_visits`, `base_views`, `base_clicks`) stay in the database as the seed's history, but nothing adds them to a count. A new production world starts at zero, which is the honest number.

**What changed in the game (`lib/data/liveData.js`, `lib/data/liveStats.js`):**

- **Fixed:** the live provider used to fall back to the simulated provider for the building card's statistics, history and owner count. So **owners saw invented figures as their own even with a server connected**.
- **Now:** the card and the My businesses dashboard fetch `GET /plots/{id}/stats` and `/history`, and cache them for 30 seconds. Until those figures arrive they show "Loading verified visitor figures…". A failed request shows an error. Neither ever shows a stand-in.
- The dashboard's note now says "verified human visits only" with a server and "simulated" without one. Before, it read "simulated until the server is connected" even when it was connected.
- **Two sync fixes found while checking this in a browser:**
  - Loading the saved game replaced the first sync's counts, so a fresh city's generated visits could show for up to 15 seconds. The game now syncs again as soon as the save has loaded.
  - An open building card kept the copy of the plot taken when it was opened, so it never showed server updates such as counts or a new owner. It now follows the server's changes.

## The audit trail

`services/api/audit.mjs` keeps an append-only `audit_log`.

**What it records:**

- New accounts.
- Plot claims, take-overs (with the price paid and who was paid out), edits and renewals.
- Admin lease changes.
- Ad purchases.
- Market bookings, cancellations and layouts.
- Reports and moderation decisions.
- Bans and unbans, by the admin or the messaging service.
- Newsletter sends.
- Business profile creation, edits, building links and upgrade requests.

**How it is protected:**

- **Same transaction as the change.** Each record is written in the same transaction as the change it records: a refused or failed change leaves no record, and a change cannot happen without one. To make this possible, `transaction()` in `db.mjs` is now re-entrant.
- **No edits or deletions.** Triggers refuse any update or delete on the table.
- **Hash chain.** Each row holds the hash of the row before it. Someone with the database file who drops the triggers and edits a row breaks the chain, and `GET /admin/audit/verify` reports the first broken row. (This detects tampering; it does not prevent it. For that, ship the log off the machine. See [Left to do](#left-to-do).)

**Reading it (admin token):** `GET /admin/audit?target_kind=plot&target_id=12`, `?action=plot.takeover` or `?actor=<account id>`, paged with `before`.

## Deploying and verifying

**Production settings check (`services/api/config.mjs`).** With `NODE_ENV=production` (or `API_STRICT=1`) the API **refuses to start** when any of these is true:

- A secret is missing, still the example placeholder, shorter than 32 characters, or the same as another secret.
- `API_ORIGIN` is `*` or not https.
- `PUBLIC_API_URL` is not https.
- The database is `:memory:`.
- A test setting is present that switches off the proof-of-human rules (`HUMAN_MIN_AGE_MS=0`, or very large caps).

It also warns when `TRUST_PROXY`, `MP_NOTIFY_URL` or mail delivery is not set.

**`npm run check:env -- <file>`** runs the same checks on a settings file before a deploy. It also checks the web app's file: the live API address, the site address and `wss://` presence.

**`npm run verify:live -- --api <url> --site <url> [--admin-token <t>]`** is a read-only check to run after every deploy. It checks:

- The API is up and seeded.
- CORS allows only the site.
- Building statistics and history are real (`simulated: false`), and counts are not padded.
- Ad counts are present.
- Profiles are served.
- The admin routes are closed to the public.
- The audit chain is intact (with the admin token).
- The site was built against the API: no demo banner, owner pages live, and canonical links, robots and sitemap on its own address.

[deploy/README.md](../../deploy/README.md) now includes both commands.

## Admin tools

`npm run moderate` (with `API_URL` and `ADMIN_TOKEN`) now covers the audit trail and the X posts as well as reports: `audit` (newest first), `audit plot 12`, `audit action plot.takeover`, `audit account 7`, `audit verify`, `posts`, `posts approve 4`, `posts reject 4`.

## Upgrading an existing database

`tests/migration.test.mjs` builds a database as the first release left it (`tests/fixtures/schema-v1.sql`), fills it, and opens it with today's code. It checks the following:

- Every new table, column and trigger appears.
- No data is lost.
- A second open changes nothing.
- The API runs on it.

Two things about upgraded data:

- **Old ad events** were recorded before ad events were verified, so they are kept but not counted.
- **Old building visits** were verified when they were recorded, so they still count.

## Tests

- `tests/authoritative.test.mjs` covers:
  - no generated figures in any count;
  - the outside of a building is kept, cleaned and editable only by its owner;
  - an owner's own visits are not counted;
  - the audit trail: what it records, that refused changes write nothing, that it refuses edits, and that the chain detects tampering;
  - the settings check, including that the API refuses to start;
  - `verify:live` against a running API.
- `tests/live-provider.test.mjs` checks that the live provider returns the server's figures or nothing, never simulated ones.
- `tests/api.test.mjs` and `tests/engage.test.mjs` were updated for verified-only counts.

## Left to do

- **Deploy (needs you):** choose the host and domain (task 1), fill in the settings, then run `check:env`, deploy, and `verify:live`. None of this has been done on a real server.
- **The three-minute hold** when setting up a plot is still client-side only. Claims are atomic on the server, so two people cannot both win, but the hold does not reserve the lot for anyone else.
- **Gold** (the game's currency) still lives in the browser. Only the server's quest Credits are authoritative. Decided in phase 4: Gold stays a game-only reward, never sold for money ([takeover_payouts.md](../monetization/takeover_payouts.md)). Moving it to the server is still to do, and comes before the Gold-only 1.25x take-over.
- **Mall stores and shared billboard slots** are local-only features and are hidden with a server. They would need server tables before they can return.
- **Audit shipping:** for tamper-proof records, copy the audit log off the machine (e.g. with the nightly backup) so that someone with the database file cannot rewrite the chain from the start.
