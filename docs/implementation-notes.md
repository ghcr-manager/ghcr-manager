# Implementation Notes

Active handoff notes for `ghcr-manager`.

Historical notes were compacted into [docs/implementation-notes.archive.md](archive/implementation-notes.archive.md).

## Session Handoff

- Developer glossary: [docs/terminology.md](terminology.md)

## Current Status

- Runtime: Node.js and TypeScript.
- Persistence model: local SQLite database per run.
- Core public surfaces:
  - CLI: `scan`, `cleanup`
  - root action: `command: scan | cleanup`
  - helper actions: `db-merge`, `merge-run-artifacts`
- Live package support:
  - org-owned and user-owned GitHub container packages
  - explicit owner-kind lookup through `GET /users/{owner}`
- Current test/workflow surfaces:
  - cleanup scenario executor + matrix workflows
  - dedicated cross-owner upstream repro workflows

## Current Release Track

- Focus now is cleanup, documentation, and first public release.
- No further cleanup-audit read surface is planned for now beyond repo-local tools and SQL views.

## Current Decisions

- Keep `README.md` user-facing only.
- Keep GitHub-specific artifact/upload policy in actions, not in the core CLI.
- Bedrock service values stay fixed and shared:
  - GitHub API base URL
  - GHCR registry base URL
  - GitHub API version
- Release packaging stays source-only in Git:
  - do not commit `dist/` to `main`
  - do not create workflow-managed release commits that add `dist/`
  - keep the tag-push release model and let the action/npm paths build or install at runtime as they do today
- Visualizer packaging note:
  - publish the visualizer as a separate npm package, not as part of the main `ghcr-manager` package
  - copy browser assets into `visualizer/dist/public` during build so installed npm consumers can run the local server
    outside the repo checkout
- `delete-tags` and `exclude-tags` on the root action are newline-separated.
- Untag live tests reuse the shared seed implementation underneath rather than carrying a separate seed action.
- Test-only helper scripts now live under `tools/tests`; `tools/` root is reserved for runtime, repo-maintenance, and
  action-facing helpers.
- Older design-stage documents were archived from `docs/` into `docs/archive/`; active docs in `docs/` should describe
  the current product shape rather than early planning history.
- Upstream parity audit against `dataaxiom/ghcr-cleanup-action` commit range `87fa4bae..34a2b6c` found:
  - partial-image vs ghost-image split already matches upstream bugfix behavior
  - OCI 1.1 `subject` / referrer preservation is already represented in scan ingest, reachability, and cleanup planning
  - remaining hardening gap: `--use-regex` selectors are not pre-validated for pathological / ReDoS-prone patterns
- Scenario executor workflow note:
  - digest-selector scenarios require repo dependencies before pre-scan and digest resolution helper scripts run
- Manual visual demo note:
  - repo-local scripts under `tools/tests/visualizer/` now provide a before/after GHCR package mutation flow that can
    show unchanged, removed, and added graph branches in one visualizer compare
- Visualizer docs note:
  - user-facing visualizer docs now live in `docs/visualizer.md`
  - the visualizer package also carries its own npm-facing `visualizer/README.md`
- Cleanup rethink note:
  - new graph-only A-B matrix scenarios are being added as normal scenario-executor entries with intentionally no-op
    cleanup selectors, not through a separate scan-only scenario system
  - a dedicated graph-matrix workflow should run only those rows so the resulting DBs and screenshots stay focused on
    cleanup-logic discussion graphs
  - graph-matrix attestation variants should reuse normal build provenance, not `cosign attest`, because current cosign
    bundle output is classified as `signature_manifest` rather than the in-toto provenance `attestation_manifest` shape
    seen in the regular seeded scenarios
  - graph-matrix package tags were shortened to local role names like `image-a`, `multiarch`, and `multiarch-a`; the
    package name already carries the scenario identity, so repeating it inside each tag was removed
  - `cleanup_root_decisions.overlap_digest` is being kept as the compact representative overlap used by the single-row
    blocked decision summary, while `cleanup_protected_root_blocks` remains the more detailed blocking table
