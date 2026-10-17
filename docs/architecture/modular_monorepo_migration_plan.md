# VoxelVenture — Incremental Modular Monorepo Structure and Migration Plan

**Date:** 2026-10-16  
**Status:**

- **Phase A (documentation):** implemented.
- **Phase B (shared packages):** complete (2026-10-17), see [ADR 0001](adr/0001-shared-package-boundaries.md) and [`packages/`](../../packages/README.md).
  - Prices, plans, profile rules and the conversion funnel moved behind compatibility adapters.
  - 15 versioned contracts are tested against the live API.
  - No public API changed.
- **Phase C (application and service separation):** step 1 done on the branch `phase-c/workspaces`, not yet merged: workspaces, imports by `@voxelventure/*` name, adapters retired ([ADR 0002](adr/0002-workspaces.md)). Steps 2 to 5 (moving the app and the servers) wait for staging and Stripe certification (section 6); see "Phase C readiness" below.
- **Phase D:** a proposal.
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

*Done in Phase B (option 2, with 3):*

- the moved modules are native ESM in `packages/`;
- `scripts/lib-loader.mjs` points imports that leave `lib/` at the real files;
- the old `lib/` paths are one-line adapters, so there is one copy of each rule ([ADR 0001](adr/0001-shared-package-boundaries.md)).

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

**Implemented (2026-10-16), checked against its acceptance on 2026-10-17:**

| Acceptance | State |
| --- | --- |
| All relative links resolve | Yes: a scan of all 76 markdown files finds none broken (one false alarm, a code snippet in `voxelventure_idea_03.md`) |
| Referenced docs are discoverable | Yes: every document is in [docs/README.md](../README.md) or its topic index, including the later `external_voxel_repositories_adoption_plan.md` |
| README links work | Yes |
| Old paths | Nothing in the code, scripts, tests or docs still points at an old `docs/<name>.md` path; [documentation_path_map.md](documentation_path_map.md) maps each one |
| No runtime files change | Partly. Only comments changed in runtime files, where they named a document's old path. They shipped in the same commits as other code, not as a docs-only change |
| Docs-only CI is green | Not shown. Phase A was not a pull request of its own, so there is no docs-only run to point to. Confirm the CI on `main` (checklist below) |

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

**Implemented (first slices, 2026-10-16).** Recorded in [ADR 0001: Shared package boundaries](adr/0001-shared-package-boundaries.md).

| Item | Where |
| --- | --- |
| Three plain-ESM packages: explicit `.js` imports, no workspaces, no lockfile change | `packages/shared-types`, `packages/analytics`, `packages/business-core` |
| Ownership and allowed dependencies, declared and enforced | `"voxelventure": { "owner", "dependsOn" }` in each `package.json`; `tests/packages.test.mjs`; `CODEOWNERS` |
| Six versioned contracts and their validator | `packages/shared-types/src/contracts/`, `schema.js` |
| Shared enums: traffic sources, event kinds, outcome families, report kinds | `packages/shared-types/src/enums.js` |
| Prices, plans and entitlements moved with `git mv`; old path re-exports them | `packages/business-core/src/plans.js`, adapter `lib/business/plans.js` |
| The conversion funnel and attribution moved with `git mv`; old path re-exports them | `packages/analytics/src/conversions.js`, adapter `lib/business/conversions.js` |
| The server loads the same files as the bundler: imports that leave `lib/` are rewritten to file URLs | `scripts/lib-loader.mjs` |
| CI selector covers `packages/`: through the adapters, plus tests naming the package; `package.json` or an unused package runs everything | `scripts/select-checks.mjs`, `tests/select-checks.test.mjs` |
| Parity: the adapter and the package give identical objects, and `billing.mjs` holds no prices of its own | `tests/packages.test.mjs` |
| Contract tests against the live API: events, purchase reports, owner figures, weekly vote; the server's lists match the enums | `tests/contracts.test.mjs` |

**Not moved yet:**

| Module | Why |
| --- | --- |
| `lib/business/referral.js` | It uses `localStorage` |
| World modules | `world-core` is P2 |

**Second slices (2026-10-17):**

- **Moved:** `lib/business/profile.js`. Its districts are a static list of its own, not the generator's.
- **Added:** the pilot's criteria (`packages/analytics/src/pilot.js`), and contracts for meeting and quote requests, the pilot check-in and the pilot dashboard.
- **Stays in `lib/`:** `lib/business/referral.js`, the browser half. The shape of a referral code is in `business-core`.

**Phase B complete (2026-10-17).** Each Phase B task, and where it was done:

| Phase B task | Done |
| --- | --- |
| Introduce `shared-types`, `business-core`, `analytics` | Three plain-ESM packages with READMEs and changelogs |
| Document ownership and allowed dependencies | ADR 0001; `owner` and `dependsOn` in each `package.json`, enforced by `tests/packages.test.mjs`; `CODEOWNERS` |
| Versioned API/event contracts and shared validation schemas | 15 contracts in `packages/shared-types`: profile events, purchase reports, the pixel, owner figures, meeting and quote requests, coupon claims and redemptions, the weekly vote, the pilot check-in and dashboard. Profile validation (`cleanProfile`) is shared by the form and the server |
| Pure modules | Checked for every package file by `tests/packages.test.mjs` |
| One vertical slice at a time, with adapters | plans, then conversions, then profile (and the new pilot rules), each behind a one-line adapter at its old path |
| Identical prices and entitlements for API and web | One catalogue; the adapter and the package give the very same objects, and `billing.mjs` holds no prices (`tests/packages.test.mjs`) |
| Contract tests; lib-loader only when modules move | `tests/contracts.test.mjs` against the live API; `scripts/lib-loader.mjs` rewrites out-of-`lib/` imports |
| **Acceptance:** public APIs unchanged | No route, body or answer changed; the full suite passes |
| **Acceptance:** imports resolve on Node and Next.js | The server loads the packages through the lib-loader; `live-browser` runs a production build |
| **Acceptance:** parity and contract tests pass | `packages` and `contracts` suites |
| **Acceptance:** CI selector covers new paths | `scripts/select-checks.mjs`, `tests/select-checks.test.mjs` |

