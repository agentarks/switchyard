# Current State

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
Active repo-workflow state lives in `docs/repo-workflow/*.yaml`.

## Snapshot

Repo-workflow state and resume foundations are now materially real for building Switchyard itself.

What now exists for repo workflow:
- canonical machine-readable repo-workflow state under `docs/repo-workflow/`
- a repo-local `npm run repo-workflow:validate` validator
- startup-doc cutover markers plus machine-readable projection and milestone-registry blocks
- fail-closed resume validation against clean git state, canonical ids, and current-`HEAD` review currency

Switchyard has now adopted bounded autonomous swarm v1 as its active source-of-truth direction.

That direction means:
- `sy sling` is the entrypoint for one bounded orchestration run
- `lead`, `scout`, `builder`, and `reviewer` are first-class roles
- the `lead` owns the integration branch and composition step
- the initial rollout gate is `manual-ready`
- `auto-after-verify` is deferred until a later explicit policy adoption

The implementation has now crossed the launcher cutover boundary.

What exists today is:
- `sy sling` now starts one orchestration run plus one `lead` session
- the bounded Codex runtime path is still the only runtime path
- a top-level orchestration store for runs, task graphs, artifact references, and host checkpoints
- session metadata that can link lead and specialist records back to one orchestration run
- orchestration config/bootstrap defaults for merge policy, specialist concurrency, objective specs, and agent result envelopes

That means the durable swarm state layer is now materially real as both storage and launch bootstrap, while the broader operator surfaces remain mostly session-centric.

## What Exists

- canonical repo-workflow campaign, chunk, and attempt state under `docs/repo-workflow/`
- a repo-local validator and CLI entrypoint for repo-workflow startup/resume checks
- startup-doc markers across the mandatory startup docs
- projection blocks in `docs/current-state.md`, `docs/next-steps.md`, and `docs/focus-tracker.md`
- a machine-readable product milestone registry block in `docs/milestones.md`
- `sy init`, `sy sling`, `sy status`, `sy events`, `sy logs`, `sy stop`, `sy merge`, and `sy mail` are implemented
- the bounded Codex runtime path is real and defaults launch to `--sandbox workspace-write` unless the operator overrides it
- `.switchyard/` bootstrap, durable logs, task specs, worktrees, sessions, runs, events, mail, objectives, agent result envelopes, and orchestration state are real
- `.switchyard/orchestration.db` now persists top-level orchestration runs, task graphs, artifact references, and host recovery checkpoints
- `sy sling` now creates one orchestration run, one lead task, and one lead session before spawning the runtime
- objective specs, lead handoff specs, and reserved lead result-envelope paths are now written under `.switchyard/`
- `sy sling` now creates a lead-owned integration branch and worktree with deterministic run-aware naming
- sessions now persist run linkage, role metadata, parent-session linkage, and objective-task linkage
- default config now carries orchestration policy for specialist concurrency, review policy, and merge policy
- exact session-id visibility is present across the core operator commands
- exact-session `sy status` inspection now includes launch/task context, review hints, summary text, artifact presence, and recent-event context
- all-session `sy status` includes task ownership, run summaries, unread-mail counts, cleanup readiness, conservative review hints, and next-step guidance
- `sy logs` renders Codex JSONL into readable operator output
- natural runtime completion is reconciled truthfully in `sy status`
- `sy stop` reports already-finished bounded tasks truthfully and fails closed on unsafe cleanup
- `sy merge` performs a narrow explicit repo-root merge path for preserved session branches and surfaces conflict details directly
- end-to-end CLI regression coverage exists for the current single-agent loop, including a two-session concurrent proving workflow

## What Does Not Exist Yet

- the later repo-workflow PR-lifecycle and explicit auto-merge-policy slice for building Switchyard itself
- specialist launch contracts beyond the initial `lead`
- bounded lead host/resume behavior
- run-level stop and resume semantics
- lead-owned integration composition and verification
- run-centric status, events, logs, and mail views
- the `manual-ready` `merge_ready` swarm flow
- any adopted `auto-after-verify` merge policy

