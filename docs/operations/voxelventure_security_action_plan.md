# VoxelVenture Security Action Plan

**Date:** 2026-11-13
**Basis:** `voxelventure_security_hardening.md` (written from the public site only) checked against this repo.
**Stack:** Next.js (`apps/web`, React Three Fiber) + Node `http` API (`services/api`, SQLite via `node:sqlite`) + `ws` presence server (`services/multiplayer`), behind Caddy on a Linode. Props bucket on Linode Object Storage. Stripe for payments.

> Items marked **[agent-reported]** have file:line evidence from a code audit but were not re-read. **[unverified]** items need a check before work starts.

## What is already good

The economy core is stronger than the guide assumed. These need no work beyond tests.

- Plot claim and takeover run in `BEGIN IMMEDIATE` transactions with a conditional `UPDATE ... WHERE owner_name IS NULL` (`core.mjs:260-309`, `db.mjs:130-151`). Gold debits happen in one transaction with a ledger row (`engage.mjs:130-143`).
- Owner/IDOR checks exist on every mutation reviewed (`core.mjs:328,362`, `interiors.mjs:31`, `engage.mjs:80,137,201`, `business.mjs:105,151`).
- Listing links: `https?` allowlist (`profile.js:103`, `core.mjs:238`), `rel="noopener nofollow ugc"`, React escaping, and a safe JSON-LD encoder.
- Listings require an account and are capped at 5 per account.
- Production refuses to start with `API_ORIGIN='*'`; CSRF is checked via content-type and Origin.
- Presence server caps payload at 16 KB, 1500 clients, 20 per IP, and clamps NaN/Infinity.
- Asset admission exists (magic bytes, size and triangle budgets, glTF external URI rejection) in CI.

Note: the "Gold" the guide mentions is the Credits wallet. Real money goes through Stripe orders.

## Gaps and tasks

### Phase 1 (P0): headers and tokens (about 1 week)

| ID | Gap | Task | Acceptance |
|---|---|---|---|
| V1 | **No security headers at all.** `deploy/Caddyfile` has no `header` block. `next.config.mjs` has no `headers()`. `Caddyfile.staging` was not checked. | Add HSTS (1y, `includeSubDomains`), `nosniff`, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy in Caddy. Add `frame-ancestors 'none'` via CSP. | `curl -I` shows all headers on prod and staging. A header test in CI. |
| V2 | **CSP, and the guide's CSP will break Next.js.** The guide's `script-src 'self'` has no nonce, but Next.js injects inline bootstrap scripts. | Build the CSP around Next's nonce support (middleware-generated nonce) or hashes. Keep `'wasm-unsafe-eval'` and `blob:` in `worker-src`, `img-src` and `connect-src` for Draco/KTX2/GLTF loaders. Ship `Content-Security-Policy-Report-Only` first with a `report-to` collector, then enforce. | Zero violations on a full session: walk, claim a plot, open a listing, wardrobe, checkout. |
| V3 | **Player token in `localStorage`** (`lib/data/api.js:5-20,41`). With no CSP, any XSS steals accounts. Only the admin session uses an HttpOnly cookie (`admin.mjs:153-154`). | Move the player session to an `HttpOnly; Secure; SameSite=Lax` cookie, mirroring the admin pattern. The existing CSRF check (content-type and Origin) already helps. Needs a check of whether the API and web share a site **[unverified]**. | No token in `localStorage`. Login, reload and logout all work. |

### Phase 2 (P0/P1): abuse controls (about 1 week)

| ID | Gap | Task | Acceptance |
|---|---|---|---|
| V4 | **No bot challenge and no per-IP cap on signup and free listing.** Only the global 240/min limiter applies (`server.mjs:132-138`). | Add Turnstile (or equivalent) to signup and `createProfile`. Add a per-IP daily cap on profile creation and signup. | A script creating 20 accounts from one IP is stopped. |
| V5 | Presence has one flat limit: 60 msg/s per client (`multiplayer/server.mjs:87,482-485`). No emote limit, no per-type bucket. | Per-type token buckets: position 20-30/s, emote 2/s, chat stays at 1/s. | A flood of emotes is dropped without affecting movement. |
| V6 | No world-bounds or speed checks (`server.mjs:528-530`). `state` is sanitized but not contract-validated. | Validate position against the world bounds and cap speed per tick. Validate `state` with the same contract style as `hello` (`PRESENCE_CLIENT`). | A teleport to an out-of-bounds coordinate is rejected or clamped, and logged. |
| V7 | Presence HTTP handler sends `Access-Control-Allow-Origin: *` (`server.mjs:349`). Which routes it covers is **[unverified]**. | List the routes. Restrict ACAO to the allowed origin on anything non-public. | No sensitive route returns `*`. |

### Phase 3 (P2): hardening and tests

| ID | Gap | Task |
|---|---|---|
| V8 | No client `Idempotency-Key` on claim and fund endpoints. Risk is low because the DB is atomic. | Add it to `claimPlot`, takeover and `fundQuest`: store the key with the result and replay it. Do this after V1-V4. |
| V9 | Gold amounts are floored, not rejected (`engage.mjs:131-132`). | Reject non-integers and non-numbers with `400`. |
| V10 | City Market Cap is computed in the browser (`views.jsx:84`). `/world/stats` (`server.mjs:825`) may already compute it **[unverified]**. | Confirm, then read the figure from the server. Display only, so low risk. |
| V11 | HTML is not stripped on ingest (`core.mjs:40` only removes control characters). Output is safe today. | Add stripping on ingest as defence in depth. Do not rely on it. |
| V12 | Asset admission runs on committed repo files only. No runtime upload endpoint was found. | Keep the CI check. Document that any future user upload must add the guide's controls first: server-side magic bytes, caps, a cookieless origin and `nosniff`. Add `nosniff` for the props bucket if the host allows. |
| V13 | CI has no security scanning (`.github/workflows/ci.yml`). | Add `npm audit` and CodeQL. Dependabot exists. Roadmap item 44 (branch protection, secret scanning) needs the repo owner. |

### Tests to add (each must fail if the rule breaks)

1. **Concurrent claim:** 10-20 parallel claims on one unowned plot. Exactly one succeeds and the rest get `409`. No negative balance.
2. **Header test** in CI against a local build for the V1 headers.
3. **CSP violation** (Playwright) on the main flows.
4. **WS flood:** an emote flood is limited, and a NaN or out-of-bounds position is rejected.
5. **Listing XSS:** a business name containing `<img onerror>` and a `javascript:` URL are stored or rendered inert.
6. **Signup abuse:** the V4 cap triggers.

## Order

V1 and V2 in report-only, then V3, then V4. V5-V7 can run in parallel with V3-V4. V8-V13 follow.

## Roadmap

No roadmap item currently covers CSP or headers, captcha, or idempotency (`docs/roadmap/tasks.md`). Add V1-V4 there.
