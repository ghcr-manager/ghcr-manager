# Implementation Notes

Active handoff notes for `ghcr-manager`.

Previous handoff material was archived to
[docs/archive/implementation-notes.archive2.md](archive/implementation-notes.archive2.md).

## Session Handoff

- Developer glossary: [docs/terminology.md](terminology.md)
- Previous handoff archive: [docs/archive/implementation-notes.archive2.md](archive/implementation-notes.archive2.md)

## Current Checklist

- [x] Close and archive the previous implementation-notes handoff.
- [x] Complete the cleanup/planner rethink, graph-matrix scenario work, and visualizer first-pass refinement.
- [x] Start the next active implementation task and record it here before substantial changes begin.
- [x] Apply graph-scoped `graph_id` narrowing to blocked-roots planner SQL.
- [x] Measure the updated blocked-roots query on the large large test package DB dry-run workload.
- [x] Optimize combined direct-target-root planning to avoid broad edge and tag pre-aggregation.
- [x] Evaluate `ghcrctl` as an optional third graph-matrix executor.
- [x] Limit `ghcrctl` support to graph-matrix scenarios with exactly one delete-tag target.
- [x] Add minimal workflow support for one-call `ghcrctl delete graph --tag` execution.
- [x] Add separate test-facing docs for scenarios and the workflow-to-visualizer path.
- [x] Add release-DB quick-demo notes to the visualizer doc and main README.
- [x] Add one visualizer screenshot to the README quick-demo section.
- [x] Collapse visualizer docs to one canonical `visualizer/README.md`.
- [x] Refresh user-facing docs for release readiness:
  - add explicit action permission guidance for dry-run vs live cleanup
  - add Node.js 24 requirements to CLI and visualizer install docs
  - align terminology docs with current manifest kinds and edge kinds
  - fix small prose issues in the workflow-to-visualizer doc
- [x] Align release docs and workflow with the planned `v1.0.0` tag style.
- [x] Add the `v1.0.0` changelog entry covering all changes since `0.9.10`.
- [x] Fix visualizer compare mode so manifest details prefer older/base scan metadata instead of newer-scan metadata.
- [x] Add the `v1.0.2` changelog entry for the visualizer compare-mode metadata fix.
- [x] Add the `v1.0.3` changelog entry for npm package keyword metadata.
- [x] Fix the visualizer npm `bin` packaging so `npx ghcr-manager-visualizer` runs under Node instead of `sh`.
- [x] Add a visualizer screenshot grid toggle that can be enabled without reloading or re-laying out the graph.
- [x] Add a user-facing cleanup behavior explainer covering graph-aware cleanup, tag-based protection, and digest-only
      caveats.
- [x] Collapse visualizer local-start scripts to one built-mode entrypoint so root `npm run visualize` always builds and
      starts the same way.
- [x] Block selected helper roots that `digest-tag-referrer` point into the protected closure of retained manifests,
      instead of only expanding closure membership after selection.
- [x] Start Task 09 and record the first-pass and deeper-pass candidate-tool evaluation in `docs/tasks/09/`.
- [x] Refactor test-scenario executor config to a generic per-scenario `executors` mapping with legacy normalization for
      current scenarios.
- [x] Extract current scenario-executor workflow branches into per-executor composite actions so adding new executors
      does not keep bloating one workflow file.
- [x] Add a first pass of scan expectations to the mixed cleanup matrix so only the remaining non-obvious scenarios
      still fail fast for missing validation.
- [x] Rename the runnable `graph-2multiarch2tags-*` base rows to explicit `--delete-untagged` graph scenarios so their
      ids match the existing graph operation naming pattern.
- [x] Add a one-retry local Buildx setup wrapper for test seeding/build actions so transient Docker Hub bootstrap
      failures do not immediately force a full failed-job rerun.
- [x] Add `vlaurin/action-ghcr-prune` as a fourth executor on a small compatible non-graph scenario subset.
- [x] Wire `vlaurin/action-ghcr-prune` into the graph-matrix path on the existing `graph-2multiarch2tags-*` base
      scenarios without changing scenario expectations.
- [x] Make `merge-run-artifacts` deterministic by listing matching current-run artifacts once, then downloading,
      merging, and deleting that exact same artifact set by ID.
- [x] Add `chizkiyahu/delete-untagged-ghcr-action` as another comparison executor on the initial untagged-only scenario
      subset.
- [x] Add release-only Docker publishing for the visualizer image with tags `vX.Y.Z`, `vX`, and `latest`.

## Current Next Plan

- Inspect `artifacts/ghcr-manager-merged--scenario-matrix-cleanup.sqlite` and fill expectations for the remaining
  mixed-matrix scenarios that are not obvious from seed shape alone:
  - `blocked-shared-closure`
  - `delete-ghost-images-noop`
  - `delete-partial-images-real`
  - `delete-partial-images-noop`
  - `delete-orphaned-images-noop`
- Re-run the live matrix workflows after the scenario-config refactor so the executor-action translations are verified
  on GitHub, not just through local resolution and lint checks.
- Consider whether to add a smaller `2images1tag` graph family as a follow-up, not a prerequisite, for clearer
  `delete-untagged` comparisons.
- If Task 09 continues immediately, implement the chosen executor/scenario direction before returning to the older
  follow-up ideas.
