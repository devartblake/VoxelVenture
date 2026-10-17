# VoxelVenture — Incremental Modular Monorepo Structure and Migration Plan

**Date:** 2026-10-16  
**Status:** Proposal for architectural review; no runtime paths or imports changed  
**Repository:** `devartblake/VoxelVenture`  
**Related work:** Competitive strategy and implementation audit, PR #22.

## Executive recommendation

**Adopt the directory organization incrementally, not as a big-bang rewrite.** VoxelVenture already has a functioning Next.js/React Three Fiber web application, a Node.js API, multiplayer services, a Python messaging service, shared `lib/` modules, root-level tests, and GitHub Actions. Preserve that architecture and current behavior.

The lowest-risk, highest-value first step is to organize **documentation**. Follow with shared-package boundaries, and relocate runtime applications only after commercial staging and Stripe certification have priority.

The target layout is a **modular monorepo**, not a requirement to split the application into independent microservices or migrate the backend to FastAPI/PostgreSQL.

## 1. Proposed target directory tree

```text
VoxelVenture/
├── apps/
│   └── web/                     # Next.js, public business pages, UI and 3D world
├── services/
│   ├── api/                     # Existing Node.js API (future relocation)
│   ├── messaging/               # Existing Python messaging service (retain)
│   └── multiplayer/             # Existing realtime/presence server (future relocation)
├── packages/
│   ├── world-core/              # World generation, simulation and rules
│   ├── business-core/           # Business profiles, pricing and referral rules
│   ├── shared-types/            # Cross-boundary contracts, schemas and types
│   └── analytics/               # Attribution and verified event contracts
├── docs/
│   ├── product/                 # Vision, audiences, requirements, journeys
│   ├── architecture/            # Systems, APIs, data model and decisions
│   ├── monetization/            # Billing, leases, sponsorships, terms
│   ├── competitive-research/    # Claim Avenue, positioning and audits
│   ├── roadmap/                 # Phases, status, backlog, milestones
│   └── operations/              # Deploy, rollback, security, runbooks
├── tests/                       # Existing tests retained until coordinated move
├── scripts/                     # Existing tooling retained
├── deploy/                      # Optional deployment configuration
├── .github/workflows/           # Existing CI retained
├── package.json                 # Workspace root only after package migration
└── README.md
```

**Important:** This is a *target* tree, not a claim that these paths currently exist. In particular, `services/messaging/` already exists and should remain stable; `services/api/`, `services/multiplayer/`, and `apps/web/` are prospective moves.

## 2. Recommended migration priorities

| Area | Priority | Recommendation | Why |
|---|---|---|---|
| `docs/` | **P0** | Introduce topic folders, index and repaired links | Minimal runtime risk; immediate agent navigation benefit |
| `packages/shared-types/` | **P1** | Add contracts/schemas with clear ownership | Reduce frontend/backend drift |
| `packages/business-core/` | **P1** | Extract stable pure rules gradually | Reuse pricing, profile validation and referral rules |
| `packages/analytics/` | **P1** | Define canonical event and attribution contracts | Strengthen commercial measurement |
| `apps/web/` | **P2** | Relocate Next.js only with coordinated tooling update | Higher risk to bundling and deployment |
| `services/api/` | **P2** | Move Node API, **do not rewrite** | Preserve proven payments and authority |
| `packages/world-core/` | **P2** | Extract when commercial gates pass | Avoid derailing world-expansion freeze |
| `tests/` and CI | **Continuous** | Keep tests and coverage detection correct | Prevent silent regressions |

## 3. Current implementation constraints confirmed from source

### 3.1 Root-level Next.js application

`package.json` currently uses root-relative scripts including `next dev`, `next build`, `next start`, `node server/api/server.mjs`, `node server/multiplayer.mjs`, `node tests/run.mjs`, and `node scripts/dev-all.mjs`. It also runs `patch-package` on postinstall.

