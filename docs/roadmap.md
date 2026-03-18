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
- read-only unread-only mailbox inspection is now minimally real inside the messaging path
- status-level unread mailbox visibility is now minimally real inside the inspection path
- M7 event inspection is now minimally real
- first merge and reintegration CLI path is now minimally real
- merge-target metadata retention for canonical-branch drift is now minimally real
- first readiness and early-failure handling are now minimally real as hardening work ahead of M8
- end-to-end repo-bootstrap regression coverage for `sy init` is now minimally real
- first-class task input for `sy sling` is now minimally real, including durable spec handoff files
- later milestones remain design targets, not implementation commitments

## Strategic Direction

Switchyard is not trying to stay permanently smaller than Overstory.

The strategy is:
1. prove a tighter Codex-first operator loop first
2. make that loop easy to understand and recover
3. expand only after the current layer is mechanically reliable
4. eventually exceed the Overstory-inspired baseline in operator clarity, reliability, and orchestration usefulness

That means "start smaller" is a sequencing choice, not the end state.

## Near-Term Rule

The next sessions should optimize for a single reliable operator workflow that now runs through reintegration and closure:
1. initialize a repo
2. spawn one Codex agent in a worktree
3. track it durably
4. inspect status
5. inspect recent events
6. review what a finished task produced
7. merge or abandon it cleanly
8. retain enough history to understand the session after closure

If a change does not move that workflow forward or reduce meaningful risk inside it, it is probably too early.

That rule exists to build a stronger base for later breadth, not to permanently cap the product at one agent forever.

## Current Milestone

The bounded runtime baseline is now stable enough for the current phase.

What to do next:
- finish reintegration and operator closure for the current v0 workflow
- keep runtime work in a supporting role unless a concrete failure disproves the current bounded model
- execute milestone bundles that move the operator from `task finished` to `session closed`
- treat reintegration decision support, exact-session summaries, and artifact history as now materially real, and focus next only on narrow hardening where ambiguity remains

## Order After That

1. add only narrow reintegration hardening where the new review assessment, summary, or artifact history still leaves operator ambiguity
2. revisit broader runtime breadth or automation only after the reintegration milestone stops being the main constraint
3. preserve broader product breadth only where it does not weaken operator readability

## Explicitly Deferred

Do not prioritize these before the current proving path is real:
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

Before claiming Switchyard is outperforming the Overstory-inspired baseline, prove at least these:
- the operator can understand the latest run outcome without digging through raw events
- the operator can manage more than one delegated work stream without losing task or merge state
- added breadth does not reintroduce the same confusion and overhead the project set out to avoid
