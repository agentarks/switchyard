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

Improve status and inspection output with event context:
- connect the session table to the new event timeline
- keep output focused on the core operator loop
- use the existing event writes from sling, stop, and mail to explain state changes

Why this is next:
- the repo now has a narrow CLI view over the durable event timeline
- status and inspection are still split across separate mental models
- the next operator-confidence gain is explaining recent state through event context without expanding runtime control

## Order After That

1. tmux or richer runtime metadata only if the pid-based stop path proves too narrow
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
