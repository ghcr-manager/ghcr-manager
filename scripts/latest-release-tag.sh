#!/usr/bin/env bash
set -euo pipefail

curl_args=(
  -fsSL
  --retry 8
  --retry-all-errors
  --retry-delay 2
  --max-time 300
  -H "Accept: application/vnd.github+json"
)

if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  curl_args+=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

echo "Fetching latest release tag from https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/latest" >&2
release_tag="$(
  curl \
    "${curl_args[@]}" \
    "https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/latest" |
    jq -r '.tag_name'
)"

if [[ -z "${release_tag}" ]]; then
  echo "Latest release tag is empty." >&2
  exit 1
fi

printf '%s\n' "${release_tag}"
