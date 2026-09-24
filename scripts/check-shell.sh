#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

count=0
while IFS= read -r file; do
  [ -n "$file" ] || continue
  bash -n "$file"
  count=$((count + 1))
done < <(find "$REPO_ROOT/scripts" -maxdepth 2 -type f -name '*.sh' | sort)

if [ "$count" -eq 0 ]; then
  echo "No shell scripts found under $REPO_ROOT/scripts — this script lives there, so that cannot be true." >&2
  exit 1
fi

echo "Shell syntax check passed (${count} files)."
