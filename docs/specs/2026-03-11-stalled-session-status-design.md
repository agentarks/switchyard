# Stalled Session Status Design

## Summary

This slice addresses one operator-visible blind spot in the proved two-session workflow: a session can remain in `starting` or `running` with no fresh operator-visible activity and still look like ordinary waiting work. The goal is to make likely-stalled sessions obvious during `sy status` without adding a new subsystem, durable lifecycle state, or background automation.

## Problem

Today, `sy status` already shows lifecycle state, unread mail, recent event context, and a derived next-step hint. That is enough for following normal concurrent work, but it still leaves one gap: the operator has to infer whether a quiet active session is healthy or likely stuck.

In a two-session workflow, that means:
- one session can appear to be ordinary `wait` work even after a long period of inactivity
- the operator must manually compare timestamps or inspect events to decide whether follow-up is needed
- passive inspection becomes less trustworthy as concurrent sessions overlap

## Goals

- Detect likely-stalled active sessions during `sy status`
- Keep the all-session view operator-readable
- Keep the exact-session view aligned with the same signal
- Avoid broadening into watchdogs, daemons, transcript parsing, or new durable lifecycle states

## Non-Goals

- No background polling or watchdog behavior
- No automatic stop, restart, or mail nudges
- No new persisted session state such as `stalled`
- No new command surface
- No new config knob in this slice

## Proposed Behavior

`sy status` derives a stalled-session hint at render time.

A session counts as stalled only when all of these are true:
- the durable session lifecycle state is still active (`starting` or `running`)
- runtime reconciliation does not already classify the session as failed
- there is no newer unread inbound operator mail that already explains the next action
- the newest agent/runtime-side activity is older than a fixed threshold

The stalled-session idle clock should not reuse the existing `UPDATED` timestamp. `UPDATED` is still the right freshness signal for the control-plane row, but it can advance on operator-driven actions that do not reflect agent progress.

The stalled-session idle clock should use the newest available item from:
- the session creation time as the initial baseline
- the latest runtime-progress event that reflects launch or liveness changes
- the latest inbound mail from a non-operator sender

The stalled-session idle clock should explicitly ignore operator-only activity that can otherwise mask a hung session, including:
- operator-authored mail such as `mail.sent`
- operator inspection activity such as `mail.checked` or `mail.listed`
- other local command events that do not indicate new runtime or agent progress

## Thresholds

Use fixed code-level thresholds in this slice:
- `running`: 30 minutes without operator-visible activity
- `starting`: 10 minutes without operator-visible activity

These values are intentionally conservative. They are only meant to surface "this needs inspection" in the current repo-local operator loop, not to become a general scheduling policy.

## Rendering

### All-session `sy status`

When a session is stalled:
- derived `NEXT` changes from `wait` to `inspect`
- `RECENT` keeps the most informative concrete summary already chosen by `sy status`
- when a concrete recent summary already exists, append a compact stalled hint such as `; runtime.stalled idleFor=<duration>`
- when no concrete recent summary exists, use the stalled hint by itself

This should behave like the existing derived follow-up signal:
- it is computed during status rendering
- it does not create a new durable event
- it should not override higher-value mailbox follow-up or replace higher-value blocking diagnostics

### Exact-session `sy status <session>`

The exact-session detail block and one-row table should reflect the same derived stalled hint:
- follow-up should resolve to `inspect`
- the recent summary should preserve the most informative concrete event text and augment it with the stalled hint when needed
- the detail block may surface stall duration separately if that keeps the recent summary clearer

## Precedence Rules

The stalled hint is lower priority than more concrete operator actions.

Apply these rules:
1. Unread inbound operator mail wins over stalled detection, so `NEXT=mail`
2. A dead or unreconcilable runtime becomes `failed` through the existing reconciliation path, not stalled
3. `stopped` and `failed` sessions are never stalled
4. If supporting data cannot be loaded, keep rendering status using the current degraded-output rules

## Implementation Notes

This slice should stay inside the current `sy status` control plane.

Likely touch points:
- status row derivation logic
- follow-up selection logic
- recent summary formatting
- exact-session detail rendering

Keep the implementation derived and local:
- do not alter database schema
- do not add new event types
- do not change `stop`, `merge`, `mail`, or `events` behavior

## Testing

Add focused command tests for:
- active `running` session under threshold stays `wait`
- active `running` session over threshold becomes `inspect`
- active `starting` session over threshold becomes `inspect`
- operator-only activity does not reset the stalled idle clock
- unread inbound mail over threshold still resolves to `mail`
- dead runtime over threshold becomes `failed`, not stalled
- stalled rows preserve higher-value concrete recent summaries and append the stalled hint instead of replacing them
- exact-session status shows the same stalled hint
- degraded data paths still render without crashing

## Risks

- False positives if a healthy session is quiet for longer than the fixed threshold
- Output churn if the stalled summary is too noisy or too easy to trigger

These risks are acceptable for one narrow slice because the hint remains passive and reviewable. It does not mutate durable state or trigger automation.

## Acceptance

This slice is complete when:
- `sy status` makes likely-stalled active sessions visible without drilling into raw events
- concurrent sessions remain readable in the all-session table
- no new subsystem or broad feature surface is introduced
- tests and operator-facing docs reflect the changed behavior
