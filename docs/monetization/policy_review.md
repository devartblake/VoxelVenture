# Policy review: what to decide, fill in and fix before publishing

The six policies are drafted at `/legal` (`lib/legal/policies.js`):

- terms of service
- privacy
- refunds and cancellation
- advertising and sponsored placement
- data retention
- merchant responsibilities

They describe what the code does on 2026-10-17, from an inventory of the code. They are **drafts, not legal advice**: every page says so and is kept out of search engines until approved.

This page is for whoever reviews them, you and a lawyer. It lists:

- what to fill in
- what to decide
- where the product does not yet match what a policy should say

## How it is built

- **Text:** `lib/legal/policies.js`. Plain language, one section per topic.
  - A `{ review: … }` note is shown on the page only while it is a draft.
  - A `[placeholder]` is highlighted.
- **Numbers:** prices, periods and limits come from `lib/legal/facts.js` and `lib/legal/retention.js`.
  - Prices and game rules are imported from the code itself.
  - Periods kept by the servers are checked against the code by `tests/legal.test.mjs`.
  - If someone changes a retention period or a price in the code, the test fails until the policy matches.
- **Browser storage:** the privacy policy's table lists every key the code keeps in the browser. The test fails if a new key appears without being added.
- **Who runs the service:** set at build time:
  - `NEXT_PUBLIC_LEGAL_NAME`
  - `NEXT_PUBLIC_LEGAL_ADDRESS`
  - `NEXT_PUBLIC_LEGAL_EMAIL`
  - `NEXT_PUBLIC_LEGAL_JURISDICTION`
  - `NEXT_PUBLIC_LEGAL_MIN_AGE`
- **Links:** the public footer links all six; signing up links the terms and privacy policy; the request form says how long details are kept and links privacy.
- **Stripe:** set `TERMS_URL=https://<site>/legal/terms` and `REFUND_POLICY_URL=https://<site>/legal/refunds`. Live keys require both; Stripe's checkout then shows them.
- **Approving:** fill in every placeholder, resolve every review note (remove the note, change the text), then in `lib/legal/policies.js` set `POLICY_STATUS` to `{ status: 'approved', version: '1.0', effective: '<date>' }`.
  - The test refuses an approval with anything left.
  - Approved pages lose the draft banner, can be indexed, and are added to the sitemap.
  - The file is under `CODEOWNERS`; later changes go through review like any other.

## 1. Fill in

| Placeholder | Where | Notes |
| --- | --- | --- |
| Company legal name, address | all | `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_LEGAL_ADDRESS` |
| Contact email for privacy, refunds and complaints | all | `NEXT_PUBLIC_LEGAL_EMAIL`; someone must read it |
| Governing law and courts | terms | `NEXT_PUBLIC_LEGAL_JURISDICTION` |
| Minimum age | terms, privacy | `NEXT_PUBLIC_LEGAL_MIN_AGE`; see decision 1 |
| Liability cap amount | terms | for example what the person paid in the last 12 months |
| Days to answer a data request | privacy | `[30]`; check the law that applies (often 30 days or one month) |
| Days to claim "did not work" | refunds | `[14]` |
| Refund for a removed ad | advertising | `[not refunded / refunded for the unused days]` |
| How long payment records are kept | retention | the accounting-records period where you operate |

## 2. Decide

