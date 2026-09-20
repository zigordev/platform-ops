#!/usr/bin/env bash

LOG_ARCHIVE_PREFIX="${LOG_ARCHIVE_PREFIX:-logs}"
LOG_ARCHIVE_JOB_LABEL="${LOG_ARCHIVE_JOB_LABEL:-docker-json-logs}"

archive_group_program() {
  cat <<'JQ'
.data[]
| if (.app // "") != "" then "app=" + .app
  elif (.service // "") != "" then "service=" + .service
  else "other"
  end
JQ
}

archive_entry_program() {
  cat <<'JQ'
.data.result[] as $stream
| $stream.values[]
| .[0] + " " + ({ ts: .[0], labels: $stream.stream, line: .[1] } | tojson)
JQ
}

archive_escape_label_value() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "$value"
}

archive_catch_all_selector() {
  printf '{job="%s"}' "$(archive_escape_label_value "$LOG_ARCHIVE_JOB_LABEL")"
}

archive_selector_for_group() {
  local group="$1"
  local job
  job="$(archive_escape_label_value "$LOG_ARCHIVE_JOB_LABEL")"

  case "$group" in
    app=*)
      printf '{job="%s", app="%s"}' "$job" "$(archive_escape_label_value "${group#app=}")"
      ;;
    service=*)
      printf '{job="%s", app="", service="%s"}' "$job" "$(archive_escape_label_value "${group#service=}")"
      ;;
    other)
      printf '{job="%s", app="", service=""}' "$job"
      ;;
    *)
      return 1
      ;;
  esac
}

archive_group_is_excluded() {
  local group="$1"
  local excluded="$2"
  local candidate

  for candidate in $excluded; do
    if [ "$candidate" = "$group" ]; then
      return 0
    fi
  done

  return 1
}

archive_object_name() {
  local group="$1"
  local name="${group//[^A-Za-z0-9._=-]/_}"

  if [ -z "$name" ]; then
    return 1
  fi

  printf '%s' "$name"
}

archive_day_prefix() {
  printf '%s/dt=%s' "$LOG_ARCHIVE_PREFIX" "$1"
}

archive_manifest_key() {
  printf '%s/_manifest.json' "$(archive_day_prefix "$1")"
}

archive_object_key() {
  local day="$1"
  local name

  name="$(archive_object_name "$2")" || return 1
  printf '%s/%s.jsonl.gz' "$(archive_day_prefix "$day")" "$name"
}

archive_days_from_civil() {
  local y="$1"
  local m="$2"
  local d="$3"
  local era yoe doy doe

  if [ "$m" -le 2 ]; then
    y=$((y - 1))
  fi

  if [ "$y" -ge 0 ]; then
    era=$((y / 400))
  else
    era=$(((y - 399) / 400))
  fi

  yoe=$((y - era * 400))

  if [ "$m" -gt 2 ]; then
    doy=$(((153 * (m - 3) + 2) / 5 + d - 1))
  else
    doy=$(((153 * (m + 9) + 2) / 5 + d - 1))
  fi

  doe=$((yoe * 365 + yoe / 4 - yoe / 100 + doy))
  printf '%d' $((era * 146097 + doe - 719468))
}

archive_civil_from_days() {
  local z=$(($1 + 719468))
  local era doe yoe y doy mp m d

  if [ "$z" -ge 0 ]; then
    era=$((z / 146097))
  else
    era=$(((z - 146096) / 146097))
  fi

  doe=$((z - era * 146097))
  yoe=$(((doe - doe / 1460 + doe / 36524 - doe / 146096) / 365))
  y=$((yoe + era * 400))
  doy=$((doe - (365 * yoe + yoe / 4 - yoe / 100)))
  mp=$(((5 * doy + 2) / 153))
  d=$((doy - (153 * mp + 2) / 5 + 1))

  if [ "$mp" -lt 10 ]; then
    m=$((mp + 3))
  else
    m=$((mp - 9))
  fi

  if [ "$m" -le 2 ]; then
    y=$((y + 1))
  fi

  printf '%04d-%02d-%02d' "$y" "$m" "$d"
}

archive_day_to_epoch_days() {
  local day="$1"
  local days

  if ! [[ "$day" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    return 1
  fi

  days="$(archive_days_from_civil "$((10#${day:0:4}))" "$((10#${day:5:2}))" "$((10#${day:8:2}))")"

  if [ "$(archive_civil_from_days "$days")" != "$day" ]; then
    return 1
  fi

  printf '%d' "$days"
}

archive_day_start_ns() {
  local days

  days="$(archive_day_to_epoch_days "$1")" || return 1
  printf '%d000000000' $((days * 86400))
}

archive_day_end_ns() {
  local days

  days="$(archive_day_to_epoch_days "$1")" || return 1
  printf '%d000000000' $(((days + 1) * 86400))
}

archive_days_before() {
  local count="$1"
  local day="$2"
  local days offset

  if ! [[ "$count" =~ ^[0-9]+$ ]] || [ "$count" -lt 1 ]; then
    return 1
  fi

  days="$(archive_day_to_epoch_days "$day")" || return 1

  for ((offset = count; offset >= 1; offset--)); do
    archive_civil_from_days $((days - offset))
    printf '\n'
  done
}
