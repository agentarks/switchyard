# Architecture Draft

## System Shape

Switchyard should be a local orchestration system for one repository at a time.

Main responsibilities:
- spawn coding agents in isolated worktrees
- track their lifecycle in durable state
- route lightweight messages between agents and operator
- expose status and inspection views
- provide a controlled merge path later

## Design Priorities

1. Local-first operation
2. Simple failure domains
3. Deterministic filesystem layout
4. Runtime abstraction without premature generalization
5. Human operator stays in control

## Proposed Runtime Model

Define a small runtime interface that covers:
- instruction file path
- spawn command and working directory
- detached-process metadata for lifecycle control
- readiness detection
- optional transcript discovery/parsing later if operator workflows require it

This keeps runtime-specific behavior out of orchestration code.

## Proposed Filesystem Layout

```text
.switchyard/
  config.yaml
  sessions.db
  mail.db
  events.db
  current-run.txt
  worktrees/
  logs/
  agents/
  specs/
```

Notes:
- SQLite stores should be local to the repo.
- worktrees should live under `.switchyard/worktrees/`.
- log paths should be stable and agent-scoped.

## Core Components

### CLI Layer

Responsible for:
- parsing commands and flags
- loading config
- routing to subsystem functions
- formatting human and JSON output

Planned early commands:
- `sy init`
- `sy sling`
- `sy status`
- `sy stop`
- `sy mail`

### Config Layer

Responsible for:
- finding the project root
- loading `.switchyard/config.yaml`
- validating required fields
- providing defaults

### Worktree Manager

Responsible for:
- creating worktrees
- naming branches deterministically
- listing worktrees
- removing worktrees safely

### Session Store

Responsible for:
- tracking agent identity and state
- storing runtime pid and other minimal launch metadata
- tracking parent/child relationships later
- supporting active and historical queries

Initial session states:
- `booting`
- `working`
- `completed`
- `stalled`
- `zombie`

### Process Manager

Responsible for:
- detached process spawn
- readiness waiting
- signal delivery
- liveness checks

This should remain separate from the worktree manager.

### Mail Store

Responsible for:
- simple inter-agent messages
- unread/read tracking
- thread grouping later if needed

Mail should stay intentionally small in v1.

### Event Store

Responsible for:
- append-only observability events
- timeline queries
- future diagnostics and watchdog support

This can start minimal and expand later.

## Data Model Direction

### Session

Suggested fields:
- `id`
- `agentName`
- `runtime`
- `capability`
- `taskId`
- `branchName`
- `worktreePath`
- `runtimePid`
- `state`
- `startedAt`
- `lastActivity`
- `runId`

### Run

Suggested fields:
- `id`
- `startedAt`
- `completedAt`
- `status`

### Mail Message

Suggested fields:
- `id`
- `fromAgent`
- `toAgent`
- `subject`
- `body`
- `type`
- `priority`
- `read`
- `createdAt`

### Event

Suggested fields:
- `id`
- `runId`
- `agentName`
- `eventType`
- `level`
- `data`
- `createdAt`

## Command Flow Direction

### `sy init`

Should:
- create `.switchyard/`
- write config
- create databases or required dirs
- add ignore entries if needed

### `sy sling`

Should:
- validate config
- create worktree
- write agent instructions
- spawn the runtime session
- persist the session

### `sy status`

Should:
- read session state
- check liveness where needed
- show concise operator-friendly output

### `sy stop`

Should:
- find the session
- stop the pid-backed runtime
- update session state
- optionally clean worktree later

## Risk Areas

Important risks to design around:
- shell/runtime startup races
- stale runtime pids vs stale DB state
- branch naming collisions
- hidden runtime-specific assumptions leaking into generic code
- overbuilding automation before the basic operator loop is stable

## Recommended Implementation Strategy

Build vertical slices, not all subsystems at once:

1. config + init
2. session DB + status
3. worktree + spawn
4. stop + cleanup
5. mail
6. events and inspection

That order forces the core workflow to become real early.
