# Strategic differentiation: what is built

From `../competitive-research/ideas/voxelventure_idea_01.md`, the five recommendations that need no outside service. All of it needs the game server (`NEXT_PUBLIC_LIVE_API_URL`); without one the game stays single-player and none of these rules apply.

## 1. Proof-of-human traffic
Every visit (entering a building) and click (Visit website) is stored, but only **verified** events count in the statistics, the dashboard, the skyline and the world totals. An event is verified when:
- the visitor has a running page: they pinged presence (`POST /presence/ping`, every 15 s while the tab is visible) at least `HUMAN_MIN_AGE_MS` (default 3 s) earlier, so a script posting straight to `/events` does not count;
- the user agent is not a known bot or command-line tool;
- the same network has not already made too many for that building today: **3 visits and 1 click** per network per building per 24 hours (`HUMAN_VISIT_CAP`, `HUMAN_CLICK_CAP`). The network is only ever kept as a salted hash (`IP_SALT`; `TRUST_PROXY=1` reads the first `X-Forwarded-For`).
Events that fail are kept (`verified = 0`) for audit. A building's Site visits card shows a "verified human traffic" label and how much of the raw traffic was verified, with unique visitors and the average time inside.

## 2. Leaseholds
A plot is leased for **30, 90 or 365 days** (price factor 0.2, 0.5 and 1 of the claim price; 365 if the claim does not say). While a lease runs nobody can take the business over. The last **14 days** are the renewal window and the **7 days after the end** are a grace week: only the tenant can renew (`POST /plots/:id/renew`, half price, running on from the old end). After that the plot is open to a buyout. A business the city started with has no lease and can be taken over as before; the new tenant then gets a lease. A bought-out owner still moves to a house in Old Town (nothing is deleted). Emails (to a verified address with notices on) go out once each when the renewal window starts, when the lease ends and when the plot opens. An admin can move a lease on for support or tests: `POST /admin/plots/:id/lease {state: renewal|grace|open}`. Rules: `lib/game/leases.js`; server: `services/api/community.mjs` and the claim/take-over code in `services/api/core.mjs`. The plot card shows the lease, a renew button for the tenant, and a term picker when claiming.

## 3. Activity-based skyline
From a building's last 30 days of verified traffic: unique visitors x2 + clicks x4 + minutes spent inside (a visit counts at most 3 minutes) gives an engagement score and a level (0 to 3, at 25, 100 and 300). Level 1: a roof light, 10% taller. Level 2: a pennant, 25% taller. Level 3: a plaza fountain in front, 45% taller. Ten different real visitors earn a **Verified traffic** badge. No building passes 12 units (a taller generated one is left alone) and admin headquarters never grow. The server computes it (`GET /plots/state` carries `skyline` per plot) and the game draws it (`lib/game/skyline.js`, `apps/web/components/city/Plots.jsx`).

## 4. Building of the Week
The rules are in `lib/game/buildingOfWeek.js`, shared by the game, the business pages and the API:
- **Votes:** every signed-in player has **one vote a week** (UTC, Monday to Sunday). Finding all three daily gold stars on any day that week (`POST /hunt/complete`, checked to be today and complete) earns **one bonus vote**. Each vote goes to a **different building**, never your own, and only to a business people can visit (not a headquarters or a house). The server cannot see where a player stood, so the hunt check is lightweight, not a proof.
- **API:** `POST /vote` (`bad_plot`, `own_building`, `already_voted`, `no_votes_left`); `GET /votes` (public) has the player's `allowed`, `votedFor`, `votesLeft`, `huntWon`, this week's top 5, last week's winner and `endsAt`, with each building's business page (`slug`) when it has one. The `votes` table's key became week + account + building; an older database is rebuilt once at start-up, keeping its votes (`tests/votes-upgrade.test.mjs`). The answer's shape is the versioned contract `community.weekly-vote` in `packages/shared-types`, checked against the live API by `tests/contracts.test.mjs`.
- **The winner:** last week's most-voted building is this week's **Building of the Week** (a tie goes to the one that got there first).
- **In the game:** the **Building of the Week** panel (from Today & quests, Places, a card's vote box, or `/?panel=week`): the countdown to when voting closes, the winner with Open, Show and Walk there, your votes and the bonus, and this week's top 5 with vote bars and Vote buttons. Every business's card has a vote box; the winner's card has a chip.
- **On the website:** Discover has a Building of the Week section (winner, top 5, countdown, "Vote in the 3D city"); a business's page shows a badge if it won, its rank if it is in the top 5, and a Vote button (sign-in on the page).
- **Without a game server** it works as a labelled demo: your votes (and the bonus) are kept in this browser, and the rest of the city's votes are simulated, steady for each week (`simulatedTally`); a business's page sends you to the city to vote.

## 5. The Bazaar
The fourth avenue district (formerly Agency Boulevard) is now **The Bazaar**: e-commerce and merchandise, mostly shops, orange, with names like Crate Shop and Trade Emporium. The pop-up market is "in The Bazaar".

## Not built (needs outside services)
An in-store checkout, calendar booking (Cal.com) and the creator asset marketplace; see `../competitive-research/ideas/voxelventure_idea_01.md`. Stripe payments for leases, stalls and business plans are built ([billing.md](../monetization/billing.md)), and so are meeting and quote requests ([conversions.md](../monetization/conversions.md)).

## Tests
`tests/rules.test.mjs` (the shared rules), `tests/community.test.mjs` (proof of human, skyline, leases, voting against a real server), and the existing `api`, `engage`, `live`, `stats` tests, which now ping presence before sending events and end a lease (admin call) before a take-over.
