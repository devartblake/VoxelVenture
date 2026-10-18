# Going live with payments (Stripe)

The production release of payments on voxelventure.app: from test mode on staging to the first real payment. Do the steps in order. Each says what to do, where to do it, and how to check it worked. How billing works is in [billing.md](../docs/monetization/billing.md); staging is in [STAGING.md](STAGING.md).

**Never put a key or secret in a chat, a ticket, or a command line.** Put them in the settings files on the server with `nano`. npm prints the commands it runs, so a secret on a command line ends up on screen.

## Where things stand (2026-10-18)

| | Item | State |
| :-: | :--- | :--- |
| 1 | Checkout, webhook and hand-over in test mode | ✅ On staging: a building lease paid with the test card arrived through one webhook and gave the buyer the plot |
| 1 | Refund in test mode | ✅ On staging: that order was refunded, and its lease was ended |
| 1 | Pro renewal in test mode | ❌ Not yet: staging has a Pro order with no renewal. Step 1 does it |
| 2 | Policies reviewed and approved (task 45) | ❌ The drafts at `/legal` are yours to review |
| 2 | Operator details on the policies | ❌ None of the `NEXT_PUBLIC_LEGAL_*` settings is set on production |
| 2 | `TERMS_URL`, `REFUND_POLICY_URL` | ❌ Not set on production |
| 3 | Stripe account activated for live payments | Yours to do |
| 4, 5 | Live key and live webhook | Not created |
| 7 | First real payment and refund | Not done |

## 1. Finish test mode on staging

The Pro renewal is the one billing path with no evidence yet. The check script covers it with a Stripe test clock, along with checkout, refunds, reconciliation and a webhook delivered twice. Run it from your machine, in PowerShell, from the project folder:

```powershell
$env:E2E_STRIPE_SECRET_KEY = "sk_test_..."        # staging's test key (from /etc/voxelventure/staging/api.env)
$env:E2E_STRIPE_WEBHOOK_SECRET = "whsec_..."      # staging's test webhook secret
$env:VERIFY_ADMIN_TOKEN = ssh root@SERVER "grep ^ADMIN_TOKEN= /etc/voxelventure/staging/api.env | cut -d= -f2"
npm run verify:stripe -- --api https://api.staging.voxelventure.app --site https://staging.voxelventure.app
```

- It signs up two test owners, pays the Launch Pack and Pro with the test card `4242 4242 4242 4242`, refunds, and renews Pro on a test clock. It checks every result in the owner's dashboard.
- It refuses to run against production.
- **It must end with no `FAIL` lines.** Then close the PowerShell window, so the keys don't stay in it.
- `root@SERVER` is `root@` followed by the Linode's IP address.

Optionally, reset staging afterwards with `bash /srv/voxelventure-staging/current/deploy/staging.sh reset --yes` on the server. That clears the test accounts.

## 2. Policies and operator details

Customers must see the terms and the refund policy before they pay. The API refuses to start with a live key unless the two policy addresses are set (`services/api/config.mjs`).

1. **Review the six drafts at `https://voxelventure.app/legal`:** terms, privacy, refunds, advertising and placements, retention, and merchant responsibilities. What still needs a decision is in [policy_review.md](../docs/monetization/policy_review.md).
2. **Fill in who runs the service** in `/etc/voxelventure/web.env` on the server. These values are fixed into the build, so the site needs a rebuild after you change them:
   ```
   NEXT_PUBLIC_LEGAL_NAME=Your legal name or company
   NEXT_PUBLIC_LEGAL_ADDRESS=Your postal address
   NEXT_PUBLIC_LEGAL_EMAIL=hello@voxelventure.app
   NEXT_PUBLIC_LEGAL_JURISDICTION=the laws of ..., and its courts
   NEXT_PUBLIC_LEGAL_MIN_AGE=16
   ```
3. **Rebuild production** from your machine: `.\deploy\push.ps1 production -Deploy`.
4. **Check** `https://voxelventure.app/legal/terms`: it must show no `[placeholders]`.

## 3. Activate your Stripe account

In the Stripe Dashboard, switch **Test mode off** and click **Activate payments**. Stripe asks for:
- the business type and details;
- the website, `https://voxelventure.app`;
- your identity;
- a bank account for payouts.

Stripe reviews this, sometimes in minutes, sometimes in a few days. Live keys work only once it is done.

## 4. Create the live API key

With Test mode off, go to **Developers → API keys**.

**Use a restricted key.** It can do only what this server needs, so a leaked key does less harm. Click **Create restricted key**, name it `voxelventure-production`, and set:

