#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/log-archive.sh"

usage() {
  cat <<USAGE
Usage:
  $0 \
    [--bucket <s3-bucket>] \
    [--region <aws-region>] \
    [--loki-url <url>] \
    [--lookback-days <n>] \
    [--day <YYYY-MM-DD>] \
    [--exclude "<group> <group>"] \
    [--work-dir <path>] \
    [--force] \
    [--dry-run]

Environment fallbacks:
  LOG_ARCHIVE_BUCKET, AWS_REGION, LOKI_URL, LOG_ARCHIVE_LOOKBACK_DAYS,
  LOG_ARCHIVE_EXCLUDE, LOG_ARCHIVE_WORK_DIR, LOG_ARCHIVE_QUERY_LIMIT
USAGE
}

BUCKET="${LOG_ARCHIVE_BUCKET:-}"
REGION="${AWS_REGION:-}"
LOKI_URL="${LOKI_URL:-http://127.0.0.1:3100}"
LOOKBACK_DAYS="${LOG_ARCHIVE_LOOKBACK_DAYS:-30}"
EXCLUDE="${LOG_ARCHIVE_EXCLUDE:-app=cv-web}"
WORK_DIR="${LOG_ARCHIVE_WORK_DIR:-/var/tmp/platform-ops-log-archive}"
QUERY_LIMIT="${LOG_ARCHIVE_QUERY_LIMIT:-5000}"
MIN_SPAN_NS=1000000
FORCE="false"
DRY_RUN="false"
DAYS=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --bucket)
      BUCKET="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --loki-url)
      LOKI_URL="$2"
      shift 2
      ;;
    --lookback-days)
      LOOKBACK_DAYS="$2"
      shift 2
      ;;
    --day)
      DAYS+=("$2")
      shift 2
      ;;
    --exclude)
      EXCLUDE="$2"
      shift 2
      ;;
    --work-dir)
      WORK_DIR="$2"
      shift 2
      ;;
    --force)
      FORCE="true"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
done

