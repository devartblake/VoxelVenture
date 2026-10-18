#!/usr/bin/env bash
# A safe copy of the SQLite database (taken with SQLite's own .backup, so it is consistent while the game is running), compressed, kept
# for 14 days, and optionally sent to an S3-compatible store (Linode Object Storage) with rclone.
#
# Settings (all optional), read from /etc/voxelventure/backup.env if it exists:
#   API_DB          the database file         (default /srv/voxelventure/services/api/data/voxelventure.db)
#   MESSAGING_DB    the messaging service's   (default /srv/voxelventure/services/messaging/data/messaging.db; skipped if it is not there)
#   BACKUP_DIR      where copies are kept     (default /var/backups/voxelventure)
#   BACKUP_KEEP     how many days to keep     (default 14)
#   RCLONE_REMOTE   e.g. linode:voxelventure-backups  (leave empty to skip the upload; set up the remote once with `rclone config`)
#   HEALTHCHECK_URL a Healthchecks.io ping address (deploy/MONITORING.md): pinged when the backup and its upload worked, and at /fail
#                   when anything did not, so a night with no backup (or no off-site copy) emails you
set -euo pipefail

[ -f /etc/voxelventure/backup.env ] && . /etc/voxelventure/backup.env
heartbeat() { if [ -n "${HEALTHCHECK_URL:-}" ]; then curl -fsS -m 10 --retry 3 -o /dev/null "${HEALTHCHECK_URL%/}$1" || echo "Could not reach $HEALTHCHECK_URL"; fi; }
trap 'if [ $? -eq 0 ]; then heartbeat ""; else heartbeat /fail; fi' EXIT
UPLOAD_FAILED=0
DB="${API_DB:-/srv/voxelventure/services/api/data/voxelventure.db}"
DIR="${BACKUP_DIR:-/var/backups/voxelventure}"
KEEP="${BACKUP_KEEP:-14}"

[ -f "$DB" ] || { echo "No database at $DB"; exit 1; }
mkdir -p "$DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$DIR/voxelventure-$STAMP.db"

sqlite3 "$DB" ".backup '$OUT'"
# the copy must open and hold the world
sqlite3 "$OUT" "SELECT COUNT(*) FROM plots;" >/dev/null
gzip -f "$OUT"
echo "Backed up to $OUT.gz"

if [ -n "${RCLONE_REMOTE:-}" ]; then
  if rclone copy "$OUT.gz" "$RCLONE_REMOTE"; then echo "Uploaded to $RCLONE_REMOTE"; else echo "Upload to $RCLONE_REMOTE failed"; UPLOAD_FAILED=1; fi
fi

# the messaging service's database, once it runs (docs/architecture/node_fastapi_architecture_plan.md): the same way, beside it
MDB="${MESSAGING_DB:-/srv/voxelventure/services/messaging/data/messaging.db}"
if [ -f "$MDB" ]; then
  MOUT="$DIR/messaging-$STAMP.db"
  sqlite3 "$MDB" ".backup '$MOUT'"
  sqlite3 "$MOUT" "SELECT COUNT(*) FROM conversations;" >/dev/null
  gzip -f "$MOUT"
  echo "Backed up to $MOUT.gz"
  if [ -n "${RCLONE_REMOTE:-}" ]; then
    if rclone copy "$MOUT.gz" "$RCLONE_REMOTE"; then echo "Uploaded to $RCLONE_REMOTE"; else echo "Upload to $RCLONE_REMOTE failed"; UPLOAD_FAILED=1; fi
  fi
fi

find "$DIR" \( -name 'voxelventure-*.db.gz' -o -name 'messaging-*.db.gz' \) -mtime +"$KEEP" -delete
# the copies are kept here either way; a failed upload still counts as a failed night, so the heartbeat says so
exit "$UPLOAD_FAILED"
