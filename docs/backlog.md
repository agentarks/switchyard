# Backlog

This is the ordered backlog for the next several sessions. Keep items small enough to finish in one focused pass.

## Now

1. Implement the first session store under `src/sessions/`
2. Replace the `sy status` placeholder with real session listing
3. Add tests for empty and non-empty status output

## Next

4. Implement a worktree manager under `src/worktrees/`
5. Define deterministic branch and worktree naming rules
6. Add tests for worktree creation and cleanup edge cases

## After That

7. Add a narrow Codex runtime seam under `src/runtimes/codex/`
8. Implement the first real `sy sling`
9. Persist a created session from `sy sling`
10. Define readiness and failure handling for the first spawned session

## Then

11. Implement `sy stop`
12. Add liveness checks and state transitions
13. Define cleanup behavior for stopped sessions and worktrees

## Later

14. Implement the first mail store path
15. Add minimal event logging
16. Improve status and inspection surfaces

## Not A Priority Yet

- coordinator processes
- watchdog daemons
- dashboard or TUI work
- merge queue automation
- multiple runtimes beyond Codex
