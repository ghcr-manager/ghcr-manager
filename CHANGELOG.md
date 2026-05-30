# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.9] - 2026-05-30

### Added

- Added a local manifest-graph visualizer with browser UI for `ghcr-manager` SQLite databases, including manifest
  details, zoom controls, one-hop expansion, and scan-to-scan compare mode.
- Added a separately publishable npm package, `ghcr-manager-visualizer`, plus user-facing visualizer documentation.
- Added repo-local manual visualizer demo scripts for seeding and updating GHCR packages during graph investigation.

### Changed

- Manifest platform display now derives from descriptor data in the visualizer instead of relying on manifest-level
  platform fields.
- Cross-architecture terminology is now consistently named `multi-arch` across runtime, tests, and docs.

### Fixed

- Fixed digest-tag helper-edge direction and root-detection behavior so helper-tagged artifacts no longer interfere with
  normal cleanup root semantics.

## [0.9.8] - 2026-05-29

### Removed

- The public `untag` CLI command, root-action mode, and dedicated direct-untag workflow coverage were removed. Internal
  tag detachment for partial-tag cleanup matches remains part of `cleanup`.

## [0.9.7] - 2026-05-23

### Added

- The root action now prepares `cleanup` and `untag` CLI arguments through `tools/prepare-action-args.mjs`, keeping
  printed and executed argument lists aligned.
- Cleanup planning now traverses recursively beyond `sha256-*` helper-tag manifest links as well, if deeper helper
  chains ever occur.

### Changed

- Cleanup dry-run output and GitHub step summaries were reworked to explain the plan more clearly, including a filters
  table and clearer counts for tags, images, and cross-arch manifests.
- Informational manifest classification was tuned so only real multi-arch roots are labeled `multi_arch_manifest`, while
  helper-tagged indexes remain `index_manifest`.
- `merge-run-artifacts` now uses a simpler current-run download flow with direct artifact download handling.
- Cleanup selected-tag audit and DB-merge metadata handling were tightened alongside the summary/output refactor.

### Fixed

- `delete-orphaned-images` now carries orphaned `sha256-*` digest-tag targets through planner selection instead of
  dropping them at the normal non-digest tag boundary.
- Fully deletable cleanup execution now deletes the planned closure package versions instead of deleting only the root
  package version.

## [0.9.6] - 2026-05-21

### Added

- Cleanup audit now persists concrete selected tags in `cleanup_selected_tags`.
- Cleanup schema docs now include a readable cleanup-decision view plus example SQL queries for audit inspection.
- GHCR digest-tag helper relations are now modeled explicitly in scan data and manifest reachability.

### Changed

- Cleanup summary JSON now exposes derived affected manifests for fully deletable roots.
- Cleanup Markdown now reads displayed counts from the summary arrays instead of carrying duplicate count fields.
- Cleanup decision audit fields are now constrained more tightly in SQLite and TypeScript, including `selection_mode`,
  `selection_reason`, and related block reason codes.
- Digest-tag helper artifacts are now classified on `tags.is_digest_tag` and excluded from normal user-facing tag
  selection and output.
- Digest-tag helper terminology was simplified across code and SQL surfaces.
- Schema docs now include a table of contents and collapsible example query blocks for easier GitHub browsing.

### Fixed

- Fixed remote action path handling for artifact upload and merge helper actions.
- Cleanup reachability now follows digest-tag helper edges recursively, matching helper-artifact cascades more closely.

## [0.9.5] - 2026-05-21

### Changed

- Renamed `upload-db-artifact` to `upload-artifacts`.
- Raised cleanup summary defaults to 100 matched tags and 100 roots per section.

## [0.9.4] - 2026-05-21

### Changed

- The root action now exposes `summary-json-path` instead of `summary-json`, so command summaries are consumed by file
  path rather than as a large action output payload.

### Fixed

- The GitHub Action now passes cleanup and untag summary JSON between steps by file path instead of large environment
  payloads, avoiding GitHub template-memory and argument-length failures on large cleanup runs.

