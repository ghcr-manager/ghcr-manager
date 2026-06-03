# Implementation Notes

This document tracks the current implementation plan, decisions, and completed increments for `ghcr-manager`.

## Session Handoff

This section is the canonical place for session-to-session continuity.

- Developer glossary: [docs/terminology.md](../terminology.md)

### Completed Checkpoints

- ☑ `ef2e25c` Split planner repository internals.
- ☑ `bf29cfd` Refine cleanup selector planning.
- ☑ `01116c1` Add delete-ghost-images planner and scenarios.
- ☑ `57b252a` Keep orphan scenarios from deleting last package tag.
- ☑ `cdb7121` Add test registry validation workflow.
- ☑ `ed36f7c` Add delete-untagged planner command.
- ☑ `fe6fd7b` Add planner data model note.
- ☑ `adde55e` Add cleanup semantics note.
- ☑ `5c4b0c9` Add cleanup planning roadmap.
- ☑ `6899876` Add GHCR manager analysis and roadmap.
- ☑ `bc651cb` Add initial TypeScript project scaffold.
- ☑ `2483a75` Replace Python linting with Node-native tooling.
- ☑ `b902eda` Strengthen session handoff documentation.
- ☑ `9d2eb23` Add live GHCR package scan support.
- ☑ `e33d011` Restructure modules and enforce source-test boundaries.
- ☑ `38159a1` Add scan logging and auth debug helper.
- ☑ `b854e18` Generalize paginated GitHub ingest.
- ☑ `5160246` Enforce foreign keys in the scan schema.
- ☑ `1166d0c` Improve GitHub and GHCR error reporting.
- ☑ `c61c531` Refine tag foreign keys and trim schema tests.
- ☑ `0a5f620` Extract matrix DB artifact download script.
- ☑ `0969bff` Add DB merge artifact upload support.
- ☑ `7109662` Tighten cleanup block reachability constraints.
- ☑ `3dd031a` Split matrix artifact helper scripts.
- ☑ `3fd550d` Add merge run artifacts sub-action.
- ☑ `c473526` Extract DB artifact visibility helper.

### Completed Plan

- ☑ Inspect current repo state and existing workflow assumptions for a TypeScript-based scaffold.
- ☑ Add lightweight project tracking docs for decisions, scope, and next increments.
- ☑ Scaffold minimal TypeScript project structure for shared core, CLI, and action entrypoint.
- ☑ Add initial SQLite schema/repository, fixture-backed scan flow, and planner summary.
- ☑ Add focused tests and update CI/lint configuration for the new stack.
- ☑ Run validation commands and summarize completed work plus next steps.

### Current Next Plan

- ☑ Add an initial cleanup roadmap that breaks the broad reimplementation goal into session-sized subtasks and defines
  how planning state is documented across sessions.
- ☑ Write the cleanup semantics note: define the deletion unit, supported inputs, and explicit non-goals relative to
  `dataaxiom/ghcr-cleanup-action`.
- ☑ Define planner outputs around manifest closures and tag overlap, including direct targets, blocked manifests, and
  collateral tags.
- ☑ Add read-only deletion-plan output that explains why versions or manifests are retained versus deletable.
- ☑ Add tests for multi-arch images, sibling wrapper indexes, and referrers.
- ☑ Add explicit tag exclusion planner behavior for the current exact-match tag planner inputs.
- ☑ Add root-level `older-than` eligibility filtering for the current planner selector families.
- ☑ Separate test-registry seeding from test-registry validation runs so GHCR fixtures can be reused across sessions.
- ☑ Add scenario-driven seeded-registry validation runs that exercise tag deletion, exclusions, and age filtering.
- ☑ Add the first keep-rule planner slice via `--keep-n-untagged`.
- ☑ Add the first tagged keep-rule planner slice via `--keep-n-tagged`.
- ☑ Define combined `delete-tags` + `keep-n-tagged` semantics for shared-root cases before implementation.
- ☑ Implement combined `delete-tags` + `keep-n-tagged` planning with root-level keep ranking.
- ☑ Add seeded-registry validation scenarios for combined tagged keep rules.
- ☑ Rewrite root ancestor detection to use reachability distance and add a descendant-distance index for large-plan
  performance.
- ☑ Remove redundant `package_versions` joins from keep-rule planner queries and rank directly from
  `v_scan_root_manifests.created_at`.
- ☑ Split tagged selector planning into separate query shapes for standalone `keep-n-tagged` and exact
  `delete-tag`-driven selection.
- ☑ Keep large direct-target root sets inside SQLite temp tables for closure/blocking analysis instead of rebinding them
  as giant `VALUES` tuples.
- ☑ Replace blocked-root validation over the global `v_scan_root_overlap` view with request-scoped joins from selected
  closure members to retained roots.
- ☑ Expand plan output with explicit validation summaries, per-root decisions, and protected-root explanations.
- ☑ Record GitHub package visibility in `package_scans`, expose it in scan metadata, and block unencrypted DB artifact
  uploads for non-public scans.
- ☑ Complete the hardening side-task: require encrypted DB artifact upload for non-public registries, support optional
  encryption for public registries, and abort scans when package-version page 1 drifts during ingest.
- ☑ Abort live GitHub scans when the package-version page-1 signature changes between the start and end of paginated
  ingestion.
- ☑ Extend the planner beyond `--delete-untagged` to cover tag selectors, exclusions, age filters, and keep rules.
- ☑ Extend execution beyond package-version deletion so `untag-only` roots can be applied safely.
- ☑ Validate the new execution path against the seeded test registry workflow instead of local-only command tests.
- ☑ Resolve upstream-action compatibility with the dedicated GHCR test org well enough for the current scenario matrix
  to pass with both executors.
- ☑ Extend the live scenario executor harness beyond basic delete/untag cases so it can exercise tag exclusion and keep
  rules against the dedicated test org.
- ☑ Add CLI-side wildcard tag selector expansion for tagged planner/execution flows, with optional `--use-regex`
  fallback for explicit regex selector runs.
- ☑ Add DB-derived `delete-orphaned-images` planning/execution by resolving orphan-style `sha256-*` tags from the latest
  scan before the tagged planner runs.
- ☑ Add a derived `v_digest_derived_tag_relations` SQL view for digest-shaped `sha256-*` tags without weakening the
  strict manifest graph tables.
- ☑ Add a repo-local digest-derived tag relation reporting tool and query note so latest-scan heuristic rows can be
  inspected without ad hoc SQL.
- ☑ Design and implement the next upstream-alignment slice: `delete-ghost-images`, keeping the current DB-first planner
  shape.
- ☑ Record the first green GitHub Actions matrix that includes the `delete-ghost-images` live scenarios.
- ☑ Design and implement the next upstream-alignment slice: `delete-partial-images`, keeping the current DB-first
  planner shape and treating it as the strict some-but-not-all-missing sibling to `delete-ghost-images`.
- ☑ Run the newly added `delete-partial-images` live scenarios in GitHub Actions and record the first green matrix that
  includes them.
- ☑ Revisit action packaging after the live ingest path and cleanup execution path are both stable.
- ☑ Add explicit live scenario coverage for Docker manifest-list multi-arch roots now that manifest-kind classification
  treats them as `image_index`.
- ☑ Run the expanded scenario matrix in GitHub Actions and record the first green baseline that includes the Docker
  manifest-list shared-root scenario.
- ☑ Persist cleanup planner runs in SQLite for both `cleanup --dry-run` and live `cleanup`, starting with the run
  header, root decisions, and protected roots.
- ☑ Add a first repo-local read/query surface for persisted cleanup planner runs.
- ☑ Add narrow scenario-level cleanup audit assertions for one blocked and one fully deletable live executor case so
  action-owned DB artifacts prove cleanup-run persistence end to end.