1. **Audience and age.** There is no age check. Choose the minimum age (13, 16 or 18). Also decide whether chat and private messages need a higher one; `docs/architecture/chat_messaging_plan.md` section 12 asks the same.
2. **Consent for browser storage.** No cookies are set. The site keeps a random visitor number and the referral code of a followed link in local storage. Neither is strictly needed for the site to work. Where consent rules for device storage apply (for example the EU and UK), they may need consent first. If so, a consent prompt must be built: a few hours' work.
3. **Refunds:**
   - the window for "did not work" claims;
   - whether a part-used week or month is refunded;
   - whether a consumer cooling-off right applies (usually yes for online consumer purchases in the EU and UK; the right is lost once the service has started with the buyer's agreement, which checkout would then need to collect).
4. **Banned and restricted advertising categories.** The draft bans illegal content, adult content, weapons, gambling, crypto giveaways and unsupported claims. Decide restricted ones, such as alcohol, supplements and financial products.
5. **Moderation:**
   - who moderates;
   - how fast reports are looked at;
   - how a ban is appealed (needed by some laws for online platforms).
6. **Service providers:** name the hosting and email providers. If they are in other countries, add transfer wording.
7. **Merchants and customer data:** these terms alone, or a data processing agreement too (whether a merchant is a separate controller or our processor depends on the law and the facts).
8. **Tax:** do prices include sales tax or VAT? Add wording.
9. **Ad spaces in the city:** keep them as a free game feature (as written), or charge for them; see gap 4.

## 3. Where the product does not match what a policy should say

These are true today and the drafts say so honestly. Each one is better fixed in the code than written into a policy. Rough sizes are given.

1. ✅ **Fixed (2026-10-16): raw network (IP) addresses are no longer kept.**
   - **What changed:** the multiplayer server now keeps only `net`, the same salted hash the API stores. `net` is `sha256(IP_SALT|address)`, cut to 16 characters. The error log, the console, `/status` and the `/admin` monitor all show it instead of the address.
   - **Configuration:** `presence.env` takes the API's `IP_SALT`. It also sets `TRUST_PROXY=1`, so behind Caddy each player's own address is hashed, not 127.0.0.1 for everyone. This also makes the per-network connection cap work in production.
   - **Tests:** `tests/multiplayer.test.mjs` and `tests/legal.test.mjs`.
   - **Your old logs:** error logs written before this change can still hold full addresses. Delete `services/multiplayer/logs/client-errors.jsonl*` on any machine that ran the server.
2. ✅ **Fixed (2026-10-21): the Plot of the Day newsletter is opt-in.**
   - **Before:** it went to every account with a confirmed email and notices on, and notices are on by default. Account holders got no unsubscribe link, only "turn these off in your account".
   - **The consent:** a separate box in the account settings, "Email me the Plot of the Day newsletter" (`accounts.newsletter`, with the date of the choice in `newsletter_at`). The words are `lib/legal/consent.js`, used by the settings and the privacy policy alike. Service notices (`notify`: take-overs, lease and watched-plot reminders, stalls, requests) are transactional and stay a choice of their own.
   - **Existing accounts:** all start *not subscribed*. Nobody had ever opted in (there was no such record: the newsletter went to everyone with notices on), so none is assumed. The column is added with 0 for every account.
   - **Unsubscribing:** every issue has a one-click link, `/newsletter/unsubscribe?token=` (for a public sign-up, `/leads/unsubscribe?token=`). The token is signed with the server's secret (`NEWSLETTER_SECRET`, else `REFERRAL_SECRET` or `IP_SALT`), so it works without signing in, and opening it again is harmless. Each issue also carries the `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers (RFC 2369 and 8058), passed to Resend; a mail app's own button POSTs to the same address. One click ends the newsletter whichever way the address was signed up.
   - **Note:** opening the link unsubscribes at once, so a mail scanner that follows links can unsubscribe someone. That errs on the side of sending less.
   - **Tests:** `tests/engage.test.mjs`, `tests/contracts.test.mjs`, `tests/migration.test.mjs` and `tests/legal.test.mjs`.
3. ✅ **Fixed (2026-10-16): take-over emails no longer say "you were paid out $X".** They now say "the game credited you N in game value (play money: no real money is paid)", with no currency sign (`services/api/engage.mjs`, `notifyTakeover`, `notifyAdTakeover`; checked by `tests/engage.test.mjs` and `tests/legal.test.mjs`). The terms say the same.
4. **Ad spaces are never charged.** `POST /ads/:id/buy` has no payment even when billing is on. The advertising policy calls them a free game feature; decision 9.
5. **Disputes and partial refunds.** Chargebacks are recorded but nothing else happens. A partial refund made in the Stripe dashboard is ignored (`services/api/billing.mjs`). **Fix:** handle `charge.dispute.created` (pause what it paid for, alert an admin) and partial refunds. *A day.*
6. **People cannot delete their account or download their data.** The policies say to email. **Fix:**
   - an account deletion that wipes personal fields and keeps anonymised records;
   - a data export;
   - a way for an owner to delete their own business page.

   *Two or three days.* The action log cannot be deleted by design; the privacy policy says so.
7. ✅ **Fixed (2026-10-21): every kind of personal data now has an end date.** The limits are in one place, `lib/legal/retention.js` `RETENTION`. The clean-up jobs (`services/api/retention.mjs`, run every hour by the API) read them from there, and the retention policy quotes the same object, so the two cannot disagree (`tests/legal.test.mjs`).

   | Data | Limit | What the job does |
   | --- | --- | --- |
   | Sent and failed emails (`outbox`) | 30 days; the record 13 months (395 days) | Wipes the text, headers and error after 30 days. Keeps a send record (to, kind, subject, when) for 13 months, then deletes it. Emails still waiting to go out are not touched |
   | Visits, clicks, ad views, profile events, stall visits (`events`, `ad_events`, `business_events`, `market_visits`: visitor numbers and hashed networks) | 13 months (395 days) | Adds the rows to `daily_counts` (per UTC day, building / ad space / business / stall, kind: numbers only, verified rows only, a purchase's value), then deletes them. Every all-time figure (a building's visits, the world total, ad views and clicks, the stats panel, a stall's visits) and the economy report add these totals back, so no figure changes. The dashboards, pilot figures and launch summaries only read the last 30 to 60 days |
   | The country list of arrivals (`arrivals`) | 30 days | Adds each day's count to `daily_counts`, then deletes the rows. The stats panel only shows yesterday and 7 days; its all-time total is unchanged |
   | Expired sign-ins (`sessions`) | 1 day after they expire | Deletes them |
   | Newsletter sign-ups (`leads`) | Never confirmed: 30 days. Unsubscribed: 30 days after (a new `unsubscribed_at`; older unsubscribes start their 30 days at the first run) | Deletes them. Confirmed ones are kept until they unsubscribe |
   | Coupon claims (`coupon_claims`) | 13 months | Removes the visitor number. The claim is kept, because it counts against the coupon's stock |
   | Welcome posts on X (`social_posts`) | 90 days, for a post never made (rejected, failed, skipped) | Wipes its text, which has the X handle. A post that was made is kept as the record of what was published, so it can be found and removed on request. Posts waiting for review are kept |
   | Off-site backups | 30 days (`RCLONE_KEEP`) | Already deleted by `deploy/backup.sh` (`rclone delete --min-age`). The server's own copies go after 14 days (`BACKUP_KEEP`) |

   - **Kept on purpose, now said in the policy:** votes and feedback posts (with the account), the pilot's weekly answers and owner activity (with the business), a confirmed newsletter sign-up (until it unsubscribes), payments and the action log (the accounting period, still a placeholder).
   - **Safe on a large table:** each job works in batches of 2,000 rows, each its own short transaction, at most 25 batches a run. On the first run, a database that kept everything is caught up over a few hours without blocking the API. New indexes on `at` and `expires_at` make the hourly check cheap. A job that fails is logged and does not stop the others.
   - **Tests:** `tests/retention.test.mjs` checks that each job removes exactly what it should, that the figures are unchanged, even halfway through a backlog, and that a second run changes nothing.
8. ✅ **Fixed (2026-10-21): no account numbers in public data.**
   - **The change:** `GET /plots/state`, `GET /plots/:id`, `GET /ads` and `GET /ads/:id` no longer send `ownerAccount`. The owner's public name stays. Instead, each plot says whether a player leases it (`playerOwned`, for "Message the owner"), and `mine` says whether it is the signed-in caller's own. The server works that out, so no client needs the number.
   - **The client:** `lib/data/sync.js` used `ownerAccount === me.id`, and the profiles page filtered with it. Both now use `mine`. The plot price rule (`worthOf`) uses `playerOwned`.
   - **The contracts:** `plot.public` and `ad.public` in `@voxelventure/shared-types` 0.16.0 refuse an account key.
   - **Tests:** `tests/api.test.mjs` walks every public GET, signed in and not, and finds no key naming an account.
9. ✅ **Fixed (2026-10-21): the X welcome-post consent needs a handle on the server too.**
   - **The rule:** `cleanProfile` (`@voxelventure/business-core`) refuses `announce` without an X handle, as the form does.
   - **Removing the handle:** an edit that removes the handle withdraws the consent with it.
   - **Old data:** a consent saved without a handle before this change is withdrawn when the database is opened.
   - **Posts already made:** un-ticking the box still does not remove a post already made. The policy says so.
   - **Tests:** `tests/social.test.mjs`, `tests/migration.test.mjs` and `tests/legal.test.mjs`.

## Sources

The facts come from an inventory of the code on 2026-10-17. The main sources are:

- `services/api/core.mjs`, `engage.mjs`, `business.mjs`, `conversions.mjs`, `messaging.mjs`, `moderation.mjs`, `billing.mjs`, `social.mjs`, `stats.mjs`, `schema.sql`
- `services/multiplayer/server.mjs`
- `packages/business-core/src/plans.js`, `lib/game/leases.js`, `lib/market/layout.js`, `lib/business/referral.js`
- `deploy/backup.sh`
- every `localStorage` key in `lib/`, `apps/web/components/` and `apps/web/app/`
