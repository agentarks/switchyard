# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Stop treating generic hardening as the default next step.

Target outcome:
- choose one named operator-visible slice inside the current repo-local loop before writing more code
- make `sy sling` accept a first-class operator task input instead of relying on future-reserved positional args alone
- avoid "find the next gap" work that does not clearly change operator behavior

## Why This Is Next

The core loop is now mostly real. Leaving "pick the next hardening gap" as the standing instruction risks turning progress into an open-ended cleanup exercise instead of a product decision.

Without that discipline:
- effort can drift into speculative lifecycle cleanup with no clear finish line
- sessions can keep landing in "improve confidence" work without changing the operator product meaningfully
- docs can make the project sound incomplete even when the current loop is already usable

## Exact Order

1. Name the next slice before coding
   - the next slice is `sy sling` task input
   - "more hardening" is not a valid slice name

2. Only do lifecycle work when it is anchored
   - tie it to a reproduced failure, a confusing operator workflow, or the `sy sling` task-input slice
   - if the work does not change operator behavior, defer it

3. Update docs only where priorities truly changed
   - keep `docs/current-state.md`, `docs/focus-tracker.md`, and this file aligned with the narrower rule

## Named Slice

`sy sling` needs one explicit operator task handoff.

Desired behavior:
- accept one clear task or instruction input at launch time
- write that instruction into a durable file under `.switchyard/specs/`
- surface enough launch output that the operator can see what task was handed off and where it lives

Why this slice:
- it improves the start of the operator loop instead of tuning internals again
- it uses an existing repo-local path the project already creates
- it turns a vague future target into a reviewable product change

## What To Keep Small

Do not build these unless a concrete operator workflow now requires them:
- multiple runtimes beyond Codex
- dashboard or TUI work
- background daemons or watchdogs
- broad analytics or reporting
- speculative merge automation beyond the current explicit path
- unbounded lifecycle cleanup work with no reproduced operator problem

## Definition Of Done

The next slice is done when all of these are true:
- it is a named operator-visible slice in the current CLI surface, or a reproduced bug fix
- tests and docs match the resulting behavior when behavior changed
- the work did not broaden scope just to stay busy

## If You Get Stuck

Reduce scope instead of inventing a larger roadmap item:
- if the work starts sounding like generic hardening, stop and rename the exact operator-facing slice first
- if two slices are possible, choose the one that is more concrete and more reviewable
- keep optimizing for the current single-repo, single-agent loop
