# Alignment status: phases 1 to 3

Checked on 2026-10-16 against [claimavenue_competitive_alignment_review.md](claimavenue_competitive_alignment_review.md): its phases 1 to 3, the parts of the P0 and P1 backlog that belong to them, and the review's "critical gaps" sections.

**Key:**

- ✅ done in code and tested.
- 👤 needs you: an account, a decision, a legal text or a deployment.
- ⏭ belongs to a later phase.

## Phase 1: freeze world expansion

| Item | Status | Where |
| --- | --- | --- |
| Stop adding roads, vehicles, landmarks, simulation, large visual features | ✅ | [world_freeze.md](world_freeze.md), `npm run check:freeze` (run on every pull request by CI), the PR template's checklist |
| Deferred items marked in the task list | ✅ | [tasks.md](tasks.md) (⏸) |
| Continue accessibility, stability and performance work | ✅ ongoing | The fixes in this round: the non-WebGL fallback, and lighter business pages |

## Phase 2: business-first funnel

| Item | Status | Where |
| --- | --- | --- |
| 1. Free business profile | ✅ | [business_funnel.md](business_funnel.md) |
| 2. Public SEO business page | ✅ | `/business/<slug>`: canonical address, Open Graph, share image, JSON-LD |
| 3. Category and district discovery pages | ✅ | `/discover`, `/category/<id>`, `/district/<id>` with share images; `sitemap.xml`, `robots.txt` |
| 4. Clear CTA selection | ✅ | One CTA per profile (5 kinds) |
| 5. Share and referral attribution | ✅ | Signed `?ref=` codes, `utm_campaign` campaigns, the `x` source |
| 6. Owner onboarding checklist | ✅ | `/business/manage` |
| 7. Upgrade prompts tied to measurable value | ✅ | From verified figures only; records interest until checkout exists (phase 4) |
| 3D building as an optional destination from the profile | ✅ | "Step inside the 3D storefront" on the profile; "Business page" on the building's card |
| Accessible non-WebGL fallback (gap 4) | ✅ | `components/ui/NoWebGL.jsx` |
| Fast mobile landing pages (gap 4) | ✅ | Plain server-rendered pages with no multiplayer connection |
| A way into the free funnel from the game (gap: "free business/profile entry") | ✅ | The game header's **Businesses** and **List your business free** |
| Welcome posts that tag the owner (idea 02 section 5) | ✅ | Opt-in, off by default; needs your X keys 👤 ([social_posts.md](social_posts.md)) |

## Phase 3: authoritative production data

| Item | Status | Where |
| --- | --- | --- |
| Authentication | ✅ | Server accounts and sessions |
| Server-owned claims and leases | ✅ | Atomic on the server |
| Business configuration | ✅ | The building's outside and logo are stored on the server |
| Verified statistics | ✅ | Counts are verified events only; the live provider never shows simulated figures |
| Ad inventory | ✅ | Ad counts are verified |
| Market bookings | ✅ | Server, audited |
| Moderation actions | ✅ | Audited; `npm run moderate` covers reports, bans, the audit trail and X posts |
| Audit records | ✅ | Append-only, hash-chained `audit_log` |
| Simulated metrics removed from advertiser interfaces | ✅ | The building card, My businesses, ad counts, the newsletter and the admin HQs (live city panel) |
| Deploy and verify | 👤 | Choose the host and domain (task 1), then `npm run check:env`, deploy, and `npm run verify:live` |

## P0 backlog items belonging to phases 1 to 3

| Item | Status | Notes |
| --- | --- | --- |
| GitHub Actions for build, lint and tests | ✅ | `.github/workflows/ci.yml` runs only what a change needs (`scripts/select-checks.mjs`, tested in `tests/select-checks.test.mjs`). Documentation runs nothing. A model runs the model, credits and world tests. A `lib/` file runs the tests of every module built on it. A server file runs the server's tests. Anything unknown runs everything, including the production build in the browser test. |
| Protect `main` and require passing checks | 👤 | Settings > Branches: protect `main`, require pull requests and the **CI / checks** status. These are repository settings; code cannot change them. |
| Dependency and secret scanning | Half done (✅ + 👤) | `.github/dependabot.yml` (npm, pip, actions) ✅. Secret scanning and push protection are repository settings (Settings > Code security) 👤. |
| Deploy the API and authoritative data store | 👤 | The code is ready; the hosting choice is yours |
| Remove simulated advertiser data from production | ✅ | |
| Implement referral and campaign attribution | ✅ | Referral codes, campaigns, the X source |
| Complete production moderation and audit tooling | ✅ | |
| Database migration tests | ✅ | `tests/migration.test.mjs` upgrades a first-release database |
| Environment validation | ✅ | The API refuses to start in production with unsafe settings; `npm run check:env` |
| Production smoke tests | ✅ | `npm run verify:live` |
| Privacy, refund, advertising and placement terms | 👤 | Legal text is for you or your counsel to write. The privacy notice should cover what is collected: accounts and email, presence pings with a country, hashed network addresses for the verification caps, the referral code kept 30 days in the browser, and the X handle (opt-in). |
| Preview deployments | 👤 | Depends on the host you choose |
| Stripe Checkout and webhook idempotency | ⏭ | Phase 4 |

## Not done on purpose

These belong to later phases, or wait for the pilot to justify them:

- Checkout and paid tiers (phase 4).
- Newsletter, meeting and lead CTAs measured as conversions (phase 5).
- The pilot itself (phase 6).
- Server-side reservation of the three-minute claim hold.
- Gold on the server.
- Mall stores and shared billboard slots on the server.
