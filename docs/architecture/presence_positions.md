# Presence-verified positions

The presence server (`services/multiplayer`) used to relay avatar positions and nothing more. Since this change it also **checks that the movement was possible**, turns what a signed-in player did into **derived events** (which district, place or sound zone, which road, how far), and the API verifies position tasks from those events only. It also **scores accounts that move like a program** and has the API hold their task rewards for review.

Presence-verified means *plausible movement, checked by the server*. It does not mean unforgeable. See [Honest limits](#honest-limits).

## Parts

| Part | Where | Does |
| :--- | :--- | :--- |
| Place geometry | `lib/world/placeGeometry.js` | One pure module, built from `generateTown(seed)` (the city the game and the server both use): land, places (park, lake, bridge, airport, mall, fun park, pier, river), 52 roads, sound zones, districts. `locate(x, z)` says where a point is. Used by the presence server and the API, so both agree on what "the park" is |
| Movement validator | `lib/world/movement.js` | Compares each report to the last *verified* position over the real elapsed time: speed cap per mode (walk 5.4, car 7, boat 3.6 units/s, times 1.5 for network lag, plus 3 units slack), bounds (land plus 30), teleports (more than three times the allowed distance plus 12). A failure does not move the verified position, so the player is credited again only after the time to walk there has passed. More than an hour of silence starts again |
| Event detector | `lib/world/presenceTracker.js` | Twice a second per signed-in account: `in` (district, place, zone or edge: on arrival, then once a minute; zones also at 60 s and 300 s of dwell), `pass` (a road covered at least 85% from near both ends within 30 minutes, per mode), `loop` (round a place in 8 sectors within 15 minutes; a bridge or pier out and back), `distance` (per mode and per district, flushed every 30 s). A 10-second settle after a start counts nothing. Only events are produced |
| Anti-bot | `lib/world/antibot.js` | Scores how an account moves (below). Observes and scores; never blocks or bans |
| Glue | `services/multiplayer/positions.mjs` | Hooks into the `hello`, `state`, `auth` and close handling; samples, batches events (5 s) and flag summaries (30 s) to the API |
| API | `services/api/presence.mjs` and `tasks.mjs` | `presence_events`, `presence_flags`, the evaluators, the claim hold, the admin view |

Only players **signed in** and in the **reward city** (`PRESENCE_REWARD_SEED`, default the API seed, 20260101) feed events. Guests record nothing.

## What the API stores

`presence_events` holds derived events, not tracks: one row per account, kind, place, phase of day, 10-minute bucket, mode and district (an `in` event is coalesced per bucket with the longest dwell; a distance event is one row, metres capped at 600 per event). Batches are at most 500 events; events older than 15 minutes or from the future are refused. Retention is **10 days** (`RETENTION.presenceEventDays` in `lib/legal/retention.js`), purged hourly (`presence.purge`), and stated in the privacy policy. The raw track is never kept, never sent to the API.

## Tasks

`lib/game/taskRules.js` supports `be-in`, `reach`, `zone`, `zones`, `distance`, `road`, `cross-city` and `travel` goals from `facts.presence` only. `reach` of a ride or a plane is not supported (no geometry), nor is `catch` at a lake or pier (the position at the catch is not recorded). With the real catalogue, **1,875 of 2,061 tasks are offered (was 1,259)**: 616 of the 621 position-type tasks. The held-back list is in [player_tasks.md](../product/player_tasks.md).

## Anti-bot signals

Each signal adds to an account's score; the sum at or over **60** (`PRESENCE_REVIEW_SCORE` in the API) puts the account under review.

| Signal | Score | Meaning |
| :--- | ---: | :--- |
| teleports | 30 (3+ in 10 min), 60 (10+) | reports too far for the time |
| hops | 30 (4+), 60 (10+) | a new connection starting far from where the account last was |
| multi_connection | 40 | two connections at once |
| marathon | 25 / 50 | active for 12 h / 20 h |
| no_pauses | 30 / 50 | no 2-second stop in 25 / 60 minutes |
| metronome_timing | 35 | message spacing too regular |
| machine_walk | 25 | movement too uniform (speed and heading) |
| repeat_route | 40 | the same route again and again |
| loop_farming | 30 | the same loop event repeated |

**Not signals:** top speed under the cap, straight lines, sharp turns. People do these.

Flags are a 10-minute TTL (`PRESENCE_FLAG_TTL_MS`) and refreshed by the presence server every 30 s while the signals persist. While an account is at or over the review score, a task claim answers **409 `under_review`**; the player's view shows `underReview` (never the score). The first hold writes an audit entry `presence.hold` (one per 6 hours per account).

**False positives.** An admin sees flagged accounts at `GET /admin/presence/flags` and clears one with `POST /admin/presence/flags/:id/clear` (audited as `presence.flag.clear`). A clear lasts 24 hours. The held task is then collectable. Tune thresholds in `lib/world/antibot.js` after watching real flags; start by looking, not enforcing.

## Settings

| Setting | Where | Default | Does |
| :--- | :--- | :--- | :--- |
| `PRESENCE_TRACK` | presence.env | on when accounts are set up | `0` switches all of this off |
| `PRESENCE_ENFORCE` | presence.env | `0` (soft) | `1` also clamps the relayed position of an impossible move to the last verified one |
| `PRESENCE_REWARD_SEED` | presence.env | API seed or 20260101 | the city that counts |
| `PRESENCE_REVIEW_SCORE` | api.env | 60 | score that holds rewards |
| `PRESENCE_FLAG_TTL_MS` | api.env | 600000 | how long a flag lasts without a refresh |

`PRESENCE_FLUSH_MS` and `PRESENCE_SUMMARY_MS` exist for tests only.

## Cost

Measured with `node scripts/bench-presence-positions.mjs` and the quick load test (60 clients, 20 signed in): tick average about 1.4 ms with tracking off and on, p95 about 1.8 ms, CPU 11 to 17% either way. Memory rises about 27 MB (the reward city and its geometry). Per message 314 ns; a moving account's sample 15 µs, a standing one 1.9 µs. Projected, all moving: 100 / 500 / 1,500 players are 0.33% / 1.66% / 4.97% of a core. The city is built once at start (about 270 ms) and the geometry in about 1 ms.

## Honest limits

- **Plausible is not proved.** A client can be modified to send any positions it likes; the server checks they are possible, not true.
- **The join position is chosen by the client** (`hello` x, z). The hop signal only mitigates this; phase 2 is an API-issued spawn tied to the ticket.
- **A bot that moves legally costs real time** and earns the same small capped rewards (5 to 120 Gold per task, bounded per period) a person would. Anti-bot raises that cost; it does not remove it.
- **Soft mode by default.** Impossible moves are not credited but still shown to other players until `PRESENCE_ENFORCE=1`.
- No collision with buildings or water yet: a path through a building is plausible.
- The position at the moment of a catch is not recorded, so lake and pier catches stay held.

## Deferred

- Plane watching, emotes, chat and meet-players goals, vehicle minutes: need their own events.
- Enforcement as the default: after watching the flags on staging.
- Phase 2: API-issued spawn, collision with buildings and water, reach of rides and planes.

## Rehearsal on staging, and rollback

See [deploy/STAGING.md](../../deploy/STAGING.md#10-rehearse-presence-verified-positions). Roll back by setting `PRESENCE_TRACK=0` and restarting the presence service: events stop at once, held rewards are released when flags expire (10 minutes) and the offered tasks return to their earlier set only after the API is rolled back too. The tables are additive and harmless.
