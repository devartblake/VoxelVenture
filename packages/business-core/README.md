# @voxelventure/business-core

What VoxelVenture sells, and what each plan gets. It is pure and may depend on `shared-types` only. Prices are in US cents and are defined only here. The server charges these amounts whatever a browser sends. Billing is described in [docs/monetization/billing.md](../../docs/monetization/billing.md).

| Export | What |
| --- | --- |
| `PRODUCTS` | Launch Pack ($9 once, 7 days), Pro ($19 a month, subscription), Sponsored (per placement, 7 days) |
| `PLACEMENTS`, `placementOf(key)` | Top of Discover $99, a district page $49, a category page $29; 3 slots each |
| `priceOf(product, placement)`, `dollars(cents)`, `priceLabel(product)` | The price a checkout uses, and how a page shows it |
| `planOf(entitlements, at)`, `PRO_FIELDS`, `figuresFor(stats, plan)` | Which plan an owner is on, and which figures it shows (the breakdowns by source, campaign and day are Pro) |
| `DAY_MS` | One day in milliseconds |

**Used by:**

- `server/api/billing.mjs`, `server/api/business.mjs`;
- `components/business/ManageProfiles.jsx`;
- `lib/business/profile.js`, `lib/legal/facts.js`.

The old path `lib/business/plans.js` is an adapter. [`tests/packages.test.mjs`](../../tests/packages.test.mjs) checks two things:

- the server and the pages get the very same `PRODUCTS` object;
- `server/api/billing.mjs` has no prices of its own.
