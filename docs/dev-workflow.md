# Dev Workflow

This file is the recommended owner workflow for a normal Switchyard coding session.

## Start Of Session

1. Read:
   - `docs/current-state.md`
   - `docs/next-steps.md`
   - `docs/backlog.md`
   - `docs/focus-tracker.md`

2. If the task touches behavior or architecture, also read:
   - `docs/cli-contract.md`
   - relevant files under `docs/decisions/`

3. Run:
   - `npm install` if dependencies changed
   - `npm run check`

If `npm run check` does not pass at session start, fix or understand that first before expanding scope.

## During The Session

Use this order:
1. make the smallest change that advances the current slice
2. add or update tests
3. run the relevant checks
4. update docs if the project state changed

Default rule:
- if you fix a bug, add a regression test
- if you change behavior, update the CLI contract or current-state docs
- if you make a durable technical choice, update or add an ADR

## End Of Session

Before you consider the session done:
1. run `npm run check`
2. review `git diff`
3. update the docs that changed in meaning
4. confirm the next recommended task still makes sense
5. send a PR for the completed feature slice
6. include example output in the PR description for any operator-facing behavior or CLI output you changed

## If You Only Have 30-60 Minutes

Prefer one of these:
- add a failing test and make it pass
- complete one store function and its test
- replace one placeholder behavior with a minimal real behavior
- update one decision doc after a real implementation choice

Do not start a broad new subsystem unless you can finish a vertical slice of it.

## Scope Control

Ask these questions before adding complexity:
- does this help the first `init -> status -> sling -> stop` loop?
- does this reduce a real known risk?
- can this be tested in this session?

If the answer is no to all three, defer it.

Also check `docs/focus-tracker.md` before starting work that introduces a new subsystem or a broader UI surface.
