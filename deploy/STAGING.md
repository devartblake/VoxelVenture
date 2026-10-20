# Staging

A second copy of VoxelVenture on the production Linode, for three things production cannot safely be used for:

- **Running the business journeys** ([tests/journeys/](../tests/journeys/README.md)). They create accounts and businesses.
- **Rehearsing a deploy and a rollback.**
- **Proving that a production backup restores.**

This is Phase D of the [migration plan](../docs/architecture/modular_monorepo_migration_plan.md). `deploy/staging.sh` does everything below; run it as root.

| | Production | Staging |
| :--- | :--- | :--- |
| The game | `voxelventure.app` → port 3000 | `staging.voxelventure.app` → port 3100 |
| The API | `api.voxelventure.app` → 3002 | `api.staging.voxelventure.app` → 3102 |
| Presence | `play.voxelventure.app` → 3001 | `play.staging.voxelventure.app` → 3101 |
| Code | `/srv/voxelventure` | `/srv/voxelventure-staging/releases/<date>`, live one linked as `current` |
| Database, outbox, logs | `/srv/voxelventure/services/...` | `/srv/voxelventure-staging/data`, `/srv/voxelventure-staging/logs` |
| Settings | `/etc/voxelventure/*.env` | `/etc/voxelventure/staging/*.env`, with its **own secrets** (its own admin token) |
| Services | `voxelventure-{api,presence,web}` | `voxelventure-staging-{api,presence,web}` |

**How staging differs from production:**
- **No email.** Mail is written to files in `data/outbox`, never sent.
- **Stripe test keys only.** A deploy refuses a live key.
- **Hidden.** Search engines are told not to index it (`robots.txt` and `X-Robots-Tag`). Its admin pages sign in against its own admin accounts, made at `/admin/setup` with staging's own `ADMIN_TOKEN` ([README.md](README.md#admin-sign-in)).

It uses the same `voxel` user, Node and Caddy as production. It shares nothing else with production.

**Memory:** staging roughly doubles what the machine runs (about 0.5–1 GB more). The 4 GB Linode has room. Stop staging when you're not using it: `systemctl stop voxelventure-staging-api voxelventure-staging-presence voxelventure-staging-web`.

## 1. DNS (once)

Make these at GoDaddy, as for production (voxelventure.app > DNS > Add New Record), each pointing at the Linode's IPv4:

| Type | Name | What for |
| :--- | :--- | :--- |
| A | `staging` | the game |
| A | `api.staging` | the API |
| A | `play.staging` | presence |

Wait until `dig +short api.staging.voxelventure.app` answers before step 2: Caddy asks for the certificates as soon as it loads the staging blocks.

## Copying the project to the server

`root@SERVER` below means `root@` followed by your Linode's IP address, for example `root@203.0.113.10`.

**From Windows (PowerShell),** use `deploy/push.ps1`:
- It packs the committed project with `git archive`, so `node_modules`, `.next`, databases and uncommitted edits stay behind.
- It copies the pack with `scp` and unpacks it into `/srv/voxelventure-staging/incoming/` with `ssh`. Both are built into Windows 10 and 11, and rsync isn't needed.
- It always packs with Unix (LF) line endings. Windows-style (CRLF) endings would stop `staging.sh` with `set: pipefail: invalid option` and break every settings value.

```powershell
$env:VV_SERVER = "root@SERVER"            # once per PowerShell window
.\deploy\push.ps1 staging                  # copy only
.\deploy\push.ps1 staging -Deploy          # copy, then deploy/staging.sh deploy
.\deploy\push.ps1 staging -Deploy -Ref my-branch   # another branch or commit
```

The same copy by hand, if you'd rather not use the script:

```powershell
git -c core.autocrlf=false -c core.eol=lf archive --format=tar.gz -o "$env:TEMP\vv.tar.gz" HEAD
scp "$env:TEMP\vv.tar.gz" "root@SERVER:/tmp/vv.tar.gz"
ssh root@SERVER "rm -rf /srv/voxelventure-staging/incoming && mkdir -p /srv/voxelventure-staging/incoming && tar -xzf /tmp/vv.tar.gz -C /srv/voxelventure-staging/incoming && rm /tmp/vv.tar.gz"
```

