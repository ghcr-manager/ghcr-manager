#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../../.." && pwd)"

db_path="$repo_root/artifacts/aicage__aicage.sqlite"
summary_path="$repo_root/artifacts/aicage__aicage--delete-test-tags--dry-run-summary.json"

[[ -f "$db_path" ]] || {
  echo "Missing database: $db_path" >&2
  exit 1
}

cd "$repo_root"

npm run ghcr-manager -- cleanup \
  --db "$db_path" \
  --owner aicage \
  --package aicage \
  --dry-run \
  --use-regex \
  --delete-tag '^.*-test$' \
  --summary-json-path "$summary_path" \
  --log-level "debug"
