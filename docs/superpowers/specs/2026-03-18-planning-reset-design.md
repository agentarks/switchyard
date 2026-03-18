# Planning Reset Design

## Summary

This change resets Switchyard's planning model from an open-ended "find the next operator-visible gap" loop to an explicit active milestone.

The new active milestone is:
- finish reintegration and operator closure for the current v0 workflow

That means the project should stop treating runtime observability as the default next question and instead drive a short sequence of implementation slices that make completed work easier to review, merge, abandon, and understand after closure.

## Problem

The current planning docs were useful when the operator loop was still proving out, but they now create a stall pattern:
- they treat the runtime baseline as perpetually provisional
- they require a newly reproduced "gap" before naming the next slice
- they bias the project toward another narrow diagnostics slice instead of committing to a larger product step

The result is planning churn rather than forward motion.

The repo already has:
- a bounded `codex exec --json` runtime baseline
- readable structured logs
- truthful natural completion in `sy status`
- mail, merge, cleanup, and current-session inspection paths
- a proved two-session workflow

At this point, the planning model should shift from:
- "find the next blind spot"

to:
- "finish the next milestone with several purposeful slices"

## Goals

- Replace the current gap-driven planning rule with a milestone-driven rule
- Keep the runtime baseline explicit and stable enough for v0
- Name one active milestone that can support several consecutive slices
- Align `PLAN.md`, `docs/current-state.md`, `docs/next-steps.md`, `docs/focus-tracker.md`, `docs/backlog.md`, and `docs/roadmap.md`
- Keep scope narrow and consistent with the existing project identity

## Non-Goals

- No rewrite of the product north star
- No change to the Codex-first runtime choice
- No broad roadmap expansion into dashboards, daemons, tmux, or multi-runtime work
- No commitment to a specific implementation slice in this design
- No change to the canonical slice ledger beyond whatever later implementation slices may add

## Proposed Planning Model

### Active milestone

Switchyard's active milestone should become:
- reintegration and operator closure

This milestone means:
- the operator can launch delegated tasks
- follow them while they run
- understand what completed work requires review
- merge or abandon preserved work with less ambiguity
- retain enough durable history after closure to understand what happened

### New planning rule

The default planning rule should become:
- keep the bounded runtime baseline fixed for v0 unless a real failure disproves it
- choose the next slice by asking what most directly advances the active milestone
- prefer slices that move the operator from "task finished" to "session closed"

This replaces:
- "name the next blind spot before writing code"

with:
- "drive the current milestone to completion through a sequence of narrow slices"

## Why Reintegration

Reintegration is the right next milestone because it is the least-finished part of the current operator loop.

The repo already has strong enough coverage for:
- launch
- run tracking
- mailbox follow-up
- status inspection
- bounded runtime observability

The thinner area is what happens after work completes:
- deciding what is ready versus risky
- reviewing the outcome of a finished task
- closing a session without losing context

That is where additional slices now compound into a more usable product instead of another diagnostics-only refinement.

## Doc Changes

### `PLAN.md`

Update the broad project plan so it no longer points back to the gap cycle.

Changes:
- replace the current open decision about "the next named blind-spot slice"
- add an explicit active milestone around reintegration and operator closure
- update the suggested next-session order to be milestone-driven

### `docs/current-state.md`

Keep the behavior snapshot intact, but update the planning note so it no longer points back to the blind-spot loop.

Changes:
- replace the current note that says the next slice should come from the next reproduced operator-visible blind spot
- state that the bounded runtime baseline is complete enough for the current phase
- point the reader toward the reintegration/operator-closure milestone as the new planning frame

### `docs/next-steps.md`

Recast this file from runtime-triage guidance into milestone execution guidance.

Changes:
- state that the bounded Codex runtime is good enough for the current v0 baseline
- state that the current milestone is reintegration and operator closure
- name the next likely slice categories under that milestone
- remove the current instruction to wait for a newly reproduced gap before naming work

### `docs/focus-tracker.md`

Keep the target and scope, but change the planning-state language.

Changes:
- state that runtime observability is now supporting infrastructure, not the open milestone
- state that the project should advance the reintegration milestone through several narrow slices
- keep the current out-of-scope constraints intact

### `docs/backlog.md`

Turn the backlog into an ordered milestone backlog instead of a placeholder.

Changes:
- replace "choose the next blind spot" with a reintegration-oriented near-term queue
- keep broader UI/runtime surface area deferred

### `docs/roadmap.md`

Bring the roadmap back into alignment with the planning reset so it does not keep advertising the previous next slice.

Changes:
- replace the detached-runtime-observability "recommended next slice" guidance
- update the near-term order so it points toward the reintegration/operator-closure milestone
- keep the broader strategic direction and deferred items intact

## Likely Slice Categories Under The New Milestone

The planning docs should point toward categories like:
- reintegration decision support
- completed-task review summaries
- session closure and post-closure history

These are categories, not yet a final implementation plan.
The later implementation planning step should choose one narrow slice from this milestone and define it precisely.

## Risks

- The milestone could become too broad if the docs sound like a large roadmap rewrite instead of a focused reset
- If the docs over-specify future slices, they will create a different planning trap
- If `PLAN.md`, `docs/current-state.md`, and the planning docs are not updated together, the gap-cycle language will keep reappearing
- If `docs/roadmap.md` is left untouched, it will continue to advertise the previous next slice and dilute the reset

## Acceptance

This design is complete when:
- `PLAN.md` no longer centers the next session on finding a new blind spot
- `docs/current-state.md` no longer points the next slice back to the reproduced-blind-spot rule
- `docs/next-steps.md` names reintegration/operator closure as the current milestone
- `docs/focus-tracker.md` aligns the active planning state with that milestone
- `docs/backlog.md` becomes a milestone-oriented ordered backlog
- `docs/roadmap.md` no longer recommends detached-runtime observability as the next slice
- the runtime baseline remains intentionally narrow and stable rather than reopened as the default next question
