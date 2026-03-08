# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Build the first real stop path so Switchyard can stop one tracked agent session cleanly.

Target outcome:
- `sy stop` is no longer a placeholder
- one persisted session can be transitioned away from `running`
- liveness checks are narrow but real
- cleanup behavior for stopped worktrees is explicit

## Why This Is Next

This is the shortest path from spawn-only behavior to a real lifecycle loop.

Without a real stop path:
- `status` cannot distinguish live sessions from stale rows
- spawned worktrees accumulate without operator control
- the current session schema is not validated against lifecycle control

## Exact Order

1. Decide the minimum runtime metadata needed for stop
   - pid only, tmux only, or explicit deferral
   - keep the schema narrow if possible

2. Add narrow liveness lookup
   - enough to detect obvious stale sessions
   - no watchdog or background automation

3. Replace the `stop` placeholder
   - locate one persisted session
   - stop the runtime cleanly
   - update durable session state

4. Define cleanup behavior
   - default whether worktrees remain or are removed
   - add guardrails for active or missing paths

5. Add command tests
   - `sy stop` from an initialized repo with one spawned session
   - resulting state can be seen via `sy status`

6. Update docs
   - `docs/current-state.md`
   - `docs/roadmap.md` if the recommended next slice changes

## What To Keep Small

Do not build these in the same slice unless the implementation forces it:
- full process supervision
- mail
- events
- multi-runtime abstractions

## Definition Of Done

This slice is done when all of these are true:
- `npm run check` passes
- `sy stop` is no longer a placeholder
- one spawned session can be stopped through the command path
- tests cover the first stop + state-transition path
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- stop less runtime state
- defer tmux if pid-based control is enough
- remove fewer artifacts if the command path works

The point of this slice is to complete the first real agent lifecycle, not to perfect supervision.