- Scenario maintenance note:
  - test-scenario definitions are now split into cleanup and graph modules under `tools/tests/test-scenarios/`
  - the GHCR test-scenario seed action is now a dispatcher that calls small repo-local seed scripts plus a dedicated
    multi-arch sub-action for the remaining complex cases
  - graph-matrix scenario tags now use short role-based names like `image-a`, `multiarch`, and `multiarch-a` instead of
    repeating the scenario/package identity inside each tag
  - graph-matrix packages now always include one extra isolated plain tagged image `keep-dummy` so cleanup experiments
    do not trip GHCR's special-case failure when a run tries to remove the last remaining tag in a package
  - graph-matrix attestation variants now seed final image tags as provenance-bearing indexes instead of retagging the
    runnable image manifests; the new baseline is the observed `single-attestation` package shape where attestation
    moves the human tag from the image manifest to the index that connects image plus attestation
  - graph-matrix mixed cosign+attestation image branches now sign only the tagged provenance-bearing index digest, not
    the leaf image digest, to match the observed `single-attestation` package branch shape
  - `test_setup-package-single-attestation.yml` now publishes the final multi-arch and per-platform tags inline with
    `docker buildx imagetools create --dry-run`, `regctl manifest put`, and `regctl image copy` so that attestation-only
    setup no longer depends on the external publish action that forces cosign
  - graph-matrix cleanup coverage now expands each seeded graph into generated delete-tag scenarios across both
    executors, and latest-scan assertions can now validate expected manifest/tag counts plus absent tags after cleanup
- Scenario workflow concurrency note:
  - cleanup scenario execution is serialized per `scenario + executor`
  - user-owner cleanup now has its own dedicated concurrency group because it mutates one fixed package
- Test maintenance workflow note:
  - manual workflow `test_delete-test-org-packages.yml` deletes container packages from `GH_TEST_ORG`, optionally
    filtered by a literal substring on package name
- User-owner workflow note:
  - `test_user-owner-cleanup.yml` now clears a fixed user-owned package, seeds two tagged images, deletes `delete-me`,
    uploads the post-cleanup DB artifact, and asserts the latest-scan view keeps only `keep-me`
- Tagged cleanup seed note:
  - digest and wildcard tagged-delete scenarios now use dedicated seed strategy IDs instead of borrowing
    `tagged-fully-deletable`
- Cleanup selector composition note:
  - cleanup direct-target root selection now goes through one SQL-backed planner path
  - selector predicates are composed in SQL, then tagged/untagged keep-overflow ranking is applied in later SQL stages
  - tagged selector families may now be combined with `delete-untagged`
  - `keep-n-untagged` remains incompatible with `delete-untagged`
  - the older planner helper layer for separate tagged/untagged root-target selection was removed after the SQL
    composition refactor so `src/db/planner` reflects the live repository path instead of carrying dead adapters
- Coverage note:
  - CLI dispatch, cleanup-summary Markdown branches, and planner repository wrapper methods now have explicit tests so
    post-refactor line coverage reflects the live surface more closely
  - root `test` / `coverage` scripts must enable Bash `globstar` before expanding `tests/**/*.test.ts`; otherwise deeper
    mirrored test paths like `tests/db/planner/*` and `tests/ingest/github/*` are skipped in this environment
- Action summary handoff note:
  - command summary JSON is now handed across action steps by file path instead of large env/expression payloads
  - this avoids GitHub template-memory and argument-length failures on large cleanup summaries
  - the root action now exposes `summary-json-path`, not the full summary JSON payload, to avoid GitHub output-size
    limits on large cleanup runs
- Artifact-upload naming note:
  - the root action and helper actions now use `upload-artifacts`
  - that flag governs artifact upload broadly, not only DB uploads, because `cleanup` may upload both the scan DB and
    the cleanup summary JSON artifact
