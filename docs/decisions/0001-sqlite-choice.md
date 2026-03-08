# ADR 0001: SQLite Choice

## Status

Accepted for the first persistence slice

## Context

Switchyard needs durable local state for sessions, mail, events, and later run tracking. The repo is currently Node-first and intentionally small. Early bootstrap work already creates placeholder database files, but schema ownership has not been implemented yet.

The choice in front of the project is whether to stay on Node built-ins or adopt a dedicated SQLite package before persistence work expands.

## Decision

For the first persistence slice, use `node:sqlite` behind a narrow store module and suppress its `ExperimentalWarning` locally during import so the CLI stays quiet.

Working rule:
- bootstrap may create empty database files
- store modules should own schema creation when a database is first opened
- keep SQLite access isolated so a package swap stays small if Node core churn becomes painful

## Consequences

Positive:
- keeps the early codebase small
- avoids package churn while the schema is still small
- gives the project a real session store to evaluate instead of arguing in the abstract

Negative:
- `node:sqlite` is still experimental in Node 25
- store-layer implementation may still require a small refactor once runtime/process behavior is real

## Follow-Up

Current answers from the first session-store slice:
- routine CLI usage works for the current schema and query shape
- the sync API keeps tests and small command paths simple
- the main remaining concern is Node core stability, not current functionality
