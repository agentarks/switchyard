# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Validate whether the current mail split needs one more narrow operator-facing behavior.

Target outcome:
- the repo stays readable with `send`, `check`, and `list` unless a real operator workflow proves they are insufficient
- any mail change is justified by a concrete operator gap instead of speculative messaging breadth
- docs state clearly what mail semantics exist and why

## Why This Is Next

The merge/recovery metadata question is now resolved with one stored `baseBranch` field. The next open question is whether the current mail path is already enough for the single-repo operator loop.

Right now the repo has durable mail send, unread consumption, and read-only mailbox inspection. That may already be sufficient.

Without a concrete mail-driven audit:
- the project may add messaging semantics that do not improve the current operator loop
- docs can drift toward speculative collaboration features instead of proven operator value
- future slices lose the narrow vertical focus the repo is trying to preserve

## Exact Order

1. Audit real mail friction
   - confirm whether `send`, `check`, and `list` leave an operator blind or awkward in the current loop
   - stay grounded in the current single-repo operator loop

2. Add one narrow mail behavior only if needed
   - prefer one explicit operator-readable behavior over broader mailbox state or coordination semantics
   - keep the current semantics unchanged if the audit does not surface a concrete gap

3. Keep the scope narrow
   - do not add dashboards, reporting, or broad query syntax
   - avoid speculative messaging features that are not tied to a real operator task

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
- the repo either adds one justified mail improvement or explicitly confirms the current mail split is enough for now
- tests and docs reflect the resulting mail behavior
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- prefer one explicit mail behavior over a broader message-state expansion
- defer changes entirely unless the current operator mail workflow is genuinely awkward
- keep targeting one repo-local Codex lifecycle

The point of this slice is to improve real operator communication when needed, not to invent a broader messaging surface.