- ☑ Add stable cleanup-audit reason codes for root validation outcomes and protected-root block relations.
- ☑ Add derived cleanup-audit SQL views for selected-root closure members and blocking overlaps instead of persisting
  another high-cardinality table.
- ☐ Decide whether any further cleanup-audit read surface beyond repo-local tools and SQL views is still needed.
- ☑ Add package scopes to the DB schema so one SQLite database can store multiple owner/package scans.
- ☑ Split the oversized planner repository into focused internal DB helpers for typed row mapping, selector handling,
  direct-target queries, and closure/blocking analysis while keeping `PlannerRepository` as the only public entrypoint.
- ☑ Split tagged-target planning again so direct tag enumeration and tagged root selection live in separate internal DB
  helpers.
- ☑ Add a real GitHub Packages and GHCR ingest adapter beside the fixture loader.
- ☑ Normalize live package, version, tag, manifest, and edge data into the existing SQLite schema.
- ☑ Refactor ingest so GitHub and fixture input write incrementally into SQLite instead of assembling package-level
  in-memory snapshots.
- ☑ Introduce a generic paginated ingest pipeline for request -> normalize -> write and move package version/tag
  enumeration onto it.
- ☑ Add a derived reachability table to the schema for non-recursive manifest graph reads.
- ☑ Add raw-payload master tables for package-version items and manifest items.
- ☑ Split `package_versions.metadata_json` into a separate table for consistency with raw payload storage.
- ☑ Write raw package-version and manifest response JSON into dedicated payload tables during live ingest.
- ☑ Split fetched manifest documents from index child descriptors at the schema level.
- ☑ Write index child descriptor rows into `manifest_descriptors` and track missing referenced manifests separately.
- ☑ Extract `config_media_type`, `subject_digest`, and `annotations_json` from fetched manifest JSON into `manifests`.
- ☑ Cache and reuse GHCR pull tokens during manifest scans, refreshing based on token expiry instead of reloading per
  manifest.
- ☑ Fetch GHCR manifests with bounded parallelism instead of strictly one-by-one, with a code-local concurrency constant
  for easy tuning.
- ☑ Fetch GitHub package-version pages with bounded parallelism instead of strict sequential paging, with a code-local
  concurrency constant for easy tuning.
- ☑ Add bounded retry handling for GitHub/GHCR requests; after the retry budget is exhausted, the scan fails immediately
  with context-rich errors.
- ☑ Add automated assertions for seeded test-registry validation runs so fixture drift fails the validation workflow.
- ☑ Remove the legacy seeded-fixture validation workflow and its helper scripts now that scenario workflows are the
  active live test surface.
- ☑ Expand planner output so it explains more clearly why versions are protected or deletable.
- ☑ Add manifest kind classification so image indexes, image manifests, signatures, and attestations are queryable
  without ad-hoc JSON inspection.

### Current State Summary

- Runtime: Node.js and TypeScript.
- Linting: ESLint, `eslint-plugin-yml`, `markdownlint-cli2`, and Prettier.
- Persistence model: local SQLite database per run.
- Current ingest sources:
  - live GitHub Packages plus GHCR manifest scan for one org-owned or user-owned container package
  - local JSON snapshot fixture in `tests/helpers` as a test helper only
- Current ingest implementation:
  - writes fixture and live GitHub/GHCR results incrementally into SQLite
  - uses a dedicated GHCR registry token client for bearer-token acquisition
  - requires explicit GitHub token input for all scans (no anonymous path)
  - uses a shared paginated ingest helper for GitHub Packages version/tag enumeration, writing each page directly to
    SQLite
  - fetches manifests only for package-version digests, then records known edges from those payloads
- Ingest architecture direction:
  - SQLite is the integration surface between ingest stages
  - avoid package-level in-memory aggregate models as the ingest contract
  - repeated paginated API ingestion should use one generic request -> normalize -> write pipeline, with per-endpoint
    hooks only where necessary
- GitHub package owner routing:
  - container package API calls now resolve owner kind explicitly through `GET /users/{owner}` and then choose the
    `orgs/...` vs `users/...` package route family once
  - do not probe one package route and then fall back to the other; explicit owner-kind lookup is the chosen behavior
  - owner-kind routing is cached per owner through `getOwnerURIComponent(...)`; callers should not thread owner-kind
    through deeper internal APIs
- Bedrock service constants:
  - `https://api.github.com`, `https://ghcr.io`, and the GitHub API version header are fixed values, not runtime
    configuration
  - keep them as shared/private constants rather than threading them through TypeScript runtime options or action env
- Relational integrity direction:
  - add FKs by default and satisfy them via ingest order
  - only relax constraints later if a demonstrated ingest problem requires it
  - `tags(scan_id, version_id)` references `package_versions(scan_id, version_id)`
  - `manifests(scan_id, version_id)` references `package_versions(scan_id, version_id)`
  - `manifest_edges` remains known-to-known, with both endpoints referencing `manifests(scan_id, digest)`
  - missing referenced digests are derived from descriptor and subject references instead of being represented as
    manifest rows
- Current action shape: thin composite wrapper that installs dependencies, builds the repo-local CLI from source, and
  invokes that shared CLI directly without installing the package from npm at runtime.
- Current developer validation commands:
  - `./scripts/lint.sh` runs the full lint/typecheck/format pipeline
  - `npm test` runs the Node test suite
  - `npm run coverage` is the preferred TypeScript-attributed coverage report; the raw Node
    `--experimental-test-coverage` output is not a trustworthy repo-wide signal here
  - the current repo baseline from `npm run coverage` is `96.82%` statements/lines, `88.5%` branches, and `100%`
    functions; the recent CLI/cleanup coverage hardening brought both `_cleanup-command.ts` and `_scan-command.ts` to
    full line coverage, and the next notable remaining hotspots are execute-side HTTP/page clients rather than planner
    core
- Action interface direction:
  - `command` is explicit and required; the action no longer defaults to `scan` when callers omit it
  - root-action `delete-tags` and `exclude-tags` now use newline-separated values instead of comma-separated values
  - `command: untag` is now supported as a direct no-DB side command; it uses explicit tag inputs, rejects
    scan/cleanup-only knobs, and does not support DB artifact upload
  - direct `untag` live validation now lives in its own executor plus matrix workflow pair, separate from the broader
    cleanup scenario matrix
  - direct `untag` live validation also uses dedicated untag-only scenario definitions, so package names and tag
    prefixes in the uploaded DBs read as untag-focused test data instead of reusing cleanup scenario names
- Current action DB handling:
  - by default the action creates a fresh DB path under runner temp storage
  - the action also supports an optional local `db-path` input so later scans can append to the same SQLite file
  - `command: scan` always uploads the resulting DB artifact
  - `command: cleanup` always runs an implicit pre-scan and optionally uploads the resulting DB
  - live `cleanup` only runs the second post-mutation scan when the caller opts into `scan-after-cleanup`
  - DB merge now lives in a separate sub-action at `db-merge/action.yml`, so the root action keeps strict required
    inputs for `scan` / `cleanup`
  - for `scan` / uploaded `cleanup` DBs, the root action now owns the non-public artifact policy entirely: it does an
    early plaintext-only refusal check from current package metadata plus existing DB contents, then uses the same final
    DB-content check as `db-merge` immediately before upload
  - the duplicated final DB-artifact upload tail is now shared through the internal composite action
    `.github/actions/upload-db-artifact/action.yml`, which keeps the validate/resolve/encrypt/upload flow readable in
    YAML while removing duplicate logic from `action.yml` and `db-merge/action.yml`
  - the `db-merge` sub-action now also supports optional DB artifact upload with the same retention-day override and the
    same encryption rule as `scan`: if the merged DB contains any non-public scan, plaintext upload is refused
  - `untag` uses direct GitHub Packages plus GHCR calls instead of a full scan DB; after the rewrite-delete sequence it
    verifies that the requested tag is gone and that the temporary package version is no longer visible
  - `merge-run-artifacts` now names its merged output `ghcr-manager-merged.sqlite` and excludes the just-uploaded merged
    artifact from source-artifact cleanup by using the nested `db-merge` upload artifact ID
  - `merge-run-artifacts` now exposes `db-file` as an input, defaulting to `ghcr-manager-merged.sqlite`, while
    re-exporting the nested `db-merge` outputs directly
  - current-run artifact collection plus merge now also lives in `merge-run-artifacts/action.yml`, which wraps the
    helper scripts plus the nested `db-merge` sub-action into one user-facing "collect current-run DB artifacts and
    merge them" entrypoint and exposes the resulting merged DB path as output rather than requiring callers to pick one
