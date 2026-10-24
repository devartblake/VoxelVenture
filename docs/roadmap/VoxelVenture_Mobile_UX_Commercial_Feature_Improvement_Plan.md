# VoxelVenture — Mobile UX and Commercial Feature Improvement Plan

**Prepared:** October 24, 2026  
**Purpose:** Actionable improvements based on mobile screenshots and screen recording, aligned to the Claim Avenue competitive strategy.  
**Status:** Recommendations and visual observations; not production certification.

## Executive summary

VoxelVenture already renders an explorable 3D city on iPhone and exposes a mobile HUD, minimap, compass, joystick, camera modes, buildings, business profiles, search/discovery, purchase actions, sharing, verified-traffic dashboards, attribution sources, building history, social/chat and vehicle/boat interaction prompts.

**Preserve the current world and backend.** Focus first on the complete business discovery → profile → customer action → server-side attribution → owner analytics journey, payment and ownership transparency, and mobile HUD usability. A visible control is not proof its backend pipeline works.

## 1. Evidence and status

| Capability | Evidence from supplied mobile media | Assessment |
|---|---|---|
| 3D city, terrain, roads, buildings, water | Rendered on iPhone | Visually demonstrated |
| Minimap, compass, joystick, camera controls | Visible; camera mode changes in recording | UI demonstrated; full input matrix not tested |
| Boat and car interactions | On-screen prompts | Actions not functionally certified |
| Building detail and business identity | Ridge Partners and Synaptix Play HQ panels | Visually demonstrated |
| Building entry / walk to door | Actions shown | Completion unverified |
| Business directory, search, categories, districts | Seen in recording | UI demonstrated; result quality unverified |
| Plot takeover and displayed price | $9.38 takeover displayed | Checkout, authorization and entitlement unverified |
| Share link / website badge | Controls shown | Actual share targets and attribution unverified |
| Visits, visitors, site clicks, click rate | Metrics visible, zero for sample building | Data integrity unverified |
| Traffic-source attribution | Walk-by, billboard, aerial banner, map search, player share | Server attribution accuracy unverified |
| Building history | Timeline and transaction/plot value shown | History provenance unverified |
| Nearby chat / sign-in | Chat UI visible | Security and moderation unverified |
| Occupied plots | UI shows 401 / 855 | Displayed figure, not audited occupancy |

### Interpretation

The product already presents a differentiated 3D business-discovery experience. The largest gap is **production proof of commercial outcomes**, not additional world size. Sample zeros in analytics are not inherently defects; investigate instrumentation, actual traffic, eligibility, and data recency before making conclusions.

## 2. Priority backlog

Priority labels: **P0 = launch-critical commercial correctness**, **P1 = usability, measurement and growth**, **P2 = differentiation after validation**.

### VV-UX-01 — Certify discovery-to-business conversion (P0)

**Goal:** Make every discovery surface lead to an identifiable, measurable business action.

**Implementation**
- Connect directory, map search, plot selection, building panel and public profile through stable business/plot identifiers.
- Surface clear CTAs: visit website, contact, book, directions or other provider-appropriate action.
- Ensure visitor can return to the world without losing location or session.
- Record the source surface, business ID, campaign/referral ID and action type server-side.
- Define an event taxonomy: `business_impression`, `profile_open`, `business_cta_click`, `qualified_action`; keep event schemas versioned.
- Never claim a qualified lead based solely on a page view or unconfirmed outbound click.

**Acceptance:** A test visitor discovers a business, opens its profile, activates a real CTA, and an eligible server-side record appears once in owner analytics with the correct source.

### VV-UX-02 — Certify Stripe and ownership lifecycle (P0)

**Goal:** Make displayed purchase/takeover prices correspond to safe, auditable entitlements.

**Implementation**
- Verify authoritative server-calculated price, currency, eligibility and ownership state; never trust UI totals.
- Run Stripe test-mode checkout, signed webhook verification, idempotent entitlement grant, cancellation/refund, renewal and reconciliation.
- Verify failed/abandoned checkout cannot grant ownership.
- Test race conditions for two buyers attempting the same plot.
- Provide clear lease/takeover rules and price disclosure before purchase.
- Preserve existing business ownership records and immutable transaction/audit history.

