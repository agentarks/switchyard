# AGENTS.md

## Project Identity

Switchyard is a CLI-first, Codex-first orchestration tool for one repository at a time.

The current target is a reliable single-agent operator loop:
- `sy init`
- `sy sling`
- `sy status`
- `sy events`
- `sy stop`
- `sy mail send`
- `sy mail check`

Favor small vertical slices that make this loop more reliable or easier to understand.

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
- Prefer narrow, reviewable changes over speculative abstractions.
- If you change behavior, add or update tests in the same session when practical.
- If you change CLI behavior or output, update the relevant docs.
- Run `npm run check` before closing a feature slice when behavior changed.

## Pull Request Rules

- After implementing each feature slice, send a PR instead of leaving the work only local.
- Keep PRs milestone-scoped and prefer one vertical slice per PR.
- Every PR that changes operator-facing behavior must include example output in the PR description.
- Call out concrete behavior changes, file references, assumptions, and any remaining risks.

## Decision Rule

When uncertain:
- choose the smaller change
- choose the more operator-readable output
- choose the path that improves the current repo-local lifecycle
- defer broader systems until the docs explicitly move the scope
