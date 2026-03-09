# Roadmap

## Current Milestone

Switchyard is through the first operator-loop milestones:
- M1 scaffold is effectively present
- M2 repo bootstrap is effectively complete
- M3 session persistence is effectively complete
- M4 agent spawn is now minimally real for one Codex session
- M5 lifecycle control is minimally real
- M6 messaging is now minimally real
- read-only mailbox inspection is now minimally real inside the messaging path
- M7 event inspection is now minimally real
- first merge and reintegration CLI path is now minimally real
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

Clarify selector behavior in operator inspection paths:
- make ambiguous session selectors more explicit where raw ids and agent names can overlap
- keep the change narrow and operator-readable instead of adding broader filtering
- avoid broad inspection features while the current repo-local loop is still the target

Why this is next:
- the mail path is now less awkward, so the most concrete remaining operator ambiguity is selector precedence
- the ambiguity already appears in the current `sy events <selector>` behavior and can mislead inspection work
- tightening selector semantics is a better next use of scope than adding broader metadata or filtering without evidence

## Order After That

1. add richer session metadata only if merge or recovery work truly needs it
2. broader mail semantics only if the current send/check/list split still proves insufficient
3. improve diagnostics only if operator workflows require them

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
