# ghcr-manager

[![GitHub Marketplace](https://img.shields.io/badge/marketplace-ghcr--manager-blue?logo=github&labelColor=333&style=flat-square)](https://github.com/marketplace/actions/ghcr-manager)
[![Release](https://img.shields.io/github/v/release/gh-workflow/ghcr-manager?style=flat-square)](https://github.com/gh-workflow/ghcr-manager/releases)
[![Immutable Releases](https://img.shields.io/badge/releases-immutable-blue?labelColor=333)](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases)
[![Tests](https://img.shields.io/github/actions/workflow/status/gh-workflow/ghcr-manager/.github/workflows/ci_change-validation.yml?branch=main&label=test&style=flat-square)](https://github.com/gh-workflow/ghcr-manager/actions/workflows/ci_change-validation.yml)

Inspect, review, and manage GitHub Container Registry packages.

`ghcr-manager` is a GitHub Action for:

- scanning one GHCR package into a SQLite database artifact
- running cleanup with a GitHub step summary and optional DB artifact
- previewing cleanup decisions with `dry-run` before making changes

## Quick Start

For a first run, start with `cleanup` in `dry-run` mode.

```yaml
jobs:
  cleanup:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: read
      actions: write
    concurrency:
      group: ghcr-manager__OWNER__PACKAGE
    steps:
      - uses: actions/checkout@v6

      - name: Preview GHCR cleanup
        id: ghcr-manager
        uses: gh-workflow/ghcr-manager@0.9.8
        with:
          command: cleanup
          token: ${{ github.token }}
          owner: OWNER
          package: PACKAGE
          dry-run: true
          delete-untagged: true
          keep-n-tagged: "10"
          exclude-tags: |
            latest
          upload-artifacts: true
```

After the run:

1. Open the GitHub step summary for the action run.
2. Review which tags matched and which roots would be deleted, untagged, or blocked.
3. Only download the DB artifact if you need deeper inspection.

## Commands

The action supports two commands:

- `cleanup`: Cleans using filters; use `dry-run` to preview the result
- `scan`: Scans one package and uploads the resulting DB artifact

### Purpose of commands

- `cleanup`: Normal entry point for registry maintenance
- `scan`: For investigation and audit

## Common Usage

### Preview cleanup

```yaml
- uses: gh-workflow/ghcr-manager@0.9.8
  with:
    command: cleanup
    token: ${{ github.token }}
    owner: OWNER
    package: PACKAGE
    dry-run: true
    delete-tags: |
      pr-.*
    use-regex: true
    older-than: 30 days
    keep-n-tagged: "5"
    exclude-tags: |
      latest
      stable
    upload-artifacts: true
```

### Apply cleanup

```yaml
- uses: gh-workflow/ghcr-manager@0.9.8
  with:
    command: cleanup
    token: ${{ github.token }}
    owner: OWNER
    package: PACKAGE
    delete-untagged: true
    keep-n-tagged: "10"
    upload-artifacts: true
    scan-after-cleanup: true
```

If `scan-after-cleanup` is `true`, `cleanup` performs a second scan so the uploaded DB reflects post-mutation state.

Note: the second scan only runs if cleanup actually makes changes.

### Scan one package

```yaml
- uses: gh-workflow/ghcr-manager@0.9.8
  with:
    command: scan
    token: ${{ github.token }}
    owner: OWNER
    package: PACKAGE
```

`scan` always uploads a DB artifact.

## Inputs

<!-- markdownlint-disable MD013 MD060 -->

| Input                        | Description                         | Cmds | Required | Default                        |
| ---------------------------- | ----------------------------------- | ---- | -------- | ------------------------------ |
| `command`                    | `scan` or `cleanup`                 | all  | Yes      |                                |
| `token`                      | GitHub token for API calls          | all  | Yes      | `${{ github.token }}`          |
| `owner`                      | Package owner                       | all  | Yes      |                                |
| `package`                    | Package name                        | all  | Yes      |                                |
| `db-path`                    | Local SQLite DB path                | s,c  | No       |                                |
| `upload-artifacts`           | Upload DB and summary artifacts     | s,c  | No       | `false`                        |
| `scan-after-cleanup`         | Run a second scan after cleanup     | c    | No       | `false`                        |
| `db-artifact-retention-days` | Override artifact retention days    | s,c  | No       | `${{ github.retention_days }}` |
| `delete-tags`                | Newline-separated tags to delete    | c    | No       |                                |
| `exclude-tags`               | Newline-separated tags to exclude   | c    | No       |                                |
| `keep-n-tagged`              | Keep newest tagged roots            | c    | No       |                                |
| `keep-n-untagged`            | Keep newest untagged roots          | c    | No       |                                |
| `delete-untagged`            | Delete untagged roots               | c    | No       | `false`                        |
| `delete-ghost-images`        | Delete ghost multi-arch roots       | c    | No       | `false`                        |
| `delete-partial-images`      | Delete partial multi-arch roots     | c    | No       | `false`                        |
| `delete-orphaned-images`     | Delete orphaned digest-derived tags | c    | No       | `false`                        |
| `older-than`                 | Age cutoff for cleanup selectors    | c    | No       |                                |
| `use-regex`                  | Use regex for cleanup tag selectors | c    | No       | `false`                        |
| `dry-run`                    | Show changes without mutating GHCR  | c    | No       | `false`                        |
| `log-level`                  | CLI log level                       | all  | No       | `info`                         |

<!-- markdownlint-enable MD013 MD060 -->

`Cmds`: `s` = `scan`, `c` = `cleanup`

Cleanup command notes:

- Tagged selector families may be combined with `delete-untagged`.
- `exclude-tags` requires at least one tagged selector family.
- `delete-untagged` and `keep-n-untagged` cannot be combined.
- `older-than` takes one integer plus one unit.
  - Supported `older-than` units: `minutes`, `hours`, `days`, `weeks`, `months`, `years`.
  - Example values: `30 days`, `2 hours`, `1 month`.

## Outputs

| Output              | Description                          |
| ------------------- | ------------------------------------ |
| `db-path`           | SQLite DB path on the runner         |
| `summary-json-path` | Summary JSON file path for `cleanup` |

## Artifacts

When artifacts are enabled:

- `scan` always uploads one SQLite DB artifact
- `cleanup` optionally uploads the DB artifact and a cleanup summary JSON artifact

Current naming:

| Artifact type        | Filename pattern                                    |
| -------------------- | --------------------------------------------------- |
| scan or cleanup DB   | `${OWNER}__${PACKAGE}.sqlite`                       |
| cleanup summary JSON | `${OWNER}__${PACKAGE}.sqlite--cleanup-summary.json` |

## Documentation Map

- [GitHub Action usage](docs/action-usage.md): action commands, including `cleanup` and `scan`
- [Multi-package workflows](docs/db-merge-workflows.md): cleaning up multiple packages with one combined DB
- [SQLite schema guide](docs/schema-description.md): practical explanation of the SQLite schema
- [CLI usage](docs/cli-usage.md): companion CLI usage
- [Visualizer](docs/visualizer.md): local graph inspection and scan-to-scan comparison

## Acknowledgment

This project was influenced by [dataaxiom/ghcr-cleanup-action](https://github.com/dataaxiom/ghcr-cleanup-action), with a
similar problem focus and a different implementation approach.
