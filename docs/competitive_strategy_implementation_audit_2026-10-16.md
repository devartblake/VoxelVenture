# VoxelVenture — Competitive Strategy Implementation Audit and Prioritized Backlog

**Audit date:** 2026-10-16  
**Repository:** devartblake/VoxelVenture  
**Reviewed:** latest accessible main branch code and documentation, including server/api/billing.mjs, server/api/business.mjs, lib/business/referral.js, components/business/ShareProfile.jsx, tests/billing.test.mjs, tests/stats.test.mjs, .github/workflows/ci.yml, docs/alignment_status.md, docs/business_funnel.md and docs/billing.md.  
**Companion:** [Viral monetization strategy](competitive-research/VoxelVenture_Competitive_Strategy_Viral_Monetization.md).

## Executive verdict

**Concept differentiation: strong. Implementation coverage: substantial. Commercial launch validation: incomplete.**

VoxelVenture already goes beyond Claim Avenue's visual-property concept: it has a playable city, useful free business listings, indexable public discovery, signed referrals, verified engagement analytics, a paid plan catalogue and payment-processing code. The main bottleneck is no longer building an MVP from scratch. It is **deployment certification, live commerce validation, real conversion outcomes and retention evidence**.

**Evidence labels:** Implemented = concrete source exists; Partial = some source exists but material workflow/validation remains; Missing = not established in the inspected code/docs. Source existence and mocked integration tests do **not** establish successful production operation.

## Feature alignment matrix

| Strategic requirement | Classification | Evidence / qualification |
|---|---|---|
| Distinctive interactive experience | **Implemented** | City renderer, interiors, vehicles, multiplayer and game loops described in docs/overview.md and docs/tasks.md; corresponding source paths and tests documented |
| Free entry and fast first value | **Implemented** | POST /businesses, public business pages and owner onboarding in server/api/business.mjs and docs/business_funnel.md |
| Searchable public discovery | **Implemented** | /discover, /category and /district server-rendered pages, metadata and sitemap documented in docs/business_funnel.md |
| Mobile/non-WebGL alternative | **Implemented** | components/ui/NoWebGL.jsx and server-rendered public pages, per docs/alignment_status.md |
| Shareable identity and social previews | **Implemented** | components/business/ShareProfile.jsx, Open Graph routes and optional 3D deep links |
| Signed referral and campaign attribution | **Implemented** | HMAC referral code in server/api/business.mjs, browser retention in lib/business/referral.js, UTM campaign tracking |
| Verified engagement and owner analytics | **Implemented, production unverified** | Server event verification and dashboards documented in docs/business_funnel.md; tests/stats.test.mjs |
| Transparent digital rights | **Partial** | Lease protection and terms modeled; legal copy, operational policy and forced-takeover messaging require final review |
| Launch Pack, Pro and sponsored inventory | **Implemented in code** | lib/business/plans.js, server/api/billing.mjs and docs/billing.md; requires live Stripe and terms |
| Checkout and durable entitlements | **Implemented in code** | Server-priced Checkout, webhook signature checks, idempotency, reconciliation and refunds; tests/billing.test.mjs uses a fake Stripe server |
| Moderation, abuse controls and audit | **Implemented in code, production unverified** | Moderation commands and append-only audit log in docs/alignment_status.md |
| Lead capture and CTA integrations | **Partial** | Newsletter double opt-in exists; meeting/order/demo CTAs and confirmed downstream conversions need provider-specific validation |
| Cohort retention and subscription renewal | **Partial** | Engagement counters and subscription logic exist; no real 30-day retention or paid renewal evidence |
| Production readiness | **Partial** | CI workflow, environment validation and smoke-test scripts exist; host, credentials, protected branch, scanning and live certification outstanding |
| Customer willingness to pay | **Missing evidence** | No documented live paid pilot or verified customer renewal cohort |

## Important documentation corrections

- docs/claimavenue_competitive_alignment_review.md is a **historical baseline at commit 9301b4c**. Its statements that Stripe, referrals, free profiles and subscription packaging are missing are **superseded** by docs/alignment_status.md and current source.
- docs/overview.md still describes payments as disconnected and old forced take-over payouts. Update this to reflect the present **Stripe-backed lease payments without payout to displaced tenants** and the intentional deferral of real-money 1.25x payouts.
- docs/tasks.md begins with a 2026-10-15 test count and mixed done/to-do labels. Normalize to a dated, commit-pinned status summary; distinguish code complete from deployed, externally verified and customer validated.
- The phase_5_ai_agent_delivery_estimate.md baseline assumes earlier phases still need implementation. Re-estimate from today's code and outstanding certification work rather than treating the original 9–12 weeks as remaining coding time.

