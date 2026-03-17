# Next Steps

This file is the owner-facing execution guide for deciding whether a new meaningful slice exists. If you are unsure what to do next, start here.

Canonical implementation-slice counts now live in [docs/slice-ledger.md](slice-ledger.md); this file stays focused on choosing the next slice.

## Current Decision

The bounded Codex exec runtime slice is now complete enough to stop being the default next task.

Current outcome:
- stop treating the old detached interactive runtime as the open gap
- keep the all-session `sy status` view as the default control plane for concurrent task ownership and follow-up state
- keep the runtime slice narrow and operator-first instead of broadening into live attach or tmux
- `sy sling` now launches bounded `codex exec --json` tasks with a default `workspace-write` sandbox and durable JSONL logs under `.switchyard/logs/`
- `sy logs <session>` now renders readable structured output from Codex JSONL instead of raw transcript dumps
- natural task completion is now truthful in `sy status`, recent events, and run outcomes
- the next task should be chosen from the next concrete operator-visible blind spot instead of naming another runtime expansion by default

## Why This Matters

The repo now proves the first concurrent workflow end to end with a truthful bounded runtime:
- detached task logs are readable while the task is running
- natural completion no longer looks like a stale failed pid by default
- `sy stop` remains useful for cancellation and cleanup without pretending normal completion needs an explicit stop

That means the runtime slice no longer needs to dominate the execution filter. The next slice should be named only after a new concrete operator gap appears.

## Exact Order

1. Treat the bounded `codex exec --json` runtime as complete
- keep `.switchyard/logs/` as the durable operator log path
- keep writable-by-default bounded launches as the operator-safe baseline unless an explicit runtime override is passed
   - keep `sy logs <session>` as the read-only inspection path with narrow readable structured output
   - keep natural task completion truthful in `sy status`, recent events, and run outcomes

2. Choose the next small operator-visible blind spot from the proved workflow
   - avoid naming a new broad milestone before a concrete gap earns it
   - prefer the next reviewable lifecycle or inspection problem over broadening the surface area

## Latest Completed Slice

Completed slice:
- bounded `codex exec --json` launch in `sy sling`, now defaulting to `--sandbox workspace-write`
- readable structured `sy logs <session>` over raw Codex JSONL
- natural completion reconciliation in `sy status`
- truthful already-finished handling in `sy stop`
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
- merged-cleanup readiness that now refuses preserved worktrees with uncommitted non-Switchyard entries
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
- detached runtime observability through structured Codex JSONL plus `sy logs <session>` is now complete
- the bounded `codex exec --json` runtime with a default `workspace-write` sandbox is now the repo's runtime baseline
- fresh temp-repo manual smoke with the real `sy` entrypoint and Codex CLI validated that runtime baseline, natural completion reconciliation, dirty preserved-worktree cleanup refusal, and explicit-abandon cleanup
- the next slice should stay narrower than live attach or tmux-backed runtime control and should be named only after a new operator-visible gap is reproduced

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
