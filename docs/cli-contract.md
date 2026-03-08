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
- command persists one `starting` session record in `sessions.db`
- command records `sling.spawned` when the runtime pid exists
- command records `sling.completed` after the initial launch window succeeds
- command prints the launch state, created branch, worktree path, runtime command line, and initial readiness delay

Future target:
- add richer task/instruction inputs
- add richer runtime metadata only if operator workflows require attach or transcript inspection

## `sy status [args...]`

Current contract:
- command exists and accepts positional arguments reserved for future filters
- command loads `.switchyard/config.yaml` from the canonical repo root
- command reads durable session state from `sessions.db`
- command promotes `starting` sessions to `running` when the first pid liveness check succeeds
- command marks early-dead `starting` sessions as `failed`
- command marks obviously stale pid-backed `running` sessions as `failed`
- command records durable runtime reconciliation events when it changes session state
- command prefers the freshly reconciled lifecycle event in the current table output even if event persistence fails
- when no sessions exist, print `No Switchyard sessions recorded yet.`
- when sessions exist, print a concise tab-separated table ordered by most recent update

Future target:
- show concise operator-friendly status for active and recent sessions

## `sy events [session]`

Current contract:
- command exists and accepts one optional session id or agent name selector
- without a selector, command reads the recent durable event timeline from `events.db`
- with a selector, command resolves one session and reads recent events for that session
- when no events exist globally, print `No Switchyard events recorded yet.`
- when events exist, print a concise tab-separated table ordered chronologically across the recent window

Future target:
- add richer inspection output only if the narrow event timeline proves insufficient
- avoid broad filtering until operator workflows demand it

## `sy stop <session>`

Current contract:
- command resolves one session by id or normalized agent name
- command stops one active pid-backed runtime cleanly
- command updates durable session state in `sessions.db`
- command preserves the worktree by default so the operator can still review or merge the branch later
- command removes the worktree and branch when `--cleanup` is passed

Future target:
- revisit alternate runtime control only if the pid-based path proves too narrow in real operator workflows
- refine operator-facing output around stale or missing runtime state

## `sy merge <session>`

Current contract:
- command resolves one session by id or normalized agent name
- command refuses active sessions and only merges preserved work
- command verifies that the preserved worktree path still resolves to the expected git worktree root
- command refuses dirty preserved worktrees so uncommitted agent changes are resolved before merge or cleanup
- command requires the canonical repo-root worktree to be clean before it switches branches
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
- operators may still use normal git directly when they intentionally want the manual path
- operators should run `sy stop <session> --cleanup` only after a successful merge or an explicit abandon decision

Future target:
- improve cleanup ergonomics only if the first merge path exposes a concrete operator risk

## `sy mail`

Current contract:
- command has `send` and `check` subcommands
- `sy mail send <session> <body>` resolves one session by id or normalized agent name
- `sy mail send` writes one durable record into `mail.db`
- `sy mail check <session>` reads unread mail for one resolved session
- `sy mail check` marks returned messages as read

Future target:
- support simple durable operator/agent messaging
- keep the early surface intentionally small
- expand beyond unread-only reads only when operator usage justifies it

## Priority Order

When the contract and implementation diverge, prefer fixing the implementation if the contract still matches the project goal. If the product direction changes, update this file in the same session.