- Run the initial GitHub matrix lanes for `chizkiyahu/delete-untagged-ghcr-action` and inspect how it behaves on the
  `2multiarch2tags` untagged graph family compared with `ghcr-manager`, `ghcr-cleanup-action`, and `vlaurin`.
- Validate the visualizer release image on GitHub and confirm the published container starts with the expected default
  host/port behavior.
- Decide whether Task 09 should prioritize:
  - graph `delete-untagged` evaluation first using the existing `2multiarch2tags` family for
    `quartx-analytics/ghcr-cleaner` and `chizkiyahu/delete-untagged-ghcr-action`, now that `vlaurin/action-ghcr-prune`
    is wired into both the non-graph matrix and the graph-matrix base `2multiarch2tags` rows, or
  - expand the `vlaurin` scenario set further if more non-graph comparison lanes look useful.
- Consider whether to add a smaller `2images1tag` graph family as a follow-up, not a prerequisite, for clearer
  `delete-untagged` comparisons.
- If Task 09 continues immediately, implement the chosen executor/scenario direction before returning to the older
  follow-up ideas.

## Current Status

- Runtime: Node.js and TypeScript.
- Persistence model: local SQLite database per run.
- Core public surfaces:
  - CLI: `scan`, `cleanup`
  - root action: `command: scan | cleanup`
  - helper actions: `db-merge`, `merge-run-artifacts`
- Current major areas already in place:
  - cleanup/planner rethink and current graph-based deletion behavior
  - graph-matrix scenario workflows and test harness
  - optional `ghcrctl` graph-matrix executor for single-tag graph deletions
  - local `visualizer/` workspace for manifest-graph inspection
  - basic live-test documentation in `docs/test/scenarios.md`, `docs/test/package-setup.md`, and
    `docs/test/matrix-workflow-to-visualizer.md`
  - release assets now include a merged scenario DB that can be used as a ready-made visualizer demo
  - visualizer docs now live only in `visualizer/README.md`

## Current Decisions

- Keep `README.md` user-facing only.
- Keep GitHub-specific artifact/upload policy in actions, not in the core CLI.
- Release packaging stays source-only in Git:
  - do not commit `dist/` to `main`
  - do not create workflow-managed release commits that add `dist/`
- Visualizer packaging stays separate from the main package.
- Task and handoff history should be archived rather than left as stale active notes in `docs/`.
- Release tags use `v`-prefixed semver such as `v1.0.0`.
- `package.json`, `visualizer/package.json`, and changelog headings now also use the same `v`-prefixed semver format.
- Use `graph_id` narrowing in planner SQL where the workload is already graph-scoped; do not denormalize `graph_id` into
  `manifest_reachability` before measuring query-level gains.
- Prefer indexed per-root `EXISTS` and `COUNT` lookups over broad pre-aggregating CTEs when large-table scans dominate
  planner runtime.
- `ghcrctl` support stays graph-matrix-only and single-target-only:
  - no mixed cleanup matrix support
  - no multi-tag scenario support
  - no multi-call mapping to emulate one scenario
  - executor outcome mismatches are valid comparison signal, not an adapter bug by default
- `chizkiyahu/delete-untagged-ghcr-action` should follow the same comparison rule as other non-primary executors:
  - wire only scenarios it can meaningfully run
  - keep shared scenario expectations unchanged
  - treat failures as comparison signal, not something to normalize away
- Visualizer npm packaging should match the main CLI pattern: keep the shebang in `src/index.ts`, publish
  `dist/src/index.js`, and point the package `bin` at that built file.
- Local visualizer startup should not expose separate source-mode vs built-mode behavior at repo root:
  - root `npm run build` also builds the visualizer
  - root `npm run visualize` uses the built visualizer path
  - avoid a separate root `visualizer:start` alias
- Visualizer screenshot aids should stay DOM/CSS overlays above Cytoscape so toggling them does not reset graph layout
  state.
- Cleanup documentation should state the current planner contract in user terms: retained tags protect reachable
  manifests, and cleanup may remove adjacent unprotected graph sections to leave the remaining package in a correct
  working state.
- `merge-run-artifacts` should not rediscover deletion candidates after bundling:
  - enumerate matching run artifacts once
  - download by explicit artifact IDs
  - delete that exact same ID set after uploading the merged DB artifact
- Visualizer release distribution should include a container image, but keep scope minimal:
  - publish only the visualizer image for now
  - publish only from release tags, not branch pushes
  - tag images as `vX.Y.Z`, `vX`, and `latest`
  - container default bind host should be `0.0.0.0`
- The cosign helper-index bug needs a root-validation rule for selected helper roots.
- If a selected root directly `digest-tag-referrer` points to a retained/protected manifest, that root is blocked.
- Helper roots that point only to unretained manifests should still remain deletable.
- For Task 09, evaluate candidate cleanup tools by best scenario fit:
  - prefer graph scenarios when the fit is real
  - otherwise recommend the non-graph scenarios they match best
  - do not force delete-tag graph executors onto tools that only do untagged or policy pruning
- Scenario executor config is now generic:
  - scenario definitions may provide an `executors` object keyed by executor id
  - current legacy scenario fields are normalized into that shape for compatibility during the transition
- Executor-specific workflow logic now lives in:
  - `.github/actions/test-scenario-executor-ghcr-manager/`
  - `.github/actions/test-scenario-executor-ghcr-cleanup-action/`
  - `.github/actions/test-scenario-executor-ghcrctl/`
