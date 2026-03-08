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
- first readiness and early-failure handling are now minimally real as hardening work ahead of M8
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

Implement the smallest merge path that matches the documented workflow:
- resolve one session to its preserved branch and configured canonical branch
- add the narrowest safe command surface for the current repo-local Codex loop
- keep review and conflict handling explicit instead of broadening automation

Why this is next:
- the merge contract is now explicit, so the next gap is executing it safely from the CLI
- agent branches and worktrees already exist durably, which gives `sy merge` enough state to start small
- implementing the narrow path should reveal whether richer metadata is actually needed or just theoretical

## Order After That

1. add richer session metadata only if merge or recovery work truly needs it
2. broader mail semantics only if operator usage demands them
3. improve merge cleanup ergonomics only if the first merge path exposes a real operator problem

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
- whether merge or recovery work truly needs richer session metadata
