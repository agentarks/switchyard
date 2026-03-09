# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Validate whether merge or recovery work needs richer session metadata.

Target outcome:
- the repo stays readable with the current metadata unless a real operator workflow proves otherwise
- any new metadata field is justified by a concrete recovery or reintegration gap
- docs state clearly what new metadata exists and why it was added

## Why This Is Next

Selector ambiguity in the inspection path is now explicit, so the next open question is whether the current stored session context is enough for real recovery work.

Right now the repo keeps session id, agent name, branch, worktree path, runtime pid, durable events, and mail. That may already be sufficient.

Without a concrete recovery-driven audit:
- the project may add metadata that does not improve the current operator loop
- docs can drift toward speculative structure instead of proven operator value
- future slices lose the narrow vertical focus the repo is trying to preserve

## Exact Order

1. Audit real recovery and merge friction
   - confirm whether the current pid, branch, worktree, mail, and event context actually leave an operator blind
   - stay grounded in the current single-repo operator loop

2. Add one narrow piece of metadata only if needed
   - prefer one explicit field with a clear operator use over a broader metadata expansion
   - keep the current schema unchanged if the audit does not surface a concrete gap

3. Keep the scope narrow
   - do not add dashboards, reporting, or broad query syntax
   - avoid speculative metadata that is not tied to a real recovery task

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
- the repo either adds one justified metadata improvement or explicitly confirms the current metadata is enough for now
- tests and docs reflect the resulting metadata behavior
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- prefer one explicit metadata field over a broader schema expansion
- defer changes entirely unless the current recovery workflow cannot be understood with the existing state
- keep targeting one repo-local Codex lifecycle

The point of this slice is to improve real recovery confidence when needed, not to invent a broader metadata surface.