- Current cleanup audit persistence:
  - every CLI `cleanup` invocation now stores one `cleanup_runs` row linked to the exact latest completed scan used by
    the planner
  - `package_scans` now also stores `package_metadata_json` and a nullable `github_actions_run_url`; `cleanup_runs` also
    stores the same nullable run URL so scans and cleanups can point back to the originating GitHub Actions run
  - `package_scans.package_metadata_json` is now required at scan-row creation time; the writer starts scans with
    explicit package metadata up front rather than creating half-populated scan rows and patching visibility later
  - each persisted cleanup run now also stores a stable `cleanup_uuid`, which is used only as cleanup-run identity for
    DB merge history comparisons
  - the first persisted slice stores planner inputs plus summary counts in `cleanup_runs`
  - root-level planner decisions are stored in `cleanup_root_decisions` as digest-based rows scoped by explicit
    `scan_id`, with digest foreign keys back to `manifests(scan_id, digest)` instead of hidden `package_versions` joins
  - cleanup audit rows now persist stable code fields beside human-readable prose: `validation_reason_code` on
    `cleanup_root_decisions` and `block_reason_code` on `cleanup_protected_root_blocks`
  - cleanup-audit read ergonomics now rely on derived SQL views instead of persisting closure-member rows:
    `v_cleanup_root_closure_members` materializes selected-root closures from existing graph data, and
    `v_cleanup_blocking_overlaps` materializes protected/blocking overlap evidence from the persisted audit rows
  - protected-root blocking relations are normalized into `cleanup_protected_root_blocks` as
    `protected_digest`/`blocked_digest`/`overlap_digest` rows, again scoped by explicit `scan_id`
  - `cleanup_protected_root_blocks` now enforces block evidence through two composite foreign keys into
    `manifest_reachability` (`protected_digest -> overlap_digest` and `blocked_digest -> overlap_digest`) rather than
    three looser manifest-existence foreign keys
  - the separate `cleanup_protected_roots` table has been removed again; the protected-root set is now derived as
    `DISTINCT protected_digest` from `cleanup_protected_root_blocks`
  - `tools/report-cleanup-run.mjs` can now render one persisted cleanup run back into planner-shaped JSON, either by
    explicit `--cleanup-run-id` or by latest run for `--owner` plus `--package`
  - this first slice intentionally does not persist `closureManifests` or per-manifest execution effects yet
- Planner repository structure:
  - `src/db/planner/_planner-repository.ts` now coordinates smaller internal helpers instead of owning all SQL and
    mapping code
  - row-shape mapping, selector handling, direct-target selection, and closure/blocking analysis each live in their own
    internal planner modules under `src/db/planner/`
  - tagged planner internals are now split again: `src/db/planner/_planner-direct-target-tags.ts` handles direct tag
    enumeration, `src/db/planner/_planner-keep-tagged-root-targets.ts` handles standalone tagged keep-overflow
    selection, and `src/db/planner/_planner-delete-tag-root-targets.ts` handles delete-tag root matching / partial-tag
    classification
  - the public `src/db/index.ts` surface is still the entrypoint; it now re-exports planner API from
    `src/db/planner/index.ts`, and mirror tests live under `tests/db/planner/`
  - planner scenario coverage has now been redistributed across the mirrored planner test files, so
    `tests/db/planner/_planner-repository.test.ts` is back to repository-level wiring coverage instead of being the
    catch-all scenario file for the whole planner subsystem
  - the mirrored planner tests currently give the most value when they each own one planner behavior slice, even when
    they still exercise that slice through the public `PlannerRepository` API
  - `tests/db/planner/_planner-plan-artifacts.test.ts` now uses the mirrored-test import exception directly by importing
    `src/db/planner/_planner-plan-artifacts.ts`, while still relying on `src/db/index.ts` for shared DB test setup
  - `tests/cli/_tag-selector-resolver.test.ts` was trimmed by extracting shared temporary-DB and input-builder helpers;
    the scenario coverage is unchanged, but the file no longer repeats temp-directory and `PlanCommandInputs` setup in
    every case
- Current CLI shape:
  - `scan` imports live GitHub Packages + GHCR state into SQLite
  - `db-merge --db <target> --source-db <path> [--source-db <path> ...]` merges local SQLite files into one target DB,
    using `scan_uuid` identity plus per-scan ordered `cleanup_uuid` history checks to allow only flat append-only
    cleanup history
  - `cleanup --dry-run ...` emits the dry-run delete plan for the latest completed scan of one owner/package
  - `cleanup ...` applies that same planner contract against the latest completed scan of one owner/package
  - `cleanup --keep-n-tagged <count> [--older-than <interval>]` keeps the newest eligible tagged roots and applies or
    prints the older overflow plan for one owner/package
  - `cleanup --keep-n-untagged <count> [--older-than <interval>]` keeps the newest eligible untagged roots and applies
    or prints the older overflow plan for one owner/package
  - `cleanup --delete-tag <tag> [--delete-tag <tag> ...] [--exclude-tag <tag> ...] [--keep-n-tagged <count>]` applies or
    prints a tag delete/untag plan for one owner/package, optionally keeping the newest matched tagged roots
  - `cleanup --delete-partial-images [--exclude-tag <tag> ...] [--keep-n-tagged <count>]` resolves tagged multi-arch
    roots whose child descriptors are only partially present in the latest scan, then applies or prints the normal
    tagged delete/untag plan for those concrete tags
  - `cleanup --delete-orphaned-images [--exclude-tag <tag> ...] [--keep-n-tagged <count>]` resolves orphan-style
    `sha256-*` tags whose implied parent digest is absent from the latest scan, then applies or prints the normal tagged
    delete/untag plan for those concrete tags
  - tagged selector families now treat `--delete-tag` and `--exclude-tag` values as wildcard patterns by default and as
    regex selectors when `--use-regex` is present
  - all current cleanup selector families accept optional `--older-than <interval>` as a root-level eligibility filter
  - live `cleanup` deletes `fullyDeletableRoots` through the GitHub Packages org package-version delete endpoint and
    also applies `untag-only` roots by retargeting selected tags to a temporary manifest clone before deleting the
    temporary package version
  - schema initialization now also creates a descendant-distance reachability index so root detection avoids the slow
    `ancestor_digest <> root_digest` probe shape on large scans
