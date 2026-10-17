# Deploying VoxelVenture to a Linode

A runbook for one server running everything: the web app, the API and the presence server, with Caddy in front for HTTPS. The reasoning behind the choices is in [../docs/operations/hosting_stack_payments.md](../docs/operations/hosting_stack_payments.md). These files have not been run on a real server yet: do the first deployment on a throwaway Linode and read each step before you run it.

| File | What it is |
| :--- | :--- |
| `setup.sh` | First-time setup of a fresh Ubuntu 24.04 server: Node 22, Caddy, SQLite tools, Python with the messaging service's environment, the `voxel` user, the services, the firewall, nightly backups |
| `Caddyfile` | HTTPS and the reverse proxy for the three addresses |
| `systemd/*.service` | The three processes, restarted automatically, and the messaging service (installed, not enabled until the switch-over below) |
| `env/*.env.example` | The settings for each process (copied to `/etc/voxelventure/`) |
| `backup.sh` | A consistent copy of the database (and the messaging service's, once it has one), kept for 14 days, optionally uploaded with rclone |
| `staging.sh`, `Caddyfile.staging`, `systemd/staging/` | Staging on the same machine: the business journeys, deploy and rollback rehearsals, restoring a production backup ([STAGING.md](STAGING.md)) |

The files are filled in for **voxelventure.app** (the game), **api.voxelventure.app** (the API) and **play.voxelventure.app** (presence), with `www.voxelventure.app` and `voxelventure.net` redirecting to the game. Only the secrets are left as `CHANGE_ME`.

## What you need first
- A Linode (Shared CPU 4 GB to start, about $24 a month) running Ubuntu 24.04, with your SSH key and Backups switched on (about $5 a month). Note its IPv4 address (and IPv6, if you want AAAA records too).
- The DNS records below, made at GoDaddy (Domain > DNS > Add New Record), each pointing at the Linode. Make them before step 5: Caddy asks for the certificates as soon as it starts.
- A Cloud Firewall in the Linode dashboard: allow 80 and 443 to everyone and SSH (22) from your own address only.

### DNS at GoDaddy

| Domain | Type | Name | Value | What for |
| :--- | :--- | :--- | :--- | :--- |
| voxelventure.app | A | `@` | the Linode's IPv4 | the game |
| voxelventure.app | A | `api` | the Linode's IPv4 | the API |
| voxelventure.app | A | `play` | the Linode's IPv4 | presence (WebSockets) |
| voxelventure.app | A | `www` | the Linode's IPv4 | redirects to voxelventure.app |
| voxelventure.net | A | `@` | the Linode's IPv4 | redirects to voxelventure.app |
| voxelventure.net | A | `www` | the Linode's IPv4 | redirects to voxelventure.app |

- Delete GoDaddy's default "Parked" `@` A record and any `www` CNAME first, or the new ones conflict.
- Do not use GoDaddy's own "Forwarding" for voxelventure.net: Caddy does the redirect, with HTTPS. Without the `.net` or `www` records, remove those names from the last block of the `Caddyfile`.
- `dig +short api.voxelventure.app` (or https://dnschecker.org) shows when a record has spread; usually minutes, at most a few hours.
- Optional: the same records as AAAA with the Linode's IPv6.

### Email
- **Your inbox** (hello@voxelventure.app), e.g. Zoho Mail's free plan: add the domain there and copy the MX, SPF (TXT) and DKIM (TXT) records it shows into GoDaddy's DNS for voxelventure.app.
- **The game's own mail** (sign-in codes, notices, receipts) through Resend: add voxelventure.app at resend.com, copy its DNS records (on a `send` subdomain, so they do not clash with Zoho's), wait until it says verified, then in `api.env` uncomment `MAIL_FROM`, `MAIL_WEBHOOK_URL=https://api.resend.com/emails` and put the API key in `MAIL_WEBHOOK_TOKEN`.
- Only one SPF (TXT `v=spf1 ...`) record per name. Resend's is on `send`, Zoho's on `@`, so they do not meet; if another service later wants `@` too, merge it into Zoho's line.
- Add a DMARC record too: TXT `_dmarc` with `v=DMARC1; p=none; rua=mailto:hello@voxelventure.app`.

### Payments (when you are ready to charge)
In Stripe: Developers > Webhooks > Add endpoint, `https://api.voxelventure.app/billing/webhook`, with the events in [docs/monetization/billing.md](../docs/monetization/billing.md). Put the secret key and the endpoint's signing secret in `api.env`. A live key also needs `TERMS_URL=https://voxelventure.app/legal/terms` and `REFUND_POLICY_URL=https://voxelventure.app/legal/refunds`, and those policies need the `NEXT_PUBLIC_LEGAL_*` lines in `web.env` filled in.

## First deployment
1. **Copy the project** to `/srv/voxelventure` (without `node_modules`, `.next` or `services/api/data`), e.g. `rsync -a --exclude node_modules --exclude .next --exclude services/api/data ./ root@SERVER:/srv/voxelventure/`.
2. **Run the setup:** `sudo bash /srv/voxelventure/deploy/setup.sh`.
3. **Fill in the settings** in `/etc/voxelventure/api.env`, `presence.env` and `web.env` (the addresses are already voxelventure.app). `setup.sh` has already put a long random value in `ADMIN_TOKEN`, `IP_SALT`, `MP_NOTIFY_SECRET`, `REFERRAL_SECRET` and `INTERNAL_SECRET`, a different one each and the same one in every file that shares it; to change one by hand, use `openssl rand -hex 32` and change it in every file it appears in. `API_SEED` must match the game's seed. `presence.env` also needs the same `IP_SALT` as `api.env`, and `TRUST_PROXY=1`. Network addresses are only ever kept as that salted hash, and behind Caddy the presence server must read each player's address from `X-Forwarded-For`, or everyone shares one per-network connection limit. For chat, `presence.env` needs `MP_API_URL` (the API on this machine), `MP_CHAT_GUESTS=0` (only signed-in players chat) and `MP_ORIGINS` set to your game's address; `api.env` needs `MP_NOTIFY_URL` so inbox notices reach players, and its `MESSAGING_*` lines switch chat, the inbox and owner messages off or change their limits and how long messages are kept (the defaults are fine to start).
   Then **check them**: `cd /srv/voxelventure && sudo -u voxel npm ci && npm run check:env -- /etc/voxelventure/api.env /etc/voxelventure/web.env` must say `ok` for both (it lists anything still a placeholder, too short, a test setting, or not https). The API checks the same again when it starts and **refuses to start in production** until they are fixed (`journalctl -u voxelventure-api` says why).
4. **Install and build**, with the web settings loaded (the `NEXT_PUBLIC_` addresses are fixed into the build):
   ```
   cd /srv/voxelventure
   sudo -u voxel npm ci
   set -a; . /etc/voxelventure/web.env; set +a
   sudo -E -u voxel npm run build
   ```
   `npm ci` also runs `patch-package`, which applies the fixes in `patches/`: copy that folder with the rest.
5. **Caddy:** the domain is already in `deploy/Caddyfile`; make a password hash with `caddy hash-password` for the monitor page, copy it to `/etc/caddy/Caddyfile` and `systemctl reload caddy`.
6. **Start everything:** `systemctl start voxelventure-api voxelventure-presence voxelventure-web`.
7. **Check it:**
   - `curl https://api.voxelventure.app/health` returns `{"ok":true,...}`
   - `curl https://play.voxelventure.app/health` returns `{"ok":true,...}`
   - Open `https://voxelventure.app`: you should be able to look around without signing in, and sign-in appears only when you claim something.
   - `journalctl -u voxelventure-api -f` (and `-presence`, `-web`) show the logs.
   - **Verify the data is authoritative:** `npm run verify:live -- --api https://api.voxelventure.app --site https://voxelventure.app --admin-token <ADMIN_TOKEN>` must end `all checks passed`. It is read-only and checks: CORS allows only your site, building figures are verified and never simulated, history comes from the ledger, the admin routes are closed, the audit trail's hash chain is intact, and the site was built with the API address (no demo banner, owner pages live). See [docs/architecture/authoritative_data.md](../docs/architecture/authoritative_data.md).

## Updating
```
cd /srv/voxelventure
# copy the new files over (rsync as above), then:
sudo -u voxel npm ci
set -a; . /etc/voxelventure/web.env; set +a
sudo -E -u voxel npm run build
systemctl restart voxelventure-api voxelventure-presence voxelventure-web
npm run verify:live -- --api https://api.voxelventure.app --site https://voxelventure.app --admin-token <ADMIN_TOKEN>
```
The API upgrades the database in place when it starts (new columns are added). Take a backup first: `sudo -u voxel voxelventure-backup`.

## From the old layout (before Phase C)

The app is in `apps/web/`, and the servers are in `services/api/` and `services/multiplayer/` ([ADR 0003](../docs/architecture/adr/0003-apps-and-services.md)). A machine that ran the old layout, with `server/api/`, `server/multiplayer.mjs` and the app at the root, moves its data once:

1. `systemctl stop voxelventure-web voxelventure-presence voxelventure-api`.
2. Copy the new release, then run `sudo bash deploy/setup.sh` again. It makes `services/api/data`, `services/multiplayer/logs` and `apps/web/.next/cache`, and installs the new systemd units.
3. Move the data:
   - `mv /srv/voxelventure/server/data/* /srv/voxelventure/services/api/data/` (the database, and `outbox/` if it is there);
   - optionally, `mv /srv/voxelventure/server/logs/* /srv/voxelventure/services/multiplayer/logs/`.

   Then check `API_DB` in `/etc/voxelventure/api.env` and `MP_LOG_DIR` in `presence.env`; the templates have the new paths.
4. Run `npm ci` and `npm run build` as `voxel`, then `systemctl start voxelventure-api voxelventure-presence voxelventure-web`.
5. Check `/health` on the API and the presence server, sign in, claim, and open `/admin`.

## Backups and restoring
- Nightly at 03:15 (`/etc/cron.d/voxelventure-backup`): a compressed copy in `/var/backups/voxelventure`, kept 14 days. For off-machine copies, install `rclone`, run `rclone config` once for your Linode Object Storage, and put `RCLONE_REMOTE=linode:your-bucket` in `/etc/voxelventure/backup.env`. Also switch on Linode's own Backups.
- **Restore:** `systemctl stop voxelventure-api`, `gunzip -c /var/backups/voxelventure/voxelventure-DATE.db.gz > /srv/voxelventure/services/api/data/voxelventure.db`, make sure the `voxel` user owns it, then `systemctl start voxelventure-api`.
- Do a restore on a spare machine once, before you rely on it.

## Things to know
- **One API process, one machine.** The database is SQLite with a single writer (that is what makes a claim atomic). Do not run two copies of the API.
- **Node version.** `setup.sh` installs Node 22 (it leaves a newer Node in place). The API uses Node's built-in SQLite (`node:sqlite`); the service file passes `--experimental-sqlite --no-warnings`, as `npm run api` does. Older Node 22 releases need the flag; Node 24, which the development machine runs, works without it, and the flag does no harm. I tried switching to `better-sqlite3` for production, but its native build crashed on the development machine, so it was not adopted: if you want it, install it on the Linode itself, run the API tests (`node tests/run.mjs api engage community stats`), and change only `services/api/db.mjs`.
- **What is public.** Caddy serves the game, the API and the presence connection; `/status` and `/notify` on the presence server are hidden from outside, and the `/admin` monitor page (which reads `/status` through `/mp-status`) is behind a password. Without the monitor, set `ADMIN_TOKEN` and use the admin endpoints only from your machine. `/notify-accounts` on the presence server and everything under `/internal/` on the API are for the processes on this machine to call each other: they refuse anything without their secret (`MP_NOTIFY_SECRET`, or `INTERNAL_SECRET` for the messaging service), and the `Caddyfile` also answers 404 to them from outside.
- **Email.** Until `MAIL_WEBHOOK_URL` is set, notices are only written to files in `services/api/data/outbox`: nothing is delivered.
- **Payments.** The Launch Pack, Pro and sponsored placements go through Stripe once `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set. Point the Stripe webhook at `https://api.voxelventure.app/billing/webhook` with the events listed in [docs/monetization/billing.md](../docs/monetization/billing.md). With the keys set, claims, take-overs, lease renewals and market stalls also go through Stripe Checkout. Without them, everything works as before, for free.
- **Watch bandwidth.** Presence sends nearby players about ten times a second. Check `/admin` (through the password) and the Linode transfer graph during the first busy days.

## Moving messaging to the Python service (not done yet)
Plan: [../docs/architecture/node_fastapi_architecture_plan.md](../docs/architecture/node_fastapi_architecture_plan.md). The service is in `services/messaging` and `setup.sh` installs it, but until these steps the Node API serves messaging itself. They have been rehearsed by `tests/messaging-migrate.test.mjs`, not on a real server.
1. **Settings.** Fill in `/etc/voxelventure/messaging.env`; give `api.env` the same `INTERNAL_SECRET` (long and random) but leave `MESSAGING_SERVICE_URL` out for now.
2. **Pause messaging writes.** Set `MESSAGING_READONLY=1` in `api.env` and `systemctl restart voxelventure-api`: nothing about messages is written (sending, reading positions, requests, blocks, reports and nearby chat answer "read-only for a few minutes"), while the city, claims and every business feature keep working and messages can still be read. Wait a minute for pending notices to go out.
3. **Back up and copy.** `sudo -u voxel voxelventure-backup`, then copy the newest backup's database out (`gunzip -c`) and run, as `voxel`, in `services/messaging`: `.venv/bin/python -m app.migrate_from_node --node-db <that copy> --messaging-db data/messaging.db`. It must print no problems and exit 0; otherwise stop here and undo step 2.
4. **Switch.** Add `MESSAGING_SERVICE_URL=http://127.0.0.1:3003` to `api.env` and take `MESSAGING_READONLY=1` out again; `systemctl enable --now voxelventure-messaging` and `systemctl restart voxelventure-api`. The Node API now forwards the messaging routes and runs no messaging jobs; the Caddyfile does not change. Check `curl -s localhost:3003/health`, send yourself a message, and use `npm run moderate` with `MESSAGING_URL=http://127.0.0.1:3003` for chat reports.
5. **Watch** for a few days: errors in `journalctl -u voxelventure-messaging`, the outbox counts in `/health` (dead notices mean the presence server is not taking them), and the size of `services/messaging/data/messaging.db`.

**Rolling back.** Before step 4, undo step 2. After it, new messages exist only in the messaging database: do not just remove `MESSAGING_SERVICE_URL` (they would vanish). Pause writes as in step 2, copy the new rows back (there is no script for that direction yet), then switch. While unsure, prefer pausing messaging over running two message stores.

## Moving up
Bigger plan when CPU or memory runs hot; presence on its own Linode when it is the busiest part (change `NEXT_PUBLIC_MP_URL`, `MP_NOTIFY_URL` and `MP_API_URL`, and rebuild; the two machines then call each other's private routes over the private network); Postgres only if you ever need two API machines (the API would have to become asynchronous first).
