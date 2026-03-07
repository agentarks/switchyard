# Current State

## Snapshot

This repository is still in the setup phase. The codebase has enough structure to support iterative work, but not enough implemented behavior to be considered a usable orchestration tool yet.

## What Exists

- TypeScript Node CLI scaffold
- `sy` entrypoint with command registration
- implemented `sy init`
- placeholder `sy sling`, `sy status`, `sy stop`, and `sy mail`
- repo root detection that handles nested directories and git worktrees
- canonical branch detection that prefers `origin/HEAD`
- config loading that normalizes `project.root` to the active checkout
- `.switchyard/` bootstrap for directories and placeholder database files
- regression tests around config/root behavior and placeholder command parsing

## What Does Not Exist Yet

- session store with schema management and real queries
- worktree manager
- Codex runtime adapter
- process spawning and tmux control
- real `status`, `stop`, or `mail` behavior
- event storage or inspection commands
- merge workflow

## Current Command Surface

- `sy init`
  - works inside a git repository
  - writes `.switchyard/config.yaml`
  - creates the initial `.switchyard/` layout
- `sy sling [args...]`
  - placeholder only
- `sy status [args...]`
  - placeholder only
- `sy stop [args...]`
  - placeholder only
- `sy mail [args...]`
  - placeholder only

## Current Risks

- `src/config.ts` is carrying both config logic and git root-resolution behavior; that should eventually split once session/worktree code arrives.
- database files exist, but schema ownership has not been implemented yet.
- there is no end-to-end test around `sy init`.
- runtime/process decisions are still mostly architectural intent rather than code.

## Recommended Next Task

Implement the first real session store:
- create a storage module that initializes `sessions.db`
- define one small session record
- add insert and list operations
- wire `sy status` to read from it, even if spawn is still missing

That gives the repo its first persistent subsystem beyond config/bootstrap and reduces ambiguity for later work.

## How To Use This File

Update this document whenever one of these changes:
- a placeholder command becomes real
- a new subsystem starts owning persistent state
- an important architectural assumption is changed
- the recommended next task changes