## [0.9.3] - 2026-05-21

### Changed

- Cleanup selector planning now composes tagged and untagged selector families in one SQL-backed planner path.
- Cleanup CLI help and docs now describe the composed selector model, including tagged selectors combined with
  `delete-untagged`.

### Fixed

- `exclude-tag` now works correctly when a tagged selector family is combined with `delete-untagged`.

## [0.9.2] - 2026-05-21

### Changed

- The action input is now `token`, and the repo now uses `GITHUB_TOKEN` consistently in docs and helper scripts.

## [0.9.1] - 2026-05-21

### Fixed

- The GitHub Action now installs, builds, and runs from its own checkout path instead of the caller repository path.

## [0.9.0] - 2026-05-21

`0.9.0` is the first stable pre-`1.0` release of `ghcr-manager`.

### Added

- `cleanup` as the main GHCR maintenance flow for both the GitHub Action and the companion CLI.
- `untag` as a direct tag-removal mode that works without a scan database.
- `db-merge` and `merge-run-artifacts` support for combining scan databases across packages and workflow runs.
- Support for both organization-owned and user-owned GitHub Container Registry packages.
- Cleanup summary JSON output plus GitHub step summary rendering for action runs.
- Broad live and scenario-based workflow coverage for cleanup, untag, and cross-owner behavior.
- User-facing documentation for action usage, CLI usage, DB merge workflows, schema orientation, and SQL recipes.

### Changed

- The GitHub Action now builds and runs the repo-local CLI directly instead of installing `ghcr-manager` from npm at
  runtime.
- The primary maintenance surface is now `cleanup` with `dry-run` semantics, with `scan` and `untag` as supporting
  command modes.
- The action input and artifact flow were refined around scan databases, cleanup summaries, and optional post-cleanup
  rescan behavior.
- Documentation was reorganized around action-first usage, with deeper companion docs for CLI and database workflows.
- Release validation and workflow gating were tightened around exact version references, changelog readiness, and live
  scenario checks.

### Removed

- Built-in database artifact encryption and decryption support.

### Fixed

- Digest-selector scenario handling and related workflow wiring for `ghcr-manager`.
- Latest-scan based verification for cleanup and untag test flows.
- User-owner cleanup workflow behavior and related test setup details.
- Numerous workflow, artifact-handling, and planner-audit edge cases discovered during pre-release hardening.

## [0.0.6] - 2026-04-30

### Changed

- Internal workflow/debug wiring.

## [0.0.5] - 2026-04-30

### Changed

- Publish to npmjs by trusted publisher

## [0.0.4] - 2026-04-30

### Changed

- Publish to npmjs

## [0.0.3] - 2026-04-30

### Changed

- Released on GitHub marketplace as public action

## [0.0.1] - 2026-04-30

### Added

- Initial public release of `ghcr-manager` as a GitHub Action plus companion CLI.
- GHCR scan flow that loads package versions, tags, manifests, descriptors, and manifest graph edges into SQLite.
- Manifest reachability precomputation (`manifest_reachability`) for fast graph-based analysis queries.
- Raw payload storage for GitHub package-version items and GHCR manifests (`package_version_payloads`,
  `manifest_payloads`).
- Scan lifecycle tracking with scan history (`package_scans`) and status transitions (`running|completed|failed`).
- Immutable per-scan UUID (`package_scans.scan_uuid`) for robust duplicate detection across merged databases.
- Optional action artifact upload for scan DB export (`upload-db-artifact`, optional retention override).
- Manual workflow for interactive scan runs (`.github/workflows/manual-run.yml`).
- Missing-manifest investigation SQL recipes (`docs/queries/missing-manifests-queries.md`) and schema/terminology docs.

### Changed

- Enforced stricter repository conventions:
  - source/test tree mirroring
  - cross-folder imports via folder `index.ts`
  - internal source naming (`_*.ts`)
- Hardened CI/workflows with explicit token permissions and immutable action reference checks.
- Refined action/runtime flow to focus on scan + DB export behavior for this release.
