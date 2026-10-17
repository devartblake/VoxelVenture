# Shared packages

Pure modules shared by the web app (`app/`, `components/`), the game (`lib/`) and the Node API (`server/`).

They were introduced in Phase B of the [modular monorepo migration plan](../docs/architecture/modular_monorepo_migration_plan.md). The rules are in [ADR 0001: Shared package boundaries](../docs/architecture/adr/0001-shared-package-boundaries.md).

| Package | What it holds | May import | Old path (adapter) |
| --- | --- | --- | --- |
| [`shared-types`](shared-types/README.md) | Versioned contracts (JSON-Schema shapes) and shared enums for what crosses a boundary, and a small validator | nothing | none (new) |
| [`analytics`](analytics/README.md) | The conversion funnel, outcome families, cost per outcome, return on spend, click ids, coupon tickets; the pilot's criteria | `shared-types` | `lib/business/conversions.js` |
| [`business-core`](business-core/README.md) | Products, prices, sponsored placements, plans, entitlements, the Pro fields; profile rules (categories, districts, calls to action, slugs, validation, onboarding, upgrade prompts) | `shared-types` | `lib/business/plans.js`, `lib/business/profile.js` |

## Rules in short

- **Plain ES modules.** Every relative import ends in `.js`, so Node loads these files as they are and the bundler takes them unchanged. There is no build step and no install.
- **Pure.** Nothing here touches:
  - the database, the file system or `process`;
  - `window`, `document` or `localStorage`;
  - npm packages, or `lib/`, `app/`, `components/` and `server/`.

  Standard globals such as `URL` and `globalThis.crypto.getRandomValues` are fine.
- **Declared dependencies.** Each `package.json` lists what the package may import in `"voxelventure": { "dependsOn": [...] }`. [`tests/packages.test.mjs`](../tests/packages.test.mjs) enforces it.
- **One copy of every rule.** A module that moved here leaves a one-line adapter at its old `lib/` path (`export * from '../../packages/...'`). Existing imports keep working, and the test checks that both paths give the very same objects.
- **No workspaces yet.** Import a package by relative path (`../../packages/business-core/src/index.js`). The `@voxelventure/*` names in the `package.json` files only start resolving when Phase C adds npm workspaces.

## Working on a package

| Task | Command or file |
| --- | --- |
| Run its tests | `node tests/run.mjs packages contracts` |
| Plus the older suites that load it through an adapter | `node tests/run.mjs conversions billing legal` |
| Change a contract | Bump its `version` when a field is removed, renamed or narrowed. Note the change in [`shared-types/CHANGELOG.md`](shared-types/CHANGELOG.md). |
| Move another module here | `git mv` it, leave an adapter at the old path, add both to `ADAPTERS` in `tests/packages.test.mjs`, add a `CODEOWNERS` line, and note it in the package's `CHANGELOG.md`. |

## CI

`scripts/select-checks.mjs` treats a change under `packages/<name>/src/` like a change to the `lib/` adapters that re-export it. It runs:

- the tests of the `lib/` modules built on those adapters;
- the server's tests, when the server loads them;
- the browser build test;
- every test that names the package.

A change to a package's `package.json`, or to a package that nothing uses yet, runs everything. Documentation here runs nothing.
