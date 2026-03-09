# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Validate whether `sy events` or merge inspection needs one more narrow operator-facing diagnostic improvement.

Target outcome:
- the repo stays readable from `status`, `events`, merge inspection, and the existing mail commands
- any new diagnostic behavior is justified by a concrete operator gap instead of speculative reporting breadth
- docs state clearly what inspection semantics exist and why

## Why This Is Next

The merge/recovery metadata question is resolved with one stored `baseBranch` field, the mail audit is resolved narrowly enough with unread-only read-only inspection, and `sy status` now surfaces unread mailbox counts directly.

Right now the repo has durable mail send, unread consumption, full read-only mailbox inspection, unread-only read-only inspection, and status-level unread visibility. That is enough unless another concrete operator blind spot shows up in `events` or merge inspection.

Without a concrete diagnostics audit:
- the project may add reporting surface that does not improve the current operator loop
- docs can drift toward speculative observability features instead of proven operator value
- future slices lose the narrow vertical focus the repo is trying to preserve

## Exact Order

1. Audit real operator inspection friction
   - confirm whether `sy events` or merge inspection still leaves an operator blind or awkward in the current loop now that status shows unread mail counts
   - stay grounded in the current single-repo operator loop

2. Add one narrow diagnostic behavior only if needed
   - prefer one explicit operator-readable behavior over broader reporting or automation
   - keep the current semantics unchanged if the audit does not surface a concrete gap

3. Keep the scope narrow
   - do not add dashboards, broad reporting, or broad query syntax
   - avoid speculative diagnostics that are not tied to a real operator task

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
- the repo either adds one justified diagnostic improvement or explicitly confirms the current inspection paths are enough for now
- tests and docs reflect the resulting behavior
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- prefer one explicit inspection improvement over broader observability expansion
- defer changes entirely unless the current operator workflow is genuinely awkward
- keep targeting one repo-local Codex lifecycle

The point of this slice is to improve real operator visibility when needed, not to invent a broader observability surface.
