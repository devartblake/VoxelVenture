# Shared packages

Pure modules shared by the web app (`apps/web/app/`, `apps/web/components/`), the game (`lib/`) and the Node API (`server/`). They are npm workspaces of the root `package.json`, so each is imported by its name, `@voxelventure/<package>`.

- **Phase B** of the [modular monorepo migration plan](../docs/architecture/modular_monorepo_migration_plan.md) introduced them.
- **Phase C, step 1** made them workspaces.
- **The rules** are in [ADR 0001: Shared package boundaries](../docs/architecture/adr/0001-shared-package-boundaries.md) and [ADR 0002: Workspaces](../docs/architecture/adr/0002-workspaces.md).

| Package | Import as | What it holds | May import |
| --- | --- | --- | --- |
| [`shared-types`](shared-types/README.md) | `@voxelventure/shared-types` | Versioned contracts (JSON-Schema shapes) and shared enums for what crosses a boundary, and a small validator | nothing |
| [`analytics`](analytics/README.md) | `@voxelventure/analytics` | The conversion funnel, outcome families, cost per outcome, return on spend, click ids, coupon tickets; the pilot's criteria | `shared-types` |
| [`business-core`](business-core/README.md) | `@voxelventure/business-core` | Products, prices, sponsored placements, plans, entitlements, the Pro fields; profile rules (categories, districts, calls to action, slugs, validation, onboarding, upgrade prompts, referral-code shape) | `shared-types` |

```js
import { PRODUCTS, cleanProfile } from '@voxelventure/business-core'; // the pages, lib/, the server and the tests alike
```

## Rules in short

- **Plain ES modules.** Every relative import inside a package ends in `.js`, so Node loads the files as they are and the bundler takes them unchanged. There is no build step.
- **Pure.** Nothing here touches:
  - the database, the file system or `process`;
  - `window`, `document` or `localStorage`;
  - npm packages, or `lib/`, `apps/web/app/`, `apps/web/components/` and `server/`.

  Standard globals such as `URL` and `globalThis.crypto.getRandomValues` are fine.
- **Declared dependencies.** Each `package.json` lists what the package may import in `"voxelventure": { "dependsOn": [...] }`. [`tests/packages.test.mjs`](../tests/packages.test.mjs) enforces it.
- **By name only.** Outside `packages/`, a package is imported by its name, never by a relative path into `packages/`. The old `lib/business/{plans,profile,conversions}.js` adapters are gone. The test checks that nothing imports them, and that the name gives the very same objects as the package's own file, so there is one copy of each rule.
- **Installing:** `npm install` (or `npm ci`) links the packages into `node_modules/@voxelventure/`. The lockfile records them as links.

## Working on a package

| Task | Command or file |
| --- | --- |
| Run its tests | `node tests/run.mjs packages contracts` |
| Plus the suites that use it | `node tests/run.mjs conversions billing legal business pilot` |
| Change a contract | Bump its `version` when a field is removed, renamed or narrowed. Note the change in [`shared-types/CHANGELOG.md`](shared-types/CHANGELOG.md). |
| Move another module here | `git mv` it into the package's `src/` and export it from `index.js`. Then point its importers at the package name, add a `CODEOWNERS` line, and note it in the package's `CHANGELOG.md`. |
| Add a package | `packages/<name>/` with `package.json` (`"name": "@voxelventure/<name>"`, `"type": "module"`, `exports`, `voxelventure.dependsOn`), `README.md`, `CHANGELOG.md` and `src/index.js`, then `npm install` to link it |

## CI

`scripts/select-checks.mjs` follows the imports of `@voxelventure/<name>` backwards. A change under `packages/<name>/src/` runs:

- every test that imports the package (or a package built on it) by name;
- the tests of the `lib/` modules built on it;
- the server's tests, when the server imports it;
- the browser build test, when the pages use it.

A change to a package's `package.json`, or to a package that nothing uses yet, runs everything. Documentation here runs nothing.