**Acceptance:** Authorized purchase grants exactly one correct entitlement; duplicate webhook has no extra effect; refund/revocation and failed checkout produce correct states.

### VV-UX-03 — Verify analytics and attribution integrity (P0)

**Goal:** Convert attractive dashboards into reliable owner reporting.

**Implementation**
- Define server-authoritative visit, unique visitor, dwell time, site click, click-through rate and conversion rules.
- Check human-traffic filtering, bot exclusions, self-traffic handling, repeat events and time-window boundaries.
- Validate attribution from city walk-by, billboard, aerial banner, map/search and player-shared links.
- Distinguish impressions from visits, clicks and leads; show definitions and measurement windows.
- Add empty, loading, delayed and error states; do not present missing data as verified zero.
- Protect personal data: minimize identifiers, establish retention and consent handling.

**Acceptance:** Deterministic test events yield expected counts, attribution proportions and 30-day summaries; owner cannot access another owner's private metrics.

### VV-UX-04 — Production reliability, security and policies (P0)

**Goal:** Certify that customer-facing commerce can operate safely.

**Implementation**
- Validate HTTPS, routing, API health, backups/restores, migration and rollback plans.
- Confirm required CI, branch protection, secret handling and monitoring.
- Publish accessible privacy, terms, refund, sponsorship and lease/takeover disclosures.
- Exercise authentication, authorization, rate limiting, audit logs and abuse reporting.
- Verify mobile deep links and fallback behavior when WebGL or API is unavailable.

**Acceptance:** Staging evidence includes deployment smoke tests, backup/restore rehearsal, payment security checks and accessible policy links.

### VV-UX-05 — Real business conversion pilot (P0)

**Goal:** Prove that businesses receive useful results.

**Implementation**
- Recruit a small set of consenting pilot businesses; establish baseline traffic and conversion goals.
- Instrument free profile creation, publish, discovery, share, CTA, upgrade and renewal.
- Provide weekly owner reporting and interview owners about lead quality.
- Compare free profiles, launch pack, Pro subscription and sponsored placement economics.
- Avoid implying commercial success from occupied plot counts alone.

**Acceptance:** Pilot report documents actual funnel counts, costs, qualified outcomes, customer feedback and go/no-go criteria.

### VV-UX-06 — Collapsible mobile HUD (P1)

**Observation:** Minimap, compass, right rail, joystick and bottom controls occupy significant iPhone screen space.

**Implementation**
- Provide compact/default and expanded HUD states; preserve essential navigation and safety controls.
- Collapse optional panels contextually while a building sheet is open.
- Honor safe-area insets and Safari browser chrome; test narrow screens and landscape.
- Persist HUD preference locally where appropriate; provide a reset option.
- Avoid reducing target sizes below practical mobile accessibility guidelines.

**Acceptance:** No critical controls overlap or block building CTAs on common iPhone widths; users can reopen all collapsed controls.

### VV-UX-07 — Building detail sheet and CTA hierarchy (P1)

**Observation:** Building information spans multiple vertically scrollable sections, and purchase and business actions compete for attention.

**Implementation**
- Prioritize business name, description, primary customer CTA and `Step inside`.
- Separate visitor actions from owner/investor actions such as `Take over`.
- Group analytics and building history into secondary tabs/expanders.
- Keep clear close/back controls and visible scroll affordances.
- Avoid nested scroll traps; support keyboard, VoiceOver and dynamic text sizes.

**Acceptance:** Users can identify the primary business action quickly; purchase disclosures remain discoverable before checkout.

### VV-UX-08 — Discovery and search clarity (P1)

**Implementation**
- Promote an explicit `Explore Businesses` entry point on mobile.
- Add understandable category/district filters, search results, empty states and map/list switching.
- Deep-link results to the correct plot and public profile.
- Preserve search query and filters when returning from a building.
- Highlight sponsored results with transparent labeling.

