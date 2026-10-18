# Going live: hosting, stack, payments and the owner dashboard

Answers to the questions raised while planning task 1 in [tasks.md](../roadmap/tasks.md) (go live). Prices and rates are approximate and from memory: check the providers' pages before you commit.

## 1. Which stack: stay on Node

**Recommendation: keep the server in Node.** Do not rewrite it in Python or .NET.

> **Since then (October 2026):** a later plan, [node_fastapi_architecture_plan.md](../architecture/node_fastapi_architecture_plan.md), splits out one bounded piece, persistent messaging, into a Python (FastAPI) service beside Node, while accounts, plots, businesses and presence stay in Node as recommended here. The service is built and tested (`services/messaging`) but not switched on; the deploy files install it alongside the Node processes.

### Why
1. **The server shares code with the game.** `services/api/core.mjs` imports the game's own city generator and builds the world from `API_SEED`, and it reuses the rules in `lib/game/` (leases, skyline, voting, ad rotation). A port would have to reproduce the seeded generator (about 3,000 lines of deterministic code) exactly, or plot ids and positions would stop matching the browser and claiming would break. Every rule would also exist twice, and each change would have to be made twice.
2. **It is already built and tested.** About 3,000 lines of server (`services/api/*.mjs`, `services/multiplayer/server.mjs`) and the API, community, market, engagement, statistics, moderation, messaging and multiplayer suites.
3. **One language, one pipeline.** Next.js, the API and the presence server are all Node: one build, one lint, one test run.
4. **The workload is ordinary.** REST plus SQLite, and a WebSocket loop sending a few hundred bytes per player. Node handles that well.

### When Python or .NET would win
| Option | Strong at | Verdict here |
| :--- | :--- | :--- |
| **.NET** (ASP.NET Core + SignalR) | Large realtime systems, strong typing, teams that already use it | The right choice if you had a .NET team and no server. Here it costs a rewrite and duplicated rules. |
| **Python** (FastAPI) | Data, analytics, machine learning | Weaker for a 10 Hz realtime loop, and the same duplication problem. |

### What would change this
- Your team being much stronger in .NET or Python than in JavaScript.
- Presence outgrowing one Node process: then rewrite only the presence server (Go, .NET or similar).
- Compliance or payment tooling that one stack provides and the others do not.

### Can Python still be used? Yes, alongside Node
The Python in these docs is not for the live server:
- **Street names from OpenStreetMap** ([study_world_streaming.md](../world/study_world_streaming.md)): an offline script, run once on your machine, that writes a names file the game ships.
- **Hosted WASM game demos** ([scope_assets_and_wasm.md](../roadmap/scope_assets_and_wasm.md)): these run in the visitor's browser. Studios compile their own games to WebAssembly; Pyodide runs Python in a page if someone wants that. The server only stores and serves the files.
- Other good uses: asset build scripts, scheduled reports reading the database, a moderation or machine-learning check called over HTTP.

Avoid Python in the live game loop (accounts, claims, presence): that is where the shared JavaScript rules and generator live.

## 2. Linode setup

### Two facts about the current server
- **SQLite is a single-writer design.** `services/api/db.mjs` uses `node:sqlite` with synchronous calls and `BEGIN IMMEDIATE` transactions, which is what makes a claim atomic. Run **one** API process on **one** machine.
- **`node:sqlite` is still marked experimental.** `deploy/setup.sh` installs Node 22, and the API's service file (like `npm run api`) passes `--experimental-sqlite --no-warnings`; older Node 22 releases need the flag, and Node 24 (the development machine) runs it without one. `better-sqlite3` has the same synchronous style, so a move would be a small change, but it was tried and dropped (see Deployment files below).

Moving to Postgres is a later step and not a one-line change: the schema is portable, but the code is synchronous, so the API would have to become async. Do it only when you need more than one API machine.

### Launch: one Shared CPU 4 GB Linode (about $24/mo)
Everything on one machine:
- **Caddy**: automatic HTTPS certificates and the reverse proxy (the bare domain for the game, `api.`, and `play.` for the presence `wss://` address).
- The **Next.js** app (`next start`).
- The **API** (port 3002).
- The **presence server** (port 3001).
- **SQLite** on local disk.

