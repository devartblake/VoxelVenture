# Messaging service (Python, FastAPI)

The persistent messaging domain (the Inbox, message requests, read positions, blocks, chat reports, the checks and evidence for
nearby chat, retention and "your inbox changed" notices), as its own service. This is the first step of
[../../docs/node_fastapi_architecture_plan.md](../../docs/node_fastapi_architecture_plan.md): the Node API keeps accounts,
sign-ins, plots, businesses and the presence server; this service owns messages.

It is a port of `server/api/messaging.mjs` with the same routes, bodies and error shapes, so the game and the presence server work
with either. **Today the Node API still serves messaging itself**; this service takes over only when the Node API is given
`MESSAGING_SERVICE_URL` (then it forwards the messaging routes here and stops its own messaging jobs). The switch-over steps are in
`deploy/README.md`.

## Run it

```
npm run messaging:setup     once: makes services/messaging/.venv (Python 3.11+, 3.13 here) and installs requirements.txt
npm run messaging           port 3003
```

and start the Node API with `MESSAGING_SERVICE_URL=http://localhost:3003` and the same `INTERNAL_SECRET` on both.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MESSAGING_PORT` / `MESSAGING_HOST` | 3003 / 127.0.0.1 | where it listens |
| `MESSAGING_DB` | `services/messaging/data/messaging.db` | its SQLite database (or `:memory:`) |
| `NODE_API_URL` | `http://127.0.0.1:3002` | the Node API: sign-ins, accounts, bans, plot owners |
| `INTERNAL_SECRET` | (none) | the credential this service and the Node API use with each other; the presence server's nearby calls come through the Node API with it |
| `MP_NOTIFY_URL` / `MP_NOTIFY_SECRET` | (off) | the presence server's `/notify` and its secret: notices go to `/notify-accounts` beside it |
| `ADMIN_TOKEN` | (off) | the moderators' queue for chat reports |
| `API_ORIGIN`, `TRUST_PROXY` | `*`, off | as for the Node API |
| `MESSAGING_*` | as the Node API | switches (`MESSAGING_NEARBY`, `MESSAGING_INBOX`, `MESSAGING_INQUIRIES`), limits and retention days |
| `MESSAGING_JOBS` | 1 | 0: no background notices or pruning |

## How it fits with Node

- **Who is asking.** Every request's bearer token is checked with the Node API (`POST /internal/identity/session`); signing out and
  bans apply at once. A nearby line's sender comes from the presence connection's binding, also asked of the Node API each time.
  This service never takes an account id from a browser.
- **Plots.** An inquiry asks the Node API who owns the building and its ownership version (`GET /internal/plots/{id}/owner`), checks
  again just before saving, and refuses with `owner_changed` if the building changed hands in between. There is no transaction
  across the two databases; the conversation records the owner and version it was sent to.
- **Bans.** A moderator's `ban` on a chat report asks the Node API to ban the account (global bans are Node's).
- **Tickets** for the presence server stay with the Node API (they are part of signing in).
- **Notices** are written with the message (same transaction), then handed to the presence server, retried with back-off, and marked
  dead after eight failures. Without a presence server the game polls.
- If this service is down, the Node API answers its routes with `503 unavailable`; the city and every business feature carry on.

## Routes

The same as the Node API's messaging routes (see `docs/backend.md`): `/conversations...`, `/messaging/summary|settings|blocks|reports`,
`/plots/{id}/inquiries`, `/internal/messaging/nearby`. Also `/health` (with the outbox counts) and, with `ADMIN_TOKEN`:
`/admin/reports`, `/admin/reports/ids`, `/admin/reports/{id}/resolve` (the same shapes as the Node API's, so `npm run moderate` with
`MESSAGING_URL` set lists and decides chat reports), `/admin/messaging/prune` and `/admin/messaging/deliver`.

## Moving the data

`python -m app.migrate_from_node --node-db <backup of voxelventure.db> --messaging-db data/messaging.db` copies conversations,
members, messages, blocks, request settings, nearby evidence, chat reports, pending notices and account names, keeping every id. It
refuses to write into a database that already has messages, and checks the copy against the source (exit 1 if anything differs).
`--dry-run` checks without writing.

## Tests

- `tests/messaging-fastapi.test.mjs` runs the whole messaging contract (`tests/messaging.test.mjs`, about 70 checks across the
  Node API, the presence server and this service) against this service, then the unit tests here.
- `tests/messaging-migrate.test.mjs` rehearses the move: history made on Node, copied, then every player must see exactly the same
  through this service, and retries, new ids, reports and tickets must carry on.
- `tests/` here (`python -m unittest discover -s tests -t .`): the text checks give the same answers as the JavaScript ones,
  retention, the outbox when the presence server is down, and an inquiry racing a take-over.

Packages are pinned in `requirements.txt`, each at least two weeks old when chosen (October 2026).
