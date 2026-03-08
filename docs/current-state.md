# Current State

## Snapshot

This repository is still in the setup phase. The codebase has enough structure to support iterative work, but not enough implemented behavior to be considered a usable orchestration tool yet.

## What Exists

- TypeScript Node CLI scaffold
- `sy` entrypoint with command registration
- implemented `sy init`
- implemented `sy status`
- implemented `sy sling`
- placeholder `sy stop` and `sy mail`
- repo root detection that handles nested directories and git worktrees
- canonical branch detection that prefers `origin/HEAD`
- config loading that normalizes `project.root` to the canonical repo root
- `.switchyard/` bootstrap for directories and placeholder database files
- session store with schema ownership for `sessions.db`
- worktree manager with deterministic branch and path naming
- narrow Codex runtime seam that builds and spawns one detached command
- regression tests around config/root behavior, worktree creation, session persistence, and command parsing

## What Does Not Exist Yet

- tmux control
- real `stop` or `mail` behavior
- event storage or inspection commands
- merge workflow

## Current Command Surface

- `sy init`
  - works inside a git repository
  - writes `.switchyard/config.yaml`
  - creates the initial `.switchyard/` layout
- `sy sling [args...]`
  - requires an agent name
  - creates one deterministic branch under `agents/`
  - creates one worktree under `.switchyard/worktrees/`
  - spawns one Codex process from that worktree
  - persists one session record as `running`
- `sy status [args...]`
  - loads config and session state
  - prints an empty-state message when no sessions exist
  - prints a tab-separated session table ordered by most recent update
- `sy stop [args...]`
  - placeholder only
- `sy mail [args...]`
  - placeholder only

## Current Risks

- `src/config.ts` is carrying both config logic and git root-resolution behavior; that should eventually split once lifecycle code grows further.
- `node:sqlite` is still experimental in Node 25, so the SQLite choice may need revision if core API churn becomes painful.
- there is no end-to-end test around `sy init`.
- the session schema does not yet record pid or tmux metadata, which may force changes during `sy stop`.
- `sy sling` creates detached runtime state, but `sy status` does not verify liveness yet.

## Recommended Next Task

Implement the first real stop path:
- add liveness lookup for the spawned runtime
- replace the `sy stop` placeholder
- define cleanup behavior for stopped worktrees

That closes the core lifecycle loop instead of adding more passive storage work.

## How To Use This File

Update this document whenever one of these changes:
- a placeholder command becomes real
- a new subsystem starts owning persistent state
- an important architectural assumption is changed
- the recommended next task changes
