# Next Steps

This file is the owner-facing execution guide for deciding what the project should do next.

Canonical implementation history now lives in [docs/slice-ledger.md](slice-ledger.md); this file stays focused on the current milestone and the active milestone bundle that should advance it.

## Current Milestone

The bounded Codex runtime is now stable enough for the current v0 phase.

The active milestone is:
- reintegration and operator closure

That means the active bundle should make it easier for an operator to:
- understand what a finished task produced
- merge or abandon a session cleanly
- retain enough history after closure to understand what happened

## Why This Milestone

The current repo already has the core runtime loop in place:
- bounded `codex exec --json` launch in `sy sling`
- readable structured `sy logs <session>`
- truthful natural completion in `sy status`
- durable mail, merge, cleanup, and current-session inspection
- proof that two delegated sessions can be followed through status, mail review, merge, and cleanup

The thinner area is what happens after a task completes. Runtime observability is now supporting infrastructure; reintegration is the least-finished part of the operator loop.

## Active Bundle

1. Keep the bounded runtime baseline fixed for v0.
- preserve `.switchyard/logs/` as the durable log path
- preserve writable-by-default bounded launches unless the operator explicitly overrides runtime flags
- do not reopen tmux, live attach, transcript parsing, or broader runtime work without a concrete failure that the current model cannot absorb

2. Advance reintegration and operator closure with milestone bundles.
- batch adjacent in-scope work that shares files, tests, and workflow meaning
- prefer bundles that move the operator from `task finished` to `session closed`
- prefer review and closure support over another diagnostics-only refinement

3. Keep each bundle milestone-scoped and reviewable.
- finish one coherent reintegration checkpoint at a time
- update tests and docs when the workflow meaning changes

The current bundle is:
- selected-session review summaries, closure state, and post-closure artifact history inside `sy status <session>`
- workflow-doc changes that replace tiny-slice execution with milestone-bundle execution

## Next Bundle Categories

After this bundle, the next implementation work should come from one of these categories:
- additional reintegration hardening only where the new `REVIEW`/`Why` plus `Summary:`/`Artifacts:` output still leaves operator ambiguity
- broader surface area only if a concrete operator workflow now requires it

These are milestone categories, not a license to broaden scope. Choose the next coherent bundle that materially advances the closure path.

## What To Keep Small

Do not build these inside the current milestone unless a concrete workflow failure requires them:
- multiple runtimes beyond Codex
- dashboard or TUI work
- background daemons or watchdogs
- broad analytics or reporting
- speculative merge automation beyond the current explicit path
- interactive attach, tmux, or transcript parsing beyond narrow readable Codex JSONL rendering

## Definition Of Done

The next session is on track when all of these are true:
- it materially advances the reintegration/operator-closure milestone
- it keeps the bounded runtime baseline intact unless a real failure forces a change
- tests and docs match the resulting workflow meaning when behavior changed
- it does not broaden scope just to stay busy

## If You Get Stuck

Reduce scope, but stay inside the milestone:
- if two slices are possible, choose the one that makes operator closure more explicit
- if two bundles are possible, choose the one that finishes more of the closure path without broadening scope
- if the work starts drifting back toward generic diagnostics, tie it to a concrete reintegration decision or closure step
- if the work starts sounding like a broader platform expansion, defer it
