# Graphics & Pilot Rollout Command Center — implementation baseline

Status: **proposed implementation**, 2026-11-13. This document is not evidence of feature completion.

## Decision
Extend the existing authenticated Next.js admin shell with `/admin/rollout`; do not replace `/admin/pilot`. The existing pilot dashboard and verified conversion events remain the authoritative business-performance source. The new command center manages engineering work and release evidence, not merchant metrics.

## Existing foundations verified in repository
- `apps/web/app/admin/page.jsx`: authenticated live client monitor with FPS, renderer counters and quality tier.
- `apps/web/app/admin/pilot/page.jsx`, `services/api/pilot.mjs`: pilot membership, weekly outcomes, feedback and freeze-lift verdict.
- `lib/performance/qualityPolicy.js`, `lodRuntime.js`, `scripts/perf-measure.mjs`: high/medium/low quality and fixed-scene measurement.
- `docs/architecture/performance_policy.md`: budgets are **proposed until measured on real devices**.
- `docs/roadmap/world_freeze.md`: expansion freeze remains authoritative; graphics improvements must be performance/accessibility or approved pilot work.
- `.github/workflows/ci.yml`: selective checks. CI success is not proof of production runtime certification.

## Tracking invariants
1. Execution status: `unverified | in_progress | blocked | complete`. Default `unverified`.
2. Decision maturity: `tentative | proposed | approved`. Default `tentative`. Separate from execution status.
3. A completed task requires acceptance criteria, reviewer, test outcome, and evidence URL; a merged PR alone is insufficient.
4. No placeholder metric is presented as a measured baseline. Device, OS, browser, GPU, viewport, build SHA, scene, quality tier, p50/p95 frame time, FPS, draw calls, triangles, memory, test date and evidence URL are captured separately.
5. Storefront, search, CTA, analytics and deep-link validations are distinct checks, with pass/fail/not-run and reproducible steps.
6. Feature-flag experiments require hypothesis, owner, rollout percentage, exposure event, guardrails, rollback and decision evidence.
7. Production access requires admin authorization, server-side validation, audit history and safe URL handling; no GitHub token in browser storage.

## Seven proposed PR stages (not yet implemented)
| Stage | Scope | Gate |
|---|---|---|
| 1 | Contract, persistence, admin route and status controls | Admin-only writes, audit and migration tests |
| 2 | VV-GFX-01–13 backlog, dependencies, blockers, owners | Editable records and explicit tentative state |
| 3 | Art-direction approvals and asset registry | Signed review and provenance |
| 4 | Device/scene performance matrix and quality tiers | Real-device baselines and budgets |
| 5 | Modular storefront kit and pilot-block business links | Visual and navigation acceptance |
| 6 | Feature flags, search/CTA and analytics verification | Event and rollback tests |
| 7 | GitHub PR/CI linkage and release-evidence gates | Staging, browser and build certification |

## Backlog initialization
Reserve IDs `VV-GFX-01` through `VV-GFX-13`. **Do not assign inferred titles or completion statuses.** Import canonical descriptions from the approved graphics plan when available; until then all 13 records are `unverified` and `tentative`. Preserve any preexisting project identifiers.

## Proposed persistence
`rollout_items`: id, title, description, status, maturity, owner, blocker, acceptance_criteria, updated_at, updated_by.
`rollout_dependencies`: item_id, depends_on_id (cycle rejection).
`rollout_pr_stages`: stage, status, owner, pr_url, base_sha, head_sha, ci_result, review_result.
`rollout_assets`: id, item_id, kind, source_url, license, revision, approval_status, reviewer, evidence_url.
`rollout_benchmarks`: id, device, os, browser, gpu, viewport, scene, tier, build_sha, fps, p50_ms, p95_ms, draw_calls, triangles, memory_mb, tested_at, evidence_url, verdict.
`rollout_checks`: id, item_id, kind (deep_link/search/cta/analytics/browser/build), environment, result, expected, actual, evidence_url, tested_at.
`rollout_experiments`: id, flag, hypothesis, owner, exposure_event, rollout_pct, guardrails, rollback, status.
`rollout_evidence`: id, target_type, target_id, url, label, reviewer, recorded_at.
`rollout_audit`: actor, entity, entity_id, previous, next, timestamp.

Apply a schema migration and automated tests before any write-capable UI. Use existing API/admin authentication patterns. Never expose administrative records to public routes.

## Stage 1 acceptance checklist
- [ ] Confirm existing admin shell and API authorization in source.
- [ ] Add database migration, indexes, input validation and audit.
- [ ] Add authenticated CRUD endpoints with authorization tests.
- [ ] Add `/admin/rollout` with filters, editing, and explicit unverified/tentative badges.
- [ ] Add evidence-link validation and dependency-cycle tests.
- [ ] Confirm `npm test`, lint, build, staging browser smoke test.
- [ ] Confirm production access controls and rollback before deployment.

## Existing pilot gates (do not duplicate or change)
Per `docs/monetization/pilot.md`: 10–20 businesses across two districts for roughly four weeks. Freeze lift depends on owner retention, CTA activity, three paying businesses, two renewals/repeat campaigns and no simulated advertiser figures. The pilot dashboard's computed verdict remains authoritative.

## Open questions / blocked certification
- Canonical descriptions and acceptance criteria for VV-GFX-01–13 require confirmation.
- Seven PR stages above are a proposed implementation sequence, not existing PRs.
- Real phone and midrange laptop performance baselines are unverified until measured.
- No live search/CTA/deep-link or analytics certification is asserted by this document.
- Art-direction sign-off and pilot-block storefront-kit sign-off are not yet recorded here.
