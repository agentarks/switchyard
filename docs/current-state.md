# Current State

## Snapshot

Switchyard has now adopted bounded autonomous swarm v1 as its active source-of-truth direction.

That direction means:
- `sy sling` is the entrypoint for one bounded orchestration run
- `lead`, `scout`, `builder`, and `reviewer` are first-class roles
- the `lead` owns the integration branch and composition step
- the initial rollout gate is `manual-ready`
- `auto-after-verify` is deferred until a later explicit policy adoption

The implementation has not reached that contract yet.

What exists today is still the earlier bounded single-agent Codex loop:
- one detached `codex exec --json` task per launched session
- durable session, run, event, and mail storage
- exact session inspection through status, events, logs, merge, stop, and mail
- narrow reintegration support through preserved session branches and explicit cleanup

That foundation is materially real and is the base the swarm rollout should build on next.

## What Exists

- `sy init`, `sy sling`, `sy status`, `sy events`, `sy logs`, `sy stop`, `sy merge`, and `sy mail` are implemented
- the bounded Codex runtime path is real and defaults launch to `--sandbox workspace-write` unless the operator overrides it
- `.switchyard/` bootstrap, durable logs, task specs, worktrees, sessions, runs, events, and mail are real
- exact session-id visibility is present across the core operator commands
- exact-session `sy status` inspection now includes launch/task context, review hints, summary text, artifact presence, and recent-event context
- all-session `sy status` includes task ownership, run summaries, unread-mail counts, cleanup readiness, conservative review hints, and next-step guidance
- `sy logs` renders Codex JSONL into readable operator output
- natural runtime completion is reconciled truthfully in `sy status`
- `sy stop` reports already-finished bounded tasks truthfully and fails closed on unsafe cleanup
- `sy merge` performs a narrow explicit repo-root merge path for preserved session branches and surfaces conflict details directly
- end-to-end CLI regression coverage exists for the current single-agent loop, including a two-session concurrent proving workflow

## What Does Not Exist Yet

- a top-level orchestration store for bounded swarm runs
- run-scoped task graphs, artifact references, and host recovery checkpoints
- role-aware `lead` or specialist launch contracts
- run-level stop and resume semantics
- lead-owned integration composition and verification
- run-centric status, events, logs, and mail views
- the `manual-ready` `merge_ready` swarm flow
- any adopted `auto-after-verify` merge policy

## Current Command Surface

Today the implementation still behaves like the earlier bounded single-agent loop:

- `sy sling [args...]`
  - requires an agent name plus exactly one task source via `--task` or `--task-file`
  - creates one deterministic branch and worktree
  - writes one durable task spec
  - launches one bounded `codex exec --json` task
  - persists one session plus one narrow run record
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

The adopted product contract for those commands is now broader than the implementation. See [docs/cli-contract.md](cli-contract.md) for the direction the next bundles should implement.

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

- the adopted source-of-truth now points at bounded orchestration, but the code still implements the earlier single-agent model
- the current run model is intentionally narrow and does not yet represent orchestration runs, task graphs, or artifact references
- session-centric operator surfaces will become confusing once the swarm rollout starts unless run-centric views land early
- the current merge and cleanup paths are still anchored to preserved session branches, not a lead-owned integration branch
- `node:sqlite` is still experimental in Node 25, so the storage choice may need revision if core API churn becomes painful
- the bounded runtime baseline should stay narrow unless a concrete failure shows that it cannot support the adopted orchestration direction

## Recommended Next Task

The direction-adoption bundle is now the accepted source of truth.

The active milestone is now:
- durable orchestration state for bounded swarm runs

The recommended next task is:
- start the durable orchestration state bundle
- add failing tests for top-level runs, task graphs, artifact references, role metadata, and orchestration config/bootstrap behavior
- implement the orchestration store and the minimal session/config/bootstrap changes needed to persist that model truthfully

Do not skip straight to automatic merge or broad runtime expansion. The next value is making the top-level bounded swarm state durable first.

## How To Use This File

Update this document whenever one of these changes:
- the implemented command behavior changes materially
- the gap between adopted contract and implementation narrows
- the active milestone or recommended next task changes
- an important architectural or rollout assumption changes

Keep [docs/focus-tracker.md](focus-tracker.md) aligned with this file so the repo does not drift between adopted direction and implemented reality.
