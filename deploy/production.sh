#!/usr/bin/env bash
# Production on releases: each deploy is built in its own folder while the live one keeps serving, then switched to in a second, and switched
# back by itself if it does not come up; a rollback is the same switch the other way (2 seconds on staging). The same layout as staging
# (deploy/STAGING.md), for voxelventure.app. The runbook is deploy/README.md, "Updating". Run as root.
#
#   bash deploy/production.sh migrate --check   read-only: what the move to releases would do, and whether everything it needs is there
#   bash deploy/production.sh migrate           once: from the old in-place folder to releases (a few seconds down; undone by itself on failure)
#   bash deploy/production.sh deploy            build /srv/voxelventure/incoming (push.ps1 copies it there) as a new release and switch to it
#   bash deploy/production.sh deploy --from /srv/voxelventure/repo    the same from the git clone (after: git -C /srv/voxelventure/repo pull)
#   bash deploy/production.sh rollback          switch back to the release before the live one
#   bash deploy/production.sh status            the releases, which one is live, the services, the database
#
# The layout, under /srv/voxelventure:
#   releases/<date>/   the code of each release (kept: the newest three, and always the live one and the one before it)
#   current            a link to the live release: the services run from it
#   shared/data/       the database, the email outbox and the snapshots taken before each switch (never inside a release)
#   shared/logs/       the presence server's error log
#   incoming/          what push.ps1 copies, the source of the next release
#   repo/              the git clone the old layout ran from (moved, not deleted), a source with --from
# Before each switch the database is backed up (the nightly backup, so it also goes off the machine) and copied to shared/data/snapshots/.
# A rollback leaves the database as it is: the API only ever adds columns, so older code still reads it.
set -Eeuo pipefail # -E: the move's automatic undo (trap ERR) also covers a failure inside a helper function

