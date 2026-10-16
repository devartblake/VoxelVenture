# Presence at scale (protocol 2)

How the presence server ([server/multiplayer.mjs](../server/multiplayer.mjs), client in [lib/net/multiplayer.js](../lib/net/multiplayer.js)) handles a crowd, what it was measured doing, and what to do when one server is not enough. Setup and settings are in [../server/README.md](../server/README.md) and [../deploy/README.md](../deploy/README.md).

## What changed
Protocol 1 sent every player to every client: a join told everyone in the city, a welcome listed the whole city, and every tick each client got a full position for every player within 120 units. Cost per client grew with the crowd, and the browser drew an avatar for everyone it had heard of.

Protocol 2 is interest management:
- **A client is told only about the players near it**, the nearest `MP_MAX_VISIBLE` (default 40) within `MP_VIEW_RADIUS` (120 units). They arrive as `enter` (a full record: name, outfit, parked cars), leave as `exit`, and in between only what changed is sent. Nobody moving means no messages at all.
- **Smaller messages.** A changed player is a short array, `[id, x, z, yaw, moving, emote, vehicle]` (about 25 bytes, a fifth of the old object).
- **Fewer updates for far players.** Within 40 units, ten a second; 40 to 80, five; beyond, two and a half. The client smooths between updates, so a distant walker still looks fluid.
- **A grid, not a scan.** Players of a city sit in a grid of view-radius cells, so finding who is near costs a few cells. Each client's neighbour list is refreshed every third tick (a walker covers about a metre in that time); movement still goes out every tick.
- **The count and the map.** `online` messages carry how many are in the city and up to 250 coarse dots (`[id, x, z]`) for everyone else, so the Online panel says "38 near you, 412 elsewhere" and the world map shows the distant players as dots. They go out at once when someone joins or leaves, and every two seconds otherwise.
- **Back-pressure** as before: a client whose connection is backed up is skipped until it catches up.
- `/status` now has a `load` block: time per tick against the 100 ms budget (average, 95th, worst), processor use, event-loop delay, bytes and messages a second, memory. The monitor page can show it; the load test reads it.

## Measured
`node scripts/load-test-presence.mjs --clients N`: pretend players walk about the city (a quarter stand still, 60% gather in four busy places, so most see a full 40). The bots and the server shared one development laptop, so the server is slightly worse off than on its own machine.

| Players | Each client receives | Server tick (average / 95th) | Processor | Verdict |
| :-: | :-: | :-: | :-: | :--- |
| 200 | 7.3 KB/s | 11 / 15 ms | 16% of a core | comfortable |
| 300 | 8.3 KB/s | 10 / 14 ms | 17% | comfortable |
| 600 | 10.3 KB/s | 26 / 32 ms | 33% | comfortable |
| 1000 | 10.0 KB/s | 68 / 93 ms | 89% | at the limit |

Before this work, 200 players in the same busy places cost each client about 44 KB/s and 68 Mbit/s in total; the same 200 now cost about 10 Mbit/s. The first profile showed the neighbour search itself was the server's main cost; making it numeric and refreshing it every third tick halved the tick time at 600 players (70 ms to 26 ms).

**Read this as a worst case.** A real crowd mostly stands, talks and looks; the test keeps three quarters of the players walking all the time. Expect real load well below these figures, and a dedicated server (no bots on the same machine) to hold more.

## Bandwidth
Per client the stream is bounded (about 10 KB/s in a packed crowd) whatever the crowd size, because of the 40-player cap. What grows is the total: clients × about 10 KB/s. 100 players all walking in a crowd is 1 MB/s, about 2.6 TB a month if that were constant, against roughly 4 TB included with a 4 GB Linode. Real use is far lighter, but watch the transfer graph in the first busy weeks, and lower `MP_MAX_VISIBLE` (30 or 25) if you need to cut it: a screen rarely shows more than a couple of dozen avatars anyway.

## When one server is not enough
1. **Bigger machine.** Node runs presence on one thread, so a faster core helps; a dedicated-CPU Linode is the next step. The load test shows the ceiling: stay under about 50 ms average tick.
2. **Several cities on several servers.** Each city (its seed) is its own room. List the servers in `NEXT_PUBLIC_MP_URLS` (comma separated) and each city always goes to the same one (a hash of its name, `pickServer` in the client). Everyone in a city meets on one server.
3. **One city across several servers (not built).** If a single world ever has more than about a thousand people at once, the world itself would be cut into regions, each served by its own process, with players handed over at the borders and the nearest-neighbour lists spanning two servers. It is the usual design for this and a project of its own (a week or more); the protocol's `enter` / `exit` messages were chosen so it can be added without changing the client. Hosted realtime services (Colyseus Cloud, PartyKit, LiveKit) would take this over, at a price; they are not needed before step 2 runs out.

## Operating it
- Open file limits: each connection is a socket. The presence service unit in `deploy/systemd/` sets `LimitNOFILE=65536`; keep `MP_MAX_CLIENTS` below what the machine tests well at (default 1500; `deploy/env/presence.env.example` sets 1000).
- `MP_MAX_PER_IP` (default 20) stops one address from filling the server; people behind one office or school network share an address, so raise it if that matters to you.
- Chat adds calls to the API (`MP_API_URL`): each signed-in nearby line is checked there before it is passed on, and the signed-in connections are re-checked every `MP_RECHECK_MS` (30 s) in one call. The load test connects as guests with no API, so it does not measure these.
- Caddy forwards WebSockets without extra settings (`deploy/Caddyfile`).
- Re-run the load test after any change to `server/multiplayer.mjs`; it prints a verdict and needs no setup (it starts its own server): `node scripts/load-test-presence.mjs --clients 600 --seconds 20`. `--url ws://host:3001` tests a running server (do that against a staging copy, never the live one).

## Not done
Binary messages instead of JSON (another 2 to 3 times smaller); region sharding of one world (step 3 above); a compressed first-sight `enter` (it is the one large message when someone arrives in a crowd); a bandwidth budget per client that adapts to a slow link.