- Current test-registry workflow shape:
  - `test-registry-fill-*.yml` performs one-time GHCR fixture seeding
  - `test_scenario-executor.yml` clears and reseeds a dedicated package per scenario, runs either `ghcr-manager` or
    `dataaxiom/ghcr-cleanup-action`, then reruns the local action against the shared `db-path` so the action itself can
    upload the final rescan DB artifact
  - `test_scenario-scan.yml` now clears, reseeds, and scans one dedicated scenario package so a fresh DB can be captured
    without running a cleanup executor
  - test workflows no longer upload DBs directly or upload plan, execution-summary, or scenario helper artifacts; DB
    artifact upload remains solely the composite action's responsibility so the non-public encryption safeguard stays
    centralized
  - `test_scenario-executor-matrix.yml` fans out the reusable scenario workflow in parallel with executor-isolated
    package-name suffixes, so same-scenario runs do not race on one GHCR package
  - after the matrix fan-out completes, the matrix workflow now delegates the bundle step to
    `merge-run-artifacts/action.yml`, which downloads matching current-run DB artifacts, decrypts them when needed,
    merges them into one SQLite file, lets the nested `db-merge` sub-action enforce optional encryption plus final
    artifact upload, and deletes the intermediate per-scenario DB artifacts from the run
  - `.github/workflows/test_upstream-cross-org-bug.yml` is a deliberately minimal upstream-action repro that pushes one
    unique tagged image into the test org and then runs `dataaxiom/ghcr-cleanup-action` against it without a
    `repository` input, so the current cross-org lookup issue can be reproduced without the larger scenario harness
  - the `merge-run-artifacts` sub-action uses `tools/download-run-artifacts.sh`, `tools/decrypt-db-artifacts.sh`, and
    `tools/delete-run-artifacts.sh` internally; the helpers rediscover matching current-run artifacts by the same
    name-pattern filter instead of passing artifact ID lists through temporary files
  - the matrix DB bundle job now runs under `always()` so successful scenario DB artifacts are still collected when one
    or more matrix legs fail
  - `manual-run-test.yml` now switches to `GH_TEST_PAT` automatically when the requested owner matches `GH_TEST_ORG`, so
    private test-org packages remain scannable without a separate ad hoc workflow edit
  - the latest completed matrix baseline passed for all 18 scenarios × 2 executors (36 jobs), including the
    `delete-ghost-images`, `delete-partial-images`, regex selector scenarios, the Docker manifest-list shared-root
    scenario, and the first cleanup-audit scenario assertions
  - the committed scenario workflow definitions now cover:
    - `delete-untagged-noop`
    - `delete-untagged-real`
    - `tagged-fully-deletable`
    - `blocked-shared-closure`
    - `untag-only-single-shared-root`
    - `untag-only-multiarch-shared-root`
    - `docker-manifest-list-untag-only-shared-root`
    - `exclude-tag-protected-root`
    - `keep-n-tagged-overflow`
    - `keep-n-untagged-overflow`
    - `delete-tags-keep-n-tagged-overflow`
    - `delete-ghost-images-real`
    - `delete-ghost-images-noop`
    - `delete-partial-images-real`
    - `delete-partial-images-noop`
    - `delete-orphaned-images-real`
    - `delete-orphaned-images-noop`
  - there are now two additional manual-only repro scenarios, `cosign-referrer-kept-multiarch` and
    `cosign-referrer-kept-multiarch-index-signature`, both available in the reusable scan/executor workflows for both
    executors but intentionally excluded from the automatic matrix until the upstream `ghcr-cleanup-action` OCI referrer
    behavior is confirmed
    - `wildcard-tagged-fully-deletable`
    - `regex-untag-only-single-shared-root`
  - the selector-pattern, orphan, ghost, partial, and regex scenarios now pass in GitHub Actions for both executors
  - scenario-managed tags are namespaced as `${scenarioId}--<tag>` so later mixed-scenario packages can avoid tag
    collisions
  - `blocked-shared-closure` now builds its platform children through the shared `test-registry-build-image` action so
    the published digests match the expectations of `gh-workflow/multiarch-image-publish`
  - the shared `test-registry-build-image` action is build-and-push only; it no longer tries to run the image because
    the live scenario fixtures care about manifest/package topology, not runtime behavior
  - validation scenarios can now derive plan args from the scanned DB before running the planner
  - the scan and executor workflows now also run repo-local DB assertions for scenarios that declare them, so media-type
    and root-kind expectations can be checked after a live scan instead of relying on workflow success alone
  - the executor workflow now also runs repo-local cleanup-audit assertions for selected `ghcr-manager` scenarios, so
    action-owned DB artifacts prove persisted cleanup rows end to end without depending on ad hoc SQL
  - the reusable executor workflow now passes the caller's DB-artifact upload settings through to the `ghcr-manager`
    cleanup action as well as the upstream post-cleanup scan path, so both executor legs emit one action-owned final DB
    artifact when upload is enabled
  - the action-level post-cleanup rescan is now explicit via `scan-after-cleanup` instead of being unconditional for
    every live cleanup; the scenario executor opts into it for the `ghcr-manager` leg so test DBs still capture both
    before and after state in one SQLite file
  - `test-scenario-seed` no longer keeps a duplicated hardcoded allowlist of seed strategies; it now sets a generic
    handled marker from whichever scenario branch ran and only fails at the end if no branch claimed the requested
    strategy
  - live GHCR test workflows now require dedicated test-org configuration:
    - `GH_TEST_ORG`
    - `GH_TEST_PAT_USERNAME`
    - `GH_TEST_PAT`
  - `test_scenario-executor.yml` also requires `id-token: write` because `blocked-shared-closure` seeds multi-arch
    indexes through `gh-workflow/multiarch-image-publish`, which uses keyless Cosign signing
  - the scenario matrix workflow now inherits caller secrets into the reusable scenario workflow and must also grant
    `id-token: write` because the called workflow requests it
  - prior upstream compatibility issues in the dedicated test org were resolved sufficiently for the current live
    scenario matrix to pass with both executors
  - `delete-ghost-images` now resolves concrete tags from the latest scan by selecting tagged `image_index` roots whose
    descriptor children are all absent from the package scan, using current root metadata instead of an in-memory
    reducer
  - `delete-partial-images` now resolves concrete tags from the latest scan by selecting tagged multi-arch roots whose
    child descriptors are only partially present; unlike upstream's current reducer, the DB-first planner keeps this
    selector non-overlapping with `delete-ghost-images`
  - planner `rootDecisions` and `protectedRoots` now use more explicit human-facing validation wording so plans explain
    not just that a root is blocked, fully deletable, or `untag-only`, but why
  - the follow-up optimization rewrites the ghost-tag selector query against base tables for the hot path, keeping the
    same behavior while avoiding stacked `v_missing_digests` + `v_scan_root_manifests` view expansion during planning
  - manifest-kind classification now treats Docker manifest lists
    (`application/vnd.docker.distribution.manifest.list.v2+json`) as `image_index`, and the live scenario set now
    includes a Docker-manifest-list shared-root case with a DB assertion that checks the scanned root remains tagged,
    root-level, and classified as `image_index`
  - that Docker-manifest-list scenario must seed its amd64/arm64 child refs with direct
    `docker buildx build --provenance=false` pushes instead of the shared `test-registry-build-image` helper, because
    the helper's provenance-enabled temporary refs are manifest-list shaped and `docker manifest create` rejects them as
    inputs
- Current `untag-only` execution strategy:
  - informed by the linked shared ChatGPT discussion on the upstream hack
  - fetch the source manifest by digest from GHCR
  - publish a digest-changing clone to the selected tag instead of a stripped dummy manifest
  - OCI manifests/indexes get a top-level detach annotation
  - Docker media types fall back to a schema-equivalent byte-different clone without injected fields
  - delete the temporary package version that GHCR creates for the retargeted tag
- Scan hardening:
  - live GitHub scans now fetch package metadata up front and store `is_public` on `package_scans`
  - scans now also store raw `package_metadata_json`, and both scans and cleanup runs store nullable
    `github_actions_run_url` values when running inside GitHub Actions
  - `scan` JSON output now includes `isPublic`
  - `scan --github-output <path>` can also write scalar scan summary fields directly to a GitHub Actions output file
  - the composite action can encrypt uploaded DB artifacts via `db-artifact-encryption-passphrase`
  - plaintext DB artifact upload is refused when the current package is non-public or the DB already contains any
    non-public scan; the action checks the current package metadata before scan work and the DB contents again before
    upload
  - live GitHub package-version ingestion now reloads page 1 after pagination and aborts if the ordered version
    signature changed during the scan