**Referral rules:** the pure part is shared: the shape of a code (`isRefCode`) and share links (`profileUrl`) are in `business-core`. Two parts stay where they are by design:

- **Signing a code** needs the server's secret and Node's `crypto`. It stays in `server/api/business.mjs`; a package would put the signing code where no secret should be.
- **Keeping a code in the browser** uses `localStorage`. It stays in `lib/business/referral.js`.

**World modules** (`world-core`) are P2 and wait for the commercial gates, like the world freeze.

New contracts are added as new shapes cross a boundary, by the ADR's recipe. That is ongoing upkeep, not an open Phase B task.

### Phase C readiness (2026-10-17)

Phase C is gated: *"Only after production/staging priorities are satisfied"* (section 6: staging deployment, Stripe test/live certification, policy review and pilot measurement first).

| Gate | State |
| --- | --- |
| Staging deployment | Not yet: the host and domain are your choice ([tasks.md](../roadmap/tasks.md) tasks 1 and 46) |
| Stripe test/live certification | Not yet: needs the Stripe account (task 46) |
| Policy review | Drafted at `/legal`; review and approval are yours (task 45) |
| Pilot measurement | The dashboard is built; the pilot has not run (task 47) |
| CI green on `main` | To confirm on GitHub (checklist below) |

Step 1 was taken early, by the owner's choice, because it moves no runtime paths. Its record is [ADR 0002](adr/0002-workspaces.md):

- **Done:** `"workspaces": ["packages/*"]` in the root `package.json`. The lockfile gains only the three links (27 lines).
- **Imports by name:** every importer uses `@voxelventure/business-core`, `@voxelventure/analytics` or `@voxelventure/shared-types`. That covers the pages, `lib/`, the server (static imports instead of `imp()`) and the tests.
- **Adapters retired:** `lib/business/{plans,profile,conversions}.js` are deleted.
- **Tests:** `tests/packages.test.mjs` checks the workspace links, that each name gives the very same objects as the files, and that no relative or old-path imports remain.
- **CI:** `scripts/select-checks.mjs` follows imports by package name.
- **To merge:** run `npm install` after pulling, so the names resolve.

What the rest of Phase C needs, once the gates allow, in its own branch and pull requests:

1. ✅ **Workspace tooling** (the branch above): npm workspaces for `packages/*`, so `@voxelventure/*` names resolve. Then the relative `../../packages/...` imports and the `lib/` adapters can go.
2. **`apps/web/`:** the Next.js app moves there with `next.config.mjs`, `jsconfig.json`, `postcss.config.mjs`, `public/` and `patches/`. `patch-package` runs from the right root.
3. **`services/api/` and `services/multiplayer/`:** the Node servers move without any rewrite. `deploy/systemd`, `deploy/Caddyfile` and the backup script take the new paths.
4. **The rest follows:** `scripts/lib-loader.mjs`, `scripts/select-checks.mjs`, `tests/`, the CI workflow and the `deploy/` runbook are updated in the same change, with a full CI and browser run.

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
- [x] Inventory current `docs/` files and cross-references ([path map and audit](documentation_path_map.md)).
- [x] Create `docs/README.md` and category indexes without moving code.
- [x] Map existing docs to target categories; preserve stable links.
- [ ] Confirm the existing CI workflow is green.
- [x] Write package-boundary ADR before extraction ([ADR 0001](adr/0001-shared-package-boundaries.md)).
- [x] Update `scripts/select-checks.mjs` before introducing executable `packages/` modules.
- [x] Phase B first slices: `shared-types` contracts, `business-core` (plans), `analytics` (conversions), with adapters, parity and contract tests.
- [x] Phase B second slices ([ADR 0001](adr/0001-shared-package-boundaries.md#the-second-slices-2026-10-17)):
  - the profile rules into `business-core`, with the adapter `lib/business/profile.js`;
  - the pilot criteria into `analytics`;
  - contracts for meeting and quote requests and for the pilot.
- [x] Phase B, the last contracts: coupon claims and redemptions, and the pixel (15 contracts in all). **Phase B is complete.**
- [x] Phase C step 1: workspaces and imports by package name, on the branch `phase-c/workspaces` (to review and merge).
- [ ] Phase C steps 2 to 5 (`apps/web/`, `services/api/`, `services/multiplayer/`), after staging and Stripe certification (see "Phase C readiness").
- [ ] Prioritize staging, Stripe and real-customer validation before app relocation.

## 10. Final recommendation

**Yes, apply the structure selectively.** Organize docs now, create shared contracts next, and move the runtime only when there is a clear maintainability or deployment payoff. This achieves cleaner ownership and easier AI-agent collaboration while preserving VoxelVenture's competitive differentiators and minimizing risk to commercial launch.

**Phases A and B are done (see their sections). Phases C and D are still proposals.**
