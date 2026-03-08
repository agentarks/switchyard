# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Decide whether the current pid-only runtime control is sufficient for v1 or whether tmux needs to become part of the core operator loop now.

Target outcome:
- the repo has an explicit direction on pid-only stop control versus tmux-backed control
- the decision is grounded in the existing launch, status, and stop behavior rather than future abstractions
- the resulting change stays narrow and operator-first

## Why This Is Next

The launch boundary is now clearer: `sy sling` records a started session, and `sy status` decides ready versus failed early. The next unresolved operator question is whether detached pid control is trustworthy enough to keep as the lifecycle-control foundation.

Without resolving that:
- the stop path remains the main lifecycle assumption that has not been deliberately validated
- future runtime metadata work risks drifting without a clear control model
- tmux remains a deferred dependency without an explicit keep-or-adopt decision

## Exact Order

1. Audit the current control path
   - review how `sy sling`, `sy status`, and `sy stop` now interact around pid-backed sessions
   - identify the concrete failure cases that still matter to operators

2. Make the narrowest useful decision
   - either affirm pid-only control for v1 with the current constraints
   - or define the smallest tmux-backed change that the operator loop now requires

3. Add focused code or docs to support that decision
   - prefer a narrow behavior slice or ADR-level clarification over a broad runtime-control rewrite

4. Update docs
   - `docs/current-state.md`
   - `docs/roadmap.md`
   - any contract docs changed by the decision

## What To Keep Small

Do not build these in the same slice unless the decision forces it:
- broad runtime supervisors
- background watchdogs or daemons
- multi-runtime support
- merge automation

## Definition Of Done

This slice is done when all of these are true:
- `npm run check` passes if behavior changed
- the repo has a clear answer on pid-only control versus tmux for the current scope
- tests and docs match the chosen operator-facing behavior

## If You Get Stuck

Reduce scope instead of broadening design:
- validate one control assumption instead of redesigning the runtime layer
- prefer one explicit operator-facing constraint over speculative flexibility
- keep targeting one repo-local Codex lifecycle
