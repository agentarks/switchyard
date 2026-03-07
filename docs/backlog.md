# Backlog

This is the ordered backlog for the next several sessions. Keep items small enough to finish in one focused pass.

## Now

1. Implement a worktree manager under `src/worktrees/`
2. Define deterministic branch and worktree naming rules
3. Add tests for worktree creation and cleanup edge cases

## Next

4. Add a narrow Codex runtime seam under `src/runtimes/codex/`
5. Implement the first real `sy sling`
6. Persist a created session from `sy sling`

## After That

7. Define readiness and failure handling for the first spawned session
8. Implement `sy stop`
9. Add liveness checks and state transitions

## Then

10. Define cleanup behavior for stopped sessions and worktrees
11. Implement the first mail store path
12. Add minimal event logging

## Later

13. Improve status and inspection surfaces

## Not A Priority Yet

- coordinator processes
- watchdog daemons
- dashboard or TUI work
- merge queue automation
- multiple runtimes beyond Codex
