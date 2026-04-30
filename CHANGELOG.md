# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Missing-manifest investigation SQL recipes (`docs/missing-manifests-queries.md`) and schema/terminology docs.

### Changed

- Enforced stricter repository conventions:
  - source/test tree mirroring
  - cross-folder imports via folder `index.ts`
  - internal source naming (`_*.ts`)
- Hardened CI/workflows with explicit token permissions and immutable action reference checks.
- Refined action/runtime flow to focus on scan + DB export behavior for this release.