**Acceptance:** A first-time visitor finds a named business and reaches its website/contact action without needing to understand joystick navigation.

### VV-UX-09 — Sharing, referral attribution and abuse resistance (P1)

**Implementation**
- Validate native share, copy link, website badge and open-graph previews.
- Support stable public business URLs, referral codes and UTM campaign fields.
- Enforce attribution expiration, deduplication, bot filtering and self-referral rules.
- Avoid leaking sensitive user data through URLs.
- Verify mobile Safari, messaging apps and social previews.

**Acceptance:** A shared profile opens correctly on another device; eligible actions attribute once to the correct source.

### VV-UX-10 — Retention and campaign reporting (P1)

**Implementation**
- Add cohorts for new vs returning visitors, profile engagement, owner renewals and churn.
- Show campaign spend alongside attributable clicks and qualified actions.
- Distinguish vanity metrics from verified business outcomes.
- Export sanitized summaries for business owners where authorized.

**Acceptance:** Owner can compare periods and understand what action to take; reported denominators and definitions are explicit.

### VV-UX-11 — Mobile accessibility and performance (P1)

**Implementation**
- Audit contrast, screen reader names, focus order, modal trapping, gestures, touch targets and reduced motion.
- Verify low-power devices, poor networks, no-WebGL fallback and orientation changes.
- Profile initial load, frame rate, memory use and interaction latency; set thresholds from device baselines.
- Ensure chat and camera modes do not block business navigation.

**Acceptance:** Defined iOS/Android browser matrix passes manual and automated smoke tests without critical accessibility failures.

### VV-UX-12 — Guided exploration and meaningful interactions (P2)

**Implementation**
- Add optional onboarding for movement, camera, map and business discovery.
- Explain boat/car prompts and whether interaction requires login, purchase or a specific mode.
- Connect world activities to discovery, rewards or community participation without distracting from the business funnel.
- Respect opt-out and returning-player preferences.

**Acceptance:** First-time visitors can complete basic navigation and business discovery with fewer support prompts.

### VV-UX-13 — World-to-business optimization (P2)

**Implementation**
- Test contextual signage, district labels, sponsored placements and proximity cues.
- Avoid intrusive ads that obscure the city or confuse paid placement with organic results.
- Compare conversion rates from map, directory, billboards, aerial banners and walk-by.
- Prioritize proven sources rather than expanding world geometry prematurely.

**Acceptance:** Experiment results identify a measurable lift in qualified actions without material mobile performance regression.

## 3. Implementation slices

| Slice | Scope | Deliverable |
|---|---|---|
| **1 — Commercial funnel (P0)** | Discovery → profile → CTA → attribution | End-to-end tests and event contracts |
| **2 — Commerce trust (P0)** | Stripe, takeovers, entitlements, policies | Payment/ownership certification evidence |
| **3 — Measurement (P0/P1)** | Verified analytics, campaigns, retention | Server-authoritative metrics and reporting |
| **4 — Mobile usability (P1)** | Collapsible HUD, building sheet, discovery | Responsive accessible UX with visual tests |
| **5 — Differentiation (P2)** | Guided world interactions and optimization | Evidence-led experiments |

Slices 1–3 should not be blocked by cosmetic world expansion. Slice 4 can proceed in parallel behind feature flags if the team has capacity.

## 4. Suggested PR sequence

1. **PR A — Contracts and funnel instrumentation:** canonical events, stable IDs, discovery-to-CTA integration and tests.
2. **PR B — Analytics correctness:** deduplication, source attribution, permission checks and test fixtures.
3. **PR C — Checkout and ownership certification:** Stripe test/live gates, webhooks, race conditions, refunds and policies.
4. **PR D — Mobile HUD:** compact mode, safe areas, orientation and responsive tests.
5. **PR E — Building panel/discovery:** primary CTA hierarchy, directory navigation, search and accessibility.
6. **PR F — Sharing and reporting:** deep links, badges, UTM/referrals, campaign and retention metrics.
7. **PR G — Pilot and release evidence:** staged test records, pilot measurements, operations runbooks and rollout decision.

