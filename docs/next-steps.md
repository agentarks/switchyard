# Next Steps

This file is the owner-facing execution guide for deciding what the project should do next.

Canonical implementation history now lives in [docs/slice-ledger.md](slice-ledger.md); this file stays focused on the active milestone and the bundle that should advance it next.

## Current Milestone

The active milestone is:
- objective specs and role-aware specialist launch

The durable orchestration state bundle is now landed at the storage/config/bootstrap layer.

That means the next active bundle should make `sy sling` start one durable orchestration run plus one `lead` contract, instead of stopping at the new storage layer.

## Why This Milestone

The repo now has the durable state foundation the swarm direction needed:
- bounded `codex exec --json` launch in `sy sling`
- durable sessions, runs, events, mail, logs, merge, and cleanup
- orchestration runs, task graphs, artifact references, and host checkpoints in `orchestration.db`
- role-aware session linkage plus orchestration config/bootstrap defaults

What it does not have yet is the launcher contract that would use that durable model truthfully:
- `sy sling` still launches one detached worker session directly
- the current production path does not yet create orchestration run, task, artifact, or host-checkpoint rows
- no objective spec or per-agent handoff spec is written for a run
- no structured result-envelope path is reserved for the future lead or specialists

That makes objective specs and role-aware launch the next smallest coherent bundle.

## Active Bundle

1. Make `sy sling` create one orchestration run and one `lead` session together.
- objective spec
- lead handoff spec
- reserved result-envelope path

2. Extend the current foundations without reopening the runtime baseline.
- keep the bounded Codex runtime path
- keep the current repo-local worktree model
- reuse the new orchestration store and session metadata instead of inventing a second lifecycle system

3. Preserve the rollout gate.
- default merge policy remains `manual-ready`
- do not implement `auto-after-verify` in this bundle

The current bundle is:
- objective specs, structured result envelopes, and role-aware launch from Chunk 3 of the bounded autonomous swarm plan

## Next Bundle Categories

After this bundle, the next implementation work should come from one of these categories:
- bounded lead host, resume, and stop semantics
- integration composition and verification that stop at `merge_ready`
- run-aware mail, events, and status surfaces that keep the transition readable

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
