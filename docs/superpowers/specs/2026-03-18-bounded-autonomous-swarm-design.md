# Bounded Autonomous Swarm Design

## Status

Historical proposal that informed the adopted bounded autonomous swarm direction.

The source-of-truth adoption landed on 2026-03-19 through `AGENTS.md`, `PLAN.md`, the planning docs, and [docs/decisions/0005-bounded-autonomous-swarm-v1.md](../../decisions/0005-bounded-autonomous-swarm-v1.md).
Read this file as design background, not as the active policy gate.

## Summary

This proposal argues that Switchyard should stop optimizing its near-term product around a narrow single-agent operator loop and instead target workflow parity with Overstory through a simpler bounded autonomous swarm.

The product target is not command-surface parity with Overstory. The target is workflow parity:
- the operator gives one task
- the system plans and decomposes the work
- specialist agents execute without operator involvement during the run
- the system verifies the result
- historical proposal note: this document originally assumed automatic merge here, but ADR 0005 superseded that rollout policy with `manual-ready` first
- the operator can inspect what happened if the run fails or blocks

The proposed first version would achieve that outcome with a bounded orchestration session rather than an always-on coordinator process.

## Problem

Switchyard's current repo guidance and implementation focus over-optimized for a narrow single-agent proving path. That may have improved mechanical reliability, but it also moved the project away from the actual product need: a controllable custom orchestration system that is at least similar to Overstory at the workflow level.

This creates three concrete problems:
- the project is behind the intended product comparison point
- the system is not yet shaped around autonomous multi-agent execution
- the current scope rules discourage building the orchestration model the product actually needs

## Product Goal

The proposed near-term product goal is:

> build a custom orchestration system that matches Overstory's workflow outcome while simplifying internals where possible

That means the system must support this workflow:
1. the operator submits one objective
2. a lead agent analyzes and decomposes it
3. specialist agents handle exploration, implementation, and review
4. the system coordinates those agents through durable state
5. the system runs required verification
6. historical proposal note: this document originally assumed automatic merge when verification passed, but ADR 0005 now requires the initial rollout to stop at `merge_ready`
7. the run closes with a clear final state and inspectable history

## Non-Goal

This design does not aim to copy Overstory's full machinery in v1.

Specifically, v1 does not require:
- a persistent coordinator process
- watchdog daemons
- full multi-runtime breadth
- recursive unbounded delegation
- dashboard or TUI parity
- Overstory's full command surface

Those may come later, but they are not required to achieve workflow parity for the first useful swarm.

## Recommended Approach

Use a bounded orchestration session for v1, but design the internals so a persistent coordinator can be added later without rewriting the swarm model.

This means:
- one top-level `sy` run owns one objective end-to-end
- the orchestration host is bounded and exits when the objective is complete, blocked, or failed
- the orchestration model underneath is reusable by a future persistent coordinator host

This approach is better than a persistent coordinator for v1 because it:
- reduces infrastructure complexity
- shortens time to first usable autonomous swarm
- keeps debugging localized to one run
- preserves a clean upgrade path to a long-lived coordinator later

## Workflow

The proposed v1 autonomous swarm workflow should be:

1. operator runs `sy sling --task ...`
2. Switchyard creates a top-level orchestration run
3. Switchyard spawns a `lead` agent for the objective
4. the `lead` decides whether exploration is needed
5. if needed, the `lead` spawns one or more `scout` agents
6. the `lead` decomposes work into bounded subtasks with explicit file ownership
7. the `lead` spawns `builder` agents for those subtasks
8. completed builder work is validated by `reviewer` agents when policy requires it
9. the `lead` evaluates whether the composed result satisfies verification policy
10. superseded policy note: this step originally proposed automatic merge, but the adopted rollout now stops at verified `merge_ready` first
11. the run closes as `merge_ready`, `merged`, `blocked`, or `failed` depending on policy and outcome

The operator should not need to intervene during the normal successful path.

## Composition Model

