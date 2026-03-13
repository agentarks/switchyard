# Focus Tracker

This file exists to keep the project moving toward the intended version instead of drifting into adjacent systems too early.

Use it at the start and end of each session.

## Current Target

The current target is a reliable single-repo, single-agent operator loop with durable state, enough CLI inspection to understand what happened, and a narrow reintegration path that stays operator-visible.

This is the proving path for the broader north star:
- one operator can delegate work to several coding agents in one repository without losing track of task ownership, current state, communication, or reintegration status

The long-term ambition is to surpass the Overstory-inspired baseline, but the path there is staged:
- first prove the narrow loop
- then expand breadth without losing operator readability

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
- handled merge-failure session-id visibility in `sy merge`
- stop-time session-id visibility in `sy stop`
- repeated-stop already-inactive refusal output in `sy stop` now also echoes the resolved session id
- handled stop output now remains visible even when post-stop cleanup removal fails
- session-id visibility in `sy mail check` and `sy mail list`
- exact mail-body preservation in `sy mail send`
- file-backed mail-body input in `sy mail send`
- explicit body-block framing in `sy mail check` and `sy mail list`
- M5 lifecycle control
- M6 messaging
- read-only mailbox inspection inside the mail path
- read-only unread-only mailbox inspection inside the mail path
- unread mailbox visibility in `sy status`
- cleanup-readiness visibility in `sy status`
- session-id visibility in `sy status`
- exact per-session inspection in `sy status`
- richer exact-session inspection in `sy status` for stored base-branch, runtime-pid, and full recent-event context
- richer exact-session inspection in `sy status` for the latest stored launch command
- cleanup-readiness and stop cleanup diagnostics for missing preserved worktree paths when the branch still remains
- truthful already-absent cleanup reporting for explicit-abandon `sy stop --cleanup --abandon`
- stop cleanup mode visibility in recent `sy status` summaries
- M7 first event inspection path
- operator-controlled recent-event window selection in `sy events`
- orphaned agent-name event recovery in `sy events` when tracked session rows are already gone
- session-id visibility in empty selected `sy events` output
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
- Unix zombie-runtime detection in pid liveness checks so stale sessions no longer look healthy
- bounded `sy sling` launch via `codex exec --json`
- first-class `sy sling` task input via `--task` or `--task-file`, with durable task specs under `.switchyard/specs/`
- launch-task visibility in `sy sling`, `sy events`, and exact-session `sy status`
- opt-in full launch-task inspection in exact-session `sy status --task`
- durable run records under `runs.db` for launched tasks
- latest run summaries in `sy status`
- latest run task ownership in the all-session `sy status` view
- derived next-step visibility in `sy status` so concurrent sessions stay operator-actionable
- synthesized unread-mail recency summaries in `sy status` so concurrent mailbox follow-up stays visible
- mail-bucket ordering in `sy status` by newest unread inbound mail
- freshest-activity timestamps and same-bucket freshness ordering in `sy status` so recent merge, mail, and runtime changes stay visible in the control-plane view
- passive stalled-session visibility in `sy status`, including a separate idle clock from `UPDATED` plus appended `runtime.stalled idleFor=...` summaries
- passive no-visible-progress visibility in `sy status`, including `runtime.no_visible_progress age=...` summaries when long-lived active sessions still show no inbound mail or repo-visible work artifact
- readable structured `sy logs <session>` rendering over raw Codex JSONL
- truthful natural task completion in `sy status` via `runtime.completed` and `runtime.failed`
- truthful already-finished handling in `sy stop` when a bounded task completed naturally before cancellation
- terminal run outcomes from `sy stop` and `sy merge`
- end-to-end coverage around `sy init`

Current planning state:
- the run-tracking slice is now materially real in the current operator loop
- the first concurrent proving workflow on top of that run model is now materially real
- the passive stalled-session visibility and no-visible-progress visibility slices in `sy status` are now complete
- detached runtime observability through bounded `codex exec --json` launch plus readable structured `sy logs <session>` is now complete
- natural task completion is now a truthful foreground reconciliation path in `sy status`
- the next slice should stay narrower than live attach or tmux and should be named only after the next operator-visible gap is reproduced
- treat raw event visibility as supporting detail, not as the primary answer to "what happened to this task?"

## Current In-Scope Work

These are the right kinds of tasks right now:
- preserve the bounded Codex exec runtime as the narrow baseline instead of broadening into interactive control
- improve operator diagnostics through narrow readable Codex JSONL rendering where the raw transcript path proved insufficient
- keep task ownership visible in the all-session view so concurrent sessions do not require immediate drilldown
- keep latest run state and terminal outcome trustworthy as concurrent sessions overlap
- improve operator inspection only when it directly supports the concurrent workflow
- harden lifecycle behavior only when a reproduced failure blocks the current loop
- add tests that reduce risk in the core operator loop
- update docs when project state or scope changes

## Current Out-Of-Scope Work

These are derailment risks right now:
- dashboards or TUIs
- multiple runtimes beyond Codex
- background daemons or watchdog systems
- supervisor/coordinator hierarchies
- merge queue automation before the merge workflow exists
- tmux-style interactive wrappers unless the bounded `codex exec --json` runtime proves insufficient
- broad transcript parsing or richer runtime protocol handling beyond narrow readable Codex JSONL rendering
- broad analytics, filtering, or reporting features
- "nice to have" abstractions without current operator value

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
- run-tracking visibility: now minimally real
- concurrent multi-session proving workflow: now minimally real
- detached runtime observability through transcript capture and `sy logs`: now minimally real
- v0 hardening: exception-only, not the default mode
- merge/reintegration workflow: minimally real, still intentionally narrow
- broader long-term vision: intended, but earned in stages rather than copied all at once

## Exit Rule For A Session

A session is probably on track if it ends with at least one of these:
- one core operator workflow got more reliable
- one user-facing inspection path got clearer
- one real risk got covered by a regression test
- the project docs became more accurate about scope or state

If a session produces mostly new surface area without improving the current loop, it is likely drift.
If a session produces mostly generic hardening without a named slice or reproduced bug, it is also likely drift.
