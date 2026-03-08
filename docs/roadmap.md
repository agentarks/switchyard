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

Implement the first real mail path:
- add schema ownership and helpers for `mail.db`
- replace the `mail` placeholder with one narrow send/check flow
- keep the surface small enough to revise after operator usage

Why this is next:
- the repo can now initialize, spawn one session, inspect it, and stop it cleanly
- `sy mail` is now the next missing MVP primitive
- mail can advance operator usefulness without dragging runtime control into a larger redesign

## Order After That

1. mail store and basic operator messaging
2. events and richer inspection
3. tmux or richer runtime metadata only if the pid-based stop path proves too narrow
4. merge and reintegration workflow

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
- whether the pid-based stop path is sufficient before tmux-backed control is added
