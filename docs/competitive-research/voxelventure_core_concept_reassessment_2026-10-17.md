# VoxelVenture Core-Concept Reassessment

**Assessment date:** 2026-10-17  
**Repository:** [devartblake/VoxelVenture](https://github.com/devartblake/VoxelVenture)  
**Assessed baseline:** `main` at `40d286eb2c91608a297fd55c23f0008510c51e54`  
**Phase 5 candidate:** [PR #21](https://github.com/devartblake/VoxelVenture/pull/21), head `dc7b8de22b82505e421b6c6885aa6b38e6b7b98c`  
**Related strategy audit:** [PR #22](https://github.com/devartblake/VoxelVenture/pull/22), merged as `03bad9766050c30df1d760c97b32d98cdc7baecb`

## Executive verdict

VoxelVenture is now strongly aligned with the recommended core product: a free, public, searchable business-discovery experience whose optional voxel world adds engagement without blocking ordinary web users, followed by verified attention, merchant tooling, recurring monetization, and measurable business outcomes.

| Dimension | Score | Verdict |
|---|---:|---|
| Concept alignment | 9.5/10 | The intended product model is represented almost completely. |
| Implemented-code alignment on `main` | 8.5/10 | Phases 1–4 are substantially present in the merged code. |
| Implemented-code alignment including PR #21 | 9.3/10 | Phase 5 closes most measurement, retention, and discoverability gaps. |
| Commercial launch readiness | 5.5/10 | Deployment, policy, repository governance, and pilot validation remain. |
| Validated market fit | Not yet measured | A paid merchant pilot is still required. |

The remaining gap is no longer a missing product concept. It is primarily a matter of security hardening, deployment, governance, operational readiness, and real-market validation.

## Core recommendation alignment

The original strategy centered on several principles:

1. Businesses must be able to participate for free.
2. Discovery must work as a conventional public website, independent of WebGL.
3. The voxel world should enrich discovery, not act as a gate.
4. Visibility and engagement must be measurable and resistant to manipulation.
5. Monetization should sell useful promotion and merchant capability, not speculative mechanics.
6. Merchants need attribution that connects attention to meaningful outcomes.
7. Retention should be driven by recurring value, not novelty alone.
8. Trust, moderation, auditability, and operational controls must be part of the product.

The repository now implements nearly all of these principles in code.

## Phase-by-phase assessment

### Phase 1 — Foundation and scope control

**Status: aligned and merged**

The project contains the foundational controls needed to keep implementation focused:

- The voxel-world scope is constrained rather than allowed to expand into an unrelated game platform.
- Continuous integration provides an enforcement point for quality.
- The pull-request template establishes a repeatable review process.
- Product documentation records the intended delivery path.

This foundation matters because the largest strategic risk was uncontrolled investment in world-building before validating business discovery and merchant value. The repository now reflects the opposite priority: public utility and measurable outcomes first.

### Phase 2 — Free public discovery

**Status: strongly aligned and merged**

The code supports the core free-discovery funnel:

- Free business profiles.
- Public discovery through `/discover`.
- Public business pages through `/business/[slug]`.
- Category and district organization.
- Server-rendered, mobile-friendly public pages.
- Search-engine discovery through sitemap and robots support.
- Social sharing through Open Graph metadata.
- A clear primary call to action.
- Business onboarding.
- Signed referral attribution.
- Campaign attribution.
- An optional 3D experience.
- A functional path for users who cannot or do not want to use WebGL.

This is the most important conceptual success in the repository. VoxelVenture no longer depends on a user entering a 3D world before receiving value. The directory and profile surfaces can acquire search traffic, support direct sharing, and convert visitors on ordinary devices.

### Phase 3 — Trust, ownership, and marketplace operations

**Status: aligned in code; production operation remains unverified**

The repository includes the major trust and control layers:

- Authoritative authentication.
- Business ownership claims.
- Lease management.
- Business configuration.
- Verified statistics.
- Advertising controls.
- Market bookings.
- Moderation tooling.
- Audit records.
- A live-provider design that avoids silently substituting simulated production behavior.

These capabilities align with the recommendation that scarce placements and merchant actions must have explicit ownership, traceability, and enforcement.

The principal remaining question is operational rather than conceptual: these systems must be deployed against production-grade services, configured correctly, monitored, and exercised under realistic load and failure conditions.

### Phase 4 — Monetization

**Status: strongly aligned in merged code; live billing still requires certification**

Stripe-backed monetization is represented on `main`, including the work merged through PR #19.

The product structure includes:

- Free participation.
- A low-friction $9 launch offer.
- A $19/month Pro tier.
- Sponsored placement products:
  - $29 category placement.
  - $49 district placement.
  - $99 Discover placement.
- Lease-based products.
- Paid market stalls.
- Webhook processing.
- Idempotency controls.
- Reconciliation.
- Refund handling.
- Audit trails.
- Holds and state controls around inventory.

This is well aligned with the recommendation to monetize enhanced merchant value and premium placement while retaining a useful free tier.

The absence of a speculative `1.25x` payout or similar artificial-return mechanic is appropriate. The current model is easier to explain, safer to operate, and more directly connected to advertising, tenancy, and merchant utility.

### Phase 5 — Outcome measurement, retention, and discoverability

**Status: implemented in open PR #21; not yet part of `main`**

PR #21 substantially completes the measurement layer. It adds or expands:

- Impression tracking.
- Qualified-visit tracking.
- 3D-entry tracking.
- CTA click identifiers.
- Meeting-request conversions.
- Quote-request conversions.
- Newsletter conversions.
- Coupon ticket creation.
- Coupon redemptions.
- Purchase postbacks and pixel-based reporting.
- Spend and cost-per-result reporting.
- Source and campaign conversion reporting.
- Renewal flows.
- Retention-oriented functionality.
- SEO improvements.
- Reduced client-side JavaScript on public paths.

This work closely matches the final recommended concept: merchants should be able to understand not only that they received attention, but also which source or campaign produced a lead, redemption, purchase, or revenue event.

At the time of assessment, PR #21 was open and mergeable, while its CI run was still in progress. These capabilities therefore should not be described as released or merged until the pull request passes all required checks and lands on `main`.

## Alignment matrix

| Core concept | Current alignment | Evidence/status |
|---|---|---|
| Gamified local discovery | Strong | Voxel experience complements public discovery. |
| Free business participation | Strong | Free profiles and discovery surfaces are implemented. |
| Searchable public directory | Strong | `/discover`, categories, districts, and business routes exist. |
| Public merchant profiles | Strong | Shareable, indexable business pages exist. |
| Non-WebGL access | Strong | The public product remains useful without entering 3D. |
| District-based organization | Strong | Districts are reflected in discovery and commercial placement. |
| Verified attention | Strong | Verified statistics and qualified-event concepts are present. |
| Referral attribution | Strong | Signed referral handling is implemented. |
| Campaign attribution | Strong | Campaign-aware measurement is implemented or extended in Phase 5. |
| Merchant analytics | Strong, pending Phase 5 merge for full depth | Existing analytics are expanded materially by PR #21. |
| Leases and premium inventory | Strong | Lease and paid-placement systems exist. |
| Recurring-value loops | Strong, pending Phase 5 merge | Renewals and retention mechanics are concentrated in PR #21. |
| Moderation | Strong | Moderation workflows are represented in code. |
| Auditability | Strong | Audit trails cover important merchant and billing actions. |
| Stripe monetization | Implemented, not live-certified | Code exists; production setup and end-to-end certification remain. |
| End-to-end conversions | Pending merge | Phase 5 contains the broad conversion implementation. |
| Production policies | Missing/incomplete | Legal, privacy, refund, ad, and retention policies need completion. |
| Protected default branch | Missing at assessment time | `main` was not protected. |
| Production deployment | Not demonstrated | Hosting, database, observability, backups, mail, and URLs require validation. |
| Paid-market validation | Not started or not evidenced | A 10–20 business pilot remains the appropriate next proof point. |

## Material issue in PR #21: conversion credential design

The most important issue found in the Phase 5 design is the apparent use of a deterministic conversion key derived from the global referral secret and exposed in a tracking-pixel URL.

A credential placed in a URL can leak through:

- Browser history.
- Application and proxy logs.
- Analytics systems.
- Referrer headers.
- Screenshots.
- Support messages.
- Third-party monitoring.

If that credential can authorize purchase or revenue events, disclosure could allow false conversion or revenue submissions.

### Recommended correction

Separate public browser measurement from verified server-to-server conversion reporting:

1. Give each business a random, independently generated conversion secret.
2. Make the secret rotatable without changing unrelated referral behavior.
3. Accept the secret through an authorization header, not a URL.
4. Store only a secure hash where verification does not require recovery; otherwise use encrypted storage with tightly controlled access.
5. Reserve verified purchase and revenue status for authenticated server-to-server events or reconciled provider events.
6. Treat browser-pixel events as unverified until reconciliation.
7. Label metrics explicitly:
   - Verified revenue.
   - Browser-reported revenue.
   - Unattributed revenue.

The global referral signing secret should not double as a merchant conversion credential.

## Metric-definition issue: “results” can double count outcomes

A single aggregate “results” metric appears to combine events such as:

- Newsletter signup.
- Meeting request.
- Quote request.
- Coupon claim.
- Coupon redemption.
- Purchase.

These are different funnel stages, and one customer may trigger several of them. Summing them produces a number that can double-count or triple-count the same person and makes cost-per-result difficult to interpret.

### Recommended metric model

Report separate outcome families:

| Outcome family | Example events | Recommended commercial metric |
|---|---|---|
| Leads | Newsletter signup, meeting request, quote request | Cost per lead |
| Intent | Coupon claim | Cost per claim |
| Offline conversion | Coupon redemption | Cost per redeemed coupon |
| Online conversion | Purchase | Cost per acquisition |
| Revenue | Verified purchase value | Return on ad spend |

An aggregate result count should only be used when the merchant explicitly selects a single campaign objective or when the interface clearly discloses the event weighting and deduplication method.

## Operational gaps before commercial launch

### 1. Production services and reliability

The project still needs a documented and tested production configuration covering:

- Hosting and domain setup.
- Production API configuration.
- Production database and migrations.
- Backups and restoration testing.
- Stripe live-mode configuration.
- Transactional mail delivery.
- Canonical public URLs.
- Error reporting and alerting.
- Performance and uptime monitoring.
- Incident and rollback procedures.

### 2. Legal, privacy, and commercial policies

Before accepting paid customers, publish and validate:

- Terms of service.
- Privacy policy.
- Refund and cancellation policy.
- Advertising and sponsored-placement policy.
- Data-retention policy.
- Consent language for inquiries and lead delivery.
- Disclosure and consent behavior for local storage, referrals, click attribution, and tracking.
- Merchant responsibilities for submitted offers, coupons, and claims.

### 3. Repository governance

At assessment time, the default branch was not protected. Recommended controls include:

- Protect `main`.
- Require passing CI checks before merge.
- Require pull-request review where appropriate.
- Block force pushes.
- Block branch deletion.
- Enable secret scanning and push protection.
- Enable dependency security alerts and automated security updates.
- Add `CODEOWNERS` coverage for billing, deployment, authentication, and security-sensitive paths.

### 4. Remaining local-only or nonblocking concepts

Some ideas remain outside the central production path, including:

- Gold or game-economy concepts.
- Mall rent mechanics.
- Shared billboard-slot mechanics.
- A short customization hold, such as a three-minute reservation window.

These are not blockers for the core business-discovery product. They should remain subordinate to merchant acquisition, measurable outcomes, and operational reliability.

## Recommended completion sequence

1. Correct the Phase 5 conversion-credential design.
2. Separate leads, intent, offline conversions, online conversions, and revenue in reporting.
3. Wait for all Phase 5 CI checks to complete successfully.
4. Merge PR #21.
5. Reconcile the now-merged PR #22 strategy audit with Phase 5 documentation and close any superseded material.
6. Protect the default branch and enable the recommended security settings.
7. Deploy a staging environment with Stripe test mode, mail delivery, migrations, backups, and monitoring.
8. Complete policy and release-certification checklists.
9. Run a structured pilot with approximately 10–20 businesses.
10. Measure activation, qualified visits, leads, coupon redemptions, purchases, revenue, renewals, and merchant retention.
11. Use pilot evidence—not feature count—to decide the next product investment.

## Release gate for the paid pilot

The paid pilot should begin only when all of the following are true:

- Phase 5 is merged with green CI.
- Conversion credentials are no longer exposed through public URLs.
- Outcome metrics avoid misleading aggregation.
- Stripe checkout, webhook, refund, and reconciliation flows pass end-to-end tests.
- Email and inquiry delivery are reliable.
- Database backups and restoration are tested.
- Production monitoring and alerts are active.
- Required policies are published.
- `main` is protected.
- A pilot dashboard and merchant feedback process are ready.

## Final conclusion

VoxelVenture's core concepts are aligned.

The repository is substantially code-complete through Phase 4, and PR #21 brings it close to code completion for Phase 5. The product correctly prioritizes a free public directory, optional gamification, verified engagement, merchant utility, understandable monetization, attribution, and retention.

It is not yet commercially certified. The remaining work is concentrated in:

- One material attribution-security correction.
- Clearer outcome measurement.
- Phase 5 merge completion.
- Repository protection.
- Production deployment and observability.
- Legal and privacy readiness.
- Paid-pilot validation.

The next milestone is therefore precise:

> Correct and merge Phase 5, protect the repository, certify staging and billing, publish the required policies, and run a measured 10–20 business pilot.

Until that pilot produces activation, conversion, renewal, and retention evidence, the project should be described as **conceptually aligned and technically advanced, but not yet market-validated**.
