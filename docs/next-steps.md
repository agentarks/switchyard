# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Build the first real mail path so Switchyard can move one durable message between the operator and an agent session.

Target outcome:
- `sy mail` is no longer a placeholder
- one durable mail record can be written and read back
- session-targeted mail flow is explicit
- the command shape stays small enough to revise later

## Why This Is Next

The core lifecycle loop now exists. The next smallest missing operator capability is basic durable messaging.

Without a real mail path:
- there is no durable operator-to-agent handoff inside Switchyard
- `mail.db` remains a placeholder artifact
- the MVP surface is still missing one of its intended primitives

## Exact Order

1. Define the minimum mail record
   - sender, recipient, body, timestamps
   - no threads, routing graphs, or background delivery

2. Add store ownership for `mail.db`
   - schema creation
   - narrow read/write helpers

3. Replace the `mail` placeholder
   - support one write path
   - support one read/check path
   - keep output operator-readable

4. Add command tests
   - one mail send path
   - one mail check/read path

5. Update docs
   - `docs/current-state.md`
   - `docs/roadmap.md` if the recommended next slice changes

## What To Keep Small

Do not build these in the same slice unless the implementation forces it:
- attachments or rich payload formats
- background delivery loops
- events
- multi-runtime abstractions

## Definition Of Done

This slice is done when all of these are true:
- `npm run check` passes
- `sy mail` is no longer a placeholder
- one durable mail record can be sent and checked through the command path
- tests cover the first mail store + command path
- docs reflect the new reality

## If You Get Stuck

Reduce scope instead of broadening design:
- send less metadata
- read fewer views of the mailbox
- keep targeting one repo-local durable flow

The point of this slice is to make mail real, not to design the final messaging system.