Builder output needs an explicit composition step before final verification and merge.

The proposed composition model is:

1. each `builder` works in its own isolated branch and worktree
2. the `lead` owns a separate integration branch and integration worktree for the overall objective
3. the run stores the canonical merge target branch durably when the run starts, so later config drift does not retarget reintegration
4. accepted builder outputs are composed onto the lead-owned integration branch in a deterministic order
5. `reviewer` agents may validate either:
   - a builder branch against its scoped subtask, or
   - the integrated result on the lead-owned integration branch when cross-subtask interaction matters
6. final required verification commands run on the lead-owned integration branch, not on disconnected builder branches
7. only after the integration branch passes verification may the system merge into the stored canonical target branch

This gives the system one explicit place to evaluate the full result while preserving isolated builder worktrees.

## Agent Roles

### Lead

The `lead` owns the objective and the integration branch for the run.

Responsibilities:
- assess task complexity
- decide whether scouting is necessary
- define subtasks and file boundaries
- spawn specialists
- collect results
- compose accepted builder outputs onto the integration branch
- decide when verification is complete
- trigger automatic merge when policy allows it

The `lead` is the only agent in v1 that may dispatch other agents.

### Scout

The `scout` is read-only exploration.

Responsibilities:
- identify relevant files and code paths
- summarize patterns and risks
- help the lead choose file boundaries and subtask cuts

Constraints:
- no code writes
- no child spawning

### Builder

The `builder` is the implementation worker.

Responsibilities:
- make code changes in an isolated worktree
- own an explicit file scope
- run the assigned task to completion
- report result and verification output back to the lead

Constraints:
- may write only within its owned subtask scope
- no child spawning

### Reviewer

The `reviewer` validates builder output.

Responsibilities:
- inspect builder changes
- compare output against the assigned subtask
- run or confirm required checks when needed
- report pass/fail with concrete reasons

Constraints:
- read-only
- no child spawning

### Merger

Do not introduce a separate `merger` role in v1 unless the implementation proves that merge coordination is too complex for the `lead`.

For v1, merge stays under `lead` ownership after verification passes.

## Delegation Model

The v1 delegation model must stay bounded and explicit.

Rules:
- one top-level `lead` per objective
- only the `lead` may spawn other agents
- `lead` may spawn `scout`, `builder`, and `reviewer`
- maximum depth in v1 is `lead -> specialist`
- no recursive spawning in v1
- concurrency is capped by policy, not by operator hope
- builders must have non-overlapping file ownership
- reviewers do not merge; they only validate

The design should still preserve a future path to deeper delegation by keeping task graph and policy boundaries explicit.

## Verification And Merge

Superseded policy note:
- this section originally proposed automatic merge as part of v1
- ADR 0005 replaced that rollout with `manual-ready` first
- read the rest of this section as historical design background, not as the active merge policy

The verification policy should support at least:
- required command checks for the affected repo, such as tests or typecheck, run on the lead-owned integration branch
- no unresolved builder/reviewer failures
- no unresolved file-scope conflicts
- final lead confirmation that the objective is satisfied

Original proposed merge policy for v1:
- if all required verification passes on the integration branch, merge automatically
- if verification fails, do not merge
- if results conflict or remain ambiguous, close the run as `blocked`

Adopted rollout replacement:
- if all required verification passes on the integration branch, stop at verified `merge_ready`
- merge automatically only if a later explicit policy adoption enables `auto-after-verify`

The system must prefer a truthful blocked or failed result over optimistic merge.

## Command Surface

Keep the CLI surface small, but change its meaning from single-session control to swarm execution.

### `sy init`

Bootstraps repo-local state for autonomous swarm execution.

### `sy sling`

Starts one bounded orchestration run for one objective.

This is the most important semantic change. In the current system, `sy sling` starts one worker. In the redesigned system, `sy sling` starts one swarm-managed objective.

### `sy status`

Shows:
- run state
- lead state
- child agents
- task graph progress
- verification state
- merge state
- final outcome when complete

