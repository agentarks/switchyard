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

Validate whether merge or recovery work needs richer session metadata:
- add metadata only when a concrete operator workflow proves the current stored state is insufficient
- keep the change narrow and operator-readable instead of broadening schema or reporting preemptively
- avoid broad inspection features while the current repo-local loop is still the target

Why this is next:
- selector precedence is now explicit in the inspection path, so the next question is whether recovery work still lacks any concrete context
- broader metadata should be justified by real merge or recovery pressure, not added speculatively
- validating the current state shape is a better next use of scope than expanding schema without evidence

## Order After That

1. broader mail semantics only if the current send/check/list split still proves insufficient
2. improve diagnostics only if operator workflows require them
3. broader runtime breadth only if the current Codex-first loop stops being the right constraint

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
