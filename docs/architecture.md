# Architecture Draft

## System Shape

Switchyard should be a local orchestration system for one repository at a time.

Its adopted near-term shape is a bounded autonomous swarm:
- one top-level orchestration run per operator objective
- one `lead` session that owns planning, integration, and closure
- optional `scout`, `builder`, and `reviewer` specialist sessions under that lead
- explicit task scopes, artifact paths, and merge policy

## Design Priorities

1. Local-first operation
2. Simple failure domains
3. Deterministic filesystem layout
4. Durable orchestration state before convenience automation
5. Human operator stays in control of the final merge policy

## Runtime Model

Switchyard should keep one narrow runtime adapter boundary that covers:
- handoff spec path
- result-envelope path
- spawn command and working directory
- detached-process metadata for lifecycle control
- readiness and completion detection

The bounded Codex `exec --json` path remains the baseline runtime implementation.
The orchestration redesign should parameterize that path by role and contract rather than inventing a second runtime model.

## Filesystem Layout

Adopted target layout:

```text
.switchyard/
  config.yaml
  sessions.db
  runs.db
  # legacy per-session run summaries during the transition
  events.db
  mail.db
  orchestration.db
  # top-level swarm runs, tasks, artifacts, and host recovery state
  worktrees/
  logs/
  specs/
  objectives/
  agent-results/
```

Notes:
- SQLite stores stay repo-local.
- `orchestration.db` is the adopted store for top-level swarm runs, task graphs, artifact references, and host recovery state.
- `runs.db` remains the current legacy per-session run-summary store during the rollout bridge, so the existing single-agent status surfaces keep working while orchestration storage lands.
- later implementation work may retire or repurpose `runs.db`, but Chunk 2 should not leave the boundary implicit.
- worktrees stay under `.switchyard/worktrees/`.
- objective specs, per-agent handoffs, logs, and result envelopes should all have deterministic paths.
- current implementation still reflects an earlier subset of this layout; later chunks should extend it without breaking the durable paths already in use.

## Core Components

### CLI Layer

Responsible for:
- parsing commands and flags
- loading config
- routing to orchestration and store modules
- formatting operator-facing output

### Config Layer

Responsible for:
- finding the project root
- loading `.switchyard/config.yaml`
- validating policy defaults such as concurrency and merge policy
- providing durable path defaults

### Worktree Manager

Responsible for:
- creating lead and specialist worktrees
- naming branches deterministically
- removing worktrees safely

### Orchestration Store

Responsible for:
- top-level run records
- task graph rows
- artifact references
- host recovery checkpoints or leases

Boundary:
- `orchestration.db` owns swarm-level truth
- `runs.db` is not the top-level swarm-run store in the adopted design

### Session Store

Responsible for:
- per-agent runtime records
- role metadata
- run linkage
- parent/child or task linkage where needed

### Host And Policy Layer

Responsible for:
- accepting only lead-owned delegation
- validating specialist scopes
- enforcing bounded depth and concurrency limits
- advancing runs through planning, dispatch, integration, verification, and closure

### Mail, Event, And Verification Stores

Responsible for:
- durable communication
- append-only timelines
- verification artifact references and summaries

## Data Model Direction

### Orchestration Run

Suggested fields:
- `id`
- `objective`
- `targetBranch`
- `integrationBranch`
- `integrationWorktreePath`
- `mergePolicy`
- `state`
- `startedAt`
- `updatedAt`

### Session

Suggested fields:
- `id`
- `runId`
- `role`
- `agentName`
- `branchName`
- `worktreePath`
- `runtimePid`
- `parentSessionId`
- `objectiveTaskId`
- `state`
- `startedAt`
- `lastActivity`

### Task

Suggested fields:
- `id`
- `runId`
- `parentTaskId`
- `role`
- `title`
- `fileScope`
- `state`

### Artifact

Suggested fields:
- `id`
- `runId`
- `taskId`
- `sessionId`
- `kind`
- `path`
- `createdAt`

## Command Flow Direction

### `sy sling`

Should:
- validate config
- create one orchestration run
- create the lead integration branch and worktree
- write one objective spec
- write one lead handoff spec and result-envelope path
- launch the lead session

### `sy status`

Should:
- read run and session state
- show run-centric progress first
- preserve exact lead and specialist inspection when needed

### `sy stop`

Should:
- stop the whole run when the selector resolves to a run or its lead
- stop one specialist only when the operator explicitly targets that specialist
- preserve artifacts until cleanup is safe or explicitly abandoned

### `sy merge`

Should:
- merge the verified integration branch under the active policy
- stop at `merge_ready` for the default `manual-ready` path

## Risk Areas

Important risks to design around:
- hidden delegation beyond the lead
- overlapping builder file scopes
- resuming a host without enough durable state
- confusing run-centric versus session-centric operator surfaces
- enabling automatic merge before the repo has adopted that policy deliberately

## Recommended Implementation Strategy

Build milestone bundles around the bounded orchestration workflow:

1. direction and policy adoption
2. durable orchestration state
3. objective specs and role-aware launch
4. bounded host, resume, and stop policy
5. composition, verification, and merge gate
6. closure and run-centric operator surfaces
