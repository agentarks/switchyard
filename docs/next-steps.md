# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Define readiness and failure handling for the first spawned session so operators can tell whether a launched runtime became usable or failed early.

Target outcome:
- operators can distinguish "process started" from "session is ready enough to use"
- early runtime failures become visible and understandable from the existing operator loop
- the implementation stays narrow enough to revise later without committing to tmux first

## Why This Is Next

Status now includes concise recent event context. The next smallest missing operator capability is clarifying the post-launch window between spawn and usable session readiness.

Without tighter readiness and failure handling:
- `running` still overstates confidence immediately after spawn
- early runtime exits are not modeled clearly enough for operators
- the main lifecycle loop remains weakest at its first transition point

## Exact Order

1. Pick one narrow readiness signal
   - detect one concrete condition that means a session is ready, or one concrete early-failure condition worth recording
   - keep the choice narrow and operator-oriented

2. Reuse the existing session and event seams
   - avoid new supervisors, daemons, or broad state machines
   - prefer one additional durable fact over speculative abstractions

3. Add focused tests
   - cover the new readiness or early-failure behavior
   - preserve the current narrow operator loop

4. Update docs
   - `docs/current-state.md`
   - `docs/roadmap.md`

## What To Keep Small

Do not build these in the same slice unless the implementation forces it:
- tmux integration
- background watchdogs or daemons
- broad session state machines
- richer runtime matrices

## Definition Of Done

This slice is done when all of these are true:
- `npm run check` passes
- the first spawned-session lifecycle is clearer at the ready-or-failed boundary
- tests cover the new operator-facing readiness or failure path
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- model one readiness fact instead of many
- prefer one durable failure explanation over a larger control system
- keep targeting one repo-local Codex lifecycle

The point of this slice is to make the earliest part of the session lifecycle more trustworthy, not to design the final runtime supervisor.