- Artifact-download note:
  - `merge-run-artifacts` now uses `actions/download-artifact` directly for current-run artifact collection
  - its selector input is now a glob, not a regex
  - the helper action is pinned to `actions/download-artifact` `v8.0.1`
- Composite-action nesting note:
  - the root action, `db-merge`, and `merge-run-artifacts` now avoid nested repo-local action paths for live upload and
    merge steps
  - subdirectory actions that need repo-root helper scripts must resolve them from the parent of `$GITHUB_ACTION_PATH`
  - that avoids local/direct-run failures where `$GITHUB_ACTION_PATH` points at the sub-action directory itself, while
    still avoiding caller-repo path resolution for remote consumers
- Visualizer subproject note:
  - a new repo-local `visualizer/` workspace now provides a local session web server plus browser UI for scan DB graph
    inspection
  - it is intentionally separate from `src/` so action/CLI runtime code and browser/server code do not blur together
  - root npm scripts and Dependabot now include the visualizer workspace
  - owner, package, and scan selectors are now backed by DB-driven dropdown endpoints; tag lookup stays as free text for
    now because package tag sets can grow too large for a naive full dropdown
  - tag lookup now adds capped scan-scoped suggestions via a small prefix-search API and a datalist-backed text input,
    while still preserving plain text entry as the fallback for large tag sets
  - same owner/package/scan/center reloads now preserve prior node positions by digest and skip force relayout when the
    visible node set is unchanged
  - node click now selects only; the details panel owns explicit `Expand 1 hop` and `Center here` actions
  - expansion now merges one-hop neighborhoods into the current graph instead of replacing the whole graph, so users can
    grow one branch of a manifest graph without forcing one more full depth layer everywhere
  - manifest nodes now prioritize tags and manifest-kind badges visually; digest text was removed from node labels and
    raw JSON moved behind an on-demand dialog instead of living in the fixed-width side panel

## Current Action / DB Notes

- `scan` always uploads a DB artifact.
- `cleanup` always performs a pre-scan and may upload the resulting DB.
- `cleanup` only performs the post-mutation rescan when `scan-after-cleanup` is enabled.
- `cleanup` now emits one stable summary JSON shape for both dry-run and live execution:
  - it still prints JSON to stdout
  - the root action exposes the file path to that JSON via `summary-json-path`
  - the same JSON can be uploaded as a run artifact alongside the DB when `upload-artifacts` is enabled
  - the GitHub step summary is rendered from that same JSON
- `db-merge`:
  - takes `source-db-dir` plus required `db-file`
  - creates the merged DB in a random temp directory
  - can upload the merged DB itself
  - exposes `db-path`, `artifact-id`, `artifact-url`, `artifact-digest`
- `merge-run-artifacts`:
  - collects current-run artifacts through `actions/download-artifact`
  - calls `db-merge`
  - excludes the just-uploaded merged artifact from cleanup by artifact ID

## Current Schema / Audit Notes

- `package_scans.package_metadata_json` is required at scan-row creation time.
- `package_scans` and `cleanup_runs` both store nullable `github_actions_run_url`.
- `cleanup_runs` persists planner input/summary and links to the exact latest completed scan used.
- Cleanup audit persistence remains intentionally narrow:
  - `cleanup_runs`
  - `cleanup_selected_tags`
  - `cleanup_root_decisions`
  - `cleanup_protected_root_blocks`
  - derived SQL views for closure/blocking reads
- Shared domain string categories now go through exported constant objects in production code and mirrored TS tests:
  - `ManifestKinds`
  - `DeletePlanValidationStatuses`
  - `DeletePlanValidationReasonCodes`
  - broken-index resolver modes
- Manifest kind note:
  - `classifyManifestKind(document)` now sets `multi_arch_manifest` directly from the fetched index payload when more
    than one direct descriptor carries a real platform; single-platform indexes remain `index_manifest`
  - Docker schema2 image manifests (`application/vnd.docker.distribution.manifest.v2+json`) must also classify as
    `image_manifest`; otherwise graph-matrix child images land in the DB with `manifest_kind = null` and render as
    `unknown` in the visualizer
