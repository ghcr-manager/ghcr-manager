# Implementation Notes

Active handoff notes for `ghcr-manager`.

Previous handoff material was archived to
[docs/archive/implementation-notes.archive2.md](archive/implementation-notes.archive2.md).

## Session Handoff

- Developer glossary: [docs/terminology.md](terminology.md)
- Previous handoff archive:
  [docs/archive/implementation-notes.archive2.md](archive/implementation-notes.archive2.md)

## Current Checklist

- [x] Close and archive the previous implementation-notes handoff.
- [x] Complete the cleanup/planner rethink, graph-matrix scenario work, and visualizer first-pass refinement.
- [ ] Start the next active implementation task and record it here before substantial changes begin.

## Current Next Plan

- No active implementation task is in progress in this handoff yet.
- Before starting the next substantial change:
  - read the archive if older cleanup/planner or visualizer context is needed
  - replace the placeholder open checklist item above with the real next task
  - record any new architecture or workflow decisions here as they happen

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
  - local `visualizer/` workspace for manifest-graph inspection

## Current Decisions

- Keep `README.md` user-facing only.
- Keep GitHub-specific artifact/upload policy in actions, not in the core CLI.
- Release packaging stays source-only in Git:
  - do not commit `dist/` to `main`
  - do not create workflow-managed release commits that add `dist/`
- Visualizer packaging stays separate from the main package.
- Task and handoff history should be archived rather than left as stale active notes in `docs/`.