BASE=/srv/voxelventure
ETC=/etc/voxelventure
SHARED="$BASE/shared"
DB="$SHARED/data/voxelventure.db"
OLD_DB="$BASE/services/api/data/voxelventure.db" # where the old in-place layout keeps it
KEEP=${PRODUCTION_KEEP:-3}
CARRY_DAYS=${CARRY_DAYS:-14} # how long a release keeps the site files of the ones before it (carry_static)
UNITS=(voxelventure-api voxelventure-presence voxelventure-web)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" # the project this script came with
# Out of the folder it was started from: the voxel user runs parts of this (the backup, npm), and a folder it cannot enter (root's home)
# makes them fail ("find: Failed to restore initial working directory"). HERE above already knows where the project is.
STARTED_IN="$PWD" # (a folder given on the command line is read from where the script was started)
abs() { case "$1" in /*|[A-Za-z]:/*) printf %s "$1" ;; *) printf %s "$STARTED_IN/$1" ;; esac; }
cd /
# what never goes into a release: the folders of the layout itself, what each release makes for itself, and data
EXCLUDES=(--exclude /releases --exclude /shared --exclude /incoming --exclude /current --exclude /current.next --exclude /repo
  --exclude /.npm --exclude /.config --exclude .git --exclude node_modules --exclude /apps/web/.next --exclude /services/api/data
  --exclude /services/multiplayer/logs --exclude /services/messaging/.venv --exclude /services/messaging/data --exclude /artifacts)

say() { printf '\n== %s\n' "$*"; }
die() { printf 'production: %s\n' "$*" >&2; exit 1; }
need_root() { [ "$(id -u)" -eq 0 ] || die "run this as root (sudo bash deploy/production.sh $1)"; }
migrated() { [ -L "$BASE/current" ]; }
# (readlink -f answers even for a link that is not there, so the link is tested first; before the move there are no releases at all)
live_release() { if [ -L "$BASE/current" ]; then readlink -f "$BASE/current"; fi; }
releases() { if [ -d "$BASE/releases" ]; then find "$BASE/releases" -mindepth 1 -maxdepth 1 -type d | sort; fi; }

# the three processes answer on this machine (the API with its world, the presence server, the site's pages)
healthy() {
  local i
  for i in $(seq 1 60); do
    if curl -fsS http://127.0.0.1:3002/health >/dev/null 2>&1 && curl -fsS http://127.0.0.1:3001/health >/dev/null 2>&1 && curl -fsS -o /dev/null http://127.0.0.1:3000/legal 2>/dev/null; then
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
  mkdir -p "$SHARED/data/snapshots"
  local out="$SHARED/data/snapshots/before-$1.db"
  sqlite3 "$DB" ".backup '$out'"
  chown voxel:voxel "$out"
  echo "database copied to $out"
  find "$SHARED/data/snapshots" -name 'before-*.db' | sort | head -n -10 | xargs -r rm -f # keep the newest ten
}

# the site's files from the live release (the hashed /_next/static chunks), copied into a new one: a page opened before the switch still loads
# the parts it fetches later (opening a building, the editor) instead of failing with a ChunkLoadError. The new build's own files win; carried
# ones keep their age and go after CARRY_DAYS (the new build's are just made, so they never do).
carry_static() {
  local from="$1/apps/web/.next/static" to="$2/apps/web/.next/static"
  [ -d "$from" ] && [ -d "$to" ] || return 0
  cp -rp --update=none "$from/." "$to/"
  find "$to" -type f -mtime +"$CARRY_DAYS" -delete
}

# a new release from `src`: the code copied, its packages installed and the site built with production's settings (checked to be in it)
build_release() {
  local src="$1" rel="$2"
  rsync -a --delete "${EXCLUDES[@]}" "$src/" "$rel/"
  chown -R voxel:voxel "$rel"
  (
    cd "$rel"
    sudo -u voxel npm ci --no-audit --no-fund
    bash deploy/build-web.sh "$ETC/web.env"
  )
  mkdir -p "$rel/apps/web/.next/cache"
  chown -R voxel:voxel "$rel/apps/web/.next"
}

# sets KEY=value in a settings file: replaces the line if it is there (even commented out), adds it if not
set_setting() {
  local file="$1" key="$2" value="$3"
  if grep -qE "^#? ?$key=" "$file"; then sed -i -E "s#^\#? ?$key=.*#$key=$value#" "$file"; else printf '%s=%s\n' "$key" "$value" >> "$file"; fi
}

cmd_migrate() {
  need_root migrate
  local check="${1:-}"
  migrated && die "already on releases ($(live_release)): use deploy"
  [ -f "$BASE/package.json" ] || die "no project at $BASE"
  [ -f "$ETC/api.env" ] && [ -f "$ETC/presence.env" ] && [ -f "$ETC/web.env" ] || die "the settings are not in $ETC"
  [ -f "$HERE/deploy/systemd/voxelventure-api.service" ] || die "this copy of the script has no service files: run it from the project"
  grep -q "WorkingDirectory=$BASE/current" "$HERE/deploy/systemd/voxelventure-api.service" || die "this copy's service files are for the old layout: update the project first"
  for t in rsync sqlite3 curl; do command -v "$t" >/dev/null || die "$t is not installed"; done
  local free_mb; free_mb=$(df -Pm "$BASE" | awk 'NR == 2 { print $4 }')
  [ "$free_mb" -gt 3000 ] || die "only ${free_mb} MB free on the disk: a release needs about 1.5 GB"

  say "the move to releases"
  echo "  code       $BASE (the in-place clone)  ->  $BASE/releases/<date>, live as $BASE/current"
  echo "  database   $OLD_DB  ->  $DB$( [ -f "$OLD_DB" ] && echo " ($(sqlite3 "$OLD_DB" 'SELECT COUNT(*) FROM accounts;') accounts, $(du -h "$OLD_DB" | cut -f1))" || echo " (none yet: a fresh server)")"
  echo "  outbox     $BASE/services/api/data/outbox  ->  $SHARED/data/outbox"
  echo "  logs       $BASE/services/multiplayer/logs  ->  $SHARED/logs"
  echo "  settings   API_DB, MAIL_DIR (api.env), MP_LOG_DIR (presence.env), API_DB (backup.env)"
  echo "  services   ${UNITS[*]}: from the new service files (they run $BASE/current)"
  echo "  the old clone moves to $BASE/repo (nothing is deleted); disk free: ${free_mb} MB"
  if [ "$check" = "--check" ]; then
    node "$HERE/scripts/check-env.mjs" "$ETC/api.env" "$ETC/web.env"
    echo
    echo "Everything the move needs is there. Nothing was changed. Run without --check to do it."
    return 0
  fi

  local stamp rel keep
  stamp="$(date +%Y%m%d-%H%M%S)"
  rel="$BASE/releases/$stamp"
  keep="$SHARED/before-releases-$stamp" # copies of everything the move changes, to put back if it fails
  mkdir -p "$BASE/releases" "$BASE/incoming" "$SHARED/data/outbox" "$SHARED/data/snapshots" "$SHARED/logs" "$keep"
  chown voxel:voxel "$BASE/releases" "$BASE/incoming" "$SHARED" "$SHARED/data" "$SHARED/data/outbox" "$SHARED/data/snapshots" "$SHARED/logs"

  say "the first release, built while the site keeps running"
  build_release "$BASE" "$rel"

  say "a backup first (also uploaded off the machine)"
  [ -f "$OLD_DB" ] && sudo -u voxel voxelventure-backup
  cp -p "$ETC/api.env" "$ETC/presence.env" "$keep/"
  [ -f "$ETC/backup.env" ] && cp -p "$ETC/backup.env" "$keep/"
  for u in "${UNITS[@]}"; do cp -p "/etc/systemd/system/$u.service" "$keep/"; done
  cp -p /usr/local/bin/voxelventure-backup "$keep/" 2>/dev/null || true

  # if anything below fails: the old settings and services back, the old layout started again
  revert() {
    trap - ERR # (a failure while undoing must not start the undo again)
    echo "the move did not work: putting the old layout back" >&2
    systemctl stop "${UNITS[@]}" || true
    cp -p "$keep/api.env" "$keep/presence.env" "$ETC/"
    if [ -f "$keep/backup.env" ]; then cp -p "$keep/backup.env" "$ETC/"; else rm -f "$ETC/backup.env"; fi
    for u in "${UNITS[@]}"; do cp -p "$keep/$u.service" /etc/systemd/system/; done
    [ -f "$keep/voxelventure-backup" ] && cp -p "$keep/voxelventure-backup" /usr/local/bin/
    rm -f "$BASE/current"
    systemctl daemon-reload
    systemctl start "${UNITS[@]}"
    healthy && die "the old layout is running again, unchanged (the new release is kept in $rel; journalctl -u voxelventure-api says what went wrong)"
    die "the old layout did not come back either: journalctl -u voxelventure-api -u voxelventure-web"
  }
  trap revert ERR

  say "the switch (the site is down until the services start again)"
  systemctl stop "${UNITS[@]}"
  if [ -f "$OLD_DB" ]; then
    sqlite3 "$OLD_DB" ".backup '$DB'"
    [ "$(sqlite3 "$DB" 'PRAGMA integrity_check;')" = "ok" ] || false
    [ "$(sqlite3 "$DB" 'SELECT COUNT(*) FROM plots;')" = "$(sqlite3 "$OLD_DB" 'SELECT COUNT(*) FROM plots;')" ] || false
    [ "$(sqlite3 "$DB" 'SELECT COUNT(*) FROM accounts;')" = "$(sqlite3 "$OLD_DB" 'SELECT COUNT(*) FROM accounts;')" ] || false
  fi
  [ -d "$BASE/services/api/data/outbox" ] && cp -a "$BASE/services/api/data/outbox/." "$SHARED/data/outbox/"
  [ -d "$BASE/services/multiplayer/logs" ] && cp -a "$BASE/services/multiplayer/logs/." "$SHARED/logs/"
  chown -R voxel:voxel "$SHARED/data" "$SHARED/logs"
  set_setting "$ETC/api.env" API_DB "$DB"
  set_setting "$ETC/api.env" MAIL_DIR "$SHARED/data/outbox"
  set_setting "$ETC/presence.env" MP_LOG_DIR "$SHARED/logs"
  [ -f "$ETC/backup.env" ] || install -o root -g voxel -m 640 /dev/null "$ETC/backup.env"
  set_setting "$ETC/backup.env" API_DB "$DB"
  install -m 755 "$rel/deploy/backup.sh" /usr/local/bin/voxelventure-backup
  for u in "${UNITS[@]}"; do cp "$rel/deploy/systemd/$u.service" /etc/systemd/system/; done
  systemctl daemon-reload
  ln -sfn "$rel" "$BASE/current"
  systemctl start "${UNITS[@]}"
  healthy || false
  trap - ERR

  say "the old clone, kept as $BASE/repo"
  mkdir -p "$BASE/repo"
  local entry
  for entry in "$BASE"/* "$BASE"/.[!.]*; do
    [ -e "$entry" ] || continue
    case "$(basename "$entry")" in releases|shared|incoming|current|repo|.npm|.config) continue ;; esac
    mv "$entry" "$BASE/repo/"
  done
  # its database folder is no longer used: renamed, so nothing mistakes it for the live one
  [ -d "$BASE/repo/services/api/data" ] && mv "$BASE/repo/services/api/data" "$BASE/repo/services/api/data.before-releases"
  chown -R voxel:voxel "$BASE/repo"
  [ -d "$BASE/repo/.git" ] && { git config --global --get-all safe.directory 2>/dev/null | grep -qx "$BASE/repo" || git config --global --add safe.directory "$BASE/repo"; }

  echo
  echo "live: $rel. Production now runs on releases; deploys are: bash $BASE/current/deploy/production.sh deploy"
  echo "The copies of the old settings and services are in $keep."
  echo "Check it: cd $BASE/current && VERIFY_ADMIN_TOKEN=\"\$(grep ^ADMIN_TOKEN= $ETC/api.env | cut -d= -f2)\" npm run verify:live -- --api https://api.voxelventure.app --site https://voxelventure.app"
}

cmd_deploy() {
  need_root deploy
  migrated || die "production is still in the old layout: run  bash deploy/production.sh migrate  first"
  local src="$BASE/incoming"
  if [ "${1:-}" = "--from" ]; then src="$(abs "${2:-}")"; fi
  [ -f "$src/package.json" ] || die "nothing to deploy in $src: copy the project there (push.ps1), or use --from $BASE/repo after a git pull"

  say "settings check"
  node "$src/scripts/check-env.mjs" "$ETC/api.env" "$ETC/web.env"

  local stamp rel prev
  stamp="$(date +%Y%m%d-%H%M%S)"
  rel="$BASE/releases/$stamp"
  prev="$(live_release)"

  say "release $stamp, built while the live one keeps serving"
  build_release "$src" "$rel"
  [ -n "$prev" ] && carry_static "$prev" "$rel"

  say "a backup, then the switch"
  sudo -u voxel voxelventure-backup
  snapshot "$stamp"
  install -m 755 "$rel/deploy/backup.sh" /usr/local/bin/voxelventure-backup
  switch_to "$rel"
  if healthy; then
    echo "live: $rel"
  else
    if [ -n "$prev" ] && [ -d "$prev" ]; then
      echo "the new release did not come up: switching back to $prev" >&2
      install -m 755 "$prev/deploy/backup.sh" /usr/local/bin/voxelventure-backup
      switch_to "$prev"
      healthy && die "rolled back to $prev (the failed release is kept in $rel; journalctl -u voxelventure-api says why)"
    fi
    die "production is not answering: journalctl -u voxelventure-api -u voxelventure-web"
  fi

  say "old releases (keeping $KEEP)"
  local live
  live="$(live_release)"
  releases | head -n -"$KEEP" | while read -r r; do
    [ "$r" = "$live" ] || [ "$r" = "$prev" ] || { rm -rf "$r"; echo "removed $r"; }
  done

  echo
  echo "Check it: cd $BASE/current && VERIFY_ADMIN_TOKEN=\"\$(grep ^ADMIN_TOKEN= $ETC/api.env | cut -d= -f2)\" \\"
  echo "  npm run verify:live -- --api https://api.voxelventure.app --site https://voxelventure.app"
}

cmd_rollback() {
  need_root rollback
  migrated || die "production is still in the old layout: there is no release to go back to"
  local live target
  live="$(live_release)"
  target="$(releases | awk -v live="$live" '$0 < live' | tail -n 1)"
  [ -n "$target" ] || die "no release before $live to go back to"
  say "rollback: $(basename "$live") -> $(basename "$target")"
  switch_to "$target"
  healthy || die "production is not answering after the rollback: journalctl -u voxelventure-api -u voxelventure-web"
  echo "live: $target"
  echo "The database was not rolled back. To put it back as it was before $(basename "$live") went live too (losing what happened since):"
  echo "  systemctl stop voxelventure-api && cp $SHARED/data/snapshots/before-$(basename "$live").db $DB && rm -f $DB-wal $DB-shm && chown voxel:voxel $DB && systemctl start voxelventure-api"
}

cmd_status() {
  local live r
  if ! migrated; then echo "layout: the old in-place one ($BASE); run  bash deploy/production.sh migrate --check"; fi
  live="$(live_release)"
  echo "live release: ${live:-none}"
  echo "releases:"
  releases | while read -r r; do echo "  $(basename "$r")$([ "$r" = "$live" ] && echo '   <- live')"; done
  echo "services:"
  for r in "${UNITS[@]}"; do echo "  $r: $(systemctl is-active "$r" || true)"; done
  local db="$DB"; [ -f "$db" ] || db="$OLD_DB"
  [ -f "$db" ] && echo "database: $db ($(sqlite3 "$db" 'SELECT COUNT(*) FROM accounts;' 2>/dev/null || echo '?') accounts, $(sqlite3 "$db" 'SELECT COUNT(*) FROM businesses;' 2>/dev/null || echo '?') business profiles)"
  return 0
}

case "${1:-}" in
  migrate) cmd_migrate "${2:-}" ;;
  deploy) cmd_deploy "${2:-}" "${3:-}" ;;
  rollback) cmd_rollback ;;
  status) cmd_status ;;
  *) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
