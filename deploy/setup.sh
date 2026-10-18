#!/usr/bin/env bash
# First-time setup of a fresh Ubuntu server (24.04 or newer) (a Linode): run as root, from the project folder you copied to /srv/voxelventure.
#   sudo bash deploy/setup.sh
# It installs Node 22, Caddy, Python (for the messaging service) and the SQLite tools, makes the `voxel` user, installs the systemd units
# and the firewall rules.
# It does not start anything: fill in /etc/voxelventure/*.env and the Caddyfile first (see deploy/README.md).
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run this as root (sudo bash deploy/setup.sh)"; exit 1; fi
APP=/srv/voxelventure
if [ ! -f "$APP/package.json" ]; then echo "Copy the project to $APP first"; exit 1; fi

apt-get update
apt-get install -y curl ca-certificates gnupg ufw sqlite3 debian-keyring debian-archive-keyring apt-transport-https python3 python3-venv

# Node 22 (LTS)
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Caddy
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# The user that runs the game, and the places it writes to
id voxel >/dev/null 2>&1 || useradd --system --home-dir "$APP" --shell /usr/sbin/nologin voxel
mkdir -p "$APP/services/api/data" "$APP/services/multiplayer/logs" "$APP/apps/web/.next/cache" "$APP/services/messaging/data" /etc/voxelventure /var/backups/voxelventure
chown -R voxel:voxel "$APP/services/api/data" "$APP/services/multiplayer/logs" "$APP/apps/web/.next" "$APP/services/messaging/data" /var/backups/voxelventure

# The project belongs to the voxel user, which installs and builds it (the services can still write only to their data folders:
# ProtectSystem=strict in the units). Root's git may then work in it (it refuses a repository another user owns).
chown -R voxel:voxel "$APP"
if [ -d "$APP/.git" ]; then git config --global --get-all safe.directory | grep -qx "$APP" || git config --global --add safe.directory "$APP"; fi

# The Python messaging service's environment, with the pinned packages (it is installed but not started: see deploy/README.md)
[ -x "$APP/services/messaging/.venv/bin/python" ] || python3 -m venv "$APP/services/messaging/.venv"
"$APP/services/messaging/.venv/bin/pip" install --disable-pip-version-check -r "$APP/services/messaging/requirements.txt"

# The settings files (only copied if they are not there yet: your edits are never overwritten)
for f in api presence web messaging; do
  [ -f "/etc/voxelventure/$f.env" ] || cp "$APP/deploy/env/$f.env.example" "/etc/voxelventure/$f.env"
done
# The secrets: each still-CHANGE_ME one gets a long random value, the same in every file that names it (MP_NOTIFY_SECRET,
# IP_SALT, ADMIN_TOKEN and INTERNAL_SECRET are shared between files and must match). Values already set are left alone.
for name in ADMIN_TOKEN IP_SALT MP_NOTIFY_SECRET REFERRAL_SECRET INTERNAL_SECRET; do
  value=$(openssl rand -hex 32)
  sed -i -E "s/^(# ?)?$name=CHANGE_ME.*/\1$name=$value/" /etc/voxelventure/*.env
done
chown root:voxel /etc/voxelventure/*.env
chmod 640 /etc/voxelventure/*.env

# The services
cp "$APP"/deploy/systemd/*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable voxelventure-api voxelventure-presence voxelventure-web
# voxelventure-messaging is enabled only at the switch-over (deploy/README.md, "Moving messaging to the Python service")

# Firewall: web and SSH only. (Linode's Cloud Firewall in the dashboard is a second layer: allow 80 and 443 to everyone, 22 from your own address.)
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Nightly database backup
install -m 755 "$APP/deploy/backup.sh" /usr/local/bin/voxelventure-backup
cat >/etc/cron.d/voxelventure-backup <<'CRON'
# every night at 03:15, as the voxel user
15 3 * * * voxel /usr/local/bin/voxelventure-backup
CRON

echo
echo "Done. Next:"
echo "  1. read /etc/voxelventure/api.env, presence.env and web.env (secrets are filled in; add mail and Stripe when ready),"
echo "     then: cd $APP && sudo -u voxel npm ci && node scripts/check-env.mjs /etc/voxelventure/api.env /etc/voxelventure/web.env"
echo "  2. put a caddy hash-password hash in deploy/Caddyfile, copy it to /etc/caddy/Caddyfile, then: systemctl reload caddy"
echo "  3. bash $APP/deploy/production.sh migrate --check, then: bash $APP/deploy/production.sh migrate"
echo "     (it builds the first release in $APP/releases/, links it as $APP/current, and starts the three services)"
