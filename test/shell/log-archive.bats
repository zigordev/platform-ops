setup() {
  source "$BATS_TEST_DIRNAME/../../scripts/lib/log-archive.sh"
}

@test "archive_day_to_epoch_days counts whole days since the epoch" {
  [ "$(archive_day_to_epoch_days 1970-01-01)" = "0" ]
  [ "$(archive_day_to_epoch_days 2026-09-19)" = "20715" ]
}

@test "archive_day_to_epoch_days rejects a day that does not exist" {
  run archive_day_to_epoch_days 2026-02-30
  [ "$status" -ne 0 ]
}

@test "archive_day_to_epoch_days rejects anything that is not YYYY-MM-DD" {
  run archive_day_to_epoch_days 2026-9-1
  [ "$status" -ne 0 ]

  run archive_day_to_epoch_days yesterday
  [ "$status" -ne 0 ]
}

@test "a day spans exactly 24 hours of nanoseconds" {
  local start end
  start="$(archive_day_start_ns 2026-09-19)"
  end="$(archive_day_end_ns 2026-09-19)"
  [ "$start" = "1789776000000000000" ]
  [ $((end - start)) -eq 86400000000000 ]
}

@test "archive_days_before lists whole days oldest first and never today" {
  [ "$(archive_days_before 3 2026-01-02)" = "2025-12-30
2025-12-31
2026-01-01" ]
}

@test "archive_days_before crosses a leap day" {
  [ "$(archive_days_before 1 2024-03-01)" = "2024-02-29" ]
}

@test "archive_days_before rejects a lookback that is not a positive count" {
  run archive_days_before 0 2026-01-02
  [ "$status" -ne 0 ]

  run archive_days_before two 2026-01-02
  [ "$status" -ne 0 ]
}

@test "archive_selector_for_group pins the app label when there is one" {
  [ "$(archive_selector_for_group app=cv-web)" = '{job="docker-json-logs", app="cv-web"}' ]
}

@test "archive_selector_for_group asks for an empty app when grouping by compose service" {
  [ "$(archive_selector_for_group service=cv_web)" = '{job="docker-json-logs", app="", service="cv_web"}' ]
}

@test "archive_selector_for_group catches the lines carrying neither label" {
  [ "$(archive_selector_for_group other)" = '{job="docker-json-logs", app="", service=""}' ]
}

@test "archive_selector_for_group escapes a value that would break the selector" {
  [ "$(archive_selector_for_group 'app=say"hi')" = '{job="docker-json-logs", app="say\"hi"}' ]
}

@test "archive_selector_for_group refuses a group it does not recognise" {
  run archive_selector_for_group project=cv-app
  [ "$status" -ne 0 ]
}

@test "archive_group_is_excluded matches a whole group and not a prefix of one" {
  archive_group_is_excluded app=cv-web "app=cv-web other"
  run archive_group_is_excluded app=cv "app=cv-web other"
  [ "$status" -ne 0 ]
}

@test "archive_group_is_excluded accepts an empty exclusion list" {
  run archive_group_is_excluded app=cv-web ""
  [ "$status" -ne 0 ]
}

@test "keys carry the day as a partition and the group as the file name" {
  [ "$(archive_manifest_key 2026-09-19)" = "logs/dt=2026-09-19/_manifest.json" ]
  [ "$(archive_object_key 2026-09-19 app=cv-web)" = "logs/dt=2026-09-19/app=cv-web.jsonl.gz" ]
  [ "$(archive_object_key 2026-09-19 other)" = "logs/dt=2026-09-19/other.jsonl.gz" ]
}

@test "a group that would escape its prefix cannot name an object" {
  [ "$(archive_object_key 2026-09-19 'service=../../etc/passwd')" = "logs/dt=2026-09-19/service=.._.._etc_passwd.jsonl.gz" ]
}

@test "the group program prefers app, falls back to the compose service, then to other" {
  local series
  series='{"status":"success","data":[{"app":"cv-web","service":"cv_web","job":"docker-json-logs"},{"service":"kini_db","job":"docker-json-logs"},{"job":"docker-json-logs"},{"app":"","service":"","job":"docker-json-logs"}]}'
  [ "$(printf '%s' "$series" | jq -r "$(archive_group_program)")" = "app=cv-web
service=kini_db
other
other" ]
}

@test "the entry program writes one sortable line per entry, labels and all" {
  local response line
  response='{"data":{"result":[{"stream":{"app":"cv-web","stream":"stdout"},"values":[["1789776000000000001","first"],["1789776000000000002","second"]]}]}}'
  line="$(printf '%s' "$response" | jq -r "$(archive_entry_program)" | head -n1)"
  [ "${line%% *}" = "1789776000000000001" ]
  [ "$(printf '%s' "${line#* }" | jq -r '.line')" = "first" ]
  [ "$(printf '%s' "${line#* }" | jq -r '.labels.app')" = "cv-web" ]
  [ "$(printf '%s' "${line#* }" | jq -r '.ts')" = "1789776000000000001" ]
}

@test "the entry program keeps a multi-line log entry on one line" {
  local response line
  response='{"data":{"result":[{"stream":{"app":"cv-web"},"values":[["1789776000000000001","first\nsecond"]]}]}}'
  line="$(printf '%s' "$response" | jq -r "$(archive_entry_program)")"
  [ "$(printf '%s' "$line" | wc -l | tr -d ' ')" = "0" ]
  [ "$(printf '%s' "${line#* }" | jq -r '.line')" = "first
second" ]
}
