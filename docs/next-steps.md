# Next Steps

This file is the owner-facing execution guide for deciding whether a new meaningful slice exists. If you are unsure what to do next, start here.

## Current Decision

Do not treat another inspection or hardening pass as the default next step now that exact launch-task inspection exists in `sy status <session> --task`.

Current outcome:
- the current repo-local loop does not have a newly named default slice
- any new slice must be justified by a reproduced operator-visible gap and named before coding
- "find the next gap" is not valid work by itself when it does not clearly change operator behavior

## Why This Is Next

The core loop is now mostly real, and the start-of-loop product gap that justified the last slice is no longer open. Leaving "pick the next hardening gap" as the standing instruction still risks turning progress into an open-ended cleanup exercise instead of a product decision.

Without that discipline:
- effort can drift into speculative lifecycle cleanup with no clear finish line
- sessions can keep landing in "improve confidence" work without changing the operator product meaningfully
- docs can make the project sound incomplete even when the current loop is already usable

## Exact Order

1. Reproduce and name the next slice before coding
   - the next slice is not automatically "more hardening"
   - "more hardening" is not a valid slice name
   - if no concrete gap is reproduced, do not create a new default slice just to keep momentum

2. Only do lifecycle work when it is anchored
   - tie it to a reproduced failure or a confusing operator workflow
   - if the work does not change operator behavior, defer it

3. Update docs only where priorities truly changed
   - keep `docs/current-state.md`, `docs/focus-tracker.md`, and this file aligned with the narrower rule

## Latest Completed Slice

Completed slice:
- exact launch-task inspection in `sy status <session> --task`
- exact session-id visibility in operator-facing `sy stop` output
- exact session-id visibility in operator-facing `sy mail check` and `sy mail list` output
- exact mail-body preservation in `sy mail send`
- explicit `Body:` framing for multi-line mail inspection output in `sy mail check` and `sy mail list`
- exact session-id visibility in empty selected `sy events` output

Decision rule:
- if current launch output, `sy events`, exact-session `sy status`, and `sy status <session> --task` already give enough task-handoff visibility, do not invent another slice just to stay busy
- if current mailbox inspection already gives enough exact-session visibility and readable message framing for follow-up commands, do not invent another mail slice just to stay busy
- if operators hit a concrete gap, name that gap explicitly before writing code

Current status:
- no new slice is currently named
- hold the line on the existing single-repo, single-agent loop until a reproduced workflow proves a new gap

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
- it either preserves the current "no new slice yet" decision or names one concrete operator-visible slice from a reproduced workflow
- tests and docs match the resulting behavior when behavior changed
- the work did not broaden scope just to stay busy

## If You Get Stuck

Reduce scope instead of inventing a larger roadmap item:
- if the work starts sounding like generic hardening, stop and rename the exact operator-facing slice first
- if two slices are possible, choose the one that is more concrete and more reviewable
- keep optimizing for the current single-repo, single-agent loop
