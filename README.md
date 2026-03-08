# switchyard

Multi-agent orchestration for coding agents.

Switchyard is a very early-stage custom fork in the Overstory problem space, but with a narrower target:
- Node-first
- Codex-first
- CLI-first
- one repository at a time

Current status:
- `sy init` is implemented
- `sy status` is implemented with a minimal SQLite-backed session store
- `sy sling`, `sy stop`, and `sy mail` are still placeholders
- config, bootstrap, session-store, and status regression tests are in place

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
