# Contributing

Switchyard is intentionally early and narrow. Contribute toward a working Codex-first orchestration loop, not a feature-complete Overstory clone.

## Project Posture

Use these rules when deciding whether to add or defer something:
- borrow mechanics from Overstory, not product breadth
- prefer explicit local state over hidden automation
- keep the MVP focused on `init`, `sling`, `status`, `mail`, and `stop`
- build milestone-bundled changes that become operator-usable early
- add regression tests for git, worktree, and path edge cases as soon as they appear

## Development Commands

- `npm run build`
- `npm run check`
- `npm run typecheck`
- `npm test`

If a change affects CLI behavior, run `npm run check` before closing the session.

## Working Agreement

- Keep runtime assumptions narrow unless there is a clear user need to generalize.
- Treat `.switchyard/` as repo-local durable state, even when commands are run from nested directories or git worktrees.
- Prefer stable Node APIs in core paths. Experimental APIs need a strong reason and should be isolated.
- Keep CLI commands operator-first: explicit inputs, explicit outputs, explicit failure modes.
- When fixing a bug, add or update a regression test in the same session if possible.
- Once the active milestone is clear, batch adjacent in-scope work instead of reopening "what is the next slice?" before every change.

## Source Layout Direction

The current scaffold is intentionally small. As the codebase grows, keep responsibilities separated:
- `src/commands/` for CLI surfaces and argument parsing
- `src/config*` for config loading and normalization
- `src/git/` for git-specific helpers once they outgrow `config.ts`
- `src/storage/` for file/bootstrap/schema concerns
- `src/sessions/` for session persistence and queries
- `src/worktrees/` for worktree creation, naming, and cleanup
- `src/runtimes/codex/` for Codex-specific spawning behavior
- `src/test-helpers/` for temp repos, git fixtures, and shared test setup

Do not create broad subsystem directories before there is real code to justify them.

## Docs To Keep Updated

When the project state changes materially, update these files:
- `docs/current-state.md` for what exists now
- `docs/roadmap.md` for the next recommended slice
- `docs/next-steps.md` for the exact owner execution path for the current slice
- `docs/backlog.md` for the ordered task list beyond the immediate slice
- `docs/dev-workflow.md` when the recommended session workflow changes
- `docs/cli-contract.md` when command behavior or output expectations change
- `docs/decisions/` when a durable technical choice is made
- `docs/overstory-notes.md` when a Switchyard decision is informed by Overstory
- `PLAN.md` or `docs/architecture.md` when the actual product direction changes

## Pull Request Expectations

- keep PRs milestone-scoped
- prefer one reviewable milestone bundle per PR, not one tiny slice per PR
- batch adjacent in-scope follow-up work when it shares the same milestone, files, and operator workflow
- do not batch unrelated work that changes the milestone or broadens scope
- include example output in every PR for the operator-facing behavior you changed, especially for CLI output
- call out any new assumptions about git, tmux, SQLite, or Codex runtime behavior
- include file references and concrete behavior changes in review summaries
- note any untested risks explicitly if they remain
