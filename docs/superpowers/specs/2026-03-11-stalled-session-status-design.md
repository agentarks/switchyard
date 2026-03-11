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
- the newest operator-visible activity is older than a fixed threshold

The operator-visible activity source should stay aligned with the existing `UPDATED` column logic. That means using the newest available item from:
- the latest durable event timestamp
- the latest unread inbound operator mail timestamp
- the session row update timestamp

## Thresholds

Use fixed code-level thresholds in this slice:
- `running`: 30 minutes without operator-visible activity
- `starting`: 10 minutes without operator-visible activity

These values are intentionally conservative. They are only meant to surface "this needs inspection" in the current repo-local operator loop, not to become a general scheduling policy.

## Rendering

### All-session `sy status`

When a session is stalled:
- derived `NEXT` changes from `wait` to `inspect`
- `RECENT` shows a compact synthetic summary: `runtime.stalled idleFor=<duration>`

This should behave like the existing derived follow-up signal:
- it is computed during status rendering
- it does not create a new durable event
- it should not override higher-value mailbox follow-up

### Exact-session `sy status <session>`

The exact-session detail block and one-row table should reflect the same derived stalled hint:
- follow-up should resolve to `inspect`
- the recent summary should show the same `runtime.stalled idleFor=<duration>` text

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
- unread inbound mail over threshold still resolves to `mail`
- dead runtime over threshold becomes `failed`, not stalled
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