- Scan logging:
  - progress logs go to stderr
  - final scan summary JSON stays on stdout
  - supported levels: `debug`, `info`, `warn`, `error`, `silent`
- Planner performance note:
  - on large scans, the main `keep-n-untagged` hotspot was root detection inside `v_scan_root_manifests`, not the keep
    window itself
  - `has_ancestor` now uses `manifest_reachability.min_distance > 0` with a matching
    `manifest_reachability(scan_id, descendant_digest, min_distance)` index
  - keep-rule selection queries no longer rejoin `package_versions` after `v_scan_root_manifests`; they rank directly
    from the view's `created_at`
  - `keep-n-untagged` now bypasses `v_scan_root_manifests` entirely and drives from
    `package_versions(scan_id, created_at)` before probing `tags`, `manifests`, and `manifest_reachability`
  - standalone `keep-n-tagged` now also drives from `package_versions(scan_id, created_at)`
  - exact `delete-tag` planning now starts from matched `tags(scan_id, tag)` rows, then aggregates within that reduced
    matched-root set instead of grouping the entire tagged root population first
  - `delete-orphaned-images` now stays on the same DB-first path by resolving orphan-style `sha256-*` tags from the
    latest scan up front, then reusing the existing tagged planner and execution flow instead of adding a separate
    iterative cleanup pass
  - closure and blocked-root analysis now consume direct target roots from a connection-local SQLite temp table, which
    avoids SQL variable-limit failures on very large plans
  - blocked-root validation no longer uses the global `v_scan_root_overlap` view on the hot path; it joins selected
    closure members directly against retained roots' reachability for the current plan
- Planner output contract:
  - plans now distinguish policy selection from validated deletion via `validationSummary` and `rootDecisions`
  - plans now expose `protectedRoots` so retained blockers are visible alongside blocked delete candidates
  - seeded test-registry scenario assertions now verify those fields for representative delete-untagged, blocked, and
    combined tagged-keep plans
- Debug helpers:
  - `GITHUB_TOKEN="$(gh auth token)" ghcr-manager scan --db <path> --owner <owner> --package <package> [--log-level <level>]`
    runs the live GitHub/GHCR scan directly via the CLI binary
- Working tree expectation at the end of the last session: clean after `e33d011`.
- Commit policy: do not commit agent changes until the user has reviewed and explicitly asked for a commit.
- File size guideline for production TypeScript:
  - up to about 100 lines is comfortable
  - above about 100 to 160 lines, strongly consider splitting
  - above about 160 to 220 lines, split unless cohesion is unusually strong
  - above about 220 lines is generally not acceptable outside repetitive or low-risk code
- Cross-folder import rule: imports from outside a folder must go through that folder's `index.ts`.
- Enforcement: the cross-folder `index.ts` rule is mechanically enforced by a local ESLint rule.
- Mirrored-test import exception: a file under `tests/` may directly import the exact `src/` file it mirrors; it must
  still use the target folder's `index.ts` for any other cross-folder import.
- File naming rule in `src/`: every non-public implementation file must be named `_*.ts`.
- Test mapping rule: `tests/` mirrors `src/` one-to-one, with `src/.../*.ts` mapped to `tests/.../*.test.ts`.
- Cleanup planning roadmap: [docs/cleanup-roadmap.md](cleanup-roadmap.md)
- Cleanup semantics note: [docs/cleanup-semantics.md](../terminology.md)
- Planner data model: [docs/planner-data-model.md](../schema-description.md)
- GHCR test package setup reference: [docs/test-package-setup.md](../test-package-setup.md)

### Current Module Layout

```text
src/
  action/
  cli/
  core/
  db/
  execute/
  ingest/
```

- `action/` contains the GitHub Action entrypoint only.
- `cli/` contains command dispatch and command-specific argument handling.
- `core/` contains stable shared types and planner logic.
- `db/` contains SQLite schema, database opening, and snapshot persistence/query code.
- `execute/` contains delete-plan execution and GitHub Packages mutation helpers.
- `ingest/` contains live GitHub/GHCR ingest plus the internal file-fixture import helper used by tests.

## Current Direction

- Runtime and implementation language: TypeScript on Node.js.
- Repository shape: one project containing shared core logic, a local CLI, and a thin GitHub Action wrapper.
- Storage model: local SQLite database per run.
- Scope for the first usable increment: read-only package import and planning summary.

## Why TypeScript

- Keeps the future GitHub Action, CLI, and any later UI in one language.
- Avoids a likely split where the action is Node-based while the core is Python.
- Fits the product direction better than optimizing only for the fastest prototype.

## Narrow V1 Plan

1. Add a TypeScript project skeleton with build, lint, and test commands.
2. Add a SQLite schema plus a small repository layer for package versions, tags, manifests, and manifest edges.
3. Add a CLI with these initial commands:
   - `init-db`
   - `scan` using a local JSON snapshot file as the initial input source
4. Add a thin composite GitHub Action wrapper that invokes the same CLI.
5. Add focused tests for schema creation, import, and planning behavior.

## Non-Goals For This Increment

- Live GitHub API or GHCR ingestion.
- Deletion execution.
- Multi-package orchestration.
- Any UI beyond CLI and action wiring.
- Feature parity with existing cleanup actions.

## Progress Log

### 2026-04-28

- Decided to use TypeScript instead of Python after reviewing long-term product shape.
- Chosen first increment: real SQLite-backed core plus fixture-backed import flow.
- Added the initial TypeScript package, build scripts, and test setup.
- Added SQLite schema and repository modules for package scans.
- Added the first CLI commands: `init-db` and `scan`.
- Added a composite GitHub Action wrapper that invokes the shared CLI code.
- Added one representative package snapshot fixture and a planner test.
- Replaced Python-based Markdown and YAML linting with Node-native linting and formatting tools.

### 2026-04-29

- Strengthened the handoff documentation and made it the canonical session continuity record.
- Added a live `scan` path backed by the GitHub Packages API and GHCR manifest fetches.
- Normalized live package versions, tags, manifests, and edges into the existing SQLite-backed snapshot model.
- Added a focused ingest test covering tagged indexes, image child manifests, and referrer edges.
- Extended the planner fixture coverage so a tagged manifest graph now protects both child manifests and referrers.
- Refactored the flat `src/` layout into explicit `action`, `cli`, `core`, `db`, and `ingest` boundaries.
- Added ESLint enforcement for the rule that cross-folder imports must target folder `index.ts` entrypoints.
- Standardized internal source file names in `src/` so non-public implementation files use the `_*.ts` prefix.
- Mirrored `tests/` to `src/` one-to-one and added an enforced source-to-test mapping check.
- Settled the ingest direction for the next refactor: write remote results incrementally into SQLite instead of using
  package-level in-memory aggregate objects as the primary ingest boundary.
- Switched GHCR manifest reads to the registry bearer-token flow and split token acquisition into a dedicated internal
  client so public registries work without GitHub auth while authenticated reads remain available.
- Added CLI logging with explicit levels and periodic scan progress so long GitHub/GHCR imports are observable without
  corrupting stdout JSON output.
- Identified a remaining architectural inconsistency: package version pagination still buffers full result sets before
  writing, while manifest ingestion writes incrementally.
- Replaced the buffered package version path with a generic paginated ingest helper so version/tag enumeration now
  follows the same request -> normalize -> write shape as the rest of the DB-first ingest flow.
- Tightened the schema with foreign keys for `tags -> package_versions` and `manifest_edges -> manifests`, and aligned
  ingest order so manifests are written before edges.
- Improved GitHub and GHCR HTTP error reporting so upstream JSON messages, docs URLs, and auth-challenge headers are
  surfaced instead of only HTTP status codes.
