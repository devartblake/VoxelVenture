# Take-over payouts: why the 1.25x rule stays in Gold

**Decision (2026-10-16):**

- The 1.25x take-over rule stays a **Gold-only game mechanic**.
- With real money, a take-over is a **conventional lease**: the new tenant pays the platform the lease price, and the tenant being replaced is paid nothing. This is what [billing.md](billing.md#in-the-game-leases-and-market-stalls) implements.
- Paying out real money on a take-over is **not planned**. It would need a legal, tax and payment-provider review first.

This document records why. It is not legal advice. Have counsel review the investment and money-transmission questions for each country VoxelVenture operates in before revisiting the decision.

## The rule in question

In the game, anyone can take over a business whose lease has ended. They pay 1.25x its value, the old owner is "paid out" that price, and the plot's value becomes the new price (`TAKEOVER_MULTIPLIER` in `lib/city/cityGenerator.js`). Doing the same with real money would make VoxelVenture something quite different from a business directory with paid placements.

## What real-money payouts would mean

### 1. Legal and regulatory

- **It can look like an investment product.** Someone pays for a plot expecting a 25% gain that depends on other people buying after them. US regulators judge whether something is a security largely by that pattern: money put in, expecting profit from others' efforts. Other countries use similar tests, and a fixed, advertised 25% profit makes the case stronger.
- **Profits funded by later buyers.** Each payout is paid by the next arrival, and prices only go up. Regulators and payment processors look closely at schemes where earlier participants profit from later ones.
- **Holding and paying out other people's money.** Taking money from one user and paying it to another normally needs a money-transmitter licence. The usual way round that is a marketplace payment product such as Stripe Connect, where the payment provider holds the funds.
- **The payment processor may refuse it.** Stripe's list of restricted businesses includes investment-like and "get rich" schemes. Whether this qualifies is a judgement call, but if the account were closed, every payment would stop: Pro, placements and leases too.

### 2. Tax and identity checks

- Payouts are taxable income for whoever receives them. The platform would collect tax details (W-9 for US sellers, W-8BEN for others) and file year-end information returns where the thresholds apply.
- Every recipient needs identity checks and a verified bank account before being paid.
- Sales tax or VAT on digital services may apply to the incoming payment. The accounts would also have to decide whether the platform's revenue is the whole take-over price or only its cut.

### 3. Fraud and money laundering

- **Cashing out stolen cards.** Someone buys a take-over with a stolen card, takes over their own plot from a second account, and the payout lands in a clean bank account. The chargeback can come up to about 120 days later, after the money has gone, and the platform pays it.
- **Coordinated price inflation.** A group of accounts takes over each other's plots to push values up, then sells to a real buyer. The 1.25x rule makes every step of that profitable.
- **Defences cost money and slow things down.** Payouts would need holding for weeks, plus identity checks, limits on how often a plot can change hands, and staff to review flagged activity.

### 4. Economics

- **Prices compound.** After n take-overs a plot costs its value times 1.25 to the power n. After 10 take-overs a $5 plot costs about $47; after 20, about $434. Whoever holds it when buyers run out loses.
- **The platform earns nothing on take-overs.** If the whole price goes to the old owner, VoxelVenture keeps nothing. It still pays card fees on the incoming money, the cost of each payout, and every chargeback. Each take-over loses money unless the platform takes a cut, and a cut weakens the "+25%" promise.
- **Prepaid leases conflict with it.** A tenant who prepaid a year and is displaced would need a refund rule as well as the payout, which adds to the cost.

### 5. Product and brand

- The [competitive alignment review](../competitive-research/claimavenue_competitive_alignment_review.md) moves VoxelVenture toward a business-first directory. Real-money take-overs reward speculators for displacing real businesses from their storefronts and listings.
- Advertisers want stable placements. A business that loses its page to a speculator leaves, and says why.
- Bots and speculators would chase the guaranteed 25%, which degrades discovery and the verified statistics.

### 6. Engineering and operations

Building it would take roughly 2 to 4 weeks of engineering, plus legal review and ongoing operations:

- Stripe Connect accounts for every owner.
- Transfers linked to the original payment, and payout holds.
- Handling negative balances when a refund arrives after a payout.
- Tax forms, disputes and support.

## The options

| Option | Risk | Note |
| --- | --- | --- |
| **Chosen:** a real-money take-over is a new lease paid to the platform; the old tenant gets nothing | Low | Only possible after the lease and its grace week have ended, so nobody is displaced mid-lease. Built in phase 4b. |
| Refund the unused part of the old tenant's lease | Low | A normal refund, not a profit. Not needed while take-overs wait for a lease to end. |
| **Chosen for the game:** the 1.25x rule in Gold, which cannot be withdrawn | Low | Keeps the game mechanic. Gold is never sold for money and never exchanged back. |
| Real-money 1.25x payout | High | Only after the legal, tax and processor reviews above |

## Keeping the Gold rule safe

These rules keep the 1.25x mechanic a game and not a payout:

1. **Gold is never sold for money.** This is already a rule in [billing.md](billing.md) and `lib/business/plans.js`.
2. **Gold never turns back into money,** and it can't be transferred between accounts outside the game's own rules.
3. **Gold can't buy anything paid for with money.** A take-over paid for with Gold changes who runs the plot in the game. It never grants a Pro plan, a placement or a paid lease.
4. **Gold balances live on the server** before take-overs pay out in Gold, so balances can't be edited in the browser. Gold is still kept in the browser today; see "Gold on the server" in [tasks.md](../roadmap/tasks.md).

## What exists today

| | Without Stripe settings | With Stripe settings |
| --- | --- | --- |
| Take-over price | 1.25x the value, shown in dollars and recorded in the ledger; nothing is charged | The lease price at 1.25x the value, charged through Stripe Checkout |
| The old tenant | Recorded as "paid out" in the game's history; no Gold or money moves | Paid nothing. The email says the lease had ended. |
| Gold | Kept in the browser (chest, hunt, fishing, clothes) | Unchanged |

**Still to do for the Gold rule:**

- Move Gold to the server.
- Price game take-overs in Gold, and pay the old owner 1.25x in Gold, with every movement in a Gold ledger like the server's Credits.
- Decide how a Gold take-over and a paid lease share a plot. One option: Gold take-overs apply to plots outside paid leases, so a business paying real money is never displaced by Gold.
