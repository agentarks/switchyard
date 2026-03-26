# Repo Workflow Handoff

## Context

This handoff captures the current state of the repo-workflow redesign work for building Switchyard itself.

This file captures the pre-implementation-plan cleanup state from 2026-03-24.
Later cleanup on 2026-03-25 resolved the startup-marker mismatch, added exact markdown block delimiters to the active spec, replaced scalar slice-ledger mapping with row-addressable linkage, and removed the self-referential `head_commit` contract.
Later canonical repo-workflow state also narrowed the former broad `c-005` follow-up into an explicit proof-gate-first chain: `c-005 -> c-006 -> c-007`.
The `c-005` implementation chunk has now landed; the active repo-workflow closeout gate is `c-006`.
Use the active spec and plan as the current source of truth.

The user goal is:
- reduce handholding across sessions
- make approved milestone work resumable and more autonomous
- use subagent review for honest feedback before later implementation work

The current work is no longer blocked on first-spec contract cleanup.
The active next step is recording milestone proof at the `c-006` closeout gate, then handing off to `c-007`.

## Current Files

Active first spec:
- `docs/superpowers/specs/2026-03-24-repo-workflow-state-and-resume-design.md`

Broader superseded target-state spec:
- `docs/superpowers/specs/2026-03-24-milestone-autopilot-repo-workflow-design.md`

The broad spec was intentionally demoted.
It should not be used as the implementation basis for the next slice.

## Current Git State

Relevant repo status at the original handoff:
- modified: `docs/superpowers/specs/2026-03-24-milestone-autopilot-repo-workflow-design.md`
- untracked: `docs/superpowers/specs/2026-03-24-repo-workflow-state-and-resume-design.md`
- untracked: `.switchyard/`

There is also an earlier committed design artifact:
- commit `c7bc143`
- message: `docs: add milestone autopilot workflow design`

That commit is now only historical context because the broader autopilot spec was later superseded for implementation planning.

## What Was Learned

The original broad workflow spec kept failing review for good reasons:
- authority split between product-policy docs and repo-workflow docs was unclear
- too much mutable state was spread across multiple Markdown files
- `docs/slice-ledger.md` was being overloaded as mutable campaign state
- branch/PR/merge automation was being mixed into the same first slice

The design direction was then narrowed to:
- first solve repo-workflow authority split
- first solve deterministic state + resume
- first solve chunk/review state transitions
- defer PR/merge automation and smoke/demo proof gates to later specs

The later redesign also shifted from:
- markdown docs with embedded control state

to:
- dedicated YAML control-plane files under `docs/repo-workflow/`
- Markdown docs as projections and startup guidance only

## Current First Spec Direction

The current first spec now assumes:
- canonical machine state should live only in YAML files
- canonical files should be:
  - `docs/repo-workflow/campaign.yaml`
  - `docs/repo-workflow/chunks.yaml`
  - `docs/repo-workflow/attempts.yaml`
- startup docs must cut over atomically
- dirty worktrees should fail resume in v1
- `docs/slice-ledger.md` must remain historical, not mutable campaign state
- the broad autopilot spec is superseded for state ownership and resume behavior

## Remaining Implementation Risks

The first-spec contract is now tight enough to implement.
The remaining risks are implementation and migration risks, not design blockers:

- the initial `docs/repo-workflow/*.yaml` bootstrap files must reflect real current slice state from the first commit that introduces them
- the validator must fail closed on any dirty worktree entry, including `.switchyard/` changes, rather than inheriting the product helper's ignore behavior
- startup-doc cutover must be atomic across every mandatory startup doc; partial marker rollout must remain invalid
- projection blocks and the milestone registry must be parsed as exact delimited blocks and validated as one current-`HEAD` checkpoint
- review and verification currency must compare against the checked-out `HEAD` on canonical `branch_ref`, not against a stored "current head" field
- clean validation must run from a checkpoint where the canonical `branch_ref` exists and is actually checked out, not from detached `HEAD`

## Best Current Recommendation

Do not resume patching the broad autopilot spec.

Do this next instead:
1. Implement the narrow first slice only:
   - `docs/superpowers/specs/2026-03-24-repo-workflow-state-and-resume-design.md`
   - `docs/superpowers/plans/2026-03-24-repo-workflow-state-and-resume.md`
2. Start with Chunk 1:
   - add the canonical YAML bootstrap files
   - encode the contract in RED validator and CLI tests
   - preserve the early checkpoint commit before cutover
3. Continue through the validator, startup-doc cutover, and closeout chunks only if each verification gate stays clean.

## Suggested Next-Session Task

Start by reading:
- `docs/session-handoffs/2026-03-24-repo-workflow-handoff.md`
- `docs/superpowers/specs/2026-03-24-repo-workflow-state-and-resume-design.md`
- `docs/superpowers/specs/2026-03-24-milestone-autopilot-repo-workflow-design.md`
- `docs/superpowers/specs/2026-03-15-slice-ledger-design.md`
- `AGENTS.md`
- `docs/dev-workflow.md`

Then:
- execute the written repo-workflow state-and-resume plan in chunk order
- keep the work inside the first slice boundary
- do not expand into PR automation, proof gates, or product merge-policy changes

## Important Constraints To Preserve

- Do not let review regress back into “small batch because current docs are conservative” reasoning.
- Keep the product-policy layer separate from repo-workflow behavior.
- Keep `docs/slice-ledger.md` historical.
- Keep PR/merge automation out of the first implementation slice.
- Keep v1 resume fail-closed on dirty worktrees unless the user explicitly wants to model dirty state.
