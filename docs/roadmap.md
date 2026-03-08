# Roadmap

## Current Milestone

Switchyard is through the first operator-loop milestones:
- M1 scaffold is effectively present
- M2 repo bootstrap is effectively complete
- M3 session persistence is effectively complete
- M4 agent spawn is now minimally real for one Codex session
- M5 lifecycle control is minimally real
- M6 messaging is now minimally real
- later milestones remain design targets, not implementation commitments

## Near-Term Rule

The next sessions should optimize for a single reliable operator workflow:
1. initialize a repo
2. spawn one Codex agent in a worktree
3. track it durably
4. inspect status
5. stop it cleanly
6. exchange one durable mail message

If a change does not move that workflow forward or reduce meaningful risk inside it, it is probably too early.

## Recommended Next Slice

Expose one narrow operator-facing event inspection path:
- read recent lifecycle events from `events.db`
- keep output focused on the core operator loop
- use the existing event writes from sling, stop, and mail

Why this is next:
- the repo now has a real durable event timeline, but no CLI view over it
- the next missing operator-confidence primitive is a narrow read path
- observability can advance diagnosis without dragging runtime control into a larger redesign

## Order After That

1. richer status and inspection over the new event timeline
2. tmux or richer runtime metadata only if the pid-based stop path proves too narrow
3. merge and reintegration workflow
4. broader mail semantics only if operator usage demands them

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
