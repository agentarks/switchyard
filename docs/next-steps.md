# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Validate whether merge or recovery work actually needs richer session metadata.

Target outcome:
- the repo stays on the current session schema unless a concrete operator workflow proves it is too thin
- any metadata broadening is justified by one real merge or recovery gap, not by speculation
- docs state clearly whether the current branch/worktree/state fields are sufficient for the current loop

## Why This Is Next

The narrow merge command is now real, which means the repo can stop theorizing about session metadata and start judging it against actual operator behavior.

Right now the important question is not "what else could we store?" It is "what real task is still blocked or ambiguous with the current fields?"

Without that discipline:
- the repo risks adding state that does not improve the current operator loop
- recovery code will drift into hypothetical cases instead of real operator pain
- the core lifecycle becomes harder to reason about without reducing concrete risk

## Exact Order

1. Audit the current post-work artifacts
   - confirm exactly which stored fields and files merge and cleanup rely on today: branch, worktree, session state, config, and events
   - stay grounded in the current single-repo Codex workflow

2. Only add metadata if a concrete gap appears
   - prefer one small field or one clarified contract over a broad session-model redesign
   - keep recovery and merge behavior explicit and operator-readable

3. Keep the scope narrow
   - do not redesign merge now that the first path exists
   - keep cleanup explicit unless real usage shows a safer default is necessary

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
- the repo only carries session metadata that serves a real operator workflow
- any metadata change is covered by tests and reflected in the docs
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- prefer one explicit operator-readable field or contract clarification over speculative storage
- defer metadata changes entirely if the current merge and recovery paths are already sufficient
- keep targeting one repo-local Codex lifecycle

The point of this slice is to prove whether the current stored state is enough, not to build a broader recovery system just because the merge command now exists.
