# ADR 0002: Runtime Scope

## Status

Accepted

## Context

Overstory supports a broad runtime surface. Switchyard does not need that breadth yet. The project goal is a narrow, usable orchestration loop for your workflow, and the planning docs already describe Switchyard as Codex-first.

Without an explicit decision, runtime abstraction tends to expand too early and pull product scope with it.

## Decision

Switchyard will stay Codex-first until the core lifecycle is real:
- `sy init`
- `sy sling`
- `sy status`
- `sy stop`
- `sy mail`

Early implementation should optimize for one real Codex workflow, not a generic runtime matrix.

Allowed abstraction:
- a small seam that prevents Codex-specific process behavior from leaking everywhere

Deferred abstraction:
- multi-runtime registry
- runtime capability matrix
- broad per-runtime config trees

## Consequences

Positive:
- keeps the CLI and data model narrower
- reduces fake abstraction in early code
- makes testing and operator behavior easier to reason about

Negative:
- adding a second runtime later may require refactoring
- some interfaces will stay intentionally underspecified until Codex behavior is real

## Follow-Up

Revisit this only after one Codex agent can be spawned, tracked, inspected, and stopped reliably.
