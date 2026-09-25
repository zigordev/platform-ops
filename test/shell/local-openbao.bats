setup() {
  REPO="$(mktemp -d)"
  mkdir -p "$REPO/scripts" "$REPO/docker" "$REPO/stubs"
  cp "$BATS_TEST_DIRNAME/../../scripts/local-stack-up-ops.sh" \
    "$BATS_TEST_DIRNAME/../../scripts/local-openbao-unseal.sh" "$REPO/scripts/"
  cat >"$REPO/docker/.env.ops.local" <<'ENV'
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=local-test-password
TOLGEE_INITIAL_USERNAME=admin
TOLGEE_INITIAL_PASSWORD=local-test-password
TOLGEE_JWT_SECRET=local-test-jwt-secret-of-at-least-32-characters
ENV

  export CALLS="$REPO/calls"
  export HEALTH_CODES="$REPO/health-codes"
  export UNSEAL_BODY="$REPO/unseal-body"
  export TOLGEE_CODES="$REPO/tolgee-codes"
  printf '200\n' >"$TOLGEE_CODES"
  export SEAL_STATUS='{"type":"shamir","sealed":true,"migration":false,"recovery_seal":false}'
  UNSEAL_KEY_FILE="$REPO/docker/.openbao-local-unseal-key"
  STATIC_KEY_FILE="$REPO/docker/.openbao-local-static-seal-key"
  UP="$REPO/scripts/local-stack-up-ops.sh"
  UNSEAL="$REPO/scripts/local-openbao-unseal.sh"

  cat >"$REPO/stubs/curl" <<'STUB'
#!/usr/bin/env bash
url="${*: -1}"
echo "curl $url" >>"$CALLS"
case "$url" in
  */v1/sys/health)
    head -n1 "$HEALTH_CODES" | tr -d '\n'
    if [ "$(wc -l <"$HEALTH_CODES")" -gt 1 ]; then
      tail -n +2 "$HEALTH_CODES" >"$HEALTH_CODES.next"
      mv "$HEALTH_CODES.next" "$HEALTH_CODES"
    fi
    ;;
  */v1/sys/seal-status)
    printf '%s' "$SEAL_STATUS"
    ;;
  */v1/sys/unseal)
    cat >"$UNSEAL_BODY"
    printf '200'
    ;;
  */actuator/health)
    head -n1 "$TOLGEE_CODES" | tr -d '\n'
    if [ "$(wc -l <"$TOLGEE_CODES")" -gt 1 ]; then
      tail -n +2 "$TOLGEE_CODES" >"$TOLGEE_CODES.next"
      mv "$TOLGEE_CODES.next" "$TOLGEE_CODES"
    fi
    ;;
esac
STUB
  cat >"$REPO/stubs/docker" <<'STUB'
#!/usr/bin/env bash
echo "docker $*" >>"$CALLS"
case "$*" in
  *"run --help"*) echo "      --no-build" ;;
esac
STUB
  printf '#!/usr/bin/env bash\n' >"$REPO/stubs/sleep"
  chmod +x "$REPO/stubs/curl" "$REPO/stubs/docker" "$REPO/stubs/sleep"
  PATH="$REPO/stubs:$PATH"
}

teardown() {
  rm -rf "$REPO"
}

health_codes() {
  printf '%s\n' "$@" >"$HEALTH_CODES"
}

@test "moves a Shamir OpenBao to its static seal with the unseal key, once" {
  SEAL_STATUS='{"type":"static","sealed":true,"migration":true,"recovery_seal":true}'
  health_codes 503 200
  printf 'the-unseal-key\n' >"$UNSEAL_KEY_FILE"

  run bash "$UNSEAL"

  [ "$status" -eq 0 ]
  [ "$(cat "$UNSEAL_BODY")" = '{"key":"the-unseal-key","migrate":true}' ]
  [[ "$output" == *"moved to its static seal"* ]]
}

@test "unseals a Shamir OpenBao without migrating it" {
  health_codes 503 200
  printf 'the-unseal-key\n' >"$UNSEAL_KEY_FILE"

  run bash "$UNSEAL"

  [ "$status" -eq 0 ]
  [ "$(cat "$UNSEAL_BODY")" = '{"key":"the-unseal-key","migrate":false}' ]
  [ "$output" = "OpenBao unsealed." ]
}

