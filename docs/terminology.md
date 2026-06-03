# Terminology

Short glossary for developers working on `ghcr-manager`.

## Mental Model

- Start from Docker image terms, not abstract graph terms.
- In this repo, a "relation" usually just means one SQL row that links one digest to another.
- When the code says "graph", read it as:
  - a set of rows in `manifest_edges`
  - each row says one digest points to another digest
  - both digests exist in `manifests`

## Main Terms

<!-- markdownlint-disable MD013 -->

| Term              | Short meaning here                                                | Where it shows up                                                                 |
| ----------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| package           | One GHCR package, for example `acme/example`                      | `package_scans.owner` + `package_scans.package_name`                              |
| package version   | One GitHub Packages version entry for a package                   | `package_versions`                                                                |
| tag               | Human-readable name like `latest` or `1.2.3`                      | `tags.tag`                                                                        |
| digest            | Content address like `sha256:...`                                 | used across all main tables                                                       |
| image index       | Multi-arch manifest document that points to child image manifests | `manifests.media_type = application/vnd.oci.image.index.v1+json`                  |
| image manifest    | Single-platform image manifest, for example linux/amd64           | `manifests.media_type = application/vnd.oci.image.manifest.v1+json`               |
| artifact manifest | OCI artifact document, for example provenance or attestation      | `manifests.media_type = application/vnd.oci.artifact.manifest.v1+json`            |
| manifest kind     | Best-effort debug classification for exploratory SQL queries      | `manifests.manifest_kind`                                                         |
| referrer          | Artifact manifest that points back to some subject digest         | stored in `manifest_edges` when both manifests exist                              |
| subject           | The digest that an artifact refers to                             | source field from GHCR manifest JSON, becomes `parent_digest` for `referrer` rows |

<!-- markdownlint-enable MD013 -->

## GHCR / OCI Terms To Repo Terms

| GHCR / OCI term                              | Repo meaning                                       |
| -------------------------------------------- | -------------------------------------------------- |
| `manifests[]` inside an image index          | descriptor rows and known `manifest_edges` rows    |
| `subject.digest` inside an artifact manifest | known `referrer` edge or a missing digest in views |
| manifest document fetched by digest          | one package-version-backed row in `manifests`      |

## DB Tables

### `package_versions`

- One row per GitHub package version.
- Important columns:
  - `version_id`
  - `created_at`

This is the GitHub Packages view of the world and the parent table for fetched manifests.

### `tags`

- Maps a tag to a package version.
- Example:
  - `latest -> version 101`

This is how the planner knows which digests are tagged.

### `manifests`

- One row per package-version manifest fetched from GHCR.
- That can be an image index, an image manifest, or an artifact manifest.
- `manifest_kind` provides an optional best-effort category for debugging:
  - `index_manifest`
  - `multi_arch_manifest`
  - `image_manifest`
  - `artifact_manifest`
  - `attestation_manifest`
  - `signature_manifest`
- If no reliable classification is assigned, `manifest_kind` is `NULL`.
- Every row has a matching `package_versions(scan_id, version_id)` row.

This is the registry-document view of the world.

### `manifest_edges`

- Known direct manifest-to-manifest relations.
- Each row says:
  - `parent_digest` points to `child_digest`
  - both digests exist in `manifests`

Current edge kinds:

- `image-child`
  - Example: image index -> image manifest
- `referrer`
  - Example: image manifest or index -> attestation artifact manifest

This is the known relation table.

### `manifest_reachability`

- Derived table for precomputed transitive relations.
- Each row says:
  - `ancestor_digest` can reach `descendant_digest`

Example:

- Raw edges:
  - `A -> B`
  - `B -> C`
- Reachability rows:
  - `A -> B`
  - `B -> C`
  - `A -> C`

Use this table when you want SQL reads like:

- all descendants below some digest
- all ancestors above some digest

without recursive reads at plan time.

## One Concrete Example

Using the fixture in `tests/fixtures/sample-package.json`:

- `sha256:index-old`
  - is an image index
- `sha256:child-old`
  - is a child image manifest
- `sha256:attestation-old`
  - is an artifact manifest

Rows in `manifest_edges`:

| parent_digest          | child_digest             | edge_kind     |
| ---------------------- | ------------------------ | ------------- |
| `sha256:index-old`     | `sha256:child-old`       | `image-child` |
| `sha256:index-current` | `sha256:attestation-old` | `referrer`    |

Read those rows as:

- `index-old` includes `child-old`
- `index-current` has `attestation-old` attached to it

## Translation Cheatsheet

If you think in Docker terms, translate repo terms like this:

| Repo term    | Read it as                                                    |
| ------------ | ------------------------------------------------------------- |
| manifest     | registry document addressed by digest                         |
| edge         | one direct relation row between two digests                   |
| graph        | the full set of `manifest_edges` rows                         |
| child digest | digest directly named by another manifest                     |
| reachable    | can be reached by following one or more `manifest_edges` rows |

## What Not To Assume

- Not every manifest is a multi-arch index.
- `manifests` contains more than multi-arch documents.
- `manifest_edges` is not a GitHub API object.
- `manifest_edges` only contains relations where both endpoints are fetched manifests.
- Missing targets are derived by comparing descriptor and subject references with fetched manifest rows.
