# Roadmap

## Current Milestone

Switchyard is in early scaffold/bootstrap territory:
- M1 scaffold is effectively present
- M2 repo bootstrap is in progress
- later milestones remain design targets, not implementation commitments

## Near-Term Rule

The next sessions should optimize for a single reliable operator workflow:
1. initialize a repo
2. spawn one Codex agent in a worktree
3. track it durably
4. inspect status
5. stop it cleanly

If a change does not move that workflow forward or reduce meaningful risk inside it, it is probably too early.

## Recommended Next Slice

Build session persistence before real agent spawning:
- add a store module that owns schema creation for `sessions.db`
- define the first persisted session record shape
- add read/write/list operations with tests
- keep the schema intentionally small

Why this is next:
- `status`, `stop`, and later `mail` all depend on durable session state
- it keeps `sy init` lightweight and avoids premature runtime/process coupling
- it creates a concrete seam for later worktree and tmux integration

## Order After That

1. session store and basic `sy status`
2. worktree manager
3. Codex runtime spawn path for one worker
4. `sy stop` with liveness and cleanup rules
5. mail store and basic operator messaging
6. events and richer inspection

## Explicitly Deferred

Do not prioritize these yet:
- multiple runtimes beyond Codex
- background watchdog daemons
- coordinator or supervisor hierarchies
- dashboard or TUI work
- merge queue automation
- AI-assisted merge resolution
- ecosystem bootstrapping of sibling tools

## Decision Gates

Before moving past the core lifecycle, resolve these with code or an ADR:
- whether Node built-ins remain sufficient for SQLite
- whether tmux is a hard dependency for v1
- whether mail truly belongs in MVP or should follow spawn/status/stop
- where git helpers should live once `config.ts` starts growing again
