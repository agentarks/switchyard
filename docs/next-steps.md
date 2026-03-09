# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Choose the next concrete operator-loop hardening slice only after a real gap appears.

Target outcome:
- avoid broadening the product without a proven operator need
- keep the next slice tied to the current repo-local lifecycle
- prefer the smallest test-backed change that removes a real blind spot or failure mode

## Why This Is Next

The repo bootstrap contract is now covered by one realistic CLI-path regression test around `sy init`.

That removes the current highest-confidence bootstrap risk. There is no equally obvious next slice that should be forced in advance.

Without that discipline:
- the project can drift into speculative surface area instead of hardening the operator loop
- docs can start inventing priorities that are not grounded in current usage
- narrow lifecycle work gets displaced by larger but less justified features

## Exact Order

1. Identify one concrete operator pain point
   - use the current loop (`init`, `sling`, `status`, `events`, `stop`, `merge`, `mail`) as the search space
   - prefer a reproduced blind spot, unclear output, or failure mode over speculative cleanup

2. Choose the smallest fix that closes it
   - prefer one narrow inspection or lifecycle hardening slice
   - add or update tests in the same pass when behavior is involved

3. Update docs only where behavior or priorities truly changed
   - keep `docs/current-state.md`, `docs/focus-tracker.md`, and this file aligned with reality

## What To Keep Small

Do not build these unless a concrete operator workflow now requires them:
- multiple runtimes beyond Codex
- dashboard or TUI work
- background daemons or watchdogs
- broad analytics or reporting
- speculative merge automation beyond the current explicit path

## Definition Of Done

The next slice is done when all of these are true:
- it addresses a real operator-loop risk or blind spot
- tests and docs match the resulting behavior
- `npm run check` passes

## If You Get Stuck

Reduce scope instead of inventing a larger roadmap item:
- if no concrete gap is visible, defer the slice
- if two fixes are possible, choose the one that is smaller and more operator-readable
- keep optimizing for the current single-repo, single-agent loop