**From a Mac, Linux or WSL shell:**

```sh
rsync -a --delete --exclude node_modules --exclude .next --exclude services/api/data --exclude artifacts --exclude .git \
  ./ root@SERVER:/srv/voxelventure-staging/incoming/
```

**SSH key:** if `ssh` asks for the root password each time, set up a key once. Run `ssh-keygen -t ed25519` on Windows, then add the contents of `~\.ssh\id_ed25519.pub` to `/root/.ssh/authorized_keys` on the server. Once key sign-in works, turn off password sign-in.

## 2. Setup (once)

Copy the project to the server (above), then run the setup from it:

```powershell
.\deploy\push.ps1 staging
ssh root@SERVER "bash /srv/voxelventure-staging/incoming/deploy/staging.sh setup"
```

`setup` does the following:
- **Folders:** it makes the staging folders.
- **Settings:** it writes `/etc/voxelventure/staging/{api,presence,web}.env` from the production examples, with staging's addresses, ports and folders. Each secret gets a fresh random value. Files already there are left alone.
- **Services:** it installs and enables the three services, without starting them.
- **Caddy:** it adds `import /etc/caddy/staging.caddy` to `/etc/caddy/Caddyfile`, then validates and reloads Caddy.

Read the three settings files before the first deploy. There is nothing to fill in to start. Stripe is optional (section 7).

## 3. Deploy a release

The code you want on staging: `main` before it goes to production, or a branch with `-Ref`:

```powershell
.\deploy\push.ps1 staging -Deploy
```

Or copy it any way from the section above, then run on the server: `bash /srv/voxelventure-staging/incoming/deploy/staging.sh deploy`.

`deploy` does the following:
1. Runs `check:env` on staging's settings.
2. Copies `incoming/` to a new `releases/<date>` folder.
3. Runs `npm ci` and builds there, with staging's `web.env`.
4. Copies the database to `data/snapshots/before-<date>.db`.
5. Switches `current` to the new release and restarts the three services.
6. Waits for the API, presence and the site to answer. **If the new release doesn't come up, it switches back to the previous one on its own.**
7. Keeps the newest three releases.

Then check it as you check production. The token comes from staging's own settings:

```sh
cd /srv/voxelventure-staging/current
VERIFY_ADMIN_TOKEN="$(grep ^ADMIN_TOKEN= /etc/voxelventure/staging/api.env | cut -d= -f2)" \
  npm run verify:live -- --api https://api.staging.voxelventure.app --site https://staging.voxelventure.app
```

`bash deploy/staging.sh status` shows the releases, which one is live, the services and the size of the database.

## 4. Run the business journeys against staging

Start from an empty database, so every run starts from the same city with no businesses from a previous run:

```sh
bash /srv/voxelventure-staging/current/deploy/staging.sh reset --yes
```

Then, on your machine, from the project folder (the journeys need Edge or Chrome):

**PowerShell**
```powershell
$env:JOURNEY_WEB_URL = "https://staging.voxelventure.app"
$env:JOURNEY_API_URL = "https://api.staging.voxelventure.app"
$env:JOURNEY_MP_URL = "wss://play.staging.voxelventure.app"
$env:JOURNEY_ALLOW_WRITES = "1"
$env:JOURNEY_ADMIN_TOKEN = ssh root@SERVER "grep ^ADMIN_TOKEN= /etc/voxelventure/staging/api.env | cut -d= -f2"
npm run test:journeys
```

**Git Bash or a Mac/Linux shell**
```sh
export JOURNEY_WEB_URL=https://staging.voxelventure.app JOURNEY_API_URL=https://api.staging.voxelventure.app \
       JOURNEY_MP_URL=wss://play.staging.voxelventure.app JOURNEY_ALLOW_WRITES=1
export JOURNEY_ADMIN_TOKEN="$(ssh root@SERVER 'grep ^ADMIN_TOKEN= /etc/voxelventure/staging/api.env | cut -d= -f2')"
npm run test:journeys
```

