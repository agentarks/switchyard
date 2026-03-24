# Repo Workflow Handoff

## Context

This handoff captures the current state of the repo-workflow redesign work for building Switchyard itself.

The user goal is:
- reduce handholding across sessions
- make approved milestone work resumable and more autonomous
- use subagent review for honest feedback before later implementation work

The current work is still in design/spec stage.
No implementation plan should be written yet from the current first spec without one more bounded cleanup pass.

## Current Files

Active first spec:
- `docs/superpowers/specs/2026-03-24-repo-workflow-state-and-resume-design.md`

Broader superseded target-state spec:
- `docs/superpowers/specs/2026-03-24-milestone-autopilot-repo-workflow-design.md`

The broad spec was intentionally demoted.
It should not be used as the implementation basis for the next slice.

## Current Git State

Relevant repo status at handoff:
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

## Latest Reviewer Findings Still Open

The latest independent review still found unresolved mechanical blockers in the first spec.

High-priority blockers:
- The startup marker contract is inconsistent.
  One part of the spec refers to the literal marker `repo-workflow-startup: repo-workflow-v1`, while YAML examples use `startup_migration_marker: repo-workflow-v1`. This must be collapsed to one exact convention.
- The attempt lifecycle is still not fully deterministic.
  In particular:
  - `ready -> implementing` exists conceptually but needs explicit machine transition ownership
  - interrupted local edits before a commit still create ambiguity about whether a new attempt has started
  - current recommendation is to keep v1 fail-closed on dirty worktrees
- `PLAN.md` is still not clearly inside the atomic cutover despite `AGENTS.md` still pointing to it as startup truth.
- `verification_command` still risks multiple authorities unless the spec makes `chunks.yaml` the sole source and keeps baseline verification separate in `campaign.yaml`.
- `docs/milestones.md` still needs an explicit machine-readable milestone registry schema, not just a narrative requirement.
- slice-ledger mapping still needs a canonical home and exact rule when no new row is created.

Medium-priority blockers:
- campaign state vs attempt state still needs tighter legal pairings
- projection docs still need exact required/optional field rules
- startup-doc migration validation still needs to be machine-checkable, not inferred from prose
- resume still needs a precise rule for selecting the active attempt and verifying canonical git identity against the checked-out repo state

## Best Current Recommendation

Do not resume patching the broad autopilot spec.

Do this next instead:
1. Continue with the narrow first spec only:
   - `docs/superpowers/specs/2026-03-24-repo-workflow-state-and-resume-design.md`
2. Make one final cleanup pass that resolves the remaining mechanical blockers:
   - one startup marker convention
   - explicit atomic cutover including `PLAN.md`
   - exact milestone registry shape in `docs/milestones.md`
   - sole ownership of `verification_command`
   - explicit slice-ledger mapping field/rule
   - explicit dirty-worktree fail-closed rule in transitions and resume
3. Re-review the first spec.
4. Only after that, write the implementation plan for the first slice.

## Suggested Next-Session Task

Start by reading:
- `docs/session-handoffs/2026-03-24-repo-workflow-handoff.md`
- `docs/superpowers/specs/2026-03-24-repo-workflow-state-and-resume-design.md`
- `docs/superpowers/specs/2026-03-24-milestone-autopilot-repo-workflow-design.md`
- `docs/superpowers/specs/2026-03-15-slice-ledger-design.md`
- `AGENTS.md`
- `docs/dev-workflow.md`

Then:
- fix the remaining first-spec blockers only
- run a fresh independent review on the narrowed spec
- do not write the implementation plan until the narrowed spec is review-clean

## Important Constraints To Preserve

- Do not let review regress back into “small batch because current docs are conservative” reasoning.
- Keep the product-policy layer separate from repo-workflow behavior.
- Keep `docs/slice-ledger.md` historical.
- Keep PR/merge automation out of the first implementation slice.
- Keep v1 resume fail-closed on dirty worktrees unless the user explicitly wants to model dirty state.
