# Alignment status: phases 1 to 5

Checked on 2026-10-16 against [claimavenue_competitive_alignment_review.md](claimavenue_competitive_alignment_review.md): its phases 1 to 5, the parts of the P0 and P1 backlog that belong to them, and the review's "critical gaps" sections.

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
| 7. Upgrade prompts tied to measurable value | ✅ | From verified figures only; with Stripe set up they lead to checkout (phase 4), otherwise they record interest |
| 3D building as an optional destination from the profile | ✅ | "Step inside the 3D storefront" on the profile; "Business page" on the building's card |
| Accessible non-WebGL fallback (gap 4) | ✅ | `components/ui/NoWebGL.jsx`, which points a building's link to its business page |
| Fast mobile landing pages (gap 4) | ✅ | Plain server-rendered pages that load no game code: see [gap 4](#critical-gap-4-public-discoverability) |
| A way into the free funnel from the game (gap: "free business/profile entry") | ✅ | The game header's **Businesses** and **List your business free** |
| Welcome posts that tag the owner (idea 02 section 5) | ✅ | Opt-in, off by default; needs your X keys 👤 ([social_posts.md](social_posts.md)) |

## Critical gap 4: public discoverability

The review asked for fast public pages that search engines and social networks can understand, because `/b/[id]` (which opens the city on a building) is not enough as the main acquisition page. Checked on 2026-10-17:

| Expectation | Status | What exists |
| --- | --- | --- |
| `/discover` | ✅ exceeds | Search, the categories and districts, **Sponsored** and **New this week** rows, and the newest businesses. Canonical address; search results are not indexed. |
| `/business/[slug]` | ✅ exceeds | One call to action (website, order, booking, demo, newsletter, meeting or quote request), a Pro offer, the launch badge, **Step inside the 3D storefront**, share and report. Verified views, presses and results feed the owner's dashboard. |
| `/district/[slug]` | ✅ | The district's businesses and its sponsored cards, with a link into the 3D district |
| `/category/[slug]` | ✅ | The category's businesses and its sponsored cards, with links to the other categories |
| Open Graph preview images | ✅ | Each business has its own share image, with a gold launch-week version. Categories and districts each have their own image (name, colour and number of businesses). Discover has one too. Titles, descriptions and Twitter cards are set. |
| Structured business metadata | ✅ | JSON-LD on every public page. A profile has its schema.org business type (for example `FoodEstablishment` or `Store`), its website, district and running offer, plus a breadcrumb. Discover, categories and districts have a `CollectionPage` with an `ItemList` of their businesses and a breadcrumb. `sitemap.xml` and `robots.txt` list the public pages. |
| Accessible non-WebGL fallback | ✅ | `components/ui/NoWebGL.jsx` replaces the city when WebGL is missing. A link to one building (`/b/<id>`) whose owner has a business page leads to that page. |
| Fast mobile landing pages | ✅ | Server-rendered, with no 3D and no game code. About 178 KB of compressed JavaScript per page (almost all of it the Next.js and React runtime), against 689 KB for the city. Measured on a production build: server response in 20 to 45 ms; first paint 0.5 s on a phone-sized screen, locally and without network throttling; no sideways scrolling. |
| `/b/[id]` not the main acquisition page | ✅ | A building linked to a business page shares that page. The link straight into the city is offered beside it. `/b/<id>` stays the deep link into the game, and only the business pages are in the sitemap. |

Still to check once the site is live: a Lighthouse run on a real phone and network, and Google's Rich Results test on a live profile. Neither can be done before deployment (task 1).

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

## Phase 4: low-risk monetisation ([billing.md](billing.md))

| Item | Status | Where |
| --- | --- | --- |
| $9 Launch Pack | ✅ | A week in **New this week** on Discover, a highlighted card and badge, a launch share image, and a summary of the week |
| $19/month Pro | ✅ | Sources, campaigns, the 30-day chart, CSV export, and an offer on the public page |
| Fixed-term sponsored placements | ✅ | $29 to $99 a week on Discover, category and district pages. Each spot has three slots and is labelled **Sponsored**. |
| Fixed-price market bookings | ✅ | Paid through Stripe; held while paying; refunded if cancelled before the stall opens |
| Conventional leases | ✅ | Claims, take-overs and renewals are paid through Stripe. The tenant a take-over replaces is not paid out. |
| Webhook idempotency, reconciliation, refunds, receipts, audit | ✅ | Signed webhooks applied once; hourly reconciliation; refunds that take back what was bought; receipts from Stripe; every step in the audit trail |
| Real-money 1.25x take-over payouts | Not done on purpose | Waits for a legal, tax and fraud review |
| Stripe account, webhook endpoint, terms and refund policy | 👤 | [billing.md](billing.md#setting-it-up-needs-you) |

## Phase 5: conversion measurement ([conversions.md](conversions.md))

| Measure | Status | Where |
| --- | --- | --- |
| Profile impressions | ✅ | Cards on screen on Discover, category and district pages |
| Qualified visits | ✅ | 15 seconds on the profile |
| Store entries | ✅ | Walking into the linked 3D storefront |
| CTA interactions | ✅ | Presses; link buttons carry a click id |
| Newsletter sign-ups | ✅ | Double opt-in (phase 2), now counted per 30 days |
| Meeting requests (and quote requests) | ✅ | New call-to-action kinds with a form on the profile, emailed to the owner |
| Coupon claims and redemptions | ✅ | A ticket per claim, which the owner marks used |
| Purchases | ✅ | A postback or a pixel from the owner's site, credited by click id |
| Cost per result | ✅ | Spend on the profile divided by its results |
| Renewal rate | ✅ | `GET /admin/metrics/renewals`, `npm run moderate -- renewals` |

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
| Stripe Checkout and webhook idempotency | ✅ | [billing.md](billing.md): signed webhooks applied once, idempotency keys, hourly reconciliation. The Stripe account is 👤 |

## Not done on purpose

These belong to later phases, or wait for the pilot to justify them:

- Phase 4 is done in code ([billing.md](billing.md)). It needs your Stripe account and terms.
- The pilot itself (phase 6).
- Server-side reservation of the three-minute claim hold.
- Gold on the server.
- Mall stores and shared billboard slots on the server.
