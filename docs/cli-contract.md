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
- command requires one `<agent>` argument and accepts additional positional runtime args
- command loads config from the canonical repo root
- command creates one deterministic branch and worktree under `.switchyard/worktrees/`
- command starts one detached Codex process from that worktree
- on supported Unix platforms, detached launch uses the system `script` utility so Codex startup still gets a pseudo-terminal
- command persists one `starting` session record in `sessions.db`, including the original canonical branch as session `baseBranch`
- command records `sling.spawned` when the runtime pid exists
- command records `sling.completed` after the initial launch window succeeds
- if Codex exits during the launch window, command records `sling.failed` with the launch error and leaves the session failed instead of pretending the launch succeeded
- command prints the launch state, created branch, base branch, worktree path, runtime command line, and initial readiness delay
- if the `script` wrapper is unavailable on a supported platform, command fails explicitly instead of pretending the launch succeeded
- on unsupported platforms, detached launch falls back to direct Codex spawn

Future target:
- add richer task/instruction inputs
- add richer runtime metadata only if operator workflows require attach or transcript inspection

## `sy status [session]`

Current contract:
- command accepts one optional session id or agent name selector
- command loads `.switchyard/config.yaml` from the canonical repo root
- command reads durable session state from `sessions.db`
- without a selector, command reads and renders all recorded sessions ordered by most recent update
- with a selector, command resolves one session by id or normalized agent name and renders only that session
- command accepts an exact session id before agent-name normalization, even when that selector is not a valid normalized agent name
- command rejects selectors that match one session by id and a different session by normalized agent name
- command rejects selectors that match multiple sessions by normalized agent name and requires an exact session id instead
- command promotes `starting` sessions to `running` when the first pid liveness check succeeds
- command marks early-dead `starting` sessions as `failed`
- command marks obviously stale pid-backed `running` sessions as `failed`
- command records durable runtime reconciliation events when it changes session state
- with a selector, command only reconciles that targeted session before rendering
- command prefers the freshly reconciled lifecycle event in the current table output even if event persistence fails
- command includes the durable session id in the main status table so later commands can target an exact session
- command includes one best-effort unread-mail count per session from `mail.db`
- if unread mail counts cannot be loaded, command still renders status and prints `?` in the unread column instead of failing
- command includes one cleanup-readiness label per session based on the same merged-cleanup rules enforced by `sy stop --cleanup`
- if cleanup readiness cannot be evaluated for a session, command still renders status and prints `?` in the cleanup column instead of failing
- when no sessions exist, print `No Switchyard sessions recorded yet.`
- when sessions exist, print a concise tab-separated table ordered by most recent update

Future target:
- show concise operator-friendly status for active and recent sessions

## `sy events [session]`

Current contract:
- command exists and accepts one optional session id or agent name selector
- command accepts `--limit <count>` to control the size of the recent-event window
- without a selector, command reads the recent durable event timeline from `events.db`
- with a selector, command resolves one session or one orphaned session-id event stream and reads recent events for that target
- command rejects selectors that could refer to different session-id, agent-name, or orphaned-event targets
- command rejects selectors that match multiple sessions by normalized agent name and requires an exact session id instead
- command rejects non-positive or non-integer `--limit` values with an explicit events-style error
- when no events exist globally, print `No Switchyard events recorded yet.`
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
- command updates durable session state in `sessions.db`
- command preserves the worktree by default so the operator can still review or merge the branch later
- command still stops an active session even when a requested cleanup cannot proceed safely
- command removes the worktree and branch when `--cleanup` is passed only if the preserved branch is confirmed merged into the session's stored `baseBranch`
- command refuses plain merged-cleanup for legacy rows that do not have stored `baseBranch` metadata
- command requires `--cleanup --abandon` to discard work that is not confirmed merged
- command rejects `--abandon` unless `--cleanup` is also set
- command reports already-absent artifacts as already absent instead of reporting a removal that did not happen

Future target:
- revisit alternate runtime control only if the pid-based path proves too narrow in real operator workflows
- refine operator-facing output around stale or missing runtime state

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
- command records durable merge events for success, already-integrated no-op merges, and git-stopped conflict states
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
- `sy mail send <session> <body>` resolves one session by id or normalized agent name
- mail commands accept an exact session id even when that selector would not be a valid normalized agent name
- mail commands reject selectors that match multiple sessions by normalized agent name and require an exact session id instead
- `sy mail send` writes one durable record into `mail.db`
- `sy mail check <session>` reads unread mail for one resolved session
- `sy mail check` marks returned messages as read
- `sy mail list <session>` reads the full mailbox for one resolved session
- `sy mail list <session> --unread` reads only unread mail for one resolved session
- `sy mail list` does not change read state
- `sy mail list --unread` does not change read state
- mail commands reject selectors that match one session by id and a different session by normalized agent name

Future target:
- support simple durable operator/agent messaging
- keep the early surface intentionally small
- broaden beyond the current send/check/list/`list --unread` split only when operator usage justifies it

## Priority Order

When the contract and implementation diverge, prefer fixing the implementation if the contract still matches the project goal. If the product direction changes, update this file in the same session.
