# No Visible Progress Status Design

## Summary

This slice addresses a concrete operator-visible blind spot in the current detached Codex loop: `sy sling` and `sy status` can prove that a runtime process was launched and is still alive, but they do not currently tell the operator when that live session has produced no visible work artifact at all.

The goal is to make "alive but no visible progress yet" visible inside `sy status` without adding transcript capture, runtime protocol changes, or new durable session state.

## Problem

The current status model already surfaces:
- launch success
- runtime liveness reconciliation
- unread mail
- stalled-session hints based on quiet runtime/mail activity

That is enough to distinguish some active versus inactive sessions, but it still leaves one important gap:
- an active session can remain `running`
- the worktree can still be clean
- the agent branch can still have no commits ahead of `baseBranch`
- no unread mail may exist
- `sy status` still reports `NEXT=wait`

In practice, that leaves the operator unsure whether the agent is productively working, blocked internally, waiting for hidden runtime input, or simply doing nothing useful.

## Goals

- Surface a passive "no visible progress yet" hint in `sy status`
- Keep the all-session status view as the main control plane
- Keep exact-session status aligned with the same signal
- Use only operator-visible state that already exists locally
- Avoid broadening into transcript capture, runtime attach, or runtime-specific protocol handling

## Non-Goals

- No transcript capture
- No stdout/stderr streaming
- No new runtime events
- No new persisted session state
- No new command surface
- No changes to `sy sling` launch semantics in this slice

## Proposed Behavior

`sy status` derives a passive `runtime.no_visible_progress` hint for active sessions.

A session counts as having no visible progress only when all of these are true:
- the durable session state is still active (`starting` or `running`)
- runtime reconciliation still considers the runtime alive
- there is no unread inbound operator-targeted mail for that session
- the preserved worktree is clean
- the agent branch has no commits ahead of the session `baseBranch`
- the session age exceeds a conservative threshold

This is intentionally stricter than the current stalled-session signal. A session can be quiet but still have visible progress through worktree changes, committed work, or inbound mail. This slice only flags sessions where the operator still has zero visible proof of work.

## Threshold

Use one fixed code-level threshold in this slice:
- active session age greater than 5 minutes

This threshold is not a scheduling policy. It is just enough to stop telling the operator to keep waiting when the system still cannot show any visible progress signal.

## Rendering

### All-session `sy status`

When a session matches the no-visible-progress rule:
- derived `NEXT` becomes `inspect` instead of `wait`
- `RECENT` keeps the best existing concrete summary
- append a compact hint such as `runtime.no_visible_progress age=...`

This hint should remain lower-priority than stronger operator actions such as unread mail or merge/cleanup follow-up.

### Exact-session `sy status <session>`

The selected-session detail block and row should reflect the same derived hint:
- `Next: inspect`
- `Recent:` should preserve the highest-value existing summary and append the same `runtime.no_visible_progress` suffix

## Precedence Rules

Apply these rules:
1. unread inbound operator mail still wins, so `NEXT=mail`
2. dead runtimes still reconcile to failed state instead of becoming `no visible progress`
3. visible worktree changes suppress the hint
4. committed branch divergence suppresses the hint
5. inactive sessions never receive this hint
6. if git-based progress checks cannot be evaluated, keep current degraded status behavior instead of inventing the hint

## Implementation Notes

Keep the slice inside the existing `sy status` control plane.

Likely touch points:
- `src/commands/status.ts`
- a small git helper or status-local helper for:
  - checking whether the worktree is clean
  - checking whether the agent branch is ahead of `baseBranch`
- `src/commands/status.test.ts`

The git checks should use the session's preserved worktree and stored branch/base-branch metadata. They should be best-effort and fail closed toward the current status behavior rather than breaking status output.

## Testing

Add focused status tests for:
- active live session under threshold stays `wait`
- active live session over threshold with clean worktree and no branch divergence becomes `inspect`
- uncommitted work suppresses the hint
- committed branch divergence suppresses the hint
- unread inbound mail suppresses the hint
- dead runtime still becomes `failed`, not `runtime.no_visible_progress`
- exact-session status shows the same hint

## Risks

- false positives for long-running tasks that legitimately produce no visible repo artifact for several minutes
- extra git checks could add some status overhead

These risks are acceptable in this slice because the signal is passive, best-effort, and operator-readable. It does not mutate durable state or trigger automation.

## Acceptance

This slice is complete when:
- `sy status` stops telling the operator to simply `wait` on long-lived active sessions that still show no visible work
- exact-session and all-session status agree on the signal
- tests and docs reflect the new operator-facing behavior
