#!/usr/bin/env bash
# A safe copy of the SQLite database (taken with SQLite's own .backup, so it is consistent while the game is running), compressed, kept
# for 14 days, and optionally sent to an S3-compatible store (Linode Object Storage) with rclone.
#
# Settings (all optional), read from /etc/voxelventure/backup.env if it exists:
#   API_DB          the database file         (default /srv/voxelventure/services/api/data/voxelventure.db)
#   MESSAGING_DB    the messaging service's   (default /srv/voxelventure/services/messaging/data/messaging.db; skipped if it is not there)
#   BACKUP_DIR      where copies are kept     (default /var/backups/voxelventure)
#   BACKUP_KEEP     how many days to keep     (default 14)
#   RCLONE_REMOTE   e.g. linode:voxelventure-backups  (leave empty to skip the upload; the remote is set up in deploy/README.md)
#   RCLONE_CONFIG   rclone's settings file    (default /etc/voxelventure/rclone.conf when it exists: readable by the voxel user, unlike root's)
#   RCLONE_KEEP     days the bucket keeps     (default 30)
set -euo pipefail

[ -f /etc/voxelventure/backup.env ] && . /etc/voxelventure/backup.env
DB="${API_DB:-/srv/voxelventure/services/api/data/voxelventure.db}"
DIR="${BACKUP_DIR:-/var/backups/voxelventure}"
KEEP="${BACKUP_KEEP:-14}"
if [ -z "${RCLONE_CONFIG:-}" ] && [ -f /etc/voxelventure/rclone.conf ]; then export RCLONE_CONFIG=/etc/voxelventure/rclone.conf; fi
[ -n "${RCLONE_CONFIG:-}" ] && export RCLONE_CONFIG

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
  rclone copy "$OUT.gz" "$RCLONE_REMOTE" && echo "Uploaded to $RCLONE_REMOTE"
fi

# the messaging service's database, once it runs (docs/architecture/node_fastapi_architecture_plan.md): the same way, beside it
MDB="${MESSAGING_DB:-/srv/voxelventure/services/messaging/data/messaging.db}"
if [ -f "$MDB" ]; then
  MOUT="$DIR/messaging-$STAMP.db"
  sqlite3 "$MDB" ".backup '$MOUT'"
  sqlite3 "$MOUT" "SELECT COUNT(*) FROM conversations;" >/dev/null
  gzip -f "$MOUT"
  echo "Backed up to $MOUT.gz"
  if [ -n "${RCLONE_REMOTE:-}" ]; then rclone copy "$MOUT.gz" "$RCLONE_REMOTE" && echo "Uploaded to $RCLONE_REMOTE"; fi
fi

find "$DIR" \( -name 'voxelventure-*.db.gz' -o -name 'messaging-*.db.gz' \) -mtime +"$KEEP" -delete
# and in the bucket, only this script's own files
if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone delete "$RCLONE_REMOTE" --min-age "${RCLONE_KEEP:-30}d" --include 'voxelventure-*.db.gz' --include 'messaging-*.db.gz' || echo "Could not prune $RCLONE_REMOTE"
fi
