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

No new slice is automatically next.

What to do instead:
- reassess whether the current loop needs another concrete operator-visible slice at all
- if one is needed, name it before coding and keep it grounded in the current repo-local loop
- do not default back to generic lifecycle hardening

## Order After That

1. improve diagnostics only if operator workflows require them
2. broader runtime breadth only if the current Codex-first loop stops being the right constraint

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
