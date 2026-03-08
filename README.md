# switchyard

Multi-agent orchestration for coding agents.

Switchyard is a very early-stage custom fork in the Overstory problem space, but with a narrower target:
- Node-first
- Codex-first
- CLI-first
- one repository at a time

Current status:
- `sy init` is implemented
- `sy sling` creates one worktree-backed Codex session and persists it
- `sy status` is implemented with SQLite-backed session state and narrow liveness checks
- `sy stop` stops one tracked session and supports optional `--cleanup`
- `sy mail` is still a placeholder
- config, worktree, session-store, sling, status, and stop regression tests are in place

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
