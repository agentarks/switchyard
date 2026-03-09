# Next Steps

This file is the owner-facing execution guide for the next meaningful slice. If you are unsure what to do next, start here.

## Goal Of The Next Slice

Pick the next narrow operator-confidence slice inside the current repo-local loop.

Target outcome:
- identify one concrete inspection or lifecycle blind spot that still affects the current operator loop
- keep the slice tied to the current repo-local lifecycle instead of broadening runtime scope
- prefer the smallest test-backed change that closes that reproduced gap

## Why This Is Next

The last blocking launch-compatibility gap has been closed, so the next step is to stay disciplined and pick the next concrete weakness in the existing loop rather than expanding scope.

Without that discipline:
- effort can drift into speculative surface area instead of tightening the current operator workflow
- docs can imply a broader system is needed before the next real repo-local gap is reproduced
- broader lifecycle work can displace the next concrete issue that actually affects operator use

## Exact Order

1. Reproduce and isolate the next operator-loop gap
   - keep the search space inside the current operator loop instead of inventing new subsystems
   - confirm exactly which behavior is still weak: status reconciliation, event visibility, stop cleanup, merge safety, or another narrow path

2. Choose the smallest fix that closes it
   - prefer one narrow operator-facing hardening slice over a redesign
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
- it addresses one reproduced operator-loop gap in the current CLI surface
- tests and docs match the resulting behavior
- `npm run check` passes

## If You Get Stuck

Reduce scope instead of inventing a larger roadmap item:
- if the first attempted fix grows into redesign, cut scope back to the smallest operator-relevant fix
- if two fixes are possible, choose the one that is smaller and more operator-readable
- keep optimizing for the current single-repo, single-agent loop
