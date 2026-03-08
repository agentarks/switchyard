# Backlog

This is the ordered backlog for the next several sessions. Keep items small enough to finish in one focused pass.

## Now

1. Define liveness lookup for one spawned Codex session
2. Implement the first real `sy stop`
3. Add tests for stop state transitions and worktree cleanup rules

## Next

4. Decide whether pid or tmux metadata belongs in the session store
5. Implement worktree cleanup semantics
6. Add minimal operator messaging via `sy mail`

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