## Prioritized backlog

| ID | Priority | Work item | Acceptance / exit evidence | Dependencies |
|---|---|---|---|---|
| VV-COMP-01 | **P0** | Choose host/domain and deploy a protected staging stack | Health checks, migrations, backups, TLS, production-mode environment validation and documented rollback tested | Host/domain and credentials |
| VV-COMP-02 | **P0** | Activate Stripe test/live configuration and certify commerce | Real Stripe test-mode purchase/refund/cancel/renewal; webhook replay; delayed payment; reconciliation; then approved live smoke purchase | Stripe account, webhook secret, terms/refund policy |
| VV-COMP-03 | **P0** | Close governance/security controls | Protect main, require CI, enable secret scanning/push protection, validate dependency alerts, record CI run URLs | Repository settings |
| VV-COMP-04 | **P0** | Finalize consumer/business rights and paid placement disclosures | Legal-approved terms, privacy notice, refund rules, lease expiration/takeover wording, clearly labeled sponsored placements | Policy decisions/counsel |
| VV-COMP-05 | **P0** | Validate free-to-paid funnel in a real pilot | 10–20 external testers, ≥3 business interviews, recorded signup→activation→paid funnel and issue log | Staging and tracking |
| VV-COMP-06 | **P1** | Close outcome-oriented CTA conversion loop | Newsletter verified signup, booking confirmation, demo inquiry, order conversion where supported; dedupe and attribution tests | Provider integration choices |
| VV-COMP-07 | **P1** | Build cohort retention and paid-renewal reports | Day 1/7/30 cohort view, source segmentation, trial→paid, renewals, cancellations, refunds, activation and returning visitor counts | Reliable production event data |
| VV-COMP-08 | **P1** | Improve referral fraud defenses and consent | Self-referral and abuse tests, referral expiry, consent/privacy disclosures, verified attribution quality | Real pilot signals |
| VV-COMP-09 | **P1** | Verify mobile and accessibility journeys | Keyboard/screen reader and no-WebGL flows; mobile performance budget and share-preview checks | Staging URL |
| VV-COMP-10 | **P1** | Validate campaign economics | Sponsored inventory delivery reports, click quality, customer-reported lead value, renewals and pricing interviews | Paid pilot |
| VV-COMP-11 | **P2** | Tune 3D-to-business conversion | Compare direct public profile entry against city-first traffic; optimize city CTA and deep links without adding new world systems | Funnel analytics |
| VV-COMP-12 | **P2** | Refresh documentation and operational runbooks | Overview, tasks, alignment status, pricing and estimate use one dated source of truth | P0 evidence |
| VV-COMP-13 | **P2** | Expand creator-specific product features only if validated | Creator interviews demonstrate distinct willingness to pay; gated feature proposal | Pilot findings |

## Proposed sequencing

**Gate A — Trust and infrastructure:** VV-COMP-01 through 04. Do not turn on live purchases until checkout, terms, security and deployment evidence pass.

**Gate B — Commercial pilot:** VV-COMP-05, 06, 08 and 09. Measure real activation and outcomes rather than simulated visits.

**Gate C — Retention and monetization:** VV-COMP-07 and 10. Determine whether Pro and sponsored placements deliver repeat value.

**Gate D — Optimize differentiation:** VV-COMP-11 through 13. Only then revisit expanding the world or introducing additional economic mechanics.

## Commercial test criteria

Use the strategy's **provisional hypotheses**, not as promises: visitor→signup ≥8%; signup→activation ≥50%; activated→paid ≥10%; 30-day active retention ≥25%; paid renewal ≥70% after a full billing cycle. Track refunds and chargebacks separately. For the first pilot, prioritize qualitative evidence of genuine customer value and at least 10 paying customers over hitting arbitrary aggregate revenue.

## Implementation guardrails

1. Preserve the existing Next.js, Node API, SQLite-backed logic and React Three Fiber experience unless measured constraints justify migration. A speculative FastAPI/PostgreSQL rewrite is not a competitive differentiator.
2. Keep simulated city activity separate from authoritative advertiser analytics.
3. No cash payouts or investment-like property claims without legal, tax and fraud review.
4. Continue the documented world-expansion freeze until real commercial validation.
5. Treat passing local/mock tests, CI, staging evidence and production customer evidence as **different certification levels**.

## Audit limitations

This is a **source inspection**, not a cloned full-tree static analysis or an executed test run. No live host, Stripe account, actual payment, deployment, CI outcome, security scan or customer cohort was independently exercised. The repository has substantial code; do not infer missing functionality merely because a file was not sampled. Before closing tickets, pin the target commit SHA and collect test/deployment artifacts.