- Manifest platform note:
  - `manifests.platform_os|platform_architecture|platform_variant` were removed from schema and runtime code
  - descriptor-scoped platform data remains on `manifest_descriptors`, which matches the actual source of truth in OCI
    index documents
  - the visualizer now derives one display platform tuple for image-manifest media types from `manifest_descriptors` and
    shows it on image nodes plus the details panel; this is intentionally a display heuristic, not new source truth
- Scenario assertion note:
  - cleanup live-scenario definitions now expect real Docker/OCI multi-arch roots as `multi_arch_manifest`, not the
    older `image_index` label
- Cleanup selected-tag audit note:
  - `cleanup_selected_tags` rows are inserted with `is_deleted = 0`
  - the follow-up audit update only touches selected tags that belong to a persisted root decision
  - this matters for `keep-n-tagged` overflow cases where a selected tag survives retention and therefore has no
    matching decision row

## Current Next Plan

- [ ] Clean up remaining repo rough edges before first public release.
- [x] Add A-B graph matrix scenarios for cleanup-logic redesign:
  - seed 12 graph cases covering A.1-A.3 crossed with base, attestations, cosign, and cosign+attestations
  - keep them in the existing scenario-executor model with no-op cleanup and non-failing validation
  - add a dedicated workflow to run just that graph matrix and merge its DB artifacts
- [x] Prepare the visualizer for separate npm publication:
  - make `visualizer/` a publishable package with its own bin and README
  - copy browser assets into `dist/public` during build so installed packages can serve the UI
  - add user docs and release workflow steps for publishing `ghcr-manager-visualizer`
- [x] Refactor the cleanup step summary toward release-facing terminology and counts:
  - replace planner-heavy labels like `root`/`closure` in the Markdown surface with user-facing item wording
  - derive planned delete counts for tags, images, multi-arch manifests, and optional artifact/signature classes from
    one SQL query keyed by the persisted `cleanup_run_id`
  - render cleanup filters as a table instead of a JSON blob in the Markdown summary
  - summarize long array-based filter values in the table and list the actual patterns below it so regex-heavy runs stay
    readable
- [x] Remove built-in DB artifact encryption and decryption support across actions, workflows, and docs.
- [x] Remove active visibility ballast that only served the old encrypted-artifact model.
- [x] Reframe the doc-refactor task brief around layered user docs, action-first entry, and task-oriented DB guidance.
- [x] Add upstream attribution guidance to the doc-refactor brief for respectful reference without copy/replace/better
      framing.
- [x] Remove regex-based package filtering from the manual test-org package cleanup workflow.
- [x] Move untag scenario verification onto `v_latest_scan_per_package` and align the user-owner cleanup workflow with
      post-cleanup DB upload.
- [x] Remove the standalone public `untag` CLI command and root-action mode:
  - delete the direct command implementation, docs, and dedicated workflow/test helpers
  - keep internal tag detachment for partial-tag cleanup matches inside the `cleanup` execution path
- [x] Reduce cleanup live-effect summary payloads to counts only:
  - remove detailed execution arrays for deleted package versions and detached tags from the cleanup summary JSON
  - keep plan-level detail in roots/manifests and keep applied live effects summarized as counts
- [x] Replace the custom current-run artifact download helper in `merge-run-artifacts` with `actions/download-artifact`
      and switch its selector input to glob semantics.
- [x] Align workflow callers with `artifact-name-glob` and bump `actions/download-artifact` to `v8.0.1` to avoid Node 20
      deprecation warnings.
- [ ] Port regex selector validation hardening for `--use-regex` cleanup selectors.
- [x] Fix planner handling for `delete-orphaned-images` digest-tag targets:
  - keep normal digest-tag exclusion for ordinary tagged selector families
  - for `delete-orphaned-images`, source selected tags from a scan-local orphaned digest-tag query instead
  - allow digest-tag-only roots with matched orphaned tags to enter the tagged-root planner branch without duplicating
    the planner pipeline
