#!/usr/bin/env bash
set -euo pipefail

RETENTION_HOURS="${IMAGE_PRUNE_RETENTION_HOURS:-168}"

if ! [[ "$RETENTION_HOURS" =~ ^[1-9][0-9]*$ ]]; then
  echo "IMAGE_PRUNE_RETENTION_HOURS must be a whole number of hours above zero, got: $RETENTION_HOURS" >&2
  exit 2
fi

echo "[prune] $(date -u +%Y-%m-%dT%H:%M:%SZ) removing images no container uses, built more than ${RETENTION_HOURS}h ago"
docker image prune -af --filter "until=${RETENTION_HOURS}h"
echo "[prune] disk after: $(df -h / | awk 'NR == 2 { print $4 " free, " $5 " used" }')"
