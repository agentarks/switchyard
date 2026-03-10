# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Stop treating generic hardening as the default next step now that the `sy sling` task-handoff slice exists.

Target outcome:
- reassess whether the current repo-local loop needs another concrete slice at all
- if a new slice is justified, name it before coding
- avoid "find the next gap" work that does not clearly change operator behavior

## Why This Is Next

The core loop is now mostly real, and the start-of-loop product gap that justified the last slice is no longer open. Leaving "pick the next hardening gap" as the standing instruction still risks turning progress into an open-ended cleanup exercise instead of a product decision.

Without that discipline:
- effort can drift into speculative lifecycle cleanup with no clear finish line
- sessions can keep landing in "improve confidence" work without changing the operator product meaningfully
- docs can make the project sound incomplete even when the current loop is already usable

## Exact Order

1. Name the next slice before coding
   - the next slice is not automatically "more hardening"
   - "more hardening" is not a valid slice name

2. Only do lifecycle work when it is anchored
   - tie it to a reproduced failure or a confusing operator workflow
   - if the work does not change operator behavior, defer it

3. Update docs only where priorities truly changed
   - keep `docs/current-state.md`, `docs/focus-tracker.md`, and this file aligned with the narrower rule

## Named Slice

No new named slice is locked yet.

Decision rule:
- if current launch output, `sy events`, and exact-session `sy status` already give enough task-handoff visibility, do not invent another slice just to stay busy
- if operators hit a concrete gap, name that gap explicitly before writing code

## What To Keep Small

Do not build these unless a concrete operator workflow now requires them:
- multiple runtimes beyond Codex
- dashboard or TUI work
- background daemons or watchdogs
- broad analytics or reporting
- speculative merge automation beyond the current explicit path
- unbounded lifecycle cleanup work with no reproduced operator problem

## Definition Of Done

The next session is on track when all of these are true:
- it either confirms no new slice is needed yet or names one concrete operator-visible slice
- tests and docs match the resulting behavior when behavior changed
- the work did not broaden scope just to stay busy

## If You Get Stuck

Reduce scope instead of inventing a larger roadmap item:
- if the work starts sounding like generic hardening, stop and rename the exact operator-facing slice first
- if two slices are possible, choose the one that is more concrete and more reviewable
- keep optimizing for the current single-repo, single-agent loop
