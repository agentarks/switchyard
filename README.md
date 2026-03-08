# switchyard

Multi-agent orchestration for coding agents.

Switchyard is a very early-stage custom fork in the Overstory problem space, but with a narrower target:
- Node-first
- Codex-first
- CLI-first
- one repository at a time

Current status:
- `sy init` is implemented
- `sy events` shows the recent durable lifecycle timeline, globally or for one session
- `sy sling` creates one worktree-backed Codex session and persists it
- `sy status` is implemented with SQLite-backed session state and narrow liveness checks
- `sy stop` stops one tracked session and supports optional `--cleanup`
- `sy mail send` and `sy mail check` now provide one durable session-targeted mail path
- `sy sling`, `sy stop`, and `sy mail` now append narrow lifecycle events to `events.db`
- config, worktree, session-store, mail-store, sling, status, stop, and mail regression tests are in place

Development:
- `npm run build`
- `npm run check`
- `npm run typecheck`
- `npm test`

Project docs:
- `PLAN.md`
- `docs/architecture.md`
- `docs/milestones.md`
- `docs/roadmap.md`
- `docs/current-state.md`
- `docs/next-steps.md`
- `docs/backlog.md`
- `docs/dev-workflow.md`
- `docs/cli-contract.md`
- `docs/decisions/`
- `docs/overstory-notes.md`
- `CONTRIBUTING.md`
