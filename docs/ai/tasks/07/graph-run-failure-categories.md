# Graph Run Failure Categories

Source logs: `artifacts/LOGS-graph/logs_71750579796/`

This is a categorization of the 56 graph-matrix execution jobs (28 scenarios x 2 executors).

## Summary

### `ghcr-manager`

- `2` pass
- `18` fail with `manifest-count-mismatch`
- `8` fail with `tag-count-mismatch`

### `ghcr-cleanup-action`

- `8` pass
- `8` fail with `manifest-count-mismatch`
- `12` fail with `no-match-then-assert`

## Main Patterns

### `ghcr-manager`

- Only the plain `1image` and `attestations 1image` cases pass.
- All failing `ghcr-manager` rows fail in the final scan assertion, not during setup.
- `delete-image-a` on the shared-graph families (`2images`, `2multiarch`) tends to fail as `tag-count-mismatch`.
- `delete-multiarch`, `delete-multiarch-a`, and combined delete operations tend to fail as `manifest-count-mismatch`.
- `1image` starts failing once cosign is involved:
  - `graph-1image-cosign--delete-image-a`
  - `graph-1image-cosign-attestations--delete-image-a`

### `ghcr-cleanup-action`

- All `no-match-then-assert` cases show the upstream action logging:
  - `no matching tags found`
  - `Nothing to delete`
  - followed by the final assertion failure
- Those are concentrated in delete operations that target `image-a` or `image-a + multiarch(-a)`.
- Upstream passes all `1image` scenarios.
- Upstream also passes the attestation/cosign-attestation rows that delete only the multi-arch tag:
  - `graph-2images-attestations--delete-multiarch`
  - `graph-2images-cosign-attestations--delete-multiarch`
  - `graph-2multiarch-attestations--delete-multiarch-a`
  - `graph-2multiarch-cosign-attestations--delete-multiarch-a`

## Per Scenario

<!-- markdownlint-disable MD013 -->

| Scenario                                                               | `ghcr-manager`                  | `ghcr-cleanup-action`           |
| ---------------------------------------------------------------------- | ------------------------------- | ------------------------------- |
| `graph-1image-base--delete-image-a`                                    | pass                            | pass                            |
| `graph-1image-attestations--delete-image-a`                            | pass                            | pass                            |
| `graph-1image-cosign--delete-image-a`                                  | fail: `manifest-count-mismatch` | pass                            |
| `graph-1image-cosign-attestations--delete-image-a`                     | fail: `manifest-count-mismatch` | pass                            |
| `graph-2images-base--delete-image-a`                                   | fail: `tag-count-mismatch`      | fail: `no-match-then-assert`    |
| `graph-2images-base--delete-multiarch`                                 | fail: `manifest-count-mismatch` | fail: `manifest-count-mismatch` |
| `graph-2images-base--delete-image-a-and-multiarch`                     | fail: `manifest-count-mismatch` | fail: `no-match-then-assert`    |
| `graph-2images-attestations--delete-image-a`                           | fail: `tag-count-mismatch`      | fail: `manifest-count-mismatch` |
| `graph-2images-attestations--delete-multiarch`                         | fail: `manifest-count-mismatch` | pass                            |
| `graph-2images-attestations--delete-image-a-and-multiarch`             | fail: `manifest-count-mismatch` | fail: `no-match-then-assert`    |
| `graph-2images-cosign--delete-image-a`                                 | fail: `tag-count-mismatch`      | fail: `no-match-then-assert`    |
| `graph-2images-cosign--delete-multiarch`                               | fail: `manifest-count-mismatch` | fail: `manifest-count-mismatch` |
| `graph-2images-cosign--delete-image-a-and-multiarch`                   | fail: `manifest-count-mismatch` | fail: `no-match-then-assert`    |
| `graph-2images-cosign-attestations--delete-image-a`                    | fail: `tag-count-mismatch`      | fail: `manifest-count-mismatch` |
| `graph-2images-cosign-attestations--delete-multiarch`                  | fail: `manifest-count-mismatch` | pass                            |
| `graph-2images-cosign-attestations--delete-image-a-and-multiarch`      | fail: `manifest-count-mismatch` | fail: `no-match-then-assert`    |
| `graph-2multiarch-base--delete-image-a`                                | fail: `tag-count-mismatch`      | fail: `no-match-then-assert`    |
| `graph-2multiarch-base--delete-multiarch-a`                            | fail: `manifest-count-mismatch` | fail: `manifest-count-mismatch` |
| `graph-2multiarch-base--delete-image-a-and-multiarch-a`                | fail: `manifest-count-mismatch` | fail: `no-match-then-assert`    |
| `graph-2multiarch-attestations--delete-image-a`                        | fail: `tag-count-mismatch`      | fail: `manifest-count-mismatch` |
| `graph-2multiarch-attestations--delete-multiarch-a`                    | fail: `manifest-count-mismatch` | pass                            |
| `graph-2multiarch-attestations--delete-image-a-and-multiarch-a`        | fail: `manifest-count-mismatch` | fail: `no-match-then-assert`    |
| `graph-2multiarch-cosign--delete-image-a`                              | fail: `tag-count-mismatch`      | fail: `no-match-then-assert`    |
| `graph-2multiarch-cosign--delete-multiarch-a`                          | fail: `manifest-count-mismatch` | fail: `manifest-count-mismatch` |
| `graph-2multiarch-cosign--delete-image-a-and-multiarch-a`              | fail: `manifest-count-mismatch` | fail: `no-match-then-assert`    |
| `graph-2multiarch-cosign-attestations--delete-image-a`                 | fail: `tag-count-mismatch`      | fail: `manifest-count-mismatch` |
| `graph-2multiarch-cosign-attestations--delete-multiarch-a`             | fail: `manifest-count-mismatch` | pass                            |
| `graph-2multiarch-cosign-attestations--delete-image-a-and-multiarch-a` | fail: `manifest-count-mismatch` | fail: `no-match-then-assert`    |

<!-- markdownlint-enable MD013 -->

## Notes

- The `ghcr-manager` pass rows also print `No cleanup audit assertions configured` for the graph scenarios. That is
  informational only and not a job failure.
- This file categorizes by observed failure shape in the logs. It does not yet say whether the expectation or the
  executor behavior is wrong for any individual row.
