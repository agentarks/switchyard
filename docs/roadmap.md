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
- M8 first readiness and early-failure handling is now minimally real
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

Define the first merge and reintegration workflow:
- evaluate how the current branch, worktree, status, and stop behavior should lead into a merge step
- make the workflow explicit in docs and the CLI contract
- keep the first answer narrow, manual-first, and grounded in one repo-local Codex workflow

Why this is next:
- runtime control is now explicit enough for v0, so the next missing operator step is reintegration
- agent branches and worktrees now exist durably, but the repo still lacks a defined path for bringing useful work back
- resolving that workflow reduces risk before later merge automation adds more surface area

## Order After That

1. implement the smallest merge path that matches the documented workflow
2. add richer session metadata only if merge or recovery work truly needs it
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
- what the first operator-readable merge workflow is
- whether merge or recovery work truly needs richer session metadata
