# Next Steps

This file is the owner-facing execution guide for deciding whether a new meaningful slice exists. If you are unsure what to do next, start here.

## Current Decision

The run-tracking slice is now complete enough to stop being the default next task.

Current outcome:
- stop treating run tracking itself as the open gap
- make the smallest useful multi-agent workflow real on top of the new run model
- make sure the operator can follow two concurrent delegated sessions without losing task, run, or reintegration state
- use the all-session `sy status` view to surface task ownership directly from the latest run instead of forcing exact-session drilldowns

## Why This Is Next

The core loop now has a durable run-level story. The next product gap is no longer "what happened to this task?" but "can the operator do this safely for more than one delegated session at a time?"

Without naming this slice:
- effort drifts back into output polish instead of product expansion
- the repo proves only a single-session loop while claiming a broader orchestration direction
- future breadth risks arriving before the operator workflow is concrete enough to test

## Exact Order

1. Prove the first concurrent workflow
   - keep it small: two delegated sessions in one repository
   - preserve exact session targeting, run visibility, and explicit reintegration steps

2. Use the run model as the control plane, not just extra metadata
   - `sy status` should stay sufficient for understanding both sessions at a glance
   - follow-up commands should still work from exact session ids without ambiguity
   - do not make operators reconstruct concurrent state from raw events

3. Keep the slice narrow
   - do not broaden into dashboards, automation, or transcript capture inside this slice
   - do not build a generic workflow engine
   - update docs only where the concurrent-workflow priority changes the project meaningfully

## Latest Completed Slice

Completed slice:
- basic run tracking with durable run records under `runs.db`
- latest run summaries in `sy status`
- latest run task ownership in the all-session `sy status` view
- derived next-step visibility in the all-session and exact-session `sy status` views
- run creation in `sy sling`
- run terminal outcomes in `sy stop` and `sy merge`
- file-backed mail-body input in `sy mail send` via `--body-file <path>`
- truthful already-absent cleanup reporting for `sy stop <session> --cleanup --abandon`
- file-backed launch-task input in `sy sling` via `--task-file <path>`
- exact launch-task inspection in `sy status <session> --task`
- exact launch-command inspection in `sy status <session>`
- exact session-id visibility in handled `sy merge` failure output
- exact session-id visibility in operator-facing `sy stop` output
- exact session-id visibility in repeated-stop already-inactive `sy stop` refusal output
- handled stop output plus exact session-id visibility when `sy stop --cleanup` hits a cleanup-removal failure after the runtime is already stopped
- exact session-id visibility in operator-facing `sy mail check` and `sy mail list` output
- exact mail-body preservation in `sy mail send`
- explicit `Body:` framing for multi-line mail inspection output in `sy mail check` and `sy mail list`
- exact session-id visibility in empty selected `sy events` output
- synthesized unread-mail recency summaries in `sy status`
- mail-bucket ordering in `sy status` by newest unread inbound mail instead of stale session timestamps

Decision rule:
- if current launch output, `sy events`, exact-session `sy status`, and `sy status <session> --task` already give enough task-handoff visibility, do not invent another slice just to stay busy
- if current mailbox inspection already gives enough exact-session visibility and readable message framing for follow-up commands, do not invent another mail slice just to stay busy
- if operators hit a concrete gap, name that gap explicitly before writing code

Current status:
- the next slice is now the first concurrent proving workflow
- progress should be judged against real multi-session operator control, not against another generic hardening pass

## What To Keep Small

Do not build these inside this slice unless a concrete operator workflow now requires them:
- multiple runtimes beyond Codex
- dashboard or TUI work
- background daemons or watchdogs
- broad analytics or reporting
- speculative merge automation beyond the current explicit path
- transcript capture or interactive attach

## Definition Of Done

The next session is on track when all of these are true:
- it materially advances the named concurrent-workflow slice
- tests and docs match the resulting behavior when behavior changed
- the work did not broaden scope just to stay busy

## If You Get Stuck

Reduce scope instead of inventing a larger roadmap item:
- if the work starts sounding like generic hardening, tie it back to the concurrent workflow it improves
- if two slices are possible, choose the one that is more concrete and more reviewable
- keep optimizing for the current single-repo, single-agent loop