- Tightened `tags` so each tag references a package-version row.
- Removed the low-value SQLite DDL/constraint-behavior checks from `tests/db/_schema.test.ts` and kept only an
  idempotence check for `initializeSchema(...)`.
- Added a `manifest_reachability(ancestor_digest, descendant_digest, min_distance)` table so future planner reads can
  use precomputed graph reachability instead of traversing raw `manifest_edges` at read time.
- Added `package_version_payloads(version_id, raw_json)` and `manifest_payloads(digest, raw_json)` as raw-payload master
  tables so upstream response items can be stored without lossy remapping.
- Split package-version metadata into `package_version_metadata(version_id, metadata_json)` so `package_versions` stays
  scalar and JSON-bearing fields live in dedicated side tables.
- Live GitHub/GHCR ingest now stores raw package-version item JSON and raw fetched manifest JSON in the payload tables
  alongside the normalized rows.
- Added `manifest_descriptors(parent_digest, child_digest, ...)` so descriptor rows discovered inside index manifests
  can be stored separately from directly fetched manifest documents in `manifests`.
- Live GitHub/GHCR ingest writes descriptor rows into `manifest_descriptors`; absent child or subject targets are
  derived by comparing those references against `manifests`.
- Added `docs/terminology.md` to map Docker/GHCR/OCI terms to this repo's DB tables and normalized manifest relations.
- Fetched manifest rows now also keep `config_media_type`, `subject_digest`, and `annotations_json` in `manifests` so
  common image-vs-artifact classification can be done without JSON-path expressions in every query.
- GHCR pull tokens are now cached per scan and reused until shortly before expiry; when the token response omits
  explicit expiry fields, the client falls back to a 60-second lifetime per the registry token spec.
- GHCR manifest fetches and GitHub package-version page fetches both use bounded parallelism; the shared config
  constants now live together near the code root in `src/config/index.ts`.
- GitHub package pages, GHCR manifest fetches, and GHCR token fetches now retry a small bounded number of times for

### 2026-05-15

- Added the first shared execution slice under `src/execute/` plus a new CLI command `ghcr-manager execute`.
- Execution reuses the same selector parsing as `plan` and loads the already-decided delete plan from SQLite instead of
  recomputing separate execution policy.
- Current execution scope is intentionally narrow:
  - supported mutation: delete GitHub Packages org-owned container package versions for `fullyDeletableRoots`
  - unsupported mutation: `untag-only` roots; execution now fails before any delete request when such roots appear
  - blocked roots remain reported in the execution summary but are not mutated
- Added a dedicated GitHub Packages delete client using `DELETE /orgs/{org}/packages/container/{package}/versions/{id}`
  with the repo's existing API-version header and bounded retry handling for transient status codes.
- Added CLI and execution tests covering:
  - shared planner-input parsing reuse
  - early `--token` validation for `execute`
  - successful delete-only execution against a mocked GitHub API
  - fail-fast behavior when a plan contains `untag-only` roots
- Added the first dedicated scenario-per-package executor harness:
  - `tools/test-scenarios/_definitions.mjs` now holds small scenario records with package suffixes, seed strategies, and
    executor-specific inputs
  - `.github/actions/test-scenario-seed` pushes minimal `FROM scratch` single-arch images with `provenance=false` for
    the first scenario packages, avoiding the signature/provenance-heavy `single` / `complex` fixtures
  - `.github/workflows/test_scenario-executor.yml` clears the scenario package, seeds it, runs either `ghcr-manager` or
    `dataaxiom/ghcr-cleanup-action`, appends the post-execution scan into the same `scan-history.sqlite`, and uploads
    that DB plus the scenario metadata/summary files
  - initial scenarios are `delete-untagged-noop` and `tagged-fully-deletable`
  - current scope is observational: compare before/after DBs locally rather than asserting parity between the two
    executors
- Remaining execution-track work:
  - add the separate upstream-style untag workaround slice for partial-tag matches
  - run and refine seeded test-registry execution scenarios now that the workflow exists, then decide which ones should
    become standard post-seed validation checks

### 2026-05-14

- Added the first read-only planner implementation for `plan --delete-untagged`.
- Added scan-scoped planner base views:
  - `v_scan_root_manifests`
- Added `PlannerRepository` as the first DB-backed planner query layer.
- The current plan output emits:
  - `directTargetTags`
  - `directTargetRoots`
  - `closureManifests`
  - `blockedRoots`
  - `fullyDeletableRoots`
  - `collateralTags`
- Current planner behavior is intentionally narrow:
  - supported selector families are currently:
    - `--delete-untagged`
    - `--keep-n-tagged <count>`
    - `--keep-n-untagged <count>`
    - exact-match repeated `--delete-tag` with optional repeated `--exclude-tag` and optional `--keep-n-tagged <count>`
  - optional `--older-than <interval>` filters candidate roots by `package_versions.created_at`
  - only one selector family is accepted per plan invocation
  - direct untagged targets are limited to top-level untagged roots (`has_ancestor = 0`)
  - partial tag matches on multi-tagged roots are reported as `selectionMode = "untag-only"`
  - blocked roots are explained through closure overlap with retained top-level roots
- Added tests for:
  - unblocked top-level untagged deletion planning
  - blocked deletion planning when an untagged root overlaps a retained tagged root
  - fully selected tagged roots becoming `delete-root` candidates
  - partial tag matches becoming `untag-only` candidates
  - `exclude-tag` preventing both delete-root and untag-only selection
  - fully selected tagged roots being blocked by retained-root overlap
  - `older-than` filtering for untagged and exact-match tag-driven planning
  - CLI dispatch and JSON output for the new `plan` command
- Added [docs/planner-data-model.md](../schema-description.md) to define the canonical dry-run planner result sets:
  `direct_target_tags`, `direct_target_roots`, `closure_manifests`, `blocked_roots`, `fully_deletable_roots`, and
  `collateral_tags`.
- Chosen planner-query shape:
  - stable scan-scoped base views for roots, closures, and overlaps
  - request-scoped CTEs or temporary views for actual cleanup inputs
  - existing `v_tags_delete_*` views remain exploratory and should not become the canonical planner interface
- Added [docs/cleanup-semantics.md](../terminology.md) to lock the cleanup model before planner and execution work.
- Chosen cleanup semantics for the first planner track:
  - planning is rooted in package-version-backed root manifests
  - deletion safety is decided on manifest closures, not on tag names alone
  - selective tag matches may require untag actions separate from package-version deletion
  - destructive cleanup should require explicit intent, with no implicit default "delete all untagged" mode
- Deferred upstream parity features for later planner phases: ghost/partial/orphaned image cleanup, multi-package
  expansion, and validate-mode parity.
- Added [docs/cleanup-roadmap.md](cleanup-roadmap.md) to turn the broad cleanup reimplementation goal into ordered,
  session-sized subtasks with explicit deliverables and acceptance focus.
- Chosen documentation shape for the cleanup track:
  - `docs/implementation-notes.md` remains the canonical handoff checklist
  - `docs/cleanup-roadmap.md` holds the stable cross-session roadmap
  - `docs/ai/tasks/` should hold session-scoped task briefs that reference the roadmap
- Investigated the `single` / `single-amd64` / `single-arm64` test-registry shape using
  `artifacts/gh-workflow__ghcr-manager-test--single.sqlite`.
- Confirmed that `single-amd64` and `single-arm64` are tagged on separate per-arch `image_index` wrapper manifests, not
  on the child `image_manifest` digests referenced by `single`.
- Confirmed that `v_manifests_related_manifests` is behaving consistently with current graph semantics: it follows
  manifest reachability, so sibling wrapper indexes do not appear when starting from `single`.
- Noted the cleanup-design implication: tag deletion planning must operate on manifest closures plus overlapping tag
  roots, because human expectations about "delete downward" do not align with the registry's wrapper-manifest layout.
  transport failures and selected transient HTTP statuses before failing the scan.