Keep documentation/architecture changes separate from high-risk payment and rendering changes. Do not merge runtime changes until the relevant CI and smoke tests pass.

## 5. Engineering and test requirements

### Contract and backend
- Use existing API and data model; do not rewrite services for this roadmap.
- Authoritative pricing, entitlements, visit counts and conversion events remain server-side.
- Idempotency keys for payment and analytics ingestion; define retention and privacy boundaries.
- Version shared event schemas and preserve compatibility for existing clients.
- Apply least-privilege access to owner analytics and administrative functions.

### Frontend
- Keep 3D exploration available while offering direct list/map business discovery.
- Use semantic labels, stable focus management and responsive bottom-sheet patterns.
- Use loading/error/empty states that distinguish no traffic from unavailable data.
- Test mobile browser navigation, back button, share sheet and deep links.

### Automated tests
- Unit: event definitions, attribution classification, prices and entitlements.
- Integration: profile → CTA → server event → owner report; signed webhooks; permissions.
- Browser: mobile HUD, building panel, directory, no-WebGL fallback and accessibility.
- Regression: existing world movement, camera, boat/car prompts, multiplayer and chat.

### Production verification
- Record sanitized evidence from exact staging/release candidates.
- Exercise backup/restore, monitoring, rollbacks and incident handling.
- Avoid recording real customer personal data in screenshots or CI logs.

## 6. Success metrics

| Funnel stage | Primary metric |
|---|---|
| Discovery | Unique eligible visitors reaching directory/map results |
| Engagement | Business profile open rate |
| Intent | Qualified CTA action rate by source |
| Acquisition | Free business profiles published |
| Monetization | Paid upgrade conversion and successful entitlement grants |
| Retention | Returning visitor cohorts, business renewals and churn |
| Trust | Refund/dispute rate, failed checkout and fraud rate |
| Mobile UX | Task completion, time-to-business, accessibility issues and device performance |

Record baselines before optimization. Do not invent targets or report zero traffic as an outage without checking the data pipeline.

## 7. Acceptance and release gates

**Gate A — Trust and operations:** HTTPS, API health, access controls, policies, backup/rollback and CI pass.

**Gate B — Commercial funnel:** Test users can discover businesses, take qualified actions and generate correct analytics.

**Gate C — Payments:** Stripe lifecycle passes signed-webhook, idempotency, entitlement, refund and takeover tests.

**Gate D — Mobile UX:** Common mobile devices can use the HUD, search, business panels and CTAs without overlap or accessibility blockers.

**Gate E — Pilot:** Real businesses demonstrate measurable value and provide evidence for pricing/retention decisions.

## 8. Immediate checklist

- [ ] Capture baseline screenshots and device matrix for current production UI.
- [ ] Map directory, map, building and public profile routes to canonical IDs.
- [ ] Define and test server-side customer action event taxonomy.
- [ ] Trace verified analytics from ingestion through aggregation to UI.
- [ ] Validate purchase price, takeover rules, Stripe webhooks and entitlement changes.
- [ ] Audit privacy, refund, lease and sponsored placement disclosures.
- [ ] Prototype compact mobile HUD behind a feature flag.
- [ ] Improve building panel primary CTA and responsive layout.
- [ ] Add browser/mobile/accessibility regression tests.
- [ ] Pilot the business funnel and publish sanitized outcome evidence.
- [ ] Update related feature documentation and changelog after each PR.

## 9. Final recommendation

The visual feature set is substantially aligned with a **3D business discovery platform**. The next competitive advantage will come from **validated business outcomes, transparent commerce and a simpler mobile experience**, not a larger world. Certify the P0 funnel and payments first, improve P1 mobile UX and measurement next, and pursue P2 world enhancements only when supported by results.

---

**Evidence boundary:** User-provided screenshots and screen recording, earlier repository review and competitive strategy. UI visibility is not independent verification of backend behavior or live payment processing.
