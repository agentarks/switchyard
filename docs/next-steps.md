# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Define the first merge and reintegration workflow for the current single-repo operator loop.

Target outcome:
- the repo has an explicit answer for how work from an agent branch is supposed to return to the canonical branch
- the answer is grounded in the current worktree, branch, status, and stop behavior
- the next implementation step is clear whether it is a narrow `sy merge` command, a manual-first contract, or one smaller prerequisite

## Why This Is Next

The runtime-control model is now explicit enough for v0. The biggest missing operator workflow is what happens after an agent has produced useful work on an `agents/*` branch.

Without an explicit merge workflow:
- operators can launch, inspect, and stop agents, but the repo-local lifecycle still has no defined reintegration step
- cleanup expectations stay ambiguous because it is unclear when a branch or worktree is truly done
- later merge automation would be forced to invent product rules that have not been written down yet

## Exact Order

1. Audit the current post-work artifacts
   - review what exists after a session runs or stops: branch, worktree, session state, and events
   - stay grounded in the current single-repo Codex workflow

2. Define the smallest merge contract
   - decide what the operator must verify before reintegration
   - decide what should stay manual in the first slice versus what belongs behind a command

3. Record the workflow explicitly
   - update the source-of-truth docs and the CLI contract
   - add an ADR only if the merge boundary needs a durable tradeoff record

4. Update docs
   - `docs/current-state.md`
   - `docs/roadmap.md`
   - any contract docs changed by the decision

## What To Keep Small

Do not build these in the same slice unless the implementation forces it:
- background watchdogs or daemons
- automated merge queues
- AI-assisted conflict resolution
- broad multi-agent coordination logic

## Definition Of Done

This slice is done when all of these are true:
- `npm run check` passes
- the repo has an explicit merge and reintegration workflow for the current loop
- the rationale points to concrete operator behavior instead of abstract workflow preference
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- answer the merge question for one repo-local Codex workflow, not for every future collaboration model
- prefer one explicit operator-readable workflow over speculative automation
- keep targeting one repo-local Codex lifecycle

The point of this slice is to remove the biggest remaining lifecycle gap after spawn, inspection, and stop, not to design the final merge system.
