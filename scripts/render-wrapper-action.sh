#!/usr/bin/env bash
set -euo pipefail

upstream_action_file="${UPSTREAM_ACTION_FILE:-}"
upstream_action_tag="${UPSTREAM_ACTION_TAG:-}"
upstream_action_sha="${UPSTREAM_ACTION_SHA:-}"
output_path="${OUTPUT_PATH:-action.yml}"

if [[ -z "${upstream_action_file}" || -z "${upstream_action_tag}" || -z "${upstream_action_sha}" ]]; then
  echo "UPSTREAM_ACTION_FILE, UPSTREAM_ACTION_TAG, and UPSTREAM_ACTION_SHA are required." >&2
  exit 1
fi

if [[ ! -f "${upstream_action_file}" ]]; then
  echo "Upstream action file not found: ${upstream_action_file}" >&2
  exit 1
fi

if ! command -v yq >/dev/null 2>&1; then
  echo "yq is required to render the wrapper action." >&2
  exit 1
fi

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

action_name="$(yq eval '.name' "${upstream_action_file}")"
action_description="$(yq eval '.description' "${upstream_action_file}")"

{
  printf 'name: %s\n' "${action_name}"
  echo "description: >"
  printf '%s\n' "${action_description}" | fold -s -w 118 | sed 's/[[:space:]]*$//' | sed 's/^/  /'
  yq eval '. | {"branding": .branding, "inputs": .inputs}' "${upstream_action_file}"

  echo
  echo "outputs:"
  # shellcheck disable=SC2016
  yq eval '.outputs // {} | to_entries[] | "  \(.key):\n    description: \(.value.description)\n    value: ${{ steps.ghcr-cleanup-manager.outputs.\(.key) }}"' \
    "${upstream_action_file}"

  echo
  cat <<EOF
runs:
  using: composite
  steps:
    - name: Warn about moved action
      shell: bash
      run: |
        echo "::warning title=Action moved::ghcr-manager/ghcr-manager is now a wrapper."
        echo "::warning title=Action moved::Please migrate to ghcr-manager/ghcr-cleanup-manager."

    - id: ghcr-cleanup-manager
      uses: ghcr-manager/ghcr-cleanup-manager@${upstream_action_sha} # ${upstream_action_tag}
      with:
EOF

  # shellcheck disable=SC2016
  yq eval '.inputs | keys | .[] | "        \(.)" + ": ${{ inputs.\(.) }}"' "${upstream_action_file}"
} >"${tmp_file}"

mv "${tmp_file}" "${output_path}"
