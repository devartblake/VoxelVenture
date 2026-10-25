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
   - ✅ **Decided (2026-10-24): part-used time is refunded pro rata** when an account is deleted or an admin refunds it (below, section 3 item 6; [billing.md](billing.md#refunds-of-unused-time)). Time already used is never refunded. Still to check with a lawyer: that this meets a consumer cooling-off right where one applies;
   - whether a consumer cooling-off right applies (usually yes for online consumer purchases in the EU and UK; the right is lost once the service has started with the buyer's agreement, which checkout would then need to collect).
4. **Banned and restricted advertising categories.** The draft bans illegal content, adult content, weapons, gambling, crypto giveaways and unsupported claims. Decide restricted ones, such as alcohol, supplements and financial products.
5. **Moderation:**
   - who moderates;
   - how fast reports are looked at;
   - how a ban is appealed (needed by some laws for online platforms).
6. **Service providers:** name the hosting and email providers. If they are in other countries, add transfer wording.
7. **Merchants and customer data:** these terms alone, or a data processing agreement too (whether a merchant is a separate controller or our processor depends on the law and the facts).
8. **Tax:** do prices include sales tax or VAT? Add wording.
9. ✅ **Decided: ad spaces in the city are paid,** and discounted with Pro ("ad spaces are not going to be free, they can be discounted with the Pro plan"). Built: gap 4.

## 3. Where the product does not match what a policy should say

These are true today and the drafts say so honestly. Each one is better fixed in the code than written into a policy. Rough sizes are given.

1. ✅ **Fixed (2026-10-16): raw network (IP) addresses are no longer kept.**
   - **What changed:** the multiplayer server now keeps only `net`, the same salted hash the API stores. `net` is `sha256(IP_SALT|address)`, cut to 16 characters. The error log, the console, `/status` and the `/admin` monitor all show it instead of the address.
   - **Configuration:** `presence.env` takes the API's `IP_SALT`. It also sets `TRUST_PROXY=1`, so behind Caddy each player's own address is hashed, not 127.0.0.1 for everyone. This also makes the per-network connection cap work in production.
   - **Tests:** `tests/multiplayer.test.mjs` and `tests/legal.test.mjs`.
   - **Your old logs:** error logs written before this change can still hold full addresses. Delete `services/multiplayer/logs/client-errors.jsonl*` on any machine that ran the server.
2. **The Plot of the Day newsletter is opt-out for account holders.** It goes to every account with a confirmed email and notices on, and notices are on by default (`services/api/engage.mjs`, `sendNewsletter`). Account holders get no unsubscribe link, only "turn these off in your account". Marketing email often needs opt-in. **Fix:** separate the newsletter from service notices, make it opt-in, and add a one-click unsubscribe link. *Half a day.*
3. ✅ **Fixed (2026-10-16): take-over emails no longer say "you were paid out $X".** They now say "the game credited you N in game value (play money: no real money is paid)", with no currency sign (`services/api/engage.mjs`, `notifyTakeover`, `notifyAdTakeover`; checked by `tests/engage.test.mjs` and `tests/legal.test.mjs`). The terms say the same.
4. ✅ **Fixed (2026-10-21): ad spaces are paid** (decision 9).
   - **What changed:** with billing on, `POST /ads/:id/buy` books a billboard ($12) or an aerial banner ($29) for 7 days through Stripe Checkout, 15% less with Pro (`AD_SPACES` and `PRO_DISCOUNT` in `@voxelventure/business-core`; the same 15% as plots, one constant). It can go in the cart, takes promo codes of the group `ads`, holds the space while the player pays, and is refunded like any order. Nobody else can book a space while a booking runs; its holder can add weeks. Without billing it stays the free game take-over.
   - **Policies:** the advertising policy and the refund policy list the prices; neither calls ad spaces free any more. Why these prices: [billing.md](billing.md#ad-spaces).
   - **Tests:** `tests/ads-billing.test.mjs`, `tests/legal.test.mjs`.
5. ✅ **Fixed (2026-10-21): disputes and partial refunds.**
   - **Disputes:** `charge.dispute.created` pauses what the payment bought: a lease is frozen (the building stays open to visitors, but cannot be changed, upgraded or renewed), a placement, the Launch Pack or an ad space stops showing, Pro stops and its billing is paused, a market stall still to come is cancelled. Every admin with a confirmed email is emailed, and **Admin > Disputes** lists it with what was paused. `charge.dispute.closed`: won puts it back, lost ends it (the order is `charged_back`, a Pro plan is cancelled). Audited, and applied once.
   - **Partial refunds** made in the Stripe dashboard are allocated to the order's lines (exactly one line's rest, else latest line first, Pro last). Only a line refunded in full is ended; one refunded in part goes on, recorded with what was refunded. A promo code's counted discount follows.
   - **The admin** sees every dispute and refund, and one order's lines, refunds and disputes (`GET /admin/billing/disputes`, `GET /admin/billing/orders/<id>`).
   - **Policies:** the refund policy says what a dispute pauses and what a part refund ends; its review note is gone.
   - **Tests:** `tests/disputes.test.mjs`, `tests/legal.test.mjs`.
6. ✅ **Fixed (2026-10-21): people can download their data and delete their account themselves** (`services/api/privacy.mjs`, [backend.md](../architecture/backend.md#privacy)).
   - **Data export:** Download my data, in the game's Account panel and on My profiles (`GET /me/export`, 3 a day): every table about the account, as JSON and a plain-language summary. A table left out is named in the file with the reason. In a conversation the other person's messages are included as the Inbox shows them, never their account number; requests and sign-ups an owner received only as the dashboard shows them.
   - **Account deletion:** Delete my account (`POST /me/delete`), with the password again and the name typed, after a screen that says what goes, what stays and why, and the refund of unused time it makes first, estimated line by line (linking the refund policy). Done at once, no grace period. The name becomes `deleted-<n>`; email, password, sessions, chat, notices, sign-ups, watches, the cart and holds go; messages, chat and feedback text are wiped; plots and ad spaces are released at once; Pro is cancelled in Stripe at once. Kept, without personal data: orders and payments (accounting and tax), the action log (cannot be changed by design), plot and Credits history under the new name, figures with a random number in place of the account.
   - **An owner deletes a business page** (`DELETE /businesses/:slug`, on My profiles): gone from its address, Discover and the sitemap, its plot unlinked, its requests and sign-ups deleted, its figures kept in total only, its own orders' unused time refunded first (Pro's month, sponsored weeks; not leases), Pro cancelled.
   - **For email requests:** the admin's Privacy requests page (`/admin/privacy`) finds the account and exports or deletes it, audited.
   - **Tests:** `tests/privacy.test.mjs` (every table must be classified: a new table with an `account_id` column fails it), `tests/contracts.test.mjs`, `tests/legal.test.mjs`, `tests/live-browser.test.mjs`.
   - ✅ **Refunds of unused time (2026-10-24):** deleting an account first refunds, pro rata, the unused time of every line still running (leases, renewals not started, ad and sponsored weeks, the Pro month, stalls to come; not the Launch Pack or upgrades, nothing under $1, nothing while disputed or charged back, nothing for an account closed for breaking the rules). Stripe failing deletes nothing. Admins can refund unused time without a deletion, for one order or an account, and what is refunded ends. The refund policy has a section "Refunds of unused time" (Stripe keeps its fee; it is not taken off the refund). [billing.md](billing.md#refunds-of-unused-time); tests: `tests/prorata.test.mjs`.
   - **Still for the review:** the [30]-day answer for requests by email, and how long payment records are kept by law (the retention policy's placeholder).
7. **Kept with no end date:**
   - sent emails (`outbox`);
   - visits and presses with scrambled addresses (`events`, `business_events`, `ad_events`);
   - the country list of arrivals (`arrivals`);
   - expired sign-in rows (`sessions`);
   - pending and unsubscribed newsletter sign-ups (`leads`);
   - social posts;
   - off-site backup copies (`rclone copy` never deletes).

   **Fix:** decide limits and add clean-up jobs (*half a day*), or justify keeping each.
8. **Owner names are public in the plot list.** `GET /plots/state` lists every plot's owner account name and account number. The privacy policy says names are public; the account number need not be. *Minutes.*
9. **The X welcome-post consent.** The server accepts the consent without a handle; the form does not. Un-ticking it does not remove a post already made (the policy says so). *Minutes.*

## Sources

The facts come from an inventory of the code on 2026-10-17. The main sources are:

- `services/api/core.mjs`, `engage.mjs`, `business.mjs`, `conversions.mjs`, `messaging.mjs`, `moderation.mjs`, `billing.mjs`, `social.mjs`, `stats.mjs`, `schema.sql`
- `services/multiplayer/server.mjs`
- `packages/business-core/src/plans.js`, `lib/game/leases.js`, `lib/market/layout.js`, `lib/business/referral.js`
- `deploy/backup.sh`
- every `localStorage` key in `lib/`, `apps/web/components/` and `apps/web/app/`
