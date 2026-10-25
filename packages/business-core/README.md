# @voxelventure/business-core

What VoxelVenture sells, and what each plan gets. It is pure and may depend on `shared-types` only. Prices are in US cents and are defined only here. The server charges these amounts whatever a browser sends. Billing is described in [docs/monetization/billing.md](../../docs/monetization/billing.md).

| Export | What |
| --- | --- |
| `PRODUCTS` | Launch Pack ($9 once, 7 days), Pro ($19 a month, subscription), Sponsored (per placement, 7 days) |
| `PLACEMENTS`, `placementOf(key)` | Top of Discover $99, a district page $49, a category page $29; 3 slots each |
| `priceOf(product, placement)`, `dollars(cents)`, `priceLabel(product)` | The price a checkout uses, and how a page shows it |
| `planOf(entitlements, at)`, `PRO_FIELDS`, `figuresFor(stats, plan)` | Which plan an owner is on, and which figures it shows (the breakdowns by source, campaign and day are Pro) |
| `DAY_MS` | One day in milliseconds |
| `PROMO_GROUPS`, `PROMO_GROUP_IDS`, `promoGroupOf`, `groupsOf`, `promoDiscount`, `STRIPE_MIN_CENTS`, `normalizeCode`, `PROMO_ALPHABET`, `promoLabel` | Promo codes (from `promo.js`): the product groups a code covers and which purchase is in each, and what a code takes off a checkout, as the server charges it and the pages show it |
| `prorataLine`, `prorataPlan`, `monthPeriod`, `PRORATA`, `PRORATA_KINDS` | Refunds of unused time (from `refunds.js`): what a paid line gives back, pro rata, when an account is deleted or an admin refunds it (`services/api/prorata.mjs`) |
| `CATEGORIES`, `BUSINESS_DISTRICTS`, `CTA_KINDS`, `categoryOf`, `districtOf`, `ctaKindOf` | What a profile can be (from `profile.js`) |
| `isSlug`, `slugify`, `uniqueSlug`, `RESERVED_SLUGS`, `cleanProfile`, `LIMITS`, `isHttpUrl` | A profile's address and fields, checked the same way by the form and the server |
| `onboardingSteps`, `profileReady`, `PLANS`, `upgradePrompts` | The set-up checklist, and the paid offers it suggests from verified figures only |
| `isRefCode`, `profilePath`, `profileUrl`, `sourceOf` | Share links with a referral code, and where a visitor came from |
| `profileJsonLd`, `breadcrumbJsonLd`, `listJsonLd`, `profileFromPlot` | Structured data for search engines, and the demo profiles of the generated city |

**Used by:**

- `services/api/billing.mjs`, `services/api/business.mjs`;
- `apps/web/components/business/ManageProfiles.jsx`;
- `lib/legal/facts.js`;
- the public pages (`apps/web/app/(public)/`), `apps/web/components/business/`, the sitemap, `lib/business/{referral,source}.js`, and `services/api/{business,billing,social,pilot}.mjs`.

All of them import it by name, `@voxelventure/business-core` ([ADR 0002](../../docs/architecture/adr/0002-workspaces.md)); the old adapters `lib/business/plans.js` and `lib/business/profile.js` are gone. [`tests/packages.test.mjs`](../../tests/packages.test.mjs) checks two things:

- the server and the pages get the very same `PRODUCTS` object;
- `services/api/billing.mjs` has no prices of its own.
