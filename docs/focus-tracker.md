# Focus Tracker

This file exists to keep the project moving toward the intended version instead of drifting into adjacent systems too early.

Use it at the start and end of each session.

## Current Target

The current target is a reliable single-repo, single-agent operator loop with durable state, enough CLI inspection to understand what happened, and a narrow reintegration path that stays operator-visible.

That means the project should reliably support:
- `sy init`
- `sy sling`
- `sy status`
- `sy events`
- `sy stop`
- `sy merge`
- `sy mail send`
- `sy mail check`

## Where We Are

Completed enough to count as minimally real:
- M1 scaffold
- M2 repo bootstrap
- M3 session persistence
- M4 one-agent spawn
- M5 lifecycle control
- M6 messaging
- M7 first event inspection path
- first merge and reintegration CLI path
- first readiness and early-failure handling as hardening work ahead of M8

Not complete yet:
- broader merge cleanup ergonomics and any metadata that real recovery work proves necessary

## Current In-Scope Work

These are the right kinds of tasks right now:
- only broaden session metadata if a real merge or recovery workflow needs it
- improve merge cleanup ergonomics if the first merge path exposes a concrete operator risk
- improve pid-backed lifecycle control only where the current operator loop is still concretely weak
- add tests that reduce risk in the core operator loop
- update docs when project state or scope changes
- pay down small operator-facing ambiguities, such as selector precedence, before adding broader inspection features

## Current Out-Of-Scope Work

These are derailment risks right now:
- dashboards or TUIs
- multiple runtimes beyond Codex
- background daemons or watchdog systems
- supervisor/coordinator hierarchies
- merge queue automation before the merge workflow exists
- tmux-style interactive wrappers unless operator workflows prove pid-only control is insufficient
- broad analytics, filtering, or reporting features
- “nice to have” abstractions without current operator value

## Session Gate

Before starting a task, answer these:

1. Does this improve the current operator loop?
2. Does this reduce a real known risk?
3. Can this be finished and tested in one focused pass?

If the answer is `no` to all three, defer it.

If the task mainly improves a deferred area, defer it.

## Completion View

Use this rough project view instead of one flat percentage:

- Core v0 operator loop: mostly complete
- v0 hardening and operator confidence: in progress
- merge/reintegration workflow: minimally real, still intentionally narrow
- broader long-term vision: intentionally deferred

## Exit Rule For A Session

A session is probably on track if it ends with at least one of these:
- one core operator workflow got more reliable
- one user-facing inspection path got clearer
- one real risk got covered by a regression test
- the project docs became more accurate about scope or state

If a session produces mostly new surface area without improving the current loop, it is likely drift.
