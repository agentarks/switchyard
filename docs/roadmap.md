# Roadmap

## Current Milestone

Switchyard is in early scaffold/bootstrap territory:
- M1 scaffold is effectively present
- M2 repo bootstrap is effectively complete
- M3 session persistence is effectively complete
- M4 agent spawn is now minimally real for one Codex session
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

Implement the first real stop and cleanup path:
- add a narrow liveness lookup for the spawned Codex session
- replace the `stop` placeholder with one-session lifecycle control
- define when worktrees remain on disk versus when they are removed

Why this is next:
- the repo can now initialize, spawn one session, and inspect it
- `sy stop` is the next missing step in the operator lifecycle
- stop/cleanup work will reveal whether the current session schema needs pid or tmux metadata

## Order After That

1. `sy stop` with liveness and cleanup rules
2. mail store and basic operator messaging
3. events and richer inspection
4. richer session metadata if lifecycle control requires it

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
- whether session records need pid/tmux fields before `stop` stabilizes
