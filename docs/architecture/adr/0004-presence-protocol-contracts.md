# ADR 0004: Executable contracts for the presence protocol

- **Status:** accepted, 2026-10-17.
- **Context:** Track B of the [external voxel repositories adoption plan](../external_voxel_repositories_adoption_plan.md#7-implementation-track-b--realtime-protocol-contracts). It follows [ADR 0001](0001-shared-package-boundaries.md), whose versioned contracts cover the HTTP API.

## Context

The presence server (`services/multiplayer/server.mjs`) and the game (`lib/net/multiplayer.js`) speak protocol 2 over WebSockets: JSON messages, each with a `type`.

- **Where the shapes live today:** they were written down in [presence_scale.md](../presence_scale.md) and in the two files' comments, and nowhere else. Nothing stopped a change on one side from breaking the other, or the protocol from gaining a message the other side did not know.
- **How the server checks them:** it clamps every field it reads (types, ranges, lengths). That is safe, but it says nothing about what the other side expects.
- **What's missing:**
  - no version check: the game sends `v: 2` in its `hello`, and nothing read it;
  - a malformed `hello` was cleaned up silently instead of being refused.

## Decision

### Contracts, one per message type

- **Where:** `packages/shared-types/src/contracts/multiplayer-client-v2.js` (`PRESENCE_CLIENT`, what a game sends: 10 types) and `multiplayer-server-v2.js` (`PRESENCE_SERVER`, what the server sends: 15 types).
- **Form:** each is `{ id: 'presence.client.<type>' | 'presence.server.<type>', version, schema }`, in the same JSON-Schema subset as the API's contracts, and they are part of `CONTRACTS`.
- **The helper:** `presenceContract(from, message)` finds the contract of a message.
- **Two validator additions:** the snapshot entries are fixed-position arrays (`[id, x, z, yaw, moving, emote or 0, vehicle or 0]`), so the validator gained JSON Schema 2020-12's `prefixItems` and `anyOf`. Other JSON-Schema tools can still read the schemas.
- **Fields not listed are allowed.** An older server must not refuse a newer client's extra field.

### How strictly each side is held

| Messages | Checked | Why |
| --- | --- | --- |
| `hello`, `auth`, `auth.clear` (marked `strict`) | Against the contract, as they arrive. A `hello` that does not fit gets `invalid` (`{ of, errors }`) and is not welcomed. An `auth` without a ticket gets `auth.failed` / `bad_request`, and the API is not asked | Once per connection; they decide who the connection is |
| Everything else (`state`, `chat.send`, `perf`, …) | By the server's existing clamping | Up to 60 a second per client. A full check would cost more than it adds, and the clamping already keeps the server safe |
| Everything the server sends | In the tests | A shape change fails CI |

The free-text lengths, such as a player's name, are not limited by the strict contracts: the server keeps trimming them. A long saved name must never stop a player connecting.

### Versioning

- **One version number:** the server's `PROTOCOL` is `PRESENCE_PROTOCOL` from the package (2), so the server, the contracts and the tests read the same number.
- **Another version:** a `hello` with a different `v` gets `protocol.unsupported` (`{ protocol, supported, message }`), and the connection closes with code 4002. The game then stops reconnecting, sets its status to `outdated`, and the panel and chat tell the player to reload the page.
- **No version:** a `hello` without `v` is taken to be protocol 2, so older tools (the load test, the test harnesses) keep working.
- **Changing the protocol:**
  - adding an optional field, or a message type a client can ignore, keeps protocol 2;
  - a change an old client cannot follow bumps `PRESENCE_PROTOCOL`, with the contracts.

  Either way the change is written in `packages/shared-types/CHANGELOG.md`.

### Tests

- **`tests/presence-contracts.test.mjs`:**
  - **Golden examples:** every contract has examples in `tests/fixtures/presence-v2.json` that fit it, and the broken examples fail.
  - **A real presence server:** every message it sends during a scripted run fits its contract (23 messages, 10 types).
  - **Strictness and versions:** a `hello` that does not fit is answered `invalid`; another version is answered and closed; a `hello` without `v` is welcomed.
  - **Source parity:** the client sends exactly the protocol's 10 types and handles all 15 server types, and the server writes exactly those 15.
- **`tests/messaging.test.mjs`:** with the API and signed-in players, holds every presence message to the contracts (113 messages, including `auth.ok`, `auth.revoked` and `inbox.changed`).
- **The load test:** 500 clients, before and after, show no regression (average tick 22.28 ms on `main`, 21.65 ms after). Only the once-per-connection messages are checked against the contracts.

## Consequences

- **Gained:** the protocol is defined once, in code, for both sides and the tests, and a drift on either side fails CI. A game from an older release is told to reload instead of retrying forever against a server it cannot talk to.
- **Not done:** no transport change. JSON stays; Protocol Buffers are not needed for this, as the plan says.
- **Next:** Track A's presence agents (reconnects, slow receivers, stale versions) will build on these contracts.
- **Since (Track A, 2026-10-17):** the presence agent in `tests/agents/presence-agent.mjs` checks every message it receives against these contracts. The `reconnect-and-recovery` journey uses it, and it found one defect. A nearby chat line retried with the same `id` after a reconnect was said a second time, because the server remembered its answers per connection only. The server now also remembers them per signed-in account for five minutes, so the retry gets `chat.accepted` again and nothing is repeated. No message shape changed.
