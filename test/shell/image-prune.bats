setup() {
  STUB_DIR="$(mktemp -d)"
  export DOCKER_CALLS="$STUB_DIR/docker-calls"
  cat >"$STUB_DIR/docker" <<'STUB'
#!/usr/bin/env bash
echo "$*" >>"$DOCKER_CALLS"
echo "Total reclaimed space: 0B"
STUB
  chmod +x "$STUB_DIR/docker"
  PATH="$STUB_DIR:$PATH"
  SCRIPT="$BATS_TEST_DIRNAME/../../scripts/prune-images.sh"
}

teardown() {
  rm -rf "$STUB_DIR"
}

@test "prunes every image no container uses once it is a week old" {
  run "$SCRIPT"
  [ "$status" -eq 0 ]
  [ "$(cat "$DOCKER_CALLS")" = "image prune -af --filter until=168h" ]
}

@test "takes the retention from IMAGE_PRUNE_RETENTION_HOURS" {
  run env IMAGE_PRUNE_RETENTION_HOURS=48 "$SCRIPT"
  [ "$status" -eq 0 ]
  [ "$(cat "$DOCKER_CALLS")" = "image prune -af --filter until=48h" ]
}

@test "refuses a retention that is not a whole number of hours, and prunes nothing" {
  run env IMAGE_PRUNE_RETENTION_HOURS=0 "$SCRIPT"
  [ "$status" -eq 2 ]

  run env IMAGE_PRUNE_RETENTION_HOURS=7d "$SCRIPT"
  [ "$status" -eq 2 ]

  [ ! -e "$DOCKER_CALLS" ]
}

@test "logs when it ran and what the disk looks like afterwards" {
  run "$SCRIPT"
  [[ "${lines[0]}" =~ ^\[prune\]\ [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z\  ]]
  [[ "${lines[${#lines[@]}-1]}" =~ ^\[prune\]\ disk\ after:\ .+\ free,\ .+\ used$ ]]
}
