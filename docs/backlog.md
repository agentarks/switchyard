# Backlog

This is the ordered backlog for the next several sessions. Keep items small enough to finish in one focused pass.

## Now

1. Implement the first real `sy mail`
2. Add durable mail store tests and command tests
3. Decide whether the first mail surface needs send/check subcommands or a narrower shape

## Next

4. Add minimal event logging around sling/stop/mail
5. Improve status and inspection output
6. Decide whether tmux should replace or augment pid-based stop control

## After That

7. Define readiness and failure handling for the first spawned session
8. Add richer session metadata only if lifecycle control needs it
9. Define merge and reintegration workflow

## Then

10. Add background diagnostics only if operator workflows require it
11. Expand mail semantics beyond the first durable path
12. Add minimal event logging if it was deferred again

## Later

13. Dashboard or TUI work, if still justified

## Not A Priority Yet

- coordinator processes
- watchdog daemons
- dashboard or TUI work
- merge queue automation
- multiple runtimes beyond Codex
