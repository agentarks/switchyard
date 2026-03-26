# Next Steps

repo-workflow-startup: repo-workflow-v1

<!-- repo-workflow-projection:start -->
```yaml
repo_workflow_projection:
  schema_version: 1
  active_repo_campaign_id: rw-001
  active_bundle_id: repo-workflow-foundation
  active_chunk_id: c-005
  last_updated: 2026-03-25
```
<!-- repo-workflow-projection:end -->

This file is a human-facing projection of the canonical repo-workflow control plane.
Use `docs/repo-workflow/*.yaml` for active implementation state.

This file is the owner-facing execution guide for deciding what the project should do next.

Canonical implementation history now lives in [docs/slice-ledger.md](slice-ledger.md); this file stays focused on the active milestone and the bundle that should advance it next.

## Current Milestone

The active milestone is:
- bounded lead host, resume, run-scoped stop semantics, and run-aware mail/events

The repo-workflow state-and-resume slice is now landed.
The next repo-workflow slice should move to:
- the repo-local milestone proof gate first
- later PR lifecycle
- later explicit auto-merge policy for building Switchyard itself

That later repo-workflow slice must stay separate from Switchyard's product `manual-ready` merge policy.

The objective-spec and role-aware launch bundle is now landed.

That means the next active bundle should keep one bounded lead run alive, resumable, and stoppable truthfully instead of stopping at launch bootstrap.

## Why This Milestone

The repo now has the durable state foundation the swarm direction needed:
- bounded `codex exec --json` launch in `sy sling`
- durable sessions, runs, events, mail, logs, merge, and cleanup
- orchestration runs, task graphs, artifact references, and host checkpoints in `orchestration.db`
- role-aware session linkage plus orchestration config/bootstrap defaults

What it does not have yet is the host behavior that would make the launched run operationally coherent:
- the `lead` still has no bounded host/resume loop
- stop semantics are still primarily session-oriented rather than run-oriented
- mail, events, and status are still mostly session-centric even though launch is now run-aware
- specialist launch and composition are still not implemented

That makes bounded lead host, resume, and run-scoped stop the next smallest coherent bundle.

## Active Bundle

1. Keep one launched run operationally coherent after bootstrap.
- lead host checkpointing
- bounded resume
- run-scoped stop behavior

2. Extend the current foundations without reopening the runtime baseline.
- keep the bounded Codex runtime path
- keep the current repo-local worktree model
- reuse the orchestration store and session metadata instead of inventing a second lifecycle system

3. Preserve the rollout gate.
- default merge policy remains `manual-ready`
- do not implement `auto-after-verify` in this bundle

The current bundle is:
- bounded lead host, resume, and run-scoped stop semantics from the next swarm milestone

## Next Bundle Categories

After this bundle, the next implementation work should come from one of these categories:
- integration composition and verification that stop at `merge_ready`
- run-aware mail, events, and status surfaces that keep the transition readable
- specialist launch and composition under explicit lead ownership

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
