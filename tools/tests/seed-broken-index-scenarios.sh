#!/usr/bin/env bash
set -euo pipefail

scenario_id="${1:-}"
image_ref="${2:-}"
registry_username="${3:-}"
registry_password="${4:-}"

if [[ -z "$scenario_id" || -z "$image_ref" || -z "$registry_username" || -z "$registry_password" ]]; then
  echo "usage: tools/tests/seed-broken-index-scenarios.sh <scenario-id> <image-ref> <registry-username> <registry-password>" >&2
  exit 1
fi

case "$scenario_id" in
  delete-ghost-images-real|delete-ghost-images-noop|delete-partial-images-real|delete-partial-images-noop)
    ;;
  *)
    exit 0
    ;;
esac

echo "GHCR_MANAGER_SCENARIO_SEED_HANDLED=true" >> "$GITHUB_ENV"

fixture_dockerfile="$PWD/tools/tests/fixtures/minimal-image/Dockerfile"
base_dir="$(mktemp -d)"

keep_dir="$base_dir/keep"
mkdir -p "$keep_dir"
cp "$fixture_dockerfile" "$keep_dir/Dockerfile"
printf '%s\n' "${scenario_id} keep" > "$keep_dir/payload.txt"

noop_child_dir="$base_dir/noop-child"
mkdir -p "$noop_child_dir"
cp "$fixture_dockerfile" "$noop_child_dir/Dockerfile"
printf '%s\n' "${scenario_id} noop child" > "$noop_child_dir/payload.txt"

second_child_dir="$base_dir/second-child"
mkdir -p "$second_child_dir"
cp "$fixture_dockerfile" "$second_child_dir/Dockerfile"
printf '%s\n' "${scenario_id} second child" > "$second_child_dir/payload.txt"

docker buildx build \
  --platform linux/amd64 \
  --provenance=false \
  --push \
  --tag "$image_ref:keep" \
  "$keep_dir"

primary_child_digest=""
if [[ "$scenario_id" == "delete-ghost-images-noop" || "$scenario_id" == "delete-partial-images-real" || "$scenario_id" == "delete-partial-images-noop" ]]; then
  docker buildx build \
    --platform linux/amd64 \
    --provenance=false \
    --push \
    --tag "$image_ref:${scenario_id}-amd64-test" \
    "$noop_child_dir"
  primary_child_digest="$(
    docker buildx imagetools inspect "$image_ref:${scenario_id}-amd64-test" \
      | awk '/Digest:/ {print $2; exit}'
  )"
fi

secondary_child_digest=""
if [[ "$scenario_id" == "delete-partial-images-noop" ]]; then
  docker buildx build \
    --platform linux/arm64 \
    --provenance=false \
    --push \
    --tag "$image_ref:${scenario_id}-arm64-test" \
    "$second_child_dir"
  secondary_child_digest="$(
    docker buildx imagetools inspect "$image_ref:${scenario_id}-arm64-test" \
      | awk '/Digest:/ {print $2; exit}'
  )"
fi

ref_path="${image_ref#ghcr.io/}"
owner="${ref_path%%/*}"
package="${ref_path#*/}"
scope="repository:${owner}/${package}:pull,push"
token="$(
  curl -fsSL -u "${registry_username}:${registry_password}" \
    "https://ghcr.io/token?service=ghcr.io&scope=${scope}" \
    | jq -r '.token'
)"
[[ -n "$token" && "$token" != "null" ]] || {
  echo "Failed to acquire GHCR push token for $owner/$package" >&2
  exit 1
}

manifest_media_type="application/vnd.oci.image.manifest.v1+json"
missing_amd64_digest="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
missing_arm64_digest="sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

if [[ "$scenario_id" == "delete-ghost-images-noop" ]]; then
  [[ -n "$primary_child_digest" ]] || { echo "Missing noop child digest for delete-ghost-images-noop" >&2; exit 1; }
  amd64_digest="$primary_child_digest"
  arm64_digest="$missing_arm64_digest"
elif [[ "$scenario_id" == "delete-partial-images-real" ]]; then
  [[ -n "$primary_child_digest" ]] || { echo "Missing primary child digest for delete-partial-images-real" >&2; exit 1; }
  amd64_digest="$primary_child_digest"
  arm64_digest="$missing_arm64_digest"
elif [[ "$scenario_id" == "delete-partial-images-noop" ]]; then
  [[ -n "$primary_child_digest" && -n "$secondary_child_digest" ]] || {
    echo "Missing child digests for delete-partial-images-noop" >&2
    exit 1
  }
  amd64_digest="$primary_child_digest"
  arm64_digest="$secondary_child_digest"
else
  amd64_digest="$missing_amd64_digest"
  arm64_digest="$missing_arm64_digest"
fi

index_json_path="$(mktemp)"
jq -n \
  --arg amd64Digest "$amd64_digest" \
  --arg arm64Digest "$arm64_digest" \
  --arg manifestMediaType "$manifest_media_type" \
  '{
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.index.v1+json",
    manifests: [
      {
        mediaType: $manifestMediaType,
        digest: $amd64Digest,
        size: 702,
        platform: { architecture: "amd64", os: "linux" }
      },
      {
        mediaType: $manifestMediaType,
        digest: $arm64Digest,
        size: 702,
        platform: { architecture: "arm64", os: "linux" }
      }
    ]
  }' > "$index_json_path"

curl -fsSL \
  -X PUT \
  -H "Authorization: Bearer $token" \
  -H "Content-Type: application/vnd.oci.image.index.v1+json" \
  --data-binary "@$index_json_path" \
  "https://ghcr.io/v2/${owner}/${package}/manifests/ghost"
