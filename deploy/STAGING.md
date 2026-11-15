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
- **With Stripe test mode on (section 7), two journeys cannot pass.** A claim then returns a payment checkout and the lot is claimed only after the payment, so `merchant-onboarding` stops at `claim-building` and `visitor-discovery-to-storefront` at linking the building (403, the lot is not yet theirs). They assume payments are off. Run them with the Stripe lines out of staging's `api.env` (or locally, which has none), and use `npm run verify:stripe` for the paid flow.

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

## 8. Upgrade Node on staging first

Staging and production share the machine, and every service starts `/usr/bin/node`, so upgrading the system Node moves both. Rehearse it with a second Node beside the system one, used by staging only:

1. **Install it beside the system Node**, from nodejs.org, checking the published checksum: unpack `node-vX.Y.Z-linux-x64.tar.xz` into `/opt` and link `/opt/node-26` to it. Production is untouched.
2. **Point staging at it:** for each of `voxelventure-staging-api`, `-presence` and `-web`, a drop-in `/etc/systemd/system/<unit>.d/node26.conf` with an empty `ExecStart=` line and then the same `ExecStart=` as the unit, with `/opt/node-26/bin/node` in place of `/usr/bin/node`. Then `systemctl daemon-reload`.
3. **Deploy staging with that Node first on the PATH:** `PATH=/opt/node-26/bin:$PATH bash /srv/voxelventure-staging/incoming/deploy/staging.sh deploy` (the script builds with the PATH's `node` and `npm`, also as the `voxel` user).
4. **Check:** each service's `/proc/<pid>/exe` is the new Node, `journalctl` has no warnings except the stop's `status=143`, `npm run verify:live` passes (section 3), a WebSocket to presence answers, and the journeys pass (section 4, mind its Stripe note).
5. **Then production:** switch the NodeSource repository (`setup_26.x`), `apt-get install -y nodejs`, deploy the same commit with `deploy/production.sh deploy` (it builds with the new Node, backs up, switches and switches back by itself), and run `verify:live` against it. To go back: install the earlier `nodejs` version from NodeSource and `production.sh rollback`.
6. **Clean up:** once the system Node matches, delete the staging drop-ins (and `/opt/node-26`) and restart the staging services.

**`production.sh deploy` really deploys.** It has no `--check`: only `migrate --check` is read-only. Read the whole command before running it, even to look.

## 9. More plots: the top-up

The town now has 155 more plots (ids 881 to 1035, [docs/world/world_recipe.md](../docs/world/world_recipe.md)). A database seeded before that has 855. The API tops it up when it starts: it inserts the plots the generator has that the database lacks, **by id, new ids only**, with each plot's opening ledger entry, and changes no existing row. The result is in the start-up value `seeded.toppedUp` (155 the first time, 0 after).

**Rehearse it on staging first** (nothing here has been run on the real staging or production servers yet):
1. **Copy:** `sudo -u voxel cp /srv/voxelventure-staging/data/voxelventure.db /tmp/before-topup.db` (a copy to compare with; `staging.sh deploy` also snapshots the database).
2. **Count:** `sqlite3 /srv/voxelventure-staging/data/voxelventure.db "SELECT COUNT(*) FROM plots; SELECT MAX(id) FROM plots WHERE id < 100000;"` should say 855 (or more, if lots were added) and 880.
3. **Deploy the API and the web app together** as usual (`push.ps1 staging -Deploy`): the deploy restarts the API, which tops the database up, and builds the web app with the new plots.
4. **Check:** `plots` in `https://api.staging.voxelventure.app/health` is 1010; `SELECT COUNT(*) FROM plots WHERE id >= 881 AND id < 100000;` is 155; and none of the old rows changed: `sqlite3 /tmp/before-topup.db "SELECT * FROM plots WHERE id < 881 ORDER BY id" | sha256sum` equals the same command on the live file.
5. **Run `npm run verify:live` and the journeys** as in section 4. Any plot the journeys claimed keeps its owner.
6. **Restart the API again:** the count must not change.

**Production:** the same, after staging. Deploy order matters: the API first, then the web app (a plot the web app shows must exist in the database). **Rollback:** `staging.sh rollback` (or `production.sh rollback`) switches back to the earlier release; the 155 rows stay, are harmless (unclaimed lots the old code does not show), and are topped up again by the next release. To remove them: `DELETE FROM plots WHERE id >= 881 AND id < 100000 AND owner_account IS NULL; DELETE FROM ledger WHERE plot_id >= 881 AND plot_id < 100000;` (only if nobody has claimed one: check first).

**The island** (`WORLD_TOWNS=harbor` in `api.env`) adds 1,070 empty, unclaimable lots under ids from 1,000,001. Leave it unset on staging and production until the game can show the island. **(2026-11-15)** The island moved when the mainland became a variation of Jamaica (world_recipe.md section 4a: its town is now at 1922.9, 78.1, was 977.5, 161.4): lots a staging server already holds have the old coordinates. They are empty, unowned and shown nowhere, so nothing breaks, but re-seed them once, after both landmasses are final: `sqlite3 data/voxelventure.db "DELETE FROM plots WHERE id >= 1000000 AND owner_account IS NULL AND owner_name IS NULL"` (check the count first), then restart the API with `WORLD_TOWNS=harbor`.

## 10. Rehearse presence-verified positions

Before production, on staging only ([presence_positions.md](../docs/architecture/presence_positions.md)):

1. Deploy the release to staging. The API adds the `presence_events` and `presence_flags` tables by itself. In `/etc/voxelventure/staging/presence.env` leave `PRESENCE_TRACK` unset (on when accounts are set up) and `PRESENCE_ENFORCE=0`; restart the presence service. `/status` (through the server, not Caddy) shows `positions.ready: true`.
2. With two **throwaway** accounts: one walks from a spawn to the park and to a district, stays there a minute; the other sends an impossible jump (a modified client, or the test harness). Check in the database that the first has `presence_events` rows (`in`, `place:park:park`), the second has none for the park and `positions.violations` rose in `/status`.
3. Claim a park task as the first account: paid once. Make the second account jump repeatedly (the flag needs about a dozen): `GET /admin/presence/flags` lists it, its claim answers 409 `under_review`; clear it with `POST /admin/presence/flags/:id/clear` and the claim is paid.
4. Watch the flags for a few days with real testers before anyone considers `PRESENCE_ENFORCE=1` or production. Look for false positives (a person flagged), and tune `lib/world/antibot.js`.
5. **Rollback:** `PRESENCE_TRACK=0` in presence.env and restart; for the API, `staging.sh rollback`. The tables are additive and can stay.

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
| 2026-11-14 | Node 26.13.1 (LTS) on staging, beside the system Node 22.23.3 (section 8) | `/opt/node-26` with its checksum verified, staging's three services on it by drop-ins, staging rebuilt with it (Next 16.4.6, three 0.187). `verify:live` passed all 20 checks, presence answered over a WebSocket, nothing restarted. Journeys: 3 of 5 passed; `merchant-onboarding` and `visitor-discovery-to-storefront` could not (Stripe test mode is on, so a claim needs a payment) and pass locally on Node 26. | Remove the drop-ins |
| 2026-11-14 | Node 26.13.1 on production, release `20261114-201244` (same commit as staging, `217ab8e`) | NodeSource switched to `setup_26.x` and `nodejs` installed while the old processes kept serving; the deploy then built with it, backed up (and uploaded), switched and restarted the three services onto Node 26 with no restarts since. `verify:live` passed. The deploy ran by mistake from `deploy --check` (there is no such flag), through the same safe path. | `production.sh rollback` |
| 2026-11-14 | Security headers and the report-only CSP on staging (`d1c6462`, release `20261114-212434`) | Deployed; staging's Caddy file replaced after `caddy validate` on the whole server config (it also holds production's sites), then reloaded. All six headers present on staging, none on production (not yet updated). `verify:live` passed and the pilot tour passed 6 of 6 in a real browser, iframes included. The CSP reported only the known `script-src eval` probe, nothing else. A first draft would have broken the combined config (the same snippet name in both Caddyfiles); fixed in #119. | Restore `/etc/caddy/staging.caddy.bak-20261114` and `systemctl reload caddy`; `staging.sh rollback` for the app |
| 2026-11-14 | More plots: the top-up rehearsed on a FILE database on a developer machine (not on staging; section 9) | A database seeded by a server with the extension off (all its start-up seeding: world, ads, brands), one lot claimed and re-priced by a player, then started by the new server: 855 to 1,010 plots, **155 rows added, 0 of the 855 old rows changed in any column**, the claimed lot still the player's, `/health` 1010, a second start `toppedUp: 0`. `WORLD_TOWNS=harbor` on the same file added 1,070 empty, unclaimable lots and nothing else. | The staging and production rehearsals are still to do |
