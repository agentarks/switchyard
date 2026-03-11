# CLI Contract

This file defines the expected user-facing behavior of the early Switchyard CLI. It is the contract future sessions should preserve unless there is a deliberate product decision to change it.

## Global Rules

- The CLI name is `sy`.
- Commands should work when invoked from the repository root, a nested subdirectory, or a git worktree unless the command explicitly requires otherwise.
- Failures should be explicit and operator-readable.
- JSON output can wait until the underlying command behavior is stable.
- Placeholder commands may accept future-looking arguments, but they should fail only when behavior is actually unsupported, not because the parser shape is too narrow.
- Merge stays manual-first even with `sy merge`: the command should only preflight and run the explicit git merge path, while review, conflict resolution, validation, and cleanup stay operator-visible.

## `sy init`

Purpose:
- initialize Switchyard for the current git repository

Expected behavior:
- resolve the canonical repository root, even when invoked from a nested directory or worktree
- write all bootstrap artifacts under that resolved canonical repo root rather than the invocation directory
- detect a project name from the repo directory unless `--name` is provided
- detect the canonical branch from `origin/HEAD` when available
- keep bootstrap successful even when the chosen canonical branch does not point to a commit yet
- warn explicitly when the chosen canonical branch does not point to a commit yet, and tell the operator to create an initial commit before running `sy sling`
- create `.switchyard/`
- create `.switchyard/worktrees/`, `.switchyard/logs/`, `.switchyard/agents/`, and `.switchyard/specs/`
- write `.switchyard/config.yaml`
- write `.switchyard/.gitignore`
- write `.switchyard/README.md`
- create placeholder database files without noisy runtime warnings

Flags:
- `--force`
  - overwrite the existing config and regenerate the bootstrap layout
- `--name <name>`
  - override the detected project name
- `--canonical-branch <branch>`
  - override the detected canonical branch

Failure rules:
- outside a git repository, return a config-style error
- if `.switchyard/config.yaml` already exists and `--force` is not set, return an init-style error

## `sy sling [args...]`

Current contract:
- command requires one `<agent>` argument, exactly one explicit task source via `--task <instruction>` or `--task-file <path>`, and may accept additional positional runtime args
- command loads config from the canonical repo root
- command creates one deterministic branch and worktree under `.switchyard/worktrees/`
- command writes one durable task handoff file under `.switchyard/specs/`
- command passes the explicit task text to Codex as the initial prompt, whether it came from the CLI flag or a task file
- command starts one detached Codex process from that worktree
- on supported Unix platforms, detached launch uses the system `script` utility so Codex startup still gets a pseudo-terminal
- command fails explicitly before worktree creation when the configured canonical branch does not resolve to a commit yet, instead of surfacing raw `git worktree` invalid-reference output
- command persists one `starting` session record in `sessions.db`, including the original canonical branch as session `baseBranch`
- command creates one durable run record in `runs.db` for that launched task
- command records `sling.spawned` when the runtime pid exists, including `taskSummary` and `taskSpecPath`
- command records `sling.completed` after the initial launch window succeeds, including the same task handoff metadata plus `readyAfterMs`
- command moves that run record to `active` after the launch window succeeds
- if Codex exits during the launch window, command records `sling.failed` with the launch error and preserves task handoff metadata when available
- if launch fails after the run record exists, command marks that run as `finished:launch_failed`
- command prints the durable session id, launch state, created branch, base branch, task summary, task spec path, worktree path, runtime command line, and initial readiness delay
- if the `script` wrapper is unavailable on a supported platform, command fails explicitly instead of pretending the launch succeeded
- on unsupported platforms, detached launch falls back to direct Codex spawn

Future target:
- add richer runtime metadata only if operator workflows require attach or transcript inspection

## `sy status [session]`

