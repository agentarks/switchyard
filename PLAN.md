# Switchyard Plan

## Purpose

Switchyard is a CLI-first system for running a small team of coding agents against a single repository with:
- isolated git worktrees
- durable session tracking
- inter-agent messaging
- predictable merge and recovery workflows

The goal is not "maximum swarm size." The goal is controlled delegation with clear operator visibility.

Switchyard is inspired by Overstory, but the product ambition is not to remain a smaller fork forever.
The ambition is to become a better orchestration tool by eventually exceeding Overstory where it matters:
- clearer operator control
- lower workflow overhead
- stronger mechanical reliability
- more understandable recovery and reintegration paths

## North Star

The north star is:
- one operator can delegate work to several coding agents in one repository without losing track of task ownership, current state, communication, or reintegration status

The long-term strategic goal is:
- exceed Overstory by delivering that outcome with less operator confusion, fewer hidden moving parts, and stronger end-to-end reliability

That is a product direction, not a license to broaden scope immediately.

The current proving path is still narrower:
- make the single-repo, single-agent operator loop reliable first
- add only the smallest next capability that removes a real operator blind spot
- prefer durable CLI-visible workflow steps over hidden automation
- earn broader scope instead of copying broader scope prematurely

## Working Assumptions

These are the current working defaults:
- primary interface: CLI
- implementation stack: TypeScript + Node + SQLite
- session isolation: git worktrees
- process control: pid-backed detached processes for the first Codex loop
- initial runtime target: Codex-first, adapter-friendly design
- UI scope for v1: terminal status views, not a web dashboard

If any of those change, the plan should change with them.

## Product Principles

1. Mechanical safety before autonomy.
2. Durable state before convenience features.
3. Operator visibility before background automation.
4. Narrow v1 before multi-runtime breadth.
5. Explicit workflow over "magic orchestration."
6. Surpass Overstory by compounding reliability and clarity, not by matching its surface area as fast as possible.

## MVP Definition

The first usable version should support:
- initialize a repo for Switchyard
- spawn an agent into an isolated worktree
- track active sessions in durable storage
- send and receive simple agent mail
- inspect status of all active agents
- stop an agent cleanly

The MVP should not require:
- AI-assisted merge resolution
- hierarchical delegation trees
- a web dashboard
- advanced watchdog automation
- support for many runtimes

## Non-Goals For Early Versions

- fully autonomous swarm planning
- background daemons that act without operator approval
- complex task decomposition logic
- production-grade distributed coordination across many repos
- broad compatibility with every coding agent CLI on day one

## Architecture Direction

Core subsystems:
- CLI command surface
- runtime adapter boundary
- worktree manager
- process/session manager
- SQLite stores for sessions, runs, mail, and events
- operator observability commands

Persistent state should live under a repo-local directory, likely `.switchyard/`.

## Proposed Delivery Phases

### Phase 0: Foundations
- choose stack and repo conventions
- create project layout
- define core types and error model
- define `.switchyard/` directory contract

Exit criteria:
- documented architecture
- documented milestone plan
- approved MVP scope

### Phase 1: Runnable MVP
- `sy init`
- `sy sling`
- `sy status`
- `sy mail`
- `sy stop`
- session storage in SQLite
- worktree creation/removal
- pid-backed detached session spawn

Exit criteria:
- one agent can be launched, observed, messaged, and stopped reliably

### Phase 2: Operator Confidence
- structured event logging
- session inspection command
- basic run tracking
- health-oriented status details
- improved failure messages and cleanup paths

Exit criteria:
- operator can diagnose the common failure cases without reading source

### Phase 3: Merge Workflow
- documented manual-first merge contract
- pending merge queue
- explicit merge command
- conflict reporting
- safe cleanup of merged worktrees

Exit criteria:
- multi-agent output can be reintegrated through a controlled merge path

### Phase 4: Controlled Automation
- simple watchdog checks
- stale-session detection
- optional nudges/escalation hooks
- runtime-specific instrumentation improvements

Exit criteria:
- the system can surface failure and drift early without becoming opaque

### Phase 5: Broader Orchestration
- multi-agent coordination that still stays operator-readable
- richer run history and replay
- stronger messaging and escalation semantics
- merge queue or equivalent reintegration workflow if the current explicit path proves insufficient
- broader runtime support only where it does not weaken the core model

Exit criteria:
- Switchyard is measurably better than the Overstory-inspired baseline at operator control, recovery, and day-to-day workflow clarity

## Initial Repo Shape

Planned structure:

```text
switchyard/
  src/
    index.ts
    types.ts
    errors.ts
    config.ts
    commands/
    runtimes/
    worktree/
    sessions/
    mail/
    events/
  docs/
    architecture.md
    milestones.md
  PLAN.md
```

## First Implementation Slice

The first coding session should focus on scaffolding only:
- package/runtime setup
- TypeScript config
- CLI entrypoint
- config loading
- SQLite session store
- `sy init` with `.switchyard/` bootstrap

That is the right first slice because every later command depends on the same file layout, config model, and state persistence.

## Current Decisions

These are the current project decisions and should be treated as the default until deliberately revised:
- the CLI name is `sy`
- Codex is the first-class runtime for the early project
- `node:sqlite` is accepted for the first persistence slices behind narrow store modules
- pid-backed detached runtime control is sufficient for v0; tmux is deferred until operator workflows require attach or transcript handling
- `sy sling` takes one explicit task instruction via `--task` or `--task-file`, writes `.switchyard/specs/<agent>-<session>.md`, and forwards that task to Codex as the initial prompt
- session records retain the original canonical branch as `baseBranch` so merge and merged-cleanup decisions do not silently retarget when config drifts later
- the first merge workflow is manual-first: stop without cleanup, review the preserved branch, use the narrow `sy merge` path or explicit git to merge into the canonical branch, then clean up
- broader runtime abstraction is deferred until the core lifecycle is real
- the long-term aim is still to surpass Overstory, but only by stacking proven slices on top of a reliable core loop

## Open Decisions

The current loop does have one active product decision now:
- the next named slice should be one small operator-visible blind spot exposed by the now-proved two-session workflow

No broader runtime or UI decision is open yet beyond that blind-spot slice.

## Suggested Order For Our Next Sessions

1. Name one small operator-visible blind spot inside the proved two-session workflow.
2. Improve diagnostics only where they directly support that named blind spot.
3. Keep run tracking accurate as the current concurrent workflow stays under use.
4. Add tests and docs updates that reduce risk in the current operator loop.
5. Revisit broader scope only after the current loop stops being the main constraint.

## Success Criteria

Switchyard is on the right track if, after the MVP:
- a human can reliably run multiple agents without losing track of state
- each agent has isolated filesystem scope
- failures are visible and recoverable
- the system remains understandable from the command line alone
- it becomes easier to operate confidently than the Overstory-inspired baseline, not merely smaller than it
