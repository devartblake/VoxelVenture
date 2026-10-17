# ADR 0001: Shared package boundaries (Phase B)

- **Status:** accepted, 2026-10-16. Phase B complete, 2026-10-17.
- **Context:** Phase B of the [modular monorepo migration plan](../modular_monorepo_migration_plan.md).
- **Deciders:** the repository owner (via `CODEOWNERS`).

## Context

The game, the public pages and the Node API share pure rules through `lib/`. The rules are:

- prices and plans: `lib/business/plans.js`
- the conversion funnel and attribution: `lib/business/conversions.js`
- profile validation: `lib/business/profile.js`
- many world rules

Two things make moving them hard:

1. **Different import styles.** The web app imports these modules with the bundler (no `.js` suffixes). The server loads them through `scripts/lib-loader.mjs`, which copies `lib/` into a temporary folder and adds the suffixes.
2. **Shapes exist only in code.** The shapes exchanged between the browser, the API and the messaging service (events, purchase reports, the owner's figures, the weekly vote) are only defined by the code that makes them. Nothing checks that they stay the same.

The plan asks Phase B to:

- introduce `packages/shared-types`, `packages/business-core` and `packages/analytics`;
- keep existing public APIs unchanged;
- make imports resolve in both Node and Next.js;
- add contract tests;
- cover the new paths in the CI selector, without the workspace and lockfile changes reserved for Phase C.

## Decision

### 1. Three packages, plain ES modules, no installation step

```text
packages/
  shared-types/    contracts: versioned JSON-Schema shapes and enums, and a small validator. Depends on nothing.
  analytics/       the conversion funnel, outcome families, attribution and click ids. Depends on shared-types.
  business-core/   products, prices, placements, plans and entitlements. Depends on shared-types.
```

- **Layout:** each package has a `package.json` (`"type": "module"`, `"private": true`, `exports`), a `README.md` and `src/`.
- **Imports:** source files use explicit `.js` relative imports, so Node can import them directly as they are. The bundler takes them unchanged.
- **No npm workspaces:** they are not used yet. Nothing is installed or linked, and `package-lock.json` does not change; that is Phase C.

### 2. Allowed dependencies

| Package | May import | Must not import |
| --- | --- | --- |
| `shared-types` | nothing | anything |
| `analytics` | `shared-types` | `business-core`, `lib/`, `apps/web/app/`, `apps/web/components/`, `server/`, npm packages, Node or browser APIs |
| `business-core` | `shared-types` | `analytics`, `lib/`, `apps/web/app/`, `apps/web/components/`, `server/`, npm packages, Node or browser APIs |

- **Pure modules:** packages contain only pure modules: no database, no `window`, `document` or `localStorage`, no `process`, no file system, no renderer. Globals that are standard in both environments, such as `globalThis.crypto.getRandomValues` and `URL`, are allowed.
- **Who may import packages:** `lib/`, `apps/web/app/`, `apps/web/components/`, `server/` and `tests/`.
- **Enforcement:** each package declares its allowed dependencies in its `package.json` (`"voxelventure": { "dependsOn": [...] }`). `tests/packages.test.mjs` checks every import against that list.

### 3. Compatibility adapters keep every existing import working

- When a module moves, its old path in `lib/` becomes a one-line adapter: `export * from '../../packages/<pkg>/src/<module>.js'`.
- Everything that imports the old path keeps working without a change: `@/lib/business/plans`, `imp('business/plans.js')` on the server, and the tests.
- There is exactly one copy of each rule. The test checks that the adapter and the package export the **same objects**, by identity, so the API and the web app cannot disagree on a price.
- `scripts/lib-loader.mjs` now points any `lib/` import that leaves `lib/` at the real file, by file URL. Packages are already native ES modules, so the server loads the same file the bundler does.
- New code may import a package directly (`../../packages/business-core/src/index.js` from `server/`). There is no `@voxelventure/*` alias until Phase C adds workspaces.

### 4. Versioned contracts

- **Where:** `shared-types` holds each cross-boundary shape as `{ id, version, schema }`. The schema is a JSON-Schema subset (`type`, `required`, `properties`, `items`, `enum`, `pattern`, `minimum`, `maximum`, `additionalProperties`), so the Python messaging service can use the same files later.
- **Changing a contract:**
  - adding an optional field keeps the version;
  - removing, renaming or narrowing a field is a new version, and the old one is kept until no client sends it;
  - every version change is noted in the package's `CHANGELOG.md`.
- **Testing:** `tests/contracts.test.mjs` starts the API and checks its real responses against the contracts. A change in the API that breaks a contract fails CI.

### 5. CI

- **Selector:** `scripts/select-checks.mjs` treats `packages/<name>/src/**` like the `lib/` modules that re-export it. It runs:
  - their dependent tests;
  - the server's tests if the server loads them;
  - the browser build test;
  - every test that names the package.
- **Unknown changes:** a package nobody imports yet, or a change to a package's `package.json`, runs everything.
- **Docs:** documentation under `packages/` (`README.md`, `CHANGELOG.md`) runs nothing, like other docs.

## The first slices (this change)

| Moved | From | To | Adapter |
| --- | --- | --- | --- |
| Conversion funnel, outcome families, costs, return on spend, click ids, coupon tickets | `lib/business/conversions.js` | `packages/analytics/src/conversions.js` | `lib/business/conversions.js` |
| Products, prices, placements, plans, entitlements, Pro fields | `lib/business/plans.js` | `packages/business-core/src/plans.js` | `lib/business/plans.js` |
| Event kinds, traffic sources, outcome family ids; contracts for business events, purchase reports, the owner's figures and the weekly vote | (new) | `packages/shared-types/src/` | none |

## The second slices (2026-10-17)

| Moved | From | To | Adapter |
| --- | --- | --- | --- |
| Profile rules: categories, districts, calls to action, slugs, validation (`cleanProfile`), onboarding steps, upgrade prompts, referral-code shape, structured data, the demo profiles, traffic sources | `lib/business/profile.js` | `packages/business-core/src/profile.js` | `lib/business/profile.js` |
| The pilot's criteria and how each business counts | (new) | `packages/analytics/src/pilot.js` | none: `services/api/pilot.mjs` imports the package directly |
| Contracts for meeting and quote requests, the pilot check-in and the pilot dashboard | (new) | `packages/shared-types/src/contracts/` | none |

- **Why all of `profile.js` moved:** its district list is a static list in the file itself, not the city generator's.
- **One validation:** the web form (`apps/web/components/business/ProfileForm.jsx`) and the server now check a profile with the very same `cleanProfile`.

## The last contracts (2026-10-17)

- `business.coupon-claim`, `business.coupon-redeem` and their results: a visitor's claim in a 3D storefront, and the owner's redemption at the till.
- `business.purchase-pixel`: the pixel's query. A key in it is outside the contract.

That makes 15 contracts, every shape that crosses a boundary today. A new one is added the same way when a new shape appears.

## Decision: what stays out of the packages

- **Signing referral codes** needs the server's secret and Node's `crypto`, so it stays in `services/api/business.mjs`. A package is code the browser may load, and the secret's code does not belong there.
- **Keeping a referral code in the browser** (`localStorage`) stays in `lib/business/referral.js`.
- **The world** (`lib/city`, `lib/game`, `lib/sim`) waits for the P2 `world-core` package, after the commercial gates.

Not moved yet:

- `lib/business/referral.js`: the browser half of referrals.
  - It keeps the code in `localStorage`, so it stays in `lib/`.
  - Its pure part, the shape of a code (`isRefCode`), is in `business-core`.
  - Signing a code is server-only (`services/api/business.mjs`, with Node's `crypto`).
- Everything in `lib/city`, `lib/game` and `lib/sim`: the world-core package is P2.

## Consequences

- **Gained:** one definition for prices and attribution rules, enforced by identity tests; contracts the API is tested against; a selector that knows the new paths; no change to the lockfile, install, the build or any public API.
- **Cost:** two places to look until the adapters are removed. A short relative path (`../../packages/...`) is used instead of a package name until Phase C.
- **Removing an adapter:** once nothing imports the old path, it can be deleted. The selector and `tests/packages.test.mjs` report who still uses it.
