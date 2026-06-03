#!/usr/bin/env bash
set -euo pipefail

scenario_id="${1:-}"
image_ref="${2:-}"

if [[ -z "$scenario_id" || -z "$image_ref" ]]; then
  echo "usage: tools/tests/seed-basic-scenarios.sh <scenario-id> <image-ref>" >&2
  exit 1
fi

fixture_dockerfile="$PWD/tools/tests/fixtures/minimal-image/Dockerfile"

build_one() {
  local tag="$1"
  local payload="$2"
  local context_dir
  context_dir="$(mktemp -d)"
  cp "$fixture_dockerfile" "$context_dir/Dockerfile"
  printf '%s\n' "$payload" > "$context_dir/payload.txt"
  docker buildx build \
    --platform linux/amd64 \
    --provenance=false \
    --push \
    --tag "$image_ref:$tag" \
    "$context_dir"
}

build_two_tags_one_image() {
  local tag_a="$1"
  local tag_b="$2"
  local payload="$3"
  local context_dir
  context_dir="$(mktemp -d)"
  cp "$fixture_dockerfile" "$context_dir/Dockerfile"
  printf '%s\n' "$payload" > "$context_dir/payload.txt"
  docker buildx build \
    --platform linux/amd64 \
    --provenance=false \
    --push \
    --tag "$image_ref:$tag_a" \
    --tag "$image_ref:$tag_b" \
    "$context_dir"
}

case "$scenario_id" in
  delete-untagged-noop)
    echo "GHCR_MANAGER_SCENARIO_SEED_HANDLED=true" >> "$GITHUB_ENV"
    build_one "keep" "keep-tagged"
    ;;
  delete-untagged-real)
    echo "GHCR_MANAGER_SCENARIO_SEED_HANDLED=true" >> "$GITHUB_ENV"
    build_one "tracked" "${scenario_id} old"
    build_one "tracked" "${scenario_id} new"
    ;;
  untag-only-single-shared-root)
    echo "GHCR_MANAGER_SCENARIO_SEED_HANDLED=true" >> "$GITHUB_ENV"
    build_two_tags_one_image "delete-me" "keep-me" "$scenario_id"
    ;;
  untag-only-multiarch-shared-root)
    echo "GHCR_MANAGER_SCENARIO_SEED_HANDLED=true" >> "$GITHUB_ENV"
    context_dir="$(mktemp -d)"
    cp "$fixture_dockerfile" "$context_dir/Dockerfile"
    printf '%s\n' "$scenario_id" > "$context_dir/payload.txt"
    docker buildx build \
      --platform linux/amd64,linux/arm64 \
      --provenance=false \
      --push \
      --tag "$image_ref:delete-me" \
      --tag "$image_ref:keep-me" \
      "$context_dir"
    ;;
  tagged-fully-deletable)
    echo "GHCR_MANAGER_SCENARIO_SEED_HANDLED=true" >> "$GITHUB_ENV"
    build_one "keep" "keep-tagged"
    build_one "delete-me" "delete-me-tagged"
    ;;
  digest-fully-deletable)
    echo "GHCR_MANAGER_SCENARIO_SEED_HANDLED=true" >> "$GITHUB_ENV"
    build_one "keep" "keep-tagged"
    build_one "delete-me" "delete-me-tagged"
    ;;
  wildcard-tagged-fully-deletable)
    echo "GHCR_MANAGER_SCENARIO_SEED_HANDLED=true" >> "$GITHUB_ENV"
    build_one "keep" "keep-tagged"
    build_one "delete-me" "delete-me-tagged"
    ;;
  exclude-tag-protected-root)
    echo "GHCR_MANAGER_SCENARIO_SEED_HANDLED=true" >> "$GITHUB_ENV"
    build_two_tags_one_image "delete-me" "keep-me" "$scenario_id"
    ;;
  keep-n-tagged-overflow)
    echo "GHCR_MANAGER_SCENARIO_SEED_HANDLED=true" >> "$GITHUB_ENV"
    build_one "oldest" "${scenario_id} oldest"
    build_one "middle" "${scenario_id} middle"
    build_one "newest" "${scenario_id} newest"
    ;;
  keep-n-untagged-overflow)
    echo "GHCR_MANAGER_SCENARIO_SEED_HANDLED=true" >> "$GITHUB_ENV"
    build_one "tracked" "${scenario_id} oldest"
    build_one "tracked" "${scenario_id} middle"
    build_one "tracked" "${scenario_id} newest"
    ;;
  delete-tags-keep-n-tagged-overflow)
    echo "GHCR_MANAGER_SCENARIO_SEED_HANDLED=true" >> "$GITHUB_ENV"
    build_one "keep" "${scenario_id} keep"
    build_one "delete-old" "${scenario_id} delete old"
    build_one "delete-new" "${scenario_id} delete new"
    ;;
  delete-orphaned-images-real)
    echo "GHCR_MANAGER_SCENARIO_SEED_HANDLED=true" >> "$GITHUB_ENV"
    build_one "keep" "${scenario_id} keep"
    build_one "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.sig" "$scenario_id"
    ;;
  delete-orphaned-images-noop)
    echo "GHCR_MANAGER_SCENARIO_SEED_HANDLED=true" >> "$GITHUB_ENV"
    build_one "parent" "${scenario_id} parent"
    parent_digest="$(
      docker buildx imagetools inspect "$image_ref:parent" \
        | awk '/Digest:/ {print $2; exit}'
    )"
    [[ "$parent_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || {
      echo "Failed to resolve parent digest for $image_ref:parent" >&2
      exit 1
    }
    build_one "sha256-${parent_digest#sha256:}.sig" "${scenario_id} referrer"
    ;;
esac
