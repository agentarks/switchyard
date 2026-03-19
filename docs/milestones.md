# Milestones

## Completed Foundations

### M0: Planning Approved

Deliverables:
- `PLAN.md`
- `docs/architecture.md`
- baseline milestone and scope docs

### M1: Repo Bootstrap

Deliverables:
- `sy init`
- `.switchyard/` bootstrap
- config loading and repo-root detection

### M2: Bounded Single-Agent Foundations

Deliverables:
- bounded `sy sling`
- session and run persistence
- `sy status`
- `sy stop`
- `sy logs`

### M3: Reintegration Foundations

Deliverables:
- `sy merge`
- durable events and mail
- review and cleanup support
- exact-session inspection improvements

## Active Rollout

### M4: Direction Adoption

Deliverables:
- bounded autonomous swarm direction in source-of-truth docs
- explicit merge-policy rollout gate
- decision record for swarm v1 policy

Definition of done:
- the docs consistently define bounded orchestration as the active target while still describing current implementation gaps honestly

### M5: Durable Orchestration State

Deliverables:
- orchestration runs
- task graph records
- artifact references
- session role metadata
- orchestration config/bootstrap defaults

Definition of done:
- the repo can persist a truthful bounded swarm run before specialist launch

### M6: Objective Specs And Specialist Launch

Deliverables:
- objective specs
- role-aware handoff specs
- lead launch
- structured result envelopes

Definition of done:
- `sy sling` starts one run and one `lead` with durable launch artifacts

### M7: Lead Host, Recovery, And Stop Policy

Deliverables:
- bounded lead-only delegation
- resume support
- run-scoped stop semantics

Definition of done:
- runs can be resumed and stopped truthfully without replaying completed work

### M8: Composition, Verification, And Merge Gate

Deliverables:
- deterministic integration-branch composition
- verification on the integration worktree
- `manual-ready` `merge_ready` flow

Definition of done:
- successful runs reach verified `merge_ready` without automatic final merge

### M9: Closure And Run-Centric Operator Surfaces

Deliverables:
- run-centric status, events, logs, and mail
- swarm cleanup and retained history

Definition of done:
- operators can understand and close a bounded swarm run end to end

## Deferred

Not required for the current rollout:
- `auto-after-verify` final merge
- watchdog automation
- AI merge resolution
- web dashboard or TUI
- multiple runtimes beyond Codex
- unbounded delegation trees
