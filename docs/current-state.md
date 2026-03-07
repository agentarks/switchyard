# Current State

## Snapshot

This repository is still in the setup phase. The codebase has enough structure to support iterative work, but not enough implemented behavior to be considered a usable orchestration tool yet.

## What Exists

- TypeScript Node CLI scaffold
- `sy` entrypoint with command registration
- implemented `sy init`
- implemented `sy status`
- placeholder `sy sling`, `sy stop`, and `sy mail`
- repo root detection that handles nested directories and git worktrees
- canonical branch detection that prefers `origin/HEAD`
- config loading that normalizes `project.root` to the canonical repo root
- `.switchyard/` bootstrap for directories and placeholder database files
- session store with schema ownership for `sessions.db`
- regression tests around config/root behavior, session persistence, and command parsing

## What Does Not Exist Yet

- worktree manager
- Codex runtime adapter
- process spawning and tmux control
- real `stop` or `mail` behavior
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
  - loads config and session state
  - prints an empty-state message when no sessions exist
  - prints a tab-separated session table ordered by most recent update
- `sy stop [args...]`
  - placeholder only
- `sy mail [args...]`
  - placeholder only

## Current Risks

- `src/config.ts` is carrying both config logic and git root-resolution behavior; that should eventually split once worktree/runtime code arrives.
- `node:sqlite` is still experimental in Node 25, so the SQLite choice may need revision if core API churn becomes painful.
- there is no end-to-end test around `sy init`.
- runtime/process decisions are still mostly architectural intent rather than code.

## Recommended Next Task

Implement the first real worktree path:
- create a worktree manager module
- define deterministic branch and worktree naming rules
- start wiring the first real `sy sling`
- persist one created session from `sy sling`

That keeps momentum on the first end-to-end operator loop instead of adding more passive storage work.

## How To Use This File

Update this document whenever one of these changes:
- a placeholder command becomes real
- a new subsystem starts owning persistent state
- an important architectural assumption is changed
- the recommended next task changes
