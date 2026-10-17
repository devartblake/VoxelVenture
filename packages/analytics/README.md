# @voxelventure/analytics

Conversion measurement: the journey from being seen to a verified result, what counts as a result, and what a result cost. It is pure and may depend on `shared-types` only. The rules are explained in [docs/monetization/conversions.md](../../docs/monetization/conversions.md).

| Export | What |
| --- | --- |
| `FUNNEL`, `RESULTS` | The steps (impression → view → qualified visit → store entry → button press) and the kinds of result |
| `OUTCOMES`, `outcomesOf(stats, spendCents)` | The four outcome families (leads, coupon claims, redemptions, purchases), each with its own count and cost, never summed |
| `costPer(spendCents, count)`, `returnOnSpend(revenueCents, spendCents)` | `null` when either side is missing |
| `QUALIFIED_AFTER_MS`, `ATTRIBUTION_DAYS` | 15 s on the page makes a visit qualified; a sale is credited to a press up to 30 days before |
| `CLICK_PARAM`, `isClickId`, `newClickId`, `withClickId(url, id)` | The click id added to an https call-to-action link, so a purchase can be credited to the press that led to it |
| `isTicket` | A coupon claim's ticket code |
| `PILOT_CRITERIA`, `pilotVerdict`, `returnedWeekly`, `hadInteraction`, `PILOT_WEEKS` | The pilot's criteria that lift the world freeze, and how each business counts ([pilot.md](../../docs/monetization/pilot.md)) |

**Used by:**

- `server/api/business.mjs`, `server/api/conversions.mjs`;
- `server/api/pilot.mjs`, which imports the package directly;
- `components/business/{CtaButton,ManageProfiles,ProfileTracker}.jsx`;
- `lib/data/sync.js`.

All of them import it by name, `@voxelventure/analytics` ([ADR 0002](../../docs/architecture/adr/0002-workspaces.md)); the old adapter `lib/business/conversions.js` is gone.
