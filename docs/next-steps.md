# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Decide whether pid-only lifecycle control is sufficient for v0 or whether tmux-backed control needs to land next.

Target outcome:
- the repo has an explicit answer for whether tmux is required for the first reliable operator loop
- the answer is grounded in the current `sy sling` / `sy status` / `sy stop` behavior, not general preference
- the next implementation step is clearer whether the decision is "stay pid-only for now" or "add the smallest tmux slice"

## Why This Is Next

The launch boundary is now narrower and more trustworthy. The next unresolved operator-risk question is whether pid-only control is enough to keep the lifecycle understandable and stoppable, or whether tmux is necessary sooner.

Without an explicit tmux decision:
- the project keeps carrying an unresolved runtime-control assumption
- it is unclear whether current pid-only stop behavior is acceptable for the intended workflow
- merge and broader lifecycle work risk building on top of an unstable control model

## Exact Order

1. Audit the current control path
   - review the concrete guarantees from the existing pid-based spawn, status, and stop flow
   - stay focused on real operator tasks, not future runtime breadth

2. Identify the smallest missing guarantee
   - decide whether the real gap is interactive control, launch inspection, cleanup reliability, or something else
   - avoid jumping straight to tmux unless the current failure mode actually requires it

3. Record the decision explicitly
   - update the source-of-truth docs and add an ADR if the tradeoff needs a durable rationale
   - if tmux is required, define the smallest next vertical slice instead of broad integration

4. Update docs
   - `docs/current-state.md`
   - `docs/roadmap.md`
   - any contract docs changed by the decision

## What To Keep Small

Do not build these in the same slice unless the implementation forces it:
- background watchdogs or daemons
- broad session state machines
- richer runtime matrices
- full tmux integration before the specific requirement is clear

## Definition Of Done

This slice is done when all of these are true:
- `npm run check` passes
- the repo has an explicit decision on pid-only control versus tmux for the current loop
- the rationale points to concrete operator behavior instead of general preference
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- answer the tmux question for the current workflow, not for every future runtime
- prefer one explicit decision over exploratory implementation
- keep targeting one repo-local Codex lifecycle

The point of this slice is to remove the biggest remaining control-model ambiguity, not to design the final runtime supervisor.
