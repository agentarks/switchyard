# ADR 0001: SQLite Choice

## Status

Proposed

## Context

Switchyard needs durable local state for sessions, mail, events, and later run tracking. The repo is currently Node-first and intentionally small. Early bootstrap work already creates placeholder database files, but schema ownership has not been implemented yet.

The choice in front of the project is whether to stay on Node built-ins or adopt a dedicated SQLite package before persistence work expands.

## Decision

For the next implementation slice, keep SQLite integration simple and local to the Node runtime, but avoid relying on experimental APIs in core command paths if a stable alternative is cheap to adopt.

Working rule:
- bootstrap may create empty database files
- store modules should own schema creation when a database is first opened
- the first real persistence slice should evaluate whether the chosen SQLite API is stable enough for repeated CLI use

## Consequences

Positive:
- keeps the early codebase small
- delays package churn until the store layer is real
- lets the project decide based on actual session-store needs rather than planning assumptions

Negative:
- SQLite choice is not fully settled yet
- store-layer implementation may require a small refactor once the first real session schema exists

## Follow-Up

Resolve this ADR when the session store is implemented by answering:
- is the API stable under Node for routine CLI usage
- does it support the schema and access patterns we need without awkward wrappers
- does it keep tests simple