@test "waits for the static seal to unseal OpenBao and never sends the unseal key" {
  SEAL_STATUS='{"type":"static","sealed":true,"migration":false,"recovery_seal":true}'
  health_codes 503 503 200
  printf 'the-unseal-key\n' >"$UNSEAL_KEY_FILE"

  run bash "$UNSEAL"

  [ "$status" -eq 0 ]
  [ ! -e "$UNSEAL_BODY" ]
  [[ "$output" == *"unsealed itself"* ]]
}

@test "fails and names the static seal key when OpenBao stays sealed" {
  SEAL_STATUS='{"type":"static","sealed":true,"migration":false,"recovery_seal":true}'
  health_codes 503

  run env OPENBAO_UNSEAL_WAIT_SECONDS=2 bash "$UNSEAL"

  [ "$status" -eq 1 ]
  [ ! -e "$UNSEAL_BODY" ]
  [[ "$output" == *".openbao-local-static-seal-key"* ]]
  [[ "$output" == *"docker restart platform-ops-local-openbao-1"* ]]
  [[ "$output" == *"message authentication failed"* ]]
}

@test "explains the one-time migration when no unseal key is available" {
  SEAL_STATUS='{"type":"static","sealed":true,"migration":true,"recovery_seal":true}'
  health_codes 503

  run bash "$UNSEAL"

  [ "$status" -eq 0 ]
  [ ! -e "$UNSEAL_BODY" ]
  [[ "$output" == *"bao operator unseal -migrate"* ]]
}

@test "local:up creates a 32-byte static seal key that only its owner can read" {
  health_codes 200

  run bash "$UP"

  [ "$status" -eq 0 ]
  [ "$(wc -c <"$STATIC_KEY_FILE" | tr -d '[:space:]')" = "32" ]
  [ "$(ls -l "$STATIC_KEY_FILE" | cut -c1-10)" = "-rw-------" ]
  [[ "$output" == *"Created $STATIC_KEY_FILE"* ]]
  [ "${lines[${#lines[@]}-1]}" = "Ops stack started." ]
}

@test "local:up keeps an existing static seal key" {
  health_codes 200
  printf '%032d' 7 >"$STATIC_KEY_FILE"

  run bash "$UP"

  [ "$status" -eq 0 ]
  [ "$(cat "$STATIC_KEY_FILE")" = "$(printf '%032d' 7)" ]
  [[ "$output" != *"Created"* ]]
}

@test "local:up refuses a static seal key with a trailing newline and starts nothing" {
  health_codes 200
  printf '%064d\n' 7 >"$STATIC_KEY_FILE"

  run bash "$UP"

  [ "$status" -eq 1 ]
  [[ "$output" == *"holds 65 bytes"* ]]
  ! grep -q "up -d" "$CALLS"
}

@test "local:up fails when OpenBao is left sealed, after starting the rest of the stack" {
  SEAL_STATUS='{"type":"static","sealed":true,"migration":false,"recovery_seal":true}'
  health_codes 503

  run env OPENBAO_UNSEAL_WAIT_SECONDS=0 bash "$UP"

  [ "$status" -eq 1 ]
  grep -q "up -d$" "$CALLS"
  [[ "$output" == *"OpenBao is still sealed, so no application can read its secrets"* ]]
}

@test "local:up fails when OpenBao is not initialized" {
  health_codes 501

  run bash "$UP"

  [ "$status" -eq 1 ]
  [[ "$output" == *"OpenBao is not initialized, so no application can read its secrets"* ]]
}

@test "local:up waits for Tolgee to answer before it reports the stack started" {
  health_codes 200
  printf '%s\n' 000 000 200 >"$TOLGEE_CODES"

  run bash "$UP"

  [ "$status" -eq 0 ]
  [ "$(grep -c "actuator/health" "$CALLS")" -eq 3 ]
  [[ "$output" == *"Tolgee is ready."* ]]
  [ "${lines[${#lines[@]}-1]}" = "Ops stack started." ]
}

@test "local:up fails and names the products that need Tolgee when it never answers" {
  health_codes 200
  printf '000\n' >"$TOLGEE_CODES"

  run env TOLGEE_READY_WAIT_SECONDS=4 bash "$UP"

  [ "$status" -eq 1 ]
  grep -q "up -d$" "$CALLS"
  [[ "$output" == *"Tolgee has not answered"* ]]
  [[ "$output" == *"cv, gpool and kini"* ]]
  [[ "$output" != *"Ops stack started."* ]]
}