Moving the web application into `apps/web/` affects package installation, lockfile ownership, asset paths, Next.js configuration, patch handling, test execution, scripts, and deployment working directories. Do not move it without a reproducible build and migration plan.

### 3.2 Shared `lib/` loader

`scripts/lib-loader.mjs` reads the root `lib/` tree, copies JavaScript into a temporary ESM directory, rewrites relative imports with `.js` suffixes, and links root `node_modules`. Server code uses `imp('business/plans.js')` and related calls.

Moving business/world rules into `packages/` **will break that loader unless updated**. Options:

1. **Preferred interim:** leave implementation under `lib/` and introduce contracts/documentation at package boundaries.
2. Later: package the shared modules as native ESM with explicit imports and test the Node/Next.js consumers.
3. Avoid duplicate copies of business rules: use one canonical source for prices, entitlements and validation.

### 3.3 Change-aware CI

`scripts/select-checks.mjs` explicitly analyzes `lib/`, `server/`, `tests/`, configuration and known source paths. The GitHub workflow uses this selector to decide which checks run. A new `packages/` path must be included in dependency discovery and impact selection **before** production code is moved there.

For migration PRs, **force full lint/build/tests/browser checks** instead of trusting existing selective CI. Verify that unknown new paths cannot silently skip checks.

### 3.4 Next.js aliases and dependencies

`jsconfig.json` maps `@/*` to the repository root. `next.config.mjs` contains `transpilePackages`, remote image settings and Turbopack aliases referencing root `node_modules`. A workspace move needs corresponding aliases, module resolution, asset and bundler changes.

### 3.5 Existing Python messaging service

`services/messaging/` is already implemented. Do not create a second messaging service or confuse it with the Node.js API. Preserve its contract and current deployment/rollback posture.

## 4. Four implementation phases

### Phase A — Documentation structure (P0)

**Scope:** `docs/` only. Create category directories, an `docs/README.md` navigation index, and a mapping from old locations to new locations.

**Proposed categories:**
- `product/`: product vision, user journeys, requirements.
- `architecture/`: backend, messaging, city systems, ADRs.
- `monetization/`: billing, leases, sponsored placements, refunds.
- `competitive-research/`: Claim Avenue research and differentiation strategy.
- `roadmap/`: task lists, alignment status, phases, estimates.
- `operations/`: deployment, environments, monitoring, recovery.

**Safety:** Start by indexing documents **without moving files**. Relocate in small groups after scanning relative links, references in scripts/tests and CI checks. Keep redirect stubs if paths are used externally. Preserve historical review snapshots and identify current source-of-truth status docs.

**Acceptance:** All relative links resolve, referenced docs are discoverable, README links work, no runtime files change, and docs-only CI is green.

**Estimate:** 1–2 working days.

### Phase B — Shared package foundations (P1)

Introduce `packages/shared-types/`, `packages/business-core/`, and `packages/analytics/` incrementally.

- Document package ownership and allowed dependencies.
- Define explicit, versioned API/event contracts and shared validation schemas.
- Prefer pure modules without database, browser or renderer dependencies.
- Extract one small vertical slice at a time; keep a compatibility adapter if needed.
- Ensure the API and web use identical price and entitlement definitions.
- Add contract tests and update `scripts/lib-loader.mjs` only when actual modules move.

**Acceptance:** Existing public APIs unchanged; imports resolve on Node and Next.js; parity/contract tests pass; CI selector covers new paths.

**Estimate:** 2–4 working days.

### Phase C — Application and service separation (P2)

Only after production/staging priorities are satisfied:

1. Prepare workspace tooling, lockfile, module resolution and deployment paths.
2. Move the Next.js app into `apps/web/` with an unchanged product experience.
3. Move Node API into `services/api/` without rewriting endpoints or storage.
4. Relocate multiplayer server if it reduces coupling; keep messaging service intact.
5. Update scripts, `next.config.mjs`, `jsconfig.json`, environment handling, assets, tests and deployment.

