# Multiplayer and client monitor server

A small WebSocket server (`multiplayer.mjs`) for playing on the same Wi-Fi and for seeing what each device is doing.

```
npm run dev:all     web app (open to the LAN) + this server, prints the address to open on a phone
npm run mp          this server only
```

Phones open `http://<pc-ip>:3000`; the page finds this server on the same machine, port 3001.
Without the server the game works solo.

## What it does

- **Presence.** Players in the same city (same seed) see each other's avatars. Each city is its own room.
- **Diagnostics.** Every client reports its device (browser, screen, touch), frame rate, draw calls and triangles,
  and every error it hits (window errors, unhandled rejections, `console.error`, failed resource loads).
- **Monitor.** `http://localhost:3000/admin` shows it live. The same data is JSON at `http://<pc>:3001/status`;
  `/health` is a liveness check.
- **Error log.** Errors are appended to `server/logs/client-errors.jsonl` (one JSON object per line). Past
  2 MB it rotates to `client-errors.jsonl.1`.
- **No network addresses are kept.** The log, the console, `/status` and `/admin` show `net`, a salted hash of the address (`sha256(IP_SALT|address)`, 16 hex characters), the same form the API keeps. Set the same `IP_SALT` in `presence.env` as in `api.env` so the two agree. The per-address connection cap compares these hashes.
- **Chat.** Players near each other can talk (within `MP_CHAT_RADIUS`). With the API set up (`MP_API_URL`), a signed-in game hands this
  server a one-use ticket and the API says which account it is: from then on the connection speaks as that account (its name and a
  verified mark come from the account, never from the client). Every line a signed-in player says goes through the API first (the word
  filter, the account's budget, blocks both ways, and a week-long copy for reports); if the API cannot be reached the line is refused,
  never let through. The API also sends "your inbox changed" notices here, and they go only to that account's connections
  (`POST /notify-accounts`). See [../docs/architecture/chat_messaging_plan.md](../docs/architecture/chat_messaging_plan.md).

## Settings (environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `MP_PORT` | 3001 | port to listen on |
| `MP_HOST` | 0.0.0.0 | address to listen on (every network interface) |
| `MP_MAX_CLIENTS` | 1500 | most connections at once |
| `MP_MAX_PER_IP` | 20 | most connections from one address |
| `IP_SALT` | voxelventure | salt for the scrambled network address; use the API's value |
| `TRUST_PROXY` | off | `1`: take the address from `X-Forwarded-For` (behind Caddy; otherwise every player is 127.0.0.1) |
| `MP_VIEW_RADIUS` | 120 | a player is only told about others within this many units |
| `MP_MAX_VISIBLE` | 40 | and at most this many of them (the nearest) |
| `MP_CHAT_RADIUS` | 60 | how far a chat message carries |
| `MP_NOTIFY_SECRET` | (off) | the secret this server and the API share: the API's `POST /notify` and `/notify-accounts`, and this server's calls to the API's `/internal/messaging` routes |
| `MP_API_URL` | (off) | the API, e.g. `http://127.0.0.1:3002`: signed-in chat, blocks and reports (needs `MP_NOTIFY_SECRET`) |
| `MP_CHAT_GUESTS` | 1 without `MP_API_URL`, else 0 | whether players who are not signed in may chat (1 only on a trusted LAN) |
| `MP_CHAT` | 1 | 0 switches chat sending off (it stays readable) |
| `MP_ORIGINS` | (any) | the web pages allowed to connect, comma separated (a browser sends its page's origin; programs without one are let in) |
| `MP_RECHECK_MS` | 30000 | how often signed-in connections are checked again (signed out, expired, banned) |
| `MP_LOG_MAX_BYTES` | 2000000 | size at which the error log rotates |
| `MP_LOG_DIR` | `server/logs` | where the error log goes |

The page side reads `NEXT_PUBLIC_MP_URL` (a full `ws://` address) to use another server, `NEXT_PUBLIC_MP_URLS` (several, comma separated: each city
always goes to the same one) to spread cities over servers, and `?mp=PORT` in the page address to use another port on the same machine.
The `/admin` page reads `/status` from port 3001 on the same machine, or from `NEXT_PUBLIC_MP_HTTP` (a full address; in production the password-protected `/mp-status`, see `deploy/Caddyfile`).

## Protocol (version 2)

JSON messages. Client to server: `hello` (name, outfit, city, device, protocol `v`), `state` (position, heading,
moving, emote, and `veh` when in a car or boat: kind, boatKind, colour), `parked` (up to three cars left parked), `chat.send`, `chat` (the old form, no answer),
`auth` / `auth.clear`, `profile` (name and outfit), `perf` (fps, draw calls, triangles), `error`. Server to client: `welcome` (your id, how many are in the city,
protocol, and `features`: chat version, whether accounts and guest chat are on, the longest line, the chat radius), `snapshot`, `online`, `parked`, `profile`,
`chat`, `chat.accepted` / `chat.rejected`, `auth.ok` / `auth.failed` / `auth.revoked`, `inbox.changed`, `world`.

Chat, in protocol 2 (an older client that sends `chat` still works where guests may chat):
- `chat.send` is `{ clientMessageId, channel: 'nearby', text }`. The answer is `chat.accepted { clientMessageId, messageId, at }` (the line went out:
  not that anyone read it) or `chat.rejected { clientMessageId, code, message, retryAfterMs? }` with code `unauthenticated`, `rate_limited`, `content_rejected`,
  `empty` or `unavailable`. Sending the same `clientMessageId` again after it was accepted repeats the answer and says nothing twice; after a refusal it is
  tried again (Retry).
- `chat` (what the players in range receive) is `{ id, messageId, name, account, verified, text, x, z, at }`: `id` is the speaker's connection, `messageId` the
  line (`n…` from the API, which a report names; `g…` for a guest's line, which is not kept), `account` the speaker's account id when `verified`.
- `auth` is `{ ticket }` (from the API's `POST /messaging/ticket`; a ticket works once, within a minute, and never goes in an address). `auth.revoked`
  says why the binding ended: `signed_out` or `expired` (signed out elsewhere, the sign-in ran out, or a ban).
- `inbox.changed` is `{ eventId, conversationId }`: only a nudge to fetch from the API; it never carries a message.
- `enter` and `profile` records carry `account` and `verified` too.

A client only hears about the players **near** it (the nearest `MP_MAX_VISIBLE` within `MP_VIEW_RADIUS`):
- `snapshot` is `{ players, enter, exit }`: `enter` holds full records of players who came into view (name, outfit, position, parked cars), `exit` the ids who left it,
  and `players` the changed ones as short arrays `[id, x, z, yaw, moving, emote or 0, vehicle or 0]`. Nobody moving means nothing is sent. Players far away are updated
  less often (10, 5 or 2.5 times a second by distance).
- `online` is `{ n, dots }`: how many are in the city, and up to 250 coarse `[id, x, z]` dots for the world map. Sent when someone joins or leaves, and every two seconds.
- `parked` and `profile` go only to the players who can see the one concerned.
Everything from a client is validated: numbers are clamped, strings are cut and stripped of control characters, messages are size- and rate-limited.
How it was measured and how to scale it: [../docs/architecture/presence_scale.md](../docs/architecture/presence_scale.md).

## Load handling

- Players of a city sit in a grid of view-radius cells; each client's neighbours are found from a few cells and refreshed every third tick.
- A client is told about at most `MP_MAX_VISIBLE` players, and only what changed; it is skipped for a client with more than 64 KB waiting to send, so a slow phone cannot stall the
  rest or grow the server's memory.
- Per client: 60 messages a second and 16 KB a message; total and per-address connection caps; 5 s heartbeats drop
  silent connections after 20 s.
- `/status` has a `load` block (time per tick, processor use, event-loop delay, bytes a second, memory), and `node scripts/load-test-presence.mjs --clients 600` runs a
  load test with pretend players.

## Limits

`/status` shows every client's address and errors and has no login: on the internet put it behind a password (see `deploy/Caddyfile`) and keep `/notify` and
`/notify-accounts` private. Presence is who is where and what they say nearby; plots, claims, statistics, accounts and private messages are the API's (`docs/architecture/backend.md`).
Positions come from the clients, so "nearby" keeps chat in its place but does not prove where someone is: never use it for rewards.
With several presence servers (`NEXT_PUBLIC_MP_URLS`), the API's `MP_NOTIFY_URL` reaches one of them: inbox nudges reach only players on that one (the others
still see new messages within half a minute, when their game polls).

## Tests

`npm test` runs the protocol test (`tests/multiplayer.test.mjs`) and the chat test (`tests/messaging.test.mjs`: signed-in identity, nearby chat, blocks,
reports, bans, the inbox, business inquiries, retention) with the rest; `npm run test:browser` also loads the real page in a headless browser against a
server it starts itself, and `tests/live-browser.test.mjs` chats between two signed-in pages.
