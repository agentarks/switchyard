# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Implement the smallest merge path that matches the documented merge contract.

Target outcome:
- the repo has a narrow `sy merge` path for the current single-repo Codex loop
- the command follows the documented manual-first workflow instead of inventing new product rules
- the implementation makes it clearer whether merge needs any richer session metadata than the repo already stores

## Why This Is Next

The runtime-control model is now explicit enough for v0. The biggest missing operator workflow is what happens after an agent has produced useful work on an `agents/*` branch.

The repo now has an explicit reintegration workflow, but the CLI still stops short of helping the operator execute it safely.

Without a narrow merge command:
- operators still have to translate session state into raw git steps by hand every time
- Switchyard cannot preflight obvious risks such as trying to merge an active session
- cleanup remains easier to get wrong than it should be because the product still relies on operator discipline alone

## Exact Order

1. Audit the current post-work artifacts
   - confirm exactly which stored fields and files the merge path can rely on today: branch, worktree, session state, config, and events
   - stay grounded in the current single-repo Codex workflow

2. Implement the smallest `sy merge` path
   - resolve one session to its preserved branch
   - refuse unsafe states such as active sessions or missing branch metadata
   - run the documented merge path against the configured canonical branch

3. Keep the scope narrow
   - leave review, testing judgment, and conflict resolution operator-visible
   - keep cleanup explicit unless the implementation proves a safer default

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
- the repo has a working narrow merge path for the current loop
- the command behavior matches the documented merge contract
- tests cover the critical safety checks and happy path
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- implement one session-at-a-time merge path, not a broader merge system
- prefer one explicit operator-readable command over speculative automation
- keep targeting one repo-local Codex lifecycle

The point of this slice is to turn the documented reintegration workflow into a minimal safe command, not to design the final merge system.
