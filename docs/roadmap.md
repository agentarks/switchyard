# Roadmap

## Current Milestone

Switchyard is in early scaffold/bootstrap territory:
- M1 scaffold is effectively present
- M2 repo bootstrap is effectively complete
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

Build the first real worktree and spawn path:
- add a worktree manager with deterministic naming rules
- keep `sy sling` narrow: one worktree, one runtime target, one persisted session
- reuse the existing session store instead of expanding storage scope

Why this is next:
- the repo now has durable session state and a real `sy status`
- `sy sling` is the next missing step in the operator lifecycle
- it tests whether the current session schema is sufficient before `stop` depends on it

## Order After That

1. worktree manager and naming rules
2. Codex runtime spawn path for one worker
3. wire `sy sling` to create and persist one session
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
