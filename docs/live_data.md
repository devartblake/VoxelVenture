# Live data: what needs a server

Written for: whoever builds the database and API. Everything below is shown in the game today as a **simulated** figure (labelled as such) and comes through one switch, `lib/data/liveData.js`. Set `NEXT_PUBLIC_LIVE_API_URL` and the live provider asks your server for it, falling back to the simulated figure if a call fails. Responses use the same shapes the simulated provider returns (`lib/game/plotInfo.js`).

| Field (id in `LIVE_FIELDS`) | Where it shows | Endpoint | Needs |
| :--- | :--- | :--- | :--- |
| `plot.visits` | directory, building card, Step inside | `GET /plots/{id}/stats` | a visit event when a player enters a building |
| `plot.siteStats` | Site visits (30 days: visits, visitors, clicks, click rate, hours, days, sources) | `GET /plots/{id}/stats` | page-view and website-click events with a source tag |
| `plot.history` / `plot.owners` | Building history, Owners | `GET /plots/{id}/history` | the ownership ledger |
| `plot.value` | value, rank, directory order | `GET /plots?sort=value` | authoritative prices (the 1.25x take-over rule on the server) |
| `directory` | the Directory (opening view) | `GET /plots?built=1&sort=value` | the plots table: title, logo, description, website, value, visits |
| `world.online` | Online count, Statistics | `GET /world/stats` | presence from the multiplayer server |
| `plot.ownership` | claim and take over | `POST /plots/{id}/claim` | accounts, payments, an atomic claim |

The local player's own visits and website clicks are recorded in the browser (`activity`) and added on top of the simulated figures; with a server they become the events above.

**Status:** the server side of this table exists (`server/api`, [backend.md](backend.md)): stats, history, the directory and claiming. With `NEXT_PUBLIC_LIVE_API_URL` set the game uses it (task 5): ownership and ad slots come from `GET /plots/state` (`lib/data/sync.js`), claims and take-overs go through the server, visits and clicks are sent as events, and the Statistics panel reads `GET /stats/overview`. Not switched yet: the building card's visits, site statistics and history still come from the simulated provider (the live provider has `fetchPlotStats`, `fetchPlotHistory` and `fetchDirectory`, but nothing calls them). Chat and private messages have no simulated version: the inbox, owner messages and signed-in nearby chat use the server (`lib/data/messaging.js`, the `/messaging/*` and `/conversations` routes in [backend.md](backend.md)); without it only guest nearby chat on a LAN works.
