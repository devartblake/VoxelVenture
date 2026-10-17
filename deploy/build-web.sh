#!/usr/bin/env bash
# Builds the web app as the voxel user with a web.env loaded, then checks the build really has the API address in it.
#   bash deploy/build-web.sh /etc/voxelventure/web.env               (production, from /srv/voxelventure)
#   bash deploy/build-web.sh /etc/voxelventure/staging/web.env       (staging, from the release folder)
# Run as root, from the project folder. The NEXT_PUBLIC_ addresses are fixed into the build, so they must be in the build's own environment.
# Not `sudo -E`: sudo-rs (Ubuntu 25.10 and later) ignores -E ("preserving the entire environment is not supported"), and the build then
# has no API address. The site comes up as a demo with the owner pages switched off, and nothing fails. So the settings are loaded in the
# voxel user's own shell (web.env is root:voxel 640, so voxel can read it), and the result is checked.
set -euo pipefail

ENV_FILE="${1:-}"
[ -f "$ENV_FILE" ] || { echo "build-web: usage: build-web.sh <web.env>"; exit 2; }
[ -f package.json ] || { echo "build-web: run this from the project folder"; exit 2; }
API_URL="$(grep -E '^NEXT_PUBLIC_LIVE_API_URL=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '"'"'"'\r')"
[ -n "$API_URL" ] || { echo "build-web: $ENV_FILE has no NEXT_PUBLIC_LIVE_API_URL"; exit 1; }

sudo -u voxel bash -c 'set -euo pipefail; set -a; . "$1"; set +a; npm run build' build-web "$ENV_FILE"

# the address must be in the pages the browser loads
if ! grep -rqF "$API_URL" apps/web/.next/static; then
  echo "build-web: the build does not contain $API_URL: the site would run as a demo. Not switching to it." >&2
  exit 1
fi
echo "build-web: built for $API_URL"