## Current Command Surface

Today the implementation has partially crossed into the adopted run model:

- `sy sling`
  - requires exactly one objective source via `--task` or `--task-file`
  - still accepts option-like runtime overrides such as `--sandbox read-only` or `--model gpt-5`
  - creates one orchestration run, one lead task, and one lead session
  - creates one run-aware integration branch and worktree
  - writes one objective spec, one lead handoff spec, and one reserved lead result-envelope path
  - launches one bounded `codex exec --json` lead task
  - keeps the legacy per-session run summary truthful in `runs.db` for the current status-table bridge
- `sy status [session]`
  - renders session-centric status today
  - supports exact-session detail plus optional `--task`
  - reconciles natural bounded-task completion and stale runtimes truthfully
- `sy events [session]`
  - renders durable event timelines and supports an explicit recent-event limit
- `sy logs <session>`
  - renders readable structured transcript output from the stored session log
- `sy stop <session>`
  - stops one selected session and optionally cleans up preserved artifacts when safe
- `sy merge <session>`
  - merges one preserved session branch into the configured canonical branch through a narrow explicit path
- `sy mail send|check|list`
  - provides durable exact-session mailbox inspection and messaging

Behind those still-session-centric operator surfaces, the durable orchestration layer now exists:
- `orchestration.db` stores top-level run, task, artifact, and host-checkpoint truth
- `sessions.db` can link per-agent records into one bounded swarm run
- `config.yaml` now includes orchestration policy defaults
- current production launch now creates orchestration rows and launcher artifacts, but run-centric inspection and host behavior are still deferred

The adopted product contract for those commands is still broader than the implementation. See [docs/cli-contract.md](cli-contract.md) for the direction the next bundles should implement.

## Current Merge Workflow

The code that exists today still uses the earlier per-session reintegration path:
- stop a session without `--cleanup` if it is still active
- inspect status, events, logs, mail, and the preserved worktree as needed
- run `sy merge <session>` to merge the preserved session branch into the configured canonical branch
- resolve conflicts manually if git stops in a conflicted state
- run `sy stop <session> --cleanup` after a successful merge
- run `sy stop <session> --cleanup --abandon` only after an explicit discard decision

That is still the truthful implementation state, but it is now a rollout bridge rather than the permanent product contract.

## Current Risks

- the launch contract is now run-aware, but the main operator surfaces are still session-centric
- session-centric operator surfaces will become confusing once the swarm rollout starts unless run-centric views land early
- the current merge and cleanup paths are still anchored to preserved session branches, not a lead-owned integration branch
- `node:sqlite` is still experimental in Node 25, so the storage choice may need revision if core API churn becomes painful
- the bounded runtime baseline should stay narrow unless a concrete failure shows that it cannot support the adopted orchestration direction

## Recommended Next Task

The direction-adoption bundle is now the accepted source of truth.

The durable orchestration state bundle has now landed.

The repo-workflow state-and-resume slice has also now landed for building Switchyard itself.

The recommended next task is:
- start the bounded lead host, resume, and run-scoped stop bundle
- make the lead-owned run materially resumable and stoppable as one bounded orchestration unit
- keep `sy status`, `sy events`, and `sy mail` truthful while the operator view transitions from session-centric to run-centric

The recommended next repo-workflow slice is:
- implement the repo-local milestone proof gate first
- keep PR lifecycle and explicit auto-merge policy deferred to the later follow-up slice
- keep repo-workflow proof handling separate from the product `manual-ready` policy

Do not skip straight to automatic merge or broad runtime expansion. The next value is making the launcher and agent contracts match the durable swarm state that now exists.

## How To Use This File

Update this document whenever one of these changes:
- the implemented command behavior changes materially
- the gap between adopted contract and implementation narrows
- the active milestone or recommended next task changes
- an important architectural or rollout assumption changes

Keep [docs/focus-tracker.md](focus-tracker.md) aligned with this file so the repo does not drift between adopted direction and implemented reality.