| Resource | Permission | What the server uses it for |
| :--- | :--- | :--- |
| Checkout Sessions | **Write** | creating a checkout, and reading it back to reconcile |
| Subscriptions | **Write** | reading Pro, and cancelling it on a refund |
| Invoices | **Read** | finding the Pro invoice to refund |
| Refunds | **Write** | refunds from the admin route |

Leave every other resource on **None**, then copy the key (`rk_live_…`). Stripe shows it only once.

If a payment later fails with "The payment service refused: … permission …", Stripe's message names the missing permission. Add it to the key on the same page; there is no need for a new key.

> The server treats a restricted live key (`rk_live_`) exactly like a full one (`sk_live_`): it refuses to start without the two policy addresses in step 6, and staging refuses both kinds.

## 5. Create the live webhook

With Test mode off, go to **Developers → Webhooks → Add endpoint**.

- **URL:** `https://api.voxelventure.app/billing/webhook`
- **Events:**
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `invoice.paid`
  - `customer.subscription.deleted`
  - `charge.refunded`

Save it, then copy its **Signing secret** (`whsec_…`).

## 6. Put the keys on production

On the server (`ssh root@SERVER`), in **production's** file. That's `/etc/voxelventure/api.env`, without `staging/` in the path:

```sh
nano /etc/voxelventure/api.env
```

Add or set these four lines:

```
STRIPE_SECRET_KEY=rk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
TERMS_URL=https://voxelventure.app/legal/terms
REFUND_POLICY_URL=https://voxelventure.app/legal/refunds
```

Then check the settings and restart:

```sh
cd /srv/voxelventure/current && node scripts/check-env.mjs /etc/voxelventure/api.env   # must say: ok
systemctl restart voxelventure-api
systemctl is-active voxelventure-api                                            # must say: active
```

- **If the API does not start,** `journalctl -u voxelventure-api -n 30` says why. Usually it is a missing policy address.
- **Staging keeps its `sk_test_` key.** `deploy/staging.sh deploy` refuses a live key there, so a live key can never take test traffic.

## 7. The first real payment

1. **Pay for the cheapest thing:** sign in on `https://voxelventure.app` with your own account, and rent a pop-up market stall ($2 to $5) with your own card.
2. **Check it arrived once.** In Stripe (live), under **Payments**, you should see one payment. On the server, these counts must each have gone up by one, and the order must be `paid`:
   ```sh
   sqlite3 /srv/voxelventure/shared/data/voxelventure.db "SELECT COUNT(*) FROM orders WHERE status = 'paid'; SELECT COUNT(*) FROM stripe_events; SELECT product, status, cents FROM orders ORDER BY created_at DESC LIMIT 1;"
   ```
3. **Refund it** with the admin route. It uses an idempotency key, so a retry never refunds twice. This reads the admin token from the settings file, so it never appears on screen; put the order's number in place of `ORDER_ID`:
   ```sh
   curl -fsS -X POST -H "Authorization: Bearer $(grep ^ADMIN_TOKEN= /etc/voxelventure/api.env | cut -d= -f2)" \
     https://api.voxelventure.app/admin/billing/orders/ORDER_ID/refund
   ```
4. **Check the refund:** the order shows `refunded`, Stripe shows the refund, and what was bought is taken back, as [billing.md](../docs/monetization/billing.md) describes for each product.
5. **Run the live check:**
   ```sh
   cd /srv/voxelventure/current
   VERIFY_ADMIN_TOKEN="$(grep ^ADMIN_TOKEN= /etc/voxelventure/api.env | cut -d= -f2)" \
     npm run verify:live -- --api https://api.voxelventure.app --site https://voxelventure.app
   ```
   It must end with `all checks passed`.

## 8. After going live

- **Reconciliation:** the API compares its orders with Stripe every hour, so a missed webhook is picked up within the hour. Stripe shows failing deliveries under **Developers → Webhooks**, and emails you if they keep failing.
- **Alerts:** in Stripe, under **Settings → Notifications**, turn on emails for disputes and failed payouts.
- **Keys:** rotate the live key if it is ever exposed. Create a new restricted key, swap it into `api.env`, restart the API, then delete the old one in Stripe.
- **Turning payments off:** this is the emergency switch. Remove the `STRIPE_SECRET_KEY` line from `/etc/voxelventure/api.env` and run `systemctl restart voxelventure-api`. Paying is switched off, and what people already bought stays.
- **Backups:** orders and entitlements are in the database, so the nightly backups (off-site in Linode Object Storage) cover them.
