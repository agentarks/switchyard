# Objective Specs And Role-Aware Launch Design

## Status

Active design for Chunk 3 of the bounded autonomous swarm rollout.

This design covers the first launcher cutover from the legacy detached-worker `sy sling` path to the adopted orchestration contract:
- one run
- one `lead`
- one objective spec
- one lead handoff spec
- one reserved result-envelope path

It does not add lead-host delegation, run resume, specialist fan-out, or automatic merge.

## Goal

Make `sy sling` start one durable orchestration run plus one `lead` session, using the existing bounded Codex runtime path and the orchestration/session stores that landed in Chunk 2.

The launcher should stop behaving like "spawn one named worker" and instead behave like "start one bounded objective."

## Scope

This chunk should:
- remove the legacy `<agent>` positional from `sy sling`
- require exactly one objective source via `--task` or `--task-file`
- create one orchestration run row
- create one lead task row
- create one lead session linked to the run and task
- create one lead-owned integration branch and worktree
- write one objective spec under `.switchyard/objectives/`
- write one lead handoff spec under `.switchyard/specs/`
- reserve one structured result-envelope path under `.switchyard/agent-results/`
- launch the existing bounded Codex runtime with a role-aware prompt/spec contract

This chunk should not:
- launch specialists
- add run resume/host checkpoint behavior beyond what already exists
- add run-centric operator surfaces
- change the merge policy away from `manual-ready`

## Recommended Approach

Do a hard cutover now.

`sy sling` should no longer accept the legacy `<agent>` positional. The command should accept only one objective through `--task` or `--task-file`, generate the lead identity internally, create the orchestration/bootstrap artifacts, and launch the lead session.

This is the smallest honest cut because:
- the docs already define `sy sling` as run launch, not detached worker launch
- keeping the positional as a compatibility alias would preserve ambiguity the repo has already decided to remove
- Chunk 3 is specifically the contract cutover bundle, not a compatibility bridge

## Data And Artifact Model

### Run identity

The launcher should create one orchestration run id before writing any run-scoped artifacts.

That run id becomes the stable anchor for:
- orchestration rows
- integration branch/worktree naming
- objective spec path
- handoff spec path
- result-envelope path

### Lead task

The launcher should create one top-level task for the lead objective.

Suggested initial values:
- `role`: `lead`
- `state`: `in_progress`
- `title`: summarized operator objective
- `fileScope`: `[]`
- `assignedSessionId`: lead session id

This keeps the later lead-host bundle grounded in a real top-level task instead of synthesizing one after launch.

### Objective spec

The objective spec should live under `.switchyard/objectives/` and describe:
- run id
- created timestamp
- operator objective text
- target branch
- integration branch
- merge policy
- lead role expectation

This is the durable run-level source of truth that later lead-host and resume work can read.

### Lead handoff spec

The lead handoff spec should live under `.switchyard/specs/` and describe:
- session id
- run id
- role
- objective task id
- target branch
- integration branch
- worktree path
- objective spec path
- reserved result-envelope path
- instruction text for the lead

The handoff should be role-aware and deterministic, not a generic worker note.

### Result envelope

Chunk 3 only needs the contract and reserved path, not the full host parser.

Reserve one lead result-envelope path under `.switchyard/agent-results/` and require the prompt/handoff to point at it explicitly. The initial envelope contract should be structured JSON with room for later role-specific variants.

At minimum, the contract should support a lead completion payload that can eventually report:
- planned tasks
- summary text
- final run outcome such as `merge_ready`, `blocked`, or `failed`

## Launch Model

### Worktree and branch naming

The lead worktree must be distinct from the old per-agent branch layout because it now represents run-level integration ownership.

Chunk 3 should add deterministic run-aware naming helpers for:
- integration branch
- integration worktree path
- lead agent/session display name if needed

Recommended pattern:
- integration branch: `runs/<run-id>/lead`
- integration worktree path: `.switchyard/worktrees/<run-id>-lead`

The existing worktree manager should be extended rather than bypassed, so later specialist launch can reuse the same naming boundary.

### Runtime boundary

Keep the existing `codex exec --json` baseline.

The launcher should still call the current runtime adapter, but pass role-aware arguments/instructions derived from the new contract instead of appending the raw operator task as the final command argument.

This chunk should parameterize the runtime by:
- role
- handoff spec path
- objective spec path
- result-envelope path

It should not introduce a second runtime implementation.

## Prompt And Contract Direction

The lead launch prompt should be explicit about:
- being the `lead`
- owning the run-level objective
- using the handoff/objective specs on disk as the source of truth
- writing a structured result envelope before exit
- preserving the `manual-ready` policy
- not assuming automatic merge

This prompt should replace the generic detached-worker contract that effectively asked one named worker to act on a free-form task.

## Failure Handling

Chunk 3 should preserve the current safety posture:
- if launch bootstrap fails before the runtime is ready, clean up the worktree and record a launch failure
- if session persistence fails after spawn, stop the runtime and clean up as today
- if orchestration rows or specs are partially written, the failure event should still surface the run id and known artifact paths when available

The new launcher should fail closed rather than silently falling back to the old single-session behavior.

## Operator Output

The success output from `sy sling` should become run-aware.

It should include at least:
- run id
- lead session id
- role: `lead`
- target branch
- integration branch
- objective summary
- objective spec path
- lead handoff spec path
- result-envelope path
- log path
- worktree path

This keeps the transition readable even before run-centric `status` becomes the default.

## Testing Strategy

Follow TDD for the cutover.

The initial failing tests should cover:
- `sy sling --task ...` creates one orchestration run plus one lead session
- the lead session stores `runId`, `role`, and `objectiveTaskId`
- the run stores a lead-owned integration branch and worktree
- the objective spec is written under `.switchyard/objectives/`
- the lead handoff spec is written under `.switchyard/specs/`
- the reserved result-envelope path is deterministic under `.switchyard/agent-results/`
- the runtime command/prompt contract becomes role-aware
- the legacy `<agent>` positional is rejected by the CLI surface because it no longer exists

## Design Summary

Chunk 3 should be the honest semantic cutover:
- `sy sling` launches one bounded objective
- the launcher creates one run plus one `lead`
- durable objective/handoff/result artifacts exist before the lead starts
- the runtime baseline stays narrow
- `manual-ready` remains the rollout gate
