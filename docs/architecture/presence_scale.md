# Presence at scale (protocol 2)

How the presence server ([services/multiplayer/server.mjs](../../services/multiplayer/server.mjs), client in [lib/net/multiplayer.js](../../lib/net/multiplayer.js)) handles a crowd, what it was measured doing, and what to do when one server is not enough. Setup and settings are in [../server/README.md](../../services/multiplayer/README.md) and [../deploy/README.md](../../deploy/README.md).

## What changed
Protocol 1 sent every player to every client: a join told everyone in the city, a welcome listed the whole city, and every tick each client got a full position for every player within 120 units. Cost per client grew with the crowd, and the browser drew an avatar for everyone it had heard of.

Protocol 2 is interest management:
- **A client is told only about the players near it**, the nearest `MP_MAX_VISIBLE` (default 40) within `MP_VIEW_RADIUS` (120 units). They arrive as `enter` (a full record: name, outfit, parked cars), leave as `exit`, and in between only what changed is sent. Nobody moving means no messages at all.
- **Smaller messages.** A changed player is a short array, `[id, x, z, yaw, moving, emote, vehicle]` (about 25 bytes, a fifth of the old object).
- **Fewer updates for far players.** Within 40 units, ten a second; 40 to 80, five; beyond, two and a half. The client smooths between updates, so a distant walker still looks fluid.
- **A grid, not a scan.** Players of a city sit in a grid of view-radius cells, so finding who is near costs a few cells. Each client's neighbour list is refreshed every third tick (a walker covers about a metre in that time); movement still goes out every tick.
- **The count and the map.** `online` messages carry how many are in the city and up to 250 coarse dots (`[id, x, z]`) for everyone else, so the Online panel says "38 near you, 412 elsewhere" and the world map shows the distant players as dots. They go out every two seconds, and sooner when someone joins or leaves, but never more than once a second to one city: a single join after a quiet second is sent at once, and a burst of joins and leaves is gathered into one overview a second later ([below](#the-online-overview-gathered-2026-10-20)). A newcomer's own count comes in its `welcome`.
- **Back-pressure** as before: a client whose connection is backed up is skipped until it catches up.
- `/status` now has a `load` block: time per tick against the 100 ms budget (average, 95th, worst), processor use, event-loop delay, bytes and messages a second, memory. It also says how the limits are acting: `backedUp` (clients whose snapshots are being skipped right now), `skipped` (snapshots skipped since the start), `droppedSilent` (connections dropped after 20 s of silence) and `refused` (over `MP_MAX_CLIENTS` or `MP_MAX_PER_IP`). The monitor page can show it; the load test reads it.

## The messages, as contracts

Every protocol-2 message has an executable contract in `packages/shared-types` (`PRESENCE_CLIENT`, `PRESENCE_SERVER`; [ADR 0004](adr/0004-presence-protocol-contracts.md)):

- **Strict checks:** the server checks `hello` and `auth` against them as they arrive. A `hello` that does not fit is answered `invalid`.
- **Versions:** a `hello` whose `v` is not 2 is answered `protocol.unsupported` and closed (code 4002). The game then stops reconnecting and asks for a reload.
- **Tests:** they hold the server's real messages to the contracts, so a shape change fails CI.
- **Changes:** each protocol change goes in `packages/shared-types/CHANGELOG.md`.
- **Chat retries:** a nearby line is said once per `id`, even when it is retried after a reconnect. The server remembers its answer per connection and, for a signed-in player, per account for five minutes.
- **Journeys:** `tests/journeys/reconnect-and-recovery.test.mjs` is the end-to-end check ([the journeys](../../tests/journeys/README.md)). Two signed-in players reconnect, and the server is sent stale protocols, spent tickets, malformed input, floods and a slow receiver.

## Measured (protocol 2, guests walking)
The first load test, before it was composed (below): pretend players walk about the city (a quarter stand still, 60% gather in four busy places, so most see a full 40). The bots and the server shared one development laptop, so the server is slightly worse off than on its own machine.

| Players | Each client receives | Server tick (average / 95th) | Processor | Verdict |
| :-: | :-: | :-: | :-: | :--- |
| 200 | 7.3 KB/s | 11 / 15 ms | 16% of a core | comfortable |
| 300 | 8.3 KB/s | 10 / 14 ms | 17% | comfortable |
| 600 | 10.3 KB/s | 26 / 32 ms | 33% | comfortable |
| 1000 | 10.0 KB/s | 68 / 93 ms | 89% | at the limit |

Before this work, 200 players in the same busy places cost each client about 44 KB/s and 68 Mbit/s in total; the same 200 now cost about 10 Mbit/s. The first profile showed the neighbour search itself was the server's main cost; making it numeric and refreshing it every third tick halved the tick time at 600 players (70 ms to 26 ms).

**Read this as a worst case.** A real crowd mostly stands, talks and looks; the test keeps three quarters of the players walking all the time. Expect real load well below these figures, and a dedicated server (no bots on the same machine) to hold more.

## The composed load test: realistic sessions, with budgets
`scripts/load-test-presence.mjs` now plays whole sessions, built on the journeys' presence agent (`tests/agents/presence-agent.mjs`), and exits 1 when a budget is breached (Track A's "multiplayer load agents" in the [adoption plan](external_voxel_repositories_adoption_plan.md), section 17).

**What the pretend players do:**
- **Guests and signed-in players.** 30% sign up through the API. A third of those sign in again afterwards, as a returning player would. Each gets a one-use messaging ticket and hands it over on the socket (`auth`), as the game does. Every player has its own network address (`X-Forwarded-For`, with `TRUST_PROXY=1` on the stack it starts), so the per-network limits apply as they would to real players.
- **Moving.** A quarter stand still (a heartbeat every 2 s, like the game). Most walk about one of four busy places, and a fifth drive between them at car speed. Players come into and leave each other's view all the time (about 1,900 a second at 500 players).
- **Nearby chat.** Each signed-in player says a line every 15 to 40 s.
- **Churn and reconnects.** 15% lose their connection once or twice: half with no close handshake (a phone losing signal), half closing cleanly. They come back with the game's backoff (1 s, then ×1.7) and sign in again with a fresh ticket. Half of the signed-in ones had just said a line whose answer they never got, and retry it on the new connection.
- **Slow clients.** 3% stop reading for 15 s but keep moving. The server must skip their snapshots until they drain, not drop them, and not slow anyone else down. 1% freeze completely (no reading, no pongs, no messages): the server must drop them after 20 to 25 s of silence.
- **Abuse.** A handful of extra connections:
  - malformed messages: answered `invalid`, and a proper hello still works;
  - a movement flood: the extras beyond 60 a second are dropped, and the connection is kept;
  - a chat flood: `rate_limited` with `retryAfterMs`;
  - a spent ticket, a made-up ticket, and a ticket over a minute old: `auth.failed unauthenticated`;
  - a sign-in without a ticket: `bad_request`;
  - a stale protocol: `protocol.unsupported`, closed with 4002;
  - a message over 16 KB: closed with 1009.

**What it checks.**
- Nobody is disconnected unexpectedly.
- Nobody sees a player twice: no second `enter`, no two connections of one account in view, and no ghost of a connection that has ended.
- Nobody hears a line twice, also across a reconnect.
- Every message fits its contract (snapshots and `online` counts are sampled, one in 25).
- It reads the server's own figures every 2 s. On staging, `/status` is hidden, so it reads them through the API's `GET /admin/presence` with `--admin-token`.

**Running it:**

| Command | What it runs |
| :--- | :--- |
| `npm run load:presence -- --full` | the certified target: 500 players, 150 signed in, 90 s (about 2 minutes in all). Starts its own API (in-memory database) and presence server |
| `npm run load:presence -- --quick` | 60 players, 20 signed in, 20 s (about 35 s). `tests/presence-load.test.mjs` runs it in CI |
| `--clients N --signed-in N --seconds N --rooms N --crowd 0.6` | adjust either preset; `--json file` writes the report |
| `--mp wss://play.staging… --api https://api.staging… --allow-writes [--admin-token …]` | a running stack (see below) |

**Against staging.** A remote run creates accounts (`lt<run><n>`) and loads the server, so it needs `--allow-writes`. Production hosts (`*.voxelventure.app` other than `*.staging.*`) are refused unless `--i-know-this-is-production`.

Staging sees every pretend player as one network: Caddy replaces `X-Forwarded-For` with the real address. Two settings get in the way at full size:
- **The presence server** allows `MP_MAX_PER_IP=20` connections per network. Raise it in `/etc/voxelventure/staging/presence.env` for the run (to 600), restart `voxelventure-staging-presence`, and put it back afterwards. Without that, the run stops at "only N could connect (refused)".
- **The API** allows 20 sign-ins and 240 requests a minute per network (these are not settings). The load test waits out a 429 and counts it. 150 sign-ups then take about 8 minutes, and a reconnect that waits for a ticket can breach the reconnect budget. For a quick look, use `--signed-in 40 --clients 200`.

Pass `--admin-token` (staging's `ADMIN_TOKEN`, or `LOAD_ADMIN_TOKEN` in the environment) for the server's figures. Without it, the server budgets show `n/a`.

**The budgets** were proposed from the runs below. They are in `BUDGETS` at the top of the script.

| Budget | Full run here | Budget |
| :--- | :-: | :-: |
| Unexpected disconnects | 0 | 0 |
| Players or lines seen twice, ghosts | 0 | 0 |
| Messages outside their contract | 0 | 0 |
| Sign-ins that succeed | 100% (196 of 196) | ≥ 99% |
| Chat lines accepted | 100% | ≥ 99% |
| Chat, said to heard, p95 | 24-27 ms (p50 4-5 ms) | < 500 ms |
| Reconnect (lost to welcomed and signed in), p95 | 1.09 s (p50 1.03 s: the game waits 1 s first) | < 3 s |
| Snapshots to a player in a busy place, median | 9.97 a second | ≥ 8 a second |
| The same, while 15 slow readers are backed up | 9.96 a second | ≥ 8 a second |
| Each client receives, busiest 5% | 27-29 KB/s (19.4-21.6 KB/s once `online` was gathered) | < 28 KB/s (was 40) |
| Slow readers kept and caught up; frozen clients dropped | yes; yes (after about 23 s) | yes |
| Abuse answered as documented | 9 of 9 | all |
| Tick p95, typical 10 s window | 21-28 ms | < 50 ms |
| Tick p95, worst 10 s window | 28-90 ms | < 100 ms |
| Processor | 40-49% of a core | < 85% |
| Event-loop delay, p99 | 43-48 ms | < 100 ms |
| Memory | 221-222 MB | < 512 MB |

**Measured locally (2026-10-20).** AMD Ryzen 9 7950X (16 cores, 32 threads), 31 GB, Windows 11 (10.0.26200), Node 24.20.0. The bots, the API and the presence server were on the same machine. Four full runs, all within budget. The recorded one:
- 500 connected, 150 signed in, 90 s measured.
- 196 sign-ins (the first 150 and every reconnect): ticket and auth p50 53 ms, p95 57 ms.
- 147 reconnects (72 dropped, 75 closed), none failed: p50 1.03 s, p95 1.09 s.
- 551 chat lines, all accepted, heard 38,546 times: p50 5 ms, p95 24 ms. 20 lines were retried after a lost answer, and none was heard twice.
- 15 slow readers, all kept, all caught up. The server skipped 626 of their snapshots (15 backed up at once): each was sent 265-295 KB in its 15 s, against 321-379 KB unthrottled. The others kept getting 9.96 snapshots a second.
- 5 frozen clients, dropped after about 23 s.
- Server tick: average up to 25 ms, p95 28 ms typically and 47 ms in the worst window, worst tick 57 ms.
- Processor up to 40% of one core, event-loop delay p99 48 ms, memory 222 MB.
- The server sent up to 9,500 messages and 17.9 MB a second (147 Mbit/s). Each client was sent a median 14 messages and 21.7 KB a second.

The quick mode on the same machine: tick p95 1.6 ms, processor 5%, chat p95 5 ms, reconnect p95 1.08 s.

**Found by it:**
1. **`online` costs as much as movement when players come and go.** The overview (the count and up to 250 map dots, about 3.2 KB) goes to everyone in the city at once whenever someone joins or leaves, up to ten times a second, besides every 2 s. With about 3 joins or leaves a second (the churn above), it was 49% of all bytes sent: 1,600 messages and 5.2 MB a second, about as much as all the snapshots. Each client got about 3.2 of them a second instead of 0.5. That is about 10 KB/s more per client, and it grows with the crowd times the churn. A busy real city, with people arriving and leaving all the time, would see the same. The fix is small but changes what the clients see: send the immediate overview at most once a second per city, or send only the count at once and the dots on the 2 s timer. **Fixed:** the overview is now gathered to at most one a second per city ([below](#the-online-overview-gathered-2026-10-20)).
2. **Occasional tick spikes.** In one run of four, the worst 10 s window had a tick p95 of 90 ms and one tick took 121 ms; the typical window was 21 ms. The bots share the machine, so this may be the machine rather than the server: watch for it on a dedicated staging run.
3. **The presence agent's "stop reading" could start reading again by itself.** It paused the socket directly, and the `ws` library resumes a paused socket when its parser drains. A "frozen" client then kept answering pings and was never dropped. It now uses `ws.pause()`. The journeys' slow-receiver step uses the same agent.
4. **A line said just as a connection drops** (seen in the server's code while writing the retry check, not measured). If the presence server is still asking the API about it, the line is neither passed on nor remembered for the account. The retry on the new connection is then a new line, heard once, with a new message id; the API has kept both copies as evidence. Players see nothing wrong, and no budget catches it; it is noted here for the messaging plan.

### The online overview, gathered (2026-10-20)
The overview now goes to a city at most once a second (`OVERVIEW_MIN_MS` in the server), and still every 2 s otherwise. A join or leave after a quiet second is sent at once (the leading edge), so a lone arrival still shows promptly; any more in the next second are gathered into one overview at its end (the trailing edge). Everyone's count is at most about a second stale; the newcomer's own count comes in its `welcome`. Nothing in the protocol changed (no new message; the contracts and the clients are as they were), only how often `online` is sent. A count-only message sent at once was considered and not added: the protocol has none, and a second's delay on "N online" is not worth a new message type. `tests/multiplayer.test.mjs` checks that a burst of joins and leaves makes at most one overview a second, the first at once, and the count caught up a second later.

The full run before and after, on the same machine (as above) with the same settings:

| | Before | After |
| :--- | :-: | :-: |
| What the clients were sent, in all | 9.9 MB/s | 6.6 MB/s |
| The server's own figure (its busiest second) | 16.2 MB/s (133 Mbit/s), 9,200 messages | 7.1 MB/s (58 Mbit/s), 7,200 messages |
| Each client, median / busiest 5% | 20.7 / 26.3 KB/s | 14.0 / 19.4 KB/s |
| Share of the bytes that are `online` | 50% (4.9 MB/s) | 22% (1.5 MB/s) |
| `online` overviews per client | 3.1 a second | 0.93 a second |
| Server tick p95, typical / worst window | 34 / 52 ms (worst tick 103 ms) | 21 / 22 ms (worst tick 28 ms) |
| Processor; event-loop delay p99 | 55%; 60 ms | 34%; 41 ms |
| Slow readers: snapshots the server had to skip | 577 | 2 |
| Budgets | 18 of 18 | 18 of 18 |

Under constant churn a city still gets about one overview a second (twice the quiet rate): the price of a count never more than a second late. A second run after the change (with a quick run beside it on the same machine, so its server figures are noisier) measured 21.6 KB/s for the busiest 5%, `online` 20% of the bytes and 0.92 overviews per client a second, within every budget. The per-client budget is now 28 KB/s (19.4-21.6 measured, with room for a busier run), so the overview growing back would fail it.

## Bandwidth
Per client the stream is bounded (about 10 KB/s in a packed crowd) whatever the crowd size, because of the 40-player cap. What grows is the total: clients × about 10 KB/s. 100 players all walking in a crowd is 1 MB/s, about 2.6 TB a month if that were constant, against roughly 4 TB included with a 4 GB Linode. Real use is far lighter, but watch the transfer graph in the first busy weeks, and lower `MP_MAX_VISIBLE` (30 or 25) if you need to cut it: a screen rarely shows more than a couple of dozen avatars anyway.

## When one server is not enough
1. **Bigger machine.** Node runs presence on one thread, so a faster core helps; a dedicated-CPU Linode is the next step. The load test shows the ceiling: stay under about 50 ms average tick.
2. **Several cities on several servers.** Each city (its seed) is its own room. List the servers in `NEXT_PUBLIC_MP_URLS` (comma separated) and each city always goes to the same one (a hash of its name, `pickServer` in the client). Everyone in a city meets on one server.
3. **One city across several servers (not built).** If a single world ever has more than about a thousand people at once, the world itself would be cut into regions, each served by its own process, with players handed over at the borders and the nearest-neighbour lists spanning two servers. It is the usual design for this and a project of its own (a week or more); the protocol's `enter` / `exit` messages were chosen so it can be added without changing the client. Hosted realtime services (Colyseus Cloud, PartyKit, LiveKit) would take this over, at a price; they are not needed before step 2 runs out.

## Operating it
- Open file limits: each connection is a socket. The presence service unit in `deploy/systemd/` sets `LimitNOFILE=65536`; keep `MP_MAX_CLIENTS` below what the machine tests well at (default 1500; `deploy/env/presence.env.example` sets 1000).
- `MP_MAX_PER_IP` (default 20) stops one address from filling the server; people behind one office or school network share an address, so raise it if that matters to you.
- Chat adds calls to the API (`MP_API_URL`): each signed-in nearby line is checked there before it is passed on, and the signed-in connections are re-checked every `MP_RECHECK_MS` (30 s) in one call. The load test runs with the API, so it measures these (about 6 lines a second at 150 signed in).
- Caddy forwards WebSockets without extra settings (`deploy/Caddyfile`).
- Re-run the load test after any change to `services/multiplayer/server.mjs`. It prints a verdict against its budgets and needs no setup (it starts its own API and server): `npm run load:presence -- --full`. `--mp`/`--api` test a running stack: staging, never the live one (see above).

## Not done
Binary messages instead of JSON (another 2 to 3 times smaller); region sharding of one world (step 3 above); a compressed first-sight `enter` (it is the one large message when someone arrives in a crowd); a bandwidth budget per client that adapts to a slow link.
