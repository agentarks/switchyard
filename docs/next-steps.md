# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Improve status and inspection output with event context so operators can connect session state to the new durable timeline more quickly.

Target outcome:
- operators can understand recent state changes without manually correlating tables
- the output stays narrow enough to revise later
- the existing `sy events` path remains the durable foundation for later inspection work

## Why This Is Next

The core lifecycle loop now includes a narrow event read path. The next smallest missing operator capability is joining that timeline back to session inspection.

Without event context in inspection:
- failures and operator actions still require hopping between views
- operators can answer "what just happened?" but not yet "why does status look like this?" quickly
- the event store is usable, but not yet integrated into the main inspection loop

## Exact Order

1. Pick one status-adjacent CLI improvement
   - extend `sy status` with a small recent-event summary, or tighten `sy events` around session context
   - keep the choice narrow and operator-oriented

2. Reuse the existing event store and session state
   - read only the recent timeline needed to explain state
   - avoid broad filtering or analytics features

3. Add focused tests
   - cover the new status or inspection output
   - preserve the current narrow `sy events` behavior

4. Update docs
   - `docs/current-state.md`
   - `docs/roadmap.md`

## What To Keep Small

Do not build these in the same slice unless the implementation forces it:
- rich filtering UIs or dashboards
- attachments or richer mail payload formats
- background delivery loops
- watchdog automation

## Definition Of Done

This slice is done when all of these are true:
- `npm run check` passes
- status or inspection output carries concise event context
- tests cover the new operator-facing explanation path
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- show fewer event facts
- prefer a concise recent summary over new filters
- keep targeting one repo-local durable timeline

The point of this slice is to make the stored timeline easier to use in the operator loop, not to design the final diagnostics system.