Around it:
- **Backups:** Linode Backups, plus nightly database copies to Object Storage (about $5/mo; Litestream does this well for SQLite).
- **Cloud Firewall (free):** allow 80 and 443 to everyone, SSH only from your own IP; SSH keys only.
- **systemd units** (or Docker Compose) with `Restart=always`.
- **Region:** the one nearest most of your players.
- **Environment:** `ADMIN_TOKEN`, `IP_SALT` (secrets), `API_ORIGIN` set to your site, `TRUST_PROXY=1` (so the proof-of-human check reads the real visitor address behind Caddy), `API_DB` and `API_SEED` as in [backend.md](../architecture/backend.md). For chat, the same `MP_NOTIFY_SECRET` on the API and presence, `MP_API_URL` and `MP_ORIGINS` on presence (see [../deploy/README.md](../../deploy/README.md)).

### Growth path
1. **Move up a size** when CPU or memory runs hot (Dedicated CPU 8 GB is about $72/mo).
2. **Split presence onto its own Linode** when it becomes the busiest part: it holds players in memory per city room.
3. **Managed Postgres** only if you need two API machines.
4. **A CDN or Object Storage** for `apps/web/public/items` (144 furniture folders) and the models, to take load off the box.

**Bandwidth is the number to watch**, more than CPU: presence sends each player a snapshot of nearby players about ten times a second, and a Shared 4 GB plan includes roughly 4 TB a month. These are estimates: measure with the client monitor (`/admin`) before launch.

### Deployment files
In [../deploy/](../../deploy/README.md):
- a `Caddyfile`;
- systemd units for the three processes;
- settings templates;
- a first-time `setup.sh` and a nightly `backup.sh`;
- the runbook;
- staging (`staging.sh`, [STAGING.md](../../deploy/STAGING.md));
- `production.sh`, production on releases: a deploy builds while the live release serves, switches in a second and switches back by itself;
- `build-web.sh`, and `push.ps1` for deploying from Windows.

The `better-sqlite3` swap was tried and dropped: its native build crashed on the development machine, so test it on the Linode itself if you want it.

### What is set up (2026-10-18)
voxelventure.app has been live on a Shared CPU 4 GB Linode since 2026-10-17, as described above. Staging, at staging.voxelventure.app, runs beside it.