- Removed the public `--source` / `--snapshot` scan mode split; the app now exposes only the real GitHub/GHCR scan path
  while keeping fixture loading in test-only helpers.
- Added a workflow-side validation script so the repeated validation workflow now fails automatically when the seeded
  `single` or `complex` fixture plan shape changes unexpectedly.
- Locked the current validation expectations to the manually verified `--delete-untagged` behavior:
  - `single` must stay fully empty
  - `complex` must keep non-empty direct target roots, zero fully deletable roots, non-empty blocked roots, and closure
    plus blocked-root coverage for every direct target root
- Added planner repository coverage for current graph edge cases:
  - an untagged multi-arch root expands to child image manifests plus attached in-package referrers in its deletion
    closure
  - sibling wrapper indexes that point at different children do not block each other just because they correspond to the
    same human-facing image family
- Added the first exact-match tag-driven planner path:
  - repeated `--delete-tag` populates `directTargetTags`
  - roots with all tags selected become `selectionMode = "delete-root"`
  - roots with only some tags selected become `selectionMode = "untag-only"`
  - repeated `--exclude-tag` wins over both delete-root and untag-only selection for matching roots
- Added the first root-level age eligibility filter:
  - `--older-than <interval>` currently accepts one integer plus one unit
  - supported units are minutes, hours, days, weeks, months, and years
  - the CLI resolves the interval once per invocation into `plannerInputs.cutoffTimestamp`
  - younger roots stay retained and can still block deletion overlap for older candidates
- Added the first keep-rule planner slice:
  - `--keep-n-untagged <count>` keeps the newest eligible untagged roots by package-version `created_at`
  - older eligible untagged overflow roots become `directTargetRoots` with `reason = "keep-n-untagged-overflow"` and
    `selectionMode = "delete-root"`
  - `--keep-n-untagged 0` is supported and behaves like "select all eligible untagged roots" while still reporting the
    keep-rule-specific reason in the plan output
  - `older-than` is applied before the keep-count ranking
  - the CLI still accepts exactly one selector family per invocation
- Added the first tagged keep-rule planner slice:
  - `--keep-n-tagged <count>` keeps the newest eligible tagged roots by package-version `created_at`
  - older eligible tagged overflow roots become `directTargetRoots` with `reason = "keep-n-tagged-overflow"` and
    `selectionMode = "delete-root"`
  - `--keep-n-tagged 0` is supported and behaves like "select all eligible tagged roots" while still reporting the
    keep-rule-specific reason in the plan output
  - `older-than` is applied before the keep-count ranking
  - this first slice is standalone and does not yet combine keep-count scoping with `--delete-tag`
- Added the next tagged-selector policy decision before implementation:
  - reviewed `dataaxiom/ghcr-cleanup-action` as an input to the design, but not as a 1:1 execution model
  - accepted the upstream-style policy that `delete-tags + keep-n-tagged` narrows the keep-count scope to matched delete
    tags only
  - restated that policy in set-based planner terms: exclusions first, age filter second, matched-tag subset third,
    root-level keep ranking fourth
  - locked the shared-root consequence that multi-tagged matched roots with remaining unmatched tags degrade to
    `selectionMode = "untag-only"` rather than `delete-root`
- Implemented the first combined tagged-selector planner path:
  - `--delete-tag ... --keep-n-tagged <count>` is now accepted as one tagged selector family instead of being rejected
    as mixed selectors
  - the keep count is applied once per matched root, not once per matched tag
  - fully matched overflow roots now surface as `reason = "keep-n-tagged-overflow"` with `selectionMode = "delete-root"`
  - partial matched overflow roots with remaining unmatched tags still surface as
    `reason = "delete-tags-partial-tag-match"` with `selectionMode = "untag-only"`
  - standalone `--keep-n-tagged` continues to operate on all eligible tagged roots, while combined mode narrows the keep
    ranking scope to the matched delete-tag subset
- Added scenario-driven validation coverage for the seeded complex registry:
  - `complex-tag-age-window` derives a whole-minute `older-than` cutoff from the scanned DB so `alpha` and `beta` remain
    eligible while `gamma` stays too new
  - `complex-tag-age-window-exclude-beta` reuses that derived cutoff and verifies that `exclude-tag beta` removes `beta`
    from the selected plan even though it is old enough
  - `complex-tag-age-window-keep-1` reuses that derived cutoff and verifies that `--keep-n-tagged 1` retains the newer
    matched top-level root while selecting the older matched root for deletion
  - `complex-shared-platform-tags-keep-1` validates the shared-root case for `beta-*` and `gamma-*` platform tags, where
    root-level keep ranking retains the newer shared root and the older shared root remains `untag-only` because
    unmatched tags still exist on it
- Kept the scope intentionally narrow for now:
  - exact tag matches only, not wildcard selectors
  - one selector family per invocation instead of combining `delete-tags` with `delete-untagged`

### 2026-05-14

- Added a derived `manifests.manifest_kind` helper field as best-effort debug classification without repeating
  media-type and JSON-path inspection in downstream SQL.
- Manifest classification now happens at GHCR manifest fetch time from the fetched document's media type, artifact
  markers, subject, and selected signature/attestation hints.
- Kept platform lookup out of the manifest kind classification scope; platform remains descriptor-context data.
- Updated the related-manifest SQL views to expose `manifest_kind` instead of `media_type` where the column was mainly
  being used as a human-facing manifest classification hint.
- Added `v_tags_delete_manifests` for the primary manifest deletion set and `v_tags_delete_affected_tags` for secondary
  tags whose tagged manifests contain that deletion set.

## Next Increment

1. Run the expanded scenario matrix in GitHub Actions and inspect whether the new wildcard/regex scenarios behave the
   same for `ghcr-manager` and `dataaxiom/ghcr-cleanup-action`.
2. Decide whether the scenario workflow should stay observational or gain explicit per-scenario post-state assertions.
3. Triage remaining upstream-alignment gaps after the next selector-pattern matrix: multi-package expansion,
   ghost/partial/orphaned cleanup, validate-mode parity, and action-input packaging/default semantics.

### 2026-04-29 (multi-package schema layer)

- Added `package_scopes(scope_id, owner, package_name, last_scanned_at)` as the new package-level scope anchor.
- Scoped package-bound tables by `scope_id`: `package_versions`, `package_version_metadata`, `package_version_payloads`,
  and `tags`.
- Added `scope_manifests(scope_id, digest)` to associate globally deduplicated manifest rows with specific package
  scopes.
- Updated `ScanWriter` so `resetScan(packageName, scannedAt)` now clears and rewrites only the targeted scope instead of
  truncating all scan data in the DB.
- Updated `SnapshotRepository` queries to read from the latest scanned scope and apply `scope_id` filters to
  package-level counts and plan inputs.
- Follow-up needed: add a first-class scope selector API (explicit owner/package query target) so CLI and planner can
  choose among multiple stored scopes instead of always using the latest scan timestamp.

### 2026-04-29 (scan-history schema refactor)

- Replaced package-anchored tenancy with scan-anchored tenancy:
  - `package_scans(scan_id, scan_uuid, owner, package_name, scan_started_at, scan_completed_at, status)`
  - all snapshot tables now key and reference by `scan_id`.
- Updated writer persistence so `resetScan(...)` creates a new `running` scan row instead of truncating prior data.
- Added scan lifecycle updates in writer:
  - `markScanCompleted(...)`
  - `markScanFailed(...)`
- Updated GitHub and fixture ingest entrypoints to mark scan status transitions (`running -> completed|failed`).
- Updated snapshot repository and reachability rebuild logic to read/write by active/latest `scan_id`.
- Updated metadata naming and selection semantics:
  - code and outputs now use `scanCompletedAt` instead of `scannedAt`
  - repository metadata queries now select only completed scans (`status='completed'` with non-null completion time)

