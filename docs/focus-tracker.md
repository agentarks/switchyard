# Focus Tracker

This file exists to keep the project moving toward the intended version instead of drifting into adjacent systems too early.

Use it at the start and end of each session.

Canonical implementation history now lives in [docs/slice-ledger.md](slice-ledger.md); this file stays focused on target, scope, and planning state.

## Current Target

The current target is a reliable bounded autonomous swarm loop for one repository at a time.

The current active milestone inside that target is:
- objective specs and role-aware specialist launch

The intended operator-visible outcome is:
- one operator can start one bounded objective with `sy sling`
- one `lead` can plan, delegate, compose, verify, and close it through explicit specialist roles
- the operator can still understand task ownership, current state, communication, verification, and merge status without losing control of the final merge decision

The long-term ambition is still to surpass the Overstory-inspired baseline, but the path there stays staged:
- first reuse and extend the real bounded single-agent foundations
- then make the orchestration layer durable and readable
- only then consider broader automation or policy expansion

That means the project should reliably support:
- `sy init`
- `sy sling`
- `sy status`
- `sy events`
- `sy logs`
- `sy stop`
- `sy merge`
- `sy mail send`
- `sy mail check`
- `sy mail list`

## Where We Are

Completed enough to count as materially real:
- repo bootstrap and config loading
- bounded single-agent Codex launch
- durable sessions, runs, events, and mail
- durable orchestration runs, task graphs, artifact references, and host checkpoints
- role-aware session linkage and orchestration config/bootstrap defaults
- readable log rendering
- truthful stop, merge, and cleanup behavior for preserved session branches
- exact-session status, event, and mail inspection
- a concurrent two-session proving workflow in the current model

Current planning state:
- bounded autonomous swarm v1 is now the adopted source-of-truth direction
- the implementation now has a real durable orchestration layer under the earlier single-agent launch surface, but the launcher does not populate it yet
- the bounded runtime baseline should stay fixed unless a concrete failure disproves it
- the active milestone is objective specs and role-aware launch, not broad swarm-foundation work in general
- the next bundle is objective specs and role-aware launch, not automatic merge or broader runtime work
- the accepted rollout gate is `manual-ready`
- `auto-after-verify` is deferred until a later explicit policy adoption

## Current In-Scope Work

These are the right kinds of tasks right now:
- make `sy sling` create one orchestration run plus one `lead`
- write durable objective specs, handoff specs, and reserved result-envelope paths
- keep launcher prompts and contracts role-aware without broadening runtime scope
- make status, events, logs, and stop semantics truthful for run-centric orchestration as the rollout progresses
- preserve or improve operator readability while the model transitions from session-centric to run-centric
- add tests that reduce risk in the core bounded orchestration loop
- update docs when project state or policy changes

## Current Out-Of-Scope Work

These are derailment risks right now:
- multiple runtimes beyond Codex
- dashboards or TUIs
- watchdog daemons or supervisor hierarchies
- broad analytics or reporting features
- unbounded delegation trees
- automatic final merge before the repo explicitly adopts `auto-after-verify`

## Session Gate

Before starting a task, answer these:

1. Does this make the bounded orchestration model more real?
2. Does this reduce a real operator risk in that rollout?
3. Can this be finished and tested in one focused pass?

If the answer is `no` to all three, defer it.

## Completion View

Use this rough project view instead of one flat percentage:

- bounded single-agent foundation: materially real
- direction adoption: complete
- durable orchestration state: materially real
- role-aware launch: next
- bounded lead host and resume: not started
- integration composition and `merge_ready` gate: not started
- run-centric operator surfaces and closure: not started

## Exit Rule For A Session

A session is probably on track if it ends with at least one of these:
- one bounded orchestration workflow became more durable
- one operator-facing inspection path became clearer
- one real risk got covered by a regression test
- the project docs became more accurate about adopted direction or current implementation state

If a session produces mostly new surface area without making bounded orchestration more real, it is likely drift.