Current contract:
- command accepts one optional session id or agent name selector
- command accepts `--task` only alongside an exact selector and uses it to print the full stored launch instruction
- command loads `.switchyard/config.yaml` from the canonical repo root
- command reads durable session state from `sessions.db`
- without a selector, command reads and renders all recorded sessions ordered by operator follow-up priority first and then by the freshest operator-visible activity inside each follow-up bucket
- with a selector, command resolves one session by id or normalized agent name and renders only that session
- command accepts an exact session id before agent-name normalization, even when that selector is not a valid normalized agent name
- command rejects selectors that match one session by id and a different session by normalized agent name
- command rejects selectors that match multiple sessions by normalized agent name and requires an exact session id instead
- command promotes `starting` sessions to `running` when the first pid liveness check succeeds
- command marks early-dead `starting` sessions as `failed`
- command marks obviously stale pid-backed `running` sessions as `failed`
- on Unix-like platforms, command treats zombie runtime pids as stale dead sessions and records `process_state_zombie` in the reconciliation reason
- command records durable runtime reconciliation events when it changes session state
- with a selector, command only reconciles that targeted session before rendering
- command prefers the freshly reconciled lifecycle event in the current table output even if event persistence fails
- command includes the durable session id in the main status table so later commands can target an exact session
- command includes one best-effort unread-mail count per session from `mail.db`
- if unread mail counts cannot be loaded, command still renders status and prints `?` in the unread column instead of failing
- command includes one cleanup-readiness label per session based on the same merged-cleanup rules enforced by `sy stop --cleanup`
- command includes one best-effort latest-run task summary per session from `runs.db`
- command includes one best-effort latest-run state summary per session from `runs.db`
- command uses the newest durable event or unread inbound operator mail timestamp for the `UPDATED` column when that activity is newer than the stored `sessions.db` row timestamp
- command also derives a passive stalled-session hint for active sessions when the latest agent/runtime-side activity is older than the stalled threshold, without mutating durable session state
- command includes one derived best-effort follow-up signal per session so concurrent sessions stay readable as `mail`, `wait`, `review-merge`, `cleanup`, `inspect`, or `done`
- when unread mailbox items addressed to `operator` exist for a session, command prioritizes `mail` over the more generic lifecycle follow-up hint
- when a session is passively stalled and no higher-priority unread inbound operator mail exists, command surfaces `inspect` as the follow-up hint instead of `wait`
- when unread mailbox items addressed to `operator` exist for a session, command also surfaces a synthesized `mail.unread` recent summary from the newest unread inbound message instead of leaving `RECENT` focused on a less actionable lifecycle event
- command keeps the stalled idle clock separate from `UPDATED`, so newer operator-visible diagnostics can stay in the `UPDATED` column without resetting passive stalled detection
- when a stalled-session hint exists, command appends `runtime.stalled idleFor=...` to the chosen `RECENT` summary instead of replacing a higher-value concrete summary such as `mail.unread`, `stop.failed`, or `merge.failed`
- operator-only activity such as `mail.sent`, `mail.checked`, and `mail.listed` does not reset the stalled idle clock
- if run summaries cannot be loaded, command still renders status and prints `?` in both the task and run columns instead of failing
- active sessions show the post-stop cleanup result with a `stop-then:` prefix instead of hiding whether cleanup would be merged-safe or abandon-only
- command surfaces partial preserved-artifact loss in that cleanup-readiness label when the branch still exists but the preserved worktree is already missing
- command keeps that missing-worktree case distinct in recent stop-event history instead of collapsing it into the harmless already-absent case
- if cleanup readiness cannot be evaluated for a session, command still renders status and prints `?` in the cleanup column instead of failing
- command keeps operator-relevant `merge.failed` context in the recent-event summary, including branch-drift targets, preserved-worktree paths, and git error text when those details exist
- command keeps operator-relevant `stop.failed` context in the recent-event summary, including shutdown failure reason, runtime pid, and error text when those details exist
- command keeps operator-relevant `stop.completed` cleanup mode in the recent-event summary so later status inspection still shows whether cleanup happened after a confirmed merge or an explicit abandon
- when the same `sy status` run also records an automatic runtime reconciliation event, command still keeps a latest pre-existing `stop.failed` visible in the current recent summary instead of immediately replacing it with that synthetic runtime event
- with a selector, command prints a short detail block ahead of the one-row table that surfaces the stored `baseBranch`, current `runtimePid`, latest stored launch command, creation time, latest launch task summary, latest launch spec path, unread-mail count, cleanup-readiness label, latest run summary, the derived follow-up signal, and the full recent-event summary
- with `--task` plus a selector, command also prints the full stored launch instruction from `.switchyard/specs/`
- command rejects `--task` without an exact selector
- command fails explicitly when `--task` is requested but the stored task text cannot be read
- when no sessions exist, print `No Switchyard sessions recorded yet.`
- when sessions exist, print a concise tab-separated table with the most actionable follow-up rows first and the freshest operator-visible activity first within the same follow-up bucket, including `TASK`, `RUN`, and `NEXT` columns
- within the `mail` follow-up bucket, order rows by the newest unread inbound mail before falling back to the derived activity timestamp and then session recency
- the current follow-up ordering is operator-first: `mail`, `inspect`, `review-merge`, `cleanup`, `wait`, `done`, then `-`

