# Merge And Reintegration Workflow

This document defines the first explicit merge contract for the current Switchyard operator loop.

## Current Contract

For the current v0 loop, reintegration is still manual-first even though `sy merge` now exists:
- Switchyard owns session lookup, status, events, stop, and optional artifact cleanup.
- Switchyard also owns the narrow preflighted merge entrypoint.
- Git still owns the actual content review, conflict handling, and merge mechanics.
- The preserved `agents/*` branch is the merge input.
- The configured canonical branch in `.switchyard/config.yaml` is the merge target.
- Each session also retains the canonical branch it was created from as `baseBranch` so later recovery can detect config drift explicitly.

## Operator Workflow

1. Reach a stable session state.
   - Run `sy status`.
   - Use the printed session id when you want later `events`, `mail`, `stop`, or `merge` commands to target one exact preserved session.
   - If the session is still `starting` or `running`, run `sy stop <session>`.
   - `sy stop` now also echoes the exact session id in its handled output, so you do not need a separate `sy status` lookup before later follow-up commands.
   - If you include `--cleanup` too early, Switchyard still stops the active session first and then preserves the work unless cleanup is confirmed safe or you passed explicit `--abandon`.
   - Do not pass `--cleanup` before you have either merged or deliberately abandoned the work.

2. Review the preserved branch and worktree.
   - Use `sy events <session>` if you need lifecycle context.
   - Use `sy mail list <session>` when you want the mailbox history without changing read state.
   - Use `sy mail list <session> --unread` when you want only unread mail without consuming it.
   - Use `sy mail check <session>` only when you intentionally want to consume unread mail; it marks the returned messages as read.
   - Mail inspection output now also echoes the resolved session id and frames each message body as an explicit `Body:` block, so mailbox review does not force a separate `sy status` lookup and stays readable when messages span multiple lines.
   - Inspect the agent worktree and branch with normal git commands.
   - Run the project checks you expect before reintegration.

3. Reintegrate from the canonical branch in the main repository.
   - Prefer `sy merge <session>` once review is complete.
   - The command checks that the session is no longer active, refuses legacy rows that do not have stored `baseBranch` metadata, verifies the preserved branch still exists, refuses to silently retarget a session whose stored `baseBranch` no longer matches `.switchyard/config.yaml`, verifies that the preserved worktree path still resolves to the expected git worktree root, requires both the preserved agent worktree and the repo-root worktree to be clean, switches to the intended canonical branch, and then runs the explicit git merge.
   - `sy merge` now also echoes the resolved session id in its handled output, including merge-conflict and other session-scoped failure paths, so the next `events`, `status`, `mail`, or cleanup command does not require a separate lookup.
   - The equivalent git path remains:

```bash
git switch <canonical-branch>
git merge --no-ff agents/<agent-name>
```

4. Resolve the outcome explicitly.
   - If the merge succeeds, validate the merged result with the checks you normally trust on the canonical branch.
   - If the merge conflicts, `sy merge` surfaces the conflicting paths so you can inspect them immediately. Resolve the conflict manually or abort with git. Switchyard does not resolve conflicts or abort for you.
   - If you decide not to keep the work, treat that as an explicit abandon decision.

5. Clean up only after the outcome is known.
   - `sy status` now shows a cleanup-readiness label for each session, using the same merged-cleanup rules as `sy stop --cleanup`. Active sessions show the post-stop result as `stop-then:*`.
   - After a successful merge, remove the preserved branch and worktree with `sy stop <session> --cleanup`.
   - After an explicit abandon decision, discard the preserved branch and worktree with `sy stop <session> --cleanup --abandon`.

## Why This Is Manual First

- The current operator loop already has durable branch, worktree, session, and event state.
- The stored `baseBranch` keeps the merge target explicit even if config changes after launch.
- The command is intentionally narrow because the missing piece was product policy, not raw git reachability.
- Keeping merge review and conflict handling explicit avoids hiding important operator choices behind an immature command.
- The default `sy stop` behavior preserves the worktree specifically so review and reintegration can happen after the runtime stops.

## What This Does Not Try To Solve Yet

- merge queues
- background reintegration
- AI-assisted conflict resolution
- automatic cleanup after merge
- broader multi-agent branch coordination

## Current Implementation Notes

The current `sy merge <session>` path:
- checks that the session is no longer active
- resolves the session to its preserved branch
- checks the session's stored `baseBranch` before using the configured canonical branch
- verifies that the preserved worktree path is still the expected git worktree
- refuses dirty preserved worktrees so uncommitted agent changes are not stranded before cleanup
- validates that the canonical branch worktree is usable
- reports the conflicted paths when `git merge` stops in a conflict state
- records a no-op `merge.skipped` event when the branch is already integrated
- runs the same explicit merge contract from this document

It does not replace operator review, manual conflict resolution, post-merge validation, or explicit cleanup.
The corresponding cleanup path is also intentionally narrow: plain `--cleanup` is safe cleanup after merge only when Switchyard has stored `baseBranch` metadata for that session, while `--cleanup --abandon` is explicit discard.
