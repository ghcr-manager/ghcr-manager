# AI Agent Playbook

Audience: AI coding agents working in this repo.

## Ground rules

- Markdown: wrap near ~120 chars.
- Keep [README.md](README.md) user-only.
- KISS: default to minimal changes; avoid optional parameters/configs or extra result objects unless explicitly
  requested.
- Backward compatibility changes are never implicit: do not add migration/backfill/legacy-support behavior unless the
  user explicitly requests it, or you first propose it and receive explicit approval.
- Visibility first: new modules default to private (`_`); keep constants private unless used outside the module.
- Do not invent new public APIs or config fields unless explicitly requested.
- Do not print `git diff` output or patch hunks in normal progress updates unless explicitly requested.
- Summarize code changes briefly and rely on commit hashes, file paths, and test results instead.
- The repository uses Node.js and TypeScript for build, test, and lint tasks.
- Do not embed non-trivial code inline inside bash blocks, especially not inline heredoc/one-liner Node, Python, Ruby,
  Perl, or shell helper programs inside YAML `run:` steps; put that logic in repo-local script files instead.
- Disabling linters via comments is a last resort; fix first and only suppress with explicit approval.
- For any substantial work, update [docs/implementation-notes.md](docs/implementation-notes.md) before ending the
  session.
- Do not create commits unless the user explicitly asks for a commit after review.
- Keep production TypeScript files small by default:
  - up to about 100 lines is comfortable
  - above about 100 to 160 lines, strongly consider splitting
  - above about 160 to 220 lines, split unless cohesion is unusually strong
  - above about 220 lines is generally not acceptable outside repetitive or low-risk code
- Test files may exceed those sizes when scenario readability or fixture-heavy structure benefits from it.
- Evaluate file size together with cohesion, abstraction level, and testability, not line count alone.
- Cross-folder TypeScript imports must go through the target folder's `index.ts`.
- Exception for mirrored tests: a file under `tests/` may directly import the exact `src/` file it mirrors; it must
  still use `index.ts` for any other cross-folder import.
- Non-`index.ts` files are internal to their folder and must not be imported from outside that folder.
- In `src/`, every non-public TypeScript implementation file must be named `_*.ts`.
- The `tests/` tree must mirror the `src/` tree with a one-to-one file mapping: `src/foo/bar.ts` ->
  `tests/foo/bar.test.ts`.

## Linting and tests

- Lint: `./scripts/lint.sh`
- Tests: `npm test`
- Typecheck: `npm run typecheck`

## Session Continuity

- Treat [docs/implementation-notes.md](docs/implementation-notes.md) as the canonical handoff document.
- Keep a checkbox-based checklist there for completed work and the current next plan.
- Record important decisions there when they affect architecture, tooling, or workflow shape.
- Treat commits as user-approved checkpoints, not agent-owned defaults.
- Before starting new implementation work, read the handoff doc and align with its current next plan.
