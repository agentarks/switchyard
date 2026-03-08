# Backlog

This is the ordered backlog for the next several sessions. Keep items small enough to finish in one focused pass.

## Now

1. Add minimal event logging around sling/stop/mail
2. Add durable event store tests and one operator-facing read path
3. Improve status and inspection output with event context

## Next

4. Decide whether tmux should replace or augment pid-based stop control
5. Define readiness and failure handling for the first spawned session
6. Add richer session metadata only if lifecycle control needs it

## After That

7. Define merge and reintegration workflow
8. Expand mail semantics beyond the first durable path
9. Add background diagnostics only if operator workflows require it

## Then

10. Dashboard or TUI work, if still justified

## Later

- richer runtime matrix, if still justified

## Not A Priority Yet

- coordinator processes
- watchdog daemons
- dashboard or TUI work
- merge queue automation
- multiple runtimes beyond Codex
