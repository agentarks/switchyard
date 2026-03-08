# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Expose the first narrow operator-facing event read path so Switchyard can surface the new durable lifecycle timeline from the CLI.

Target outcome:
- operators can inspect the most important recent actions without opening SQLite directly
- the event output stays narrow enough to revise later
- status and later inspection work can build on the same event store

## Why This Is Next

The core lifecycle loop now exists, including basic durable mail. The next smallest missing operator capability is durable observability.

Without a read path:
- failures and operator actions are still buried in durable state
- operators cannot yet answer "what just happened?" from the CLI
- the event store exists, but it is not yet an operator tool

## Exact Order

1. Pick one CLI surface
   - extend `sy status` with a small event summary, or add one focused inspection command
   - keep the choice narrow and operator-oriented

2. Read from the existing event store
   - query recent events globally or for one session
   - avoid broad filtering or analytics features

3. Add focused tests
   - one command path that proves events are readable from the CLI
   - one empty-state path

4. Update docs
   - `docs/current-state.md`
   - `docs/roadmap.md` if the recommended next slice changes

## What To Keep Small

Do not build these in the same slice unless the implementation forces it:
- rich filtering UIs or dashboards
- attachments or richer mail payload formats
- background delivery loops
- watchdog automation

## Definition Of Done

This slice is done when all of these are true:
- `npm run check` passes
- one CLI path reads the durable event timeline
- tests cover the first operator-facing event view
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- read fewer event views
- prefer a single recent-events view over filters
- keep targeting one repo-local durable timeline

The point of this slice is to make the stored timeline usable, not to design the final diagnostics system.
