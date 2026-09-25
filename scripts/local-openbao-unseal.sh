#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

OPENBAO_LOCAL_ADDR="${OPENBAO_LOCAL_ADDR:-http://127.0.0.1:8200}"
KEY_FILE="${OPENBAO_LOCAL_UNSEAL_KEY_FILE:-$REPO_ROOT/docker/.openbao-local-unseal-key}"
STATIC_SEAL_KEY_FILE="$REPO_ROOT/docker/.openbao-local-static-seal-key"
UNSEAL_WAIT_SECONDS="${OPENBAO_UNSEAL_WAIT_SECONDS:-15}"

read_health_code() {
  curl -s -o /dev/null -w '%{http_code}' "$OPENBAO_LOCAL_ADDR/v1/sys/health" || true
}

is_unsealed() {
  case "$1" in
    200|429|472|473) return 0 ;;
  esac
  return 1
}

wait_until_unsealed() {
  local waited=0
  while [ "$waited" -lt "$UNSEAL_WAIT_SECONDS" ]; do
    if is_unsealed "$(read_health_code)"; then
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done
  is_unsealed "$(read_health_code)"
}

seal_status_says() {
  printf '%s' "$seal_status" | grep -Eq "\"$1\":[[:space:]]*true"
}

print_manual_steps() {
  echo "OpenBao is sealed and no local unseal key is available." >&2
  echo "Unseal it in the UI at $OPENBAO_LOCAL_ADDR/ui, or write your key to:" >&2
  echo "  $KEY_FILE" >&2
  echo "That file is gitignored and is read only by this script." >&2
}

print_migration_steps() {
  echo "OpenBao was initialised on the Shamir seal and has to move to its static seal once." >&2
  echo "Write Unseal Key 1 to $KEY_FILE and run npm run local:up again, or run:" >&2
  echo "  docker compose --env-file docker/.env.ops.local -f docker/compose.ops.local.yml exec -e BAO_ADDR=http://127.0.0.1:8200 openbao bao operator unseal -migrate" >&2
}

health_code="$(read_health_code)"

case "$health_code" in
  200|429|472|473)
    echo "OpenBao is already unsealed."
    exit 0
    ;;
  501)
    echo "OpenBao is not initialized yet. See docs/local-first-start.md." >&2
    exit 0
    ;;
  503) ;;
  *)
    echo "OpenBao is not reachable at $OPENBAO_LOCAL_ADDR (health=$health_code)." >&2
    exit 0
    ;;
esac

seal_status="$(curl -s "$OPENBAO_LOCAL_ADDR/v1/sys/seal-status" || true)"
migrate="false"

if seal_status_says migration; then
  migrate="true"
elif seal_status_says recovery_seal; then
  if wait_until_unsealed; then
    echo "OpenBao unsealed itself with its static seal key."
    exit 0
  fi
  echo "OpenBao is still sealed, although it unseals itself with $STATIC_SEAL_KEY_FILE." >&2
  echo "If somebody sealed it by hand, restart it: docker restart platform-ops-local-openbao-1" >&2
  echo "If its log says 'message authentication failed', that file no longer holds the key OpenBao" >&2
  echo "was sealed with. Restore the original file; a new key cannot open the old data." >&2
  exit 1
fi

unseal_key="${OPENBAO_LOCAL_UNSEAL_KEY:-}"

if [ -z "$unseal_key" ] && [ -f "$KEY_FILE" ]; then
  unseal_key="$(tr -d '\r\n' <"$KEY_FILE")"
fi

if [ -z "$unseal_key" ]; then
  if [ "$migrate" = "true" ]; then
    print_migration_steps
  else
    print_manual_steps
  fi
  exit 0
fi

response_code="$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST \
  --data-binary @- \
  "$OPENBAO_LOCAL_ADDR/v1/sys/unseal" <<JSON || true
{"key":"$unseal_key","migrate":$migrate}
JSON
)"

unset unseal_key

if [ "$response_code" != "200" ]; then
  echo "OpenBao unseal request failed (http=$response_code)." >&2
  echo "Check the key in $KEY_FILE, or unseal in the UI." >&2
  exit 1
fi

if ! wait_until_unsealed; then
  echo "OpenBao still reports health=$(read_health_code) after unsealing." >&2
  exit 1
fi

if [ "$migrate" = "true" ]; then
  echo "OpenBao moved to its static seal and is unsealed. From now on it unseals itself."
  echo "Unseal Key 1 is its recovery key now: keep it in your password manager. $KEY_FILE is no longer needed."
else
  echo "OpenBao unsealed."
fi
