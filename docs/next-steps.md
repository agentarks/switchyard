# Next Steps

This file is the owner-facing execution guide for deciding what the project should do next.

Canonical implementation history now lives in [docs/slice-ledger.md](slice-ledger.md); this file stays focused on the active milestone and the bundle that should advance it next.

## Current Milestone

The active milestone is:
- durable orchestration state for bounded swarm runs

The source-of-truth reset is now complete.

That means the next active bundle should make it possible to persist one bounded orchestration run truthfully before specialist launch or merge automation exists.

## Why This Milestone

The repo already has the narrow bounded Codex foundation in place:
- bounded `codex exec --json` launch in `sy sling`
- durable sessions, runs, events, mail, logs, merge, and cleanup
- readable structured `sy logs <session>`
- truthful natural completion in `sy status`
- proof that two delegated sessions can be followed through the current per-session workflow

What it does not have yet is the top-level orchestration model that the new direction depends on:
- no run-scoped task graph
- no lead/specialist role metadata
- no orchestration artifact references
- no host recovery or resume checkpoint

That makes durable orchestration state the next smallest coherent bundle.

## Active Bundle

1. Add durable orchestration state first.
- top-level runs
- task graph rows
- artifact references
- host recovery metadata

2. Extend the current foundations without reopening the runtime baseline.
- keep the bounded Codex runtime path
- keep the current repo-local worktree model
- add role and run linkage instead of inventing a second lifecycle system

3. Preserve the rollout gate.
- default merge policy remains `manual-ready`
- do not implement `auto-after-verify` in this bundle

The current bundle is:
- orchestration store, session role metadata, and config/bootstrap extensions from Chunk 2 of the bounded autonomous swarm plan

## Next Bundle Categories

After this bundle, the next implementation work should come from one of these categories:
- objective specs and role-aware launcher contracts
- bounded lead host, resume, and stop semantics
- integration composition and verification that stop at `merge_ready`

These are milestone categories, not a license to broaden scope. Choose the next coherent bundle that makes the bounded swarm model materially real.

## What To Keep Small

Do not build these inside the current milestone unless a concrete workflow failure requires them:
- multiple runtimes beyond Codex
- dashboard or TUI work
- background daemons or watchdogs
- broad analytics or reporting
- unbounded delegation
- `auto-after-verify` merge before a later explicit policy flip

## Definition Of Done

The next session is on track when all of these are true:
- it materially advances the bounded orchestration foundation
- it keeps the bounded runtime baseline intact unless a real failure forces a change
- tests and docs match the resulting workflow meaning when behavior changed
- it does not silently skip the `manual-ready` rollout gate

## If You Get Stuck

Reduce scope, but stay inside the milestone:
- if two slices are possible, choose the one that makes run state more durable and understandable
- if two bundles are possible, choose the one that preserves the manual-ready rollout gate more clearly
- if the work starts drifting toward dashboards, daemons, or broader runtime abstraction, defer it
- if the work starts assuming automatic merge, stop and move back to the accepted policy
