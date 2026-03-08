# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Build the first real worktree and spawn path so Switchyard can create one tracked agent session.

Target outcome:
- the project has one worktree manager module
- naming rules for branches and worktree directories are deterministic
- `sy sling` is no longer a placeholder
- one spawned session is persisted into the existing session store

## Why This Is Next

This is the shortest path from scaffold to a real orchestration loop.

Without a real spawn path:
- `status` has nothing live or operator-created to inspect
- `stop` still has no real lifecycle target
- the current session schema is not validated by actual command flow

## Exact Order

1. Create `src/worktrees/`
   - add deterministic branch naming
   - add deterministic worktree path naming

2. Add worktree tests
   - root repo invocation
   - nested directory invocation
   - collision handling rules if needed

3. Add a narrow Codex runtime seam
   - enough structure to build a command line
   - no multi-runtime abstractions yet

4. Replace the `sling` placeholder
   - validate config
   - create the worktree
   - persist one session record
   - leave tmux/process liveness small if possible

5. Add command tests
   - `sy sling` from an initialized repo
   - resulting session can be seen via `sy status`

6. Update docs
   - `docs/current-state.md`
   - `docs/roadmap.md` if the recommended next slice changes

## What To Keep Small

Do not build these in the same slice unless the implementation forces it:
- tmux integration
- full process supervision
- mail
- events
- multi-runtime abstractions

## Definition Of Done

This slice is done when all of these are true:
- `npm run check` passes
- `sy sling` is no longer a placeholder
- one session can be created through the command path
- tests cover the first worktree + persisted-session path
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- spawn less runtime state
- defer tmux
- persist fewer fields if the command path works

The point of this slice is to make the first real agent lifecycle real, not to perfect runtime control.
