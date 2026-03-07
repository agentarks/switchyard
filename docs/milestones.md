# Milestones

## M0: Planning Approved

Deliverables:
- `PLAN.md`
- `docs/architecture.md`
- `docs/milestones.md`

Questions to resolve:
- SQLite implementation choice
- runtime target
- tmux requirement
- MVP command set

## M1: Project Scaffold

Deliverables:
- package metadata
- TypeScript config
- CLI entrypoint
- base source tree
- shared types and errors

Definition of done:
- project installs
- CLI runs
- empty commands can be invoked

## M2: Repo Bootstrap

Deliverables:
- `sy init`
- `.switchyard/` layout
- config loader with defaults
- repo root detection

Definition of done:
- any git repo can be initialized for Switchyard

## M3: Session Persistence

Deliverables:
- SQLite session store
- run store
- status querying

Definition of done:
- sessions can be stored and listed reliably

## M4: Agent Spawn

Deliverables:
- worktree manager
- tmux session creation
- runtime adapter skeleton
- `sy sling`

Definition of done:
- one agent can be launched into an isolated worktree and tracked

## M5: Lifecycle Control

Deliverables:
- `sy stop`
- liveness checks
- cleanup behavior

Definition of done:
- agents can be terminated cleanly and state stays consistent

## M6: Messaging

Deliverables:
- mail store
- `sy mail send`
- `sy mail check`
- message formatting

Definition of done:
- operator and agents can exchange durable lightweight messages

## M7: Observability

Deliverables:
- event store
- inspect/status improvements
- better error surfaces

Definition of done:
- common failures can be diagnosed from CLI output and stored events

## M8: Merge Workflow

Deliverables:
- merge queue
- controlled merge command
- conflict reporting

Definition of done:
- multiple work streams can be reintegrated deliberately

## Deferred

Not required for the first build:
- watchdog automation
- AI merge resolution
- web dashboard
- multi-repo orchestration
- broad runtime matrix
