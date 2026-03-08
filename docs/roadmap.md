# Roadmap

## Current Milestone

Switchyard is through the first operator-loop milestones:
- M1 scaffold is effectively present
- M2 repo bootstrap is effectively complete
- M3 session persistence is effectively complete
- M4 agent spawn is now minimally real for one Codex session
- M5 lifecycle control is minimally real
- M6 messaging is now minimally real
- M7 event inspection is now minimally real
- later milestones remain design targets, not implementation commitments

## Near-Term Rule

The next sessions should optimize for a single reliable operator workflow:
1. initialize a repo
2. spawn one Codex agent in a worktree
3. track it durably
4. inspect status
5. inspect recent events
6. stop it cleanly
7. exchange one durable mail message

If a change does not move that workflow forward or reduce meaningful risk inside it, it is probably too early.

## Recommended Next Slice

Decide whether pid-only lifecycle control is sufficient for v0 or whether tmux needs to land next:
- evaluate the current spawn/status/stop guarantees against concrete operator needs
- make the decision explicit in docs or an ADR
- keep the scope narrow to one repo-local Codex workflow

Why this is next:
- the launch boundary is now clearer, so the biggest unresolved lifecycle assumption is runtime control
- the current stop path is still pid-based only, but tmux remains an open decision rather than an explicit choice
- resolving that decision reduces risk before merge or broader lifecycle work adds more surface area

## Order After That

1. decide whether tmux or richer runtime metadata is necessary beyond the pid-based stop path
2. merge and reintegration workflow
3. broader mail semantics only if operator usage demands them

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
- whether the pid-based stop path is sufficient before tmux-backed control is added
