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
   - **Your old logs:** error logs written before this change can still hold full addresses. Delete `server/logs/client-errors.jsonl*` on any machine that ran the server.
2. **The Plot of the Day newsletter is opt-out for account holders.** It goes to every account with a confirmed email and notices on, and notices are on by default (`server/api/engage.mjs`, `sendNewsletter`). Account holders get no unsubscribe link, only "turn these off in your account". Marketing email often needs opt-in. **Fix:** separate the newsletter from service notices, make it opt-in, and add a one-click unsubscribe link. *Half a day.*
3. ✅ **Fixed (2026-10-16): take-over emails no longer say "you were paid out $X".** They now say "the game credited you N in game value (play money: no real money is paid)", with no currency sign (`server/api/engage.mjs`, `notifyTakeover`, `notifyAdTakeover`; checked by `tests/engage.test.mjs` and `tests/legal.test.mjs`). The terms say the same.
4. **Ad spaces are never charged.** `POST /ads/:id/buy` has no payment even when billing is on. The advertising policy calls them a free game feature; decision 9.
5. **Disputes and partial refunds.** Chargebacks are recorded but nothing else happens. A partial refund made in the Stripe dashboard is ignored (`server/api/billing.mjs`). **Fix:** handle `charge.dispute.created` (pause what it paid for, alert an admin) and partial refunds. *A day.*
6. **People cannot delete their account or download their data.** The policies say to email. **Fix:**
   - an account deletion that wipes personal fields and keeps anonymised records;
   - a data export;
   - a way for an owner to delete their own business page.

   *Two or three days.* The action log cannot be deleted by design; the privacy policy says so.
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

- `server/api/core.mjs`, `engage.mjs`, `business.mjs`, `conversions.mjs`, `messaging.mjs`, `moderation.mjs`, `billing.mjs`, `social.mjs`, `stats.mjs`, `schema.sql`
- `server/multiplayer.mjs`
- `packages/business-core/src/plans.js`, `lib/game/leases.js`, `lib/market/layout.js`, `lib/business/referral.js`
- `deploy/backup.sh`
- every `localStorage` key in `lib/`, `components/` and `app/`