- [x] Fix `merge-run-artifacts` repo-script resolution and merged-artifact exclusion:
  - resolve helper scripts from the repo root via the parent of `$GITHUB_ACTION_PATH`
  - exclude the just-uploaded merged artifact by `steps.upload.outputs.artifact-id` during source-artifact deletion
- [x] Persist concrete selected cleanup tags as a small sibling audit table:
  - new `cleanup_selected_tags(cleanup_run_id, scan_id, tag, is_deleted)` table
  - populated from `directTargetTags` during cleanup audit persistence
  - copied through DB merge with cleanup-run history
- [x] Replace raw string literals for the main cleanup/planner domain enums in production code and mirrored TS tests:
  - `manifestKind`
  - `validationStatus`
  - `validationReasonCode`
  - broken-index resolver mode
- [x] Split broad image-index classification into:
  - `index_manifest` for generic OCI/Docker index-list documents
  - `multi_arch_manifest` only when the stored graph shows direct child image manifests and no helper digest tag
- [x] Implement user-facing run output for `cleanup`:
  - stable cleanup summary JSON from the CLI
  - action summary JSON file-path output
  - optional cleanup JSON artifact upload alongside the DB
  - GitHub step summary rendering from that same JSON
  - derived `affectedManifests` from `manifest_reachability` for fully deletable roots
- [x] Treat digest-tag `sha256-*` helper tags as helper/referrer artifacts:
  - rebuild `manifest_reachability` after refreshing `digest-tag-referrer` edges in `manifest_edges`
  - define digest-tag helper-edge SQL in `resources/sql/views` instead of embedding the derivation inline in TypeScript
  - persist tag classification in `tags.is_digest_tag`
  - exclude helper-tagged artifacts from normal tag semantics near the DB boundary (`directTargetTags`, root tag counts,
    root tag listing) once those helper artifacts have an ancestor
  - keep helper tags auditable in the DB, but do not show them in normal user-facing cleanup tag output
- [x] Update documentation for the first public release:
  - action usage
  - CLI usage
  - DB artifact / merge workflow
- [ ] Revisit DB/schema onboarding later with example-driven guidance if release feedback shows users need it.
- [ ] Review release workflow and public-facing metadata before the first release tag.
- [x] Add an initial local visualizer subproject for manifest-graph inspection:
  - repo-local `visualizer/` workspace with its own TypeScript build/test/lint scripts
  - read-only SQLite query layer for latest-scan resolution, exact tag/digest manifest resolution, and bounded
    bidirectional graph neighborhoods from direct manifest edges
  - local HTTP server plus static browser UI with Cytoscape rendering, depth control, and recenter-on-click behavior
  - root npm scripts and Dependabot updated to cover the workspace
- [ ] Follow up on the visualizer after first-pass usage:
  - validate the current node/edge styling against real GHCR graphs such as the `single` package scenario
  - decide whether the next visualizer increment should be per-node expand, richer manifest search/picking, or more
    direct edge provenance labeling in the UI
  - if same-center depth expansion still feels too jumpy, move from full graph reloads to incremental node/edge addition
    on the client so existing layouts stay stable by default
  - decide later whether image-platform display should derive one tuple from `manifest_descriptors` when all real
    descriptor platforms for a manifest agree
- [x] Catch up release metadata for `0.9.7` after the post-`0.9.6` commit range:
  - add a real `CHANGELOG.md` entry synthesized from commits since tag `0.9.6` / commit `d4b42011`
  - bump `package.json` and `package-lock.json` to `0.9.7`
  - update `README.md` action refs to `0.9.7` so release verification passes

## Current Documentation Notes

- Release-facing docs should be layered:
  - `README.md` as action-first quick start and orientation
  - action-run summary output as the first cleanup review surface
  - DB/schema docs as the deeper second layer
