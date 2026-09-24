setup() {
  SCRIPT="$BATS_TEST_DIRNAME/../../scripts/verify-standards.sh"
  REAL_OPS="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  ESTATE="$(mktemp -d)"
}

teardown() {
  rm -rf "$ESTATE"
}

make_repo() {
  mkdir -p "$ESTATE/$1"
  : >"$ESTATE/$1/.git"
}

link_platform_ops() {
  mkdir -p "$ESTATE/platform-ops"
  : >"$ESTATE/platform-ops/.git"
  cp "$REAL_OPS/.prettierrc" "$ESTATE/platform-ops/.prettierrc"
}

@test "refuses an estate root that holds no platform-ops instead of passing" {
  run env ESTATE_ROOT="$ESTATE" bash "$SCRIPT"
  [ "$status" -eq 2 ]
  [[ "$output" == *"No estate at"* ]]
  [[ "$output" != *"shared script bodies"* ]]
}

@test "fails naming the repositories that are not checked out" {
  link_platform_ops
  run env ESTATE_ROOT="$ESTATE" bash "$SCRIPT"
  [ "$status" -ne 0 ]
  [[ "$output" == *"not checked out under"* ]]
  [[ "$output" == *"cv"* ]]
  [[ "$output" == *"design-system"* ]]
}

@test "a shared body with one copy is reported as uncompared, not as agreement" {
  link_platform_ops
  for repo in cv gpool kini trading-bot notifications sity design-system; do
    make_repo "$repo"
  done
  mkdir -p "$ESTATE/cv/scripts"
  printf 'echo one\n' >"$ESTATE/cv/scripts/local-stack.sh"

  run env ESTATE_ROOT="$ESTATE" bash "$SCRIPT"
  [[ "$output" == *"local-stack.sh: only in cv"* ]]
  [[ "$output" != *"local-stack.sh: one body across 1"* ]]
}

@test "a shared body that differs between two copies still fails" {
  link_platform_ops
  for repo in cv gpool kini trading-bot notifications sity design-system; do
    make_repo "$repo"
  done
  mkdir -p "$ESTATE/cv/scripts" "$ESTATE/gpool/scripts"
  printf 'echo one\n' >"$ESTATE/cv/scripts/local-stack.sh"
  printf 'echo two\n' >"$ESTATE/gpool/scripts/local-stack.sh"

  run env ESTATE_ROOT="$ESTATE" bash "$SCRIPT"
  [ "$status" -ne 0 ]
  [[ "$output" == *"local-stack.sh: 2 different bodies"* ]]
}

@test "reads the server the app actually runs, not a browser entry point" {
  link_platform_ops
  for repo in cv gpool kini trading-bot notifications sity design-system; do
    make_repo "$repo"
  done
  mkdir -p "$ESTATE/sity/apps/web/src" "$ESTATE/sity/apps/web/server"
  printf '{"name":"@sity/web","dependencies":{"fastify":"^5.0.0"}}\n' \
    >"$ESTATE/sity/apps/web/package.json"
  printf 'import "./scene";\n' >"$ESTATE/sity/apps/web/src/main.ts"
  printf 'reply.header("X-Content-Type-Options", "nosniff");\napp.get("/health", health);\n' \
    >"$ESTATE/sity/apps/web/server/app.ts"

  run env ESTATE_ROOT="$ESTATE" bash "$SCRIPT"
  [[ "$output" == *"security headers (web)"* ]]
  [[ "$output" == *"health route (web)"* ]]
  [[ "$output" != *"no security headers (web)"* ]]
  [[ "$output" != *"no health route (web)"* ]]
}

@test "still fails a server that sets no headers and serves no health route" {
  link_platform_ops
  for repo in cv gpool kini trading-bot notifications sity design-system; do
    make_repo "$repo"
  done
  mkdir -p "$ESTATE/gpool/apps/api/src"
  printf '{"name":"@gpool/api","dependencies":{"@nestjs/core":"^11.0.0"}}\n' \
    >"$ESTATE/gpool/apps/api/package.json"
  printf 'bootstrap();\n' >"$ESTATE/gpool/apps/api/src/main.ts"

  run env ESTATE_ROOT="$ESTATE" bash "$SCRIPT"
  [ "$status" -ne 0 ]
  [[ "$output" == *"no security headers (api)"* ]]
  [[ "$output" == *"no health route (api)"* ]]
}