| Item | State |
| --- | --- |
| Caddy, Next.js, the API, presence and SQLite on one machine | ✅ `verify:live` passes all 17 checks |
| systemd units with `Restart=always` | ✅ |
| Deploys on releases | ✅ Since 2026-10-18 (`deploy/production.sh`). Each deploy builds while the live release serves, backs up, and switches in a second; it switches back by itself if the release does not answer. A rollback takes 2.2 s, rehearsed on production |
| Environment and secrets | ✅ Checked by `check:env` and by the API at start. The admin token has been changed twice since launch, after it was printed on screen |
| Nightly database copies on the machine | ✅ `voxelventure-backup` at 03:15 into `/var/backups/voxelventure`, kept 14 days. A restore is proven ([STAGING.md](../../deploy/STAGING.md#rehearsal-log)) |
| Off-site copies (Object Storage) | ✅ Since 2026-10-18. Each nightly copy is uploaded to the Linode Object Storage bucket `voxelventure-backups` with rclone. The remote is in `/etc/voxelventure/rclone.conf` (readable by `voxel`, which runs the backup), and `backup.env` sets `RCLONE_REMOTE` and `RCLONE_CONFIG`. The 03:15 run is checked uploading. To run rclone by hand, name the file: `rclone --config /etc/voxelventure/rclone.conf lsl linode:voxelventure-backups` ([deploy/README.md](../../deploy/README.md)). The bucket is pruned after `RCLONE_KEEP` days (30) once the server's installed `voxelventure-backup` is refreshed from `deploy/backup.sh` |
| Linode Backups | ✅ Turned on in the Linode dashboard by the owner (2026-10-18) |
| Error reporting, uptime checks and alerts | Built ([MONITORING.md](../../deploy/MONITORING.md)). **Sentry is on** for production and staging (2026-10-18): `SENTRY_DSN` is in all six settings files, and a test error from each stack was accepted. **Uptime checks (UptimeRobot)** are in the owner's account: they check from outside, so the server cannot show them. **Left:** the nightly backup's heartbeat, `HEALTHCHECK_URL` in `/etc/voxelventure/backup.env` (Healthchecks.io) |
| Firewall | ✅ `ufw` on the machine allows only SSH, 80 and 443. The owner added the Linode Cloud Firewall in front of it (2026-10-18) |
| SSH keys only | ✅ Since 2026-10-18 (`/etc/ssh/sshd_config.d/00-keys-only.conf`): `PasswordAuthentication no`, `PermitRootLogin prohibit-password`. A password attempt is refused, and the deploy key signs in. Keep a copy of the private key somewhere safe. Without it, the way in is the Linode LISH console |
| Bandwidth and load measured with the monitor (`/admin`) | The monitor is ready: `/admin` has its password (a `caddy hash-password` hash, 2026-10-18). Measuring under real traffic waits for the pilot |
| Payments | Built (section 3). **Test mode certified on staging** (2026-10-18): `npm run verify:stripe`, 33 of 33. It covers checkout, signed webhooks, an event delivered twice applied once, refunds from Stripe and from the admin route, a Pro renewal on a test clock, and reconciliation. **Left:** the live key on production once the policies are approved. [STRIPE_LIVE.md](../../deploy/STRIPE_LIVE.md) has every step |
| Email | ✅ The Resend key and `MAIL_WEBHOOK_URL` are set on production (2026-10-18); confirm by sending yourself a sign-in code. Staging never sends email (`deploy/staging.sh` refuses a mail service there) |

## 3. Payments: Stripe or PayPal

**Decided and built:** Stripe Checkout, without a PayPal button for now ([billing.md](../monetization/billing.md)). The comparison below is kept for the record. Two of its suggestions were not taken:

- Gold and Credits are never sold for money.
- Nobody is paid out on a take-over, so Stripe Connect is not needed ([takeover_payouts.md](../monetization/takeover_payouts.md)).

Market stalls ($2 to $5) are charged one by one; Stripe's fixed fee is the price of keeping money out of the game's currency.

US rates as I know them (check both sites for your country):
| | Typical card payment | Micropayments (under $10) |
| :--- | :--- | :--- |
| **Stripe** | about 2.9% + 30¢ | no special rate |
| **PayPal** | about 3.49% + 49¢ | about 5% + 5¢ |

- For normal sales the rates are close.
- For the **$2 to $5 pop-up stalls** the fixed fee dominates. On a $3 stall Stripe takes about 12.9% and PayPal's micropayment rate about 6.7%. The best fix for either is to **sell Gold or Credits in $5 to $10 bundles** and let people spend them on stalls, so no per-stall fee applies.
- **Recommendation: Stripe as the main processor.** Add a PayPal button as a second option if your audience asks for it. (Stripe Connect would fit paying the previous owner their 1.25x on a take-over, but that payout was decided against.)
- **Taxes and VAT** add complexity with either. A merchant-of-record service (Lemon Squeezy or Paddle) handles that for a slightly higher fee.
- Stripe also has a Node SDK, so payments do not change the stack decision.

## 4. The owner dashboard

Until this was added, owners had an Account page (email notices, sign-ups, Credits wallet) and a card for each building; there was no single place to see everything they own.

**My businesses** (toolbar icon, and it opens by itself right after you claim, take over or rent a building) now shows:
- Every building you own, including rented mall stores: views, visitors, website clicks, click rate and time inside over 30 days.
- Offers (coupon, visit reward, video, game demo) and lease state.
- A six-step set-up checklist: write a description, design the inside, add a coupon, add a visit reward, add a video or game demo, link your website.
- Buttons: open the card, design the inside, show on the map.
- Totals, and a CSV download of the figures.

Without a game server the visitor figures are simulated and the dashboard says so; with a server they count verified human visits only.

It also lists the ad spaces you hold (billboards and aerial banners) with their views and clicks, and each building shows its visits over the last fourteen days as small bars. Code: `lib/game/dashboard.js`, `apps/web/components/ui/panel/DashboardView.jsx`, `tests/dashboard.test.mjs`.