- Task 03 changed the recommended first-run inspection flow:
  - `cleanup` dry-run understanding should start from the GitHub step summary or `summary-json-path`
  - DB inspection is still important, but no longer the primary first-run entry path
- Do not maintain a checkpoint commit list here. Squash/rebase workflows make that log noisy and force unnecessary
  follow-up commits.
- Active user-doc split:
  - `README.md` for action-first entry
  - `action-usage.md` for the root action
  - `db-merge-workflows.md` for multi-package workflows and combined DBs
  - `cli-usage.md` for the secondary local CLI surface
  - `schema-description.md` for DB orientation
- Keep internal planner/semantics notes out of the user-facing doc path.
- Schema cleanup note:
  - retired `v_missing_digests` and its old query recipe doc because that surface was no longer used by runtime code and
    reflected pre-helper-tag handling assumptions
- Cleanup summary note:
  - digest-tag `sha256-*` helper/referrer tags are not shown as ordinary matched tags
  - the DB still preserves them for audit, and recursive manifest closure now crosses those helper edges
- Orphaned digest-tag planner note:
  - `resolveTagSelectors()` may still resolve `delete-orphaned-images` to digest-tag names
  - the planner now keeps ordinary tagged selectors on the `is_digest_tag = 0` path
  - only the orphaned-image selector family switches to a scan-local orphaned digest-tag source inside the planner
  - tagged-root planning treats digest-tag-only artifact roots as tagged when those orphaned digest tags are the matched
    selected tags for that selector family
- Root action argv note:
  - the root action now prepares `cleanup` argv in `tools/prepare-action-args.mjs`
  - `action.yml` still shows the direct public CLI invocation with `npm run ... ghcr-manager:dist -- cleanup`
  - prepared argv is handed to the visible run step through a NUL-delimited temp file so log printing and execution use
    the exact same argument list
- Older-than doc note:
  - README cleanup command notes now explicitly list the real long-form `older-than` syntax and the supported units
  - CLI docs keep the same unit list for the shell surface
  - the user-facing Markdown summary now emphasizes planned tag/image/multi-arch delete counts and uses item-oriented
    wording instead of planner-internal `root` / `closure` language
  - `DeletePlan` no longer carries denormalized `validationSummary` counts
  - those counts are now derived where needed:
    - in `buildCleanupSummary()` for user-facing summary JSON / markdown
    - in `CleanupRunWriter` when persisting `cleanup_runs`
  - `CleanupSummary` also no longer carries array-plus-count duplicates:
    - no `validationSummary`
    - no `affectedManifestCount`
    - Markdown and tests read counts from array lengths directly
  - full DB merge scan-copy now also carries `tags.is_digest_tag`
- Task 04 is effectively complete for now. DB/schema explanation remains intentionally deferred rather than blocking
  release docs.
- Release workflow note:
  - release remains tag-driven
  - the release workflow triggers only for full release tags like `0.9.0`, not shorthand major tags like `0`
  - after a successful release, the workflow force-moves the major shorthand tag (for example `0`) onto the same commit
  - release now requires these workflow-backed live checks before npm publish and GitHub release:
    - `test_scenario-executor-matrix.yml` with `executors: ghcr-manager`
    - `test_user-owner-cleanup.yml`
  - release tag / version / changelog verification now runs before those live checks so obvious release-prep mistakes
    fail fast
  - `test_scenario-executor-matrix.yml` and `test_user-owner-cleanup.yml` now run in parallel
  - release validation now checks that the tag commit is on `main`
  - release validation checks `README.md` and `.github/workflows/manual-run_scan.yml` for exact action refs
  - `CHANGELOG.md` must already contain the concrete release heading before tagging
- `0.9.7` release-prep note:
  - the missing changelog gap after `0.9.6` was reconstructed from commits and their diffs, not only from commit
    subjects
  - the resulting release-facing themes are:
    - cleanup summary/output polish
    - action argv preparation and artifact-download simplification
    - multi-arch manifest classification refinement
    - cleanup audit-state correctness and DB-merge tag metadata preservation