### 2026-04-29 (action vs CLI responsibility split)

- Decision: keep artifact upload behavior in the GitHub Action layer, not in the CLI/tool layer.

### 2026-04-29 (ingest options de-bloat)

- Tightened `GitHubScanOptions` to required scan inputs only: `owner`, `packageName`, `token`, and `logger`.
- Removed optional scan-option fields that were internal/test-only concerns: `githubApiBaseUrl`, `registryBaseUrl`,
  `username`, and `fetchImpl`.
- Moved transport/base-url overrides into an internal runtime argument on `importGitHubScan(...)` so tests can still
  inject fake HTTP without polluting the scan input contract.
- Required logger usage across ingest internals (removed optional logger chaining), matching CLI behavior.

### 2026-04-29 (missing-manifest query recipes)

- Operationally, GHCR scans can complete with missing manifests (HTTP 404). Ingest skips these and continues.
- Query recipes are documented in [docs/queries/missing-manifests-queries.md](about:blank).
- Rationale:
  - CLI should stay platform-agnostic and usable outside GitHub Actions.
  - GitHub-specific concerns (artifact retention, upload policy, conditional publish flags) belong to action wiring.
  - Composite action steps are a natural place for optional artifact upload; jobs are workflow-level, not action-level.
- Planned action shape:
  - Add optional action inputs (`upload-db-artifact`, `db-artifact-name`, `db-artifact-retention-days`).
  - Keep default behavior unchanged unless upload is explicitly enabled.
- Implemented in `action.yml`:
  - optional in-action DB artifact upload (off by default)
  - optional retention override (otherwise GitHub policy default is used)
  - scan DB path defaults to owner/package-based runner temp storage, but workflows may now override it via the
    local-only `db-path` action input
- Added `.github/workflows/manual-run.yml` as a `workflow_dispatch` validation workflow that:
  - accepts explicit `owner` and `package` inputs
  - runs `uses: ./` against the local action implementation
  - optionally uploads DB artifact via action inputs

### 2026-04-30 (scan UUID for merge-safe dedupe)

- [x] Added immutable `scan_uuid` on `package_scans` and started writing it on scan insert.
- [x] Added a scan-writer test assertion that new scan rows include UUID-formatted `scan_uuid`.

### 2026-04-30 (external SQL view loading)

- [x] Added SQL file loading from `resources/sql/schema/*.sql` and `resources/sql/views/*.sql` during schema
      initialization.
- [x] Added `v_missing_digests_related_manifests` as DB view SQL file under `resources/sql/views/`.
- [x] Added schema test coverage that the view is created by `initializeSchema(...)`.

### 2026-04-30 (npm publish with provenance)

- [x] Added project-local npm versioning defaults in `.npmrc`:
  - `tag-version-prefix=` so release tags are plain semver (no `v` prefix).
  - `message=Release %s` for clearer npm-managed release commit messages.
- [x] Added a package publish allowlist in `package.json` via `files` to ship only runtime artifacts and core docs.
- [x] Extended `.github/workflows/release.yml` with a `publish-npm` job that:
  - runs on semver tag pushes after existing validation checks
  - uses Node 24 with npm cache
  - runs `npm ci`, `npm test`, and `npm run build`
  - publishes with `npm publish --provenance --access public`
  - grants `id-token: write` for npm provenance/trusted publishing OIDC flow.
- [x] Wired GitHub release creation to depend on successful npm publish.

### 2026-04-30 (npm provenance metadata fix)

- [x] Added explicit npm package metadata in `package.json` for provenance validation:
  - `repository.url` set to `https://github.com/gh-workflow/ghcr-manager`
  - `homepage` set to the repository README URL
  - `bugs.url` set to the repository issues URL
- [x] Reason: npm provenance bundle verification requires `package.json` repository metadata to match GitHub Actions
      source repository information.

### 2026-05-03 (package-version-backed manifests)

- [x] Moved digest identity out of `package_versions` and onto `manifests`.
- [x] Refactored GHCR manifest ingest to fetch only package-version digests with bounded parallelism.
- [x] Kept `manifest_edges` strict for known-to-known manifest relations.
- [x] Kept missing-digest views derived from descriptor and subject payload fields.
- [x] Simplified manifest timestamp windows to the exact package-version timestamps for the same digest.
- [x] Updated GitHub ingest and DB writer code to match the new `package_versions -> manifests` version-id relation.

### 2026-05-10 (test registry image build reuse)

- [x] Extracted the test-registry architecture image build and smoke test into a local composite action.
- [x] Kept separate amd64 and arm64 build jobs so each architecture digest remains a deterministic job output for later
      manifest-combination jobs.

### 2026-05-16 (action packaging cleanup)

- [x] Removed the action's runtime dependency on npm package publication.
- [x] Updated `action.yml` so the composite action now runs `npm ci`, builds the repo-local TypeScript sources, and
      executes `node dist/cli/index.js` directly.
- [x] Kept npm publication as a secondary distribution channel for local CLI use instead of the action's execution
      mechanism.
- [x] Chosen packaging stance for now:
  - GitHub Actions consumes repo-owned code from the tagged action revision.
  - npm publication remains for local/dev CLI usage, not for action bootstrapping.

### 2026-05-17 (cleanup interface alignment)

- [x] Added `ghcr-manager cleanup` as the primary CLI cleanup surface, with `--dry-run` acting as the user-facing
      dry-run mode for the cleanup contract.
- [x] Removed the transitional `plan` and `execute` CLI aliases so the public CLI surface is now only `scan` and
      `cleanup`.
- [x] Expanded `action.yml` from scan-only to `command: scan | cleanup`.
- [x] Chosen action cleanup semantics:
  - `command: cleanup` always runs a fresh pre-scan into the configured DB before applying selector logic.
  - live cleanup runs a post-cleanup rescan so the resulting DB reflects final package state.
  - `dry-run` is cleanup-only and maps to the same planner contract as CLI `cleanup --dry-run`.
  - `command: scan` always uploads the resulting DB artifact; cleanup DB upload remains optional.
- [x] Updated the GHCR scenario workflow so the `ghcr-manager` executor leg now exercises the action cleanup surface
      instead of calling the CLI directly.

### 2026-05-18 (planner-side tag selector matching)

- [x] Checkpoint commit: `bf29cfd`
- [x] Stopped expanding user-provided `--delete-tag` and `--exclude-tag` wildcard/regex selectors into JS arrays before
      planning.
- [x] Kept DB-derived selector families (`delete-ghost-images`, `delete-partial-images`, `delete-orphaned-images`) as
      exact tag expansion while keeping the user-facing selector contract simple:
  - wildcard syntax is the default for `--delete-tag` and `--exclude-tag`
  - `--use-regex` is the only alternate selector mode
- [x] Moved wildcard/regex tag matching into planner SQL so large matched tag sets no longer rebound as giant
      `IN (?, ?, ...)` parameter lists.
- [x] Added focused tests that cover planner-side wildcard and regex matching plus the resolver contract shift from
      “expand user selectors” to “preserve user selectors.”
- [x] Reduced repeated regex work in tagged-root planning by materializing selected tags and excluded versions once per
      query and caching compiled regex objects inside the SQLite `regexp()` function.

### 2026-05-18 (remove legacy exploratory views)

- [x] Removed the unused legacy SQL views:
  - `v_missing_digests_related_manifests`
  - `v_manifests_related_manifests`
  - `v_tags_delete_manifests`
  - `v_tags_delete_affected_tags`
- [x] Kept `v_missing_digests`, `v_scan_root_manifests`, and `v_digest_derived_tag_relations` because they still back
      active runtime or diagnostic surfaces.
- [x] Trimmed the schema test and current docs that still described the removed views as active surfaces.
