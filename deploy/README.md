# Deploying VoxelVenture to a Linode

A runbook for one server running everything: the web app, the API and the presence server, with Caddy in front for HTTPS. The reasoning behind the choices is in [../docs/operations/hosting_stack_payments.md](../docs/operations/hosting_stack_payments.md). voxelventure.app has run on these files since 2026-10-17. Read each step before you run it. Staging (`STAGING.md`) is where a change is tried first.

| File | What it is |
| :--- | :--- |
| `setup.sh` | First-time setup of a fresh Ubuntu server (24.04 or newer): Node 22, Caddy, SQLite tools, Python with the messaging service's environment, the `voxel` user, the services, the firewall, nightly backups |
| `Caddyfile` | HTTPS and the reverse proxy for the three addresses |
| `systemd/*.service` | The three processes, restarted automatically, and the messaging service (installed, not enabled until the switch-over below) |
| `env/*.env.example` | The settings for each process (copied to `/etc/voxelventure/`) |
| `backup.sh` | A consistent copy of the database (and the messaging service's, once it has one), kept for 14 days, optionally uploaded with rclone, with a Healthchecks.io ping |
| `MONITORING.md` | Error reporting (Sentry), uptime checks (UptimeRobot) and the backup heartbeat (Healthchecks.io): setup and what to do when an alert comes |
| `push.ps1` | From Windows: copy the committed project to the server (staging or production) and optionally deploy it, with no rsync needed |
| `staging.sh`, `Caddyfile.staging`, `systemd/staging/` | Staging on the same machine: the business journeys, deploy and rollback rehearsals, restoring a production backup ([STAGING.md](STAGING.md)) |

The files are filled in for **voxelventure.app** (the game), **api.voxelventure.app** (the API) and **play.voxelventure.app** (presence), with `www.voxelventure.app` and `voxelventure.net` redirecting to the game. Only the secrets are left as `CHANGE_ME`.

## What you need first
- A Linode (Shared CPU 4 GB to start, about $24 a month) running Ubuntu 24.04 or newer, with your SSH key and Backups switched on (about $5 a month). Note its IPv4 address (and IPv6, if you want AAAA records too).
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
**The full release, step by step, is [STRIPE_LIVE.md](STRIPE_LIVE.md):** finishing test mode on staging, the policies, the restricted live key and its webhook, the first real payment and refund, and switching payments off in an emergency. In short:

In Stripe: Developers > Webhooks > Add endpoint, `https://api.voxelventure.app/billing/webhook`, with the events in [docs/monetization/billing.md](../docs/monetization/billing.md). Put the secret key and the endpoint's signing secret in `api.env`. A live key also needs `TERMS_URL=https://voxelventure.app/legal/terms` and `REFUND_POLICY_URL=https://voxelventure.app/legal/refunds`, and those policies need the `NEXT_PUBLIC_LEGAL_*` lines in `web.env` filled in.

## First deployment
1. **Get the project** into `/srv/voxelventure`, as root on the server.
   - **With git (recommended; updates are then a `git pull`).** The repository is private, so give the server a read-only deploy key: `ssh-keygen -t ed25519 -N "" -f ~/.ssh/voxelventure_deploy`, add the `.pub` file's line on GitHub under the repository's Settings > Deploy keys (leave write access off), then:
     ```
     printf 'Host github.com\n  IdentityFile ~/.ssh/voxelventure_deploy\n' >> ~/.ssh/config
     apt install -y git
     git clone git@github.com:devartblake/VoxelVenture.git /srv/voxelventure
     ```
   - **Or copy it** from your machine (without `node_modules`, `.next` or `services/api/data`): `rsync -a --exclude node_modules --exclude .next --exclude services/api/data ./ root@SERVER:/srv/voxelventure/` (`root@SERVER` is `root@` and the Linode's IP). From Windows, which has no rsync (PowerShell, in the project folder; it unpacks and never deletes anything):
     ```powershell
     git -c core.autocrlf=false -c core.eol=lf archive --format=tar.gz -o "$env:TEMP\vv.tar.gz" HEAD
     scp "$env:TEMP\vv.tar.gz" "root@SERVER:/tmp/vv.tar.gz"
     ssh root@SERVER "mkdir -p /srv/voxelventure && tar -xzf /tmp/vv.tar.gz -C /srv/voxelventure && rm /tmp/vv.tar.gz"
     ```
     After the first deployment, `deploy/push.ps1 production` does this (see Updating).

   On a 4 GB plan, add 2 GB of swap first so the build cannot run out of memory: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab`.
2. **Run the setup:** `sudo bash /srv/voxelventure/deploy/setup.sh`. Among the rest, it gives the project folder to the `voxel` user (which installs and builds it) and lets root's git work in it.
3. **Fill in the settings** in `/etc/voxelventure/api.env`, `presence.env` and `web.env` (the addresses are already voxelventure.app). `setup.sh` has already put a long random value in `ADMIN_TOKEN`, `IP_SALT`, `MP_NOTIFY_SECRET`, `REFERRAL_SECRET` and `INTERNAL_SECRET`, a different one each and the same one in every file that shares it; to change one by hand, use `openssl rand -hex 32` and change it in every file it appears in. `API_SEED` must match the game's seed. `presence.env` also needs the same `IP_SALT` as `api.env`, and `TRUST_PROXY=1`. Network addresses are only ever kept as that salted hash, and behind Caddy the presence server must read each player's address from `X-Forwarded-For`, or everyone shares one per-network connection limit. For chat, `presence.env` needs `MP_API_URL` (the API on this machine), `MP_CHAT_GUESTS=0` (only signed-in players chat) and `MP_ORIGINS` set to your game's address; `api.env` needs `MP_NOTIFY_URL` so inbox notices reach players, and its `MESSAGING_*` lines switch chat, the inbox and owner messages off or change their limits and how long messages are kept (the defaults are fine to start).
   Then **check them**: `cd /srv/voxelventure && sudo -u voxel npm ci && node scripts/check-env.mjs /etc/voxelventure/api.env /etc/voxelventure/web.env` must say `ok` for both (it lists anything still a placeholder, too short, a test setting, or not https). The API checks the same again when it starts and **refuses to start in production** until they are fixed (`journalctl -u voxelventure-api` says why).
4. **The first release.** Production runs on releases (`deploy/production.sh`):
   - each deploy is built in its own folder, `/srv/voxelventure/releases/<date>`;
   - `/srv/voxelventure/current` links to the live release;
   - the database, the outbox and the logs live in `/srv/voxelventure/shared/`, outside every release.

   Do step 5 first, then:
   ```
   bash /srv/voxelventure/deploy/production.sh migrate --check   # read-only: what it will do, and that everything is there
   bash /srv/voxelventure/deploy/production.sh migrate           # builds the first release and starts the three services
   ```
   The build runs `npm ci` (which also applies the fixes in `patches/`) and `deploy/build-web.sh`. That builds as the `voxel` user with `web.env` loaded (the `NEXT_PUBLIC_` addresses are fixed into the build), then checks the API address is really in the build. Don't build through `sudo -E`: newer Ubuntu's sudo ignores `-E`, and the site then builds as a demo without any error.
5. **Caddy:** the domain is already in `deploy/Caddyfile`; copy it to `/etc/caddy/Caddyfile` and `systemctl reload caddy`. The admin pages have their own sign-in: once the services run, create the first admin account at `/admin/setup` ([Admin sign-in](#admin-sign-in)).
6. **Started by step 4.** Restart them all with `systemctl restart voxelventure-api voxelventure-presence voxelventure-web`.
7. **Check it:**
   - `curl https://api.voxelventure.app/health` returns `{"ok":true,...}`
   - `curl https://play.voxelventure.app/health` returns `{"ok":true,...}`
   - Open `https://voxelventure.app`: you should be able to look around without signing in, and sign-in appears only when you claim something.
   - `journalctl -u voxelventure-api -f` (and `-presence`, `-web`) show the logs.
   - **Alerts:** set up error reporting, the uptime checks and the backup heartbeat ([MONITORING.md](MONITORING.md)).
   - **Verify the data is authoritative:** this must end `all checks passed`:
     ```
     VERIFY_ADMIN_TOKEN="$(grep ^ADMIN_TOKEN= /etc/voxelventure/api.env | cut -d= -f2)" \
       npm run verify:live -- --api https://api.voxelventure.app --site https://voxelventure.app
     ```
     Give the admin token in `VERIFY_ADMIN_TOKEN`, never as `--admin-token`: npm prints the command it runs, so a token on the command line ends up on screen and in the terminal's scrollback. It is read-only and checks: CORS allows only your site, building figures are verified and never simulated, history comes from the ledger, the admin routes are closed, the audit trail's hash chain is intact, and the site was built with the API address (no demo banner, owner pages live). See [docs/architecture/authoritative_data.md](../docs/architecture/authoritative_data.md).

## Admin sign-in

The admin pages (`/admin` the presence monitor, `/admin/pilot`, `/admin/economy`, `/admin/promos`, `/admin/admins`, `/admin/password` (the Account page), and any added later under `apps/web/app/admin/`) have their own sign-in at **`/admin/login`** ([services/api/admin.mjs](../services/api/admin.mjs), [backend.md](../docs/architecture/backend.md#admin-sign-in)):

- **Admin accounts live in the API's database** (`admin_accounts`), not in any settings file and not in the Caddyfile. Several admins are allowed. Passwords are kept as salted scrypt hashes (`scrypt$N$r$p$salt$hash`, N = 2^15), at least 8 characters with 3 of a lowercase letter, a capital, a number and a symbol (or a phrase of 16 characters or more), not the username and not a common password (`lib/data/adminPassword.js`).
- **The first account** is made at **`/admin/setup`** with the API's `ADMIN_TOKEN` (already in `api.env`): the page works only while there is no admin account, sends the token once as `Authorization: Bearer` and keeps it nowhere. After that, `POST /admin/setup` answers 409. The login page points to `/admin/setup` while it is needed. The API starts normally with no admin account.
- **More admins, disabling one:** `/admin/admins` (signed in). **Your own password:** `/admin/password` (the current one first; your other sessions end). Every change, sign-in, failure, lockout and sign-out is in the audit trail.
- **The session** is an `HttpOnly; Secure; SameSite=Strict` cookie on the API's own host (`__Host-vv_admin`, no `Domain`), holding 32 random bytes whose SHA-256 is all the database keeps. It ends after 2 hours without use, and 12 hours after signing in. The admin pages call the API with `credentials: 'include'`; the API answers them with `Access-Control-Allow-Credentials: true` and the exact `API_ORIGIN`, never `*`. A change made with the cookie must be JSON and carry that `Origin`. Staging works the same with its own `API_ORIGIN`, accounts and `ADMIN_TOKEN`.
- **Too many tries:** 5 failed sign-ins within 15 minutes for a username, or from one network, lock that username or network for 15 minutes, with the same generic error as a wrong password, after a short fixed delay. (The counts are in memory: a restart of the API forgets them.)
- **The market editor in the game** (the market panel's **Set up weeks**, [docs/product/market.md](../docs/product/market.md#the-weekly-layout-admin)) uses the same session: sign in at `/admin/login`, then **Edit the market** on the Overview (`/?market=edit`). The game no longer asks for `ADMIN_TOKEN`, and keeps nothing about the admin in the browser.
- **`ADMIN_TOKEN` stays** the machine credential: `npm run moderate`, `npm run newsletter`, `verify:live` and every admin route keep working with `Authorization: Bearer`.
- **Your email, for a forgotten password:** after signing in, open **Account** (`/admin/password`), enter your email and open the link it sends (it works once, for 30 minutes). Only a confirmed address gets reset links. The Admins page shows each admin's address and whether it is confirmed. Email needs `MAIL_WEBHOOK_URL` (Resend) in `api.env`: without it the email is only written to a file in `MAIL_DIR` on the server. The links point to `PUBLIC_SITE_URL`. Staging never sends mail (its emails are files in `/srv/voxelventure-staging/data/outbox`).
- **Forgot the password?** "Forgot your password?" on the sign-in opens **`/admin/forgot`**, with two ways:
  - **Email me a link:** type your username or your confirmed email. The answer is always the same ("If that account has a confirmed email, a link is on its way"), whether the account exists or not. The link (`/admin/reset`) works once, for 30 minutes; asking again voids the older one. At most 3 links an hour per admin and 10 requests an hour per network.
  - **Reset with the server's admin token:** the username, the `ADMIN_TOKEN` (from your own records, or `api.env`) and the new password twice. The token is sent once and kept nowhere. A wrong token counts as a failed sign-in of your network: 5 within 15 minutes lock it for 15 minutes.
  
  Either way every session of that admin ends, the lockout of the username (and of the network that reset it) is cleared so you can sign in at once, and a disabled admin stays disabled (another admin enables them). Everything is in the audit trail, never the link, the token or a password. Details: [backend.md](../docs/architecture/backend.md#admin-password-reset).
- **Last resort, on the server** (no email and no token at hand), as the `voxel` user against the live database (the API can keep running):
  ```
  cd /srv/voxelventure/current
  sudo -u voxel env API_DB=/srv/voxelventure/shared/data/voxelventure.db npm run admin:reset-password -- <username>
  ```
  It asks for the new password twice without showing it and prints only `password changed`; that admin's sessions end and the account is enabled again. `npm run admin:create -- <username>` adds an admin the same way (prints `created`). Staging: `cd /srv/voxelventure-staging/current` and `API_DB=/srv/voxelventure-staging/data/voxelventure.db` (the path in `/etc/voxelventure/staging/api.env`).

### Switching from Caddy's password to the sign-in (once, on production)

Until this is done, production's Caddy still asks for its `basic_auth` password on `/admin*` and `/mp-status`. Do it in this order, so the pages are never unprotected:

1. **Deploy** this release (`deploy/production.sh`). Caddy's password stays in place meanwhile; nothing in `api.env` changes.
2. **Create the account:** open `https://voxelventure.app/admin/setup` (through Caddy's password, one last time) and create the owner's account with the `ADMIN_TOKEN`. The owner types the token from their own records; nobody prints it on the server for this.
3. **Check the sign-in:** sign out, open `https://voxelventure.app/admin`, sign in at the login page, and see the monitor's players and the pilot page.
4. **Remove Caddy's password:** in `/etc/caddy/Caddyfile`, delete the `@monitor` matcher and the `basic_auth @monitor { ... }` block, and replace the `handle /mp-status { rewrite ...; reverse_proxy 127.0.0.1:3001 }` block with `handle /mp-status { respond 404 }`, as in [deploy/Caddyfile](Caddyfile). Then `caddy validate --config /etc/caddy/Caddyfile` and `systemctl reload caddy`. The monitor reads the presence server through the API now (`GET /admin/presence`), so `/mp-status` is no longer needed; `NEXT_PUBLIC_MP_HTTP` can go from `web.env`.

Staging had no admin pages (Caddy answered 404). With [Caddyfile.staging](Caddyfile.staging) they are there behind the same sign-in: deploy staging, create its first account at `https://staging.voxelventure.app/admin/setup` with **staging's** `ADMIN_TOKEN`, then copy the new file to `/etc/caddy/staging.caddy` and reload Caddy. (Before that reload `/admin` simply answers 404 there.)

## Updating

Production runs on **releases**, as staging does. A deploy goes like this:
1. It builds the new code in its own folder while the live release keeps serving.
2. It takes a backup: the nightly one, so it also goes off the machine, plus a snapshot in `shared/data/snapshots/`.
3. It switches `current` to the new release in about a second.
4. If the new release doesn't answer, it switches back by itself.

**From Windows,** `deploy/push.ps1` does all of it (`root@SERVER` is `root@` and the Linode's IP):

```powershell
$env:VV_SERVER = "root@SERVER"
.deploypush.ps1 production            # copy only: the committed project, into /srv/voxelventure/incoming/
.deploypush.ps1 production -Deploy    # copy, then: a new release, a backup, the switch
```

- **What it sends:** the committed project, packed with `git archive` and copied with `scp` and `ssh`, both built into Windows. Uncommitted edits stay behind, and it always sends Unix (LF) line endings.
- **SSH keys:** see [STAGING.md](STAGING.md#copying-the-project-to-the-server).
- **Try it on staging first:** `.deploypush.ps1 staging -Deploy`.

**On the server:**

```
bash /srv/voxelventure/current/deploy/production.sh deploy                         # from incoming/ (what push.ps1 copied)
git -C /srv/voxelventure/repo pull &&   bash /srv/voxelventure/repo/deploy/production.sh deploy --from /srv/voxelventure/repo   # or from the git clone
bash /srv/voxelventure/current/deploy/production.sh rollback                       # back to the release before
bash /srv/voxelventure/current/deploy/production.sh status                         # the releases, the live one, the services
cd /srv/voxelventure/current && VERIFY_ADMIN_TOKEN="$(grep ^ADMIN_TOKEN= /etc/voxelventure/api.env | cut -d= -f2)"   npm run verify:live -- --api https://api.voxelventure.app --site https://voxelventure.app
```

- **What a rollback keeps:** it leaves the database as it is. The API only ever adds columns, so older code still reads it.
- **Putting the database back as well:** `rollback` prints the commands, using the snapshot taken before the release went live.

**Moving to releases (once, from the old in-place layout).** `production.sh migrate`:
- builds the first release from the clone while the site keeps running;
- takes a backup;
- stops the three services for a few seconds, moves the database into `shared/data/` (checked: sound, with the same plots and accounts), and points `API_DB`, `MAIL_DIR` and `MP_LOG_DIR` there;
- installs the new service files and starts them.

If they don't answer, it **puts the old settings and services back** and starts the old layout. The old clone is kept as `/srv/voxelventure/repo`, and nothing is deleted. Run `migrate --check` first: it reads everything and changes nothing.

The API upgrades the database in place when it starts (new columns are added), which is why every deploy backs it up first.

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
- Nightly at 03:15 (`/etc/cron.d/voxelventure-backup`): a compressed copy in `/var/backups/voxelventure`, kept 14 days. Also switch on Linode's own Backups.
- **Off-machine copies with rclone** (Linode Object Storage, $5 a month for 250 GB):
  1. In the Linode dashboard: Object Storage > Create Bucket (e.g. `voxelventure-backups`, same region as the server) and note the endpoint in its hostname (e.g. `us-ord-1.linodeobjects.com`). Then Access Keys > Create Access Key with **Limited Access**, Read/Write on that bucket only.
  2. On the server, put the remote where the `voxel` user (which runs the backup) can read it. A plain `rclone config` as root saves it in root's home, where the nightly job cannot see it.
     ```
     apt install -y rclone
     cat > /etc/voxelventure/rclone.conf <<'EOF'
     [linode]
     type = s3
     provider = Other
     endpoint = us-ord-1.linodeobjects.com
     access_key_id = PASTE_ACCESS_KEY
     secret_access_key = PASTE_SECRET_KEY
     acl = private
     no_check_bucket = true
     EOF
     echo 'RCLONE_REMOTE=linode:voxelventure-backups' > /etc/voxelventure/backup.env
     chown root:voxel /etc/voxelventure/rclone.conf /etc/voxelventure/backup.env
     chmod 640 /etc/voxelventure/rclone.conf /etc/voxelventure/backup.env
     ```
     `provider = Other` works with every rclone version (older ones do not know `Linode`); `no_check_bucket` is needed because a limited key may not create buckets. Never put a comment after a `[section]` name (`[linode]  # backups`): rclone then cannot read the file at all, and the backup's upload fails. `backup.sh` uses `/etc/voxelventure/rclone.conf` by itself when it is there (or set `RCLONE_CONFIG` in `backup.env`).
  3. Test: `sudo -u voxel voxelventure-backup` must end `Uploaded to linode:voxelventure-backups`, and `RCLONE_CONFIG=/etc/voxelventure/rclone.conf rclone ls linode:voxelventure-backups` lists the file.
  4. The bucket keeps copies for `RCLONE_KEEP` days (default 30, set it in `backup.env`); only the backup's own files are ever deleted there.
- **The props bucket** (the interior furniture, doors and windows: [scripts/props/upload.mjs](../scripts/props/upload.mjs)): production uses `vv-asset-prod` (us-east-1, public read), with its own Limited Access key in a second remote, `[props]`, in the same `rclone.conf`. Each key reaches only its own bucket (checked 2026-10-19). Upload after the props change: `cd /srv/voxelventure/current && PROPS_REMOTE=props:vv-asset-prod node scripts/props/upload.mjs` (it only adds; the manifest goes last). CORS (`scripts/props/cors.xml`) allows voxelventure.app and staging.voxelventure.app. Both stacks load from it: `NEXT_PUBLIC_PROPS_BASE_URL=https://vv-asset-prod.us-east-1.linodeobjects.com` in `/etc/voxelventure/web.env` and `/etc/voxelventure/staging/web.env` (a rebuild is needed after changing it).
- **Restore:** to fetch a copy from the bucket first, `RCLONE_CONFIG=/etc/voxelventure/rclone.conf rclone copy linode:voxelventure-backups/voxelventure-DATE.db.gz /var/backups/voxelventure/`. Then `sudo bash /srv/voxelventure/current/deploy/production.sh restore /var/backups/voxelventure/voxelventure-DATE.db.gz --yes`. It checks the copy is a sound database with plots, snapshots the live one first, swaps it in, restarts the API and checks it answers; it prints the command that undoes it. By hand, the same steps are: `systemctl stop voxelventure-api`, `gunzip -c /var/backups/voxelventure/voxelventure-DATE.db.gz > /srv/voxelventure/shared/data/voxelventure.db` and `rm -f /srv/voxelventure/shared/data/voxelventure.db-wal /srv/voxelventure/shared/data/voxelventure.db-shm` (on the old in-place layout, the folder is `/srv/voxelventure/services/api/data/`), make sure the `voxel` user owns it, then `systemctl start voxelventure-api`. To try a copy without touching production, restore it into staging: [STAGING.md](STAGING.md) section 6.
- **Alerts:** `HEALTHCHECK_URL` in `backup.env` emails you when a night's backup or upload fails ([MONITORING.md](MONITORING.md#healthchecksio-the-nightly-backup)).
- Do a restore on a spare machine once, before you rely on it.

## Things to know
- **One API process, one machine.** The database is SQLite with a single writer (that is what makes a claim atomic). Do not run two copies of the API.
- **Node version.** `setup.sh` installs Node 22 (it leaves a newer Node in place). The API uses Node's built-in SQLite (`node:sqlite`); the service file passes `--experimental-sqlite --no-warnings`, as `npm run api` does. Older Node 22 releases need the flag; Node 24, which the development machine runs, works without it, and the flag does no harm. I tried switching to `better-sqlite3` for production, but its native build crashed on the development machine, so it was not adopted: if you want it, install it on the Linode itself, run the API tests (`node tests/run.mjs api engage community stats`), and change only `services/api/db.mjs`.
- **What is public.** Caddy serves the game, the API and the presence connection; `/status` and `/notify` on the presence server are hidden from outside (the `/admin` monitor reads `/status` through the API, `GET /admin/presence`, for signed-in admins only), and the admin pages have their own sign-in ([Admin sign-in](#admin-sign-in)). `ADMIN_TOKEN` is for scripts: keep it off the command line. `/notify-accounts` on the presence server and everything under `/internal/` on the API are for the processes on this machine to call each other: they refuse anything without their secret (`MP_NOTIFY_SECRET`, or `INTERNAL_SECRET` for the messaging service), and the `Caddyfile` also answers 404 to them from outside.
- **Email.** Until `MAIL_WEBHOOK_URL` is set, notices are only written to files in `services/api/data/outbox`: nothing is delivered.
- **Payments.** The Launch Pack, Pro and sponsored placements go through Stripe once `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set. Point the Stripe webhook at `https://api.voxelventure.app/billing/webhook` with the events listed in [docs/monetization/billing.md](../docs/monetization/billing.md). With the keys set, claims, take-overs, lease renewals and market stalls also go through Stripe Checkout. Without them, everything works as before, for free.
- **Watch bandwidth.** Presence sends nearby players about ten times a second. Check `/admin` (signed in) and the Linode transfer graph during the first busy days.

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
