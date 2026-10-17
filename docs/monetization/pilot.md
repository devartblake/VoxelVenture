# The pilot dashboard

Phase 6 of the [competitive alignment review](../competitive-research/claimavenue_competitive_alignment_review.md) is a constrained pilot. It runs with 10 to 20 businesses in two districts for about four weeks.

The pilot dashboard follows each of those businesses week by week. It holds:

- the businesses' verified figures;
- whether each owner keeps coming back;
- what each business paid;
- each merchant's weekly feedback.

It then checks the criteria that lift the [world-expansion freeze](../roadmap/world_freeze.md#when-it-lifts).

## Running a pilot

1. **Start the API with an admin token.** Start the API with `ADMIN_TOKEN` set, and build the app with `NEXT_PUBLIC_LIVE_API_URL` set.
2. **Have each business list itself.** Each business makes its free profile at `/business/new`.
3. **Add the businesses to the pilot.** Use either:
   - the admin page: **`/admin/pilot`** (enter the admin token; it is kept for that tab only);
   - or the command line: `npm run moderate -- pilot add <slug> "how we met"`.

   The note is for you alone. To take a business out, use **Remove** or `pilot remove <slug>`. Its record is kept, but it no longer counts.
4. **Read the dashboard each week.** Use `/admin/pilot`, or `npm run moderate -- pilot` in a terminal. `npm run moderate -- pilot csv > pilot.csv` saves the figures as a spreadsheet, with one line per business per week.
5. **Owners answer the weekly check-in.** Their dashboard shows it while they are in the pilot. There are four questions:
   - how useful VoxelVenture was this week (1 to 5);
   - what it brought them;
   - what is missing;
   - whether they would pay for it as it is.

   Sending it again the same week replaces that week's answers.
6. **Record the decision at the end.** When every criterion is met, record the decision in [world_freeze.md](../roadmap/world_freeze.md) and lift the freeze as described there.

Before the pilot starts, tick **Every published business** (or call `GET /admin/pilot?all=1`) to try the dashboard on all profiles. That view is a preview only. The verdict that counts is the one for pilot members.

## What is measured

The weeks are UTC weeks starting on Monday. The dashboard shows the last 4 weeks by default (1 to 12 can be chosen), including the current week so far. Every figure is **verified**, the same as on the owner's own dashboard: no robots, no owner's own visits, and the per-network caps apply.

| Figure | Where it comes from |
| --- | --- |
| Activated | The profile's set-up checklist is complete: name and category, district, a description of at least 40 characters, a call to action, and the first visit through the link. Linking a building is optional. |
| Owner back that week | The owner opened their dashboard, changed their profile or sent the check-in that week (`owner_activity`) |
| Views, qualified visits, store entries, button presses | Verified profile events |
| Leads | Verified meeting and quote requests, plus confirmed newsletter sign-ups |
| Coupon claims and redemptions | The linked 3D storefront's coupon |
| Purchases, verified revenue | Purchases reported by the business's server and credited to a verified press (pixel reports are not counted) |
| Paid to us, renewed | Paid orders during the period. A business counts as renewed when its Pro renewed, it paid a second time, or it asked for another plan after paying. |

## The criteria

The criteria are defined in `packages/analytics/src/pilot.js`, the same numbers as [world_freeze.md](../roadmap/world_freeze.md#when-it-lifts). `tests/pilot.test.mjs` checks that the two agree.

| Criterion | Target | How it is counted |
| --- | --- | --- |
| Return weekly | 30% of the pilot's businesses | The owner came back in at least 3 of every 4 completed weeks they were in the pilot. The current week does not count yet, and a business that joined this week has no completed week. |
| A meaningful call-to-action interaction | 20% | At least one verified press of the button, a request or a confirmed sign-up in the period |
| Businesses that pay | 3 | A paid order in the period |
| Renew or ask for another campaign | 2 | As above |
| No simulated advertiser figures | yes | With a server, owners only see verified figures ([authoritative_data.md](../architecture/authoritative_data.md)) |

The freeze can lift only when every criterion is met, and the pilot has at least one business.

## Interfaces

| Interface | What |
| --- | --- |
| `GET /admin/pilot?weeks=4&all=0` | The dashboard: `weeks`, `totals`, `verdict` (each criterion with `actual` and `met`, and `lifts`), and per business `weekly`, `totals`, `retention`, `activated`, `paidCents`, `renewed` and `feedback` |
| `GET /admin/pilot.csv?weeks=4` | The same, as a spreadsheet |
| `POST /admin/pilot/members` `{ slug, note? }` | Adds a business (or adds it back). Recorded in the audit trail as `pilot.add`. |
| `DELETE /admin/pilot/members/<slug>` | Takes a business out. Recorded in the audit trail as `pilot.remove`. |
| `POST /businesses/<slug>/pilot-feedback` `{ rating, wouldPay, result?, missing? }` | The owner's weekly check-in. Only the owner of a pilot business may send it. The text is screened like other text. |
| `GET /me/businesses` | Each profile has `pilot`: `null`, or `{ since, week, feedback }` |

Where the code is:

- **Server:** `server/api/pilot.mjs`, and the dashboard hooks in `server/api/ownerActivity.mjs`.
- **Tables:** `pilot_members`, `owner_activity` and `pilot_feedback` in `server/api/schema.sql`.
- **Pages:** `app/admin/pilot/page.jsx`, and the check-in (`PilotFeedback`) in `components/business/ManageProfiles.jsx`.
- **Tests:** `tests/pilot.test.mjs`.

## Privacy

The weeks an owner used their dashboard, and the check-in answers, are listed in the privacy policy and the retention schedule at `/legal`. Only staff see the answers.
