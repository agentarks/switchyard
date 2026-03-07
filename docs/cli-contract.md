# CLI Contract

This file defines the expected user-facing behavior of the early Switchyard CLI. It is the contract future sessions should preserve unless there is a deliberate product decision to change it.

## Global Rules

- The CLI name is `sy`.
- Commands should work when invoked from the repository root, a nested subdirectory, or a git worktree unless the command explicitly requires otherwise.
- Failures should be explicit and operator-readable.
- JSON output can wait until the underlying command behavior is stable.
- Placeholder commands may accept future-looking arguments, but they should fail only when behavior is actually unsupported, not because the parser shape is too narrow.

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
- command exists and accepts positional arguments
- command is a placeholder until worktree/session/runtime behavior is implemented
- current output should make it clear the command is planned but not implemented

Future target:
- create one isolated worktree
- prepare one Codex worker session
- persist one session record

## `sy status [args...]`

Current contract:
- command exists and accepts positional arguments reserved for future filters
- command loads `.switchyard/config.yaml` from the canonical repo root
- command reads durable session state from `sessions.db`
- when no sessions exist, print `No Switchyard sessions recorded yet.`
- when sessions exist, print a concise tab-separated table ordered by most recent update

Future target:
- check liveness where needed
- show concise operator-friendly status for active and recent sessions

## `sy stop [args...]`

Current contract:
- command exists and accepts positional arguments
- command is a placeholder until process/session control exists

Future target:
- stop a running agent cleanly
- update durable session state
- optionally clean up worktree state later

## `sy mail [args...]`

Current contract:
- command exists and accepts positional arguments
- command is a placeholder until mail storage and command behavior exist

Future target:
- support simple durable operator/agent messaging
- keep the early surface intentionally small

## Priority Order

When the contract and implementation diverge, prefer fixing the implementation if the contract still matches the project goal. If the product direction changes, update this file in the same session.
