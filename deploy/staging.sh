#!/usr/bin/env bash
# Staging: a second copy of VoxelVenture on the production Linode, on its own ports, database and secrets, for the business journeys
# (tests/journeys/) and the deploy and rollback rehearsals of Phase D. The runbook is deploy/STAGING.md. Run as root.
#
#   bash deploy/staging.sh setup             once: folders, settings (fresh secrets), services, Caddy
#   bash deploy/staging.sh deploy            build the code in /srv/voxelventure-staging/incoming as a new release and switch to it
#   bash deploy/staging.sh rollback          switch back to the release before the live one
#   bash deploy/staging.sh status            the releases, which one is live, the services
#   bash deploy/staging.sh reset --yes       an empty database: a fresh city, the journeys' starting point
#   bash deploy/staging.sh restore <file>    put a database copy in place (a staging snapshot, or a production backup to prove it restores)
#   bash deploy/staging.sh render-env <dir>  write the staging settings files to <dir> without installing anything (to read them first)
#
# Each release is a folder under releases/, and `current` is a link to the live one, so a rollback is switching the link back. Before a
# switch the database is copied to data/snapshots/; a rollback leaves the database as it is (the API only ever adds columns, so the older
# code still reads it) unless you also restore the snapshot. Staging never takes a live Stripe key and never sends email.
set -euo pipefail

BASE=/srv/voxelventure-staging
ETC=/etc/voxelventure/staging
DOMAIN=${STAGING_DOMAIN:-staging.voxelventure.app}
KEEP=${STAGING_KEEP:-3}
UNITS=(voxelventure-staging-api voxelventure-staging-presence voxelventure-staging-web)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" # the project this script came with
DB="$BASE/data/voxelventure.db"

say() { printf '\n== %s\n' "$*"; }
die() { printf 'staging: %s\n' "$*" >&2; exit 1; }
need_root() { [ "$(id -u)" -eq 0 ] || die "run this as root (sudo bash deploy/staging.sh $1)"; }

# The production example files, turned into staging's: its addresses, ports and folders. Secrets stay CHANGE_ME here; setup fills them.
render_env() {
  local out="$1"
  mkdir -p "$out"
  local f
  for f in api presence web; do
    sed -E \
      -e "s#https://api\.voxelventure\.app#https://api.$DOMAIN#g" \
      -e "s#wss://play\.voxelventure\.app#wss://play.$DOMAIN#g" \
      -e "s#https://voxelventure\.app#https://$DOMAIN#g" \
      -e "s#^API_PORT=3002#API_PORT=3102#" \
      -e "s#^MP_PORT=3001#MP_PORT=3101#" \
      -e "s#127\.0\.0\.1:3002#127.0.0.1:3102#g" \
      -e "s#127\.0\.0\.1:3001#127.0.0.1:3101#g" \
      -e "s#^API_DB=.*#API_DB=$DB#" \
      -e "s#^MP_LOG_DIR=.*#MP_LOG_DIR=$BASE/logs#" \
      -e "s#^(\# ?)?(MAIL_WEBHOOK_URL|MAIL_WEBHOOK_TOKEN)=.*#\# \2: never on staging (it would email real addresses)#" \
      -e "s#^(\# )?STRIPE_SECRET_KEY=.*#\# STRIPE_SECRET_KEY=sk_test_...   (test keys only: deploy refuses a live key)#" \
      -e "s#/etc/voxelventure/#$ETC/#g" \
      "$HERE/deploy/env/$f.env.example" > "$out/$f.env"
  done
  {
    echo
    echo "# Staging: emails are written here as files, never sent (deploy/STAGING.md)."
    echo "MAIL_DIR=$BASE/data/outbox"
  } >> "$out/api.env"
}

live_release() { readlink -f "$BASE/current" 2>/dev/null || true; }
releases() { find "$BASE/releases" -mindepth 1 -maxdepth 1 -type d | sort; }

