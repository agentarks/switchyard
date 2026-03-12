# Next Steps

This file is the owner-facing execution guide for deciding whether a new meaningful slice exists. If you are unsure what to do next, start here.

## Current Decision

The first concurrent proving workflow is now complete enough to stop being the default next task.

Current outcome:
- stop treating the first two-session proof as the open gap
- use that proved workflow to choose one small operator-visible blind spot instead of expanding surface area blindly
- the passive stalled-session visibility and no-visible-progress visibility slices in `sy status` are now complete
- detached runtime observability is now materially real through durable transcript capture plus a first-class `sy logs <session>` inspection path
- keep the all-session `sy status` view as the default control plane for concurrent task ownership and follow-up state
- keep the runtime slice narrow and operator-first instead of broadening into live attach or tmux
- real end-to-end testing now shows the detached interactive raw-transcript path is insufficient on macOS/BSD
- the next task is to replace that runtime path with a bounded `codex exec --json` launch plus readable structured `sy logs`

## Why This Is Next

The repo now proves the first two-session path end to end, including passive stalled-session visibility, no-visible-progress visibility, and detached runtime inspection. Real end-to-end testing also showed that the current detached interactive Codex launch path does not produce reliable live observability on macOS/BSD, so the next product gap is no longer "how do we inspect a detached live session at all?" but "what is the smallest truthful runtime model that gives live readable task output and natural completion?"

Without naming this slice:
- effort drifts back into generic hardening instead of a named operator problem
- breadth risks arriving before the next real constraint is identified
- docs stop being useful as an execution filter

## Exact Order

1. Replace the detached interactive Codex launch path with a bounded `codex exec --json` runtime
   - keep `.switchyard/logs/` as the durable operator log path
   - keep `sy logs <session>` as the read-only inspection path, but render readable structured output from Codex JSONL
   - keep natural task completion truthful in `sy status`, `sy events`, and run outcomes
   - no live attach or tmux unless the bounded headless runtime proves insufficient
   - chosen after real end-to-end testing on 2026-03-12 showed the raw detached interactive transcript path was not trustworthy enough

2. Fix the prior blind spot: no visible progress visibility in `sy status`
   - completed on 2026-03-11

3. Keep the slice narrow
   - do not broaden into dashboards, automation, interactive attach, tmux-backed control, broad transcript parsing, or generic workflow engines
   - do not invent another broad multi-agent milestone until a concrete gap earns it
   - update docs only where the named blind spot changes project meaningfully

## Latest Completed Slice

Completed slice:
- detached runtime transcript capture under `.switchyard/logs/`
- first-class `sy logs <session>` with default tail and `--all`
- transcript path visibility in exact-session `sy status`
- transcript-path metadata in `sy sling` output and launch events
- transcript preservation on plain `sy stop` plus cleanup removal on `sy stop --cleanup`
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
- freshest-activity `UPDATED` timestamps and same-bucket ordering in `sy status` so recent merge, mail, and runtime changes are not hidden behind stale session-row timestamps
- passive stalled-session visibility in `sy status`, including a separate idle clock from `UPDATED` plus appended `runtime.stalled idleFor=...` summaries
- passive no-visible-progress visibility in `sy status`, including `runtime.no_visible_progress age=...` hints for long-lived active sessions that still show no inbound mail or repo-visible work artifact
- end-to-end proof that two concurrent delegated sessions can be followed through status, mail review, merge, and cleanup without losing the untouched session's run or reintegration state

Decision rule:
- if current launch output, `sy events`, exact-session `sy status`, and `sy status <session> --task` already give enough task-handoff visibility, do not invent another slice just to stay busy
- if current mailbox inspection already gives enough exact-session visibility and readable message framing for follow-up commands, do not invent another mail slice just to stay busy
- if operators hit a concrete gap, name that gap explicitly before writing code

Current status:
- the first concurrent proving workflow is now materially real
- passive stalled-session visibility and no-visible-progress visibility in `sy status` are complete
- detached runtime observability through transcript capture plus `sy logs <session>` is now complete
- the raw detached interactive transcript path is no longer considered sufficient after real end-to-end testing
- the next slice should stay narrower than live attach or tmux-backed runtime control and should focus on bounded `codex exec --json` task runs plus readable structured logs

## What To Keep Small

Do not build these inside this slice unless a concrete operator workflow now requires them:
- multiple runtimes beyond Codex
- dashboard or TUI work
- background daemons or watchdogs
- broad analytics or reporting
- speculative merge automation beyond the current explicit path
- interactive attach, tmux, or transcript parsing beyond narrow readable Codex JSONL rendering

## Definition Of Done

The next session is on track when all of these are true:
- it materially reduces one named operator-visible blind spot in the proved concurrent workflow
- tests and docs match the resulting behavior when behavior changed
- the work did not broaden scope just to stay busy

## If You Get Stuck

Reduce scope instead of inventing a larger roadmap item:
- if the work starts sounding like generic hardening, tie it back to the blind spot it improves
- if two slices are possible, choose the one that is more concrete and more reviewable
- keep optimizing for the current single-repo, single-agent loop
