# Billing: phase 4, low-risk monetisation

Phase 4 of the [competitive alignment review](../competitive-research/claimavenue_competitive_alignment_review.md#recommended-implementation-sequence). Everything is paid through Stripe Checkout:

- **Business profiles:** the Launch Pack, Pro and sponsored placements.
- **The game:** leases (claiming, taking over or renewing a plot) and market stalls ([below](#in-the-game-leases-and-market-stalls)).

The code is in `services/api/billing.mjs`. The catalogue is in `packages/business-core/src/plans.js`, imported everywhere as `@voxelventure/business-core` ([ADR 0001](../architecture/adr/0001-shared-package-boundaries.md)). The tests are `tests/billing.test.mjs` and `tests/billing-game.test.mjs`, which run against a fake Stripe server.

## What is sold

| Product | Price | What the owner gets |
| --- | --- | --- |
| Launch Pack | $9 once | A week in **New this week** at the top of Discover, a highlighted card, a **New this week** badge on the profile page, a share image with a gold frame and a "New this week" label for that week, and a summary of the week on `/business/manage` |
| Pro | $19 a month | Where visitors came from, campaign results, the 30-day chart, CSV export of the figures, and an **offer**: one line at the top of the public page, optionally until a date up to 90 days ahead. When Pro ends the offer is hidden; it is kept, and comes back with Pro. Cancelling stops renewal at the end of the paid month. |
| Sponsored placement | A week: $99 top of Discover, $49 a district page, $29 a category page | A card labelled **Sponsored** at the top of that page. Each spot has three slots, so sponsored cards never fill the page. |

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
- `charge.refunded`

If a slot was oversold anyway (two payments land at the same moment), the later payment is refunded automatically.

## In the game: leases and market stalls

With payments on, these game actions return `{ checkout: { orderId, url, cents } }` instead of happening at once:

| Action | Endpoint | Price |
| --- | --- | --- |
| Claim an empty plot | `POST /plots/<id>/claim` | The lease price for the chosen term (`lib/game/leases.js`) |
| Take over an ended lease | `POST /plots/<id>/takeover` | The take-over price |
| Renew a lease | `POST /plots/<id>/renew` | The renewal price |
| Book a market stall | `POST /market/book` | The stall's price for its slot ($2 to $5) |

Plot prices are in dollars, and the order charges them in cents. The game sends the player to Stripe and back to `/?paid=<order>`, then tells them how it went.

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
- **Stall.** The booking is cancelled.
- **Cancelling a paid stall.** A stallholder can cancel before the stall opens, and gets a full refund.

Without Stripe settings, all of these work as before: at once, and free.

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
2. In **Developers > Webhooks**, add the endpoint `https://<api host>/billing/webhook` and select the events listed above. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Write the terms, the refund policy, and the advertising and placement terms (the review's P0 list). Publish them and set `TERMS_URL` and `REFUND_POLICY_URL`. *Drafted at `/legal/terms`, `/legal/refunds` and `/legal/advertising`; see `docs/monetization/policy_review.md` for what is left before they can be approved.*
4. Turn on customer emails for receipts (see [Receipts](#receipts)).
5. Try the whole loop with a test key and Stripe's test cards (`4242 4242 4242 4242`): buy, check `/business/manage`, refund, and check that the entitlement goes away. Then switch to the live key.
