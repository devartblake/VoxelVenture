# Strategic differentiation: what is built

From `voxelventure_idea_01.md`, the five recommendations that need no outside service. All of it needs the game server (`NEXT_PUBLIC_LIVE_API_URL`); without one the game stays single-player and none of these rules apply.

## 1. Proof-of-human traffic
Every visit (entering a building) and click (Visit website) is stored, but only **verified** events count in the statistics, the dashboard, the skyline and the world totals. An event is verified when:
- the visitor has a running page: they pinged presence (`POST /presence/ping`, every 15 s while the tab is visible) at least `HUMAN_MIN_AGE_MS` (default 3 s) earlier, so a script posting straight to `/events` does not count;
- the user agent is not a known bot or command-line tool;
- the same network has not already made too many for that building today: **3 visits and 1 click** per network per building per 24 hours (`HUMAN_VISIT_CAP`, `HUMAN_CLICK_CAP`). The network is only ever kept as a salted hash (`IP_SALT`; `TRUST_PROXY=1` reads the first `X-Forwarded-For`).
Events that fail are kept (`verified = 0`) for audit. A building's Site visits card shows a "verified human traffic" label and how much of the raw traffic was verified, with unique visitors and the average time inside.

## 2. Leaseholds
A plot is leased for **30, 90 or 365 days** (price factor 0.2, 0.5 and 1 of the claim price; 365 if the claim does not say). While a lease runs nobody can take the business over. The last **14 days** are the renewal window and the **7 days after the end** are a grace week: only the tenant can renew (`POST /plots/:id/renew`, half price, running on from the old end). After that the plot is open to a buyout. A business the city started with has no lease and can be taken over as before; the new tenant then gets a lease. A bought-out owner still moves to a house in Old Town (nothing is deleted). Emails (to a verified address with notices on) go out once each when the renewal window starts, when the lease ends and when the plot opens. An admin can move a lease on for support or tests: `POST /admin/plots/:id/lease {state: renewal|grace|open}`. Rules: `lib/game/leases.js`; server: `server/api/community.mjs` and the claim/take-over code in `server/api/core.mjs`. The plot card shows the lease, a renew button for the tenant, and a term picker when claiming.

## 3. Activity-based skyline
From a building's last 30 days of verified traffic: unique visitors x2 + clicks x4 + minutes spent inside (a visit counts at most 3 minutes) gives an engagement score and a level (0 to 3, at 25, 100 and 300). Level 1: a roof light, 10% taller. Level 2: a pennant, 25% taller. Level 3: a plaza fountain in front, 45% taller. Ten different real visitors earn a **Verified traffic** badge. No building passes 12 units (a taller generated one is left alone) and admin headquarters never grow. The server computes it (`GET /plots/state` carries `skyline` per plot) and the game draws it (`lib/game/skyline.js`, `components/city/Plots.jsx`).

## 4. Building of the Week
Finding all three daily gold stars (`POST /hunt/complete`, checked to be today and complete) earns one vote for the calendar week (UTC, Monday to Sunday). `POST /vote` casts it for any business people can visit (not a headquarters or a house); one vote a week per account; `GET /votes` has this week's leaders and last week's winner. The winner is the **Building of the Week** until the next week ends: a chip on its card and a row in Places. The server cannot see where a player stood, so the hunt check is lightweight, not a proof.

## 5. The Bazaar
The fourth avenue district (formerly Agency Boulevard) is now **The Bazaar**: e-commerce and merchandise, mostly shops, orange, with names like Crate Shop and Trade Emporium. The pop-up market is "in The Bazaar".

## Not built (needs outside services)
An in-store checkout, calendar booking (Cal.com) and the creator asset marketplace; see `voxelventure_idea_01.md`. Stripe payments for leases, stalls and business plans are built ([billing.md](billing.md)), and so are meeting and quote requests ([conversions.md](conversions.md)).

## Tests
`tests/rules.test.mjs` (the shared rules), `tests/community.test.mjs` (proof of human, skyline, leases, voting against a real server), and the existing `api`, `engage`, `live`, `stats` tests, which now ping presence before sending events and end a lease (admin call) before a take-over.
