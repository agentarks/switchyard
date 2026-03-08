# Merge And Reintegration Workflow

This document defines the first explicit merge contract for the current Switchyard operator loop.

## Current Contract

Switchyard does not have a `sy merge` command yet.

For the current v0 loop, reintegration is manual-first:
- Switchyard owns session lookup, status, events, stop, and optional artifact cleanup.
- Git owns the actual content review, conflict handling, and merge mechanics.
- The preserved `agents/*` branch is the merge input.
- The configured canonical branch in `.switchyard/config.yaml` is the merge target.

## Operator Workflow

1. Reach a stable session state.
   - Run `sy status`.
   - If the session is still `starting` or `running`, run `sy stop <session>`.
   - Do not pass `--cleanup` before you have either merged or deliberately abandoned the work.

2. Review the preserved branch and worktree.
   - Use `sy events <session>` if you need lifecycle context.
   - Use `sy mail check <session>` only when you intentionally want to consume unread mail; it marks the returned messages as read.
   - Inspect the agent worktree and branch with normal git commands.
   - Run the project checks you expect before reintegration.

3. Reintegrate from the canonical branch in the main repository.
   - Switch to the repo root on the configured canonical branch.
   - Ensure the canonical branch worktree is in a clean state.
   - Merge the agent branch explicitly with git:

```bash
git switch <canonical-branch>
git merge --no-ff agents/<agent-name>
```

4. Resolve the outcome explicitly.
   - If the merge succeeds, validate the merged result with the checks you normally trust on the canonical branch.
   - If the merge conflicts, resolve it manually or abort with git. Switchyard does not resolve conflicts.
   - If you decide not to keep the work, treat that as an explicit abandon decision.

5. Clean up only after the outcome is known.
   - After a successful merge, or after an explicit abandon decision, remove the preserved branch and worktree with `sy stop <session> --cleanup`.

## Why This Is Manual First

- The current operator loop already has durable branch, worktree, session, and event state.
- The missing piece is product policy, not raw git reachability.
- Keeping merge review and conflict handling explicit avoids hiding important operator choices behind an immature command.
- The default `sy stop` behavior preserves the worktree specifically so review and reintegration can happen after the runtime stops.

## What This Does Not Try To Solve Yet

- merge queues
- background reintegration
- AI-assisted conflict resolution
- automatic cleanup after merge
- broader multi-agent branch coordination

## Next Implementation Target

The next CLI slice should be a narrow `sy merge <session>` path that:
- checks that the session is no longer active
- resolves the session to its preserved branch
- validates that the canonical branch worktree is usable
- runs the same explicit merge contract from this document

That future command should not replace operator review or manual conflict resolution.