### `sy events`

Shows the orchestration timeline across the lead and specialists.

### `sy stop`

Stops the full run or a selected agent when recovery is needed.

### `sy mail`

Remains the durable coordination channel for agent-to-agent and operator-to-agent communication.

## Durable State Model

The minimum durable state for v1 should include:

### Runs

One top-level record per objective.

Fields should include:
- run id
- operator task
- current lifecycle state
- final outcome
- merge state
- target branch
- integration branch
- integration worktree
- timestamps

### Agents

One record per lead or specialist session.

Fields should include:
- agent id
- run id
- role
- parent agent id if any
- worktree
- branch
- runtime state

### Tasks

A parent/child task graph produced by the lead.

Fields should include:
- task id
- run id
- parent task id
- assigned role
- assigned agent id
- file scope
- status

### Mail

Durable coordination messages between agents and operator.

### Events

An inspectable timeline for debugging, status rendering, and post-run history.

### Artifacts

References to important outputs such as:
- task specs
- logs
- branches
- worktrees
- integration-branch verification results
- verification results

## Future Upgrade Path

The architecture should explicitly reserve a later upgrade path to a persistent coordinator.

That means the host must be separable from the orchestration model:

- v1 host: bounded orchestration session
- v2 host: persistent coordinator process

The following components should therefore be host-independent:
- agent role model
- task graph
- dispatch policy
- verification policy
- merge policy
- mailbox
- session adapter interface

If that split is respected, a persistent coordinator later becomes a new orchestration host, not a full rewrite.

## Deferred For Later

These are valid future directions, but should not block v1:
- persistent coordinator daemon
- deeper recursive delegation
- multiple runtimes beyond the first required runtime path
- fleet-wide monitoring and watchdog automation
- merge-specialist agents
- dashboard or TUI views
- broad analytics

## Risks

### Risk: Fake autonomy

If the system still needs frequent operator intervention, it will not meet the product goal.

Mitigation:
- treat the no-intervention success path as a hard requirement

### Risk: Delegation chaos

Unclear boundaries between builders will create overlapping edits and merge failures.

Mitigation:
- explicit file scopes
- bounded concurrency
- lead-owned task decomposition

### Risk: Premature breadth

Trying to copy too much of Overstory's surface area will slow delivery.

Mitigation:
- optimize for workflow parity, not command parity

### Risk: Over-automation of merge

Automatic merge without strong verification will create silent bad outcomes.

Mitigation:
- merge only after explicit verification policy passes
- perform final verification on the integration branch
- prefer blocked outcomes to unsafe merge

## Testing Strategy

The first implementation plan should require end-to-end tests around:
- one simple objective completed by the bounded swarm
- one objective that requires scouts plus multiple builders
- one objective that fails verification and does not merge
- one objective that blocks because of conflicting work or failed review
- status and event visibility for the full run lifecycle

The testing goal is to prove the workflow outcome, not only isolated helper correctness.

## Success Criteria

This redesign is successful when Switchyard can demonstrate:
- the operator gives one task
- the swarm completes it without operator intervention during the run
- specialist roles are visibly real, not just renamed generic workers
- the system can either:
  - merge automatically after passing verification if the repo formally adopts that policy, or
  - stop cleanly at a merge-ready integration result until that policy changes
- the operator can inspect blocked or failed runs afterward

## Proposal

This document proposes resetting Switchyard's near-term direction toward Overstory-style workflow parity through a simplified bounded autonomous swarm.

If adopted, the system should:
- preserve a small CLI surface
- change `sy sling` into a bounded orchestration entrypoint
- introduce `lead`, `scout`, `builder`, and `reviewer` roles
- keep merge under lead ownership in v1
- enforce bounded delegation and explicit file scopes
- use a lead-owned integration branch for final composition and verification
- explicitly supersede the current manual-first merge policy before enabling automatic merge
- merge automatically only after integration-branch verification passes
- reserve a clean path to a future persistent coordinator host
