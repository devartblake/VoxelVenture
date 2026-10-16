# Billing: phase 4, low-risk monetisation

Phase 4 of the [competitive alignment review](claimavenue_competitive_alignment_review.md#recommended-implementation-sequence). Owners pay for three things, all tied to one business profile, through Stripe Checkout. The code is in `server/api/billing.mjs`, the catalogue is in `lib/business/plans.js`, and the tests are in `tests/billing.test.mjs`. The tests run against a fake Stripe server.

## What is sold

| Product | Price | What the owner gets |
| --- | --- | --- |
| Launch Pack | $9 once | A week in **New this week** at the top of Discover, a highlighted card, a **New this week** badge on the profile page, a share image with a gold frame and a "New this week" label for that week, and a summary of the week on `/business/manage` |
| Pro | $19 a month | Where visitors came from, campaign results, the 30-day chart, and CSV export of the figures. Cancelling stops renewal at the end of the paid month. |
| Sponsored placement | A week: $99 top of Discover, $49 a district page, $29 a category page | A card labelled **Sponsored** at the top of that page. Each spot has three slots, so sponsored cards never fill the page. |

The prices are only ever read from `lib/business/plans.js`. The server charges the catalogue price whatever a browser sends.

**Not sold, on purpose:**

- **Gold.** The game's currency stays a game reward; nobody can buy it with money.
- **Real-money take-over payouts** (the 1.25x rule). These need a legal, tax and fraud review first.
- **Market bookings and lease payments.** These come in a second step (phase 4b), on the same order and webhook machinery.

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

## Refunds and support

- An admin refunds with `POST /admin/billing/orders/<id>/refund`, which uses the idempotency key `vv-refund-<id>`. For Pro, the server cancels the subscription and then refunds the latest invoice. The entitlement is revoked straight away.
- A refund made in the Stripe dashboard arrives as `charge.refunded` and has the same effect.
- `POST /admin/billing/grant/<slug>` with `{ product, placement?, days? }` gives a complimentary entitlement. It creates a zero-cent order that is audited like everything else, for support cases and pilots.
- `GET /admin/billing/orders` lists every order.
- Owners see their own orders with `GET /me/orders` and on `/business/manage`.

Every checkout, payment, refund, grant and revocation is written to the hash-chained `audit_log` ([authoritative_data.md](authoritative_data.md)).

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
3. Write the terms, the refund policy, and the advertising and placement terms (the review's P0 list). Publish them and set `TERMS_URL` and `REFUND_POLICY_URL`.
4. Turn on customer emails for receipts (see [Receipts](#receipts)).
5. Try the whole loop with a test key and Stripe's test cards (`4242 4242 4242 4242`): buy, check `/business/manage`, refund, and check that the entitlement goes away. Then switch to the live key.
