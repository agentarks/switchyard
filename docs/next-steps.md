# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Build the first real session persistence path so Switchyard can store and read durable agent state.

Target outcome:
- `sessions.db` has a real schema owner
- the project has one session record shape
- `sy status` can read from the session store
- the repo has tests for the empty and non-empty status path

## Why This Is Next

This is the shortest path from scaffold to a real orchestration loop.

Without session persistence:
- `status` cannot become real
- `stop` has nothing durable to read or update
- `sling` has nowhere to record what it created

## Exact Order

1. Create `src/sessions/types.ts`
   - define the first session record shape
   - keep it intentionally small

2. Create `src/sessions/store.ts`
   - open `sessions.db`
   - create the schema on first use
   - expose small functions only

3. Start with these store functions:
   - `initializeSessionStore(projectRoot)`
   - `listSessions(projectRoot)`
   - one write path, either `createSession(...)` or `upsertSession(...)`

4. Add tests for the store
   - database initializes cleanly
   - empty store returns an empty list
   - inserted session can be listed back

5. Replace the `status` placeholder
   - wire `sy status` to load config
   - read sessions from the store
   - print a minimal empty-state message when no sessions exist

6. Add command tests
   - `sy status` in an initialized repo with no sessions
   - `sy status` with at least one stored session

7. Update docs
   - `docs/current-state.md`
   - `docs/roadmap.md` if the recommended next slice changes

## What To Keep Small

Do not build these in the same slice unless the implementation forces it:
- tmux integration
- real process management
- worktree creation
- mail
- events
- multi-runtime abstractions

## Definition Of Done

This slice is done when all of these are true:
- `npm run check` passes
- `sy status` is no longer a placeholder
- session schema ownership exists in code, not just in planning docs
- tests cover the first real session read/write path
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- store fewer fields
- print simpler status output
- defer anything that depends on actual agent spawning

The point of this slice is to make persistence real, not to finish orchestration.