- **Which token:** use staging's admin token only, never production's. It turns on the operator's pilot milestones; without it those are reported as skipped.
- **Reading the result:** each journey ends `passed`, `PRODUCT REGRESSION`, `RENDERING FAILURE` or `SKIPPED (environment)`, with the reports in `artifacts/journeys/` ([how to read them](../tests/journeys/README.md#reading-a-result)).
- **Discover is cached:** Discover and the category pages are rebuilt at most once a minute, so the visitor journey reloads them while it waits, as a visitor would.
- **Never against production.** The journeys create accounts and businesses wherever they run.

## 5. Rehearse a rollback

Do this once now, then before any risky release. Write down each time in the log at the end.

1. Deploy a release (section 3) and run `verify:live`. This release is **A**.
2. Change something you can see, for example a word on `/legal`, and deploy again. This release is **B**. Run `verify:live` and see the change.
3. Run `bash /srv/voxelventure-staging/current/deploy/staging.sh rollback`. It switches back to A and waits for the services.
4. Run `verify:live` again, and see that the change is gone.
5. **The database:** a rollback leaves the database as it is. The API only ever adds columns, so the older code still reads a newer database. To also put the database back as it was before B, run the `restore` command that `rollback` prints (`before-<B's date>.db`).
6. Note how long steps 3–4 took. That is the time to undo a bad release.

**For production:** the same release layout is `deploy/production.sh` (`deploy/README.md`, "Updating").
- **`migrate`:** moves production onto releases once. It undoes itself if the new layout does not come up.
- **`migrate --check`:** shows what it would do, and changes nothing.
- **After the move:** `deploy` and `rollback` work as they do here.

## 6. Prove a production backup restores

A backup that has never been restored is not proven. Restore last night's production copy into staging:

```sh
ls -t /var/backups/voxelventure/voxelventure-*.db.gz | head -1          # the newest production backup
bash /srv/voxelventure-staging/current/deploy/staging.sh restore /var/backups/voxelventure/voxelventure-<date>.db.gz
```

`restore` does the following:
- **Checks the copy:** SQLite's integrity check must pass, and it reports how many plots and accounts the copy holds.
- **Snapshots staging's current database**, then puts the copy in its place and restarts the API.
- **Checks it starts.** Then open `https://staging.voxelventure.app` and look for production's claimed buildings.

**Then reset:** staging now holds real accounts. When you've seen it work, run `reset --yes`. Note the date in the log.

## 7. Stripe in test mode (optional)

Staging is where payments are tried before production takes a live key.

1. **In Stripe**, in test mode, go to Developers > Webhooks > Add endpoint and enter `https://api.staging.voxelventure.app/billing/webhook`, with the events in [billing.md](../docs/monetization/billing.md).
2. **In `/etc/voxelventure/staging/api.env`**, set `STRIPE_SECRET_KEY=sk_test_...` and `STRIPE_WEBHOOK_SECRET=whsec_...`.
3. **Restart the API:** `systemctl restart voxelventure-staging-api`.
4. **Pay with Stripe's test card** `4242 4242 4242 4242`. Try:
   - the $9 Launch Pack;
   - $19 Pro;
   - a refund (from the Stripe dashboard);
   - a renewal (Stripe's test clocks).

   Check that each shows up once in the owner's dashboard.

5. **Or let the check do all of step 4** (`scripts/stripe-e2e.mjs`). It signs up two test owners, pays the Launch Pack and Pro on Stripe's page with the test card, refunds the Launch Pack the way the dashboard does and Pro the way an admin does, renews Pro a month ahead on a Stripe test clock, runs reconciliation, and checks each step in the owner's dashboard and in Stripe. Run it from your machine (it needs Edge or Chrome; `--pay manual` prints each page for you to pay by hand instead):

   ```sh
   export E2E_STRIPE_SECRET_KEY=sk_test_...        # the key in staging's api.env
   export E2E_STRIPE_WEBHOOK_SECRET=whsec_...      # optional: delivers one of Stripe's events twice
   export VERIFY_ADMIN_TOKEN="$(ssh root@SERVER 'grep ^ADMIN_TOKEN= /etc/voxelventure/staging/api.env | cut -d= -f2')"
   npm run verify:stripe -- --api https://api.staging.voxelventure.app --site https://staging.voxelventure.app
   ```

   It refuses a live key and production's API. It leaves two test businesses behind; `reset --yes` clears them.

## Commands

| | |
| :--- | :--- |
| `staging.sh setup` | Once: folders, settings, services, Caddy |
| `staging.sh deploy` | Build `incoming/` as a new release and switch to it (and back, if it fails) |
| `staging.sh rollback` | Back to the release before the live one |
| `staging.sh status` | Releases, the live one, the services, the database |
| `staging.sh reset --yes` | An empty database (a copy is kept in `data/snapshots/`) |
| `staging.sh restore <file>` | A database copy in place: a snapshot, or a production backup |
| `staging.sh render-env <dir>` | Write the settings files to a folder to read them, without installing anything |

## Rehearsal log

| Date | What | Result | Time to undo |
| :--- | :--- | :--- | :--- |
| 2026-10-17 | Rollback (section 5) | Release `232927` back to `232237`: switched, the three services restarted, and `verify:live` passed straight after. The older `231800` was not used: it was the build without the API address (`build-web.sh` now refuses such a build) | 2.2 s (2.8 s with `verify:live`) |
| 2026-10-17 | Database put back as it was before a release (section 5, step 5) | The snapshot `before-20261017-232927.db` was checked (855 plots, 7 accounts), the current database was copied aside, the copy put in place and the API restarted | 2.2 s |
| 2026-10-18 | Production backup restored (section 6) | `voxelventure-20261018-002021.db.gz`, production's first backup (taken by that day's deploy), passed the integrity check and holds production's 855 plots. The staging API started on it and answered, then staging was reset. Production had no accounts yet, so this proves the backup and the restore, not a full customer database: do it again once the pilot has data | 2.3 s |
| 2026-10-18 | Stripe test mode (section 7) | A building lease ($1,049.00) paid with the test card `4242…`: one webhook, the order paid, and plot 74 the buyer's for 365 days. Left: a refund and a Pro renewal | |
| 2026-10-18 | Stripe test mode, the full check (`npm run verify:stripe`) | **33 of 33**: the Launch Pack and Pro paid on Stripe's page; an unsigned webhook refused; an event delivered twice applied once; refunds from Stripe and from the admin route; Pro renewed on a test clock; reconciliation. The first run stopped at Stripe's "Save my information with Link" box, which Stripe ticks by default and which asks for a phone number; the script now unticks it | |
| 2026-10-18 | Production moved to releases (`production.sh migrate`) | Built while live, backed up, switched. The live API reads the moved database, and `verify:live` passes. The first attempt stopped safely at its backup, started from root's home; the scripts now `cd /` | about 0.5 s stopped |
| 2026-10-18 | Production rollback and deploy forward | A deploy, then a rollback to the release before it, then a deploy forward. A probe of 150 requests during the rollback saw 3 errors (502, about 0.6 s) | 2.2 s |
| 2026-10-17 | Journeys against staging (section 4) | 41 of 41 milestones, all four journeys, in strict mode. The first run stopped at `malformed-input`: it read presence's `/status`, which Caddy rightly hides. It now checks what a watching player sees | |
| 2026-10-19 | Staging on `main` with the props bucket | `eb5797e` (the plot economy's data, #54, with sign-in before setting a plot up), built with `NEXT_PUBLIC_PROPS_BASE_URL` pointing at `vv-asset-prod`: the bucket's address is in the build, CORS answers `https://staging.voxelventure.app`, and `verify:live` passes. Production stays on `ba55a22` (#52) until the cart ships with #54 | |
| 2026-10-19 | Limited access keys for Object Storage | The backups (`[linode]`) and the props (`[props]`) each have their own key in `/etc/voxelventure/rclone.conf`. Each was refused on every other bucket, a backup uploaded to `voxelventure-backups`, and the props upload wrote to `vv-asset-prod`. A comment after `[props]` had made the file unreadable; removed | |