# the three processes answer on this machine (the API with its world, the presence server, the site's pages)
healthy() {
  local i
  for i in $(seq 1 60); do
    if curl -fsS http://127.0.0.1:3102/health >/dev/null 2>&1 && curl -fsS http://127.0.0.1:3101/health >/dev/null 2>&1 && curl -fsS -o /dev/null http://127.0.0.1:3100/legal 2>/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

switch_to() {
  ln -sfn "$1" "$BASE/current.next"
  mv -Tf "$BASE/current.next" "$BASE/current" # one rename: never a moment without a live release
  systemctl restart "${UNITS[@]}"
}

snapshot() {
  [ -f "$DB" ] || return 0
  mkdir -p "$BASE/data/snapshots"
  local out
  out="$BASE/data/snapshots/before-$1.db"
  sqlite3 "$DB" ".backup '$out'"
  chown voxel:voxel "$out"
  echo "database copied to $out"
  # keep the newest ten
  find "$BASE/data/snapshots" -name 'before-*.db' | sort | head -n -10 | xargs -r rm -f
}

cmd_setup() {
  need_root setup
  id voxel >/dev/null 2>&1 || die "no voxel user: run deploy/setup.sh for production first"
  command -v caddy >/dev/null || die "no Caddy: run deploy/setup.sh for production first"

  say "folders"
  mkdir -p "$BASE/incoming" "$BASE/releases" "$BASE/data/outbox" "$BASE/logs" "$ETC"
  chown voxel:voxel "$BASE/releases" "$BASE/data" "$BASE/data/outbox" "$BASE/logs"

  say "settings in $ETC (files already there are left alone)"
  local tmp f name value
  tmp="$(mktemp -d)"
  render_env "$tmp"
  for f in api presence web; do
    if [ -f "$ETC/$f.env" ]; then echo "kept $ETC/$f.env"; else cp "$tmp/$f.env" "$ETC/$f.env"; echo "wrote $ETC/$f.env"; fi
  done
  rm -rf "$tmp"
  # fresh secrets, the same in each staging file that shares one, never production's
  for name in ADMIN_TOKEN IP_SALT MP_NOTIFY_SECRET REFERRAL_SECRET; do
    value=$(openssl rand -hex 32)
    sed -i -E "s/^(# ?)?$name=CHANGE_ME.*/\1$name=$value/" "$ETC"/*.env
  done
  chown root:voxel "$ETC"/*.env
  chmod 640 "$ETC"/*.env

  say "services"
  cp "$HERE"/deploy/systemd/staging/*.service /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable "${UNITS[@]}"

  say "Caddy"
  cp "$HERE/deploy/Caddyfile.staging" /etc/caddy/staging.caddy
  grep -q '^import /etc/caddy/staging.caddy' /etc/caddy/Caddyfile || printf '\n# Staging (deploy/STAGING.md)\nimport /etc/caddy/staging.caddy\n' >> /etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  systemctl reload caddy

  echo
  echo "Done. Next (deploy/STAGING.md):"
  echo "  1. read $ETC/api.env, presence.env and web.env"
  echo "  2. deploy: from Windows  .\\deploy\\push.ps1 staging -Deploy  (or copy the project to $BASE/incoming/, then: bash $BASE/incoming/deploy/staging.sh deploy)"
}

cmd_deploy() {
  need_root deploy
  local src="$BASE/incoming"
  [ -f "$src/package.json" ] || die "nothing to deploy: copy the project to $src/ first"
  [ -f "$ETC/api.env" ] || die "no settings: run setup first"
  if grep -Eq '^STRIPE_SECRET_KEY=sk_live_' "$ETC/api.env"; then die "$ETC/api.env has a live Stripe key: staging takes test keys (sk_test_) only"; fi
  if grep -Eq '^MAIL_WEBHOOK_URL=.+' "$ETC/api.env"; then die "$ETC/api.env sends email (MAIL_WEBHOOK_URL): staging must not, remove it"; fi

  say "settings check"
  node "$src/scripts/check-env.mjs" "$ETC/api.env" "$ETC/web.env"

  local stamp rel prev
  stamp="$(date +%Y%m%d-%H%M%S)"
  rel="$BASE/releases/$stamp"
  prev="$(live_release)"

  say "release $stamp"
  rsync -a --delete --exclude node_modules --exclude .next --exclude services/api/data --exclude artifacts --exclude .git "$src/" "$rel/"
  chown -R voxel:voxel "$rel"
  (
    cd "$rel"
    sudo -u voxel npm ci --no-audit --no-fund
    bash deploy/build-web.sh "$ETC/web.env" # with staging's addresses, checked to be in the build
  )
  mkdir -p "$rel/apps/web/.next/cache"
  chown -R voxel:voxel "$rel/apps/web/.next"

  say "switch"
  snapshot "$stamp"
  switch_to "$rel"
  if healthy; then
    echo "live: $rel"
  else
    if [ -n "$prev" ] && [ -d "$prev" ]; then
      echo "the new release did not come up: switching back to $prev" >&2
      switch_to "$prev"
      healthy && die "rolled back to $prev (the failed release is kept in $rel; journalctl -u voxelventure-staging-api says why)"
    fi
    die "staging is not answering: journalctl -u voxelventure-staging-api -u voxelventure-staging-web"
  fi

  say "old releases (keeping $KEEP)"
  local live
  live="$(live_release)"
  releases | head -n -"$KEEP" | while read -r r; do
    [ "$r" = "$live" ] || [ "$r" = "$prev" ] || { rm -rf "$r"; echo "removed $r"; }
  done

  echo
  echo "Check it: VERIFY_ADMIN_TOKEN=\"\$(grep ^ADMIN_TOKEN= $ETC/api.env | cut -d= -f2)\" \\"
  echo "  npm run verify:live -- --api https://api.$DOMAIN --site https://$DOMAIN"
}

cmd_rollback() {
  need_root rollback
  local live target
  live="$(live_release)"
  [ -n "$live" ] || die "no live release yet"
  # the newest release older than the live one
  target="$(releases | awk -v live="$live" '$0 < live' | tail -n 1)"
  [ -n "$target" ] || die "no release before $live to go back to"
  say "rollback: $(basename "$live") -> $(basename "$target")"
  switch_to "$target"
  healthy || die "staging is not answering after the rollback: journalctl -u voxelventure-staging-api -u voxelventure-staging-web"
  echo "live: $target"
  echo "The database was not rolled back. To put it back as it was before $(basename "$live") went live too:"
  echo "  bash $0 restore $BASE/data/snapshots/before-$(basename "$live").db"
}

cmd_status() {
  local live r
  live="$(live_release)"
  echo "live release: ${live:-none}"
  echo "releases:"
  releases | while read -r r; do echo "  $(basename "$r")$([ "$r" = "$live" ] && echo '   <- live')"; done
  echo "services:"
  for r in "${UNITS[@]}"; do echo "  $r: $(systemctl is-active "$r" || true)"; done
  [ -f "$DB" ] && echo "database: $DB ($(sqlite3 "$DB" 'SELECT COUNT(*) FROM accounts;' 2>/dev/null || echo '?') accounts, $(sqlite3 "$DB" 'SELECT COUNT(*) FROM businesses;' 2>/dev/null || echo '?') business profiles)"
  return 0
}

cmd_reset() {
  need_root reset
  [ "${1:-}" = "--yes" ] || die "this empties staging's database (a copy is kept in data/snapshots/): run it as  reset --yes"
  say "reset"
  systemctl stop voxelventure-staging-api
  snapshot "reset-$(date +%Y%m%d-%H%M%S)"
  rm -f "$DB" "$DB-wal" "$DB-shm"
  find "$BASE/data/outbox" -type f -delete 2>/dev/null || true
  systemctl start voxelventure-staging-api
  systemctl restart voxelventure-staging-presence # forget everyone who was connected
  healthy || die "the API did not come back: journalctl -u voxelventure-staging-api"
  echo "staging has an empty database: a fresh city from API_SEED"
}

cmd_restore() {
  need_root restore
  local file="${1:-}"
  [ -f "$file" ] || die "usage: restore <a .db or .db.gz copy>"
  say "restore $file"
  local tmp
  tmp="$(mktemp)"
  case "$file" in *.gz) gunzip -c "$file" > "$tmp" ;; *) cp "$file" "$tmp" ;; esac
  # it must be a database that holds a world, before it replaces anything
  [ "$(sqlite3 "$tmp" 'PRAGMA integrity_check;')" = "ok" ] || { rm -f "$tmp"; die "$file is not a sound SQLite database"; }
  echo "it holds $(sqlite3 "$tmp" 'SELECT COUNT(*) FROM plots;') plots and $(sqlite3 "$tmp" 'SELECT COUNT(*) FROM accounts;') accounts"
  systemctl stop voxelventure-staging-api
  snapshot "restore-$(date +%Y%m%d-%H%M%S)"
  rm -f "$DB-wal" "$DB-shm"
  install -o voxel -g voxel -m 640 "$tmp" "$DB"
  rm -f "$tmp"
  systemctl start voxelventure-staging-api
  systemctl restart voxelventure-staging-presence
  healthy || die "the API did not start on the restored database: journalctl -u voxelventure-staging-api"
  echo "restored. If this was a production backup, staging now holds real accounts: run  reset --yes  when you are done with it."
}

case "${1:-}" in
  setup) cmd_setup ;;
  deploy) cmd_deploy ;;
  rollback) cmd_rollback ;;
  status) cmd_status ;;
  reset) cmd_reset "${2:-}" ;;
  restore) cmd_restore "${2:-}" ;;
  render-env) [ -n "${2:-}" ] || die "usage: render-env <dir>"; render_env "$2"; echo "wrote $2/api.env, presence.env, web.env" ;;
  *) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
