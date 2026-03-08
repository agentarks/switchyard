# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Build the first real event path so Switchyard can retain a durable operator-readable timeline for the core lifecycle.

Target outcome:
- `events.db` is no longer just a placeholder file
- sling, stop, and mail append durable lifecycle events
- operators can inspect the most important recent actions without reading source
- the event model stays narrow enough to revise later

## Why This Is Next

The core lifecycle loop now exists, including basic durable mail. The next smallest missing operator capability is durable observability.

Without a real event path:
- failures and operator actions are still mostly inferred from current session state
- `events.db` remains a placeholder artifact
- inspection cannot yet answer "what just happened?" with durable history

## Exact Order

1. Define the minimum event record
   - event type, session id or agent name, timestamps, narrow payload
   - no background watchers, analytics, or generic event buses

2. Add store ownership for `events.db`
   - schema creation
   - narrow append/query helpers

3. Write events from existing commands
   - `sy sling`
   - `sy stop`
   - `sy mail`

4. Add store and command tests
   - one append path
   - one operator-facing read path

5. Update docs
   - `docs/current-state.md`
   - `docs/roadmap.md` if the recommended next slice changes

## What To Keep Small

Do not build these in the same slice unless the implementation forces it:
- attachments or richer mail payload formats
- background delivery loops
- watchdog automation
- multi-runtime abstractions

## Definition Of Done

This slice is done when all of these are true:
- `npm run check` passes
- `events.db` owns a real schema
- key lifecycle commands append durable events
- tests cover the first event store + command path
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- store less payload
- read fewer event views
- keep targeting one repo-local durable timeline

The point of this slice is to make observability real, not to design the final diagnostics system.