Future target:
- show concise operator-friendly status for active and recent sessions

## `sy events [session]`

Current contract:
- command exists and accepts one optional session id or agent name selector
- command accepts `--limit <count>` to control the size of the recent-event window
- without a selector, command reads the recent durable event timeline from `events.db`
- with a selector, command resolves one session, one orphaned session-id event stream, or one orphaned agent-name event stream when no tracked session row remains
- launch events from `sy sling` carry task handoff metadata such as `taskSummary` and `taskSpecPath`
- command rejects selectors that could refer to different session-id, agent-name, or orphaned-event targets
- command rejects selectors that match multiple sessions by normalized agent name and requires an exact session id instead
- command rejects orphaned agent-name selectors that would combine events from multiple session ids and requires an exact session id instead
- command rejects non-positive or non-integer `--limit` values with an explicit events-style error
- when no events exist globally, print `No Switchyard events recorded yet.`
- when a selected tracked session has no events yet, print the resolved session id in that empty-state output
- when events exist, print a concise tab-separated table ordered chronologically across the recent window

Future target:
- add richer inspection output only if the narrow event timeline proves insufficient
- avoid broad filtering until operator workflows demand it

## `sy stop <session>`

Current contract:
- command resolves one session by id or normalized agent name
- command rejects selectors that match one session by id and a different session by normalized agent name
- command rejects selectors that match multiple sessions by normalized agent name and requires an exact session id instead
- command stops one active pid-backed runtime cleanly
- on Unix-like platforms, command treats zombie runtime pids as already not running instead of timing out against an unreapable stale pid
- command updates durable session state in `sessions.db`
- command prints the durable session id in handled operator-facing success paths so later `events`, `merge`, or cleanup commands can target the preserved session directly
- command also prints the resolved durable session id before failing when a repeated stop targets an already inactive session
- command preserves the worktree by default so the operator can still review or merge the branch later
- command still stops an active session even when a requested cleanup cannot proceed safely
- if runtime shutdown fails before state changes, command leaves the session active and records a durable `stop.failed` event with the failure reason and error text
- if cleanup artifact removal fails after the stop state is already known, command still prints the resolved session id and handled stop summary before exiting nonzero
- command removes the worktree and branch when `--cleanup` is passed only if the preserved branch is confirmed merged into the session's stored `baseBranch`
- command refuses plain merged-cleanup for legacy rows that do not have stored `baseBranch` metadata
- command requires `--cleanup --abandon` to discard work that is not confirmed merged
- command rejects `--abandon` unless `--cleanup` is also set
- command reports already-absent artifacts as already absent instead of reporting a removal that did not happen
- command refuses plain cleanup when the preserved branch still exists but the preserved worktree path is already missing, and tells the operator to restore it manually or use explicit abandon
- command records that missing-worktree refusal distinctly from the fully-absent branch-plus-worktree case in durable `stop.completed` history
- command records a durable `stop.completed` event with cleanup failure details when cleanup is blocked or artifact removal fails after the stop state is already known
- when the latest run record exists, command updates it to a terminal outcome such as `stopped`, `failed`, `merged`, or `abandoned` when the task outcome becomes clear

Future target:
- revisit alternate runtime control only if the pid-based path proves too narrow in real operator workflows
- refine stale-runtime handling further only if a real operator workflow reproduces pid reuse or another false-positive liveness case

