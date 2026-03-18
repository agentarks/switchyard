# AGENTS.md

## Project Identity

Switchyard is a CLI-first, Codex-first orchestration tool for one repository at a time.

The current target is a reliable single-agent operator loop:
- `sy init`
- `sy sling`
- `sy status`
- `sy events`
- `sy stop`
- `sy merge`
- `sy mail send`
- `sy mail check`
- `sy mail list`

Favor milestone-bundled work that makes this loop more reliable or easier to understand.
Batch adjacent in-scope changes when they share code, tests, and operator workflow meaning.

## Source Of Truth

Use the docs in `/docs` and `PLAN.md` as the project source of truth.

Read these first when the task touches behavior or scope:
- `docs/current-state.md`
- `docs/next-steps.md`
- `docs/backlog.md`
- `docs/focus-tracker.md`

Update docs when project state or workflow meaning changes.

## Scope Rules

In-scope work:
- tighter lifecycle behavior in the core operator loop
- clearer status and event inspection
- durable state, tests, and docs that reduce operator risk

Defer unless explicitly requested:
- multiple runtimes beyond Codex
- dashboard or TUI work
- watchdog daemons or supervisors
- broad analytics or filtering
- merge automation before the merge workflow exists

## Working Rules

- Keep CLI behavior operator-first: explicit inputs, explicit outputs, explicit failure modes.
- Prefer coherent milestone-bundled changes over speculative abstractions.
- Do not re-triage the next tiny slice once the active milestone bundle is already clear.
- If you change behavior, add or update tests in the same session when practical.
- If you change CLI behavior or output, update the relevant docs.
- Run `npm run check` before closing a milestone bundle when behavior changed.

## Pull Request Rules

- After implementing each milestone bundle, send a PR instead of leaving the work only local.
- Keep PRs milestone-scoped and batch adjacent in-scope work into one reviewable PR when it advances the same operator workflow step.
- Every PR that changes operator-facing behavior must include example output in the PR description.
- Call out concrete behavior changes, file references, assumptions, and any remaining risks.

## Decision Rule

When uncertain:
- choose the smaller change
- choose the smaller coherent bundle when several adjacent tasks belong together
- choose the more operator-readable output
- choose the path that improves the current repo-local lifecycle
- defer broader systems until the docs explicitly move the scope
