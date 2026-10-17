# ADR 0002: Workspaces for the shared packages (Phase C, step 1)

- **Status:** accepted, 2026-10-17. On the branch `phase-c/workspaces`.
- **Context:** Phase C of the [modular monorepo migration plan](../modular_monorepo_migration_plan.md), after [ADR 0001](0001-shared-package-boundaries.md).
- **Deciders:** the repository owner, who chose this step only. The rest of Phase C waits for staging and Stripe certification.

## Context

Phase B left three things that only workspaces can fix:

- **Relative paths.** The packages were imported by relative paths (`../../packages/analytics/src/pilot.js`).
- **Adapters.** Most code still went through one-line adapters at the old `lib/business/` paths.
- **The loader.** The server reached the moved modules through `scripts/lib-loader.mjs` (`imp('business/plans.js')`).

ADR 0001 kept the `@voxelventure/*` names for "when Phase C adds npm workspaces".

The plan's Phase C is gated on staging and Stripe certification. Its first step ("prepare workspace tooling, lockfile, module resolution") changes no runtime paths, so it is taken alone. Moving the app and the servers is not part of it.

## Decision

1. **Workspaces:** the root `package.json` declares `"workspaces": ["packages/*"]`. `npm install` links each package into `node_modules/@voxelventure/<name>`. The lockfile gains only those links (27 lines); no dependency changes.
2. **By name everywhere:**
   - The pages, `lib/`, the server and the tests import `@voxelventure/business-core`, `@voxelventure/analytics` and `@voxelventure/shared-types`.
   - The server's `const { … } = await imp('business/….js')` became static `import { … } from '@voxelventure/…'`. The lib-loader is still used for the world and game modules in `lib/`.
3. **The adapters are gone:** `lib/business/plans.js`, `lib/business/profile.js` and `lib/business/conversions.js` were deleted. `lib/business/referral.js` (the browser half of referrals) and `lib/business/source.js` stay, and import the package by name.
4. **One copy of each rule:** Node follows the workspace links to the real files, so the name and the file are the same module. `tests/packages.test.mjs` checks:
   - each name resolves, to the very same objects as the package's own file;
   - a `lib/` module loaded through the lib-loader reads the same catalogue;
   - the lockfile links the packages;
   - no import reaches into `packages/` by a relative path;
   - nothing imports the old paths.
5. **CI:** `scripts/select-checks.mjs` follows `@voxelventure/*` imports in its dependency graph. A package file depends on its package's name, and every module that imports the name depends on it. A package change therefore runs:
   - the tests that import it;
   - the `lib/` modules built on it, and their tests;
   - the server's tests when the server imports it;
   - the browser build when the pages use it.

   `package.json` and the lockfile still run everything.
6. **Next.js:** the packages are plain ES modules, so they need no `transpilePackages` entry. The production build (`live-browser`) resolves them through `node_modules`.

## Consequences

- **Gained:** one way to import a rule, with no adapters and no relative paths into `packages/`. The server no longer needs the lib-loader for business rules.
- **Cost:** `npm install` must run after pulling this branch, or the names do not resolve. The deployment's `npm ci` already does this.
- **Next steps of Phase C**, still gated: `apps/web/`, `services/api/`, `services/multiplayer/`. The plan's "Phase C readiness" lists what each needs.