## `sy merge <session>`

Current contract:
- command resolves one session by id or normalized agent name
- command rejects selectors that match one session by id and a different session by normalized agent name
- command rejects selectors that match multiple sessions by normalized agent name and requires an exact session id instead
- command refuses active sessions and only merges preserved work
- command refuses legacy rows that do not have stored `baseBranch` metadata
- command refuses to silently retarget preserved work when the session `baseBranch` differs from the current configured canonical branch
- command verifies that the preserved worktree path still resolves to the expected git worktree root
- command refuses dirty preserved worktrees so uncommitted agent changes are resolved before merge or cleanup
- command reports the blocking git status entries when the preserved worktree is dirty
- command refuses to start when the canonical repo-root worktree already has an in-progress merge and points the operator to resolve it or run `git merge --abort`
- command requires the canonical repo-root worktree to be clean before it switches branches
- command reports the blocking git status entries when the repo root is dirty
- command verifies the preserved local branch still exists
- command switches the repo root to the configured canonical branch when needed
- command runs `git merge --no-ff <agent-branch>` from the repo root
- command prints the resolved durable session id in operator-facing handled output, including merge-conflict and other session-scoped failure paths, so later follow-up commands can reuse the exact preserved session
- command records durable merge events for success, already-integrated no-op merges, session-scoped preflight refusals, and git-stopped conflict states
- on success and already-integrated no-op merges, command updates the latest run outcome to `merged` when that run exists
- command leaves conflict resolution, validation, and cleanup explicit for the operator

Future target:
- improve cleanup ergonomics only if the first merge path exposes a real operator risk
- broaden merge automation only if the explicit operator-visible path proves insufficient

## Merge And Reintegration

Current contract:
- operators should stop sessions without `--cleanup` before reintegration
- operators should review the preserved `agents/*` branch and worktree with normal git and project checks
- operators may run `sy merge <session>` to execute the documented repo-root merge path
- each preserved session retains its original target branch as `baseBranch`, and Switchyard refuses to silently retarget it if `.switchyard/config.yaml` now points somewhere else
- operators may still use normal git directly when they intentionally want the manual path
- operators should run `sy stop <session> --cleanup` only after a successful merge
- operators should run `sy stop <session> --cleanup --abandon` only after an explicit abandon decision

Future target:
- broaden mail semantics only if operator usage justifies it

## `sy mail`

Current contract:
- command has `send`, `check`, and `list` subcommands
- `sy mail send <session> [body]` resolves one session by id or normalized agent name
- `sy mail send <session> --body-file <path>` reads the exact message body from a file relative to the invocation directory
- `sy mail send` requires exactly one body source: positional `<body>` or `--body-file <path>`
- mail commands accept an exact session id even when that selector would not be a valid normalized agent name
- mail commands reject selectors that match multiple sessions by normalized agent name and require an exact session id instead
- `sy mail send` writes one durable record into `mail.db`
- `sy mail send` preserves the exact provided body text while still rejecting whitespace-only input
- `sy mail send` fails explicitly when the requested body file cannot be read
- `sy mail send` prints the resolved session id and generated mail id in operator-facing output
- `sy mail check <session>` reads unread mail for one resolved session
- `sy mail check` prints the resolved session id in operator-facing output, including the empty-unread case
- `sy mail check` prints each returned message body as an explicit `Body:` block
- `sy mail check` marks returned messages as read
- `sy mail list <session>` reads the full mailbox for one resolved session
- `sy mail list <session> --unread` reads only unread mail for one resolved session
- `sy mail list` prints the resolved session id in operator-facing output, including empty mailbox views
- `sy mail list` prints each returned message body as an explicit `Body:` block
- `sy mail list` does not change read state
- `sy mail list --unread` does not change read state
- mail commands reject selectors that match one session by id and a different session by normalized agent name

Future target:
- support simple durable operator/agent messaging
- keep the early surface intentionally small
- broaden beyond the current send/check/list/`list --unread` split only when operator usage justifies it

## Priority Order

When the contract and implementation diverge, prefer fixing the implementation if the contract still matches the project goal. If the product direction changes, update this file in the same session.