log() {
  printf '[archive-logs] %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

fail() {
  printf '[archive-logs] %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

if [ -z "$BUCKET" ]; then
  fail "Missing --bucket (or LOG_ARCHIVE_BUCKET)"
  usage
  exit 1
fi

if ! [[ "$QUERY_LIMIT" =~ ^[0-9]+$ ]] || [ "$QUERY_LIMIT" -lt 2 ]; then
  fail "Invalid query limit: $QUERY_LIMIT"
  exit 1
fi

for cmd in aws curl gzip jq sort; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    fail "Missing command: $cmd"
    exit 1
  fi
done

aws_s3() {
  if [ -n "$REGION" ]; then
    aws "$@" --region "$REGION"
    return
  fi

  aws "$@"
}

object_exists() {
  local key="$1"
  local found

  if [ "$DRY_RUN" = "true" ]; then
    return 1
  fi

  found="$(aws_s3 s3api list-objects-v2 --bucket "$BUCKET" --prefix "$key" --max-keys 1 --output json |
    jq -r --arg key "$key" '[(.Contents // [])[] | select(.Key == $key)] | length')"

  [ "$found" = "1" ]
}

upload() {
  local file="$1"
  local key="$2"

  if [ "$DRY_RUN" = "true" ]; then
    log "dry run: would upload $file to s3://$BUCKET/$key"
    return 0
  fi

  aws_s3 s3 cp "$file" "s3://$BUCKET/$key" --only-show-errors
}

loki_series() {
  local start_ns="$1"
  local end_ns="$2"

  curl -sS --fail --max-time 120 -G "$LOKI_URL/loki/api/v1/series" \
    --data-urlencode "match[]=$(archive_catch_all_selector)" \
    --data-urlencode "start=$start_ns" \
    --data-urlencode "end=$end_ns"
}

loki_query_range() {
  local selector="$1"
  local start_ns="$2"
  local end_ns="$3"

  curl -sS --fail --max-time 300 -G "$LOKI_URL/loki/api/v1/query_range" \
    --data-urlencode "query=$selector" \
    --data-urlencode "start=$start_ns" \
    --data-urlencode "end=$end_ns" \
    --data-urlencode "limit=$QUERY_LIMIT" \
    --data-urlencode "direction=forward"
}

export_window() {
  local selector="$1"
  local start_ns="$2"
  local end_ns="$3"
  local target="$4"
  local response count mid_ns

  response="$(loki_query_range "$selector" "$start_ns" "$end_ns")"
  count="$(printf '%s' "$response" | jq '[.data.result[].values[]] | length')"

  if [ "$count" -lt "$QUERY_LIMIT" ]; then
    printf '%s' "$response" | jq -r "$(archive_entry_program)" >>"$target"
    return 0
  fi

  if [ $((end_ns - start_ns)) -le "$MIN_SPAN_NS" ]; then
    fail "More than $QUERY_LIMIT entries within one millisecond for $selector at $start_ns"
    return 1
  fi

  mid_ns=$((start_ns + (end_ns - start_ns) / 2))
  export_window "$selector" "$start_ns" "$mid_ns" "$target" || return 1
  export_window "$selector" "$mid_ns" "$end_ns" "$target" || return 1
}

export_group() {
  local group="$1"
  local day="$2"
  local start_ns="$3"
  local end_ns="$4"
  local day_dir="$5"
  local entries_file="$6"
  local selector name unsorted sorted lines key bytes

  selector="$(archive_selector_for_group "$group")" || return 1
  name="$(archive_object_name "$group")" || return 1
  unsorted="$day_dir/$name.unsorted"
  sorted="$day_dir/$name.jsonl"

  : >"$unsorted"
  export_window "$selector" "$start_ns" "$end_ns" "$unsorted" || return 1

  LC_ALL=C sort "$unsorted" | cut -d' ' -f2- >"$sorted" || return 1
  rm -f "$unsorted"

  lines="$(wc -l <"$sorted" | tr -d ' ')"

  if [ "$lines" -eq 0 ]; then
    log "$day $group: no lines"
    rm -f "$sorted"
    return 0
  fi

  gzip -9 -f "$sorted"
  bytes="$(wc -c <"$sorted.gz" | tr -d ' ')"
  key="$(archive_object_key "$day" "$group")"

  upload "$sorted.gz" "$key" || return 1

  if [ "$DRY_RUN" != "true" ]; then
    rm -f "$sorted.gz"
  fi

  log "$day $group: $lines lines, $bytes bytes, $key"

  jq -n \
    --arg group "$group" \
    --arg selector "$selector" \
    --arg key "$key" \
    --argjson lines "$lines" \
    --argjson bytes "$bytes" \
    '{ group: $group, selector: $selector, key: $key, lines: $lines, bytes: $bytes }' >>"$entries_file"
}

export_day() {
  local day="$1"
  local start_ns end_ns manifest_key day_dir entries_file series groups group manifest total objects

  if ! start_ns="$(archive_day_start_ns "$day")"; then
    fail "Invalid day: $day"
    return 1
  fi

  end_ns="$(archive_day_end_ns "$day")"
  manifest_key="$(archive_manifest_key "$day")"

  if [ "$FORCE" != "true" ] && object_exists "$manifest_key"; then
    log "$day: already archived"
    return 0
  fi

  day_dir="$WORK_DIR/$day"
  rm -rf "$day_dir"
  mkdir -p "$day_dir"
  entries_file="$day_dir/entries.jsonl"
  : >"$entries_file"

  if ! series="$(loki_series "$start_ns" "$end_ns")"; then
    fail "$day: Loki did not answer the series query"
    return 1
  fi

  groups=()

  while IFS= read -r group; do
    [ -n "$group" ] || continue
    groups+=("$group")
  done < <(printf '%s' "$series" | jq -r "$(archive_group_program)" | LC_ALL=C sort -u)

  for group in ${groups[@]+"${groups[@]}"}; do
    if archive_group_is_excluded "$group" "$EXCLUDE"; then
      log "$day $group: excluded"
      continue
    fi

    export_group "$group" "$day" "$start_ns" "$end_ns" "$day_dir" "$entries_file" || return 1
  done

  manifest="$day_dir/_manifest.json"
  total="$(jq -s 'map(.lines) | add // 0' "$entries_file")"
  objects="$(jq -s 'length' "$entries_file")"

  jq -s \
    --arg day "$day" \
    --arg exported_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg loki "$LOKI_URL" \
    --arg excluded "$EXCLUDE" \
    --argjson lines "$total" \
    '{ day: $day, exported_at: $exported_at, loki: $loki, excluded: ($excluded | split(" ") | map(select(. != ""))), lines: $lines, objects: . }' \
    "$entries_file" >"$manifest"

  upload "$manifest" "$manifest_key" || return 1
  log "$day: archived $total lines in $objects objects"

  if [ "$DRY_RUN" != "true" ]; then
    rm -rf "$day_dir"
  fi
}

mkdir -p "$WORK_DIR"

if [ "${#DAYS[@]}" -eq 0 ]; then
  if ! day_list="$(archive_days_before "$LOOKBACK_DAYS" "$(date -u +%F)")"; then
    fail "Invalid lookback: $LOOKBACK_DAYS"
    exit 1
  fi

  while IFS= read -r day; do
    [ -n "$day" ] || continue
    DAYS+=("$day")
  done <<<"$day_list"
fi

log "bucket=$BUCKET loki=$LOKI_URL days=${#DAYS[@]} excluded='$EXCLUDE'"

status=0

for day in "${DAYS[@]}"; do
  if ! export_day "$day"; then
    fail "$day: export failed"
    status=1
  fi
done

exit "$status"