**Acceptance:** Development, production build, API startup, multiplayer connection, checkout webhooks, shared package imports and deployment all work unchanged.

**Estimate:** 4–8 working days, subject to integration complexity.

### Phase D — Integration certification

Run the **full** test suite and real-browser suite, not only change-selected tests. Validate:

- Node API auth, permissions, claims/leases and data migration.
- Stripe test-mode checkout, signed webhooks, idempotency, refunds, renewals and reconciliation.
- Business profiles, referral attribution, analytics and CTA events.
- WebGL and non-WebGL paths, mobile layout, accessibility and performance.
- Multiplayer presence and Python messaging contracts.
- CI, staging smoke tests, secrets, backup/restore and rollback.

**Acceptance:** All required checks green and a documented deployment/rollback rehearsal.

## 5. Suggested PR sequence

| PR | Change | Risk | Gate |
|---|---|---|---|
| 1 | Documentation index and folders | Low | Links and docs validation |
| 2 | Shared contract/package scaffolding | Low–medium | Contract tests and full CI |
| 3 | Extract business/analytics rules | Medium | Price/referral parity and API tests |
| 4 | Move web app | High | Full build, browser, mobile and deployment |
| 5 | Move Node API/multiplayer if justified | High | End-to-end API, realtime and billing certification |
| 6 | Full integration/operations evidence | Medium | Staging and rollback sign-off |

**Keep structural work separate from PR #22**, which documents competitive strategy and feature alignment. Avoid merging runtime moves into a commercial release-certification PR.

## 6. Decision gates and sequencing

**Now:** documentation index and path audit.  
**Next commercial priority:** staging deployment, Stripe test/live certification, policy review and pilot measurement.  
**Afterward:** shared contracts and measured modularization.  
**Last:** runtime relocation and optional world-core extraction.

Do not initiate the more disruptive application move while checkout, deployment or customer-validation work is unstable.

## 7. Engineering estimates

| Scope | Estimate |
|---|---:|
| Documentation restructuring | 1–2 working days |
| Shared package foundations | 2–4 working days |
| App/service relocation and integration | 4–8 working days |
| **Indicative subtotal** | **7–14 working days** |

The subtotal assumes an experienced developer, existing tests and manageable conflicts; it excludes production account setup, legal review, external provider delays and customer-pilot duration. Phase D validation may overlap earlier phases but can extend the calendar.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Broken imports or alias resolution | Move one bounded module at a time; run build and import tests |
| CI skips migrated paths | Update selector and require full CI during migration |
| Broken documentation links | Link scan, index and redirect stubs |
| Duplicated business rules | Single source of truth for price/entitlement rules |
| Next.js workspace or patch failures | Pin toolchain, validate lockfile and `patch-package` |
| Production regression | Staging deployment, smoke tests and rollback |
| Scope creep | Preserve world-expansion freeze and commercial launch priorities |
| Misidentified architecture | Keep Node API and Python messaging distinct |

## 9. Immediate actionable checklist

- [ ] Review and approve target directory responsibilities.
- [ ] Inventory current `docs/` files and cross-references.
- [ ] Create `docs/README.md` and category indexes without moving code.
- [ ] Map existing docs to target categories; preserve stable links.
- [ ] Confirm the existing CI workflow is green.
- [ ] Write package-boundary ADR before extraction.
- [ ] Update `scripts/select-checks.mjs` before introducing executable `packages/` modules.
- [ ] Prioritize staging, Stripe and real-customer validation before app relocation.

## 10. Final recommendation

**Yes, apply the structure selectively.** Organize docs now, create shared contracts next, and move the runtime only when there is a clear maintainability or deployment payoff. This achieves cleaner ownership and easier AI-agent collaboration while preserving VoxelVenture's competitive differentiators and minimizing risk to commercial launch.

**This document is a proposal, not evidence that migration has been executed.**
