# Reintegration Decision Support Design

## Summary

This slice adds the first milestone-scoped reintegration decision support to `sy status`.

The goal is to help the operator answer one concrete question after a task finishes:
- what should I do with this session now?

The first slice keeps that answer inside the existing control plane:
- all-session `sy status` gets one compact reintegration assessment
- exact-session `sy status <session>` gets a richer review block with the assessment, the reason, and the next action

This is not a merge automation slice.
It is a decision-support slice that makes finished work easier to review, merge, abandon, or hold for follow-up.

## Problem

Switchyard now has:
- bounded `codex exec --json` launch
- durable run records
- truthful natural completion in `sy status`
- durable mail, merge, cleanup, and event inspection
- a narrow merge path

That is enough to follow a session through execution, but it still leaves a thin spot after completion:
- the operator can tell that a task finished
- the operator can inspect mail, logs, and recent events
- the operator still has to synthesize for themselves whether the session is ready, blocked, risky, or simply needs review

That creates friction exactly where the new active milestone begins:
- reintegration
- operator closure

The project does not yet need a new command.
It needs `sy status` to answer the first reintegration question more directly.

## Goals

- Add reintegration decision support to `sy status`
- Keep `sy status` as the main operator control plane
- Give the all-session view a compact reintegration signal
- Give the exact-session view a clearer review block with reason and next action
- Use only state that Switchyard already stores or already derives
- Keep the slice narrow and reviewable

## Non-Goals

- No automatic merge or merge queue behavior
- No AI-generated change summaries
- No transcript-derived semantic judgment
- No new top-level command in this slice
- No post-closure history redesign in this slice
- No new runtime instrumentation in this slice

## Proposed Behavior

### All-session `sy status`

The all-session table should gain one compact reintegration assessment for sessions where reintegration meaningfully applies.

Recommended values:
- `ready`
- `needs-review`
- `blocked`
- `risky`

This assessment should stay compact enough that the all-session table remains readable.
It is a routing signal, not a narrative explanation.

### Exact-session `sy status <session>`

The exact-session output should gain a review block that answers:
- what the current reintegration assessment is
- why Switchyard assigned it
- what the operator should do next

Recommended shape:
- `Review: ready|needs-review|blocked|risky`
- `Why: ...`
- `Next: merge|inspect|resolve|abandon|wait`

This should sit alongside the current exact-session status detail rather than replacing existing lifecycle, run, or recent-event information.

## Assessment Semantics

The first slice should use conservative meanings:

### `ready`

Use when Switchyard can already see enough evidence that the session is closure-ready under the current narrow workflow.

Examples:
- session is inactive
- latest run finished successfully
- no known merge or cleanup blocker is present
- no higher-priority unresolved follow-up remains

This should still be conservative.
If the system cannot justify `ready` clearly, prefer `needs-review`.

### `needs-review`

Use when the task looks complete enough to inspect, but Switchyard should not imply merge-readiness yet.

Examples:
- run finished successfully
- preserved work exists
- no explicit blocker is known
- operator review is still the right next step

This should likely be the default assessment for many completed sessions in the first slice.

### `blocked`

Use when Switchyard already knows a concrete condition that prevents normal reintegration or cleanup.

Examples:
- preserved worktree has a known cleanup blocker
- merge preflight already failed
- repo-root merge-in-progress or similar reintegration refusal is already known
- unresolved worktree or branch state prevents the expected next action

### `risky`

Use when reintegration is possible, but Switchyard can already see warning signs that should make the operator cautious.

Examples:
- prior merge-related failure context exists but does not fully block the next manual review step
- preserved state is unusual enough that the operator should inspect before assuming closure will be routine

The first slice should use `risky` sparingly.
It is a warning state, not a catch-all.

## Inputs The Slice May Use

The first slice should rely only on state Switchyard already owns or already derives, such as:
- session lifecycle state
- latest run state and terminal outcome
- existing follow-up signals
- unread mail or other operator follow-up already surfaced by `sy status`
- cleanup-readiness state already computed by current status logic
- stored merge failure or cleanup failure context already available through events/status summaries
- preserved worktree or branch state already inspected by existing logic

## Precedence Rules

Apply these rules:

1. Active sessions are not reintegration-ready
- if the session is still running or starting, the reintegration answer should not imply merge readiness
- the exact next action should remain `wait`, `mail`, or `inspect` according to existing status logic

2. Known hard blockers win
- if current status logic already knows reintegration or cleanup is blocked, the review assessment should be `blocked`

3. Conservative review beats optimistic readiness
- when a session finished successfully but no hard blocker is known, prefer `needs-review` unless the existing workflow can justify `ready` clearly

4. The new review assessment should not erase existing lifecycle detail
- the review block augments status output
- it does not replace run state, cleanup state, recent events, or next-follow-up signals

5. If the needed supporting data cannot be loaded, keep current status behavior rather than inventing a review answer

## Operator Experience

After this slice, the operator should be able to look at `sy status` and quickly distinguish:
- sessions that are still active
- sessions that need manual review before merge
- sessions blocked by a known condition
- sessions that appear closure-ready

The exact-session view should then explain the reasoning plainly enough that the operator does not need to inspect raw git state just to understand the recommended next action.

## Implementation Notes

Keep this slice inside the existing `sy status` control plane.

Likely touch points:
- `src/commands/status.ts`
- `src/commands/status.test.ts`
- `docs/cli-contract.md`
- `docs/current-state.md`

Implementation guidance:
- reuse existing derived state where possible
- avoid adding another persistence table or event type for this slice
- keep the all-session output compact
- keep the exact-session explanation explicit and operator-readable

## Testing

Add focused coverage for:
- all-session status renders the compact reintegration assessment for completed/preserved sessions
- exact-session status renders the richer review block
- active sessions do not get misleading reintegration-ready assessments
- known blockers map to `blocked`
- normal finished sessions without blockers map conservatively to `needs-review` unless the chosen rule justifies `ready`
- existing merge/cleanup failure context is reflected in the review block
- the table remains readable and the new output does not displace higher-value lifecycle information

## Risks

- `ready` could be too optimistic if the first slice overreaches
- the exact-session block could become verbose if it repeats too much existing status information
- the assessment rules could become muddy if `risky` is used too broadly

These risks are acceptable if the first slice stays conservative and keeps the primary value on operator decision support rather than automation.

## Acceptance

This slice is complete when:
- all-session `sy status` surfaces a compact reintegration assessment where it matters
- exact-session `sy status` explains that assessment with `Review`, `Why`, and `Next`
- the operator can distinguish ready, needs-review, blocked, and risky states without reading raw git state
- the slice remains narrow, status-first, and manual-review-friendly
