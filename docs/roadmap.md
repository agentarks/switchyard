# Roadmap

repo-workflow-startup: repo-workflow-v1

This is a product-policy startup doc.
It provides roadmap context, not canonical repo-workflow state ownership.

## Current Milestone

Switchyard has completed the bounded single-agent foundation and has now adopted bounded autonomous swarm v1 as the active direction.

The current milestone is:
- durable orchestration state for bounded swarm runs

That means the immediate goal is not more reintegration polish on the old model. The immediate goal is to make the top-level swarm run durable and truthful.

## Strategic Direction

Switchyard is not trying to stay permanently smaller than the Overstory-inspired baseline.

The strategy is:
1. keep the bounded Codex runtime baseline that already works
2. add a bounded orchestration layer with explicit `lead`, `scout`, `builder`, and `reviewer` roles
3. make that layer operator-readable through durable state and run-centric inspection
4. stop the first rollout at `merge_ready` under `manual-ready`
5. consider broader automation only after the bounded swarm model is mechanically reliable

## Near-Term Rule

The next sessions should optimize for this workflow:
1. initialize a repo
2. start one bounded run with `sy sling`
3. persist the run, task graph, lead session, and artifacts durably
4. inspect orchestration progress through status, events, logs, and mail
5. compose and verify on the lead-owned integration branch
6. stop at `merge_ready`
7. merge or abandon explicitly
8. retain enough history to understand the run after closure

If a change does not move that workflow forward or reduce a meaningful risk inside it, it is probably too early.

## Order After That

1. objective specs and role-aware launch
2. bounded lead host, resume, and run-scoped stop semantics
3. composition, verification, and the `manual-ready` merge gate
4. run-centric closure and operator surfaces
5. `auto-after-verify`, only if a later explicit policy adoption justifies it

## Explicitly Deferred

Do not prioritize these before the current proving path is real:
- multiple runtimes beyond Codex
- background watchdog daemons
- coordinator or supervisor hierarchies outside the bounded lead host
- dashboard or TUI work
- merge queue automation
- automatic final merge before a later explicit policy flip

## Decision Gates

Before moving past the current rollout, prove at least these:
- the operator can understand one bounded run without reconstructing state manually
- the lead-owned integration branch is durable and verifiable
- stop, resume, and closure semantics are truthful at the run level
- added breadth does not weaken operator readability
