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
- `sy mail list`

## Where We Are

Completed enough to count as minimally real:
- M1 scaffold
- M2 repo bootstrap
- M3 session persistence
- M4 one-agent spawn
- launch-time session-id visibility in `sy sling`
- M5 lifecycle control
- M6 messaging
- read-only mailbox inspection inside the mail path
- read-only unread-only mailbox inspection inside the mail path
- unread mailbox visibility in `sy status`
- cleanup-readiness visibility in `sy status`
- session-id visibility in `sy status`
- exact per-session inspection in `sy status`
- richer exact-session inspection in `sy status` for stored base-branch, runtime-pid, and full recent-event context
- cleanup-readiness and stop cleanup diagnostics for missing preserved worktree paths when the branch still remains
- M7 first event inspection path
- operator-controlled recent-event window selection in `sy events`
- orphaned agent-name event recovery in `sy events` when tracked session rows are already gone
- first merge and reintegration CLI path
- merge-target metadata retention for canonical-branch drift
- dirty-entry diagnostics for merge preflight failures
- explicit repo-root merge-in-progress diagnostics in `sy merge`
- merge-conflict path diagnostics in `sy merge` and recent status context
- durable stop-failure events with recent-status visibility for runtime shutdown errors before state change
- durable stop cleanup failure events with recent-status visibility for blocked or failed cleanup attempts
- durable merge preflight failure events with recent-status visibility for blocked reintegration attempts
- durable stop cleanup failure events with recent-status visibility for blocked or failed cleanup attempts
- explicit selector disambiguation in `stop` and `merge`
- explicit reused-agent selector disambiguation across session-targeting commands
- first readiness and early-failure handling as hardening work ahead of M8
- detached `sy sling` launch compatibility hardening for TTY-requiring Codex builds on supported Unix platforms
- end-to-end coverage around `sy init`

Not complete yet:
- the next concrete operator-loop hardening gap still needs selection and reproduction

## Current In-Scope Work

These are the right kinds of tasks right now:
- improve operator inspection only where a real operator workflow still has a blind spot
- improve pid-backed lifecycle control only where the current operator loop is still concretely weak
- harden launch, status, stop, merge, mail, or event behavior only when a real operator blind spot is reproduced
- add tests that reduce risk in the core operator loop
- update docs when project state or scope changes
- broaden event or merge inspection further only if the current operator loop proves insufficient

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
