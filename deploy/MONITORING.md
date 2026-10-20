# Error reporting, uptime checks and alerts

Three outside services, each with an email alert, so you hear about a problem before a merchant does (task 46 in [docs/roadmap/tasks.md](../docs/roadmap/tasks.md)):

| What | Service | What it watches | Alerts |
| --- | --- | --- | --- |
| Errors | [Sentry](https://sentry.io) | Unexpected errors in the API (every 500 and any crash), the presence server, the web server's pages, and the players' browsers | The first time each new error appears, and when a resolved one comes back |
| Uptime | [UptimeRobot](https://uptimerobot.com) | The site, the API and the presence server, from outside the Linode, every 5 minutes | When one stops answering, and when it is back |
| Backups | [Healthchecks.io](https://healthchecks.io) | The nightly backup and its upload to Object Storage | When a night passes without a good backup |

The uptime checks have to run somewhere other than the Linode: a check on the same machine cannot tell you the machine is down. All three email you themselves, so none of this waits on the site's own mail service.

## Sentry (errors)

1. Make an account and one project (platform: **Node.js**; one project holds all four sources, each error is tagged `service` = `api`, `presence`, `web` or `web-client`). Pick the EU data region if you want the data kept in the EU.
2. Copy the project's DSN (*Project settings > Client Keys*).
3. Put it in all three settings files on the Linode, beside the `SENTRY_ENVIRONMENT=production` line that is already there:
   ```
   SENTRY_DSN=https://...@o....ingest.sentry.io/...
   ```
   in `/etc/voxelventure/api.env`, `presence.env` and `web.env`. Optionally `SENTRY_RELEASE=<the release folder or commit>` so Sentry can say which deploy an error started in.
4. `npm run check:env -- /etc/voxelventure/api.env` (a DSN that cannot be read stops the API from starting), then `systemctl restart voxelventure-api voxelventure-presence voxelventure-web`. No rebuild is needed.
5. *Alerts > Create alert*: "a new issue is created" and "an issue changes state from resolved to unresolved", sent to your email. The default "high priority issues" alert can stay.
6. Staging: the same DSN in `/etc/voxelventure/staging/*.env`; `deploy/staging.sh` already sets `SENTRY_ENVIRONMENT=staging`, so its errors are kept apart. Filter alerts to `environment:production` if staging's errors should not email you.

How it is wired: there is no Sentry SDK. [`lib/net/sentry.mjs`](../lib/net/sentry.mjs) posts one event per error in Sentry's envelope format, which keeps the servers free of new dependencies.

- **API** ([`services/api/server.mjs`](../services/api/server.mjs)): every 500, tagged with the route (ids and tokens replaced by `:id`), and a crash before the process exits (systemd restarts it).
- **Presence** ([`services/multiplayer/server.mjs`](../services/multiplayer/server.mjs)): its own uncaught errors, and the app errors players' browsers already send it (`error` and `unhandledrejection` only: not browser extensions, lost graphics cards, missing images or console lines). These are tagged `web-client` with the page.
- **Web** ([`apps/web/instrumentation.js`](../apps/web/instrumentation.js)): errors while rendering a page, in a route handler or a server action, tagged with the route file and the digest that matches the line in `journalctl -u voxelventure-web`.

Nothing personal goes: no player name, network, email or IP address, only the error, its stack, the service and the page or route. The same error is sent at most once a minute per process, and at most 30 errors a minute in all, so a loop cannot use up the free plan's monthly allowance. The privacy policy's "Who else we share it with" table lists Sentry.

## UptimeRobot (uptime)

Make four monitors, 5-minute interval, alert contact your email (add the mobile app for a push, too):

| Monitor | Type | Address | Keyword |
| --- | --- | --- | --- |
| Site | HTTP(s) | `https://voxelventure.app/legal` | |
| API | Keyword | `https://api.voxelventure.app/health` | `"ok":true` (alert when it does **not** exist) |
| Presence | Keyword | `https://play.voxelventure.app/health` | `"ok":true` (alert when it does **not** exist) |
| Staging (optional) | HTTP(s) | `https://staging.voxelventure.app/legal` | |

`/legal` is a light page with no 3D, so it shows whether the Next.js server answers. The API's `/health` also reads the database, so it fails if the database does. Turn on the SSL-expiry notification for the site monitor if your plan has it: Caddy renews the certificates, and this tells you if it ever stops.

UptimeRobot's free plan is, at the time of writing, for non-commercial use only; a site that takes payments needs the Solo plan. Check their current terms.

## Healthchecks.io (the nightly backup)

1. Make a check named `voxelventure-backup`: period **1 day**, grace **2 hours** (or schedule `15 3 * * *` with your server's time zone), email integration on.
2. Put its ping address in `/etc/voxelventure/backup.env`:
   ```
   HEALTHCHECK_URL=https://hc-ping.com/<uuid>
   ```
3. Install the new script (it is copied, not linked, by `setup.sh`): `install -m 755 /srv/voxelventure/deploy/backup.sh /usr/local/bin/voxelventure-backup`.
4. Run it once by hand: `sudo -u voxel voxelventure-backup`. The check turns green.

[`deploy/backup.sh`](backup.sh) pings the address when the copy and its upload both worked, and pings `/fail` when either did not, including a failed `rclone` upload, which before only printed a line. So you are emailed both when the backup fails and when it never ran (cron stopped, the machine was off).

## The presence monitor (`/admin`)

`https://voxelventure.app/admin` shows every connected device, its frame rate and the errors it reported. It is behind the admin sign-in (`/admin/login`), not Caddy's password any more:

- **Signing in:** admin accounts are in the API's database. The first is made once at `/admin/setup` with the `ADMIN_TOKEN`; others at `/admin/admins`; your own password at `/admin/password`. Forgotten password: `npm run admin:reset-password -- <username>` on the server. Every step is in [README.md](README.md#admin-sign-in).
- **Where its figures come from:** the page asks the API (`GET /admin/presence`), which reads the presence server's `/status` on the machine itself (`http://127.0.0.1:3001/status`, or `MP_STATUS_URL`). `/status` is not reachable from outside: `/mp-status` on the site and `/status` on `play.` answer 404. "The presence server cannot be reached" on the page means the presence service is down: `systemctl status voxelventure-presence`.
- **The switch from Caddy's password** happens once, in the order in [README.md](README.md#switching-from-caddys-password-to-the-sign-in-once-on-production): deploy, create the account at `/admin/setup`, check the sign-in, then remove `basic_auth` from `/etc/caddy/Caddyfile` and reload Caddy.
- **Sign-in trouble shows in the audit trail:** `npm run moderate -- audit admin` (with `ADMIN_TOKEN`) lists the sign-ins, `admin.login_failed` and `admin.lockout` entries. A lockout lasts 15 minutes, or until the API restarts.

## When an alert comes

- **Sentry:** the issue shows the stack and the route. `journalctl -u voxelventure-<service> --since "10 min ago"` has the surrounding log lines. Mark it resolved once the fix is deployed: it emails again only if it comes back.
- **UptimeRobot:** `systemctl status voxelventure-api voxelventure-presence voxelventure-web caddy`, then the logs. If the Linode itself does not answer, use Lish in the Linode dashboard. A bad deploy: roll back as in [README.md](README.md#updating).
- **Healthchecks.io:** run `sudo -u voxel voxelventure-backup` and read what it prints; `RCLONE_CONFIG=/etc/voxelventure/rclone.conf rclone lsf linode:voxelventure-backups` shows whether the upload reached the bucket.
