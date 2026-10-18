# ADR 0003: The web app in apps/web, the Node servers in services/ (Phase C, steps 2 to 5)

- **Status:** accepted and merged, 2026-10-17. Production (voxelventure.app) has run this layout since that day, and staging since 2026-10-17 ([deploy/STAGING.md](../../../deploy/STAGING.md)).
- **Context:** Phase C of the [modular monorepo migration plan](../modular_monorepo_migration_plan.md), after [ADR 0002](0002-workspaces.md) (workspaces).

## Context

Phase C moves the runtime into the target layout of the plan's section 1 without rewriting it. The plan gates these moves on staging and Stripe certification. The owner chose to have them done and tested now on a branch, and to merge after the staging deploy has been rehearsed.

## Decision

### The layout

```text
apps/web/              the Next.js app: app/, components/, public/, next.config.mjs, jsconfig.json, postcss.config.mjs
services/api/          the Node API (was server/api/): every module unchanged, its data in services/api/data/
services/multiplayer/  the presence server (was server/multiplayer.mjs, now server.mjs) and its README; its error log in services/multiplayer/logs/
services/messaging/    the Python messaging service (unchanged)
lib/                   shared by the app, the servers and the tests (unchanged, at the root)
packages/              the workspace packages (unchanged)
styles/                shared CSS (unchanged; apps/web/app/globals.css imports it as ../../../styles/elevation.css, as the file always said)
```

### How it works

- **One root `package.json`:** it keeps every dependency, the one lockfile, `patch-package` and `node_modules`.
  - `apps/web` is a folder, not a workspace package. Its dependencies are the root's, so moving it changed no dependency and no lockfile entry.
  - The npm scripts point Next at it: `next dev apps/web`, `next build apps/web`, `next start apps/web`. The API runs as `node services/api/server.mjs`, the presence server as `node services/multiplayer/server.mjs`.
- **Next.js:**
  - `apps/web/next.config.mjs` sets `turbopack.root` and `outputFileTracingRoot` to the repository root, so the app can import `lib/` and the packages from above its own folder (`node_modules/next/dist/docs`, Turbopack "Root directory").
  - The aliases that keep one copy of React and three.js point at `../../node_modules`.
  - `apps/web/jsconfig.json` maps `@/lib/*` to `../../lib/*` and `@/*` to the app's own folder, so every `@/lib/…` and `@/components/…` import stays as it was.
  - The build goes to `apps/web/.next/`.
- **The servers:**
  - `services/api` is at the same depth as `server/api` was, so its relative imports (`../../scripts/lib-loader.mjs`) are unchanged.
  - The API's database and mail folder now default to `services/api/data/` (`API_DB` and `MAIL_DIR` still override them).
  - The presence server imports the API's text check as `../api/textcheck.mjs`, so there is still one copy.
- **Tests, scripts and CI:** every path follows the move:
  - the tests start the servers from `services/`, read the app under `apps/web/`, and build and start Next with `apps/web`;
  - `scripts/select-checks.mjs` knows the new folders (`apps/web/app|components`, `apps/web/public`, `services/api|multiplayer`, the app's config files);
  - the world freeze watches `apps/web/components/city/` and `apps/web/public/models/`;
  - `CODEOWNERS` names the new paths.
- **Deployment:**
  - The systemd units start `services/api/server.mjs`, `services/multiplayer/server.mjs` and `next start apps/web`.
  - Their writable paths are `services/api/data`, `services/multiplayer/logs` and `apps/web/.next/cache`. `setup.sh` makes those folders, and `backup.sh`, the settings templates and the runbook use the new database path.
- **The Python service:** its parity test runs `services/api/textcheck.mjs`.

## Consequences

- **Gained:** the repository looks like the plan's target. Each deployable has its own folder, the shared code sits at the root, and no runtime code was rewritten.
- **Cost, on a machine that already ran the old layout:** the database and logs stay in the old folders.
  - Move `server/data/voxelventure.db` (and `outbox/`) to `services/api/data/`, or set `API_DB`.
  - Move `server/logs/` to `services/multiplayer/logs/`, if you want the old error log.
  - On a server, stop the services before moving the folders.
- **Verified since (2026-10-17 and 18):** the new layout is deployed on a real server.
  - Production runs it, and `verify:live` passes all 17 checks.
  - Staging runs it with a release-and-switch layout.
  - A rollback took 2.2 s, and a production backup restored.
  - The four business journeys pass against staging.

  Two server-only problems turned up there and are fixed:
  - sudo-rs ignores `sudo -E`, so the build lost `web.env` (`deploy/build-web.sh` now builds it);
  - Windows checkouts sent CRLF scripts (`deploy/push.ps1` and `.gitattributes` force LF).
- **Generated file:** `next dev` writes its agent notes (`AGENTS.md`) beside the app it serves, so it may create `apps/web/AGENTS.md`. The root `AGENTS.md` stays.
