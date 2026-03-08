# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Expand mail semantics beyond the first durable unread-only path.

Target outcome:
- the repo keeps mail operator-readable and durable while reducing friction in common follow-up checks
- any broader mail behavior is justified by current operator usage, not by speculative messaging features
- docs state clearly what mail reads, writes, and state transitions now mean

## Why This Is Next

The reintegration path now has both a narrow merge command and a cleanup guard, so the next useful gap is the still-minimal mail surface.

Mail already works durably, but it is intentionally thin. If operators need anything more, the next step should be a small usability expansion inside that existing path rather than more merge machinery.

Without that discipline:
- the repo risks broadening recovery state even though the current merge and cleanup fields are sufficient
- operator messaging stays awkward longer than necessary
- the CLI accumulates more lifecycle policy before the basic communication loop is comfortable

## Exact Order

1. Audit the current mail path
   - confirm exactly which operator actions feel awkward today: unread-only reads, sender semantics, output shape, and event details
   - stay grounded in the current single-repo Codex workflow

2. Implement one narrow mail improvement
   - prefer one explicit operator-readable behavior over a broader messaging system
   - keep read/write side effects clear in both output and docs

3. Keep the scope narrow
   - do not add broad coordination or workflow automation
   - avoid turning mail into a general chat subsystem

4. Update docs
   - `docs/current-state.md`
   - `docs/roadmap.md`
   - `docs/cli-contract.md`
   - any contract docs changed by the decision

## What To Keep Small

Do not build these in the same slice unless the implementation forces it:
- background watchdogs or daemons
- automated merge queues
- AI-assisted conflict resolution
- broad multi-agent coordination logic
- post-merge dashboards or reporting

## Definition Of Done

This slice is done when all of these are true:
- `npm run check` passes
- the repo has one concrete mail improvement that reduces operator friction
- tests and docs reflect the new mail behavior
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- prefer one explicit operator-readable mail behavior over a broader messaging system
- defer bigger message semantics unless the current narrow path proves insufficient
- keep targeting one repo-local Codex lifecycle

The point of this slice is to make the existing mail path more usable, not to invent a broader coordination layer.
