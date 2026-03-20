# Switchyard Plan

## Purpose

Switchyard is a CLI-first system for running a bounded autonomous swarm against a single repository with:
- isolated git worktrees
- durable run, session, task, and artifact tracking
- explicit agent-to-agent and operator-to-agent messaging
- predictable composition, verification, merge, and recovery workflows

The goal is not maximum swarm size. The goal is controlled delegation with clear operator visibility and bounded failure domains.

## North Star

The north star is:
- one operator can launch one bounded objective, let Switchyard plan and delegate it through explicit roles, and still understand task ownership, current state, communication, verification, and merge status end to end

The long-term strategic goal remains:
- exceed the Overstory-inspired baseline through stronger operator control, lower workflow overhead, and more understandable recovery and reintegration paths

That remains a product direction, not a license to broaden scope without bounds.

## Current Proving Path

The adopted near-term proving path is bounded autonomous swarm v1:
- `sy sling` starts one bounded orchestration run
- one `lead` owns the run and the integration branch
- `scout`, `builder`, and `reviewer` are first-class specialist roles
- only the `lead` may dispatch specialists in v1
- builder scopes stay explicit and non-overlapping
- composition and verification happen on the lead-owned integration worktree
- the rollout gate is `manual-ready`, not automatic merge

The current implementation is still earlier than that target:
- the repo has a real bounded single-agent Codex loop
- the next milestone bundles should build the orchestration layer on top of those durable foundations

## Working Assumptions

These are the current working defaults:
- primary interface: CLI
- implementation stack: TypeScript + Node + SQLite
- runtime target: Codex-first, adapter-friendly design
- repository scope: one repository at a time
- delegation depth in v1: `lead -> specialist`
- merge policy in v1: `manual-ready`
- `auto-after-verify` requires a later explicit policy flip

If any of those change, the plan should change with them.

## Product Principles

1. Mechanical safety before autonomy.
2. Durable state before convenience features.
3. Operator visibility before hidden automation.
4. Bounded orchestration before broader runtime breadth.
5. Explicit workflow over opaque orchestration.
6. Surpass the Overstory-inspired baseline by compounding reliability and clarity, not by matching surface area as fast as possible.

## v1 Definition

The first bounded autonomous swarm version should support:
- initialize a repository for Switchyard
- start one bounded orchestration run from one objective
- persist a top-level run plus linked lead and specialist sessions
- store task graphs, artifact references, and recovery checkpoints durably
- inspect orchestration progress through status, events, logs, and mail
- stop or resume a run truthfully
- compose accepted work on a lead-owned integration branch
- verify the integrated result
- stop at `merge_ready` by default so the operator keeps the final merge decision

The first bounded autonomous swarm version should not require:
- unbounded delegation trees
- background daemons acting without operator approval
- AI conflict resolution
- automatic merge by default
- support for many runtimes

## Non-Goals For Early Versions

- hierarchical delegation deeper than `lead -> specialist`
- hidden coordinator or watchdog daemons
- a web dashboard
- broad multi-runtime compatibility
- broad distributed coordination across many repositories
- enabling `auto-after-verify` before the repo explicitly adopts that policy

## Architecture Direction

Core subsystems:
- CLI command surface
- runtime adapter boundary
- worktree manager
- orchestration store for runs, task graphs, artifact references, and host recovery
- per-agent session store
- event, mail, and verification artifact stores
- operator observability commands

Persistent state should live under a repo-local `.switchyard/` directory.

The durable model should separate:
- orchestration runs as top-level units of work
- sessions as per-agent runtime records
- tasks as a run-scoped graph
- artifacts as explicit references to specs, logs, branches, worktrees, and verification output

## Delivery Phases

### Phase 0: Foundations

- establish repo conventions and docs
- build repo bootstrap, session persistence, mail, events, logs, merge, and stop paths
- prove the bounded single-agent Codex loop

Exit criteria:
- the narrow operator loop is real and durable enough to support orchestration work on top

### Phase 1: Direction Adoption

- adopt bounded autonomous swarm as the active source-of-truth direction
- define the rollout gate for `manual-ready`
- record the policy decision explicitly

Exit criteria:
- docs and planning state consistently point at bounded orchestration, while still accurately describing current implementation gaps

### Phase 2: Durable Orchestration State

- add top-level orchestration runs, task graphs, artifact references, and host recovery state
- extend session metadata with run and role linkage
- extend config/bootstrap for orchestration directories and policies

Exit criteria:
- the repo can persist a truthful bounded swarm run before specialist launch exists

### Phase 3: Objective Specs And Specialist Launch

- make `sy sling` start one run and one `lead`
- write one top-level objective spec and per-agent handoff specs
- require structured result envelopes

Exit criteria:
- the launcher boundary is role-aware and durable

### Phase 4: Lead Host, Recovery, And Stop Policy

- implement bounded lead-only delegation
- implement run-scoped recovery and resume
- make stop semantics truthful at the run level

Exit criteria:
- interrupted runs can resume without replaying completed work

### Phase 5: Composition, Verification, And Merge Gate

- compose accepted builder output on the integration branch
- verify the integrated result
- preserve the `manual-ready` gate

Exit criteria:
- successful runs reach a verified `merge_ready` state without silently auto-merging

### Phase 6: Closure And Operator Surfaces

- make status, events, logs, mail, cleanup, and retained history run-centric
- preserve exact lead/specialist inspection when needed

Exit criteria:
- operators can understand and close a swarm run without reconstructing state manually

### Phase 7: Optional Policy Flip

- consider `auto-after-verify` only after a later explicit decision

Exit criteria:
- the repo deliberately adopts automatic final merge, or deliberately declines it

## Current Decisions

These are the current project decisions and should be treated as defaults until deliberately revised:
- the CLI name is `sy`
- Codex is the first-class runtime for early Switchyard
- `node:sqlite` is acceptable behind narrow store modules
- the bounded `codex exec --json` path is the runtime baseline to build on
- `sy sling` now means "start one bounded orchestration run"
- v1 roles are `lead`, `scout`, `builder`, and `reviewer`
- the `lead` owns integration and composition
- the v1 host stays bounded
- the initial merge policy is `manual-ready`
- `auto-after-verify` is deferred until a later explicit policy adoption

## Open Decisions

The active product questions now are:
- what is the smallest coherent chunk that advances the bounded orchestration rollout next
- which run-centric operator surfaces must land earliest to keep the system understandable during the transition
- when, if ever, the repo should flip from `manual-ready` to `auto-after-verify`

## Suggested Order For The Next Sessions

1. Keep the bounded Codex runtime baseline fixed unless a real failure disproves it.
2. Execute the bounded autonomous swarm chunk sequence in order.
3. Do not skip the durable orchestration state bundle.
4. Keep automatic merge out of scope until an explicit policy decision says otherwise.
