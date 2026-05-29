# Schema In Human Terms

This document explains the current SQLite schema in practical terms.

If you open a scan DB for the first time, the shortest useful path is usually:

1. `package_scans`: what package and run this DB contains
2. `package_versions` + `tags`: which versions and tags exist
3. `manifests`: which root digest each package version points to

The rest of the schema helps when you want to inspect manifest relations, referrers, or cleanup audit detail.

## Table Of Contents

- [Big Picture](#big-picture)
- [Mental Model](#mental-model)
- [Core Scan Tables](#core-scan-tables)
- [Manifest Tables](#manifest-tables)
- [Manifest Graph Tables](#manifest-graph-tables)
- [What Is And Is Not Fetched](#what-is-and-is-not-fetched)
- [Derived Views](#derived-views)
- [Cleanup Audit Tables](#cleanup-audit-tables)
- [Raw JSON Versus Derived Meaning](#raw-json-versus-derived-meaning)
- [Practical Reading Order](#practical-reading-order)
- [Example Queries](#example-queries)

## Big Picture

One database can contain:

- many scans
- of many `owner/package` pairs
- plus optional cleanup audit runs linked to those scans

The database is therefore not "one package" or "one workflow run". It is a small local registry-analysis store.

The high-level flow is:

1. Read package versions from the GitHub Packages API.
2. Read tags from those package-version payloads.
3. Fetch the manifest JSON for each package-version digest from GHCR.
4. Store the fetched manifests and the direct relations named inside them.
5. Precompute reachability between known manifests.
6. Optionally persist cleanup planner/execution audit rows linked to a chosen scan.

## Mental Model

The most useful way to read this schema is:

- `package_versions` is GitHub's deletable unit
- `tags` tells you which package version currently carries which human-readable names
- `manifests` is the registry document for that package version
- `manifest_edges` says which known manifests point to which other known manifests
- `manifest_reachability` says what is reachable through those edges

So:

- GitHub Packages gives the "version list"
- GHCR gives the actual registry documents
- `ghcr-manager` joins both worlds into one queryable model

## Core Scan Tables

### `package_scans`

One row per scan run.

Important columns:

- `scan_id`
- `scan_uuid`
- `owner`
- `package_name`
- `package_metadata_json`
- `github_actions_run_url`
- `scan_started_at`
- `scan_completed_at`
- `status`

What this means:

- a scan is the top-level unit for all registry data loaded at one point in time
- the same database can hold several scans for the same package over time
- it can also hold scans for different packages
- `package_metadata_json` keeps the raw-ish package metadata that came from GitHub
- `github_actions_run_url` is just provenance: where this scan came from, if it ran in GitHub Actions

### `package_versions`

One row per GitHub Packages version entry within one scan.

Important columns:

- `scan_id`
- `version_id`
- `created_at`
- `updated_at`

What this means:

- this is GitHub's package-version identity
- cleanup ultimately deletes by package version
- every fetched root manifest is attached to one `package_versions` row

### `package_version_payloads`

Raw JSON for each `package_versions` row.

This is mainly for:

- debugging
- later analysis
- not having to guess what GitHub returned

### `tags`

Maps a tag name to one package version within one scan.

Important columns:

- `scan_id`
- `tag`
- `version_id`
- `is_digest_tag`

What this means:

- `latest`, `1.2.3`, `pr-123`, and so on are stored here
- tags are not free-floating objects in this DB
- a tag belongs to one package version in one scan
- `is_digest_tag = 1` marks internal tags that point at manifests.

## Manifest Tables

### `manifests`

One row per fetched manifest document that corresponds to a package version.

Important columns:

- `scan_id`
- `version_id`
- `digest`
- `media_type`
- `artifact_type`
- `config_media_type`
- `subject_digest`
- `annotations_json`
- `platform_os`
- `platform_architecture`
- `platform_variant`
- `manifest_kind`

What this means:

- a package version points to exactly one fetched root manifest row
- this row represents one of:
  - a generic index/list manifest or a refined multi-arch image manifest
  - a single-platform image manifest
  - an OCI artifact manifest
  - a signature or attestation-like artifact

`manifest_kind` is a best-effort helper classification. It is useful for queries and debugging, but when correctness
matters, trust the actual manifest payload fields first.

Current values:

- `index_manifest`
- `multi_arch_manifest`
- `image_manifest`
- `artifact_manifest`
- `attestation_manifest`
- `signature_manifest`

### `manifest_payloads`

Raw JSON body for each fetched manifest digest.

This is the exact registry document body `ghcr-manager` used to derive:

- child descriptors
- `subject_digest`
- media type
- platform hints
- annotations

### `manifest_descriptors`

Direct child descriptors as named inside fetched manifest JSON.

Important columns:

- `parent_digest`
- `child_digest`
- `media_type`
- `artifact_type`
- platform columns

What this means:

- if a manifest document names another digest inside its JSON, a descriptor row is stored here
- the child digest does not have to exist as a fetched `manifests` row
- this table preserves what the manifest said, even when the child is not otherwise present in the package-version set

## Manifest Graph Tables

### `manifest_edges`

Direct known manifest-to-manifest relations where both endpoints exist in `manifests`.

Important columns:

- `parent_digest`
- `child_digest`
- `edge_kind`

Current edge kinds:

- `image-child`
- `referrer`

What this means:

- `image index -> image manifest` becomes `image-child`
- `artifact -> subject` becomes `referrer` when both sides are present in the known manifest set

This is the main "graph" table.

### `manifest_reachability`

Precomputed transitive closure over `manifest_edges`.

Important columns:

- `ancestor_digest`
- `descendant_digest`
- `min_distance`

What this means:

- if `A -> B` and `B -> C`, then reachability stores:
  - `A -> B`
  - `B -> C`
  - `A -> C`
- self rows are also present with `min_distance = 0`

This table exists so planner and analysis queries do not need recursive SQL at read time.

## What Is And Is Not Fetched

Important limitation:

- `manifests` only contains package-version-backed manifest rows
- a digest mentioned inside a manifest is not fetched automatically just because it was referenced

So:

- known package-version digests become `manifests`
- referenced-but-absent digests remain external to `manifests`
- they are visible through derived views instead

## Derived Views

### `v_latest_scan_per_package`

One latest completed scan per `owner/package`.

Use this when you want "current latest picture" style queries instead of manually picking a `scan_id`.

### `v_scan_root_manifests`

One root manifest per package version, enriched with query-friendly flags.

Important columns include:

- `root_version_id`
- `root_digest`
- `root_manifest_kind`
- `created_at`
- `updated_at`
- `tag_count`
- `is_tagged`
- `has_ancestor`

This is the main convenience view for "what are the roots in this scan?"

### `v_digest_tag_relations`

Heuristic helper view for digest-shaped tags such as `sha256-<digest>.sig`.

It extracts a parent digest from the tag name and compares that with:

- whether that digest exists in `manifests`
- whether the artifact's `subject_digest` matches that parent

This is exploratory/helper data, not authoritative graph structure.

In practice, use it to inspect suspicious digest-shaped tags or orphan-style companion artifacts, not to replace
`manifest_edges` or `manifest_reachability`.

### `v_cleanup_root_closure_members`

Derived closure members for persisted cleanup runs.

It starts from `cleanup_root_decisions` and expands each selected root through `manifest_reachability`.

This is useful for answering:

- what would this cleanup decision remove?
- which manifests sat in the root's closure?

### `v_cleanup_blocking_overlaps`

Derived explanation view for persisted cleanup blocking relations.

It joins:

- cleanup run
- blocked root
- protected root
- overlap manifest

This is the query-friendly explanation layer for "why was this root blocked?"

### `v_cleanup_root_decision_readable`

Derived readable view for persisted cleanup root decisions.

It adds:

- plain-language labels for `selection_mode`
- plain-language labels for `selection_reason`
- plain-language labels for `validation_status`
- plain-language labels for `validation_reason_code`
- `selected_tag_count` and comma-joined `selected_tags` per resolved root

Use it when the raw audit codes are too terse to inspect directly.

## Cleanup Audit Tables

### `cleanup_runs`

One row per `cleanup` invocation persisted to the DB.

Important columns:

- `cleanup_run_id`
- `scan_id`
- `cleanup_uuid`
- `github_actions_run_url`
- `dry_run`
- `planner_inputs_json`
- summary counts such as:
  - `direct_target_root_count`
  - `untag_only_root_count`
  - `fully_deletable_root_count`
  - `blocked_delete_root_count`

What this means:

- a cleanup run is attached to the exact scan it planned from
- both `dry-run` and cleanup that makes changes can be persisted
- the summary counts make the run readable without re-running planner logic

### `cleanup_root_decisions`

One row per selected cleanup root decision.

Important columns:

- `digest`
- `selection_mode`
- `selection_reason`
- `validation_status`
- `validation_reason_code`
- `validation_reason`
- optional `blocking_digest`
- optional `overlap_digest`

What this means:

- this is the persisted root-level planner result
- it distinguishes:
  - fully deletable
  - blocked
  - untag-only
- it is digest-first for query convenience and does not try to persist selector-clause provenance
- `selection_mode` is constrained to:
  - `delete-root`
  - `untag-only`
- `selection_reason` is constrained to:
  - `delete-tags-all-tags-selected`
  - `delete-tags-partial-tag-match`
  - `delete-untagged`
  - `keep-n-tagged-overflow`
  - `keep-n-untagged-overflow`
- `validation_reason_code` is constrained to:
  - `fully-deletable-no-retained-overlap`
  - `untag-only-partial-tag-match`
  - `blocked-overlap-with-retained-root`

### `cleanup_selected_tags`

One row per concrete tag selected by a cleanup run.

Important columns:

- `tag`
- `is_deleted`

What this means:

- this is the tag-side audit evidence for cleanup
- it records concrete selected tags, not selector-clause provenance
- `is_deleted = 1` means the selected tag is planned to disappear in a dry-run or does disappear in a live cleanup
- `is_deleted = 0` means the selected tag survived because its root was blocked
- version, digest, and root-outcome context are derived by joining through `tags`, `manifests`, and
  `cleanup_root_decisions`

### `cleanup_protected_root_blocks`

Normalized blocking explanation rows.

Important columns:

- `protected_digest`
- `blocked_digest`
- `overlap_digest`
- `block_reason_code`

What this means:

- root A blocked root B because both reach overlap manifest C
- the table enforces that evidence via foreign keys into `manifest_reachability`

## Raw JSON Versus Derived Meaning

Two recurring patterns matter in this schema:

1. raw payload side tables preserve what GitHub/GHCR actually returned
2. derived tables/views add planner- and analysis-friendly structure

So if you are unsure:

- trust payloads for factual source data
- trust derived tables/views for repo-specific interpretation and convenience

## Practical Reading Order

If you open a DB and want to understand a package quickly, this order works well:

1. `package_scans`
2. `v_latest_scan_per_package`
3. `v_scan_root_manifests`
4. `tags`
5. `manifests`
6. `manifest_edges`
7. `manifest_reachability`
8. cleanup audit tables/views if a cleanup run exists

That path usually gets someone from "I know Docker tags and manifests" to "I can see how this GHCR package is shaped"
without needing to learn every table up front.

## Example Queries

### Latest Cleanup Run With Readable Root Decisions

Use this to inspect the latest cleanup run for one package with friendlier labels and selected tags per root:

<!-- markdownlint-disable MD033 -->
<details>
<summary>Show Query</summary>

```sql
WITH latest_cleanup AS (
  SELECT cr.cleanup_run_id
  FROM cleanup_runs cr
  JOIN package_scans ps
    ON ps.scan_id = cr.scan_id
  WHERE ps.owner = 'acme'
    AND ps.package_name = 'example'
  ORDER BY cr.cleanup_started_at DESC, cr.cleanup_run_id DESC
  LIMIT 1
)
SELECT
  root_digest,
  root_manifest_kind,
  selected_tags,
  selection_mode_label,
  selection_reason_label,
  validation_status_label,
  validation_reason_code_label,
  blocking_digest,
  overlap_digest
FROM v_cleanup_root_decision_readable
WHERE cleanup_run_id = (SELECT cleanup_run_id FROM latest_cleanup)
ORDER BY root_digest;
```

</details>
<!-- markdownlint-enable MD033 -->

### Selected Tags Expanded To Affected Manifests

Use this to answer "which selected tag led to which root, and what manifests sit in that root's affected closure?":

<!-- markdownlint-disable MD033 -->
<details>
<summary>Show Query</summary>

```sql
WITH latest_cleanup AS (
  SELECT cr.cleanup_run_id, cr.scan_id
  FROM cleanup_runs cr
  JOIN package_scans ps
    ON ps.scan_id = cr.scan_id
  WHERE ps.owner = 'acme'
    AND ps.package_name = 'example'
  ORDER BY cr.cleanup_started_at DESC, cr.cleanup_run_id DESC
  LIMIT 1
)
SELECT
  selected.tag AS selected_tag,
  root.digest AS root_digest,
  readable.validation_status_label,
  closure.member_digest AS affected_manifest_digest,
  closure.member_manifest_kind,
  closure.hops_from_root,
  closure.member_role
FROM latest_cleanup lc
JOIN cleanup_selected_tags selected
  ON selected.cleanup_run_id = lc.cleanup_run_id
 AND selected.scan_id = lc.scan_id
JOIN tags selected_tag
  ON selected_tag.scan_id = selected.scan_id
 AND selected_tag.tag = selected.tag
JOIN manifests root
  ON root.scan_id = selected.scan_id
 AND root.version_id = selected_tag.version_id
JOIN v_cleanup_root_decision_readable readable
  ON readable.cleanup_run_id = selected.cleanup_run_id
 AND readable.scan_id = selected.scan_id
 AND readable.root_digest = root.digest
JOIN v_cleanup_root_closure_members closure
  ON closure.cleanup_run_id = selected.cleanup_run_id
 AND closure.scan_id = selected.scan_id
 AND closure.root_digest = root.digest
ORDER BY selected.tag, closure.hops_from_root, closure.member_digest;
```

</details>
<!-- markdownlint-enable MD033 -->
