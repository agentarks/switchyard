# ADR 0003: v0 Runtime Control

## Status

Accepted

## Context

Switchyard now has a real single-agent lifecycle loop for Codex:
- `sy sling` creates a worktree, spawns one detached Codex process, records its pid, and waits for a short launch window before persisting the session as `starting`
- `sy status` reconciles `starting` and `running` sessions by checking whether the recorded pid is still alive
- `sy stop` stops the recorded pid with `SIGTERM` and `SIGKILL` fallback, then updates durable session state and optionally removes the worktree and branch

Earlier planning docs assumed tmux would be the process-control default. The implementation does not currently use tmux, and the project needed an explicit answer on whether that was a temporary gap or the intended v0 control model.

The current operator loop is intentionally narrow:
- one repo at a time
- one Codex runtime target
- CLI-first inspection through durable session and event state
- no requirement yet for interactive attach, terminal multiplexing, or transcript recovery

## Decision

For the current v0 operator loop, pid-backed detached process control is sufficient. Switchyard will not require tmux for v0.

Working rule:
- keep `sy sling`, `sy status`, and `sy stop` grounded in the recorded runtime pid
- treat interactive attach and transcript-oriented runtime control as deferred work, not hidden requirements
- revisit tmux or another wrapper only when a concrete operator workflow requires one of these guarantees:
  - attach to a live runtime after launch
  - inspect runtime terminal output that durable events cannot explain
  - recover runtime control from cases where pid-only handling proves insufficient in practice

## Consequences

Positive:
- keeps the runtime dependency surface smaller for the first reliable loop
- matches the current implementation instead of preserving a stale planning assumption
- keeps lifecycle behavior easier to reason about while merge and recovery workflows are still undefined

Negative:
- operators cannot attach to a live Codex terminal through Switchyard
- Switchyard does not yet capture a runtime transcript or terminal session for later inspection
- if Codex workflows later need interactive supervision, adding tmux or another wrapper will require a focused follow-up slice

## Follow-Up

The next lifecycle-adjacent work should not be "add tmux by default." The next work should be the smallest concrete workflow gap that remains after this decision, which is merge and reintegration.
